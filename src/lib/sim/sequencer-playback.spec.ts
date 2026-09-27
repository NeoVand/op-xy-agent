import { describe, expect, it } from 'vitest';
import {
	ARP_PATTERNS,
	ARP_STYLES,
	MAESTRO_PATTERNS,
	emptyPattern,
	setComponentValue,
	setLock,
	toggleStep,
	type ArpSettings,
	type Pattern
} from './sequencer';
import {
	BEND_SHAPES,
	CHROMATIC,
	COMPONENT_VELOCITIES,
	advancePlayhead,
	applyTonality,
	arpEvent,
	arpNoteAt,
	arpeggio,
	bendCurve,
	hasFlowComponents,
	jumpTarget,
	latchNotes,
	maestroEvents,
	maestroNotes,
	moveInScale,
	playheadAt,
	playsOnPass,
	quantisedOffset,
	rampDegrees,
	rampSpan,
	seededRng,
	snapToScale,
	startPlayhead,
	stepEvents,
	type MusicalScale,
	type Playhead
} from './sequencer-playback';

const MAJOR: MusicalScale = { root: 0, degrees: [0, 2, 4, 5, 7, 9, 11] };
/** A random source that always returns `x`. */
const fixed = (x: number) => () => x;

/** A pattern with `notes` on step `index`, and components (kind → digit) there. */
function withStep(
	index: number,
	notes: number[],
	components: Record<string, number> = {}
): Pattern {
	const p = emptyPattern();
	toggleStep(p, index, notes);
	for (const [kind, digit] of Object.entries(components)) {
		setComponentValue(p, [index], kind as Parameters<typeof setComponentValue>[2], digit);
	}
	return p;
}

describe('digit tables and scales', () => {
	it('seeds a repeatable random source', () => {
		const a = seededRng(7);
		const b = seededRng(7);
		const xs = [a(), a(), a()];
		expect([b(), b(), b()]).toEqual(xs);
		expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
		expect(seededRng(8)()).not.toBe(xs[0]);
	});

	it('lets skips through every pass, every Nth pass literally, or at random', () => {
		expect([1, 2, 3].map((p) => playsOnPass(1, p, fixed(0.9)))).toEqual([true, true, true]);
		expect([1, 2, 3, 4, 5, 6].map((p) => playsOnPass(3, p, fixed(0)))).toEqual([
			false,
			false,
			true,
			false,
			false,
			true
		]);
		expect(playsOnPass(0, 1, fixed(0.4))).toBe(true);
		expect(playsOnPass(0, 1, fixed(0.6))).toBe(false);
	});

	it('reads the ramp table: 1–5 within an octave, 6–9 and 0 over three', () => {
		expect([1, 2, 3, 4, 5].map(rampSpan)).toEqual(
			[2, 3, 4, 5, 6].map((stages) => ({ stages, octaves: 1 }))
		);
		expect([6, 7, 8, 9, 0].map(rampSpan)).toEqual(
			[2, 3, 4, 5, 6].map((stages) => ({ stages, octaves: 3 }))
		);
	});

	it('spreads ramp stages evenly from the note to the top octave, ends included', () => {
		const span = (stages: number, octaves = 1) => ({ stages, octaves });
		expect([0, 1].map((k) => rampDegrees(k, span(2)))).toEqual([0, 12]);
		expect([0, 1, 2].map((k) => rampDegrees(k, span(3)))).toEqual([0, 6, 12]);
		expect([0, 1, 2].map((k) => rampDegrees(k, span(3), MAJOR))).toEqual([0, 4, 7]);
		expect(rampDegrees(1, span(2, 3))).toBe(36);
	});

	it('moves along a scale by degrees and snaps onto it', () => {
		expect(moveInScale(60, 2, MAJOR)).toBe(64);
		expect(moveInScale(64, 4, MAJOR)).toBe(71);
		expect(moveInScale(60, 7, MAJOR)).toBe(72);
		expect(moveInScale(60, -1, MAJOR)).toBe(59);
		expect(moveInScale(61, 1, MAJOR)).toBe(62);
		expect(moveInScale(61, 0, MAJOR)).toBe(61);
		expect(moveInScale(60, 5)).toBe(65);
		expect(snapToScale(61, MAJOR)).toBe(60);
		expect(snapToScale(66, MAJOR)).toBe(65);
		expect(snapToScale(62, MAJOR)).toBe(62);
		expect(snapToScale(61)).toBe(61);
	});

	it('applies tonality intervals, by scale degrees when a scale is set', () => {
		const at = (digit: number, scale = CHROMATIC, rng = fixed(0)) =>
			applyTonality(60, digit, scale, rng);
		expect([1, 2, 3, 4, 5, 6, 7].map((d) => at(d))).toEqual([60, 60, 72, 67, 64, 61, 59]);
		expect(at(4, MAJOR)).toBe(67);
		expect(applyTonality(64, 5, MAJOR, fixed(0))).toBe(67);
		// quantise 33 / 66 / 100 snap with that chance
		expect(applyTonality(61, 8, MAJOR, fixed(0.2))).toBe(60);
		expect(applyTonality(61, 8, MAJOR, fixed(0.5))).toBe(61);
		expect(applyTonality(61, 9, MAJOR, fixed(0.5))).toBe(60);
		expect(applyTonality(61, 0, MAJOR, fixed(0.99))).toBe(60);
	});

	it('draws the bend shapes', () => {
		expect(BEND_SHAPES).toHaveLength(10);
		expect(bendCurve('down-up', 0.5)).toBeCloseTo(-1);
		expect(bendCurve('down-up', 0)).toBeCloseTo(0);
		expect(bendCurve('up-down', 0.5)).toBeCloseTo(1);
		expect(bendCurve('bump down', 0.125)).toBeCloseTo(-1);
		expect(bendCurve('bump up', 0.6)).toBe(0);
		expect(bendCurve('spring out', 1 / 12)).toBeCloseTo(1 - 1 / 12);
		expect(Math.abs(bendCurve('spring in', 1 / 12))).toBeLessThan(0.1);
		expect(bendCurve('fade down', 1)).toBe(-1);
		expect(bendCurve('fade up', 2)).toBe(1);
		expect(bendCurve('random 1', 0.3, 0.75)).toBe(0.5);
		expect(bendCurve('random 2', 0.5, 0)).toBe(-0.5);
	});

	it('finds jump targets within the bar that plays', () => {
		expect([1, 2, 3, 4].map((d) => jumpTarget(d, 21, 64, fixed(0)))).toEqual([16, 20, 24, 28]);
		expect(jumpTarget(4, 5, 12, fixed(0))).toBe(0);
		expect(jumpTarget(5, 15, 16, fixed(0))).toBe(1);
		expect(jumpTarget(6, 0, 16, fixed(0))).toBe(15);
		expect(jumpTarget(7, 4, 16, fixed(0.2))).toBe(6);
		expect(jumpTarget(7, 4, 16, fixed(0.8))).toBe(3);
		expect(jumpTarget(8, 4, 16, fixed(0))).toBe(4);
		expect(jumpTarget(9, 4, 16, fixed(0))).toBe('align');
		expect(jumpTarget(0, 4, 16, fixed(0.5))).toBe(8);
	});
});

