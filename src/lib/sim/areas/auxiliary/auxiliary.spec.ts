import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import type { ScreenFrame } from '../../screen/frame';
import { PATTERNS } from '../../screen/icons';
import { RecordingContext } from '../../screen/recording';
import { describeFrame, renderFrame } from '../../screen/render';
import { currentPattern, toggleStep } from '../../sequencer';
import { scenarios } from './scenarios';
import { detectKey } from './sim';
import { DELAY_SIZES, FX_TYPES, KEYS, SCALES, initialAuxiliary } from './state';

/** The frame, narrowed to one page (fails the test on another page). */
function page<P extends ScreenFrame['page']>(
	sim: OpxySim,
	name: P
): Extract<ScreenFrame, { page: P }> {
	const frame = sim.frame;
	expect(frame.page).toBe(name);
	return frame as Extract<ScreenFrame, { page: P }>;
}

/** A simulator on auxiliary track `n` (1–8), M-page `m`. */
function aux(n: number, m: 1 | 2 | 3 | 4 = 1): OpxySim {
	const sim = new OpxySim({ now: () => 0 });
	sim.press('key.auxiliary');
	sim.press(`track.${n}`);
	sim.press(`key.m${m}`);
	return sim;
}

const shiftDown = (sim: OpxySim) => sim.input({ type: 'press', id: 'key.shift' });
const shiftUp = (sim: OpxySim) => sim.input({ type: 'release', id: 'key.shift' });

/** Draws the current frame into a recording context. */
function record(sim: OpxySim): RecordingContext {
	const ctx = new RecordingContext();
	renderFrame(ctx, sim.frame);
	return ctx;
}

describe('auxiliary mode: pages', () => {
	it('owns the screen in auxiliary mode and gives it back to overlays', () => {
		const sim = aux(1);
		expect(sim.frame.page).toBe('aux-brain');
		sim.press('key.tempo');
		expect(sim.frame.page).toBe('tempo');
		sim.press('key.m1');
		expect(sim.frame.page).toBe('aux-brain');
		expect(sim.leds['track.1']).toBe('red');
	});

	it('shows each track its own M1–M4 pages, and its main page where it has none', () => {
		const pages = (n: number) =>
			([1, 2, 3, 4] as const).map((m) => {
				const sim = aux(n, m);
				return sim.frame.page;
			});
		expect(pages(1)).toEqual(['aux-brain', 'aux-route', 'aux-brain', 'aux-brain']);
		expect(pages(2)).toEqual(['aux-punch', 'aux-punch', 'aux-punch', 'aux-punch']);
		expect(pages(3)).toEqual(['aux-midi', 'aux-cc', 'aux-cc', 'aux-lfo']);
		expect(pages(4)).toEqual(['aux-cv', 'aux-cv', 'aux-cv', 'aux-cv']);
		for (const n of [5, 6, 7, 8]) {
			expect(pages(n)).toEqual([
				n === 5 ? 'aux-audio' : n === 6 ? 'aux-tape' : 'aux-fx',
				'aux-route',
				'aux-filter',
				'aux-lfo'
			]);
		}
	});

	it('keeps the M-page when switching aux tracks', () => {
		const sim = aux(6, 3);
		sim.press('track.7');
		expect(sim.frame.page).toBe('aux-filter');
		sim.press('track.1');
		expect(sim.frame.page).toBe('aux-brain');
	});

	it('renders and describes every page without falling back to text', () => {
		const frames: ScreenFrame[] = [];
		for (let n = 1; n <= 8; n++) {
			for (const m of [1, 2, 3, 4] as const) {
				const sim = aux(n, m);
				frames.push(sim.frame);
				shiftDown(sim);
				frames.push(sim.frame);
			}
		}
		for (const frame of frames) {
			const ctx = new RecordingContext();
			renderFrame(ctx, frame);
			expect(ctx.fills.length, frame.page).toBeGreaterThan(5);
			expect(describeFrame(frame), frame.page).not.toBe(frame.page);
			expect(frame.page).not.toBe('text');
		}
	});
});

