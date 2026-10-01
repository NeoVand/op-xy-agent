// The listening tools against fakes: a host whose recordings hold only the tracks that are unmuted
// when it records (drums on T1, a bass on T3, a pad on T5), and whose offline renders hold the
// tracks that play in the project handed over; the app's virtual OP-XY on a bare simulator, and the
// emulated OP-XY. listen hears what plays and compares it with the set tempo, and refuses
// (recording nothing) when there is nothing to hear; with a scene it renders that scene, whole or a
// track at a time, touching nothing; listen_tracks hears each track alone and puts every mute back
// exactly — after a failure and a stop too — and on a device only when the app knows every mute.
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy, type VirtualSound } from '$lib/app/virtual';
import { analyzeAudio } from '$lib/core/listen';
import { drumLoop, gain, mix, progression } from '$lib/core/listen/signals';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { SimState } from '$lib/sim/params';
import { createFakeRig } from '../../../../test/fakes/rig';
import { FakeTime } from '../../../../test/fakes/fake-time';
import type { ListenFrom, ListenHost, ListenRecording } from '../listen-host';
import { NO_MANUAL } from '../manual-source';
import type { AgentEnvironment, AnyTool, ToolContext, ToolResult } from './define';
import { LISTEN_SECONDS, listenTool, listenTracksTool } from './listen';
import { writePatternTool } from './virtual';

const SR = 16000;

/** What each track plays at 120 BPM, as long as needed. */
function trackAudio(track: number, seconds: number): Float32Array {
	const n = Math.round(seconds * SR);
	if (track === 1) {
		const bars = Math.ceil(seconds / 2) + 1;
		const loop = drumLoop({
			bpm: 120,
			bars,
			sampleRate: SR,
			offset: 0.05,
			pattern: { kick: [0, 4, 8, 12], hat: [2, 6, 10, 14] }
		});
		return gain(loop.samples.subarray(0, n), 0.6);
	}
	if (track === 3) {
		const bass = progression([['A1'], ['F1'], ['C2'], ['G1']], 2, SR, {
			wave: 'saw',
			amplitude: 0.25
		});
		return Float32Array.from({ length: n }, (_, i) => bass[i % bass.length]);
	}
	if (track === 5) {
		const pad = progression(
			[
				['A3', 'C4', 'E4'],
				['F3', 'A3', 'C4']
			],
			2,
			SR,
			{ amplitude: 0.05 }
		);
		return Float32Array.from({ length: n }, (_, i) => pad[i % pad.length]);
	}
	return new Float32Array(n);
}

interface FakeHost extends ListenHost {
	readonly records: { source: ListenFrom; seconds: number; audible: number[] }[];
	/** Offline renders: the tracks that play in the project, and whether its scene is held. */
	readonly renders: { seconds: number; audible: number[]; held: boolean; playing: boolean }[];
	failOn?: number;
}

/** A recording of `tracks` playing together. */
function recordingOf(tracks: readonly number[], seconds: number, source: ListenFrom) {
	const channel = mix(
		new Float32Array(Math.round(seconds * SR)),
		...tracks.map((t) => trackAudio(t, seconds))
	);
	return {
		channels: [channel, channel],
		sampleRate: SR,
		source,
		label: source === 'device' ? 'OP-XY' : 'replica'
	};
}

/** The instrument tracks that sound in a project: unmuted, with notes in the pattern they play. */
function soundingIn(project: string): number[] {
	const p = JSON.parse(project) as Pick<SimState, 'tracks'>;
	return p.tracks.flatMap((t, i) => {
		const pattern = t.sequence.patterns[t.sequence.current];
		const notes = pattern?.steps.some((step) => step.notes.length > 0) ?? false;
		return i < 8 && notes && !t.mix.muted ? [i + 1] : [];
	});
}