describe('stepEvents: one step on one pass (manual: sequencer/step-component-reference)', () => {
	it('plays the notes with quantised timing, their velocity and length', () => {
		const p = emptyPattern();
		p.steps[2].notes = [{ note: 60, velocity: 90, length: 0.5, offset: 0.3 }];
		expect(stepEvents(p, 2, 1).notes).toEqual([
			{ note: 60, velocity: 90, time: 0, length: 0.5, glide: 0, bend: null }
		]);
		p.quantise = 50;
		expect(stepEvents(p, 2, 1).notes[0].time).toBeCloseTo(0.15);
		p.quantiseOn = false;
		expect(stepEvents(p, 2, 1).notes[0].time).toBeCloseTo(0.3);
		expect(quantisedOffset(p, -0.2)).toBe(-0.2);
		expect(stepEvents(p, 5, 1).notes).toEqual([]);
		expect(stepEvents(p, 40, 1)).toMatchObject({ notes: [], repeats: 0, jump: null });
	});

	it('forces velocities, 0 at random', () => {
		const vel = (digit: number, rng = fixed(0)) =>
			stepEvents(withStep(0, [60], { velocity: digit }), 0, 1, rng).notes[0].velocity;
		expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => vel(d))).toEqual([...COMPONENT_VELOCITIES]);
		expect(vel(0, fixed(0))).toBe(1);
		expect(vel(0, fixed(0.999))).toBe(127);
	});

	it('splits a step into equal hits with multiply', () => {
		const notes = stepEvents(withStep(0, [60], { multiply: 3 }), 0, 1).notes;
		expect(notes.map((n) => n.time)).toEqual([0, 1 / 3, 2 / 3]);
		expect(notes[0].length).toBeCloseTo(0.5 / 3);
		expect(stepEvents(withStep(0, [60], { multiply: 9 }), 0, 1).notes).toHaveLength(9);
		expect(stepEvents(withStep(0, [60], { multiply: 0 }), 0, 1, fixed(0.99)).notes).toHaveLength(8);
		// a chord's hits are in time order
		const chord = stepEvents(withStep(0, [60, 64], { multiply: 2 }), 0, 1).notes;
		expect(chord.map((n) => [n.note, n.time])).toEqual([
			[60, 0],
			[64, 0],
			[60, 0.5],
			[64, 0.5]
		]);
	});

	it('reports pulse repeats and pulse hold, which stretches the notes', () => {
		expect(stepEvents(withStep(0, [60], { pulse: 2 }), 0, 1)).toMatchObject({
			repeats: 2,
			hold: 0
		});
		expect(stepEvents(withStep(0, [60], { pulse: 0 }), 0, 1, fixed(0)).repeats).toBe(1);
		const held = stepEvents(withStep(0, [60], { 'pulse hold': 3 }), 0, 1);
		expect(held).toMatchObject({ repeats: 0, hold: 3 });
		expect(held.notes[0].length).toBe(4);
	});

	it('climbs and falls with the ramps, pass by pass, and wraps', () => {
		const up = withStep(0, [60], { 'ramp up': 1 });
		expect([1, 2, 3].map((pass) => stepEvents(up, 0, pass).notes[0].note)).toEqual([60, 72, 60]);
		const down = withStep(0, [60], { 'ramp down': 2 });
		expect([1, 2, 3, 4].map((pass) => stepEvents(down, 0, pass).notes[0].note)).toEqual([
			60, 54, 48, 60
		]);
		const inScale = withStep(0, [60], { 'ramp up': 3 });
		expect(
			[1, 2, 3, 4].map(
				(pass) => stepEvents(inScale, 0, pass, fixed(0), { scale: MAJOR }).notes[0].note
			)
		).toEqual([60, 64, 69, 72]);
	});

	it('picks random notes from the ramp stages', () => {
		const p = withStep(0, [60], { random: 5 });
		expect(stepEvents(p, 0, 1, fixed(0)).notes[0].note).toBe(60);
		expect(stepEvents(p, 0, 1, fixed(0.99)).notes[0].note).toBe(72);
		// six stages over an octave: stage 3 of 0–5 is 7.2 semitones up, rounded
		expect(stepEvents(p, 0, 1, fixed(0.5)).notes[0].note).toBe(67);
	});

	it('adds glide, bend and tonality; notes pushed past MIDI range are dropped', () => {
		const glide = stepEvents(withStep(0, [60], { portamento: 5 }), 0, 1).notes[0];
		expect(glide.glide).toBe(0.5);
		expect(stepEvents(withStep(0, [60], { portamento: 0 }), 0, 1, fixed(0)).notes[0].glide).toBe(
			0.1
		);
		const bent = stepEvents(withStep(0, [60], { bend: 1 }), 0, 1, fixed(0.25)).notes[0];
		expect(bent.bend).toEqual({ shape: 'down-up', random: 0.25 });
		expect(stepEvents(withStep(0, [60], { bend: 0 }), 0, 1).notes[0].bend?.shape).toBe('random 2');
		expect(stepEvents(withStep(0, [60], { tonality: 4 }), 0, 1).notes[0].note).toBe(67);
		expect(stepEvents(withStep(0, [120], { tonality: 3 }), 0, 1).notes).toEqual([]);
	});

	it('resolves jumps', () => {
		expect(stepEvents(withStep(5, [60], { jump: 1 }), 5, 1).jump).toBe(0);
		expect(stepEvents(withStep(5, [60], { jump: 9 }), 5, 1).jump).toBe('align');
		expect(stepEvents(withStep(5, [60]), 5, 1).jump).toBeNull();
	});

	it('skip trigger lets the notes sound only on every Nth pass', () => {
		const p = withStep(0, [60], { 'skip trigger': 2 });
		expect([1, 2, 3, 4].map((pass) => stepEvents(p, 0, pass).notes.length)).toEqual([0, 1, 0, 1]);
		expect(stepEvents(withStep(0, [60], { 'skip trigger': 0 }), 0, 1, fixed(0.7)).notes).toEqual(
			[]
		);
	});

	it('skip parameter lock holds the locks back except on every Nth pass', () => {
		const p = withStep(0, [60], { 'skip parameter lock': 3 });
		setLock(p, 0, 'filter.cutoff', 12);
		expect([1, 2, 3].map((pass) => stepEvents(p, 0, pass).locks)).toEqual([
			{},
			{},
			{ 'filter.cutoff': 12 }
		]);
		// without the component, locks apply on every pass, also on a step without notes
		const q = emptyPattern();
		setLock(q, 4, 'm1.1', 3);
		expect(stepEvents(q, 4, 1)).toMatchObject({ notes: [], locks: { 'm1.1': 3 } });
	});

	it('skip step component switches the other components off on the passes it skips', () => {
		const p = withStep(0, [60], { 'skip step component': 2, multiply: 4, 'skip trigger': 3 });
		setLock(p, 0, 'lfo.amount', 9);
		const first = stepEvents(p, 0, 1);
		expect(first).toMatchObject({ components: false, locks: { 'lfo.amount': 9 } });
		expect(first.notes).toHaveLength(1); // no ratchet, and skip trigger did not act
		const second = stepEvents(p, 0, 2);
		expect(second.components).toBe(true);
		expect(second.notes).toHaveLength(0); // skip trigger acts: pass 2 is not a 3rd
		const sixth = stepEvents(p, 0, 6);
		expect(sixth.notes).toHaveLength(4);
	});
});

