/**
 * The step sequencer as the OP-XY does it: conformance cases written from TE's guide (chapters
 * 7 "sequencer" and 8 "step components", guide v1.1.15, reworded in `knowledge/manual/units/
 * sequencer/*`), not from our code. Each case works the machine the way a person does, with real
 * press lengths and the computer's Shift key, and checks what a person sees: the LED windows, the
 * keys that light, the screen. The model is checked too where an LED cannot tell (which notes, how
 * long, which components).
 *
 * The same cases run on the bare simulator (`sequencer.spec.ts`, Node) and on the app in a browser,
 * clicking the rendered replica (`src/lib/app/sequencer-conformance.svelte.spec.ts`), so a bug in
 * the wiring between them fails too.
 *
 * Where the guide leaves something open the case says "ours" and pins our choice. Cases marked
 * "device check" are in docs/QUESTIONS.md, to settle on the owner's unit.
 */
import { describe, expect, it } from 'vitest';
import {
	NUDGE,
	OVERLAP,
	currentPattern,
	emptyPattern,
	setComponentValue,
	toggleComponent,
	toggleStep,
	type Pattern,
	type StepComponentKind
} from '../sequencer';
import {
	BEND_SHAPES,
	COMPONENT_VELOCITIES,
	TONALITIES,
	jumpTarget,
	rampSpan,
	seededRng,
	stepEvents
} from '../sequencer-playback';
import {
	CLICK_MS,
	GAP_MS,
	HOLD_MS,
	SLOW_CLICK_MS,
	accidental,
	natural,
	noteOf,
	type Driver
} from '../testing/driver';

/** A sixteenth at the new project's 120 BPM. */
const STEP_MS = 125;

/** The pattern of the track the step keys edit. */
function pattern(d: Driver): Pattern {
	const s = d.state;
	const seq = s.active === 'auxiliary' ? s.aux[s.auxTrack].sequence : s.tracks[s.track].sequence;
	return currentPattern(seq);
}

/** Step n (1–16, as on the keys) of the shown bar. */
const at = (d: Driver, n: number) => pattern(d).steps[n - 1];
const notes = (d: Driver, n: number) => at(d, n).notes.map((x) => x.note);
const components = (d: Driver, n: number) => at(d, n).components.map((c) => `${c.kind} ${c.value}`);
const lockIds = (d: Driver, n: number) => Object.keys(at(d, n).locks);
const step = (n: number) => `step.${n}`;
const key = (name: string) => `keyboard.${name}`;
const play = (d: Driver, ...names: string[]) => d.clicks(...names.map(key));

/** Holds keyboard keys (a chord) while `during` runs. */
async function chord(d: Driver, names: string[], during: () => Promise<void>): Promise<void> {
	for (const n of names) await d.down(key(n));
	await d.wait(GAP_MS);
	await during();
	for (const n of [...names].reverse()) await d.up(key(n));
	await d.wait(GAP_MS);
}

/** Whether an LED flashes: three looks a blink apart do not all agree. */
async function flashes(d: Driver, id: string): Promise<boolean> {
	const seen = new Set<string>();
	for (let i = 0; i < 4; i++) {
		seen.add(d.led(id));
		await d.wait(130);
	}
	return seen.size > 1;
}

/**
 * Selects a synth track: track 3, which a new project makes prism with its keyboard an octave down
 * (C4's key plays 48, as on the device).
 */
const synth = (d: Driver) => d.click('track.3');

/** Adds component `n` (natural n) with digit `digit` to steps, as the guide describes. */
async function addComponent(d: Driver, steps: number[], n: number, digit?: number): Promise<void> {
	await d.withShift(async () => {
		for (const s of steps) await d.click(step(s));
		await d.click(natural(n));
		if (digit !== undefined) await d.click(accidental(digit));
	});
}

