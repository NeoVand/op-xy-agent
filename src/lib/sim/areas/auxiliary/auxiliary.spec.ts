import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import type { ScreenFrame } from '../../screen/frame';
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
	it('fires effects while keys are held, and the dog jumps', () => {
		const sim = aux(2);
		const still = record(sim);
		expect(page(sim, 'aux-punch').active).toEqual([]);
		sim.input({ type: 'press', id: 'keyboard.c4' });
		sim.input({ type: 'press', id: 'keyboard.f3' });
		expect(page(sim, 'aux-punch').active).toEqual([0, 7]);
		expect(sim.leds['keyboard.c4']).toBe('white');
		const jumping = record(sim);
		const lit = (ctx: RecordingContext) => ctx.fillsOf('#f7f5f5').map((f) => f.y0);
		const ground = (ys: number[]) => ys.filter((y) => y > 200).length;
		expect(lit(jumping)).toHaveLength(lit(still).length);
		expect(Math.min(...lit(jumping))).toBeLessThan(Math.min(...lit(still)));
		expect(ground(lit(jumping))).toBe(ground(lit(still)));
		expect(describeFrame(sim.frame)).toBe('punch-in fx: percussion 1 8');
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
		expect(sim.state.tracks[2].sequence.lastNote).toBe(62);
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
		expect(sim.state.tracks[2].sequence.lastNote).toBe(62);
		sim.press('key.auxiliary');
		sim.press('track.4');
		sim.combo('key.shift', 'keyboard.c5');
		expect(page(sim, 'aux-cv').volts).toBe(1);
	});
});

