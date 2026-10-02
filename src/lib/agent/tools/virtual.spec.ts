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
	setMetronomeTool,
	setTempoTool,
	transportTool
} from './device';
import { readPatternTool, readSoundTool, writeArrangementTool, writePatternTool } from './virtual';

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
		// written, a drum pattern comes back as its grid alone; read, note by note too
		expect(written.written.steps).toBeUndefined();
		const read = json(await run(readPatternTool, { track: 1 }));
		expect(read.steps).toEqual([
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
			'kick 1': 'x... .... .... ....',
			'snare 1': '.... x... .... ....',
			'closed hat 2': 'x... .... .... ....'
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
		expect(two.written.grid).toEqual({ 'kick 1': 'x... x... x... x... | x... x... x... x...' });
		const keys = json(await run(writePatternTool, { track: 4, notes: [{ step: 1, note: 60 }] }));
		expect(keys.written.grid).toBeUndefined();
		expect(keys.written.reading.bars).toEqual(['C4 · · · | · · · · | · · · · | · · · ·']);
	});

	it('marks accents and soft hits on the grid', async () => {
		const { run } = setup();
		const hats = [1, 3, 5, 7, 9, 11, 13, 15].map((step) => ({
			step,
			note: 61,
			velocity: step % 4 === 1 ? 120 : 60
		}));
		const written = json(await run(writePatternTool, { track: 1, notes: hats }));
		expect(written.written.grid).toEqual({ 'closed hat 1': 'X.o. X.o. X.o. X.o.' });
		// and a grid written with marks reads back with the same marks, a line of soft hats too
		const marks = { 'closed hat 1': 'o.o. o.o. o.o. o.o.', 'kick 1': 'X... x... X... x...' };
		const back = json(await run(writePatternTool, { track: 1, velocity: 85, grid: marks }));
		expect(back.written.grid).toEqual(marks);
	});
});

describe('write_pattern in an arrangement', () => {
	it('leaves the scenes as they are, and says which play the pattern', async () => {
		const { virtual, run } = setup();
		await run(writePatternTool, { track: 1, pattern: 1, notes: '1:53' });
		await run(writePatternTool, { track: 1, pattern: 2, notes: '5:53' });
		await run(writeArrangementTool, {
			scenes: [
				{ scene: 1, patterns: [{ track: 1, pattern: 2 }] },
				{ scene: 2, patterns: [{ track: 1, pattern: 1 }] }
			],
			song: { scenes: [1, 2], loop: true }
		});
		// rewriting pattern 1 (scene 2's) while scene 1 is on: scene 1 still plays pattern 2
		const result = await run(writePatternTool, { track: 1, pattern: 1, notes: '1:53 9:53' });
		expect(virtual.readArrangement().scenes.map((s) => s.patterns[0])).toEqual([2, 1]);
		expect(json(result).note).toMatch(
			/The scenes are as they were: this pattern plays in scene 2\./
		);
		expect(json(result).written.current).toBe(false);
		const spare = await run(writePatternTool, { track: 1, pattern: 3, notes: '1:53' });
		expect(json(spare).note).toMatch(
			/none plays this pattern yet: write_arrangement puts it in one/
		);
	});

	it('transposes a pattern as it is, and refuses to on drums', async () => {
		const { sim, run } = setup();
		await run(writePatternTool, { track: 3, bars: 2, velocity: 80, notes: '1:A2:4 17:C3:2' });
		const down = await run(writePatternTool, { track: 3, transpose: -12 });
		expect(down.isError).toBeFalsy();
		const p = currentPattern(sim.state.tracks[2].sequence);
		expect(p.bars).toBe(2);
		expect(p.steps[0].notes.map((n) => [n.note, n.velocity, n.length])).toEqual([[33, 80, 4]]);
		expect(p.steps[16].notes.map((n) => n.note)).toEqual([36]);
		expect(json(down).sound).toBe('prism (bass/shoulder)');
		const drums = await run(writePatternTool, { track: 1, transpose: 2 });
		expect(drums).toMatchObject({ isError: true, summary: 'drums do not transpose' });
		const far = await run(writePatternTool, { track: 3, transpose: -48 });
		expect(far).toMatchObject({ isError: true, summary: 'notes out of range' });
	});
});

