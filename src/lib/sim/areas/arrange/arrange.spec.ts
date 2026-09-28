import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import { SCENARIOS } from '../../scenarios';
import { COLORS, RAMP } from '../../screen/palette';
import { RecordingContext } from '../../screen/recording';
import { describeFrame, renderFrame } from '../../screen/render';
import { MAX_PATTERNS, currentPattern, emptyPattern } from '../../sequencer';
import { brainSettings, editBrain } from '../auxiliary/state';
import { SCENE_LENGTH_MODES as PROJECT_LENGTH_MODES, SIGNATURES } from '../system/catalogue';
import type { PatternsFrame } from './frames';
import { accidentalKey, lengthIn, lengthSettings, sceneLength } from './model';
import { PATTERN_KEYS } from './state';
import { BAND, COLUMN, STACK, patternNotes } from './view';

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
		// the device lights all four alike (research 59 §2.9)
		expect(f.soft.map((l) => l?.tone)).toEqual(['light', 'light', 'light', 'light']);
		sim.input({ type: 'press', id: 'key.shift' });
		expect(frame(sim).soft.map((l) => l?.text)).toEqual(['clone', 'copy', 'paste', 'reset']);
	});

	it('labels M4 clear while the track has one pattern and delete once it has more', () => {
		const sim = arrange();
		expect(frame(sim).soft[3]?.text).toBe('clear');
		sim.press(key('new'));
		expect(frame(sim).soft[3]?.text).toBe('delete');
		sim.press('track.2');
		expect(frame(sim).soft[3]?.text).toBe('clear');
		sim.press('track.1');
		sim.press(key('clear'));
		expect(frame(sim).soft[3]?.text).toBe('clear');
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

	it('puts each other track’s pattern on the band in its colour, T1 near black, unnumbered', () => {
		const sim = arrange();
		sim.press('track.2');
		const f = frame(sim);
		const closed = f.columns[2];
		expect(closed.blocks).toHaveLength(1);
		expect(closed.blocks[0]).toMatchObject({
			top: BAND.top,
			bottom: BAND.bottom,
			color: RAMP[2],
			ink: COLORS.ink,
			number: null
		});
		expect(f.columns[0].blocks[0]).toMatchObject({ color: COLORS.panel, ink: COLORS.light });
		expect(f.columns[7].blocks[0].color).toBe(RAMP[7]);
	});

	it('stacks the selected track’s patterns around the one playing, a ramp step darker each away', () => {
		const sim = arrange();
		sim.press('track.6');
		sim.press(key('new'));
		sim.press(key('new'));
		sim.turn(4, -1);
		const tape = frame(sim).columns[5];
		expect(tape.blocks.map((b) => [b.top, b.bottom, b.color, b.number])).toEqual([
			[59.22, STACK.top, RAMP[6], 1],
			[STACK.top, STACK.bottom, RAMP[7], 2],
			[STACK.bottom, 150.43, RAMP[6], 3]
		]);
		// notes and numbers keep to the slots, a block apart
		expect(tape.blocks.map((b) => b.centre)).toEqual([75.31, STACK.centre, 134.77]);
		expect(tape.blocks.map((b) => b.ink)).toEqual([COLORS.ink, COLORS.ink, COLORS.ink]);
		expect(tape).toMatchObject({ pattern: 2, patterns: 3, above: 0, below: 0 });
		// turning E4 scrolls the stack: the pattern playing stays on the band
		sim.turn(4, 1);
		const scrolled = frame(sim).columns[5].blocks;
		expect(scrolled.map((b) => [b.number, b.color])).toEqual([
			[1, RAMP[5]],
			[2, RAMP[6]],
			[3, RAMP[7]]
		]);
		expect(scrolled[2]).toMatchObject({ top: STACK.top, bottom: STACK.bottom });
	});

	it('leaves the patterns off the screen out of the stack', () => {
		const sim = arrange();
		for (let i = 0; i < MAX_PATTERNS - 1; i++) sim.press(key('new'));
		sim.turn(4, -8); // pattern 8 of 16
		const blocks = frame(sim).columns[0].blocks;
		// three above the band and three below, the lowest cut off at the column's foot
		expect(blocks.map((b) => b.number)).toEqual([5, 6, 7, 8, 9, 10, 11]);
		expect(blocks.map((b) => b.color)).toEqual([...RAMP.slice(4), RAMP[6], RAMP[5], RAMP[4]]);
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

	it('shows a pattern’s notes as dashes: a bar over 43 px, a step long, a pitch a pixel up', () => {
		const sim = arrange();
		const steps = sim.state.tracks[1].sequence.patterns[0].steps;
		steps[0].notes = [{ note: 60, velocity: 100, length: 0.5, offset: 0 }];
		steps[8].notes = [{ note: 64, velocity: 100, length: 0.5, offset: 0 }];
		const block = frame(sim).columns[1].blocks[0];
		expect(block.number).toBeNull();
		expect(block.notes).toEqual([
			[14.6, 2, 2.69],
			[36.1, -2, 2.69]
		]);
		expect(patternNotes(emptyPattern())).toEqual([]);
	});

	it('draws longer notes as longer dashes and squeezes a wide range into the block (ours)', () => {
		const p = emptyPattern();
		p.steps[0].notes = [{ note: 30, velocity: 100, length: 4, offset: 0 }];
		p.steps[4].notes = [{ note: 80, velocity: 100, length: 1, offset: 0.5 }];
		const [low, high] = patternNotes(p);
		expect(low[2]).toBeCloseTo(4 * 2.6875, 2);
		expect(high[0] - low[0]).toBeCloseTo(4.5 * 2.6875, 1);
		expect(low[1] - high[1]).toBe(25);
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

	it('gives a new pattern the player type of the one playing, switched off (OS 1.1.25)', () => {
		const sim = arrange();
		const player = currentPattern(t1(sim)).player;
		player.type = 'hold';
		player.on = true;
		sim.press(key('new'));
		expect(currentPattern(t1(sim)).player).toMatchObject({ type: 'hold', on: false });
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
		const t3 = sim.state.tracks[2];
		const own = t3.m1[0]; // pattern 1's: a new project's bass
		sim.press(key('new'));
		t3.m1[0] = 12;
		sim.turn(4, -1);
		expect(t3.m1[0]).toBe(own);
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

describe('arrange mode: the brain’s settings per pattern (OS 1.0.29)', () => {
	/** Arrange on the auxiliary tracks, the brain selected. */
	function brain(): OpxySim {
		const sim = arrange();
		sim.press('key.arrange');
		return sim;
	}
	const note = { note: 60, velocity: 100, length: 1, offset: 0 };

	it('travel with a copied brain pattern into an empty pattern, or a new one', () => {
		const sim = brain();
		const aux = sim.state.areas.auxiliary;
		aux.brain.patterns[0].key = 2;
		sim.press(key('copy'));
		sim.press(key('new'));
		editBrain(aux, 1).key = 7;
		sim.press(key('paste')); // into the empty pattern 2
		expect(brainSettings(aux, 1).key).toBe(2);
		sim.state.aux[0].sequence.patterns[1].steps[0].notes = [note];
		sim.press(key('paste')); // pattern 2 has notes now: a pattern 3
		expect(sim.state.aux[0].sequence.patterns).toHaveLength(3);
		expect(brainSettings(aux, 2).key).toBe(2);
	});

	it('start a new pattern from the settings the brain plays now', () => {
		const sim = brain();
		const aux = sim.state.areas.auxiliary;
		aux.brain.patterns[0].key = 7;
		sim.press(key('new'));
		expect(brainSettings(aux, 1).key).toBe(7);
		editBrain(aux, 1).key = 9;
		sim.press(key('new')); // from pattern 2, the one playing
		expect(brainSettings(aux, 2).key).toBe(9);
	});

	it('stay with every other pattern when one goes, also on one that showed the first’s', () => {
		const sim = brain();
		const aux = sim.state.areas.auxiliary;
		aux.brain.patterns[0].key = 2;
		sim.press(key('new'));
		editBrain(aux, 1).key = 4;
		sim.press(key('new'));
		aux.brain.patterns.splice(2); // pattern 3 without settings of its own: it shows the first's
		sim.turn(4, -2);
		sim.press(key('clear')); // pattern 1 goes
		expect(brainSettings(aux, 0).key).toBe(4); // what was pattern 2
		expect(brainSettings(aux, 1).key).toBe(2); // what was pattern 3, which showed the first's
	});

	it('are left alone by other tracks’ copies and removals', () => {
		const sim = brain();
		const aux = sim.state.areas.auxiliary;
		aux.brain.patterns[0].key = 5;
		sim.press('key.arrange'); // the instrument tracks
		sim.press(key('copy'));
		expect(sim.state.areas.arrange.clipboard.pattern?.brain).toBeNull();
		sim.press(key('new'));
		sim.press(key('clear'));
		sim.press('key.arrange');
		sim.press(key('paste')); // T1's copy onto the brain's empty pattern: no brain settings in it
		expect(aux.brain.patterns).toHaveLength(1);
		expect(brainSettings(aux, 0).key).toBe(5);
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
		expect(lengthIn(s, 'shortest', '4/4')).toBe(24);
		expect(lengthIn(s, 'time signature', '7/8')).toBe(14);
	});

	it('follows the project’s settings page for the scene length mode and the time signature', () => {
		const sim = arrange();
		const settings = sim.state.areas.system.projectSettings;
		expect(lengthSettings(sim.state)).toEqual({ mode: 'longest', signature: '4/4' });
		settings.sceneLength = PROJECT_LENGTH_MODES.indexOf('time signature');
		settings.signature = SIGNATURES.indexOf('5/4');
		expect(lengthSettings(sim.state)).toEqual({ mode: 'time signature', signature: '5/4' });
		expect(sceneLength(sim.state)).toBe(20);
		settings.sceneLength = 99; // a setting arrange does not know: the default
		expect(lengthSettings(sim.state).mode).toBe('longest');
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
	it('draws the rules, the band, the selected track’s stack, its number and the scene box', () => {
		const sim = arrange();
		sim.press('track.3');
		sim.press(key('new'));
		const ctx = new RecordingContext();
		renderFrame(ctx, sim.frame);
		// the scene: a white box with a black disc
		const box = ctx.fillsOf(COLORS.white).find((f) => f.x0 === 214 && f.x1 === 266);
		expect(box).toMatchObject({ y0: 146.15, y1: 198.25 });
		expect(ctx.fillsOf(COLORS.black).some((f) => f.x0 === 218.7 && f.y1 === 193.5)).toBe(true);
		// the band in the tracks' colours, T3's segment given way to its stack
		const band = ctx.fills.filter((f) => f.y0 === BAND.top && f.y1 === BAND.bottom);
		expect(band.map((f) => [f.x0, f.color])).toEqual([
			[0, COLORS.panel],
			[60, RAMP[1]],
			[180, RAMP[3]],
			[240, RAMP[4]],
			[300, RAMP[5]],
			[360, RAMP[6]],
			[420, RAMP[7]]
		]);
		// T3's two patterns over both rules: the one playing white and raised, the first above it
		const stack = ctx.fills.filter((f) => f.x0 === 119.5 && f.x1 === 180.5);
		expect(stack.map((f) => [f.y0, f.y1, f.color])).toEqual([
			[59.22, STACK.top, RAMP[6]],
			[STACK.top, STACK.bottom, RAMP[7]]
		]);
		// seven rules from the top to the column's foot
		const ends = ctx.ops.filter((op) => op.op === 'lineTo' && op.args[1] === COLUMN.bottom);
		expect(ends.map((op) => op.args[0])).toEqual([60, 120, 180, 240, 300, 360, 420]);
	});

	it('draws the selected auxiliary track’s pictogram instead of a number', () => {
		const sim = arrange();
		sim.press('key.arrange');
		const ctx = new RecordingContext();
		renderFrame(ctx, sim.frame);
		expect(
			ctx.fills.some((f) => f.color === COLORS.white && f.x0 >= 20 && f.x1 <= 40 && f.y1 <= 26)
		).toBe(true);
		// no other track shows a pictogram
		expect(ctx.fills.some((f) => f.color === COLORS.white && f.x0 >= 60 && f.y1 <= 30)).toBe(false);
	});

	it('draws a queued scene beside the scene’s box (ours)', () => {
		const sim = arrange();
		sim.press('key.play');
		withShift(sim, 'key.play', accidentalKey(4));
		const ctx = new RecordingContext();
		renderFrame(ctx, sim.frame);
		expect(frame(sim).queued).toBe('4');
		expect(ctx.ops.some((op) => op.op === 'moveTo' && op.args[1] === 158.2)).toBe(true);
	});

	it('draws every scenario of the area on its page', () => {
		const ids = SCENARIOS.filter((s) => s.id.startsWith('arrange')).map((s) => s.id);
		expect(ids).toEqual(['arrange-tracks', 'arrange-scenes', 'arrange-song', 'arrange-device']);
	});
});

describe('arrange scenarios', () => {
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
		expect(f.columns[5].blocks.map((b) => [b.top, b.number])).toEqual([
			[59.22, 1],
			[STACK.top, 2],
			[STACK.bottom, 3]
		]);
		expect(f.columns[0].blocks[0]).toMatchObject({ number: null, top: BAND.top });
		expect(f.columns[0].blocks[0].notes).toHaveLength(6);
		expect([f.columns[2].below, f.columns[6].below]).toEqual([3, 3]);
		expect(f.columns.filter((c) => c.selected).map((c) => c.name)).toEqual(['tape']);
	});

	it('the device’s b1-826: T3 on the third of five patterns, the figure on the first, scene 2', () => {
		const f = frame(scenario('arrange-device'));
		expect(f).toMatchObject({ scene: '2' });
		const t3 = f.columns[2];
		expect(t3.blocks.map((b) => [b.number, b.color])).toEqual([
			[1, RAMP[5]],
			[2, RAMP[6]],
			[3, RAMP[7]],
			[4, RAMP[6]],
			[5, RAMP[5]]
		]);
		expect(t3.blocks[0].notes.map(([, y]) => y)).toEqual([11, 5, -5, -11]);
		expect([t3.blocks[0].top, t3.blocks[4].bottom]).toEqual([29.49, 180.16]);
		expect(f.soft.map((l) => l?.text)).toEqual(['new', 'copy', 'paste', 'delete']);
	});
});
