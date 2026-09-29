// The agent on the virtual OP-XY: the programming tools (patterns, scenes, the song) and the live
// tools falling back to it with no device connected, on a bare simulator (the app's adapter) with a
// fake sound. What a person would see is checked on the simulator's LEDs and model.
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy, type VirtualSound } from '$lib/app/virtual';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { currentPattern } from '$lib/sim/sequencer';
import { FakeTime } from '../../../../test/fakes/fake-time';
import { NO_MANUAL } from '../manual-source';
import type { AgentEnvironment, AnyTool, ToolContext, ToolResult } from './define';
import {
	deviceStatusTool,
	muteTrackTool,
	playNotesTool,
	selectTrackTool,
	setTempoTool,
	transportTool
} from './device';
import { readPatternTool, writeArrangementTool, writePatternTool } from './virtual';

function setup(options: { sound?: boolean } = {}) {
	const time = new FakeTime();
	const sim = new OpxySim({ now: () => time.now() });
	const previews: [number, number, number, number][] = [];
	let changes = 0;
	const sound: VirtualSound | null =
		options.sound === undefined
			? null
			: {
					enabled: options.sound,
					available: true,
					preview: (track, note, velocity, seconds) => {
						previews.push([track, note, velocity, seconds]);
						return true;
					}
				};
	const virtual = createVirtualOpxy({ sim, sound, changed: () => changes++ });
	const env: AgentEnvironment = {
		device: null,
		replica: null,
		virtual,
		manual: NO_MANUAL,
		timers: time,
		confirmWindowMs: 0,
		plan: { get: () => [], set: () => {} },
		abortDeviceWork: () => {}
	};
	const run = (tool: AnyTool, input: unknown): Promise<ToolResult> => {
		const ctx: ToolContext = {
			toolCallId: 'toolu_v',
			agent: 'conductor',
			signal: new AbortController().signal,
			env
		};
		return tool.run(tool.input.parse(input), ctx);
	};
	return { time, sim, env, virtual, run, previews, changes: () => changes };
}

const json = (result: ToolResult) => JSON.parse(String(result.content));
const stepRow = (sim: OpxySim) =>
	Array.from({ length: 16 }, (_, i) =>
		sim.leds[`step.${i + 1}` as 'step.1'] === 'white' ? 'w' : '.'
	).join('');

