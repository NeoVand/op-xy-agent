// Device tools against the emulated OP-XY (test/fakes): the exact MIDI each tool sends (CC80 =
// BPM / 2, CC9 mute level, CC102 zero-based track select, start/stop), what they report, the
// inverses they propose, paced note previews that always end with note-offs, and panic.
import { describe, expect, it } from 'vitest';
import { createFakeRig, type FakeRigOptions } from '../../../../test/fakes/rig';
import { NO_MANUAL } from '../manual-source';
import { DeviceQueue } from '../queue';
import type { AgentEnvironment, AnyTool, ToolContext, ToolResult } from './define';
import {
	deviceStatusTool,
	deviceTempo,
	muteTrackTool,
	panicTool,
	playNotesTool,
	laneCc,
	laneShows,
	selectTrackTool,
	setMetronomeTool,
	setSoundTool,
	setTempoTool,
	transportTool
} from './device';

async function setup(options: FakeRigOptions & { connect?: boolean } = {}) {
	const rig = createFakeRig(options);
	if (options.connect !== false) await rig.connect();
	const queue = new DeviceQueue();
	const env: AgentEnvironment = {
		device: rig.stack,
		replica: null,
		manual: NO_MANUAL,
		timers: rig.time,
		confirmWindowMs: 0,
		plan: { get: () => [], set: () => {} },
		abortDeviceWork: (reason) => queue.abortAll(reason)
	};
	const sent = () => rig.opxy.received.map((b) => [...b]);
	const run = (
		tool: AnyTool,
		input: unknown,
		signal = new AbortController().signal,
		id = 'toolu_x'
	): Promise<ToolResult> => {
		const parsed = tool.input.parse(input);
		const ctx: ToolContext = { toolCallId: id, agent: 'conductor', signal, env };
		return tool.run(parsed, ctx);
	};
	return { rig, env, sent, run };
}

const json = (result: ToolResult) => JSON.parse(String(result.content));

describe('device_status', () => {
	it('reports connection, firmware and the sent-state honestly', async () => {
		const { run } = await setup();
		const status = json(await run(deviceStatusTool, {}));
		expect(status.connected).toBe(true);
		expect(status.device.firmware).toBe('1.1.33');
		expect(status.clock.deviceSendsClock).toBe(false);
		expect(status.sentState).toEqual({ tempoBpm: null, selectedTrack: null, mutes: {} });
	});

	it('says when nothing is connected', async () => {
		const { run } = await setup({ connect: false });
		const result = await run(deviceStatusTool, {});
		expect(json(result).connected).toBe(false);
		expect(result.summary).toBe('no op-xy connected');
	});
});

describe('set_tempo', () => {
	it('sends CC80 = BPM / 2 and reports the tempo the device will show', async () => {
		const { rig, sent, run } = await setup();
		const result = await run(setTempoTool, { bpm: 97 });
		await rig.time.advance(5);
		expect(sent().at(-1)).toEqual([0xb0, 80, 49]);
		expect(rig.opxy.bpm).toBe(98);
		expect(json(result)).toMatchObject({ sent: 'CC80 = 49', tempoBpm: 98 });
		expect(result.after).toBe(98);
	});

	it('previews and inverts from what the app knows', async () => {
		const { env, rig } = await setup();
		expect(setTempoTool.snapshot!({ bpm: 96 }, env)).toEqual({ bpm: null, from: null });
		expect(setTempoTool.inverse!({ bpm: 96 }, { bpm: null, from: null }, env)).toBeNull();
		rig.stack.transport.send(
			{ type: 'controlChange', channel: 0, controller: 80, value: 60 },
			{ source: 'user' }
		);
		const before = setTempoTool.snapshot!({ bpm: 96 }, env);
		expect(before).toEqual({ bpm: 120, from: 'sent' });
		expect(setTempoTool.preview!({ bpm: 97 }, before, env)).toMatchObject({
			label: 'tempo 120 → 98 bpm',
			before: '120 bpm (last sent by the app)',
			after: '98 bpm',
			note: 'The device steps in 2 bpm, so 97 becomes 98.'
		});
		expect(setTempoTool.inverse!({ bpm: 96 }, { bpm: 125, from: 'measured' }, env)).toEqual({
			tool: 'set_tempo',
			input: { bpm: 126 },
			label: 'tempo back to 126 bpm (nearest to 125)'
		});
	});

	it('rounds and clamps like the device', () => {
		expect([deviceTempo(96), deviceTempo(97), deviceTempo(30), deviceTempo(500)]).toEqual([
			96, 98, 40, 220
		]);
	});
});