describe('brain (T1)', () => {
	it('starts automatic in c major with tracks 3–8 routed and nothing linked', () => {
		const sim = aux(1);
		expect(page(sim, 'aux-brain')).toMatchObject({
			title: 'c major',
			auto: true,
			root: 'c',
			scale: 'major',
			link: null
		});
		expect(page(sim, 'aux-brain').notes).toEqual([
			true,
			false,
			true,
			false,
			true,
			true,
			false,
			true,
			false,
			true,
			false,
			true
		]);
		expect(sim.state.areas.auxiliary.brain.patterns[0].routes).toEqual([
			false,
			false,
			true,
			true,
			true,
			true,
			true,
			true
		]);
	});

	it('sets key, scale and link with E2–E4, leaving auto for manual', () => {
		const sim = aux(1);
		sim.turn(2, 1);
		sim.turn(3, 3);
		sim.turn(4, 6);
		expect(page(sim, 'aux-brain')).toMatchObject({
			title: 'c# lydian',
			auto: false,
			root: 'c#',
			scale: 'lydian',
			link: '06'
		});
		sim.turn(4, -6);
		expect(page(sim, 'aux-brain').link).toBeNull();
		sim.turn(2, 99);
		sim.turn(3, 99);
		expect(page(sim, 'aux-brain')).toMatchObject({ root: 'b', scale: 'locrian' });
		sim.turn(1, 1);
		expect(page(sim, 'aux-brain').auto).toBe(true);
		sim.click(1);
		expect(page(sim, 'aux-brain').auto).toBe(false);
	});

	it('detects the key from the routed tracks and keeps it when switched to manual', () => {
		const sim = aux(1);
		// a D minor figure on track 3 (routed): d f a, d most often
		const pattern = currentPattern(sim.state.tracks[2].sequence);
		for (const [step, note] of [
			[0, 62],
			[2, 65],
			[4, 69],
			[6, 62],
			[8, 67],
			[10, 70]
		] as const) {
			toggleStep(pattern, step, [note]);
		}
		expect(page(sim, 'aux-brain')).toMatchObject({ root: 'd', scale: 'minor', auto: true });
		sim.turn(1, -1);
		expect(page(sim, 'aux-brain')).toMatchObject({ root: 'd', scale: 'minor', auto: false });
		// drum tracks are not routed: their notes do not count
		const drums = currentPattern(sim.state.tracks[0].sequence);
		toggleStep(drums, 0, [61]);
		sim.turn(1, 1);
		expect(page(sim, 'aux-brain').root).toBe('d');
	});

	it('transposes with its keyboard and, while playing, with the notes of its pattern', () => {
		const sim = aux(1);
		sim.press('keyboard.g3');
		expect(page(sim, 'aux-brain').title).toBe('g major');
		expect(page(sim, 'aux-brain').root).toBe('c');
		// a two-chord pattern on the brain: a on step 1, f on step 9
		const pattern = currentPattern(sim.state.aux[0].sequence);
		toggleStep(pattern, 0, [57]);
		toggleStep(pattern, 8, [53]);
		sim.press('key.play');
		expect(page(sim, 'aux-brain').title).toBe('a major');
		expect(sim.leds['keyboard.a3']).toBe('white');
		sim.advance((60000 / 120 / 4) * 8);
		expect(page(sim, 'aux-brain').title).toBe('f major');
		expect(sim.leds['keyboard.f3']).toBe('white');
		// the chord change holds until the next one
		sim.advance(60000 / 120 / 4);
		expect(page(sim, 'aux-brain').title).toBe('f major');
		expect(sim.leds['keyboard.f3']).toBe('off');
		sim.press('key.stop');
		expect(page(sim, 'aux-brain').title).toBe('g major');
		// setting the root by hand clears the keyboard's transposition
		sim.turn(2, 2);
		expect(page(sim, 'aux-brain').title).toBe('d major');
	});

	it('transposes a chord held on its keyboard to the lowest key, like a sequenced chord', () => {
		const sim = aux(1);
		sim.input({ type: 'press', id: 'keyboard.c4' });
		sim.input({ type: 'press', id: 'keyboard.e4' });
		expect(page(sim, 'aux-brain').title).toBe('c major');
		sim.input({ type: 'press', id: 'keyboard.a3' });
		expect(page(sim, 'aux-brain').title).toBe('a major');
		for (const id of ['keyboard.a3', 'keyboard.e4', 'keyboard.c4']) {
			sim.input({ type: 'release', id });
		}
		// the change holds after the keys come up
		expect(page(sim, 'aux-brain').title).toBe('a major');
	});

	it('routes tracks in and out on M2, four at a time, per pattern', () => {
		const sim = aux(1, 2);
		const route = () => page(sim, 'aux-route');
		expect(route().target).toBe('brain');
		expect(route().half).toBe(0);
		sim.turn(1, 1);
		sim.turn(3, -1);
		expect(route().tracks.map((t) => t.routed)).toEqual([
			true,
			false,
			false,
			true,
			true,
			true,
			true,
			true
		]);
		sim.click(2);
		expect(route().half).toBe(1);
		sim.turn(4, -1);
		expect(route().tracks[7].routed).toBe(false);
		// a second pattern keeps its own routing, starting from the first's
		const brain = sim.state.aux[0].sequence;
		brain.patterns.push(structuredClone(brain.patterns[0]));
		brain.current = 1;
		expect(route().tracks[0].routed).toBe(true);
		sim.turn(1, -1);
		expect(route().tracks[4].routed).toBe(false);
		brain.current = 0;
		expect(route().tracks[4].routed).toBe(true);
	});
});

