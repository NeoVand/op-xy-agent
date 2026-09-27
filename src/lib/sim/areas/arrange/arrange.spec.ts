import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import { SCENARIOS } from '../../scenarios';
import { COLORS, RAMP } from '../../screen/palette';
import { RecordingContext } from '../../screen/recording';
import { describeFrame, renderFrame } from '../../screen/render';
import { MAX_PATTERNS, currentPattern, emptyPattern } from '../../sequencer';
import type { PatternsFrame } from './frames';
import { accidentalKey, sceneLength } from './model';
import { PATTERN_KEYS } from './state';
import { previewDots } from './view';

/** A fresh simulator in arrange mode (instrument tracks, T1 selected). */
function arrange(): OpxySim {
	const sim = new OpxySim({ now: () => 0 });
	sim.press('key.arrange');
	return sim;
}

/** Holds shift while pressing each key in turn. */
function withShift(sim: OpxySim, ...ids: string[]): void {
	sim.input({ type: 'press', id: 'key.shift' });
	for (const id of ids) sim.press(id);
	sim.input({ type: 'release', id: 'key.shift' });
}

/** The module key of a pattern action. */
const key = (action: (typeof PATTERN_KEYS)[number]) => `key.m${PATTERN_KEYS.indexOf(action) + 1}`;

/** The arrange frame (fails on another page). */
function frame(sim: OpxySim): PatternsFrame {
	const f = sim.frame;
	expect(f.page).toBe('arrange');
	return f as PatternsFrame;
}

/** Moves time by `steps` sixteenths in frame-sized slices (0.2 of a step each). */
function play(sim: OpxySim, steps: number): void {
	const stepMs = 60000 / sim.state.tempo.bpm / 4;
	for (let i = 0; i < steps * 5; i++) sim.advance(stepMs / 5);
}

const t1 = (sim: OpxySim) => sim.state.tracks[0].sequence;