/** A host that hears the tracks `audible()` says sound now. */
function fakeHost(audible: () => number[]): FakeHost {
	const host: FakeHost = {
		records: [],
		renders: [],
		async record(source, seconds, signal) {
			if (signal.aborted) throw new Error('stopped');
			const now = audible();
			host.records.push({ source, seconds, audible: now });
			if (host.failOn === host.records.length) throw new Error('the audio stopped running');
			return recordingOf(now, seconds, source);
		},
		async analyze(recording: ListenRecording, options) {
			return analyzeAudio(recording.channels, recording.sampleRate, options);
		},
		async render(request, signal) {
			if (signal.aborted) throw new Error('stopped');
			const now = soundingIn(request.project);
			const held = (JSON.parse(request.project) as Pick<SimState, 'areas'>).areas.arrange.held;
			host.renders.push({
				seconds: request.seconds,
				audible: now,
				held,
				playing: request.transport.playing
			});
			return recordingOf(now, request.seconds, 'replica');
		}
	};
	return host;
}

function ctxFor(env: AgentEnvironment, signal = new AbortController().signal): ToolContext {
	return { toolCallId: 'toolu_l', agent: 'conductor', signal, env };
}

/** The virtual OP-XY with notes on T1, T3 and T5, playing at 120 BPM, sound on. */
async function virtualSetup(options: { sound?: 'on' | 'off' | null; playing?: boolean } = {}) {
	const time = new FakeTime();
	const sim = new OpxySim({ now: () => time.now() });
	const sound: VirtualSound | null =
		options.sound === null
			? null
			: { enabled: (options.sound ?? 'on') === 'on', available: true, preview: () => true };
	const virtual = createVirtualOpxy({ sim, sound });
	const host = fakeHost(() =>
		virtual
			.status()
			.tracks.filter((t) => t.track <= 8 && t.notes > 0 && !t.muted)
			.map((t) => t.track)
	);
	const env: AgentEnvironment = {
		device: null,
		replica: null,
		virtual,
		listen: host,
		manual: NO_MANUAL,
		timers: time,
		confirmWindowMs: 0,
		plan: { get: () => [], set: () => {} },
		abortDeviceWork: () => {}
	};
	const run = (tool: AnyTool, input: unknown, signal?: AbortSignal): Promise<ToolResult> =>
		tool.run(tool.input.parse(input), ctxFor(env, signal));
	for (const track of [1, 3, 5]) {
		await run(writePatternTool, { track, pattern: 1, bars: 1, notes: [{ step: 1, note: 60 }] });
	}
	virtual.setTempo(120);
	if (options.playing ?? true) virtual.transport('play');
	/** Runs a tool while time moves on (settle waits use the fake timers). */
	const runTimed = async (tool: AnyTool, input: unknown, signal?: AbortSignal) => {
		const done = run(tool, input, signal);
		await time.advance(60_000);
		return done;
	};
	return { time, sim, virtual, host, env, run, runTimed };
}

const muted = (virtual: ReturnType<typeof createVirtualOpxy>) =>
	virtual
		.status()
		.tracks.filter((t) => t.muted)
		.map((t) => t.track);