describe('punch-in fx (T2)', () => {
	const WHITE = '#f7f5f5';
	const PANEL = '#16161e';
	/** The centre of a dot of the 40 × 18 matrix. */
	const dot = (col: number, row: number) => [6.49 + col * 11.9725, 8.2 + row * 11.9725];
	const centre = (f: { x0: number; y0: number; x1: number; y1: number }) => [
		(f.x0 + f.x1) / 2,
		(f.y0 + f.y1) / 2
	];

	it('idles with a heartbeat: a dot along row 8 at 15.2 columns a second, spiking at 17–22', () => {
		const sim = aux(2);
		const beat = () => page(sim, 'aux-punch').beat;
		expect(beat()).toEqual({ col: 0, row: 8 });
		sim.advance(1000);
		expect(beat()).toEqual({ col: 15, row: 8 });
		const heartbeat = sim.state.areas.auxiliary.heartbeat;
		const rows = Array.from({ length: 40 }, (_, col) => {
			heartbeat.col = col;
			return beat()?.row;
		});
		expect(rows.slice(15, 25)).toEqual([8, 8, 9, 7, 6, 4, 7, 9, 8, 8]);
		expect(rows.filter((row) => row === 8)).toHaveLength(34);
		// off the screen for the rest of its 2.78 s loop, then back at the left edge
		sim.advance(2700 - heartbeat.ms);
		expect(heartbeat.col).toBe(41);
		expect(beat()).toBeNull();
		sim.advance(80);
		expect(beat()).toEqual({ col: 0, row: 8 });
	});

	it('draws the matrix unlit (TE’s panel tone, 10 px dots) but for the heartbeat’s white dot', () => {
		const sim = aux(2);
		sim.advance(1340);
		const ctx = record(sim);
		const lit = ctx.fillsOf(WHITE);
		expect(lit).toHaveLength(1);
		expect(centre(lit[0])[0]).toBeCloseTo(dot(20, 4)[0], 1);
		expect(centre(lit[0])[1]).toBeCloseTo(dot(20, 4)[1], 1);
		expect(lit[0].x1 - lit[0].x0).toBeCloseTo(10, 5);
		expect(ctx.fillsOf(PANEL)).toHaveLength(719);
	});

	it('fires effects while keys are held: the last key’s picture fills the matrix', () => {
		const sim = aux(2);
		expect(page(sim, 'aux-punch').active).toEqual([]);
		sim.input({ type: 'press', id: 'keyboard.c4' });
		sim.input({ type: 'press', id: 'keyboard.f3' });
		const frame = page(sim, 'aux-punch');
		expect(frame.active).toEqual([0, 7]);
		expect(frame.picture).toBe(0);
		expect(frame.beat).toBeNull();
		expect(sim.leds['keyboard.c4']).toBe('white');
		expect(describeFrame(sim.frame)).toBe('punch-in fx: percussion 1 8');
		// F3's waving hand, read off the device's recording
		const hand = PATTERNS['auxiliary.punch.0'];
		const lit = record(sim).fillsOf(WHITE);
		expect(lit).toHaveLength(hand.grid.join('').split('2').length - 1);
		const [x, y] = dot(14, 0);
		expect(lit.some((f) => Math.hypot(centre(f)[0] - x, centre(f)[1] - y) < 0.05)).toBe(true);
		sim.input({ type: 'release', id: 'keyboard.f3' });
		expect(page(sim, 'aux-punch').picture).toBe(7);
		// the heartbeat waits at the left edge until the last effect ends, then runs again
		sim.advance(500);
		expect(page(sim, 'aux-punch').beat).toBeNull();
		sim.input({ type: 'release', id: 'keyboard.c4' });
		expect(page(sim, 'aux-punch')).toMatchObject({ picture: null, beat: { col: 0, row: 8 } });
		sim.advance(200);
		expect(page(sim, 'aux-punch').beat).toEqual({ col: 3, row: 8 });
	});

	it('has a picture for every key, read off the device’s recordings: 40 × 18 dots', () => {
		for (let key = 0; key < 24; key++) {
			const picture = PATTERNS[`auxiliary.punch.${key}`];
			expect(picture.grid).toHaveLength(18);
			expect(picture.grid.every((row) => /^[12]{40}$/.test(row))).toBe(true);
			expect(picture.grid.join('')).toContain('2');
		}
	});

	it('plays a sequenced effect for as long as its note lasts, and none while counting in', () => {
		const sim = aux(2);
		const pattern = currentPattern(sim.state.aux[1].sequence);
		toggleStep(pattern, 1, [60]);
		pattern.steps[1].notes[0].length = 3;
		sim.press('key.play');
		expect(page(sim, 'aux-punch').active).toEqual([]);
		sim.advance((60000 / 120 / 4) * 3.5);
		expect(page(sim, 'aux-punch').active).toEqual([7]);
		expect(sim.leds['keyboard.c4']).toBe('white');
		sim.advance(60000 / 120 / 4);
		expect(page(sim, 'aux-punch').active).toEqual([]);
		// a note nudged early starts before its step, and wraps round the loop
		toggleStep(pattern, 0, [53]);
		pattern.steps[0].notes[0].offset = -0.25;
		sim.state.transport.position = 15.8;
		expect(page(sim, 'aux-punch').active).toEqual([0]);
		// counting in, nothing plays yet
		sim.state.transport.position = -4;
		expect(page(sim, 'aux-punch').active).toEqual([]);
	});

	it('plays sequenced effects, lighting their keys', () => {
		const sim = aux(2);
		toggleStep(currentPattern(sim.state.aux[1].sequence), 0, [76]);
		sim.press('key.play');
		expect(page(sim, 'aux-punch').active).toEqual([23]);
		expect(describeFrame(sim.frame)).toBe('punch-in fx: melodic 12');
		expect(sim.leds['keyboard.e5']).toBe('white');
		sim.advance(60000 / 120 / 4);
		expect(page(sim, 'aux-punch').active).toEqual([]);
		expect(sim.leds['keyboard.e5']).toBe('off');
	});
});

describe('punch-in shortcut (shift + key on instrument tracks)', () => {
	it('fires an effect instead of playing a note', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('track.3');
		sim.combo('key.shift', 'keyboard.d4');
		expect(sim.state.tracks[2].sequence.lastNote).toBe(60);
		sim.press('keyboard.d4');
		expect(sim.state.tracks[2].sequence.lastNote).toBe(50); // a new project's T3 is an octave down
	});

	it('writes the effect to the punch-in track while recording', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('track.3');
		sim.press('key.play');
		sim.advance((60000 / 120 / 4) * 2);
		// record + play during playback latches live recording (manual: sequencer/live-recording)
		sim.combo('key.record', 'key.play');
		sim.combo('key.shift', 'keyboard.c4');
		const steps = currentPattern(sim.state.aux[1].sequence).steps;
		expect(steps[2].notes.map((n) => n.note)).toEqual([60]);
		// a second press on the same step does not remove it
		sim.combo('key.shift', 'keyboard.c4');
		expect(steps[2].notes).toHaveLength(1);
	});

	it('records the effect on the nearest step, lasting as long as the key is held', () => {
		const sim = new OpxySim({ now: () => 0 });
		const step = 60000 / 120 / 4;
		sim.press('track.3');
		sim.press('key.play');
		sim.combo('key.record', 'key.play');
		sim.advance(step * 1.6);
		shiftDown(sim);
		sim.input({ type: 'press', id: 'keyboard.c4' });
		shiftUp(sim);
		sim.advance(step * 3);
		sim.input({ type: 'release', id: 'keyboard.c4' });
		const note = currentPattern(sim.state.aux[1].sequence).steps[2].notes[0];
		expect(note).toMatchObject({ note: 60, length: 3 });
		expect(note.offset).toBeCloseTo(-0.4, 9);
		expect(sim.state.areas.auxiliary.punchTakes).toEqual({});
	});

	it('gives a take still held when playback stops the length it reached', () => {
		const sim = new OpxySim({ now: () => 0 });
		const step = 60000 / 120 / 4;
		sim.press('track.3');
		sim.press('key.play');
		sim.combo('key.record', 'key.play');
		shiftDown(sim);
		sim.input({ type: 'press', id: 'keyboard.f3' });
		sim.advance(step * 5);
		sim.press('key.stop');
		sim.input({ type: 'release', id: 'keyboard.f3' });
		shiftUp(sim);
		expect(currentPattern(sim.state.aux[1].sequence).steps[0].notes[0]).toMatchObject({
			note: 53,
			length: 5
		});
	});

	it('leaves midi engine tracks and other modes alone', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('track.3');
		sim.state.tracks[2].engine = 'midi';
		sim.combo('key.shift', 'keyboard.d4');
		expect(sim.state.tracks[2].sequence.lastNote).toBe(50); // d4, an octave down on T3
		sim.press('key.auxiliary');
		sim.press('track.4');
		sim.combo('key.shift', 'keyboard.c5');
		expect(page(sim, 'aux-cv').volts).toBe(1);
	});
});