describe('external midi (T3)', () => {
	it('sets channel, bank and program on M1, with none below 1', () => {
		const sim = aux(3);
		expect(page(sim, 'aux-midi')).toMatchObject({ channel: '1', bank: null, program: null });
		expect(page(sim, 'aux-midi').soft.map((s) => s?.text)).toEqual([
			'main',
			'set I',
			'set II',
			'modulation'
		]);
		sim.turn(1, 20);
		sim.turn(2, 3);
		sim.turn(3, 200);
		expect(page(sim, 'aux-midi')).toMatchObject({ channel: '16', bank: '3', program: '128' });
		sim.turn(2, -3);
		expect(page(sim, 'aux-midi').bank).toBeNull();
	});

	it('switches CC slots on with shift and sends their values', () => {
		const sim = aux(3, 2);
		expect(page(sim, 'aux-cc').slots[0]).toEqual({ label: 'slot 1', value: null });
		sim.turn(1, 5);
		expect(page(sim, 'aux-cc').slots[0].value).toBeNull();
		shiftDown(sim);
		sim.turn(1, 75);
		expect(page(sim, 'aux-cc')).toMatchObject({ shift: true, set: 'I' });
		expect(page(sim, 'aux-cc').slots[0]).toEqual({ label: 'slot 1', value: '74' });
		shiftUp(sim);
		sim.turn(1, 64);
		expect(page(sim, 'aux-cc').slots[0]).toEqual({ label: 'cc 74', value: '64' });
		sim.turn(1, 500);
		expect(page(sim, 'aux-cc').slots[0].value).toBe('127');
		// M3 holds slots 5–8
		sim.press('key.m3');
		shiftDown(sim);
		sim.turn(4, 1);
		shiftUp(sim);
		expect(page(sim, 'aux-cc').set).toBe('II');
		expect(page(sim, 'aux-cc').slots[3].label).toBe('cc 0');
		expect(sim.state.areas.auxiliary.midi.slots[7].cc).toBe(0);
		shiftDown(sim);
		sim.turn(4, -1);
		expect(page(sim, 'aux-cc').slots[3].value).toBeNull();
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
	it('chooses the input, switches it on with E1 and sets drive, level and mix', () => {
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
		sim.turn(2, 25);
		sim.turn(3, -75);
		sim.turn(4, 10);
		expect(page(sim, 'aux-audio')).toMatchObject({
			input: 'audio input',
			on: true,
			drive: '25',
			level: '00',
			mix: '99'
		});
		sim.turn(1, 9);
		expect(page(sim, 'aux-audio').input).toBe('main output');
	});

	it('routes instrument tracks to the aux out: their own aux sends', () => {
		const sim = aux(5, 2);
		expect(page(sim, 'aux-route').target).toBe('aux out');
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

	it('sends to tape, FX I and FX II on the M3 shift layer', () => {
		const sim = aux(5, 3);
		shiftDown(sim);
		expect(page(sim, 'aux-sends').values).toEqual([null, '00', '00', '00']);
		sim.turn(1, 10);
		sim.turn(2, 20);
		sim.turn(4, 30);
		expect(page(sim, 'aux-sends').values).toEqual([null, '20', '00', '30']);
		shiftUp(sim);
		expect(page(sim, 'aux-filter')).toEqual({ page: 'aux-filter', highpass: 0, lowpass: 1 });
	});
});

describe('tape (T6)', () => {
	it('sets pitch, speed, length and mix within their ranges', () => {
		const sim = aux(6);
		expect(page(sim, 'aux-tape')).toMatchObject({
			pitch: 'X1',
			speed: '100',
			length: '1',
			mix: '00',
			clip: ''
		});
		sim.turn(1, 20);
		sim.turn(2, -80);
		sim.turn(3, 2);
		sim.turn(4, 72);
		expect(page(sim, 'aux-tape')).toMatchObject({
			pitch: 'X10',
			speed: '50',
			length: '3',
			mix: '72'
		});
		sim.turn(2, 500);
		expect(page(sim, 'aux-tape').speed).toBe('200');
	});

	it('plays clips from the keyboard and lays routed tracks’ notes on the loop', () => {
		const sim = aux(6);
		sim.input({ type: 'press', id: 'keyboard.e4' });
		expect(page(sim, 'aux-tape')).toMatchObject({ keys: [11], clip: '12' });
		sim.input({ type: 'release', id: 'keyboard.e4' });
		expect(page(sim, 'aux-tape')).toMatchObject({ keys: [], clip: '12' });
		// route track 3 into the tape on M2, with notes on steps 1 and 3
		sim.press('key.m2');
		sim.turn(3, 50);
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
	it('start with the delay on FX I and the reverb on FX II', () => {
		const fx1 = page(aux(7), 'aux-fx');
		expect(fx1).toMatchObject({ slot: 'FX I', type: 'delay' });
		expect(fx1.params.map((p) => p.label)).toEqual(['size', 'amount', 'fine', 'dry']);
		expect(fx1.params[0].value).toBe(DELAY_SIZES[3]);
		const fx2 = page(aux(8), 'aux-fx');
		expect(fx2).toMatchObject({ slot: 'FX II', type: 'reverb' });
		expect(fx2.params.map((p) => p.label)).toEqual(['size', 'modulation', 'rate', 'feedback']);
	});

	it('steps the delay size from micro to insane and turns the others 0–99', () => {
		const sim = aux(7);
		sim.turn(1, -10);
		expect(page(sim, 'aux-fx').params[0]).toMatchObject({ value: 'micro', level: 0 });
		sim.turn(1, 10);
		expect(page(sim, 'aux-fx').params[0]).toMatchObject({ value: 'insane', level: 1 });
		sim.turn(4, 60);
		expect(page(sim, 'aux-fx').params[3]).toMatchObject({ value: '99', level: 1 });
	});

	it('changes the effect with shift + T7 / T8, E4 and a click (or M1)', () => {
		const sim = aux(1);
		sim.combo('key.shift', 'track.8');
		expect(sim.state.auxTrack).toBe(7);
		const list = page(sim, 'list');
		expect(list.columns[1].items).toEqual([...FX_TYPES]);
		expect(list.columns[1].selected).toBe(FX_TYPES.indexOf('reverb'));
		sim.turn(1, -3);
		expect(page(sim, 'list').columns[1].selected).toBe(5);
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
		expect(page(sim, 'list').columns[1].selected).toBe(4);
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
		expect(sim.frame.page).toBe('list');
		sim.press('track.3');
		expect(page(sim, 'aux-cc').set).toBe('I');
		expect(sim.state.areas.auxiliary.picker).toBeNull();
	});

	it('route instrument tracks in through their FX sends, and FX I into FX II', () => {
		const sim = aux(8, 2);
		sim.click(1);
		sim.turn(1, 33);
		expect(sim.state.tracks[4].sends[3]).toBe(33);
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
	it('sets the high-pass with E1 and the low-pass with E4', () => {
		const sim = aux(6, 3);
		sim.turn(1, 33);
		sim.turn(4, -33);
		sim.turn(2, 10);
		expect(page(sim, 'aux-filter')).toEqual({
			page: 'aux-filter',
			highpass: 33 / 99,
			lowpass: 66 / 99
		});
		const ctx = record(sim);
		const boxes = ctx.fillsOf('#000000').filter((f) => f.y0 === 87.5 && f.y1 === 112.5);
		expect(boxes).toHaveLength(2);
		expect(ctx.fillsOf('#16161e').length).toBeGreaterThan(0);
	});

	it('closes the pass band when the cutoffs cross', () => {
		const sim = aux(6, 3);
		sim.turn(1, 99);
		sim.turn(4, -99);
		const ctx = record(sim);
		expect(ctx.fillsOf('#96969b')).toHaveLength(0);
	});

	it('runs speed, amount, destination and parameter over the track’s own modules', () => {
		const sim = aux(6, 4);
		expect(page(sim, 'aux-lfo')).toMatchObject({
			destinations: ['tape', 'filter'],
			destination: 0,
			parameterName: 'pitch',
			amount: 0,
			speed: { synced: true, label: '4' }
		});
		sim.turn(4, 2);
		expect(page(sim, 'aux-lfo').parameterName).toBe('length');
		sim.click(4);
		sim.click(4);
		expect(page(sim, 'aux-lfo').parameterName).toBe('pitch');
		sim.turn(3, 1);
		expect(page(sim, 'aux-lfo')).toMatchObject({ destination: 1, parameterName: 'high-pass' });
		// the filter page has no second or third encoder: the parameter skips to low-pass
		sim.turn(4, 1);
		expect(page(sim, 'aux-lfo')).toMatchObject({ parameterName: 'low-pass', parameter: 3 });
		sim.turn(1, 20);
		sim.turn(2, -99);
		expect(page(sim, 'aux-lfo').speed.synced).toBe(false);
		expect(page(sim, 'aux-lfo').amount).toBe(-100);
	});

	it('aims the external MIDI LFO at off or one of the CC sets', () => {
		const sim = aux(3, 4);
		const lfo = page(sim, 'aux-lfo');
		expect(lfo.destinations).toEqual(['off', 'set I', 'set II']);
		expect(lfo.parameterName).toBe('');
		expect(lfo.soft).toHaveLength(4);
		sim.turn(3, 1);
		expect(page(sim, 'aux-lfo').parameterName).toBe('slot 1');
		sim.state.areas.auxiliary.midi.slots[0].cc = 74;
		expect(page(sim, 'aux-lfo').parameterName).toBe('cc 74');
		// the FX tracks name their effect's parameters
		sim.press('track.8');
		sim.turn(4, 1);
		expect(page(sim, 'aux-lfo')).toMatchObject({ destinations: ['fx', 'filter'] });
		expect(page(sim, 'aux-lfo').parameterName).toBe('modulation');
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
		expect(page(run('aux-brain'), 'aux-brain')).toMatchObject({
			title: 'c lydian',
			root: 'c#',
			scale: 'lydian',
			link: '06',
			auto: true
		});
		expect(page(run('aux-brain-song'), 'aux-brain')).toMatchObject({
			title: 'c lydian',
			root: 'c#',
			link: null
		});
		expect(page(run('aux-midi'), 'aux-midi')).toMatchObject({ channel: '16', program: '8' });
		expect(page(run('aux-cv'), 'aux-cv').volts).toBeCloseTo(-3.92, 2);
		expect(page(run('aux-tape'), 'aux-tape')).toMatchObject({
			pitch: 'X2',
			speed: '84',
			length: '3',
			mix: '72',
			keys: [11, 13],
			clip: '12'
		});
		expect(page(run('aux-fx'), 'aux-fx').params.map((p) => p.label)).toEqual([
			'rate',
			'depth',
			'feedback',
			'stereo'
		]);
	});
});