describe('set_metronome', () => {
	it('sends nothing to the OP-XY, which takes no MIDI for it, and gives the user the keys', async () => {
		const { rig, sent, run } = await setup();
		const before = sent().length;
		const result = await run(setMetronomeTool, { on: false });
		await rig.time.advance(5);
		expect(result).toMatchObject({ isError: true, summary: 'ask the user: tempo, click E4' });
		expect(String(result.content)).toMatch(/press tempo and click E4/);
		expect(sent()).toHaveLength(before);
	});
});

describe('mute_track and select_track', () => {
	it('mutes with CC9 = 127 on the track channel and unmutes with 0', async () => {
		const { rig, sent, run } = await setup();
		await run(muteTrackTool, { track: 2, muted: true });
		await run(muteTrackTool, { track: 16, muted: true });
		await run(muteTrackTool, { track: 2, muted: false });
		await rig.time.advance(5);
		expect(sent().slice(-3)).toEqual([
			[0xb1, 9, 127],
			[0xbf, 9, 127],
			[0xb1, 9, 0]
		]);
		expect(rig.opxy.mutes[1]).toBe(false);
		expect(rig.opxy.mutes[15]).toBe(true);
	});

	it('offers an assumed inverse when the previous mute state is unknown', async () => {
		const { env } = await setup();
		const before = muteTrackTool.snapshot!({ track: 2, muted: true }, env);
		expect(before).toEqual({ muted: null });
		expect(muteTrackTool.inverse!({ track: 2, muted: true }, before, env)).toEqual({
			tool: 'mute_track',
			input: { track: 2, muted: false },
			label: 'track 2 unmuted again',
			assumed: true
		});
		expect(muteTrackTool.inverse!({ track: 2, muted: true }, { muted: true }, env)).toBeNull();
	});

	it('selects tracks zero-based with CC102 on channel 1', async () => {
		const { rig, sent, run } = await setup();
		const result = await run(selectTrackTool, { track: 3 });
		await rig.time.advance(5);
		expect(sent().at(-1)).toEqual([0xb0, 102, 2]);
		expect(rig.opxy.selectedTrack).toBe(3);
		expect(result.summary).toBe('track 3 selected');
	});
});

describe('set_sound', () => {
	it('sends the lane CC that makes the screen show the value, on the track channel', async () => {
		const { rig, sent, run } = await setup();
		const cutoff = await run(setSoundTool, { track: 3, param: 'cutoff', value: 40 });
		await run(setSoundTool, { track: 3, param: 'amp release', value: 99 });
		await run(setSoundTool, { track: 5, param: 'engine p2', value: 0 });
		await run(setSoundTool, { track: 3, param: 'pan', value: -50 });
		await rig.time.advance(5);
		expect(sent().slice(-4)).toEqual([
			[0xb2, 32, 51],
			[0xb2, 23, 127],
			[0xb4, 13, 0],
			[0xb2, 10, 32]
		]);
		expect(cutoff.summary).toBe('track 3 cutoff 40');
		expect(json(cutoff)).toMatchObject({ sent: 'CC32 = 51 on channel 3', shows: 40 });
	});

	it('maps every value 0–99 to a CC that reads it back', () => {
		for (let v = 0; v <= 99; v++) expect(laneShows(laneCc(v)), `value ${v}`).toBe(v);
		expect(laneCc(0)).toBe(0);
		expect(laneCc(99)).toBe(127);
	});

	it('knows the value before only if the app sent it, and undoes to it', async () => {
		const { env, run, rig } = await setup();
		const input = { track: 3, param: 'resonance', value: 70 } as const;
		expect(setSoundTool.snapshot!(input, env)).toEqual({ value: null });
		expect(setSoundTool.inverse!(input, { value: null }, env)).toBeNull();
		await run(setSoundTool, { track: 3, param: 'resonance', value: 20 });
		await rig.time.advance(5);
		const before = setSoundTool.snapshot!(input, env);
		expect(before).toEqual({ value: 20 });
		expect(setSoundTool.inverse!(input, before, env)).toEqual({
			tool: 'set_sound',
			input: { track: 3, param: 'resonance', value: 20 },
			label: 'track 3 resonance back to 20'
		});
	});

	it('sends nothing without a device, and points to plan_steps for the virtual OP-XY', async () => {
		const { sent, run } = await setup({ connect: false });
		const result = await run(setSoundTool, { track: 3, param: 'cutoff', value: 40 });
		expect(result.isError).toBe(true);
		expect(String(result.content)).toMatch(/plan_steps/);
		expect(sent()).toEqual([]);
	});
});