describe('external midi (T3)', () => {
	it('sets channel (two digits), bank and program on M1, with none below 1', () => {
		const sim = aux(3);
		expect(page(sim, 'aux-midi')).toEqual({
			page: 'aux-midi',
			channel: '01',
			bank: null,
			program: null
		});
		sim.turn(1, 20);
		sim.turn(2, 3);
		sim.turn(3, 200);
		expect(page(sim, 'aux-midi')).toMatchObject({ channel: '16', bank: '3', program: '128' });
		sim.turn(2, -3);
		expect(page(sim, 'aux-midi').bank).toBeNull();
	});

	it('keeps CC slots off until shift + turn picks a CC, and sends their values', () => {
		const sim = aux(3, 2);
		expect(page(sim, 'aux-cc').slots[0]).toEqual({ cc: null, value: '0' });
		sim.turn(1, 5);
		expect(sim.state.areas.auxiliary.midi.slots[0].value).toBe(0);
		shiftDown(sim);
		sim.turn(1, 75);
		shiftUp(sim);
		expect(page(sim, 'aux-cc')).toMatchObject({ set: 'I' });
		expect(page(sim, 'aux-cc').slots[0]).toEqual({ cc: 74, value: '0' });
		sim.turn(1, 64);
		expect(page(sim, 'aux-cc').slots[0]).toEqual({ cc: 74, value: '64' });
		sim.turn(1, 500);
		expect(page(sim, 'aux-cc').slots[0].value).toBe('127');
		expect(describeFrame(sim.frame)).toBe('external midi set I: cc 74 127, off, off, off');
		// M3 holds slots 5–8
		sim.press('key.m3');
		shiftDown(sim);
		sim.turn(4, 1);
		shiftUp(sim);
		expect(page(sim, 'aux-cc').set).toBe('II');
		expect(page(sim, 'aux-cc').slots[3].cc).toBe(0);
		expect(sim.state.areas.auxiliary.midi.slots[7].cc).toBe(0);
		shiftDown(sim);
		sim.turn(4, -1);
		expect(page(sim, 'aux-cc').slots[3].cc).toBeNull();
	});

	it('crosses an off slot: 2 px white lines on the black box, 1 px ink on the others', () => {
		const ctx = record(aux(3, 2));
		const strokes = (color: string, width: number) =>
			ctx.ops.filter((o) => o.op === 'stroke' && o.style === color && o.args[0] === width);
		expect(strokes('#f7f5f5', 2)).toHaveLength(2);
		expect(strokes('#0f0e12', 1).length).toBeGreaterThanOrEqual(6);
	});
});

describe('external cv (T4)', () => {
	it('points the needle at the last note, 1 V per octave from C4', () => {
		const sim = aux(4);
		expect(page(sim, 'aux-cv').volts).toBe(0);
		sim.press('keyboard.c5');
		expect(page(sim, 'aux-cv').volts).toBe(1);
		sim.state.aux[3].sequence.lastNote = 0;
		expect(page(sim, 'aux-cv').volts).toBe(-5);
		toggleStep(currentPattern(sim.state.aux[3].sequence), 0, [66]);
		sim.press('key.play');
		expect(page(sim, 'aux-cv').volts).toBe(0.5);
		expect(describeFrame(sim.frame)).toBe('external cv: +0.50 volts');
	});

	it('holds the pattern’s last note between steps, and a key held plays live', () => {
		const sim = aux(4);
		const step = 60000 / 120 / 4;
		const pattern = currentPattern(sim.state.aux[3].sequence);
		toggleStep(pattern, 0, [72]);
		toggleStep(pattern, 8, [48]);
		sim.state.aux[3].sequence.lastNote = 54;
		sim.press('key.play');
		sim.advance(step * 5);
		expect(page(sim, 'aux-cv').volts).toBe(1);
		sim.input({ type: 'press', id: 'keyboard.c5' });
		sim.advance(step);
		expect(page(sim, 'aux-cv').volts).toBe(1);
		sim.input({ type: 'press', id: 'keyboard.f3' });
		expect(page(sim, 'aux-cv').volts).toBeCloseTo(-7 / 12, 9);
		sim.input({ type: 'release', id: 'keyboard.f3' });
		sim.input({ type: 'release', id: 'keyboard.c5' });
		sim.advance(step * 3);
		expect(page(sim, 'aux-cv').volts).toBe(-1);
		// the last note wraps round the loop into the next pass
		sim.advance(step * 8);
		expect(page(sim, 'aux-cv').volts).toBe(1);
		sim.press('key.stop');
		expect(page(sim, 'aux-cv').volts).toBeCloseTo(-7 / 12, 9);
	});

	it('draws the needle at 7° per volt about the meter’s pivot', () => {
		const sim = aux(4);
		sim.state.aux[3].sequence.lastNote = 0;
		const needle = record(sim)
			.ops.filter((o) => o.op === 'lineTo')
			.pop();
		const angle = Math.atan2(Number(needle?.args[0]) - 240.03, 186.28 - Number(needle?.args[1]));
		expect((angle * 180) / Math.PI).toBeCloseTo(-35, 1);
	});
});