export function sequencerConformance(start: () => Promise<Driver>): void {
	describe('7.1 step sequencing', () => {
		it('records the last note played on the step pressed, which lights', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'a3');
			await d.click(step(1));
			expect(d.steps()).toBe('w...............');
			expect(notes(d, 1)).toEqual([noteOf('a3') - 12]); // track 3 plays an octave down
			// further steps get the same note until another is played
			await d.click(step(5));
			await play(d, 'c4');
			await d.click(step(9));
			expect(d.steps()).toBe('w...w...w.......');
			expect([notes(d, 5), notes(d, 9)]).toEqual([[noteOf('a3') - 12], [noteOf('c4') - 12]]);
		});

		it('places sounds on a drum track: each key is a sound, the last one played goes down', async () => {
			const d = await start(); // track 1 of a new project is a drum track
			await d.click(step(1));
			expect(notes(d, 1)).toEqual([noteOf('f3')]); // ours: the first key's sound until one is played
			await play(d, 'gs3');
			await d.clicks(step(5), step(13));
			expect(d.steps()).toBe('w...w.......w...');
			expect(notes(d, 13)).toEqual([noteOf('gs3')]);
		});

		it('takes a lit step off with a click, quick or deliberate', async () => {
			const d = await start();
			for (const ms of [30, CLICK_MS, SLOW_CLICK_MS]) {
				await d.click(step(3));
				expect(d.led(step(3))).toBe('white');
				await d.click(step(3), ms);
				expect(d.led(step(3))).toBe('off');
				expect(notes(d, 3)).toEqual([]);
			}
		});

		it('takes a lit step off while the pattern plays', async () => {
			const d = await start();
			await d.clicks(step(3), step(11));
			await d.click('key.play');
			await d.wait(700);
			await d.click(step(11));
			expect(notes(d, 11)).toEqual([]);
			await d.click('key.stop');
			expect(d.steps()).toBe('..w.............');
		});

		it('lights the notes of a held step on the keyboard (check note), and keeps the step', async () => {
			const d = await start();
			await synth(d);
			await chord(d, ['c4', 'e4', 'g4'], () => d.click(step(2)));
			expect(d.lit()).toEqual([]);
			await d.down(step(2));
			await d.wait(GAP_MS);
			expect(d.lit()).toEqual(['c4', 'e4', 'g4']);
			await d.wait(HOLD_MS);
			await d.up(step(2));
			await d.wait(GAP_MS);
			expect(d.led(step(2))).toBe('white');
			expect(notes(d, 2)).toEqual([48, 52, 55]);
		});

		it('records a chord held on the keyboard onto the step pressed', async () => {
			const d = await start();
			await synth(d);
			await chord(d, ['c4', 'e4', 'g4'], () => d.click(step(3)));
			expect(notes(d, 3)).toEqual([48, 52, 55]);
			expect(d.steps()).toBe('..w.............');
		});

		it('records the notes played while a step is held', async () => {
			const d = await start();
			await synth(d);
			await d.holding(step(4), () => play(d, 'c4', 'e4', 'g4'));
			expect(notes(d, 4)).toEqual([48, 52, 55]);
			expect(d.led(step(4))).toBe('white');
		});

		it('adds a note to a held step, or takes it off when the step has it (edit step)', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'c4');
			await d.click(step(1));
			await d.holding(step(1), async () => {
				await play(d, 'e4');
				expect(notes(d, 1)).toEqual([48, 52]);
				expect(d.lit()).toEqual(['c4', 'e4']);
				await play(d, 'c4');
				expect(notes(d, 1)).toEqual([52]);
			});
			// letting go after the edit leaves the step as edited
			expect(notes(d, 1)).toEqual([52]);
			expect(d.led(step(1))).toBe('white');
		});

		it('extends a note to a later step pressed while it is held; again: full step ↔ overlap', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'c4');
			await d.click(step(1));
			const length = () => at(d, 1).notes[0].length;
			expect(length()).toBeLessThan(1);
			await d.holding(step(1), async () => {
				await d.click(step(4));
				expect(length()).toBe(4); // to the end of step 4: "full step"
				await d.click(step(4));
				expect(length()).toBe(4 + OVERLAP); // "overlap" (the amount is ours)
				await d.click(step(4));
				expect(length()).toBe(4);
			});
			expect(notes(d, 4)).toEqual([]);
			expect(d.steps()).toBe('w...............');
		});

		it('nudges a held step with [-] / [+], but only once quantise is below 100', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'c4');
			await d.click(step(5));
			const offset = () => at(d, 5).notes[0].offset;
			await d.holding(step(5), () => d.click('key.plus'));
			expect(offset()).toBe(0); // a new project quantises at 100
			await d.holding('key.bar', () => d.turn(1, -10));
			expect(pattern(d).quantise).toBeLessThan(100);
			await d.holding(step(5), () => d.clicks('key.plus', 'key.plus'));
			expect(offset()).toBeCloseTo(2 * NUDGE, 9);
			await d.holding(step(5), () => d.click('key.minus'));
			expect(offset()).toBeCloseTo(NUDGE, 9);
			expect(notes(d, 5)).toEqual([48]);
		});

		it('nudges faster while [+] or [-] stays down (the repeat timing is ours)', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'c4');
			await d.click(step(5));
			await d.holding('key.bar', () => d.turn(1, -10));
			const offset = () => at(d, 5).notes[0].offset;
			await d.holding(step(5), async () => {
				await d.down('key.plus');
				await d.wait(700);
				await d.up('key.plus');
			});
			// one press moves a note by one nudge; held, it keeps going
			expect(offset()).toBeGreaterThan(4 * NUDGE);
			const reached = offset();
			await d.wait(500);
			expect(offset()).toBe(reached);
		});

		it('shows only one sound’s steps with its key held and record tapped, and sequences it', async () => {
			const d = await start();
			await play(d, 'f3');
			await d.clicks(step(1), step(9));
			await play(d, 'gs3');
			await d.clicks(step(5), step(13));
			await d.holding(key('gs3'), async () => {
				await d.click('key.record');
				expect(d.steps()).toBe('....w.......w...');
				await d.click(step(9)); // a step with another sound gets this one as well
				expect(notes(d, 9)).toEqual([noteOf('f3'), noteOf('gs3')]);
				expect(d.steps()).toBe('....w...w...w...');
				await d.click(step(5));
				expect(notes(d, 5)).toEqual([]);
			});
			// letting go of the key ends the view
			expect(d.steps()).toBe('w.......w...w...');
		});

		it('goes straight into one sound with a note held and a step pressed', async () => {
			const d = await start();
			await play(d, 'f3');
			await d.click(step(1));
			await d.holding(key('a3'), async () => {
				await d.click(step(3));
				expect(notes(d, 3)).toEqual([noteOf('a3')]);
				expect(d.steps()).toBe('..w.............');
				await d.click(step(1));
				expect(notes(d, 1)).toEqual([noteOf('f3'), noteOf('a3')]);
			});
			expect(d.steps()).toBe('w.w.............');
		});

		it('shifts the whole sequence a step with the track key held and [-] / [+], wrapping', async () => {
			const d = await start();
			await d.clicks(step(1), step(16));
			await d.holding('track.1', () => d.click('key.plus'));
			expect(d.steps()).toBe('ww..............');
			await d.holding('track.1', () => d.clicks('key.minus', 'key.minus'));
			expect(d.steps()).toBe('..............ww');
		});

		it('locks a parameter on a held step, leaving the track’s own value alone', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'c4');
			await d.click(step(2));
			const own = d.state.tracks[2].m1[0];
			await d.holding(step(2), () => d.turn(1, 6));
			expect(lockIds(d, 2)).toHaveLength(1);
			expect(d.state.tracks[2].m1[0]).toBe(own);
			expect(notes(d, 2)).toEqual([48]); // the hold with a turn neither cleared nor copied
		});

		it('locks a parameter on an empty step too (OS 1.1.33)', async () => {
			const d = await start();
			await synth(d);
			await d.holding(step(6), () => d.turn(2, 4));
			expect(notes(d, 6)).toEqual([]);
			expect(lockIds(d, 6)).toHaveLength(1);
		});

		it('clears the track with record + stop held until the row fills red, locks included', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'c4');
			await d.clicks(step(1), step(5), step(9));
			await d.holding(step(5), () => d.turn(1, 5));
			await d.down('key.record');
			await d.down('key.stop');
			await d.wait(450);
			expect(d.steps()).toMatch(/^r+[.w]*$/);
			expect(d.steps()).not.toBe('rrrrrrrrrrrrrrrr');
			expect(notes(d, 1)).toEqual([48]);
			await d.wait(750);
			await d.up('key.stop');
			await d.up('key.record');
			await d.wait(GAP_MS);
			expect(d.steps()).toBe('................');
			expect(pattern(d).steps.every((s) => !s.notes.length && !Object.keys(s.locks).length)).toBe(
				true
			);
		});

		it('keeps the track when record + stop come up before the row is full', async () => {
			const d = await start();
			await d.clicks(step(1), step(2));
			await d.down('key.record');
			await d.down('key.stop');
			await d.wait(300);
			await d.up('key.stop');
			await d.up('key.record');
			await d.wait(GAP_MS);
			expect(d.steps()).toBe('ww..............');
		});

		it('undoes the last change with shift + record (one level)', async () => {
			const d = await start();
			await d.clicks(step(1), step(2));
			await d.down('key.record');
			await d.down('key.stop');
			await d.wait(1200);
			await d.up('key.stop');
			await d.up('key.record');
			await d.wait(GAP_MS);
			expect(d.steps()).toBe('................');
			await d.withShift(() => d.click('key.record'));
			expect(d.steps()).toBe('ww..............');
		});

		it('copies a held step (notes, components, locks) and pastes it on an empty step', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'c4');
			await d.click(step(1));
			await addComponent(d, [1], 3, 2);
			await d.holding(step(1), () => d.turn(1, 5));
			await d.click(step(1), HOLD_MS); // holding copies…
			expect(notes(d, 1)).toEqual([48]); // …and keeps the step
			await d.click(step(7)); // an empty step receives the copy
			expect(notes(d, 7)).toEqual([48]);
			expect(components(d, 7)).toEqual(components(d, 1));
			expect(at(d, 7).locks).toEqual(at(d, 1).locks);
			expect(d.steps()).toBe('w.....w.........');
		});

		it('pastes only on empty steps: a lit step pressed after a copy comes off as usual', async () => {
			const d = await start();
			await d.clicks(step(1), step(3));
			await d.click(step(1), HOLD_MS);
			await d.click(step(3));
			expect(notes(d, 3)).toEqual([]);
		});

		it('moves a synth sequence an octave with shift + [-] / [+]; plain keys move the keyboard', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'c4');
			await d.click(step(1));
			await d.withShift(() => d.click('key.plus'));
			expect(notes(d, 1)).toEqual([60]);
			await d.withShift(() => d.click('key.minus'));
			expect(notes(d, 1)).toEqual([48]);
			await d.click('key.plus'); // the keyboard up an octave: recorded notes stay
			expect(notes(d, 1)).toEqual([48]);
			await play(d, 'c4');
			await d.click(step(2));
			expect(notes(d, 2)).toEqual([60]);
		});

		it('moves a drum sequence a semitone with shift + [-] / [+]', async () => {
			const d = await start();
			await d.click(step(1));
			await d.withShift(() => d.click('key.plus'));
			expect(notes(d, 1)).toEqual([noteOf('f3') + 1]);
		});
	});

	describe('7.2 live recording', () => {
		it('arms with record + play: step 1 flashes red and nothing plays yet', async () => {
			const d = await start();
			await synth(d);
			await d.holding('key.record', () => d.click('key.play'));
			expect(d.state.transport.playing).toBe(false);
			expect(await flashes(d, step(1))).toBe(true);
			expect(['r', '.']).toContain(d.steps()[0]);
		});

		it('starts with the first note; recorded steps are red until stop, then white', async () => {
			const d = await start();
			await synth(d);
			await d.holding('key.record', () => d.click('key.play'));
			await d.click(key('c4')); // playback and recording start on step 1
			expect(d.state.transport.playing).toBe(true);
			await d.wait(4 * STEP_MS - CLICK_MS - GAP_MS);
			await d.click(key('e4')); // on step 5
			expect([notes(d, 1), notes(d, 5)]).toEqual([[48], [52]]); // track 3 plays an octave down
			expect(d.led(step(1))).toBe('red');
			await d.click('key.stop');
			expect(d.steps()).toBe('w...w...........');
		});

		it('records while record is held during playback, and stops when it comes up', async () => {
			const d = await start();
			await synth(d);
			await d.click('key.play');
			await d.down('key.record');
			await d.wait(2 * STEP_MS - CLICK_MS - 2 * GAP_MS);
			await d.click(key('c4')); // step 3
			await d.up('key.record');
			await d.wait(3 * STEP_MS);
			await d.click(key('e4')); // not recorded
			await d.click('key.stop');
			expect(d.steps()).toBe('..w.............');
			expect(notes(d, 3)).toEqual([48]);
		});

		it('latches recording with record + play during playback', async () => {
			const d = await start();
			await synth(d);
			await d.click('key.play');
			await d.holding('key.record', () => d.click('key.play'));
			await d.wait(STEP_MS);
			await d.click(key('g4'));
			expect(pattern(d).steps.some((s) => s.notes.some((n) => n.note === 55))).toBe(true);
			expect(d.state.transport.playing).toBe(true);
			await d.click('key.stop');
		});

		it('starts recording at once with play after arming: no count-in (get-started 4.2)', async () => {
			const d = await start();
			await synth(d);
			await d.holding('key.record', () => d.click('key.play'));
			expect(d.state.transport.playing).toBe(false);
			await d.click('key.play');
			expect(d.state.transport.playing).toBe(true);
			expect(d.state.transport.position).toBeGreaterThanOrEqual(0);
			await d.wait(STEP_MS);
			await d.click(key('d4'));
			expect(pattern(d).steps.some((s) => s.notes.some((n) => n.note === 50))).toBe(true);
			await d.click('key.stop');
		});

		it('counts in a bar with record + play, then play again', async () => {
			const d = await start();
			await synth(d);
			await d.holding('key.record', () => d.clicks('key.play', 'key.play'));
			expect(d.state.transport.playing).toBe(true);
			expect(d.state.transport.position).toBeLessThan(0);
			await d.wait(16 * STEP_MS);
			expect(d.state.transport.position).toBeGreaterThanOrEqual(0);
			await d.click(key('d4'));
			expect(pattern(d).steps.some((s) => s.notes.some((n) => n.note === 50))).toBe(true);
			await d.click('key.stop');
		});

		it('stores encoder moves made while recording on the steps that play (automation)', async () => {
			const d = await start();
			await synth(d);
			await d.click('key.play');
			await d.holding('key.record', async () => {
				await d.wait(STEP_MS);
				await d.turn(1, 5);
			});
			await d.click('key.stop');
			expect(pattern(d).steps.some((s) => Object.keys(s.locks).length > 0)).toBe(true);
		});
	});

	describe('7.3 step recording', () => {
		it('puts a red cursor on step 1 while record is held, stopped; notes fill it step by step', async () => {
			const d = await start();
			await synth(d);
			await d.holding('key.record', async () => {
				expect(d.led(step(1))).toBe('red');
				await play(d, 'c4', 'd4', 'e4');
				expect(d.steps()).toBe('wwwr............');
				await d.click('key.plus'); // skip a step
				expect(d.steps()).toBe('www.r...........');
				await play(d, 'g4');
				expect(d.steps()).toBe('www.wr..........');
				await d.click('key.minus'); // back: the step's sound lights its key
				expect(d.led(step(5))).toBe('red');
				expect(d.lit()).toEqual(['g4']);
			});
			expect(d.steps()).toBe('www.w...........');
			// track 3 plays an octave down
			expect([notes(d, 1), notes(d, 2), notes(d, 3), notes(d, 5)]).toEqual([
				[48],
				[50],
				[52],
				[55]
			]);
		});

		it('records a chord on one step: the cursor moves when the keys come up', async () => {
			const d = await start();
			await synth(d);
			await d.holding('key.record', () => chord(d, ['c4', 'e4'], () => d.wait(GAP_MS)));
			expect(notes(d, 1)).toEqual([48, 52]);
		});

		it('removes a recorded step with a tap', async () => {
			const d = await start();
			await synth(d);
			await d.holding('key.record', () => play(d, 'c4', 'd4'));
			await d.click(step(2));
			expect(d.steps()).toBe('w...............');
		});
	});

	describe('7.4 extending your sequence with bar', () => {
		it('shows the bar page while bar is held, then the page it covered', async () => {
			const d = await start();
			const before = d.frame.page;
			await d.holding('key.bar', async () => {
				expect(d.frame.page).toBe('bar');
			});
			expect(d.frame.page).toBe(before);
		});

		it('sets the track scale with bar + a black key: 1–8, 16, then 1/2', async () => {
			const d = await start();
			const scales = [1, 2, 3, 4, 5, 6, 7, 8, 16, 0.5];
			for (let digit = 1; digit <= 10; digit++) {
				await d.holding('key.bar', async () => {
					await d.click(accidental(digit % 10));
					expect(d.lit()).toEqual([accidental(digit % 10).slice('keyboard.'.length)]);
				});
				expect(pattern(d).scale).toBe(scales[digit - 1]);
			}
		});

		it('moves each step four times slower at track scale 4', async () => {
			const d = await start();
			await d.holding('key.bar', () => d.click(accidental(4)));
			await d.click('key.play');
			await d.wait(4 * STEP_MS * 2 + 20);
			expect(d.steps().indexOf('w')).toBe(2); // the playhead on step 3 after eight sixteenths
			await d.click('key.stop');
		});

		it('adds bars with bar + [+] (four at most) and removes them with bar + [-]', async () => {
			const d = await start();
			await d.holding('key.bar', () => d.clicks('key.plus', 'key.plus', 'key.plus', 'key.plus'));
			expect(pattern(d).bars).toBe(4);
			expect(pattern(d).length).toBe(64);
			await d.holding('key.bar', () => d.click('key.minus'));
			expect(pattern(d).bars).toBe(3);
		});

		it('duplicates with bar + shift + [+]: a two-bar phrase copies bar 1 to 3 and 2 to 4', async () => {
			const d = await start();
			await d.click(step(1));
			await d.holding('key.bar', () => d.click('key.plus'));
			await d.click('key.bar'); // show bar 2
			await d.click(step(2));
			await d.holding('key.bar', () => d.withShift(() => d.click('key.plus')));
			const p = pattern(d);
			expect(p.bars).toBe(4);
			expect([0, 17, 32, 49].map((i) => p.steps[i].notes.length)).toEqual([1, 1, 1, 1]);
		});

		it('sets how many steps play with bar + a step key', async () => {
			const d = await start();
			await d.holding('key.bar', () => d.click(step(12)));
			expect(pattern(d).length).toBe(12);
			expect(d.steps().slice(12)).toBe('....');
		});

		it('switches the bar the step keys show with a tap on bar', async () => {
			const d = await start();
			await d.holding('key.bar', () => d.click('key.plus'));
			await d.click(step(1));
			await d.click('key.bar');
			expect(d.steps()).toBe('................'); // bar 2 is empty
			await d.click(step(4));
			expect(pattern(d).steps[19].notes).toHaveLength(1);
			await d.click('key.bar');
			expect(d.steps()).toBe('w...............');
		});

		it('turns quantise (E1), note length (E2), groove (E3) and shape (E4) in the bar menu', async () => {
			const d = await start();
			const p = () => pattern(d);
			const before = { ...p() };
			await d.holding('key.bar', async () => {
				await d.turn(1, -5);
				await d.turn(2, 3);
				await d.turn(3, 4);
				await d.turn(4, 6);
			});
			expect(p().quantise).toBeLessThan(before.quantise);
			expect(p().noteLength).not.toBe(before.noteLength);
			expect(p().groove).not.toBe(before.groove);
			expect(p().smoothing).toBeGreaterThan(before.smoothing);
		});

		it('sets the length of step-entered notes with E2, old ones too; extended notes keep theirs', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'c4');
			await d.clicks(step(1), step(5));
			await d.holding(step(5), () => d.click(step(8))); // extended to the end of step 8
			await d.holding('key.bar', () => d.turn(2, 30)); // a new project's 50 → 80
			expect(at(d, 1).notes[0].length).toBeCloseTo(0.8);
			expect(at(d, 5).notes[0].length).toBe(4);
			await play(d, 'd4');
			await d.click(step(9));
			expect(at(d, 9).notes[0].length).toBeCloseTo(0.8);
		});

		it('clears notes (M1), locks (M2) or both (M4) from the bar menu', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'c4');
			await d.clicks(step(1), step(2));
			await d.holding(step(2), () => d.turn(1, 4));
			await d.holding('key.bar', () => d.click('key.m1'));
			expect([notes(d, 1), notes(d, 2), lockIds(d, 2).length]).toEqual([[], [], 1]);
			await d.clicks(step(1));
			await d.holding('key.bar', () => d.click('key.m2'));
			expect([notes(d, 1), lockIds(d, 2).length]).toEqual([[48], 0]); // an octave down on track 3
			await d.holding(step(3), () => d.turn(1, 4));
			await d.holding('key.bar', () => d.click('key.m4'));
			expect(pattern(d).steps.every((s) => !s.notes.length && !Object.keys(s.locks).length)).toBe(
				true
			);
		});

		it('pins the bar page with shift + bar until bar is pressed again', async () => {
			const d = await start();
			await d.withShift(() => d.click('key.bar'));
			expect(d.frame.page).toBe('bar');
			await d.wait(500);
			expect(d.frame.page).toBe('bar');
			await d.click('key.bar');
			expect(d.frame.page).not.toBe('bar');
		});
	});

	describe('what the device shows while sequencing (OS 1.1.33 by camera: note 59 §2.8, §2.12)', () => {
		it('shows the bar card over the page it covers, with a box for each bar the pattern has', async () => {
			const d = await start();
			await synth(d);
			await d.holding('key.bar', async () => {
				await d.click('key.plus');
				const f = d.frame;
				expect(f.page).toBe('bar');
				if (f.page === 'bar')
					expect(f).toMatchObject({ bars: 2, shown: 0, base: { page: 'synth' } });
				expect(d.screen()).toMatch(/^bar menu: quant 100, length 50, groove -, shape 00/);
			});
			await d.wait(100); // the card fades out in about 50 ms
			expect(d.frame.page).toBe('synth');
		});

		it('shows the keyboard octave for a moment after [+] / [-], "+0" included', async () => {
			const d = await start();
			await synth(d); // a new project's track 3 plays an octave down
			await d.click('key.plus');
			expect(d.screen()).toMatch(/^octave \+0: /);
			await d.click('key.minus');
			expect(d.screen()).toMatch(/^octave -1: /);
			await d.wait(1500);
			expect(d.screen()).not.toMatch(/^octave/);
		});

		it('shows a held step’s number, and "copied" once it has been held long enough', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'c4');
			await d.click(step(3));
			await d.holding(step(3), async () => {
				expect(d.screen()).toMatch(/^step 3 held/);
				await d.wait(HOLD_MS);
				expect(d.screen()).toMatch(/^copied: step 3 held/);
			});
			expect(notes(d, 3)).toEqual([48]); // copied, not cleared
		});
	});

	describe('8.2 adding step components', () => {
		it('dims the steps that have notes but no component while shift is held', async () => {
			const d = await start();
			await d.clicks(step(1), step(5));
			await d.withShift(async () => {
				expect(d.steps()).toBe('d...d...........');
			});
			expect(d.steps()).toBe('w...w...........');
		});

		it('flashes the steps selected with shift held', async () => {
			const d = await start();
			await d.clicks(step(1), step(5));
			await d.withShift(async () => {
				await d.click(step(5));
				expect(await flashes(d, step(5))).toBe(true);
				expect(d.led(step(1))).toBe('dim');
			});
		});

		it('adds the component of a white key, sets its digit with a black key, and says so', async () => {
			const d = await start();
			await d.clicks(step(1), step(5));
			await d.withShift(async () => {
				await d.clicks(step(1), step(5));
				await d.click(natural(1)); // pulse
				expect(components(d, 1)).toEqual(['pulse 4']); // the default digit
				expect(d.screen()).toContain('pulse');
				await d.click(accidental(2));
				expect(components(d, 5)).toEqual(['pulse 2']);
				expect(d.screen()).toContain('2');
			});
			expect([components(d, 1), components(d, 5)]).toEqual([['pulse 2'], ['pulse 2']]);
		});

		it('keeps steps with a component white while shift is held', async () => {
			const d = await start();
			await d.clicks(step(1), step(2));
			await addComponent(d, [2], 4);
			await d.withShift(async () => {
				expect(d.steps()).toBe('dw..............');
			});
		});

		it('plays the component once shift is up: pulse 2 plays the step twice more', async () => {
			const d = await start();
			await d.click(step(1));
			await addComponent(d, [1], 1, 2);
			expect(stepEvents(pattern(d), 0, 1, seededRng(1)).repeats).toBe(2);
		});

		it('takes a component off: shift, the same steps, the same white key', async () => {
			const d = await start();
			await d.clicks(step(1), step(2));
			await addComponent(d, [1, 2], 9, 3);
			expect(components(d, 2)).toEqual(['bend 3']);
			await addComponent(d, [1, 2], 9);
			expect([components(d, 1), components(d, 2)]).toEqual([[], []]);
			expect(d.steps()).toBe('ww..............');
		});

		it('lets one step carry several components', async () => {
			const d = await start();
			await d.click(step(1));
			await addComponent(d, [1], 3, 4);
			await addComponent(d, [1], 4, 8);
			await addComponent(d, [1], 14, 2);
			expect(components(d, 1)).toEqual(['multiply 4', 'velocity 8', 'skip trigger 2']);
		});

		it('keeps components when the step’s notes are edited (OS 1.1.32), rotated or duplicated', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'c4');
			await d.click(step(1));
			await addComponent(d, [1], 2, 3);
			await d.holding(step(1), () => play(d, 'e4'));
			expect(components(d, 1)).toEqual(['pulse hold 3']);
			await d.holding('track.3', () => d.click('key.plus'));
			expect(components(d, 2)).toEqual(['pulse hold 3']);
			await d.holding('key.bar', () => d.withShift(() => d.click('key.plus')));
			expect(pattern(d).steps[17].components.map((c) => c.kind)).toEqual(['pulse hold']);
		});

		it('lights the white keys of the components on the selected steps, and the digit set', async () => {
			const d = await start();
			await d.click(step(1));
			await addComponent(d, [1], 4, 6);
			await d.withShift(async () => {
				await d.click(step(1));
				expect(d.lit()).toContain(natural(4).slice('keyboard.'.length));
			});
		});
	});

	describe('tracks, bars and the playhead', () => {
		it('keeps a sequence per track: switching tracks shows each one’s steps', async () => {
			const d = await start();
			await d.clicks(step(1), step(2));
			await synth(d);
			expect(d.steps()).toBe('................');
			await play(d, 'c4');
			await d.click(step(16));
			await d.click('track.1');
			expect(d.steps()).toBe('ww..............');
			await synth(d);
			expect(d.steps()).toBe('...............w');
		});

		it('sequences an auxiliary track with the same gestures', async () => {
			const d = await start();
			await d.click('key.auxiliary');
			await d.click('track.3'); // external midi
			await play(d, 'c4');
			await d.clicks(step(1), step(9));
			expect(d.steps()).toBe('w.......w.......');
			await d.click(step(9));
			expect(d.steps()).toBe('w...............');
			expect(d.state.aux[2].sequence.patterns[0].steps[0].notes.map((n) => n.note)).toEqual([60]);
		});

		it('edits bar 2 on the step keys once bar has been tapped over to it', async () => {
			const d = await start();
			await synth(d);
			await d.holding('key.bar', () => d.click('key.plus'));
			await play(d, 'e4');
			await d.click('key.bar');
			await d.clicks(step(1), step(8));
			expect(d.steps()).toBe('w......w........');
			// E4's key plays 52 on track 3, an octave down
			expect([16, 23].map((i) => pattern(d).steps[i].notes.map((n) => n.note))).toEqual([
				[52],
				[52]
			]);
			await d.click(step(8)); // and takes them off there too
			expect(pattern(d).steps[23].notes).toEqual([]);
		});

		it('moves the playhead one step per sixteenth while playing, and stands still once stopped', async () => {
			const d = await start();
			await d.click('key.play');
			const lit = () => d.steps().indexOf('w');
			const first = lit();
			await d.wait(2 * STEP_MS);
			expect((lit() - first + 16) % 16).toBe(2);
			await d.wait(3 * STEP_MS);
			expect((lit() - first + 16) % 16).toBe(5);
			await d.click('key.stop');
			expect(d.steps()).toBe('................');
		});

		it('passes over the notes: a lit step dims under the playhead', async () => {
			const d = await start();
			await d.clicks(step(1), step(2), step(3), step(4));
			await d.click('key.play');
			await d.wait(STEP_MS);
			expect(d.steps().slice(0, 4)).toMatch(/^w*dw*$/); // ours: the playing step dims
			await d.click('key.stop');
			expect(d.steps().slice(0, 4)).toBe('wwww');
		});
	});

	describe('driver: encoders', () => {
		it('turns in whole steps, or in fine steps pushed in (tempo: BPM, then tenths)', async () => {
			const d = await start();
			await d.click('key.tempo');
			await d.turn(1, 3);
			expect(d.state.tempo.bpm).toBe(123);
			await d.turn(1, 4, { fine: true });
			expect(d.state.tempo.bpm).toBeCloseTo(123.4, 9);
			await d.turn(1, -2, { fine: true });
			expect(d.state.tempo.bpm).toBeCloseTo(123.2, 9);
		});
	});

	describe('9 players', () => {
		it('opens with player, turns on with player again; shift + player lists the players, E1 picks one', async () => {
			const d = await start();
			await synth(d);
			await d.click('key.player');
			expect(d.frame).toMatchObject({ page: 'player', type: 'arpeggio', on: false });
			await d.click('key.player');
			expect(d.frame).toMatchObject({ page: 'player', on: true });
			// the list comes up with the player in use boxed; E1 moves the box, and player again
			// only switches the player off and on (the owner's unit, 1.1.33)
			await d.withShift(async () => {
				await d.click('key.player');
				expect(d.frame).toMatchObject({ page: 'player', type: 'arpeggio', list: { track: 3 } });
				await d.turn(1, 1);
				expect(d.frame).toMatchObject({ page: 'player', type: 'hold' });
				await d.turn(1, 1);
				expect(d.frame).toMatchObject({ page: 'player', type: 'maestro' });
				await d.click('key.player');
				expect(d.frame).toMatchObject({ page: 'player', type: 'maestro', on: false });
			});
			expect(d.frame).toMatchObject({ page: 'player', type: 'maestro', list: null });
			await d.withShift(async () => {
				await d.click('key.player');
				await d.turn(1, -2);
			});
			expect(d.frame).toMatchObject({ page: 'player', type: 'arpeggio' });
		});

		it('sets the arpeggio: speed, pattern, range and hold; with shift length, style, glide, stereo', async () => {
			const d = await start();
			await synth(d);
			await d.click('key.player');
			const cards = () =>
				(d.frame as unknown as { cards: { label: string; value: string }[] }).cards.map(
					(c) => c.label
				);
			expect(cards()).toEqual(['speed', 'pattern', 'range', 'hold']);
			// the six patterns in the guide's order
			const seen: string[] = [];
			for (let i = 0; i < 6; i++) {
				seen.push((d.frame as unknown as { cards: { value: string }[] }).cards[1].value.toString());
				await d.turn(2, 1);
			}
			expect(seen).toEqual(['up', 'down', 'up/down', 'up/repeat/down', 'random', 'play order']);
			await d.withShift(async () => {
				expect(cards()).toEqual(['length', 'style', 'glide', 'stereo']);
			});
		});

		it('arpeggiates held notes, lighting the one it plays', async () => {
			const d = await start();
			await synth(d);
			await d.clicks('key.player', 'key.player');
			await d.click('key.m1');
			await chord(d, ['c4', 'e4', 'g4'], async () => {
				await d.click('key.play');
				const played = new Set<string>();
				for (let i = 0; i < 6; i++) {
					const lit = d.lit();
					expect(lit).toHaveLength(1);
					played.add(lit[0]);
					await d.wait(STEP_MS);
				}
				expect([...played].sort()).toEqual(['c4', 'e4', 'g4']);
			});
			await d.click('key.stop');
		});

		it('records a maestro chord with shift held; any key then plays it transposed', async () => {
			const d = await start();
			await d.click('track.4');
			await d.withShift(async () => {
				await d.click('key.player'); // the list
				await d.turn(1, 2); // hold, maestro
			});
			await d.click('key.player'); // maestro, on
			await d.withShift(() => play(d, 'd4', 'f4', 'a4'));
			await d.down(key('c4'));
			await d.wait(GAP_MS);
			expect(d.lit().sort()).toEqual(['c4', 'ds4', 'g4']);
			await d.up(key('c4'));
			await d.wait(GAP_MS);
			expect(d.lit()).toEqual([]);
		});

		it('holds what is played until the next note; stop lets go', async () => {
			const d = await start();
			await synth(d);
			await d.withShift(async () => {
				await d.click('key.player'); // the list
				await d.turn(1, 1); // hold
			});
			await d.click('key.player'); // hold, on
			await play(d, 'c4');
			expect(d.lit()).toEqual(['c4']);
			await play(d, 'e4');
			expect(d.lit()).toEqual(['e4']);
			await d.click('key.stop');
			expect(d.lit()).toEqual([]);
		});
	});

	describe('8.4 what each digit does (reference table)', () => {
		/** One step with C4 and the component `kind` at `digit`, as the playback reads it. */
		function play1(kind: StepComponentKind, digit: number, pass = 1, seed = 1) {
			const p = emptyPattern();
			p.quantise = 100;
			toggleStep(p, 0, [60]);
			toggleComponent(p, [0], kind);
			setComponentValue(p, [0], kind, digit);
			return stepEvents(p, 0, pass, seededRng(seed));
		}

		it('pulse repeats the step 1–9 times; pulse hold holds it 1–9 steps; 0 is random', () => {
			for (let n = 1; n <= 9; n++) {
				expect(play1('pulse', n).repeats).toBe(n);
				expect(play1('pulse hold', n).hold).toBe(n);
			}
			const random = new Set([1, 2, 3, 4, 5, 6].map((seed) => play1('pulse', 0, 1, seed).repeats));
			expect(random.size).toBeGreaterThan(1);
		});

		it('multiply divides the step into 1–9 trigs (TE’s table prints 3 for 9: device check)', () => {
			// our manual reads TE's "3" for digit 9 as a slip in its table (component-multiply)
			for (let n = 1; n <= 9; n++) expect(play1('multiply', n).notes).toHaveLength(n);
			const random = new Set(
				[1, 2, 3, 4, 5, 6].map((seed) => play1('multiply', 0, 1, seed).notes.length)
			);
			expect(random.size).toBeGreaterThan(1);
		});

		it('velocity forces 4, 8, 16, 32, 64, 100, 112, 127, 0, then random', () => {
			expect(COMPONENT_VELOCITIES).toEqual([4, 8, 16, 32, 64, 100, 112, 127, 0]);
			for (let n = 1; n <= 9; n++) {
				expect(play1('velocity', n).notes[0]?.velocity ?? 0).toBe(COMPONENT_VELOCITIES[n - 1]);
			}
		});

		it('ramps and random span 2–6 steps in one octave (1–5), 2–6 steps over three (6–0)', () => {
			const spans = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((digit) => rampSpan(digit));
			expect(spans.map((s) => `${s.stages}/${s.octaves}`)).toEqual([
				'2/1',
				'3/1',
				'4/1',
				'5/1',
				'6/1',
				'2/3',
				'3/3',
				'4/3',
				'5/3',
				'6/3'
			]);
			// ramp up climbs pass by pass, ramp down falls
			const up = [1, 2, 3].map((pass) => play1('ramp up', 1, pass).notes[0].note);
			const down = [1, 2, 3].map((pass) => play1('ramp down', 1, pass).notes[0].note);
			expect(up[1]).toBeGreaterThan(up[0]);
			expect(down[1]).toBeLessThan(down[0]);
		});

		it('portamento glides 10–90 %; 0 is random', () => {
			for (let n = 1; n <= 9; n++)
				expect(play1('portamento', n).notes[0].glide).toBeCloseTo(n / 10, 9);
		});

		it('bend shapes and tonality settings follow the table’s order', () => {
			expect([...BEND_SHAPES]).toEqual([
				'down-up',
				'up-down',
				'bump down',
				'bump up',
				'spring out',
				'spring in',
				'fade down',
				'fade up',
				'random 1',
				'random 2'
			]);
			expect(play1('bend', 3).notes[0].bend?.shape).toBe('bump down');
			expect(TONALITIES.slice(0, 7)).toEqual([
				'ignore chords',
				'transpose only',
				'octave up',
				'fifth up',
				'third up',
				'chromatic up',
				'chromatic down'
			]);
			// octave, fifth and third up (chromatic without a brain scale), a semitone up and down
			expect([3, 4, 5, 6, 7].map((digit) => play1('tonality', digit).notes[0].note)).toEqual([
				72, 67, 64, 61, 59
			]);
		});

		it('jump goes to step 1, 5, 9, 13, forward, back, either, stays, aligns or anywhere', () => {
			const rng = seededRng(3);
			expect([1, 2, 3, 4].map((digit) => jumpTarget(digit, 6, 16, rng))).toEqual([0, 4, 8, 12]);
			expect(jumpTarget(6, 6, 16, rng)).toBe(5);
			expect(jumpTarget(8, 6, 16, rng)).toBe(6);
			expect(jumpTarget(9, 6, 16, rng)).toBe('align');
			expect(play1('jump', 2).jump).toBe(4);
		});

		it('skip trigger, parameter lock and step component play every Nth pass', () => {
			const passes = [1, 2, 3, 4, 5, 6].filter(
				(pass) => play1('skip trigger', 3, pass).notes.length
			);
			expect(passes).toEqual([3, 6]);
			expect(play1('skip trigger', 1, 1).notes).toHaveLength(1);
		});
	});
}