describe('write_pattern on drums', () => {
	it('says where a closed and an open hat hit on one step', async () => {
		const { run } = setup();
		const result = json(
			await run(writePatternTool, {
				track: 1,
				pattern: 1,
				grid: { '61': 'x.x. x.x. x.x. x.x.', '63': '..x. ..x. .... ....' }
			})
		);
		expect(result.note).toMatch(/A closed and an open hat both hit on steps 3, 7:/);
		const apart = json(
			await run(writePatternTool, {
				track: 1,
				pattern: 1,
				grid: { '61': 'x... x... x... x...', '63': '..x. ..x. ..x. ..x.' }
			})
		);
		expect(apart.note).not.toMatch(/both hit/);
	});
});

describe('write_arrangement', () => {
	it('rests a track in a scene on an empty pattern (0)', async () => {
		const { virtual, run } = setup();
		await run(writePatternTool, { track: 3, pattern: 1, notes: '1:A2:4' });
		const result = await run(writeArrangementTool, {
			scenes: [
				{ scene: 1, patterns: [{ track: 3, pattern: 0 }] },
				{ scene: 2, patterns: [{ track: 3, pattern: 1 }] }
			]
		});
		expect(result.isError).toBeFalsy();
		// a new empty pattern 2 for the rest, and scene 2 plays the bass
		const scenes = virtual.readArrangement().scenes;
		expect(scenes.map((s) => s.patterns[2])).toEqual([2, 1]);
		expect(virtual.readPattern(3, 2).notes).toEqual([]);
		// the next rest reuses it
		await run(writeArrangementTool, {
			scenes: [{ scene: 3, patterns: [{ track: 3, pattern: 0 }] }]
		});
		expect(virtual.readArrangement().scenes[2].patterns[2]).toBe(2);
	});

	it('changes one track of a scene, the others keeping theirs', async () => {
		const { virtual, run } = setup();
		await run(writePatternTool, { track: 1, pattern: 2, notes: [{ step: 1, note: 53 }] });
		await run(writePatternTool, { track: 3, pattern: 2, notes: '1:A2:4' });
		await run(writeArrangementTool, {
			scenes: [
				{ scene: 1, patterns: [{ track: 1, pattern: 1 }] },
				{
					scene: 2,
					patterns: [
						{ track: 1, pattern: 2 },
						{ track: 3, pattern: 2 }
					]
				}
			]
		});
		await run(writeArrangementTool, {
			scenes: [{ scene: 2, patterns: [{ track: 1, pattern: 1 }] }]
		});
		const two = virtual.readArrangement().scenes[1].patterns;
		expect([two[0], two[2]]).toEqual([1, 2]);
		// cleared first, a scene starts from pattern 1 everywhere
		await run(writeArrangementTool, {
			scenes: [
				{ scene: 2, patterns: null },
				{ scene: 2, patterns: [{ track: 1, pattern: 2 }] }
			]
		});
		const fresh = virtual.readArrangement().scenes[1].patterns;
		expect([fresh[0], fresh[2]]).toEqual([2, 1]);
	});

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
		expect(json(result).arrangement.song).toEqual({
			order: [1, 2, 1],
			loop: false,
			length: '3 bars, 0:06 at 120 bpm, then it stops'
		});
		expect(json(result).arrangement.scenes).toEqual({
			'scene 1': 'every track p1 (1 bar)',
			'scene 2': 'T1 p2; the rest p1 (1 bar)'
		});
		// the loop alone: an empty order keeps the order
		const loop = json(await run(writeArrangementTool, { song: { scenes: [], loop: true } }));
		expect(loop.arrangement.song).toMatchObject({ order: [1, 2, 1], loop: true });
		await run(writeArrangementTool, { song: { scenes: [1, 2, 1], loop: false } });
		expect(json(result).addedEmpty).toBeUndefined();
		expect(sim.state.tracks[0].sequence.current).toBe(0); // scene 1 is the current one
		await run(transportTool, { action: 'play' });
		expect(sim.state.areas.arrange.playing).toBe(true);
		for (let i = 0; i < 21; i++) sim.advance(100); // a bar at 120 BPM is 2 s
		expect(sim.state.areas.arrange.scene).toBe(1); // after one bar: scene 2
		expect(sim.state.tracks[0].sequence.current).toBe(1);
	});

	it('plays one scene from its top, round and round, with transport play and a scene', async () => {
		const { sim, virtual, run } = setup();
		await run(writePatternTool, { track: 1, pattern: 1, notes: [{ step: 1, note: 53 }] });
		await run(writePatternTool, { track: 1, pattern: 2, notes: [{ step: 5, note: 54 }] });
		await run(writeArrangementTool, {
			scenes: [
				{ scene: 1, patterns: [{ track: 1, pattern: 1 }] },
				{ scene: 2, patterns: [{ track: 1, pattern: 2 }] }
			],
			song: { scenes: [1, 2], loop: true }
		});
		await run(transportTool, { action: 'play' });
		sim.advance(500);
		const result = json(await run(transportTool, { action: 'play', scene: 2 }));
		expect(result).toMatchObject({ playState: 'playing', from: 'scene 2, looping' });
		expect(virtual.readArrangement()).toMatchObject({ scene: 2, plays: 'scene' });
		expect(sim.state.transport.position).toBe(0);
		for (let i = 0; i < 41; i++) sim.advance(100); // two bars: still scene 2
		expect(sim.state.areas.arrange.scene).toBe(1);
		// play alone runs the song again
		await run(transportTool, { action: 'play' });
		expect(virtual.readArrangement()).toMatchObject({ scene: 1, plays: 'song' });
		const missing = await run(transportTool, { action: 'play', scene: 7 });
		expect(missing.isError).toBe(true);
		expect(String(missing.content)).toMatch(/scene 7 holds nothing yet/);
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

describe('write_pattern, short', () => {
	it('takes the notes as one string: a word per note, chords, lengths, velocities', async () => {
		const { sim, run } = setup();
		const result = await run(writePatternTool, {
			track: 3,
			velocity: 70,
			notes: '1:A2:4 5:C3+E3+G3:2 9:E2::110'
		});
		expect(result.isError).toBeFalsy();
		const p = currentPattern(sim.state.tracks[2].sequence);
		const at = (i: number) => p.steps[i].notes.map((n) => [n.note, n.velocity, n.length]);
		expect(at(0)).toEqual([[45, 70, 4]]);
		expect(at(4)).toEqual([
			[48, 70, 2],
			[52, 70, 2],
			[55, 70, 2]
		]);
		expect(at(8)).toEqual([[40, 110, 1]]);
		// a list of objects takes the pattern's velocity too
		await run(writePatternTool, { track: 4, velocity: 60, notes: [{ step: 1, note: 'C3' }] });
		expect(currentPattern(sim.state.tracks[3].sequence).steps[0].notes[0].velocity).toBe(60);
	});

	it('writes drums from a grid by the sounds’ names, notes and numbers, with a string beside it', async () => {
		const { sim, run } = setup();
		const result = await run(writePatternTool, {
			track: 1,
			velocity: 90,
			grid: {
				'kick 1': 'x... ..x. x... ....',
				F3: '.... X... .... X...',
				62: '..o. ..o. ..o. ..o.'
			},
			notes: '16:63'
		});
		expect(result.isError).toBeFalsy();
		const p = currentPattern(sim.state.tracks[0].sequence);
		const hits = p.steps
			.map((s, i) => s.notes.map((n) => `${i + 1}:${n.note}:${n.velocity}`).sort())
			.flat();
		// "kick 1" sits on F3 (53) in a new project's kit, as F3 does: both lines are the same key
		expect(hits).toEqual([
			'1:53:90',
			'3:62:50',
			'5:53:115',
			'7:53:90',
			'7:62:50',
			'9:53:90',
			'11:62:50',
			'13:53:115',
			'15:62:50',
			'16:63:90'
		]);
		expect(json(result).written.grid).toBeDefined();
	});

	it('says what it cannot read, and writes nothing', async () => {
		const { sim, run } = setup();
		const before = JSON.stringify(sim.state.tracks[0].sequence);
		const bad = await run(writePatternTool, { track: 1, notes: '1:C3 5' });
		expect(bad).toMatchObject({ isError: true, summary: 'notes not read' });
		expect(String(bad.content)).toMatch(/"5" is not step:note/);
		const sound = await run(writePatternTool, { track: 1, grid: { cowbel: 'x...' } });
		expect(sound).toMatchObject({ isError: true, summary: 'unknown grid sounds' });
		expect(String(sound.content)).toMatch(/"cowbel" is no sound.*this track's sounds: .*kick 1/);
		const none = await run(writePatternTool, { track: 1 });
		expect(none).toMatchObject({ isError: true, summary: 'no notes given' });
		const many = await run(writePatternTool, {
			track: 3,
			notes: Array.from({ length: 64 }, (_, i) => `${i + 1}:C3+E3`).join(' ')
		});
		expect(many).toMatchObject({ isError: true, summary: 'too many notes' });
		expect(JSON.stringify(sim.state.tracks[0].sequence)).toBe(before);
		// an empty string clears, as an empty list does
		await run(writePatternTool, { track: 1, notes: '1:53' });
		await run(writePatternTool, { track: 1, notes: '' });
		expect(
			currentPattern(sim.state.tracks[0].sequence).steps.every((s) => s.notes.length === 0)
		).toBe(true);
	});

	it('finds a sound by its name with or without a number, and says when a line is short', async () => {
		const { sim, run } = setup();
		// a new project's kit names "kick 1" and "kick 2": "kick" is the first; "closed hat 2" itself
		const result = await run(writePatternTool, {
			track: 1,
			bars: 2,
			grid: { kick: 'x... x... x... x...', 'closed hat 2': '..x. ..x. ..x. ..x.' }
		});
		expect(result.isError).toBeFalsy();
		const p = currentPattern(sim.state.tracks[0].sequence);
		expect(p.steps[0].notes.map((n) => n.note)).toEqual([53]);
		expect(p.steps[2].notes.map((n) => n.note)).toEqual([62]);
		// a bar-long line in a two-bar pattern repeats to fill it
		expect(p.steps[16].notes.map((n) => n.note)).toEqual([53]);
		expect(p.steps[18].notes.map((n) => n.note)).toEqual([62]);
		expect(json(result).note).toBe('On the replica.');
		// a line that neither fills nor divides it is said, so a miscount shows
		const short = await run(writePatternTool, {
			track: 1,
			bars: 2,
			grid: { kick: 'x... '.repeat(7) + 'x.' }
		});
		expect(json(short).note).toMatch(/neither fill the pattern's 32 steps .*kick has 30/);
		// a made kit's "kick", written as the new project's "kick 1"
		sim.state.areas.sample.tracks[0].keys[0] = {
			...sim.state.areas.sample.tracks[0].keys[0]!,
			name: '53 kick.wav'
		};
		const made = await run(writePatternTool, { track: 1, grid: { 'kick 1': 'x...' } });
		expect(made.isError).toBeFalsy();
	});

	it('previews the notes it was given in either form', () => {
		const preview = writePatternTool.preview!(
			{ track: 1, grid: { 53: 'x...x...' }, notes: '3:62' } as never,
			null,
			{} as never
		);
		expect(preview.label).toBe('track 1 pattern 1: 3 notes');
	});
});

describe('live tools on the virtual OP-XY (no device connected)', () => {
	it('starts and stops its transport and says where it happened, and from where it plays', async () => {
		const { sim, run, virtual } = setup();
		const started = await run(transportTool, { action: 'play' });
		expect(json(started)).toMatchObject({
			target: 'virtual',
			playState: 'playing',
			from: 'scene 1, looping'
		});
		expect(sim.state.transport.playing).toBe(true);
		// play while it plays starts again from the top, as the play key does
		sim.advance(1500);
		expect(sim.state.transport.position).toBeGreaterThan(0);
		const again = await run(transportTool, { action: 'play' });
		expect(again).toMatchObject({ applied: true, summary: 'played again from the top' });
		expect(json(again).note).toMatch(/started again from the top/);
		expect(sim.state.transport.position).toBe(0);
		await run(transportTool, { action: 'stop' });
		expect(sim.state.transport.playing).toBe(false);
		// with a song, from its first scene
		virtual.writeArrangement({
			scenes: [{ scene: 2, patterns: [{ track: 1, pattern: 1 }] }],
			song: { order: [1, 2], loop: false }
		});
		expect(json(await run(transportTool, { action: 'play' })).from).toBe(
			'the song from its first scene (1 2), once through, then it stops'
		);
	});

	it('says once per conversation that no OP-XY is connected', async () => {
		const { run } = setup();
		const first = json(await run(transportTool, { action: 'play' }));
		expect(first.note).toMatch(/No OP-XY is connected/);
		const next = json(await run(setTempoTool, { bpm: 100 }));
		expect(next).toMatchObject({ target: 'virtual', tempoBpm: 100 });
		expect(next.note).toBeUndefined();
	});

	it('switches its metronome off and on, and says when it already was', async () => {
		const { sim, env, run } = setup();
		// a new project's metronome clicks
		expect(sim.state.tempo.metronome.on).toBe(true);
		expect(setMetronomeTool.snapshot!({ on: false }, env)).toEqual({ on: true });
		const off = await run(setMetronomeTool, { on: false });
		expect(json(off)).toMatchObject({ target: 'virtual', metronome: 'off' });
		expect(off).toMatchObject({
			applied: true,
			after: false,
			summary: 'metronome off on the replica'
		});
		expect(sim.state.tempo.metronome.on).toBe(false);
		const again = await run(setMetronomeTool, { on: false });
		expect(json(again).note).toBe('It was already off.');
		expect(again.applied).toBe(false);
		expect(setMetronomeTool.inverse!({ on: false }, { on: true }, env)).toMatchObject({
			tool: 'set_metronome',
			input: { on: true }
		});
		// on means heard: a level turned down to 0 comes back up with it
		sim.state.tempo.metronome.level = 0;
		await run(setMetronomeTool, { on: true });
		expect(sim.state.tempo.metronome.on).toBe(true);
		expect(sim.state.tempo.metronome.level).toBeGreaterThan(0);
		// and off at level 0 is off on the screen too, not just silent
		sim.state.tempo.metronome.level = 0;
		await run(setMetronomeTool, { on: false });
		expect(sim.state.tempo.metronome.on).toBe(false);
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

describe('read_sound', () => {
	it("reads a track's whole sound as its pages show it", async () => {
		const { run } = setup();
		const sound = json(await run(readSoundTool, { track: 3 }));
		expect(sound).toMatchObject({ track: 3, engine: 'prism', preset: 'bass/shoulder' });
		expect(sound.pages['M1 engine']).toMatch(/^prism: shape \d+/);
		expect(sound.pages['M2 amp envelope']).toMatch(/^amp envelope: attack/);
		expect(sound.pages['M2 filter envelope']).toMatch(/^filter envelope: attack/);
		expect(sound.pages['shift M2 play mode']).toMatch(/play mode/);
		expect(sound.pages['M3 filter']).toMatch(/cutoff .*resonance .*env/);
		// on or off, said either way: track 3's filter is on, its LFO off
		expect(sound.pages['M3 filter']).toMatch(/^svf filter on: cutoff 00/);
		expect(sound.pages['M4 lfo']).toMatch(/^tremolo lfo off:/);
		expect(sound.pages['shift M3 sends']).toMatch(/^sends:/);
		expect(sound.pages['M4 lfo']).toMatch(/lfo/);
		expect(sound.pages.player).toMatch(/player/);
		expect(sound.mix).toEqual({ level: 74, pan: 0, muted: false });
		expect(sound.kit).toBeUndefined();
	});

	it('lists the sound on every key of a drum track, and moves nothing', async () => {
		const { sim, run } = setup();
		const before = JSON.stringify(sim.state);
		const kit = json(await run(readSoundTool, { track: 1 }));
		expect(kit.kit).toMatchObject({ F3: 'kick 1', 'F#3': 'kick 2', G3: 'snare 1', E5: 'chi 1' });
		expect(Object.keys(kit.kit)).toHaveLength(24);
		expect(JSON.stringify(sim.state)).toBe(before);
	});
});