describe('external audio (T5)', () => {
	it('chooses the input, switches it on with E1 and sets drive 00–20, level and mix', () => {
		const sim = aux(5);
		expect(page(sim, 'aux-audio')).toMatchObject({
			input: 'mic',
			on: false,
			drive: '00',
			level: '75',
			mix: '99'
		});
		sim.turn(1, 2);
		sim.click(1);
		sim.turn(2, 15);
		sim.turn(3, -75);
		sim.turn(4, 10);
		expect(page(sim, 'aux-audio')).toMatchObject({
			input: 'audio input',
			on: true,
			drive: '15',
			level: '00',
			mix: '99'
		});
		sim.turn(2, 25);
		expect(page(sim, 'aux-audio').drive).toBe('20');
		sim.turn(1, 9);
		expect(page(sim, 'aux-audio').input).toBe('main output');
	});

	it('crosses a switched-off microphone in red under "fdbk block"', () => {
		const sim = aux(5);
		const blocked = record(sim);
		const red = (ctx: RecordingContext) =>
			ctx.ops.filter((o) => o.op === 'stroke' && o.style === '#e5371b');
		expect(red(blocked)).toHaveLength(1);
		sim.click(1);
		expect(red(record(sim))).toHaveLength(0);
	});

	it('routes instrument tracks to the aux out: their own aux sends, plain numbers', () => {
		const sim = aux(5, 2);
		expect(page(sim, 'aux-route').target).toBe('aux out');
		expect(page(sim, 'aux-route').tracks[0].value).toBe('0');
		sim.turn(3, 40);
		expect(sim.state.tracks[2].sends[0]).toBe(40);
		expect(page(sim, 'aux-route').tracks[2]).toEqual({
			routed: true,
			amount: 40 / 99,
			value: '40'
		});
		// the instrument's send page shows the same value
		sim.press('key.instrument');
		sim.press('track.3');
		sim.press('key.m3');
		shiftDown(sim);
		expect(page(sim, 'sends').values[0]).toBe('40');
	});

	it('sends to tape, FX I and FX II on the M3 shift layer, writing "no send" at none', () => {
		const sim = aux(5, 3);
		shiftDown(sim);
		expect(page(sim, 'aux-sends').values).toEqual([null, '00', '00', '00']);
		// the tape card (the second) writes "no send": six glyphs where "00" would be two
		const glyphs = (ctx: RecordingContext) =>
			ctx.fillsOf('#0f0e12').filter((f) => f.x0 >= 204 && f.x1 <= 300 && f.y0 > 71 && f.y1 < 108);
		expect(glyphs(record(sim))).toHaveLength(6);
		sim.turn(1, 10);
		sim.turn(2, 20);
		sim.turn(4, 30);
		expect(page(sim, 'aux-sends').values).toEqual([null, '20', '00', '30']);
		expect(glyphs(record(sim))).toHaveLength(2);
		shiftUp(sim);
		expect(page(sim, 'aux-filter')).toEqual({
			page: 'aux-filter',
			off: true,
			highpass: 0,
			lowpass: 1
		});
	});
});

describe('tape (T6)', () => {
	it('sets pitch, speed, length and mix within their ranges', () => {
		const sim = aux(6);
		expect(page(sim, 'aux-tape')).toMatchObject({
			pitch: 'x1',
			speed: '100',
			length: '1',
			mix: '00'
		});
		// the page writes "100%"; the description keeps the number for the navigator
		expect(describeFrame(sim.frame)).toBe('tape: pitch x1, speed 100, length 1, mix 00');
		sim.turn(1, 20);
		sim.turn(2, -80);
		sim.turn(3, 2);
		sim.turn(4, 72);
		expect(page(sim, 'aux-tape')).toMatchObject({
			pitch: 'x10',
			speed: '50',
			length: '3',
			mix: '72'
		});
		sim.turn(2, 500);
		sim.turn(3, 20);
		expect(page(sim, 'aux-tape')).toMatchObject({ speed: '200', length: '16' });
	});

	it('plays clips from the keyboard and lays routed tracks’ notes on the loop', () => {
		const sim = aux(6);
		sim.input({ type: 'press', id: 'keyboard.e4' });
		expect(page(sim, 'aux-tape').keys).toEqual([11]);
		expect(sim.state.areas.auxiliary.tape.clip).toBe(11);
		sim.input({ type: 'release', id: 'keyboard.e4' });
		expect(page(sim, 'aux-tape').keys).toEqual([]);
		// track 3 into the tape on M2 at 50 (a new project sends every track at 99), with notes on
		// steps 1 and 3
		sim.press('key.m2');
		sim.turn(3, -49);
		expect(page(sim, 'aux-route').tracks[2].value).toBe('50');
		const pattern = currentPattern(sim.state.tracks[2].sequence);
		toggleStep(pattern, 0, [60]);
		toggleStep(pattern, 2, [64]);
		sim.press('key.m1');
		expect(page(sim, 'aux-tape').hits).toEqual([0, 0.5]);
		sim.turn(3, 1);
		expect(page(sim, 'aux-tape').hits).toEqual([0, 0.25]);
		sim.press('key.play');
		sim.advance((60000 / 120 / 4) * 3);
		expect(page(sim, 'aux-tape').head).toBeCloseTo(3 / 8, 5);
	});

	it('sends to FX I and FX II only on its shift layer', () => {
		const sim = aux(6, 3);
		shiftDown(sim);
		expect(page(sim, 'aux-sends').values).toEqual([null, null, '00', '00']);
		sim.turn(2, 30);
		expect(page(sim, 'aux-sends').values).toEqual([null, null, '00', '00']);
	});
});