describe('the walk (pulse, pulse hold, jump) and playheadAt', () => {
	/** Steps played over `n` slots, with null for a slot a held step waits through. */
	function walk(p: Pattern, n: number, rng = fixed(0)) {
		let head: Playhead = startPlayhead();
		const out: (number | null)[] = [];
		for (let i = 0; i < n; i++) {
			const slot = advancePlayhead(p, head, rng);
			head = slot.head;
			out.push(slot.play ? head.step : null);
		}
		return { steps: out, head };
	}

	it('walks the steps in order, wrapping at the length and counting passes', () => {
		const p = emptyPattern();
		p.length = 3;
		const { steps, head } = walk(p, 7);
		expect(steps).toEqual([0, 1, 2, 0, 1, 2, 0]);
		expect(head.passes).toEqual([3, 2, 2]);
		expect(head.clock).toBe(6);
		expect(hasFlowComponents(p)).toBe(false);
	});

	it('repeats a pulsed step and waits on a held one', () => {
		const p = withStep(1, [60], { pulse: 2 });
		p.length = 4;
		const pulsed = walk(p, 6);
		expect(pulsed.steps).toEqual([0, 1, 1, 1, 2, 3]);
		// the repeats are the same pass
		expect(pulsed.head.passes[1]).toBe(1);
		const q = withStep(0, [60], { 'pulse hold': 2 });
		q.length = 3;
		expect(walk(q, 6).steps).toEqual([0, null, null, 1, 2, 0]);
	});

	it('jumps, and realigns with the clock', () => {
		const p = withStep(3, [60], { jump: 1 });
		p.length = 8;
		expect(walk(p, 9).steps).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0]);
		const q = withStep(0, [60], { pulse: 2 });
		setComponentValue(q, [1], 'jump', 9);
		q.length = 8;
		expect(walk(q, 6).steps).toEqual([0, 0, 0, 1, 4, 5]);
	});

	it('lets skip step component switch a jump off on some passes', () => {
		const p = withStep(1, [60], { jump: 1, 'skip step component': 2 });
		p.length = 4;
		expect(walk(p, 9).steps).toEqual([0, 1, 2, 3, 0, 1, 0, 1, 2]);
	});

	it('finds the playing step for the LEDs, stable from call to call', () => {
		const plain = emptyPattern();
		plain.scale = 2;
		expect(playheadAt(plain, 5)).toBe(2);
		expect(playheadAt(plain, -3)).toBe(14);
		const p = withStep(1, [60], { pulse: 2 });
		p.length = 4;
		expect([0, 1, 2, 3, 4, 5].map((pos) => playheadAt(p, pos))).toEqual([0, 1, 1, 1, 2, 3]);
		const random = withStep(2, [60], { jump: 0 });
		expect(playheadAt(random, 40)).toBe(playheadAt(random, 40));
	});
});