describe('transport', () => {
	it('starts and stops with MIDI start/stop and reads the echo when the device sends clock', async () => {
		const { rig, env, run } = await setup({ opxy: { clockMode: 'both' } });
		const confirming = { ...env, confirmWindowMs: 20 };
		const ctx = (id: string): ToolContext => ({
			toolCallId: id,
			agent: 'conductor',
			signal: new AbortController().signal,
			env: confirming
		});
		const play = transportTool.run({ action: 'play' }, ctx('t1'));
		await rig.time.advance(30);
		const result = await play;
		expect(rig.opxy.playing).toBe(true);
		expect(json(result)).toMatchObject({ sent: 'MIDI start', confirmedByDevice: true });
		expect(result.summary).toBe('playing (confirmed by the device)');
		// Playing, as reported by the device: "play" again would restart, so nothing is sent.
		const again = await run(transportTool, { action: 'play' });
		expect(again.applied).toBe(false);
		expect(again.summary).toBe('already playing');
		const stop = transportTool.run({ action: 'stop' }, ctx('t2'));
		await rig.time.advance(30);
		expect((await stop).summary).toBe('stopped (confirmed by the device)');
		expect(rig.opxy.playing).toBe(false);
	});

	it('says "sent" without clock, and inverts to the opposite action', async () => {
		const { rig, env, run } = await setup();
		const result = await run(transportTool, { action: 'play' });
		await rig.time.advance(5);
		expect(rig.opxy.received.at(-1)).toEqual(new Uint8Array([0xfa]));
		expect(json(result).confirmedByDevice).toBe(false);
		expect(result.summary).toBe('start sent');
		expect(
			transportTool.inverse!({ action: 'play' }, { playState: 'unknown', reported: false }, env)
		).toMatchObject({
			input: { action: 'stop' },
			assumed: true
		});
	});

	it('refuses politely without a device', async () => {
		const { run } = await setup({ connect: false });
		const result = await run(transportTool, { action: 'play' });
		expect(result.isError).toBe(true);
		expect(String(result.content)).toMatch(/No OP-XY is connected/);
	});
});

describe('play_notes', () => {
	it('plays paced notes on the track channel and ends every note', async () => {
		const { rig, run } = await setup();
		const playing = run(playNotesTool, {
			track: 3,
			bpm: 120,
			steps: [
				{ notes: ['C4', 'Eb4', 'G4'], beats: 1 },
				{ notes: [], beats: 0.5 },
				{ notes: [62], beats: 0.5, velocity: 70 }
			]
		});
		await rig.time.advance(100);
		expect([...rig.opxy.activeNotes].sort()).toEqual([2 * 128 + 60, 2 * 128 + 63, 2 * 128 + 67]);
		await rig.time.advance(1200);
		const result = await playing;
		await rig.time.advance(5);
		expect(rig.opxy.activeNotes.size).toBe(0);
		expect(json(result)).toMatchObject({ played: 3, steps: 3, track: 3, bpm: 120, seconds: 1 });
		const notes = rig.opxy.received.filter((b) => (b[0] & 0xe0) === 0x80).map((b) => [...b]);
		expect(notes).toContainEqual([0x92, 62, 70]);
		expect(notes.filter((b) => (b[0] & 0xf0) === 0x90).length).toBe(4);
		expect(notes.filter((b) => (b[0] & 0xf0) === 0x80).length).toBe(4);
	});

	it('releases held notes when stopped mid-preview', async () => {
		const { rig, run } = await setup();
		const controller = new AbortController();
		const playing = run(
			playNotesTool,
			{ track: 1, bpm: 60, steps: [{ notes: [53, 55], beats: 8 }] },
			controller.signal
		);
		await rig.time.advance(50);
		expect(rig.opxy.activeNotes.size).toBe(2);
		controller.abort();
		await expect(playing).rejects.toThrow('stopped');
		await rig.time.advance(5);
		expect(rig.opxy.activeNotes.size).toBe(0);
	});

	it('refuses previews that are too long or name unknown notes', async () => {
		const { run } = await setup();
		const long = await run(playNotesTool, {
			track: 1,
			bpm: 40,
			steps: [
				{ notes: [60], beats: 8 },
				{ notes: [60], beats: 8 }
			]
		});
		expect(long.isError).toBe(true);
		expect(String(long.content)).toMatch(/limit is 20 s/);
		const bad = await run(playNotesTool, { track: 1, steps: [{ notes: ['H9'], beats: 1 }] });
		expect(bad.isError).toBe(true);
		expect(String(bad.content)).toMatch(/Unknown note names: H9/);
		expect(() =>
			playNotesTool.input.parse({ track: 9, steps: [{ notes: [60], beats: 1 }] })
		).toThrow();
	});
});

describe('panic', () => {
	it('stops device work and silences every channel', async () => {
		const { rig, run } = await setup();
		const result = await run(panicTool, {});
		await rig.time.advance(200);
		expect(rig.opxy.allNotesOff).toBe(16);
		expect(rig.opxy.allSoundOff).toBe(16);
		expect(json(result).sentMessages).toBe(48);
	});
});