describe('FX I and FX II (T7, T8)', () => {
	it('start with the delay on FX I and the reverb on FX II, labelled as the device labels them', () => {
		const fx1 = page(aux(7), 'aux-fx');
		expect(fx1).toMatchObject({ slot: 'FX I', type: 'delay' });
		expect(fx1.params.map((p) => p.label)).toEqual(['size', 'fine', 'feedback', 'dry']);
		// a new project's size (21495 of 32767) reads 1/8 dotted, as on the device
		expect(fx1.params[0].value).toBe('1/8 dotted');
		expect(fx1.params[0].level).toBeCloseTo(21495 / 32767, 3);
		const fx2 = page(aux(8), 'aux-fx');
		expect(fx2).toMatchObject({ slot: 'FX II', type: 'reverb' });
		expect(fx2.params.map((p) => p.label)).toEqual(['size', 'mod', 'tone', 'dry']);
		expect(describeFrame(aux(7).frame)).toBe(
			'FX I delay: size 1/8 dotted, fine 50, feedback 50, dry 99'
		);
	});

	it('names the delay size by note value in eight zones of its lane; E1 moves it a zone a detent', () => {
		const sim = aux(7);
		const fx = sim.state.areas.auxiliary.fx[0];
		const seen: string[] = [];
		for (let v = 0; v <= 99; v += 1) {
			fx.params[0] = v;
			const size = page(sim, 'aux-fx').params[0];
			expect(size.level).toBeCloseTo(v / 99, 9);
			if (seen[seen.length - 1] !== size.value) seen.push(size.value);
		}
		expect(seen).toEqual([...DELAY_SIZES]);
		// a detent is an eighth of the lane: from the bottom, one note value each
		sim.turn(1, -1);
		expect(fx.params[0]).toBeCloseTo(99 - 99 / 8, 9);
		sim.turn(1, -10);
		expect(fx.params[0]).toBe(0);
		const stepped: string[] = [];
		for (let i = 0; i < 8; i++) {
			stepped.push(page(sim, 'aux-fx').params[0].value);
			sim.turn(1, 1);
		}
		expect(stepped).toEqual([...DELAY_SIZES]);
		expect(page(sim, 'aux-fx').params[0]).toMatchObject({ value: '1/2', level: 1 });
		sim.turn(4, 60);
		expect(page(sim, 'aux-fx').params[3]).toMatchObject({ value: '99', level: 1 });
	});

	it('writes "dist" for the distortion, with drive, clip, lo cut and hi cut', () => {
		const sim = aux(7);
		sim.state.areas.auxiliary.fx[0] = { type: 'distortion', params: [6, 99, 50, 99] };
		expect(describeFrame(sim.frame)).toBe('FX I dist: drive 06, clip 99, lo cut 50, hi cut 99');
	});

	it('draws each column’s marker 8 px tall, from y 137 at 0 to 80 at full', () => {
		const sim = aux(7);
		sim.state.areas.auxiliary.fx[0] = { type: 'chorus', params: [0, 99, 49.5, 0] };
		const markers = record(sim).fills.filter((f) => f.y1 - f.y0 === 8 && f.x1 - f.x0 === 100);
		expect(markers.map((f) => [f.x0, f.y0])).toEqual([
			[40, 137],
			[140, 80],
			[240, 108.5],
			[340, 137]
		]);
	});

	it('changes the effect with shift + T7 / T8, E4 and a click (or M1)', () => {
		const sim = aux(1);
		sim.combo('key.shift', 'track.8');
		expect(sim.state.auxTrack).toBe(7);
		const list = page(sim, 'aux-fx-list');
		expect(list).toEqual({
			page: 'aux-fx-list',
			track: '16',
			items: ['chorus', 'delay', 'dist', 'lofi', 'phaser', 'reverb'],
			selected: FX_TYPES.indexOf('reverb')
		});
		sim.turn(1, -3);
		expect(page(sim, 'aux-fx-list').selected).toBe(5);
		sim.turn(4, -5);
		sim.click(4);
		expect(page(sim, 'aux-fx')).toMatchObject({ slot: 'FX II', type: 'chorus' });
		sim.combo('key.shift', 'track.7');
		sim.turn(4, 2);
		sim.press('key.m1');
		expect(page(sim, 'aux-fx')).toMatchObject({ slot: 'FX I', type: 'lofi' });
		expect(page(sim, 'aux-fx').params.map((p) => p.value)).toEqual(['50', '50', '50', '50']);
	});

	it('keeps the list open through an encoder push, so its click confirms, and a push-turn scrolls', () => {
		const sim = aux(7);
		sim.combo('key.shift', 'track.7');
		sim.input({ type: 'press', id: 'encoder.4' });
		sim.input({ type: 'turn', id: 'encoder.4', delta: 3, fine: true });
		sim.input({ type: 'release', id: 'encoder.4' });
		expect(page(sim, 'aux-fx-list').selected).toBe(4);
		sim.press('encoder.4');
		sim.click(4);
		expect(page(sim, 'aux-fx')).toMatchObject({ slot: 'FX I', type: 'phaser' });
	});

	it('leaves the effect list unchanged with M2–M4 or another key', () => {
		const sim = aux(7);
		sim.combo('key.shift', 'track.7');
		sim.turn(4, 2);
		sim.press('key.m2');
		expect(page(sim, 'aux-route').target).toBe('FX I');
		expect(sim.state.areas.auxiliary.fx[0].type).toBe('delay');
		sim.combo('key.shift', 'track.7');
		sim.press('keyboard.c4');
		expect(sim.frame.page).toBe('aux-fx-list');
		sim.press('track.3');
		expect(page(sim, 'aux-cc').set).toBe('I');
		expect(sim.state.areas.auxiliary.picker).toBeNull();
	});

	it('route instrument tracks in through their FX sends, and FX I into FX II', () => {
		const sim = aux(8, 2);
		sim.click(1);
		sim.turn(4, 33); // T8, whose FX II send a new project leaves at 00
		expect(sim.state.tracks[7].sends[3]).toBe(33);
		sim.press('track.7');
		sim.press('key.m3');
		shiftDown(sim);
		expect(page(sim, 'aux-sends').values).toEqual([null, null, null, '00']);
		sim.turn(4, 45);
		expect(page(sim, 'aux-sends').values[3]).toBe('45');
		// FX II sends nowhere: shift keeps the filter
		shiftUp(sim);
		sim.press('track.8');
		shiftDown(sim);
		expect(page(sim, 'aux-filter').lowpass).toBe(1);
	});

	it('mutes with auxiliary + T7 instead of opening the list', () => {
		const sim = aux(7);
		sim.input({ type: 'press', id: 'key.auxiliary' });
		sim.press('track.7');
		sim.input({ type: 'release', id: 'key.auxiliary' });
		expect(sim.state.aux[6].mix.muted).toBe(true);
		expect(sim.state.areas.auxiliary.picker).toBeNull();
	});
});