describe('listen on the virtual OP-XY', () => {
	it('hears what plays and compares it with the set tempo', async () => {
		const { host, run } = await virtualSetup();
		const result = await run(listenTool, {});
		expect(result.isError).toBeFalsy();
		expect(host.records).toEqual([
			{ source: 'replica', seconds: LISTEN_SECONDS, audible: [1, 3, 5] }
		]);
		const text = String(result.content);
		expect(text).toMatch(/^heard 8 s of the replica \(16 kHz stereo\)/);
		expect(text).toMatch(/matches the set 120/);
		expect(text).toMatch(/^numbers: \{/m);
		expect(result.summary).toMatch(/^heard 8 s: /);
	});

	it('puts the focus first and records as long as asked', async () => {
		const { host, run } = await virtualSetup();
		const result = await run(listenTool, { seconds: 5, focus: 'harmony' });
		expect(host.records[0].seconds).toBe(5);
		expect(String(result.content).split('\n')[1]).toMatch(/^harmony:/);
	});

	it('says when the metronome is in what it heard', async () => {
		const { sim, run } = await virtualSetup();
		sim.state.tempo.metronome.on = true;
		expect(String((await run(listenTool, {})).content)).toMatch(/metronome is on/);
		sim.state.tempo.metronome.on = false;
		expect(String((await run(listenTool, {})).content)).not.toMatch(/metronome/);
	});

	it('records nothing while stopped or with the sound off, and says what to do', async () => {
		const stopped = await virtualSetup({ playing: false });
		const s = await stopped.run(listenTool, {});
		expect(s).toMatchObject({ isError: true, summary: 'stopped: press play' });
		expect(String(s.content)).toMatch(/transport play/);
		expect(stopped.host.records).toEqual([]);
		const off = await virtualSetup({ sound: 'off' });
		const o = await off.run(listenTool, {});
		expect(o).toMatchObject({ isError: true, summary: 'sound is off' });
		expect(off.host.records).toEqual([]);
		const none = await virtualSetup({ sound: null });
		expect((await none.run(listenTool, {})).summary).toBe('no sound here');
	});

	it('reports a recording that fails, and passes a stop through', async () => {
		const { host, run } = await virtualSetup();
		host.failOn = 1;
		const failed = await run(listenTool, {});
		expect(failed).toMatchObject({ isError: true, summary: 'could not listen' });
		expect(String(failed.content)).toMatch(/Nothing was heard: the audio stopped running/);
		const controller = new AbortController();
		controller.abort();
		await expect(run(listenTool, {}, controller.signal)).rejects.toThrow('stopped');
	});

	it('needs a listening host, and a device when asked for one', async () => {
		const { env, run } = await virtualSetup();
		expect((await run(listenTool, { from: 'device' })).summary).toBe('no op-xy connected');
		const bare = { ...env, listen: null };
		const result = await listenTool.run({}, ctxFor(bare));
		expect(result).toMatchObject({ isError: true, summary: 'no listening here' });
	});
});

describe('listen to a scene, rendered offline', () => {
	/** Scene 1 (the intro: all three), scene 2 (T3 on its empty pattern 2), the song 1 → 2. */
	async function songSetup(options: { playing?: boolean } = {}) {
		const setup = await virtualSetup(options);
		setup.virtual.writeArrangement({
			scenes: [
				{ scene: 1, patterns: [{ track: 3, pattern: 1 }] },
				{ scene: 2, patterns: [{ track: 3, pattern: 2 }] }
			],
			song: { order: [1, 2], loop: false }
		});
		return setup;
	}

	it('hears the scene asked for looping, though stopped, and touches nothing', async () => {
		const { host, virtual, run } = await songSetup({ playing: false });
		const before = virtual.checkpoint().state;
		const result = await run(listenTool, { scene: 2, seconds: 4 });
		expect(result.isError).toBeFalsy();
		// the scene, held so it loops; not the song from its first scene
		expect(host.renders).toEqual([{ seconds: 4, audible: [1, 5], held: true, playing: true }]);
		expect(host.records).toEqual([]);
		const text = String(result.content);
		expect(text).toMatch(/^heard 4 s of scene 2 of the replica, rendered offline/);
		expect(result.summary).toMatch(/^heard scene 2, 4 s/);
		// the replica: still stopped, on scene 1, its song as it was
		expect(virtual.checkpoint().state).toBe(before);
		expect(virtual.status().playing).toBe(false);
	});

	it('hears each track of the scene alone, without a mute changed', async () => {
		const { host, virtual, run } = await songSetup();
		virtual.setMuted(5, true);
		const result = await run(listenTool, { scene: 1, tracks: 'each' });
		expect(result.isError).toBeFalsy();
		// T5, muted on the replica, is heard alone all the same
		expect(host.renders.map((r) => [r.audible, r.seconds])).toEqual([
			[[1], 4],
			[[3], 4],
			[[5], 4]
		]);
		expect(muted(virtual)).toEqual([5]);
		expect(String(result.content)).toMatch(/^heard 3 tracks alone, one at a time, from scene 1/);
		expect(result.summary).toBe('heard 3 tracks of scene 1 alone');
		// tracks alone: the scene the replica is on unless one is named
		await run(listenTool, { tracks: [5, 1], seconds: 2 });
		expect(host.renders.slice(3).map((r) => r.audible)).toEqual([[1], [5]]);
	});

	it('says what is wrong: an empty scene, a device, no offline render', async () => {
		const { env, run } = await songSetup();
		const empty = await run(listenTool, { scene: 9 });
		expect(empty).toMatchObject({ isError: true, summary: 'scene 9 is empty' });
		expect(String(empty.content)).toMatch(/scenes are 1, 2/);
		// a track named that plays nothing there is heard, and said to be silent
		const quiet = await run(listenTool, { scene: 2, tracks: [3] });
		expect(String(quiet.content)).toMatch(/T3 has no notes in scene 2/);
		const device = await run(listenTool, { scene: 2, from: 'device' });
		expect(device).toMatchObject({ isError: true, summary: 'offline: replica only' });
		const live = { ...env, listen: { ...env.listen!, render: undefined } };
		const none = await listenTool.run({ scene: 2 }, ctxFor(live));
		expect(none).toMatchObject({ isError: true, summary: 'no offline render' });
	});

	it('hears each section of the song side by side, and how loudness moves between them', async () => {
		const { host, virtual, run } = await songSetup({ playing: false });
		virtual.writeArrangement({ song: { order: [1, 2, 2, 1], loop: false } });
		const result = await run(listenTool, { scene: 'song', seconds: 2 });
		expect(result.isError, String(result.content)).toBeFalsy();
		// each scene once, in the song's order
		expect(host.renders.map((r) => r.audible)).toEqual([
			[1, 3, 5],
			[1, 5]
		]);
		const text = String(result.content);
		expect(text).toMatch(
			/^heard 2 scenes of the song, 2 s each, rendered offline \(song: 1 2 2 1\)/
		);
		expect(text).toMatch(/^scene 1 \(entries 1, 4\): -?\d/m);
		expect(text).toMatch(/^scene 2 \(entries 2, 3\): /m);
		expect(text).toMatch(/^compared: loudest scene 1, quietest scene 2/m);
		expect(text).toMatch(
			/from one section to the next: scene 1 → 2: -[\d.]+ LU; scene 2 → 1: \+[\d.]+ LU/
		);
		expect(result.summary).toBe('heard 2 sections of the song');
		// sections are heard whole
		expect((await run(listenTool, { scene: 'song', tracks: 'each' })).summary).toBe(
			'song or tracks'
		);
		// a scene's number written as a string is that scene
		expect((await run(listenTool, { scene: '2', seconds: 2 })).summary).toMatch(/^heard scene 2,/);
	});

	it('says when the key heard is not the key written, and to go by the written one', async () => {
		const { run } = await songSetup({ playing: false });
		// the written notes say F# major; the fake audio plays A minor
		await run(writePatternTool, {
			track: 3,
			pattern: 1,
			notes: '1:F#2:4 5:A#2:4 9:C#3:4 13:F#3:4'
		});
		const text = String((await run(listenTool, { scene: 1, seconds: 4 })).content);
		expect(text).toMatch(
			/note: The notes written read as F# major; the analysis heard \w+ (major|minor)/
		);
		expect(text).toMatch(/go by the written key/);
	});

	it('leaves out the flags a part heard alone always raises', async () => {
		const { run } = await songSetup();
		const text = String((await run(listenTool, { scene: 1, tracks: 'each' })).content);
		// a drum track alone is mostly the gaps between its hits; a pad alone has no beat of its own
		expect(text).not.toMatch(/T1 \(drum\):.*mostly-silent/);
		expect(text).not.toMatch(/no-pulse/);
	});

	it('says when a live take ran over a scene change or the end of the song', async () => {
		const { virtual, sim, host, run } = await songSetup();
		// the song moves on and ends (its loop off) while the take records
		const record = host.record.bind(host);
		host.record = async (source, seconds, signal) => {
			const recording = await record(source, seconds, signal);
			sim.state.areas.arrange.scene = 1;
			virtual.transport('stop');
			return recording;
		};
		const text = String((await run(listenTool, {})).content);
		expect(text).toMatch(/moved on from scene 1 to scene 2/);
		expect(text).toMatch(/the song came to its end \(its loop is off\)/);
	});
});

describe('listen_tracks on the virtual OP-XY', () => {
	it('hears each track with notes alone and puts every mute back', async () => {
		const { virtual, host, runTimed } = await virtualSetup();
		virtual.setMuted(5, true);
		const before = muted(virtual);
		const result = await runTimed(listenTracksTool, {});
		expect(result.isError).toBeFalsy();
		// T5 was muted, and was still heard alone; each take held one track
		expect(host.records.map((r) => r.audible)).toEqual([[1], [3], [5]]);
		expect(muted(virtual)).toEqual(before);
		const text = String(result.content);
		expect(text).toMatch(/^heard 3 tracks alone, one at a time, from the replica/);
		expect(text).toMatch(/^T1 \(drum\): /m);
		expect(text).toMatch(/Every mute was put back as it was\./);
		expect(result.summary).toBe('heard 3 tracks alone');
	});

	it('says when a heard track ducks from one that was muted in its take', async () => {
		const { sim, runTimed } = await virtualSetup();
		Object.assign(sim.state.tracks[2].lfo, { type: 'duck', on: true, source: 1 });
		const text = String((await runTimed(listenTracksTool, {})).content);
		expect(text).toMatch(/T3 ducks from T1, which was muted while T3 played alone/);
		// the metronome, or no duck, needs no word
		Object.assign(sim.state.tracks[2].lfo, { source: 17 });
		expect(String((await runTimed(listenTracksTool, {})).content)).not.toMatch(/ducks from/);
	});

	it('hears only the tracks asked for, as long as asked', async () => {
		const { host, runTimed } = await virtualSetup();
		await runTimed(listenTracksTool, { tracks: [3, 3, 1], seconds: 2 });
		expect(host.records.map((r) => [r.audible, r.seconds])).toEqual([
			[[1], 2],
			[[3], 2]
		]);
	});

	it('puts every mute back when a recording fails or the user stops it', async () => {
		const failing = await virtualSetup();
		failing.virtual.setMuted(3, true);
		failing.host.failOn = 2;
		const failed = await failing.runTimed(listenTracksTool, {});
		expect(failed).toMatchObject({ isError: true, summary: 'could not listen' });
		expect(String(failed.content)).toMatch(/Every mute was put back as it was/);
		expect(muted(failing.virtual)).toEqual([3]);

		const stopping = await virtualSetup();
		const controller = new AbortController();
		const done = stopping.run(listenTracksTool, {}, controller.signal);
		await stopping.time.advance(400);
		// the first track is being heard alone right now
		expect(muted(stopping.virtual)).toEqual([2, 3, 4, 5, 6, 7, 8]);
		controller.abort();
		const stopped = await done;
		expect(stopped).toMatchObject({ isError: true, summary: 'stopped' });
		expect(muted(stopping.virtual)).toEqual([]);
	});

	it('previews what it will do for the approval', async () => {
		const { virtual, env } = await virtualSetup();
		virtual.setMuted(3, true);
		const before = listenTracksTool.snapshot!({}, env);
		expect(listenTracksTool.preview!({ seconds: 3 }, before, env)).toEqual({
			label: 'hear T1, T3, T5 alone, 3 s each',
			before: 'muted: T3',
			after: 'every mute put back as it was',
			note: 'Mutes the other instrument tracks one track at a time (about 11 s in all), then puts every mute back.'
		});
	});

	it('refuses when there is nothing to hear', async () => {
		const { run, virtual } = await virtualSetup();
		virtual.transport('stop');
		expect((await run(listenTracksTool, {})).summary).toBe('stopped: press play');
	});
});

describe('on the connected OP-XY', () => {
	async function deviceSetup() {
		const rig = createFakeRig({ opxy: { clockMode: 'both' } });
		await rig.connect();
		const host = fakeHost(() => [1, 3, 5].filter((t) => !rig.opxy.mutes[t - 1]));
		const env: AgentEnvironment = {
			device: rig.stack,
			replica: null,
			listen: host,
			manual: NO_MANUAL,
			timers: rig.time,
			confirmWindowMs: 0,
			plan: { get: () => [], set: () => {} },
			abortDeviceWork: () => {}
		};
		const runTimed = async (tool: AnyTool, input: unknown) => {
			const done = tool.run(tool.input.parse(input), ctxFor(env));
			await rig.time.advance(60_000);
			return done;
		};
		const setMutes = (mutes: boolean[]) =>
			mutes.forEach((m, i) =>
				rig.stack.transport.send(
					{ type: 'controlChange', channel: i, controller: 9, value: m ? 127 : 0 },
					{ source: 'user' }
				)
			);
		return { rig, host, env, runTimed, setMutes };
	}

	it('listens over USB and compares with the tempo the device clocks', async () => {
		const { rig, host, runTimed } = await deviceSetup();
		rig.opxy.pressPlay();
		// let the mirror measure the tempo from the device's clock
		await rig.time.advance(2000);
		const result = await runTimed(listenTool, { seconds: 6 });
		expect(host.records[0]).toMatchObject({ source: 'device', seconds: 6 });
		expect(String(result.content)).toMatch(/^heard 6 s of the OP-XY’s USB audio/);
		expect(String(result.content)).toMatch(/matches the set 120/);
	});

	it('records nothing when the device reports it is stopped', async () => {
		const { rig, host, runTimed } = await deviceSetup();
		rig.opxy.pressPlay();
		await rig.time.advance(100);
		rig.opxy.pressStop();
		await rig.time.advance(100);
		const result = await runTimed(listenTool, {});
		expect(result).toMatchObject({ isError: true, summary: 'stopped: press play' });
		expect(host.records).toEqual([]);
	});

	it('will not mute tracks whose mutes the app does not know', async () => {
		const { rig, host, runTimed } = await deviceSetup();
		const sent = rig.opxy.received.length;
		const result = await runTimed(listenTracksTool, {});
		expect(result).toMatchObject({ isError: true, summary: 'mutes unknown' });
		expect(String(result.content)).toMatch(/mute_track/);
		expect(rig.opxy.received.length).toBe(sent);
		expect(host.records).toEqual([]);
	});

	it('hears each track alone with CC9 and puts every mute back', async () => {
		const { rig, host, env, runTimed, setMutes } = await deviceSetup();
		const before = [false, false, false, false, true, false, false, false];
		setMutes(before);
		await rig.time.advance(50);
		const result = await runTimed(listenTracksTool, { tracks: [1, 3, 5] });
		expect(result.isError).toBeFalsy();
		expect(host.records.map((r) => r.audible)).toEqual([[1], [3], [5]]);
		expect(rig.opxy.mutes.slice(0, 8)).toEqual(before);
		expect([...rig.stack.mirror.mutes.slice(0, 8)]).toEqual(before);
		// every mute went out as CC9 on the track's channel, nothing else
		const cc = rig.opxy.received.filter((b) => (b[0] & 0xf0) === 0xb0);
		expect(cc.every((b) => b[1] === 9)).toBe(true);
		const snapshot = listenTracksTool.snapshot!({ tracks: [1] }, env);
		expect(listenTracksTool.preview!({ tracks: [1] }, snapshot, env)).toMatchObject({
			before: 'muted: T5',
			note: 'Mutes the other instrument tracks one track at a time (about 5 s in all) with CC9 on the OP-XY, then puts every mute back.'
		});
	});
});