describe('write_pattern', () => {
	it('programs a drum beat the step keys then show, and makes it the playing pattern', async () => {
		const { sim, run, changes } = setup();
		const kick = [1, 5, 9, 13].map((step) => ({ step, note: 53 }));
		const snare = [5, 13].map((step) => ({ step, note: 'F#3', velocity: 90 }));
		const result = await run(writePatternTool, { track: 1, notes: [...kick, ...snare] });
		expect(result.isError).toBeFalsy();
		expect(json(result).written).toMatchObject({ track: 1, pattern: 1, bars: 1, noteCount: 6 });
		expect(stepRow(sim)).toBe('w...w...w...w...');
		const p = currentPattern(sim.state.tracks[0].sequence);
		expect(p.steps[4].notes.map((n) => [n.note, n.velocity])).toEqual([
			[53, 100],
			[54, 90]
		]);
		expect(changes()).toBeGreaterThan(0);
	});

	it('writes two bars at a track scale into pattern 3, adding patterns 2 and 3', async () => {
		const { sim, run } = setup();
		await run(writePatternTool, {
			track: 3,
			pattern: 3,
			bars: 2,
			scale: '2',
			notes: [
				{ step: 1, note: 'C3', length: 4 },
				{ step: 17, note: 'G2', length: 8 }
			]
		});
		const seq = sim.state.tracks[2].sequence;
		expect(seq.patterns).toHaveLength(3);
		expect(seq.current).toBe(2);
		expect(currentPattern(seq)).toMatchObject({ bars: 2, length: 32, scale: 2 });
		expect(currentPattern(seq).steps[16].notes[0]).toMatchObject({ note: 43, length: 8 });
		expect(sim.state.areas.arrange.sounds[2].length).toBeGreaterThanOrEqual(3);
	});

	it('refuses what does not fit: a step past the bars, an unknown note name', async () => {
		const { run } = setup();
		const outside = await run(writePatternTool, {
			track: 1,
			bars: 1,
			notes: [{ step: 20, note: 60 }]
		});
		expect(outside.isError).toBe(true);
		const name = await run(writePatternTool, { track: 1, notes: [{ step: 1, note: 'H9' }] });
		expect(name.isError).toBe(true);
	});

	it('undoes by writing back what was there', async () => {
		const { env, sim, run } = setup();
		await run(writePatternTool, { track: 3, notes: [{ step: 1, note: 60 }] });
		const input = writePatternTool.input.parse({ track: 3, notes: [{ step: 9, note: 67 }] });
		const before = writePatternTool.snapshot!(input, env);
		await run(writePatternTool, input);
		const inverse = writePatternTool.inverse!(input, before, env);
		expect(inverse).not.toBeNull();
		await run(writePatternTool, inverse!.input);
		const p = currentPattern(sim.state.tracks[2].sequence);
		expect(p.steps[0].notes.map((n) => n.note)).toEqual([60]);
		expect(p.steps[8].notes).toEqual([]);
	});

	it('reads a pattern back by step', async () => {
		const { run } = setup();
		await run(writePatternTool, {
			track: 4,
			notes: [
				{ step: 1, note: 60 },
				{ step: 1, note: 64 },
				{ step: 3, note: 67 }
			]
		});
		const read = json(await run(readPatternTool, { track: 4 }));
		expect(read.steps).toEqual([
			{
				step: 1,
				notes: [
					{ note: 60, velocity: 100, length: 1 },
					{ note: 64, velocity: 100, length: 1 }
				]
			},
			{ step: 3, notes: [{ note: 67, velocity: 100, length: 1 }] }
		]);
	});

	it('names the sound on each drum key it reads back', async () => {
		const { run } = setup();
		const written = json(
			await run(writePatternTool, {
				track: 1,
				notes: [
					{ step: 1, note: 53 },
					{ step: 1, note: 62 },
					{ step: 5, note: 55 }
				]
			})
		);
		expect(written.written.steps).toEqual([
			{
				step: 1,
				notes: [
					{ note: 53, sound: 'kick 1', velocity: 100, length: 1 },
					{ note: 62, sound: 'closed hat 2', velocity: 100, length: 1 }
				]
			},
			{ step: 5, notes: [{ note: 55, sound: 'snare 1', velocity: 100, length: 1 }] }
		]);
		// and as a drummer's grid, a line per sound
		expect(written.written.grid).toEqual({
			'kick 1': 'x...............',
			'snare 1': '....x...........',
			'closed hat 2': 'x...............'
		});
	});

	it('draws a grid bar by bar, and none for a melodic track', async () => {
		const { run } = setup();
		const two = json(
			await run(writePatternTool, {
				track: 1,
				bars: 2,
				notes: [1, 5, 9, 13, 17, 21, 25, 29].map((step) => ({ step, note: 53 }))
			})
		);
		expect(two.written.grid).toEqual({ 'kick 1': 'x...x...x...x... x...x...x...x...' });
		const keys = json(await run(writePatternTool, { track: 4, notes: [{ step: 1, note: 60 }] }));
		expect(keys.written.grid).toBeUndefined();
	});
});

describe('write_arrangement', () => {
	it('sets scenes and a song, which then plays scene by scene', async () => {
		const { sim, run } = setup();
		await run(writePatternTool, { track: 1, pattern: 1, notes: [{ step: 1, note: 53 }] });
		await run(writePatternTool, { track: 1, pattern: 2, notes: [{ step: 5, note: 54 }] });
		const result = await run(writeArrangementTool, {
			scenes: [
				{ scene: 1, patterns: [{ track: 1, pattern: 1 }] },
				{ scene: 2, patterns: [{ track: 1, pattern: 2 }] }
			],
			song: { scenes: [1, 2, 1], loop: false }
		});
		expect(json(result).arrangement.song).toEqual({ order: [1, 2, 1], loop: false });
		expect(json(result).addedEmpty).toBeUndefined();
		expect(sim.state.tracks[0].sequence.current).toBe(0); // scene 1 is the current one
		await run(transportTool, { action: 'play' });
		expect(sim.state.areas.arrange.playing).toBe(true);
		for (let i = 0; i < 21; i++) sim.advance(100); // a bar at 120 BPM is 2 s
		expect(sim.state.areas.arrange.scene).toBe(1); // after one bar: scene 2
		expect(sim.state.tracks[0].sequence.current).toBe(1);
	});

	it('says which patterns a scene added empty', async () => {
		const { run } = setup();
		await run(writePatternTool, { track: 3, notes: [{ step: 1, note: 36 }] });
		const result = json(
			await run(writeArrangementTool, {
				scenes: [{ scene: 1, patterns: [{ track: 3, pattern: 3 }] }]
			})
		);
		expect(result.addedEmpty).toEqual(['track 3: pattern 2, 3 (empty)']);
	});

	it('undoes to the scenes and song before', async () => {
		const { env, sim, run } = setup();
		const input = writeArrangementTool.input.parse({
			scenes: [{ scene: 5, patterns: [{ track: 2, pattern: 2 }] }],
			song: { scenes: [5, 5], loop: true }
		});
		const before = writeArrangementTool.snapshot!(input, env);
		await run(writeArrangementTool, input);
		expect(sim.state.areas.arrange.scenes[4]).not.toBeNull();
		const inverse = writeArrangementTool.inverse!(input, before, env)!;
		await run(writeArrangementTool, inverse.input);
		expect(sim.state.areas.arrange.scenes[4]).toBeNull();
		expect(sim.state.areas.arrange.songs[0].order).toEqual([0]);
	});
});