describe('filter and LFO pages', () => {
	it('start switched off; M3 and M4 on their own page switch them on and off', () => {
		const sim = aux(5, 3);
		expect(page(sim, 'aux-filter').off).toBe(true);
		expect(describeFrame(sim.frame)).toBe('filter off: high-pass 0, low-pass 99');
		sim.press('key.m3');
		expect(page(sim, 'aux-filter').off).toBe(false);
		sim.press('key.m4');
		expect(page(sim, 'aux-lfo').off).toBe(true); // the first press only opens the page
		sim.press('key.m4');
		expect(page(sim, 'aux-lfo').off).toBe(false);
		sim.press('key.m4');
		expect(page(sim, 'aux-lfo').off).toBe(true);
		// each track keeps its own
		sim.press('track.6');
		expect(page(sim, 'aux-lfo').off).toBe(true);
		sim.press('key.m3');
		expect(page(sim, 'aux-filter').off).toBe(true);
		// the brain has neither: M3 and M4 keep its page and change nothing
		sim.press('track.1');
		sim.press('key.m4');
		sim.press('key.m4');
		expect(sim.frame.page).toBe('aux-brain');
	});

	it('draws an off page at 40 % under "off"', () => {
		const sim = aux(6, 3);
		const off = record(sim);
		expect(off.fills.some((f) => f.alpha === 0.4)).toBe(true);
		expect(off.fillsOf('#000000').some((f) => f.x0 === 210.5 && f.y0 === 90.5)).toBe(true);
		sim.press('key.m3');
		expect(record(sim).fills.some((f) => f.alpha === 0.4)).toBe(false);
	});

	it('sets the high-pass with E1 and the low-pass with E4', () => {
		const sim = aux(6, 3);
		sim.press('key.m3');
		sim.turn(1, 33);
		sim.turn(4, -33);
		sim.turn(2, 10);
		expect(page(sim, 'aux-filter')).toEqual({
			page: 'aux-filter',
			off: false,
			highpass: 33 / 99,
			lowpass: 66 / 99
		});
		const ctx = record(sim);
		// the four bands, lightening across the spectrum
		for (const fill of ['#16161e', '#484850', '#616169', '#f7f5f5']) {
			expect(ctx.fillsOf(fill).length, fill).toBeGreaterThan(0);
		}
	});

	it('moves each edge’s midpoint linearly with its lane', () => {
		const sim = aux(6, 3);
		sim.press('key.m3');
		// the pass band's outline: the path from the floor at the left edge to its close
		const outline = (ctx: RecordingContext) => {
			const start = ctx.ops.findIndex(
				(o) => o.op === 'moveTo' && o.args[0] === 30 && o.args[1] === 169.3
			);
			const end = ctx.ops.findIndex((o, i) => i > start && o.op === 'closePath');
			return ctx.ops
				.slice(start, end)
				.filter((o) => o.op === 'lineTo')
				.map((o) => [Number(o.args[0]), Number(o.args[1])]);
		};
		const midpoint = (points: number[][], rising: boolean) => {
			const mid = (55.7 + 159.5) / 2;
			const hit = points.find(([, y], i) => {
				const prev = points[i - 1];
				return prev && (rising ? prev[1] > mid && y <= mid : prev[1] < mid && y >= mid);
			});
			return hit?.[0] ?? NaN;
		};
		sim.turn(4, -49); // low-pass 50
		// the outline is drawn a pixel at a time: the midpoint within a pixel
		const near = (x: number, expected: number) => expect(Math.abs(x - expected)).toBeLessThan(1);
		near(midpoint(outline(record(sim)), false), 83.7 + 404.2 * (50 / 99));
		sim.turn(1, 64); // high-pass 64
		near(midpoint(outline(record(sim)), true), -53.4 + 397 * (64 / 99));
	});

	it('runs speed, amount, destination and parameter over syn, filter and amp', () => {
		const sim = aux(5, 4);
		expect(page(sim, 'aux-lfo')).toMatchObject({
			destinations: ['syn', 'filter', 'amp'],
			destination: 0,
			parameterName: 'param1',
			amount: 0,
			speed: { synced: true, label: '8' }
		});
		sim.turn(4, 2);
		expect(page(sim, 'aux-lfo').parameterName).toBe('param3');
		sim.click(4);
		sim.click(4);
		expect(page(sim, 'aux-lfo').parameterName).toBe('param1');
		sim.turn(3, 1);
		expect(page(sim, 'aux-lfo')).toMatchObject({ destination: 1, parameterName: 'hi pass' });
		sim.turn(3, 1);
		expect(page(sim, 'aux-lfo')).toMatchObject({ destination: 2, parameterName: 'volume' });
		// an encoder with nothing to move reads "-" (the device's amp: volume, pan, -, -)
		sim.turn(4, 1);
		expect(page(sim, 'aux-lfo').parameterName).toBe('pan');
		sim.turn(4, 1);
		expect(page(sim, 'aux-lfo')).toMatchObject({ parameterName: '-', parameter: 2 });
		sim.turn(1, 20);
		sim.turn(2, -99);
		expect(page(sim, 'aux-lfo').speed.synced).toBe(false);
		expect(page(sim, 'aux-lfo').amount).toBe(-100);
	});

	it('turns the free speed’s hand half a turn, from 12 o’clock to 6', () => {
		const sim = aux(5, 4);
		sim.press('key.m4');
		const hand = () => {
			const ops = record(sim).ops;
			const i = ops.findIndex((o) => o.op === 'stroke' && o.args[0] === 2.2);
			const [from, to] = [ops[i - 2], ops[i - 1]].map((o) => o.args.map(Number));
			return Math.round((Math.atan2(to[0] - from[0], from[1] - to[1]) * 180) / Math.PI);
		};
		sim.turn(1, 5); // the first free position
		expect(hand()).toBe(0);
		sim.turn(1, 200);
		expect(hand()).toBe(180);
	});

	it('aims the external MIDI LFO at off or one of the CC sets, naming the slot by its CC', () => {
		const sim = aux(3, 4);
		const lfo = page(sim, 'aux-lfo');
		expect(lfo.destinations).toEqual(['off', 'cc1', 'cc2']);
		expect(lfo.parameterName).toBe('no cc set');
		sim.turn(3, 1);
		expect(page(sim, 'aux-lfo').parameterName).toBe('no cc set');
		sim.state.areas.auxiliary.midi.slots[0].cc = 9;
		expect(page(sim, 'aux-lfo').parameterName).toBe('cc 9');
		sim.turn(3, 1);
		sim.state.areas.auxiliary.midi.slots[4].cc = 10;
		expect(page(sim, 'aux-lfo')).toMatchObject({ destination: 2, parameterName: 'cc 10' });
		// the FX tracks reach their own page, filter and amp
		sim.press('track.8');
		expect(page(sim, 'aux-lfo').destinations).toEqual(['syn', 'filter', 'amp']);
	});
});