describe('players (manual: players/*)', () => {
	const arp = (over: Partial<ArpSettings> = {}): ArpSettings => ({
		speed: 2,
		pattern: 0,
		range: 1,
		hold: false,
		length: 50,
		style: 0,
		glide: 0,
		stereo: 0,
		...over
	});
	const pattern = (name: (typeof ARP_PATTERNS)[number]) => ARP_PATTERNS.indexOf(name);
	const style = (name: (typeof ARP_STYLES)[number]) => ARP_STYLES.indexOf(name);

	it('orders the arpeggio by its pattern over its range', () => {
		const held = [64, 60, 67];
		expect(arpeggio(held, arp())).toEqual([60, 64, 67]);
		expect(arpeggio(held, arp({ range: 2 }))).toEqual([60, 64, 67, 72, 76, 79]);
		expect(arpeggio(held, arp({ pattern: pattern('down') }))).toEqual([67, 64, 60]);
		expect(arpeggio(held, arp({ pattern: pattern('up/down') }))).toEqual([60, 64, 67, 64]);
		expect(arpeggio([60, 62], arp({ pattern: pattern('up/down') }))).toEqual([60, 62]);
		expect(arpeggio(held, arp({ pattern: pattern('up/repeat/down') }))).toEqual([
			60, 64, 67, 67, 64, 60
		]);
		expect(arpeggio(held, arp({ pattern: pattern('play order') }))).toEqual([64, 60, 67]);
		const random = arpeggio(held, arp({ pattern: pattern('random') }), seededRng(3));
		expect([...random].sort()).toEqual([60, 64, 67]);
		expect(arpeggio([], arp())).toEqual([]);
		expect(arpeggio([120], arp({ range: 2 }))).toEqual([120]);
	});

	it('reorders by style: converge, diverge, pinky, thumb', () => {
		const held = [60, 62, 64, 65];
		expect(arpeggio(held, arp({ style: style('converge') }))).toEqual([60, 65, 62, 64]);
		expect(arpeggio(held, arp({ style: style('diverge') }))).toEqual([64, 62, 65, 60]);
		expect(arpeggio(held, arp({ style: style('pinky') }))).toEqual([60, 65, 62, 65, 64, 65]);
		expect(arpeggio(held, arp({ style: style('thumb') }))).toEqual([60, 62, 60, 64, 60, 65]);
	});

	it('times the arpeggio: step length, note length, glide and alternating pan', () => {
		const a = arp({ speed: 4, length: 25, glide: 99, stereo: 99 }); // eighths
		expect(arpEvent([60, 64], a, 0)).toEqual({ note: 60, time: 0, length: 0.5, glide: 1, pan: -1 });
		expect(arpEvent([60, 64], a, 3)).toMatchObject({ note: 64, time: 6, pan: 1 });
		expect(arpEvent([], a, 0)).toBeNull();
		expect(arpNoteAt([60, 64, 67], arp(), 4.5)).toBe(64);
		expect(arpNoteAt([60, 64, 67], arp(), -1)).toBeNull();
		// a random pattern reshuffles every cycle, repeatably
		const r = arp({ pattern: pattern('random') });
		expect(arpEvent([60, 64, 67], r, 5, 9)).toEqual(arpEvent([60, 64, 67], r, 5, 9));
	});

	it('moves the maestro chord to the key pressed and strums it', () => {
		expect(maestroNotes([60, 64, 67], 62)).toEqual([62, 66, 69]);
		expect(maestroNotes([64, 60], 60)).toEqual([60, 64]);
		expect(maestroNotes([], 70)).toEqual([70]);
		expect(maestroNotes([60, 72], 120)).toEqual([120]);
		const m = { roll: 99, pattern: 0, hold: false, chord: [60, 64, 67] };
		expect(maestroEvents(m.chord, 60, m)).toEqual([
			{ note: 60, time: 0 },
			{ note: 64, time: 0.25 },
			{ note: 67, time: 0.5 }
		]);
		const down = { ...m, pattern: MAESTRO_PATTERNS.indexOf('down'), roll: 0 };
		expect(maestroEvents(m.chord, 60, down).map((e) => e.note)).toEqual([67, 64, 60]);
		expect(maestroEvents(m.chord, 60, down).every((e) => e.time === 0)).toBe(true);
		const upDown = { ...m, pattern: MAESTRO_PATTERNS.indexOf('up/down') };
		expect(maestroEvents(m.chord, 60, upDown, 1).map((e) => e.note)).toEqual([67, 64, 60]);
		const random = { ...m, pattern: MAESTRO_PATTERNS.indexOf('random') };
		expect(
			maestroEvents(m.chord, 60, random, 0, seededRng(1))
				.map((e) => e.note)
				.sort()
		).toEqual([60, 64, 67]);
	});

	it('latches the hold player: a fresh press starts a new set, held ones join it', () => {
		expect(latchNotes([60, 64], [], 67)).toEqual([67]);
		expect(latchNotes([67], [67], 71)).toEqual([67, 71]);
		expect(latchNotes([67, 71], [67], 71)).toEqual([67, 71]);
	});
});
