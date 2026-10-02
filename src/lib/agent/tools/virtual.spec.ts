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
	panicTool,
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
	let silenced = 0;
	const sound: VirtualSound | null =
		options.sound === undefined
			? null
			: {
					enabled: options.sound,
					available: true,
					preview: (track, note, velocity, seconds) => {
						previews.push([track, note, velocity, seconds]);
						return true;
					},
					silence: () => silenced++
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
	return {
		time,
		sim,
		env,
		virtual,
		run,
		previews,
		changes: () => changes,
		silenced: () => silenced
	};
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
		// each sound's steps by number beside the grid (agents placed hits from the marks wrongly)
		expect(json(result).written.hits).toBe('kick 1: 1 5 9 13 at 100; kick 2: 5 13 at 90');
		expect(json(result).written.beats).toBe(
			'kick 1: 1 2 3 4; kick 2: 2 4 (beats of each bar; e, & and a the sixteenths after a beat)'
		);
		expect(stepRow(sim)).toBe('w...w...w...w...');
		const p = currentPattern(sim.state.tracks[0].sequence);
		expect(p.steps[4].notes.map((n) => [n.note, n.velocity])).toEqual([
			[53, 100],
			[54, 90]
		]);
		expect(changes()).toBeGreaterThan(0);
	});

	it('reverses one bar alone, the other bars kept', async () => {
		// "reverse just the fill": an agent worked out the mirrored steps by hand
		const { run } = setup();
		await run(writePatternTool, {
			track: 1,
			bars: 2,
			grid: {
				kick: 'x... x... x... x...',
				'low tom': '.... .... .... .... | .... .... x.x. xxxx'
			}
		});
		const result = json(await run(writePatternTool, { track: 1, bar: 2, reverse: true }));
		// bar 2's toms, 25 27 29 30 31 32, mirror about its downbeat: n → 18 − n within the bar
		expect(result.written.hits).toMatch(/low tom 1: 18 19 20 21 23 25/);
		// the kick's bar 1 is as it was; its bar 2 mirrors onto the same beats
		expect(result.written.hits).toMatch(/kick 1: 1 5 9 13 17 21 25 29/);
		expect(result.note).toMatch(/Reversed bar 2 alone, the other bars kept, about the downbeat/);
	});

	it('takes a whole bar and then rests as hits once, the rest silent', async () => {
		// a crash on bar 1 alone, "X... .... .... .... | ....", was refused as a miscount
		const { run } = setup();
		const result = json(
			await run(writePatternTool, {
				track: 1,
				bars: 2,
				grid: { kick: 'x... x... x... x...', crash: 'X... .... .... .... | ....' }
			})
		);
		expect(result.written.hits).toMatch(/crash 1: 1 at \d+(;|$)/);
		expect(result.note).toMatch(
			/crash: whole bars and then rests, short of the pattern, so its hits play once/
		);
		// three bars of open hats and "...." for the fourth
		const three = json(
			await run(writePatternTool, {
				track: 1,
				bars: 4,
				grid: {
					'closed hat': 'x.x. x.x. x.x. x...',
					'open hat': '.... .... .... ..x. | .... .... .... ..x. | .... .... .... ..x. | ....'
				}
			})
		);
		expect(three.written.hits).toMatch(/open hat 1: 15 31 47 at \d+(;|$)/);
		// a bar with hits after it is still a miscount
		const off = await run(writePatternTool, {
			track: 1,
			bars: 2,
			grid: { crash: 'X... .... .... .... | x...' }
		});
		expect(off.isError).toBe(true);
		expect(String(off.content)).toMatch(/then that bar alone with bar and merge/);
	});

	it('lists a drum line’s hits by bar and beat beside the grid', async () => {
		// "26 and 27" read by hand as the and of 3 and the beat after: they are 3e and 3&
		const { run } = setup();
		const result = json(
			await run(writePatternTool, {
				track: 1,
				bars: 2,
				grid: { kick: 'x.....x...x..... .........xx.....', 'closed hat': 'x.x.x.x.x.x.x.x.' }
			})
		);
		expect(result.written.hits).toBe(
			'kick 1: 1 7 11 26 27 at 100; closed hat 1: 1 3 5 7 9 11 13 15 17 19 21 23 25 27 29 31 at 100'
		);
		expect(result.written.beats).toBe(
			'kick 1: bar 1: 1 2& 3&, bar 2: 3e 3&; closed hat 1: 1 1& 2 2& 3 3& 4 4& every bar (beats of each bar; e, & and a the sixteenths after a beat)'
		);
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

	it('reads a pattern back in the notes form a write takes, the same notes again', async () => {
		const { run } = setup();
		await run(writePatternTool, {
			track: 4,
			notes: [
				{ step: 1, note: 60 },
				{ step: 1, note: 64 },
				{ step: 1, note: 48, length: 4, velocity: 80 },
				{ step: 3, note: 67 }
			]
		});
		const read = json(await run(readPatternTool, { track: 4 }));
		expect(read.steps).toBeUndefined();
		expect(read.notes).toBe('1:C4+E4:1:100 1:C3:4:80 3:G4:1:100');
		// written back as read, it reads the same
		await run(writePatternTool, { track: 4, pattern: 2, notes: read.notes });
		expect(json(await run(readPatternTool, { track: 4, pattern: 2 })).notes).toBe(read.notes);
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
		expect(written.written.grid).toEqual({ 'closed hat 1': 'X.4. X.4. X.4. X.4.' });
		// and a grid written with marks reads back with the same marks, soft hits as their digits
		const marks = { 'closed hat 1': '2.3. 4.5. 1.2. 3.4.', 'kick 1': 'X... x... X... x...' };
		const back = json(await run(writePatternTool, { track: 1, velocity: 85, grid: marks }));
		expect(back.written.grid).toEqual(marks);
		// an o is a soft hit at about half the pattern's velocity: 47 of 85 reads 3
		const soft = json(
			await run(writePatternTool, { track: 1, velocity: 85, grid: { 'closed hat 1': 'o.o.' } })
		);
		expect(soft.written.grid['closed hat 1']).toBe('3.3. 3.3. 3.3. 3.3.');
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

describe('write_pattern one bar at a time', () => {
	it('replaces one bar, keeping the others, its steps counted from the bar', async () => {
		const { virtual, run } = setup();
		await run(writePatternTool, {
			track: 7,
			pattern: 1,
			notes: '1:D3+F3+A3:16 17:Bb2+D3+F3:16 33:G2+Bb2+D3:16 49:A2+C#3+E3:16'
		});
		const one = json(
			await run(writePatternTool, { track: 7, pattern: 1, bar: 4, notes: '1:A2+C#3+E3+G3:16' })
		);
		expect(one.written.bars).toBe(4);
		const notes = virtual.readPattern(7, 1).notes;
		expect(notes.filter((n) => n.step === 1).map((n) => n.note)).toEqual([50, 53, 57]);
		expect(notes.filter((n) => n.step === 49).map((n) => n.note)).toEqual([45, 49, 52, 55]);
		// a step past the bar is refused, nothing written
		const past = await run(writePatternTool, { track: 7, pattern: 1, bar: 2, notes: '17:C3' });
		expect(past.isError).toBe(true);
		// transpose with bar shifts that bar alone
		await run(writePatternTool, { track: 7, pattern: 1, bar: 1, transpose: 12 });
		const shifted = virtual.readPattern(7, 1).notes;
		expect(shifted.filter((n) => n.step === 1).map((n) => n.note)).toEqual([62, 65, 69]);
		expect(shifted.filter((n) => n.step === 17).map((n) => n.note)).toEqual([46, 50, 53]);
	});
});

describe('a scene’s own mix', () => {
	it('keeps levels and mutes per scene, the one on screen taking them at once', async () => {
		const { sim, run } = setup();
		await run(writePatternTool, { track: 3, pattern: 1, notes: '1:A2:4' });
		await run(writeArrangementTool, {
			scenes: [
				{ scene: 1, patterns: [{ track: 3, pattern: 1 }] },
				{ scene: 2, patterns: [{ track: 3, pattern: 1 }], mix: [{ track: 3, muted: true }] }
			]
		});
		const louder = json(
			await run(writeArrangementTool, {
				scenes: [{ scene: 1, patterns: [], mix: [{ track: 3, level: 90 }] }]
			})
		);
		expect(sim.state.tracks[2].mix.level).toBe(90);
		expect(sim.state.tracks[2].mix.muted).toBe(false);
		expect(louder.arrangement.scenes['scene 2']).toMatch(/; muted T3/);
		// scene 2 kept its own mix, the mute, when scene 1 changed
		expect(sim.state.areas.arrange.scenes[1]?.mix[2].muted).toBe(true);
	});

	it('finds a made kit’s sounds by what they are: "kick 1" for "808 kick"', async () => {
		const { virtual, run } = setup();
		const audio = { sampleRate: 44100, channels: [new Float32Array(100)] };
		// a whole made kit, as make_kit puts one on a track: every key named by its style
		const kinds = ['kick', 'kick', 'snare', 'snare', 'rim', 'clap', 'tamb', 'shaker'];
		const hats = ['closed hat', 'closed hat', 'open hat', 'clave', 'low tom', 'ride'];
		const rest = ['mid tom', 'crash', 'high tom', 'triangle', 'low conga', 'high conga'];
		const last = ['cowbell', 'guiro', 'metal', 'chi'];
		virtual.loadKit(1, {
			name: '808 kit',
			sounds: [...kinds, ...hats, ...rest, ...last].map((kind, i) => ({
				key: 53 + i,
				name: `808 ${kind}`,
				audio
			}))
		});
		const result = json(
			await run(writePatternTool, {
				track: 1,
				grid: {
					'kick 1': 'x... x... x... x...',
					snare: '.... x... .... x...',
					'closed hat 2': 'x.x. x.x. x.x. x.x.'
				}
			})
		);
		expect(result.written.grid['808 kick']).toBe('x... x... x... x...');
		expect(result.written.grid['808 snare']).toBe('.... x... .... x...');
		expect(result.written.grid['808 closed hat']).toBe('x.x. x.x. x.x. x.x.');
	});

	it('says when the whole closed hat line falls under the open hats', async () => {
		const { run } = setup();
		const result = json(
			await run(writePatternTool, {
				track: 1,
				grid: {
					kick: 'x... x... x... x...',
					'closed hat': '..x. ..x. ..x. ..x.',
					'open hat': '..x. ..x. ..x. ..x.'
				}
			})
		);
		expect(result.written.grid['closed hat 1']).toBeUndefined();
		expect(result.note).toMatch(/The closed hat line is left out entirely/);
	});

	it('reads loud digits back as written, a 9 as X', async () => {
		const { run } = setup();
		const result = json(
			await run(writePatternTool, { track: 1, grid: { snare: '.... .... 3456 7899' } })
		);
		expect(result.written.grid['snare 1']).toBe('.... .... 3456 78XX');
		expect(result.note).toMatch(/Digit 9 \(velocity 127\) reads back as X/);
		// a write at velocity 85 reads its plain hits as x, though 85 is a 6
		const plain = json(
			await run(writePatternTool, { track: 1, velocity: 85, grid: { kick: 'x... x... 6... ....' } })
		);
		expect(plain.written.grid['kick 1']).toBe('x... x... x... ....');
	});

	it('says a track rests in a scene on its empty first pattern, when it plays in another', async () => {
		const { run } = setup();
		await run(writePatternTool, { track: 5, pattern: 2, notes: '1:A4:4' });
		const result = json(
			await run(writeArrangementTool, {
				scenes: [
					{ scene: 1, patterns: [{ track: 5, pattern: 0 }] },
					{ scene: 2, patterns: [{ track: 5, pattern: 2 }] }
				]
			})
		);
		expect(result.arrangement.scenes['scene 1']).toMatch(/^T5 rests \(p1, empty\)/);
		expect(result.arrangement.scenes['scene 2']).toMatch(/^T5 p2/);
	});

	it('undoes a scene’s mix with its patterns', async () => {
		const { env, sim, run } = setup();
		const was = sim.state.tracks[2].mix.level;
		const input = writeArrangementTool.input.parse({
			scenes: [{ scene: 1, patterns: [], mix: [{ track: 3, level: 20, muted: true }] }]
		});
		const before = writeArrangementTool.snapshot!(input, env);
		await run(writeArrangementTool, input);
		expect(sim.state.tracks[2].mix).toMatchObject({ level: 20, muted: true });
		const inverse = writeArrangementTool.inverse!(input, before, env)!;
		await run(writeArrangementTool, inverse.input);
		expect(sim.state.tracks[2].mix).toMatchObject({ level: Math.round(was), muted: false });
	});
});

describe('patterns in another time signature', () => {
	it('defaults to the whole bars of the meter: bars 4 in 7/8 are 56 steps', async () => {
		const { sim, run } = setup();
		sim.state.areas.system.projectSettings.signature = 4; // 7/8
		const result = json(
			await run(writePatternTool, { track: 3, bars: 4, notes: '1:A2:2 15:C3:2 29:E3:2 43:G3:2' })
		);
		expect(result.written.length).toBe(56);
		expect(result.written.reading.bars).toHaveLength(4);
		expect(result.meter).toMatch(
			/^7\/8: bars of 14 steps; this pattern is \d+(\.\d+)? of them \(bars counts bars of 16 steps\)\. The tempo counts quarter notes/
		);
		expect(result.note).toMatch(/Length 56: 4 whole bars of 7\/8/);
		// given, it stands
		const given = json(
			await run(writePatternTool, { track: 4, bars: 4, length: 64, notes: '1:A3:2' })
		);
		expect(given.written.length).toBe(64);
		expect(given.note).not.toMatch(/whole bars/);
	});

	it('counts scenes in bars of the meter: four bars of 7/8 are four, not 3.5', async () => {
		const { sim, run } = setup();
		sim.state.areas.system.projectSettings.signature = 4; // 7/8
		await run(writePatternTool, {
			track: 1,
			pattern: 1,
			bars: 4,
			length: 56,
			grid: { kick: 'x... ..x. .... ..' }
		});
		const arranged = json(
			await run(writeArrangementTool, {
				scenes: [{ scene: 1, patterns: [{ track: 1, pattern: 1 }] }],
				song: { scenes: [1, 1], loop: false }
			})
		);
		expect(arranged.arrangement.scenes['scene 1']).toMatch(/\(4 bars\)/);
		// eight bars of 7/8 at 120: 8 × 14 sixteenths × 0.125 s = 14 s
		expect(arranged.arrangement.song.length).toMatch(/^8 bars, 0:14 at 120 bpm/);
	});

	it('read bar by bar as the project counts them: a 3/4 bar is three beats of four', async () => {
		const { sim, run } = setup();
		sim.state.areas.system.projectSettings.signature = 0; // 3/4
		const drums = json(
			await run(writePatternTool, {
				track: 1,
				pattern: 1,
				bars: 3,
				length: 48,
				grid: { kick: 'x... .... ....' }
			})
		);
		expect(drums.written.grid['kick 1']).toBe(
			'x... .... .... | x... .... .... | x... .... .... | x... .... ....'
		);
		const bass = json(
			await run(writePatternTool, {
				track: 3,
				pattern: 1,
				bars: 3,
				length: 24,
				notes: '1:A2:4 13:E2:4'
			})
		);
		expect(bass.written.reading.bars).toEqual([
			'A2 – – – | · · · · | · · · ·',
			'E2 – – – | · · · · | · · · ·'
		]);
	});
});

describe('write_pattern step components', () => {
	it('puts components on steps, adds them to a pattern as it is, and reads them back', async () => {
		const { virtual, run } = setup();
		const written = json(
			await run(writePatternTool, {
				track: 4,
				pattern: 1,
				notes: '1:C4:2 5:E4:2 9:G4:2 13:B4:2',
				components: [
					{ step: 5, kind: 'random', value: 3 },
					{ step: 13, kind: 'skip trigger' }
				]
			})
		);
		expect(written.written.components).toEqual(['step 5: random 3', 'step 13: skip trigger 2']);
		// alone: onto the pattern as it is
		await run(writePatternTool, {
			track: 4,
			pattern: 1,
			components: [{ step: 9, kind: 'multiply', value: 3 }]
		});
		const p = virtual.readPattern(4, 1);
		expect(p.notes).toHaveLength(4);
		expect(p.components?.map((c) => `${c.step} ${c.kind} ${c.value}`)).toEqual([
			'5 random 3',
			'9 multiply 3',
			'13 skip trigger 2'
		]);
		// a transpose keeps them
		await run(writePatternTool, { track: 4, pattern: 1, transpose: 12 });
		expect(virtual.readPattern(4, 1).components).toHaveLength(3);
	});
});

describe('write_pattern on drums', () => {
	it('fills a shorter pattern by its length, and reads back only the steps that play', async () => {
		const { run } = setup();
		const result = json(
			await run(writePatternTool, {
				track: 1,
				pattern: 1,
				length: 14,
				grid: { kick: 'x... ..x. .... ..', '61': 'x.x.x.x' }
			})
		);
		expect(result.note).not.toMatch(/neither fill/);
		expect(result.written.length).toBe(14);
		expect(result.written.grid['kick 1']).toBe('x... ..x. .... ..');
		// the seven-step hat line plays twice in the fourteen steps
		expect(result.written.grid['closed hat 1']).toBe('x.x. x.xx .x.x .x');
	});

	it('writes chords by name, voiced smoothly, each lasting until the next', async () => {
		const { run } = setup();
		const result = json(
			await run(writePatternTool, {
				track: 7,
				pattern: 1,
				bars: 4,
				key: 'A minor',
				chords: '1:Am 17:F 33:C 49:G'
			})
		);
		expect(result.written.reading.progression).toMatch(/^Am F C G: i ♭VI ♭III ♭VII in A minor/);
		// A3 C4 E4 is 57 60 64; each until the next chord, the last to its bar's end
		expect(result.written.notes).toBe(
			'1:A3+C4+E4:16:100 17:A3+C4+F4:16:100 33:G3+C4+E4:16:100 49:G3+B3+D4:16:100'
		);
		// the strings' long release rings each chord on under the next (read as sus chords once)
		expect(result.note).toMatch(
			/T7's amp release \(\d+ on its page, where a lower value lasts longer\) takes \d+(\.\d)? s to die away \(120 bpm\), so each chord rings on under the next/
		);
		const bad = await run(writePatternTool, { track: 7, chords: '1:Hm7' });
		expect(bad.isError).toBe(true);
		expect(String(bad.content)).toMatch(/"Hm7" is not a chord name/);
	});

	it('carries the key through a transpose instead of guessing it afresh', async () => {
		// G D A Bm transposed from A minor read as D major, and an agent named the key change wrong
		const { run } = setup();
		await run(writePatternTool, {
			track: 7,
			bars: 4,
			key: 'A minor',
			chords: '1:Am 17:F 33:C 49:G'
		});
		const up = json(await run(writePatternTool, { track: 7, transpose: 2 }));
		expect(up.written.reading.key).toBe('B minor (A minor moved up 2 semitones)');
		// and again from there
		const again = json(await run(writePatternTool, { track: 7, transpose: 3 }));
		expect(again.written.reading.key).toBe('D minor (B minor moved up 3 semitones)');
		// a write that moves no note keeps the key named (E dorian humanized read back as E minor)
		await run(writePatternTool, {
			track: 5,
			key: 'E dorian',
			notes: '1:E4:2 3:F#4:2 5:G4:2 7:C#5:2'
		});
		const loose = json(await run(writePatternTool, { track: 5, humanize: { timing: 0.05 } }));
		expect(loose.written.reading.key).toBe('E dorian (as written)');
		// and read back alone (a D dorian line read back was guessed afresh as D minor)
		const read = json(await run(readPatternTool, { track: 5 }));
		expect(read.reading.key).toBe('E dorian (as written)');
		// with no key named, the estimate moves as consistently
		await run(writePatternTool, { track: 4, bars: 4, chords: '1:C 17:G 33:Am 49:F' });
		const estimated = json(await run(writePatternTool, { track: 4, transpose: -2 }));
		expect(estimated.written.reading.key).toBe('Bb major (C major moved down 2 semitones)');
	});

	it('reads a line already there against chords written over it', async () => {
		// chords over a one-bar riff: the clash in bar 4 was found only when the user asked
		const { run } = setup();
		await run(writePatternTool, {
			track: 3,
			key: 'E minor',
			notes: '1:E2:2 3:E2:1 5:G2:2 7:E2:1 9:D2:2 11:E2:1 13:B1:2 15:D2:2'
		});
		const chords = json(
			await run(writePatternTool, { track: 7, key: 'E minor', chords: '1:Em 17:C 33:G 49:D' })
		);
		// the G under D/F# rubs (a half step above its F#); the D under Em is a 7th, a colour
		expect(chords.note).toMatch(
			/T3's line against these chords: 17 of the 32 notes over T7's chords \(the line plays 4 times under them\) are chord tones; on a beat and outside the chord \(1 a half step above a chord tone, which rubs; .*\): .*bar 1 step 9: D2 over Em\/G \(E G B\), .*bar 4 step 5: G2 over D\/F# \(D F# A, a half step above its F#\)/
		);
	});

	it('reads a part to come against the other tracks’ patterns of its number', async () => {
		const { run } = setup();
		await run(writePatternTool, { track: 3, pattern: 2, stay: true, notes: '1:A1:16' });
		const chords = json(
			await run(writePatternTool, { track: 7, pattern: 2, stay: true, notes: '1:C4+E4+G4:16' })
		);
		expect(chords.written.reading.chords[0]).toMatch(/over T3's A/);
	});

	it('starts a pattern from a copy of another, alone or with one bar written anew', async () => {
		const { virtual, run } = setup();
		await run(writePatternTool, { track: 3, bars: 4, notes: '1:A1:4 17:F1:4 33:C2:4 49:G1:4' });
		// a bar of the copy changed, the source left alone
		const fill = json(
			await run(writePatternTool, {
				track: 3,
				pattern: 2,
				copy: 1,
				stay: true,
				bar: 4,
				notes: '1:G1:2 5:A1:2 9:B1:2 13:D2:2'
			})
		);
		const copied = virtual.readPattern(3, 2).notes.map((n) => `${n.step}:${n.note}`);
		expect(copied).toEqual(['1:33', '17:29', '33:36', '49:31', '53:33', '57:35', '61:38']);
		expect(virtual.readPattern(3, 1).notes).toHaveLength(4);
		expect(fill.note).toMatch(/Pattern 2 started from a copy of pattern 1, bar 4 written anew/);
		// alone, the copy is whole
		await run(writePatternTool, { track: 3, pattern: 3, copy: 1, stay: true });
		expect(virtual.readPattern(3, 3).notes).toEqual(virtual.readPattern(3, 1).notes);
		expect(virtual.readPattern(3, 3).bars).toBe(4);
		// a bar of the copy cleared, as the arrangement skill says (the drums out for one bar)
		await run(writePatternTool, { track: 3, pattern: 4, copy: 1, stay: true, bar: 1, notes: '' });
		expect(virtual.readPattern(3, 4).notes.map((n) => n.step)).toEqual([17, 33, 49]);
		expect(virtual.readPattern(3, 4).bars).toBe(4);
	});

	it('copies a pattern from another track of its kind, and refuses one of another kind', async () => {
		const { virtual, run } = setup();
		await run(writePatternTool, {
			track: 1,
			grid: { kick: 'x... x... x... x...', snare: '.... x... .... x...' }
		});
		const copy = json(await run(writePatternTool, { track: 2, copy_track: 1 }));
		expect(virtual.readPattern(2).notes.map((n) => `${n.step}:${n.note}`)).toEqual(
			virtual.readPattern(1).notes.map((n) => `${n.step}:${n.note}`)
		);
		expect(copy.note).toMatch(
			/Pattern 1 started from a copy of T1's pattern 1; T1's pattern 1 is as it was\. Its hits keep their keys, so T2's own kit plays them\./
		);
		// a variation: bar 1 of the copy written anew, T1 left alone
		await run(writePatternTool, {
			track: 2,
			copy_track: 1,
			bar: 1,
			grid: { kick: 'x.x. x.x. x.x. x.x.' }
		});
		expect(virtual.readPattern(2).notes.filter((n) => n.note === 53)).toHaveLength(8);
		expect(virtual.readPattern(1).notes.filter((n) => n.note === 53)).toHaveLength(4);
		// drums onto a bass would play as other notes
		const across = await run(writePatternTool, { track: 3, copy_track: 1 });
		expect(across.isError).toBe(true);
		expect(String(across.content)).toMatch(/T1 is a drum track and T3 is not one/);
	});

	it('keeps a pattern’s locks and a live take’s timing through writes that start from it', async () => {
		const { sim, virtual, run } = setup();
		await run(writePatternTool, { track: 3, bars: 2, notes: '1:A1:2 7:C2:2 17:E2:2 23:G2:2' });
		const steps = () => sim.state.tracks[2].sequence.patterns[0].steps;
		// a lock on step 7, as plan_steps with step leaves it
		steps()[6].locks = { cutoff: 40 };
		// bar 2 written alone: bar 1's lock stays
		await run(writePatternTool, { track: 3, bar: 2, notes: '1:F2:2 7:A2:2' });
		expect(virtual.readPattern(3).locks).toEqual([{ step: 7, values: ['cutoff 40'] }]);
		// step 23 played a little late, as a live take leaves it; a transpose keeps that and the lock
		steps()[22].notes[0].offset = 0.125;
		const up = json(await run(writePatternTool, { track: 3, transpose: 12 }));
		expect(virtual.readPattern(3).notes.find((n) => n.step === 23)?.offset).toBe(0.125);
		expect(up.written.locks).toEqual(['step 7: cutoff 40']);
		expect(up.written.offGrid).toMatch(
			/^1 note off the grid .*: step 23 \+0\.13; \d+ on the grid$/
		);
		// a whole rewrite drops them, and says so
		const anew = json(await run(writePatternTool, { track: 3, notes: '1:D2:4' }));
		expect(virtual.readPattern(3).locks).toBeUndefined();
		expect(anew.note).toMatch(
			/The locks on step 7 \(cutoff 40\) went with the notes this write replaced/
		);
	});

	it('copies one bar of a pattern alone as a pattern of one bar', async () => {
		const { virtual, run } = setup();
		await run(writePatternTool, {
			track: 3,
			bars: 4,
			notes: '1:A1:4 17:F1:4 33:C2:4 37:E2:2 49:G1:4'
		});
		const third = json(
			await run(writePatternTool, { track: 3, pattern: 2, copy: 1, copy_bar: 3, stay: true })
		);
		const p = virtual.readPattern(3, 2);
		expect(p.bars).toBe(1);
		expect(p.notes.map((n) => `${n.step}:${n.note}`)).toEqual(['1:36', '5:40']);
		expect(third.note).toMatch(
			/Pattern 2 started from a copy of bar 3 of pattern 1; pattern 1 is as it was/
		);
		// a bar the source does not have
		const none = await run(writePatternTool, { track: 3, pattern: 3, copy: 2, copy_bar: 2 });
		expect(String(none.content)).toMatch(/pattern 2 has 1 bar, so there is no bar 2 to copy/);
	});

	it('loosens a pattern as a player would, the hats alone, and lets the notes play off the grid', async () => {
		const { virtual, run } = setup();
		await run(writePatternTool, {
			track: 1,
			grid: { kick: 'x... x... x... x...', 'closed hat': 'x.x. x.x. x.x. x.x.' }
		});
		const start = virtual.checkpoint();
		const loose = json(
			await run(writePatternTool, {
				track: 1,
				humanize: { timing: 0.1, velocity: 12, sounds: ['closed hat'] }
			})
		);
		const notes = virtual.readPattern(1).notes;
		const hats = notes.filter((n) => n.note === 61);
		const kicks = notes.filter((n) => n.note === 53);
		// the kicks as they were, the hats moved a little, none more than asked
		expect(kicks.every((n) => !n.offset && n.velocity === 100)).toBe(true);
		expect(hats.some((n) => n.offset)).toBe(true);
		expect(
			hats.every((n) => Math.abs(n.offset ?? 0) <= 0.1 && Math.abs(n.velocity - 100) <= 12)
		).toBe(true);
		// a hat on a beat drifts half as far, and none plays before the first step
		expect(
			hats.filter((n) => (n.step - 1) % 4 === 0).every((n) => Math.abs(n.offset ?? 0) <= 0.05)
		).toBe(true);
		expect((hats.find((n) => n.step === 1)?.offset ?? 0) >= 0).toBe(true);
		expect(loose.note).toMatch(
			/Loosened 8 notes: up to 0\.1 of a step off the grid \(the beats half that\), velocities up to 12 either way; the pattern's quantise 100 → 0/
		);
		expect(loose.written.quantise).toBe(0);
		// which sounds moved, the rest on the grid (an agent could not confirm the hats alone)
		expect(loose.written.offGrid).toMatch(
			/^\d+ notes? \(closed hat 1\) off the grid .*the notes on the grid stay there/
		);
		expect(virtual.changesSince(start).join(' ')).toMatch(/quantise 100 → 0/);
		// a sound the kit lacks is refused
		const none = await run(writePatternTool, {
			track: 1,
			humanize: { timing: 0.1, sounds: ['kazoo'] }
		});
		expect(String(none.content)).toMatch(/"kazoo" is no sound of this track/);
	});

	it('says where a bass hits with the kick', async () => {
		const { run } = setup();
		await run(writePatternTool, { track: 1, grid: { kick: 'x... x... x... x...' } });
		const bass = json(
			await run(writePatternTool, {
				track: 3,
				bars: 2,
				notes: '1:A1:2 3:A1:2 9:C2:2 19:E2:2 25:G1:2'
			})
		);
		expect(bass.note).toMatch(
			/It hits with T1's kick on steps 1, 9, 25 \(3 of its 5 steps\): together is a style choice, nothing to fix/
		);
		// a lead high above it says nothing of the kick
		const lead = json(await run(writePatternTool, { track: 5, notes: '1:C5:2 9:E5:2' }));
		expect(lead.note).not.toMatch(/kick/);
	});

	it('plays a pattern backwards, alone or into a copy', async () => {
		const { virtual, run } = setup();
		// C4 for two steps, E4 for one, G4 for four, in a bar of 16
		await run(writePatternTool, { track: 5, notes: '1:C4:2 5:E4:1 9:G4:4' });
		const back = json(
			await run(writePatternTool, { track: 5, pattern: 2, copy: 1, reverse: true, stay: true })
		);
		expect(back.written.notes).toBe('5:G4:4:100 12:E4:1:100 15:C4:2:100');
		expect(back.note).toMatch(/Reversed: the notes play backwards/);
		// the source as it was
		expect(json(await run(readPatternTool, { track: 5, pattern: 1 })).notes).toBe(
			'1:C4:2:100 5:E4:1:100 9:G4:4:100'
		);
		// backwards twice is forwards
		await run(writePatternTool, { track: 5, pattern: 2, reverse: true, stay: true });
		expect(virtual.readPattern(5, 2).notes.map((n) => n.step)).toEqual([1, 5, 9]);
		// a beat mirrors about the downbeat: the kick stays on 1, a fill on 15–16 opens the bar
		await run(writePatternTool, {
			track: 1,
			grid: { kick: 'x... .... x... ....', snare: '.... x... .... x.xx' }
		});
		const beat = json(await run(writePatternTool, { track: 1, reverse: true }));
		expect(beat.written.grid).toEqual({
			'kick 1': 'x... .... x... ....',
			'snare 1': '.xx. x... .... x...'
		});
		expect(beat.note).toMatch(
			/Reversed about the downbeat: step 1 stays and step n goes to 18 − n \(16 → 2, 5 → 13\)/
		);
	});

	it('says when chords land on a mono track, and components on steps with no notes', async () => {
		const { run } = setup();
		// T3, the bass, plays mono in a new project
		const chords = json(await run(writePatternTool, { track: 3, chords: '1:Am 9:F' }));
		expect(chords.note).toMatch(
			/T3 plays mono \(its play mode, shift M2\), so a chord sounds one note/
		);
		// single notes running into the next: mono cuts them
		const overlap = json(await run(writePatternTool, { track: 3, notes: '1:A1:6 5:C2:4 13:E2:2' }));
		expect(overlap.note).toMatch(
			/T3 plays mono, so where a note runs on into the next \(1 time here\), the next cuts it off/
		);
		const rolls = json(
			await run(writePatternTool, {
				track: 1,
				grid: { 'closed hat': 'x.x. x.x. x.x. x.x.' },
				components: [
					{ step: 13, kind: 'multiply', value: 3 },
					{ step: 14, kind: 'multiply', value: 3 }
				]
			})
		);
		expect(rolls.note).toMatch(
			/Step 14 holds no notes, so its component was left out: a component plays only on a step with notes/
		);
		// left out, so nothing waits on the rest for a later note to wake
		expect(rolls.written.components).toEqual(['step 13: multiply 3']);
		// on a step two sounds share, both take it
		const roll = json(
			await run(writePatternTool, {
				track: 1,
				grid: { snare: '.... .... .... ..xx', 'closed hat': 'x.x. x.x. x.x. x.x.' },
				components: [
					{ step: 15, kind: 'multiply', value: 3 },
					{ step: 16, kind: 'multiply', value: 4 }
				]
			})
		);
		expect(roll.note).toMatch(
			/A component is the whole step's on a drum track, so it reaches every sound there: step 15: (snare 1, closed hat 1|closed hat 1, snare 1)\./
		);
	});

	it('merges one bar: the sounds the grid names change there, the bar keeps the rest', async () => {
		// a snare fill merged into bar 2 once took that bar's kick and hats with it
		const { run } = setup();
		await run(writePatternTool, {
			track: 1,
			bars: 2,
			grid: {
				kick: 'x... x... x... x... | x... x... x... x...',
				'closed hat': 'x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.x.'
			}
		});
		const fill = json(
			await run(writePatternTool, {
				track: 1,
				bar: 2,
				merge: true,
				grid: { snare: '.... x... .... x.xx' }
			})
		);
		expect(fill.written.grid).toEqual({
			'kick 1': 'x... x... x... x... | x... x... x... x...',
			'snare 1': '.... .... .... .... | .... x... .... x.xx',
			'closed hat 1': 'x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.x.'
		});
	});

	it('writes a harmony in the key by scale steps, from another track', async () => {
		const { run } = setup();
		await run(writePatternTool, {
			track: 5,
			key: 'D major',
			notes: '1:F#4:2 3:A4:2 5:B4:3 8:A4:1 9:F#4:2 11:E4:2 13:D4:4'
		});
		const sixth = json(
			await run(writePatternTool, { track: 6, copy_track: 5, scale_steps: -5, key: 'D major' })
		);
		expect(sixth.written.notes).toBe(
			'1:A3:2:100 3:C#4:2:100 5:D4:3:100 8:C#4:1:100 9:A3:2:100 11:G3:2:100 13:F#3:4:100'
		);
		expect(sixth.note).toMatch(/Moved 7 notes a sixth down along D major's scale \(5 steps\)/);
		expect(sixth.note).toMatch(
			/Against T5's line on the same steps \(7 of its 7 notes\): a sixth below throughout/
		);
		// a copy at another velocity (a soft pad copied from the strings kept theirs), and velocity
		// alone onto the pattern as it is
		const soft = json(
			await run(writePatternTool, { track: 8, copy_track: 5, transpose: 12, velocity: 60 })
		);
		expect(soft.written.notes).toBe(
			'1:F#5:2:60 3:A5:2:60 5:B5:3:60 8:A5:1:60 9:F#5:2:60 11:E5:2:60 13:D5:4:60'
		);
		const louder = json(await run(writePatternTool, { track: 8, velocity: 90 }));
		expect(louder.written.notes).toMatch(/^1:F#5:2:90 3:A5:2:90 /);
		const keyless = await run(writePatternTool, { track: 6, scale_steps: 2 });
		expect(keyless.isError).toBe(true);
		expect(String(keyless.content)).toMatch(
			/scale_steps moves notes along a key's scale, so give key too/
		);
	});

	it('says when patterns of other lengths drift while the scene repeats', async () => {
		const { run } = setup();
		await run(writePatternTool, {
			track: 1,
			bars: 4,
			grid: { kick: 'x... .... x... ....', 'closed hat': 'x.x. x.x. x.x. x.x.' }
		});
		const bass = json(
			await run(writePatternTool, {
				track: 3,
				bars: 3,
				length: 48,
				notes: '1:A1:3 17:G1:3 33:F1:3'
			})
		);
		expect(bass.note).toMatch(
			/Its 48 steps loop on their own against T1.s 64: while the scene loops on its own they drift and line up again every 192 steps \(12 bars\); in a song, every entry \(the same scene again too\) starts every track on its first step/
		);
		expect(bass.note).toMatch(/on the first pass: their lengths differ/);
	});

	it('reads a harmony against the line it moves with', async () => {
		const { run } = setup();
		await run(writePatternTool, {
			track: 5,
			key: 'G major',
			notes: '1:B4:2 3:D5:2 5:G5:4 9:F#5:2'
		});
		const harmony = json(
			await run(writePatternTool, {
				track: 6,
				key: 'G major',
				notes: '1:D5:2 3:F#5:2 5:B5:4 9:A5:2'
			})
		);
		expect(harmony.note).toMatch(
			/Against T5's line on the same steps \(4 of its 4 notes\): a third above throughout \(2 minor, 2 major\)/
		);
	});

	it('says which notes slide on a legato track with portamento up', async () => {
		const { sim, run } = setup();
		// T5 plays legato in a new project; its portamento up
		sim.state.tracks[4].playMode.portamento = 20;
		const line = json(
			await run(writePatternTool, { track: 5, notes: '1:A3:2.5 3:C4:2 5:E4:2 9:A4:4' })
		);
		expect(line.note).toMatch(
			/T5 plays legato with portamento 20: the notes on step 1 run past the next one's start and slide into it\. Those on step 3 end just where the next begins/
		);
	});

	it('takes a step component off with none, and a later one of a kind replaces it', async () => {
		const { run } = setup();
		await run(writePatternTool, {
			track: 1,
			grid: { 'closed hat': 'x.x. x.x. x.x. x.x.' },
			components: [
				{ step: 5, kind: 'multiply', value: 3 },
				{ step: 9, kind: 'multiply', value: 4 },
				{ step: 9, kind: 'random', value: 2 }
			]
		});
		const off = json(
			await run(writePatternTool, {
				track: 1,
				components: [
					{ step: 9, kind: 'none' },
					{ step: 5, kind: 'multiply', value: 6 }
				]
			})
		);
		expect(off.written.components).toEqual(['step 5: multiply 6']);
		expect(off.written.noteCount).toBe(8);
	});

	it('gives a pattern its own groove, confirmed and undone with it', async () => {
		const { sim, env, run } = setup();
		sim.state.tempo.groove = 0; // shuffle, at the tempo page's 0: straight
		const input = writePatternTool.input.parse({
			track: 1,
			pattern: 2,
			stay: true,
			groove: 60,
			grid: { kick: 'x... x... x... x...', 'closed hat': 'xxxx xxxx xxxx xxxx' }
		});
		const before = writePatternTool.snapshot!(input, env);
		const result = json(await run(writePatternTool, input));
		expect(sim.state.tracks[0].sequence.patterns[1].groove).toBe(60);
		// pattern 1 keeps the tempo page's: only this one swings
		expect(sim.state.tracks[0].sequence.patterns[0].groove).toBe(0);
		expect(result.note).toMatch(
			/The groove \(shuffle, \+60, this pattern's own\) moves 8 of T1's 20 notes/
		);
		const inverse = writePatternTool.inverse!(input, before, env)!;
		await run(writePatternTool, inverse.input);
		expect(sim.state.tracks[0].sequence.patterns[1].groove).toBe(0);
		expect(sim.state.tracks[0].sequence.current).toBe(0);
	});

	it('says when the groove moves none of the notes', async () => {
		const { sim, run } = setup();
		sim.state.tempo.groove = 0; // shuffle
		sim.state.tempo.swing = 35;
		const straight = json(
			await run(writePatternTool, {
				track: 1,
				grid: { kick: 'x... x... x... x...', 'closed hat': 'x.x. x.x. x.x. x.x.' }
			})
		);
		expect(straight.note).toMatch(/The groove \(shuffle, \+35\) moves none of T1's notes/);
		// one hit a bar on an even sixteenth: hardly a swing, said too
		const few = json(
			await run(writePatternTool, {
				track: 1,
				grid: { kick: 'x... x... x... x...', 'closed hat': 'x.x. x.x. x.x. x.xx' }
			})
		);
		expect(few.note).toMatch(/moves only 1 of T1's 13 notes \(on step 16\), so it hardly swings/);
		const swung = json(
			await run(writePatternTool, {
				track: 1,
				grid: { kick: 'x... x... x... x...', 'closed hat': 'xxxx xxxx xxxx xxxx' }
			})
		);
		expect(swung.note).not.toMatch(/moves none|hardly swings/);
		// kicks and snares between the eighths swing, the hats on them do not: said by sound
		const kicks = json(
			await run(writePatternTool, {
				track: 1,
				grid: {
					kick: 'x..x ..x. .x.x ..x.',
					snare: '.... x..x .... x...',
					'closed hat': 'x.x. x.x. x.x. x.x.'
				}
			})
		);
		expect(kicks.note).toMatch(
			/moves 4 of T1's 17 notes: kick 1 3 of 6 \(steps 4 10 12\), snare 1 1 of 3 \(step 8\); none of closed hat 1's 8, which plays straight: shuffle moves the even sixteenths/
		);
		expect(kicks.note).toMatch(/Say only what swings/);
		sim.state.tempo.swing = 0;
		const none = json(
			await run(writePatternTool, { track: 1, grid: { kick: 'x... x... x... x...' } })
		);
		expect(none.note).not.toMatch(/moves none/);
	});

	it('repeats the notes given until the pattern is full', async () => {
		const { run } = setup();
		const result = json(
			await run(writePatternTool, { track: 3, bars: 4, repeat: true, notes: '1:A2:4 9:C3:4' })
		);
		const steps = (result.written.notes as string).split(' ').map((w) => Number(w.split(':')[0]));
		expect(steps).toEqual([1, 9, 17, 25, 33, 41, 49, 57]);
	});

	it('merges grid lines into the pattern, the other sounds kept', async () => {
		const { run } = setup();
		await run(writePatternTool, {
			track: 1,
			bars: 2,
			grid: {
				kick: 'x... x... x... x...',
				snare: '.... x... .... x...',
				'open hat': '..x. ..x. ..x. ..x.'
			}
		});
		const merged = json(
			await run(writePatternTool, {
				track: 1,
				merge: true,
				grid: { cowbell: '..x. ..x. ..x. ..x.', 'open hat': '.... .... .... ....' }
			})
		);
		// two bars still, kick and snare kept, the cowbell added, the open hat cleared
		expect(merged.written.bars).toBe(2);
		expect(merged.written.grid['kick 1']).toBe('x... x... x... x... | x... x... x... x...');
		expect(merged.written.grid['snare 1']).toBe('.... x... .... x... | .... x... .... x...');
		expect(merged.written.grid['cowbell 1']).toBe('..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x.');
		expect(merged.written.grid['open hat 1']).toBeUndefined();
	});

	it('sets the track scale alone with the notes kept, and says so in the changes', async () => {
		const { virtual, run } = setup();
		await run(writePatternTool, { track: 3, notes: '1:A1:3 7:A1:2 11:C2:2' });
		const start = virtual.checkpoint();
		const slower = json(await run(writePatternTool, { track: 3, scale: '2' }));
		expect(slower.written.scale).toBe('2');
		expect(slower.written.notes).toBe('1:A1:3:100 7:A1:2:100 11:C2:2:100');
		expect(slower.written.lasts).toBe('2 bars of time at track scale 2, 4 s at 120 bpm');
		expect(virtual.changesSince(start)).toEqual(['T3 pattern 1: track scale 1 → 2']);
	});

	it('writes a pattern for a part to come and leaves the track on its own with stay', async () => {
		const { virtual, run } = setup();
		await run(writePatternTool, { track: 3, notes: '1:A1:4' });
		const later = json(
			await run(writePatternTool, { track: 3, pattern: 2, stay: true, notes: '1:A1:2 3:A1:2' })
		);
		expect(virtual.status().tracks[2].current).toBe(1);
		expect(later.note).toMatch(/T3 still plays pattern 1: pattern 2 waits/);
		expect(later.note).not.toMatch(/plays pattern 2 now/);
		// without stay the track moves on, and the pattern it played is still there
		const next = json(await run(writePatternTool, { track: 3, pattern: 3, notes: '1:E2:4' }));
		expect(next.note).toMatch(
			/T3 plays pattern 3 now; pattern 1, which it played, is still on the track as it was\./
		);
		// with scenes, the scenes' sentence alone
		virtual.writeArrangement({ scenes: [{ scene: 2, patterns: [{ track: 3, pattern: 2 }] }] });
		const unplayed = json(
			await run(writePatternTool, { track: 3, pattern: 4, stay: true, notes: '1:G2:4' })
		);
		expect(unplayed.note).toMatch(/none plays this pattern yet: write_arrangement puts it in one/);
		expect(unplayed.note).not.toMatch(/waits until/);
	});

	it('takes one sound out with a merged line of rests, and keeps the others', async () => {
		const { virtual, run } = setup();
		await run(writePatternTool, {
			track: 1,
			grid: {
				kick: 'x... x... x... x...',
				clap: '.... x... .... x...',
				'closed hat': 'x.x. x.x. x.x. x.x.'
			}
		});
		const out = json(
			await run(writePatternTool, { track: 1, merge: true, grid: { clap: '....' } })
		);
		const sounds = new Set(virtual.readPattern(1).notes.map((n) => n.sound));
		expect([...sounds].sort()).toEqual(['closed hat 1', 'kick 1']);
		expect(virtual.readPattern(1).notes).toHaveLength(12);
		expect(out.note).toMatch(/clap: no hits, so the merge took that sound out and kept the others/);
	});

	it('leaves a merged closed hat out under an open hat the pattern keeps', async () => {
		const { run } = setup();
		await run(writePatternTool, {
			track: 1,
			grid: { kick: 'x... x... x... x...', 'open hat': '.... .... .... ..x.' }
		});
		const merged = json(
			await run(writePatternTool, {
				track: 1,
				merge: true,
				grid: { 'closed hat': 'x.x. x.x. x.x. x.x.' }
			})
		);
		expect(merged.written.grid['closed hat 1']).toBe('x.x. x.x. x.x. x...');
		expect(merged.written.grid['open hat 1']).toBe('.... .... .... ..x.');
		expect(merged.note).toMatch(
			/Closed hat left out on step 15 \(4& of bar 1\), under the open hat: the grid keeps one hat a step/
		);
		expect(merged.note).not.toMatch(/both hit/);
	});

	it('says how long a pattern lasts at another track scale', async () => {
		const { run } = setup();
		const fast = json(
			await run(writePatternTool, { track: 4, bars: 4, scale: '1/2', notes: '1:A3 64:C4' })
		);
		expect(fast.written.lasts).toBe('2 bars of time at track scale 1/2, 4 s at 120 bpm');
		const plain = json(await run(writePatternTool, { track: 5, bars: 1, notes: '1:A3' }));
		expect(plain.written.lasts).toBeUndefined();
	});

	it('says when a line shorter than a bar repeats to fill the pattern', async () => {
		const { run } = setup();
		const result = json(
			await run(writePatternTool, {
				track: 1,
				pattern: 1,
				bars: 2,
				grid: { kick: 'x... x... x... x...', crash: 'x...' }
			})
		);
		expect(result.note).toMatch(
			/Lines shorter than a bar repeat to fill the pattern: crash \(4 steps, 8 times\)/
		);
		expect(result.note).not.toMatch(/kick \(/);
	});

	it('says a grid line of rests alone plays nothing', async () => {
		const { run } = setup();
		const result = json(
			await run(writePatternTool, {
				track: 1,
				pattern: 1,
				grid: { kick: 'x... x... x... x...', 'open hat': '.... .... .... ....' }
			})
		);
		expect(result.note).toMatch(/open hat: no hits, so it plays nothing here/);
		expect(Object.keys(result.written.grid)).toEqual(['kick 1']);
	});

	it('leaves a grid’s closed hat out under the open hat, and says where', async () => {
		const { run } = setup();
		const result = json(
			await run(writePatternTool, {
				track: 1,
				pattern: 1,
				grid: { '61': 'x.x. x.x. x.x. x.x.', '63': '..x. ..x. .... ....' }
			})
		);
		expect(result.note).toMatch(
			/Closed hat left out on steps 3 \(1& of bar 1\), 7 \(2& of bar 1\), under the open hat: the grid keeps one hat a step, as a drummer plays them \(not a limit of the OP-XY/
		);
		expect(result.written.grid['closed hat 1']).toBe('x... x... x.x. x.x.');
		expect(result.note).not.toMatch(/both hit/);
	});

	it('says where a closed and an open hat written as notes hit on one step', async () => {
		const { run } = setup();
		const result = json(
			await run(writePatternTool, { track: 1, pattern: 1, notes: '3:61 3:63 7:61 7:63' })
		);
		expect(result.note).toMatch(
			/A closed and an open hat both hit on steps 3 \(1& of bar 1\), 7 \(2& of bar 1\):/
		);
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
		const { sim, virtual, run } = setup();
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
		// a rest reads as one
		const rest = json(
			await run(writeArrangementTool, {
				scenes: [{ scene: 3, patterns: [{ track: 1, pattern: 0 }] }]
			})
		);
		expect(rest.arrangement.scenes['scene 3']).toBe('T1 rests (p3, empty); the rest p1 (1 bar)');
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
		// where the playhead is: the song's second entry, the scene's first bar
		expect(virtual.readArrangement().at).toEqual({ bar: 1, entry: 2 });
	});

	it('says on play when the metronome clicks along', async () => {
		const { run } = setup();
		await run(writePatternTool, { track: 1, notes: '1:53' });
		const clicking = json(await run(transportTool, { action: 'play' }));
		expect(clicking.metronome).toMatch(/^on: it is clicking along under the music now/);
		await run(setMetronomeTool, { on: false });
		const quiet = json(await run(transportTool, { action: 'play' }));
		expect(quiet.metronome).toBeUndefined();
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

	it('says when a scene cuts a shorter pattern’s last loop off in the song', async () => {
		// two-bar chords under a three-bar melody, the scene four times: each entry restarts them
		const { run } = setup();
		await run(writePatternTool, { track: 7, bars: 2, notes: '1:C4+E4+G4:16 17:F4+A4+C5:16' });
		await run(writePatternTool, { track: 5, bars: 3, notes: '1:C5:4 17:D5:4 33:E5:4' });
		const song = json(
			await run(writeArrangementTool, { song: { scenes: [1, 1, 1, 1], loop: false } })
		);
		expect(song.cutOff).toBe(
			"scene 1 (3 bars): T7's 2 bars play 1.5 times, the last pass cut off when the song moves on: each song entry, the same scene again too, starts every track on its first step. Patterns that divide the scene's length play whole."
		);
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
	it('reads chords given by name by those names, inverted where voiced so', async () => {
		const { run } = setup();
		const result = json(
			await run(writePatternTool, {
				track: 7,
				key: 'C major',
				chords: '1:Fmaj9:16:60 17:Em7:16:60 33:Dm9:16:60 49:Cmaj9:16:60'
			})
		);
		const chords = result.written.reading.chords.join(' | ');
		// the Em7 voiced over its G is Em7/G, not G6
		expect(chords).toMatch(/step 17: Em7(\/G)? \(/);
		expect(chords).not.toMatch(/G6/);
		expect(result.written.reading.progression).toMatch(/^Fmaj9 Em7 Dm9 Cmaj9: /);
		// humanized, every chord's offsets by step, low note to high, and how many stayed on the grid
		const loose = json(await run(writePatternTool, { track: 7, humanize: { timing: 0.08 } }));
		expect(loose.written.offGrid).toMatch(
			/off the grid .*: step 1 [+−]\d\.\d\d( [+−]\d\.\d\d){1,4}, step 17 .* \(a step's notes low to high\)(; \d+ on the grid)?$/
		);
		// and by them after: a groove change, a read (an Em7 read back as G6 after a groove)
		const grooved = json(await run(writePatternTool, { track: 7, groove: 30 }));
		expect(grooved.written.reading.progression).toMatch(/^Fmaj9 Em7 Dm9 Cmaj9: /);
		const read = json(await run(readPatternTool, { track: 7 }));
		expect(read.reading.progression).toMatch(/^Fmaj9 Em7 Dm9 Cmaj9: /);
		// one bar rewritten by name keeps the others' names
		const bar = json(await run(writePatternTool, { track: 7, bar: 2, chords: '1:Am7:16:60' }));
		expect(bar.written.reading.progression).toMatch(/^Fmaj9 Am7 Dm9 Cmaj9: /);
		// notes written without names: the reading names them afresh
		const plain = json(await run(writePatternTool, { track: 7, notes: '17:G3+B3+D4+E4:16' }));
		expect(plain.written.reading.chords.join(' | ')).not.toMatch(/Em7/);
	});

	it('says how the reading spells sharps given in a flat key', async () => {
		const { run } = setup();
		const result = json(
			await run(writePatternTool, {
				track: 3,
				key: 'F minor',
				notes: '1:F2:3 5:G#2:2 9:A#2:2 13:C3:2'
			})
		);
		expect(result.written.reading.spelled).toBe(
			'G# A# read as Ab Bb, as F minor spells them (the same notes)'
		);
	});

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
		// a clear keeps the pattern's bars (clearing four bars of chords left one)
		await run(writePatternTool, { track: 4, bars: 4, notes: '1:C4+E4+G4:16 49:F4+A4+C5:16' });
		const cleared = json(await run(writePatternTool, { track: 4, notes: '' }));
		expect(cleared.written).toMatchObject({ bars: 4, length: 64, noteCount: 0 });
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
		// a line that neither fills nor divides it is a miscount: nothing is written
		const notes = currentPattern(sim.state.tracks[0].sequence).steps.flatMap((s) => s.notes).length;
		const short = await run(writePatternTool, {
			track: 1,
			bars: 2,
			grid: { kick: 'x... '.repeat(7) + 'x.' }
		});
		expect(short.isError).toBe(true);
		expect(String(short.content)).toMatch(
			/Nothing was written: grid lines that neither fill the pattern's 32 steps .*kick has 30/
		);
		expect(currentPattern(sim.state.tracks[0].sequence).steps.flatMap((s) => s.notes)).toHaveLength(
			notes
		);
		// a line run together says how to find the miscount; a line of rests alone may be any length
		const together = await run(writePatternTool, {
			track: 1,
			bars: 2,
			grid: { kick: 'x......x..x....x.....x...x..x..', 'open hat': '.'.repeat(30) }
		});
		expect(String(together.content)).toMatch(
			/kick has 31 \(run together: with a space after every four marks, a beat each, a miscount shows\)\./
		);
		expect(String(together.content)).not.toMatch(/open hat has/);
		// rests past the end lose nothing, so they are dropped
		const long = await run(writePatternTool, {
			track: 1,
			bars: 1,
			grid: { kick: 'x... x... x... x... ....' }
		});
		expect(long.isError).toBeFalsy();
		// unless a group is miscounted: the hits after it moved (an open hat a step late)
		const shifted = await run(writePatternTool, {
			track: 1,
			bars: 1,
			grid: { 'open hat': '..... .... .... ..x.' }
		});
		expect(shifted.isError).toBe(true);
		expect(String(shifted.content)).toMatch(
			/open hat has 17 \(group 1 \("\.\.\.\.\."\) has 5, the others 4\), the last 1 past its end/
		);
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
			'the song from its first scene (1 2), 2 bars, 0:04 at 120 bpm, then it stops'
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

	it('panics on the replica with no OP-XY: playback stopped, every note cut', async () => {
		// "stop everything, it's too loud" found panic refused with no device connected
		const { sim, run, silenced } = setup({ sound: true });
		await run(writePatternTool, { track: 1, notes: '1:C4:1 5:C4:1 9:C4:1 13:C4:1' });
		await run(transportTool, { action: 'play' });
		expect(sim.state.transport.playing).toBe(true);
		const result = await run(panicTool, {});
		expect(json(result)).toMatchObject({ target: 'virtual', stopped: true });
		expect(json(result).note).toMatch(/^The replica is silent: playback stopped, every note cut/);
		expect(sim.state.transport.playing).toBe(false);
		expect(silenced()).toBe(1);
		// stopped already, it still cuts the tails
		const again = json(await run(panicTool, {}));
		expect(again).toMatchObject({ stopped: false });
		expect(silenced()).toBe(2);
	});

	it('re-checks slow attacks against the notes when the tempo changes', async () => {
		// a swell that fit its notes at 72 bpm stopped reaching full level once the tempo doubled
		const { sim, run } = setup();
		sim.state.tracks[7].amp.attack = 50;
		await run(writePatternTool, { track: 8, notes: '1:C4+E4+G4:16' });
		const slow = json(await run(setTempoTool, { bpm: 60 }));
		expect(slow.swell).toBeUndefined();
		const fast = json(await run(setTempoTool, { bpm: 160 }));
		expect(fast.swell).toMatch(/^T8.s amp attack \(50 on its page\) takes/);
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
		// each value once (the envelope amount and key tracking came twice)
		expect(sound.pages['M3 filter'].match(/key tracking/g)).toHaveLength(1);
		// a closed filter its envelope opens: said, so cutoff 00 does not read as silent
		expect(sound.reading).toMatch(
			/nearly closed at cutoff 00, but its envelope opens it .* to about 28/
		);
		expect(sound.pages['M4 lfo']).toMatch(/^tremolo lfo off:/);
		expect(sound.pages['shift M3 sends']).toMatch(/^sends:/);
		expect(sound.pages['M4 lfo']).toMatch(/lfo/);
		expect(sound.pages.player).toMatch(/player/);
		expect(sound.mix).toEqual({ level: 74, pan: 0, muted: false });
		expect(sound.kit).toBeUndefined();
		// the delay's repeats in time at the tempo (an agent could only say "a few repeats")
		expect(sound.fx['FX I']).toMatch(
			/^delay: size 1\/8 dotted, .* \(a repeat about every 375 ms at 120 bpm\)$/
		);
	});

	it('gives the envelopes in seconds, and says a filter that is off does nothing', async () => {
		const { run } = setup();
		// T7's strings in a new project: attack 50, the ladder filter off
		const sound = json(await run(readSoundTool, { track: 7 }));
		expect(sound.reading).toMatch(
			/In time: amp envelope attack 1\.4 s, decay [\d.]+ s, release [\d.]+ s; filter envelope attack/
		);
		expect(sound.reading).toMatch(
			/The filter is off \(M3 pressed again switches it on\): its cutoff, resonance and the filter envelope do nothing/
		);
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