describe('the brain’s key detection', () => {
	it('finds nothing without notes', () => {
		expect(detectKey([])).toBeNull();
	});

	it('names a major triad major and a minor triad minor', () => {
		expect(detectKey([60, 64, 67])).toEqual({ key: 0, scale: 0 });
		expect(detectKey([57, 60, 64, 57])).toEqual({ key: 9, scale: 5 });
	});

	it('picks the mode whose root is heard most', () => {
		const lydian = [61, 61, 61, 63, 65, 67, 68, 70, 72];
		const found = detectKey(lydian);
		expect(found && [KEYS[found.key], SCALES[found.scale].name]).toEqual(['c#', 'lydian']);
	});
});

describe('state', () => {
	it('is plain, serialisable data', () => {
		const state = initialAuxiliary();
		expect(JSON.parse(JSON.stringify(state))).toEqual(state);
		expect(state.pages).toHaveLength(8);
		expect(state.midi.slots).toHaveLength(8);
	});
});

describe('guide art scenarios', () => {
	it.each(scenarios.map((s) => [s.id, s] as const))('%s lands on its page', (_, s) => {
		const sim = new OpxySim({ now: () => 0 });
		s.setup(sim);
		expect(sim.frame.page).toBe(s.page);
		expect(sim.state.mode).toBe('auxiliary');
	});

	it('reproduce the art’s readings', () => {
		const run = (id: string) => {
			const sim = new OpxySim({ now: () => 0 });
			scenarios.find((s) => s.id === id)?.setup(sim);
			return sim;
		};
		// set by hand, so the root and scale boxes show as in TE's picture
		expect(page(run('aux-brain'), 'aux-brain')).toMatchObject({
			title: 'c lydian',
			root: 'c#',
			scale: 'lydian',
			link: '06',
			auto: false
		});
		expect(page(run('aux-brain-song'), 'aux-brain')).toMatchObject({
			title: 'c lydian',
			root: 'c#',
			link: null
		});
		expect(page(run('aux-midi'), 'aux-midi')).toMatchObject({ channel: '16', program: '8' });
		expect(page(run('aux-cv'), 'aux-cv').volts).toBeCloseTo(-3.92, 2);
		expect(page(run('aux-tape'), 'aux-tape')).toMatchObject({
			pitch: 'x2',
			speed: '84',
			length: '3',
			mix: '72',
			keys: [11, 13]
		});
		expect(page(run('aux-fx'), 'aux-fx').params.map((p) => p.label)).toEqual([
			'rate',
			'depth',
			'feedback',
			'stereo'
		]);
	});
});