describe('live tools on the virtual OP-XY (no device connected)', () => {
	it('starts and stops its transport and says where it happened', async () => {
		const { sim, run } = setup();
		const started = await run(transportTool, { action: 'play' });
		expect(json(started)).toMatchObject({ target: 'virtual', playState: 'playing' });
		expect(sim.state.transport.playing).toBe(true);
		expect((await run(transportTool, { action: 'play' })).applied).toBe(false);
		await run(transportTool, { action: 'stop' });
		expect(sim.state.transport.playing).toBe(false);
	});

	it('says once per conversation that no OP-XY is connected', async () => {
		const { run } = setup();
		const first = json(await run(transportTool, { action: 'play' }));
		expect(first.note).toMatch(/No OP-XY is connected/);
		const next = json(await run(setTempoTool, { bpm: 100 }));
		expect(next).toMatchObject({ target: 'virtual', tempoBpm: 100 });
		expect(next.note).toBeUndefined();
	});

	it('sets its tempo to the tenth, selects and mutes its tracks', async () => {
		const { sim, env, run } = setup();
		const tempo = await run(setTempoTool, { bpm: 97.5 });
		expect(json(tempo)).toMatchObject({ target: 'virtual', tempoBpm: 97.5 });
		expect(setTempoTool.snapshot!({ bpm: 90 }, env)).toEqual({ bpm: 97.5, from: 'virtual' });
		await run(selectTrackTool, { track: 3 });
		expect(sim.state.track).toBe(2);
		await run(selectTrackTool, { track: 10 });
		expect([sim.state.active, sim.state.auxTrack]).toEqual(['auxiliary', 1]);
		await run(muteTrackTool, { track: 5, muted: true });
		expect(sim.state.tracks[4].mix.muted).toBe(true);
		expect(muteTrackTool.snapshot!({ track: 5, muted: false }, env)).toEqual({ muted: true });
	});

	it('plays previews through the browser sound, paced by the steps', async () => {
		const { run, previews, time } = setup({ sound: true });
		const done = run(playNotesTool, {
			track: 3,
			bpm: 120,
			steps: [
				{ notes: ['C4', 'E4'], beats: 1 },
				{ notes: [67], beats: 0.5, velocity: 80 }
			]
		});
		await time.advance(1000);
		const result = await done;
		expect(json(result)).toMatchObject({ target: 'virtual', played: 2 });
		// the sound numbers instrument tracks from 0
		expect(previews.map(([track, note, velocity]) => [track, note, velocity])).toEqual([
			[2, 60, 100],
			[2, 64, 100],
			[2, 67, 80]
		]);
	});

	it('explains when the sound is off', async () => {
		const { run } = setup({ sound: false });
		const result = await run(playNotesTool, { track: 3, steps: [{ notes: [60], beats: 1 }] });
		expect(result.isError).toBe(true);
		expect(result.summary).toBe('sound is off');
	});

	it('reports the virtual OP-XY in device_status', async () => {
		const { run } = setup();
		await run(writePatternTool, { track: 3, notes: [{ step: 1, note: 60 }] });
		const status = await run(deviceStatusTool, {});
		expect(status.summary).toBe('no op-xy connected: the replica plays');
		expect(json(status).virtual).toMatchObject({ bpm: 120, playing: false, sound: 'unavailable' });
		expect(json(status).virtual.tracks[2]).toMatchObject({ track: 3, engine: 'prism', notes: 1 });
	});
});