describe('arrange mode: the page', () => {
	it('shows scene 1 and the instrument tracks, T1 selected, with the pattern keys labelled', () => {
		const sim = arrange();
		const f = frame(sim);
		expect(f).toMatchObject({ bank: 'instrument', scene: '1', queued: null });
		expect(f.columns.map((c) => c.label)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
		expect(f.columns.map((c) => c.selected)).toEqual([true, ...Array(7).fill(false)]);
		expect(f.soft.map((l) => l?.text)).toEqual([...PATTERN_KEYS]);
		expect(f.soft[PATTERN_KEYS.indexOf('new')]?.tone).toBe('white');
		sim.input({ type: 'press', id: 'key.shift' });
		expect(frame(sim).soft.map((l) => l?.text)).toEqual(['clone', 'copy', 'paste', 'reset']);
	});

	it('flips to the auxiliary tracks when arrange is pressed again, with their pictograms', () => {
		const sim = arrange();
		sim.press('key.arrange');
		const f = frame(sim);
		expect(f.bank).toBe('auxiliary');
		expect(f.columns.map((c) => c.name)).toEqual([
			'brain',
			'punch-in fx',
			'external midi',
			'external cv',
			'external audio',
			'tape',
			'fx I',
			'fx II'
		]);
		expect(f.columns[5].icon).toBe('arrange.aux.tape');
		sim.press('track.6');
		expect(frame(sim).columns[5].selected).toBe(true);
		expect(sim.leds['track.6']).toBe('red');
	});

	it('puts each track’s pattern on the band in its ramp step; a black cell is edged', () => {
		const sim = arrange();
		sim.press('track.2');
		const f = frame(sim);
		const closed = f.columns[2];
		expect(closed.cells).toHaveLength(1);
		expect(closed.cells[0]).toMatchObject({ y: 100, color: RAMP[2], number: null, outline: false });
		expect(f.columns[0].cells[0]).toMatchObject({ y: 100, color: RAMP[0], outline: true });
	});

	it('opens the selected track’s stack 10 px up, each pattern a ramp step lighter and numbered', () => {
		const sim = arrange();
		sim.press('track.6');
		sim.press(key('new'));
		sim.press(key('new'));
		sim.turn(4, -1);
		const tape = frame(sim).columns[5];
		expect(tape.cells.map((c) => [c.y, c.color, c.number])).toEqual([
			[60, RAMP[5], 1],
			[90, RAMP[6], 2],
			[120, RAMP[7], 3]
		]);
		expect(tape.cells.map((c) => c.ink)).toEqual([COLORS.black, COLORS.black, COLORS.black]);
		expect(tape).toMatchObject({ pattern: 2, patterns: 3, above: 0, below: 0 });
	});

	it('draws stack edges on closed tracks for the patterns before and after the one playing', () => {
		const sim = arrange();
		sim.press('track.3');
		for (let i = 0; i < 4; i++) sim.press(key('new'));
		sim.turn(4, -2); // pattern 3 of 5
		sim.press('track.1');
		expect(frame(sim).columns[2]).toMatchObject({ above: 2, below: 2, pattern: 3 });
		sim.press('track.3');
		sim.turn(4, 10);
		sim.press('track.1');
		expect(frame(sim).columns[2]).toMatchObject({ above: 3, below: 0 });
	});

	it('shows a pattern’s notes as a tiny piano roll, and its number, on a closed track', () => {
		const sim = arrange();
		const steps = sim.state.tracks[1].sequence.patterns[0].steps;
		steps[0].notes = [{ note: 60, velocity: 100, length: 1, offset: 0 }];
		steps[8].notes = [{ note: 64, velocity: 100, length: 1, offset: 0 }];
		const cell = frame(sim).columns[1].cells[0];
		expect(cell.number).toBe(1);
		expect(cell.dots).toHaveLength(2);
		const [[x0, y0], [x1, y1]] = cell.dots;
		expect(x1 - x0).toBeCloseTo(8 * 2.8333, 1);
		expect(y0 - y1).toBeCloseTo(4 * 2.125, 1);
		expect(previewDots(emptyPattern())).toEqual([]);
	});

	it('hatches a muted track, marks a linked one and describes the page', () => {
		const sim = arrange();
		sim.click(4);
		sim.turn(3, 1);
		const f = frame(sim);
		expect(f.columns[0]).toMatchObject({ muted: true, linked: true });
		expect(describeFrame(f)).toBe(
			'arrange, scene 1, instrument tracks, T1 pattern 1 of 1, sound link, muted'
		);
	});
});

describe('arrange mode: patterns (manual: arrange/patterns, arrange/overview)', () => {
	it('adds patterns up to 16 with new; each new one plays; E4 steps through them', () => {
		const sim = arrange();
		for (let i = 0; i < 20; i++) sim.press(key('new'));
		expect(t1(sim).patterns).toHaveLength(MAX_PATTERNS);
		expect(t1(sim).current).toBe(15);
		sim.turn(4, -3);
		expect(t1(sim).current).toBe(12);
		sim.turn(4, -40);
		expect(t1(sim).current).toBe(0);
		expect(sim.state.mode).toBe('arrange');
	});

	it('shows the new pattern on the step keys (the step keys follow the pattern playing)', () => {
		const sim = arrange();
		sim.press('step.1');
		expect(sim.leds['step.1']).toBe('white');
		sim.press(key('new'));
		expect(sim.leds['step.1']).toBe('off');
		sim.turn(4, -1);
		expect(sim.leds['step.1']).toBe('white');
	});

	it('copies a pattern and pastes it over an empty one, or as a new pattern after a full one', () => {
		const sim = arrange();
		sim.press('step.1');
		sim.press(key('copy'));
		sim.press('track.2');
		sim.press(key('paste'));
		const t2 = sim.state.tracks[1].sequence;
		expect(t2.patterns).toHaveLength(1);
		expect(currentPattern(t2).steps[0].notes).toHaveLength(1);
		sim.press(key('paste'));
		expect(t2.patterns).toHaveLength(2);
		expect(t2.current).toBe(1);
	});

	it('pastes the whole sound: the engine comes along, and the track’s own pattern keeps its own', () => {
		const sim = arrange();
		sim.press('track.3'); // prism
		sim.press('step.1');
		sim.press(key('copy'));
		sim.press('track.4'); // epiano
		sim.press('step.1');
		sim.press(key('paste'));
		const t4 = sim.state.tracks[3];
		expect(t4.sequence.patterns).toHaveLength(2);
		expect(t4.engine).toBe('prism');
		sim.turn(4, -1);
		expect(t4.engine).toBe('epiano');
		sim.turn(4, 1);
		expect(t4.engine).toBe('prism');
	});

	it('keeps edits to a pattern’s sound with that pattern', () => {
		const sim = arrange();
		sim.press('track.3');
		sim.press(key('new'));
		const t3 = sim.state.tracks[2];
		t3.m1[0] = 12;
		sim.turn(4, -1);
		expect(t3.m1[0]).toBe(80);
		sim.turn(4, 1);
		expect(t3.m1[0]).toBe(12);
	});

	it('clears a pattern: the one before plays next; the last one left is emptied', () => {
		const sim = arrange();
		sim.press(key('new'));
		sim.press(key('new'));
		currentPattern(t1(sim)).steps[3].notes = [{ note: 60, velocity: 100, length: 1, offset: 0 }];
		sim.press(key('clear'));
		expect(t1(sim).patterns).toHaveLength(2);
		expect(t1(sim).current).toBe(1);
		sim.press(key('clear'));
		sim.press('step.1');
		sim.press(key('clear'));
		expect(t1(sim).patterns).toHaveLength(1);
		expect(currentPattern(t1(sim)).steps[0].notes).toHaveLength(0);
	});

	it('moves scenes that played later patterns down when a pattern goes', () => {
		const sim = arrange();
		sim.press(key('new'));
		sim.press(key('new')); // T1 plays pattern 3
		withShift(sim, accidentalKey(2)); // scene 2 copies scene 1: pattern 3
		withShift(sim, accidentalKey(1));
		sim.turn(4, -2); // scene 1: pattern 1
		sim.press(key('clear')); // pattern 1 goes: patterns 2 and 3 become 1 and 2
		withShift(sim, accidentalKey(2));
		expect(t1(sim).current).toBe(1);
	});

	it('mutes the selected track with a click on E4', () => {
		const sim = arrange();
		sim.press('track.5');
		sim.click(4);
		expect(sim.state.tracks[4].mix.muted).toBe(true);
		sim.click(4);
		expect(sim.state.tracks[4].mix.muted).toBe(false);
	});
});

describe('arrange mode: sound link (manual: arrange/sound-link)', () => {
	/** T3 with two patterns: prism on the first, dissolve on the second. */
	function twoSounds(): OpxySim {
		const sim = arrange();
		sim.press('track.3');
		sim.press(key('new'));
		const t3 = sim.state.tracks[2];
		t3.engine = 'dissolve';
		sim.turn(4, -1);
		expect(t3.engine).toBe('prism');
		return sim;
	}

	it('keeps the source pattern’s sound whatever pattern plays, and gives each its own back when off', () => {
		const sim = twoSounds();
		const t3 = sim.state.tracks[2];
		sim.turn(3, 1); // link on: the source is pattern 1
		sim.turn(4, 1);
		expect(t3.engine).toBe('prism');
		sim.click(3); // off
		expect(t3.engine).toBe('dissolve');
		expect(sim.state.areas.arrange.link[2].on).toBe(false);
	});

	it('takes the pattern playing as the source with shift + E3', () => {
		const sim = twoSounds();
		const t3 = sim.state.tracks[2];
		sim.turn(4, 1); // pattern 2: dissolve
		sim.input({ type: 'press', id: 'key.shift' });
		sim.turn(3, 1);
		sim.input({ type: 'release', id: 'key.shift' });
		expect(sim.state.areas.arrange.link[2]).toEqual({ on: true, source: 1 });
		sim.turn(4, -1);
		expect(t3.engine).toBe('dissolve');
	});
});

describe('arrange mode: scenes (manual: arrange/scenes)', () => {
	it('selects scenes 1–9 with shift + a black key; an empty scene starts as a copy', () => {
		const sim = arrange();
		sim.press(key('new')); // T1 plays pattern 2 in scene 1
		sim.state.tracks[1].mix.muted = true;
		withShift(sim, accidentalKey(4));
		expect(frame(sim).scene).toBe('4');
		expect(t1(sim).current).toBe(1);
		sim.turn(4, -1); // scene 4: pattern 1
		sim.press('track.2');
		sim.click(4); // scene 4 unmutes T2
		withShift(sim, accidentalKey(1));
		expect(t1(sim).current).toBe(1);
		expect(sim.state.tracks[1].mix.muted).toBe(true);
		withShift(sim, accidentalKey(4));
		expect(t1(sim).current).toBe(0);
		expect(sim.state.tracks[1].mix.muted).toBe(false);
	});

	it('brings each scene’s patterns with their sounds', () => {
		const sim = arrange();
		sim.press('track.3');
		sim.press(key('new')); // scene 1: T3 plays pattern 2 …
		sim.state.tracks[2].engine = 'dissolve'; // … with dissolve
		withShift(sim, accidentalKey(2));
		sim.turn(4, -1); // scene 2: pattern 1, still prism
		expect(sim.state.tracks[2].engine).toBe('prism');
		withShift(sim, accidentalKey(1));
		expect(sim.state.tracks[2].engine).toBe('dissolve');
		withShift(sim, accidentalKey(2));
		expect(sim.state.tracks[2].engine).toBe('prism');
	});

	it('reaches scenes 10–99 with shift + accidental 0 and two digits, shown as they are typed', () => {
		const sim = arrange();
		withShift(sim, accidentalKey(0));
		expect(frame(sim).scene).toBe('--');
		sim.press(accidentalKey(4)); // the digits work without shift too
		expect(frame(sim).scene).toBe('4-');
		sim.press(accidentalKey(2));
		expect(frame(sim).scene).toBe('42');
		expect(sim.state.areas.arrange.scene).toBe(41);
		withShift(sim, accidentalKey(0), accidentalKey(1));
		sim.press('track.3'); // anything else leaves the number unfinished
		expect(frame(sim).scene).toBe('42');
		expect(sim.state.areas.arrange.entry).toBeNull();
		withShift(sim, accidentalKey(0), accidentalKey(0), accidentalKey(0));
		expect(frame(sim).scene).toBe('42');
	});

	it('clones the scene into the next empty one, copies and pastes scenes, and resets one', () => {
		const sim = arrange();
		sim.press(key('new'));
		withShift(sim, 'key.m1'); // clone → scene 2
		expect(frame(sim).scene).toBe('2');
		withShift(sim, accidentalKey(3)); // scene 3 (a copy too)
		withShift(sim, accidentalKey(1));
		withShift(sim, 'key.m1'); // scenes 2 and 3 are used: clone → scene 4
		expect(frame(sim).scene).toBe('4');
		sim.turn(4, -1);
		withShift(sim, 'key.m2'); // copy scene 4 (pattern 1)
		withShift(sim, accidentalKey(2));
		expect(t1(sim).current).toBe(1);
		withShift(sim, 'key.m3'); // paste over scene 2
		expect(t1(sim).current).toBe(0);
		sim.turn(4, 1);
		withShift(sim, 'key.m4'); // reset: every track on pattern 1
		expect(t1(sim).current).toBe(0);
	});

	it('works out a scene’s length: longest pattern, shortest, or a bar of the time signature', () => {
		const sim = arrange();
		const s = sim.state;
		expect(sceneLength(s)).toBe(16);
		const long = s.tracks[2].sequence.patterns[0];
		long.length = 48;
		long.steps[40].notes = [{ note: 60, velocity: 100, length: 1, offset: 0 }];
		const slow = s.tracks[3].sequence.patterns[0];
		slow.scale = 2;
		slow.length = 12;
		slow.steps[0].notes = [{ note: 60, velocity: 100, length: 1, offset: 0 }];
		expect(sceneLength(s)).toBe(48);
		s.areas.arrange.sceneLength = 'shortest';
		expect(sceneLength(s)).toBe(24);
		s.areas.arrange.sceneLength = 'time signature';
		s.areas.arrange.timeSignature = '7/8';
		expect(sceneLength(s)).toBe(14);
	});
});

describe('arrange mode: the scene queue (manual: arrange/scene-queue)', () => {
	it('queues a scene after shift + play, and switches when the scene ends', () => {
		const sim = arrange();
		sim.press(key('new')); // scene 1: T1 pattern 2
		withShift(sim, accidentalKey(3));
		sim.turn(4, -1); // scene 3: T1 pattern 1
		withShift(sim, accidentalKey(1));
		sim.press('key.play');
		play(sim, 5);
		withShift(sim, 'key.play', accidentalKey(3));
		expect(sim.state.transport.playing).toBe(true);
		expect(frame(sim)).toMatchObject({ scene: '1', queued: '3' });
		play(sim, 10.6);
		expect(frame(sim).scene).toBe('1');
		play(sim, 0.6);
		expect(frame(sim)).toMatchObject({ scene: '3', queued: null });
		expect(t1(sim).current).toBe(0);
		expect(sim.state.transport.position).toBeLessThan(1);
	});

	it('shows an empty box while shift + play waits, and switches at once when stopped', () => {
		const sim = arrange();
		sim.input({ type: 'press', id: 'key.shift' });
		sim.press('key.play');
		expect(frame(sim).queued).toBe('');
		expect(sim.state.transport.playing).toBe(false);
		sim.press(accidentalKey(5));
		sim.input({ type: 'release', id: 'key.shift' });
		expect(frame(sim)).toMatchObject({ scene: '5', queued: null });
	});

	it('forgets the queue on stop, and the waiting when shift comes up', () => {
		const sim = arrange();
		sim.press('key.play');
		withShift(sim, 'key.play');
		expect(sim.state.areas.arrange.armed).toBe(false);
		withShift(sim, 'key.play', accidentalKey(0), accidentalKey(2));
		expect(frame(sim).queued).toBe('2-');
		withShift(sim, accidentalKey(7));
		expect(frame(sim).queued).toBe('27');
		sim.press('key.stop');
		expect(frame(sim).queued).toBeNull();
	});
});

describe('arrange mode: LEDs while shift is held', () => {
	it('spells the scene on the black keys, a queued one in red', () => {
		const sim = arrange();
		withShift(sim, accidentalKey(0), accidentalKey(2), accidentalKey(3));
		sim.input({ type: 'press', id: 'key.shift' });
		expect(sim.leds[accidentalKey(2)]).toBe('white');
		expect(sim.leds[accidentalKey(3)]).toBe('white');
		expect(sim.leds[accidentalKey(1)]).toBe('off');
		sim.input({ type: 'release', id: 'key.shift' });
		expect(sim.leds[accidentalKey(2)]).toBe('off');
		sim.press('key.play');
		withShift(sim, 'key.play', accidentalKey(6));
		sim.input({ type: 'press', id: 'key.shift' });
		expect(sim.leds[accidentalKey(6)]).toBe('red');
	});

	it('lights accidental 0 and the digits typed while a scene number is entered', () => {
		const sim = arrange();
		withShift(sim, accidentalKey(0));
		expect(sim.leds[accidentalKey(0)]).toBe('white');
		sim.input({ type: 'press', id: accidentalKey(3) });
		sim.input({ type: 'release', id: accidentalKey(3) });
		expect([sim.leds[accidentalKey(0)], sim.leds[accidentalKey(3)]]).toEqual(['white', 'white']);
		sim.press(accidentalKey(1));
		expect(sim.leds[accidentalKey(0)]).toBe('off');
		expect(frame(sim).scene).toBe('31');
	});
});

describe('arrange drawing', () => {
	it('draws the red scene box, the column cells and the pictograms', () => {
		const sim = arrange();
		sim.press('key.arrange');
		const ctx = new RecordingContext();
		renderFrame(ctx, sim.frame);
		expect(ctx.fills.some((f) => f.color === COLORS.red && f.x0 === 215 && f.y1 === 70)).toBe(true);
		for (const color of RAMP.slice(1)) {
			expect(ctx.fills.some((f) => f.color === color && f.y0 === 100 && f.y1 === 130)).toBe(true);
		}
		// the brain pictogram of the selected T1 is lit
		expect(
			ctx.fills.some((f) => f.color === COLORS.white && f.x0 >= 20 && f.x1 <= 40 && f.y1 <= 26)
		).toBe(true);
	});

	it('draws every scenario of the area on its page', () => {
		const ids = SCENARIOS.filter((s) => s.id.startsWith('arrange')).map((s) => s.id);
		expect(ids).toEqual(['arrange-tracks', 'arrange-scenes', 'arrange-song']);
	});
});

describe('arrange scenarios (TE’s guide art)', () => {
	const scenario = (id: string) => {
		const s = SCENARIOS.find((x) => x.id === id);
		if (!s) throw new Error(id);
		const sim = new OpxySim({ now: () => 0 });
		s.setup(sim);
		return sim;
	};

	it('arrange-003: scene 10, the auxiliary tracks, tape open on its second of three patterns', () => {
		const f = frame(scenario('arrange-tracks'));
		expect(f).toMatchObject({ bank: 'auxiliary', scene: '10' });
		expect(f.columns[5].cells.map((c) => [c.y, c.number])).toEqual([
			[60, 1],
			[90, 2],
			[120, 3]
		]);
		expect(f.columns[0].cells[0]).toMatchObject({ number: 1, outline: true });
		expect(f.columns[0].cells[0].dots).toHaveLength(6);
		expect([f.columns[2].below, f.columns[6].below]).toEqual([3, 3]);
		expect(f.columns.filter((c) => c.selected).map((c) => c.name)).toEqual(['tape']);
	});
});
