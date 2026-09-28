/**
 * The auxiliary tracks and the send effects as the OP-XY does them: conformance cases written from
 * TE's guide (chapter 15 "auxiliary" and chapter 21 "fx", with the brain, punch-in and external
 * gear parts of chapters 4 and 22; guide v1.1.15, reworded in `knowledge/manual/units/auxiliary/*`
 * and `fx/*`), not from our code. Each case works the machine the way a person does, with real
 * press lengths and the computer's Shift key, and checks what a person sees: the track keys that
 * light red, the keys and steps that light, the screen. The model is checked too where the screen
 * cannot tell (which track a note went to, how long a recorded effect lasts).
 *
 * The same cases run on the bare simulator (`auxiliary.spec.ts`, Node) and on the app in a browser,
 * clicking the rendered replica (`src/lib/app/auxiliary-conformance.svelte.spec.ts`).
 *
 * Where the guide leaves something open the case says "ours" and pins our choice. Where the owner's
 * device (OS 1.1.33) writes its pages differently from the guide, the case follows the device and
 * says so (docs/research/59-screen-profiling.md §2.13): the effects' labels, the delay's size as a
 * note value, the tape's percent, pitch multiplier and 16 lengths, the aux filters and LFOs off in
 * a new project. Skipped cases name the file whose bug they catch; they pass once it is fixed.
 */
import { describe, expect, it } from 'vitest';
import type { SimState } from '../params';
import type { ScreenFrame } from '../screen/frame';
import { currentPattern, type Pattern } from '../sequencer';
import {
	GAP_MS,
	accidental,
	addMidiPreset,
	loadEngine,
	noteOf,
	type Driver
} from '../testing/driver';

/** A sixteenth at the new project's 120 BPM. */
const STEP_MS = 125;

/** The six send effects in the order the fx chapter describes them (and the list shows them). */
const EFFECTS = ['chorus', 'delay', 'distortion', 'lofi', 'phaser', 'reverb'] as const;

const step = (n: number) => `step.${n}`;
const key = (name: string) => `keyboard.${name}`;
const play = (d: Driver, ...names: string[]) => d.clicks(...names.map(key));

/** Holds keyboard keys while `during` runs. */
async function holdKeys(d: Driver, names: string[], during: () => Promise<void>): Promise<void> {
	for (const n of names) await d.down(key(n));
	await d.wait(GAP_MS);
	await during();
	for (const n of [...names].reverse()) await d.up(key(n));
	await d.wait(GAP_MS);
}

/** Opens auxiliary track `n` (1–8), on module page `m` when given. */
async function aux(d: Driver, n: number, m?: 1 | 2 | 3 | 4): Promise<void> {
	await d.click('key.auxiliary');
	await d.click(`track.${n}`);
	if (m) await d.click(`key.m${m}`);
}

/** The screen's frame, narrowed to one page (the case fails on another page). */
function page<P extends ScreenFrame['page']>(
	d: Driver,
	name: P
): Extract<ScreenFrame, { page: P }> {
	const frame = d.frame;
	expect(frame.page).toBe(name);
	return frame as Extract<ScreenFrame, { page: P }>;
}

const LED_CHAR: Readonly<Record<string, string>> = { off: '.', dim: 'd', white: 'w', red: 'r' };

/** Track keys 1–8: `.` off, `w` white, `r` red. */
const trackRow = (d: Driver) =>
	Array.from({ length: 8 }, (_, i) => LED_CHAR[d.led(`track.${i + 1}`)]).join('');

/** The row with only track key `n` lit red. */
const redOn = (n: number) => '........'.slice(0, n - 1) + 'r' + '........'.slice(n);

/** The pattern playing on auxiliary track `n` (1–8), or instrument track `n` with `instrument`. */
function patternOf(state: SimState, n: number, instrument = false): Pattern {
	return currentPattern((instrument ? state.tracks : state.aux)[n - 1].sequence);
}

/** A recorded length close to `steps`, allowing for the app's 16 ms animation frames. */
const lasts = (length: number, steps: number) =>
	expect(Math.abs(length - steps)).toBeLessThan(0.15);

/** Steps with notes: "index: notes" (index from 0), as a person would list them. */
function placed(pattern: Pattern): string[] {
	return pattern.steps.flatMap((s, i) =>
		s.notes.length ? [`${i}: ${s.notes.map((n) => n.note).join(' ')}`] : []
	);
}

/** Loads an effect on FX I (`track.7`) or FX II (`track.8`) from the effect list. */
async function loadEffect(
	d: Driver,
	slot: 'track.7' | 'track.8',
	effect: (typeof EFFECTS)[number]
): Promise<void> {
	await d.withShift(() => d.click(slot));
	await d.turn(4, -EFFECTS.length);
	await d.turn(4, EFFECTS.indexOf(effect));
	await d.push(4);
}

/**
 * Selects instrument track 3 (prism in a new project: a melodic track, whose keyboard starts an
 * octave down as its bass preset has it).
 */
const synth = async (d: Driver) => {
	await d.click('key.instrument');
	await d.click('track.3');
};

/**
 * A d minor riff on track 3: d, f, a and d again on steps 1, 5, 9 and 13 (with d once, the same
 * notes read as f major, its relative major).
 */
async function dMinorRiff(d: Driver): Promise<void> {
	await synth(d);
	for (const [note, s] of [
		['d4', 1],
		['f4', 5],
		['a4', 9],
		['d4', 13]
	] as const) {
		await play(d, note);
		await d.click(step(s));
	}
}

export function auxiliaryConformance(start: () => Promise<Driver>): void {
	describe('15 auxiliary mode', () => {
		it('opens on the brain with auxiliary, its key red; instrument gives the tracks back, white', async () => {
			const d = await start();
			expect(trackRow(d)).toBe('w.......');
			await d.click('key.auxiliary');
			expect(trackRow(d)).toBe('r.......');
			expect(d.screen()).toMatch(/^brain: /);
			await d.click('key.instrument');
			expect(trackRow(d)).toBe('w.......');
			expect(d.frame.page).not.toMatch(/^aux-/);
		});

		it('selects each aux track with its key: it lights red and the others go dark', async () => {
			const d = await start();
			await d.click('key.auxiliary');
			const names = [
				/^brain: /,
				/^punch-in fx: /,
				/^external midi: /,
				/^external cv: /,
				/^external audio: /,
				/^tape: /,
				/^FX I delay: /,
				/^FX II reverb: /
			];
			for (let n = 1; n <= 8; n++) {
				await d.click(`track.${n}`);
				expect(trackRow(d)).toBe(redOn(n));
				expect(d.screen()).toMatch(names[n - 1]);
			}
		});

		it('comes back to the aux track last used, and the instrument track keeps its own', async () => {
			const d = await start();
			await d.click('track.4');
			await aux(d, 6);
			await d.click('key.instrument');
			expect(trackRow(d)).toBe('...w....');
			await d.click('key.auxiliary');
			expect(trackRow(d)).toBe(redOn(6));
			expect(d.screen()).toMatch(/^tape: /);
		});

		it('keeps the module page from track to track, showing the main page where a track has none (ours)', async () => {
			const d = await start();
			await aux(d, 6, 3);
			expect(d.frame.page).toBe('aux-filter');
			await d.click('track.7');
			expect(d.frame.page).toBe('aux-filter');
			await d.click('track.2'); // punch-in fx has no filter
			expect(d.frame.page).toBe('aux-punch');
			await d.click('track.5');
			expect(d.frame.page).toBe('aux-filter');
		});

		it('keeps a pattern per aux track, cleared with record + stop held until the row fills red (OS 1.0.32)', async () => {
			const d = await start();
			await aux(d, 2);
			await play(d, 'f3');
			await d.clicks(step(1), step(5));
			await d.click('track.6');
			await play(d, 'c4');
			await d.click(step(9));
			expect(d.steps()).toBe('........w.......');
			await d.click('track.2');
			expect(d.steps()).toBe('w...w...........');
			await d.down('key.record');
			await d.down('key.stop');
			await d.wait(450);
			expect(d.steps()).toMatch(/^r+[.w]*$/);
			await d.wait(750);
			await d.up('key.stop');
			await d.up('key.record');
			await d.wait(GAP_MS);
			expect(d.steps()).toBe('................');
			await d.click('track.6'); // the tape's pattern stays
			expect(d.steps()).toBe('........w.......');
		});
	});

	describe('15.1 brain', () => {
		it('starts automatic in c major with nothing linked, tracks 3–8 routed and the drums not', async () => {
			const d = await start();
			await aux(d, 1);
			expect(d.screen()).toBe('brain: c major, auto, root c, scale major, no linked track');
			await d.click('key.m2');
			// the community's project files: drum tracks 1 and 2 are left out
			expect(d.screen()).toBe('brain routing: tracks 1–4 on the encoders, routed 3 4 5 6 7 8');
		});

		it('detects the key of what the routed tracks play, rooted on the note heard most (ours)', async () => {
			const d = await start();
			await synth(d);
			for (const [note, s] of [
				['d4', 1],
				['f4', 5],
				['a4', 9]
			] as const) {
				await play(d, note);
				await d.click(step(s));
			}
			await aux(d, 1);
			// d, f and a once each: a tie, which our detection gives to the major key
			expect(d.screen()).toBe('brain: f major, auto, root f, scale major, no linked track');
			await synth(d);
			await play(d, 'd4');
			await d.click(step(13));
			await aux(d, 1);
			expect(d.screen()).toBe('brain: d minor, auto, root d, scale minor, no linked track');
		});

		it('switches between detecting the key and a key set by hand with E1; manual keeps it', async () => {
			const d = await start();
			await dMinorRiff(d);
			await aux(d, 1);
			expect(page(d, 'aux-brain')).toMatchObject({ auto: true, root: 'd', scale: 'minor' });
			await d.turn(1, -1);
			expect(page(d, 'aux-brain')).toMatchObject({ auto: false, root: 'd', scale: 'minor' });
			// manual no longer listens: clearing track 3 leaves the key alone
			await synth(d);
			await d.down('key.record');
			await d.down('key.stop');
			await d.wait(1200);
			await d.up('key.stop');
			await d.up('key.record');
			await d.wait(GAP_MS);
			await aux(d, 1);
			expect(page(d, 'aux-brain')).toMatchObject({ auto: false, root: 'd', scale: 'minor' });
			// back to automatic with nothing to hear: the key stays (ours)
			await d.turn(1, 1);
			expect(page(d, 'aux-brain')).toMatchObject({ auto: true, root: 'd', scale: 'minor' });
			// an E1 click flips it too (ours)
			await d.push(1);
			expect(page(d, 'aux-brain').auto).toBe(false);
			await d.push(1);
			expect(page(d, 'aux-brain').auto).toBe(true);
		});

		it('sets the key with E2 and the scale with E3, which leaves automatic for manual (ours)', async () => {
			const d = await start();
			await aux(d, 1);
			await d.turn(2, 2);
			await d.turn(3, 1);
			expect(d.screen()).toBe('brain: d dorian, manual, root d, scale dorian, no linked track');
			// the octave's dots mark the scale's notes: d e f g a b c
			const dots = page(d, 'aux-brain').notes.flatMap((on, pc) => (on ? [pc] : []));
			expect(dots).toEqual([0, 2, 4, 5, 7, 9, 11]);
			// the twelve keys with sharps, and the seven scales in the device's order (community)
			await d.turn(2, -12);
			const roots: string[] = [];
			for (let i = 0; i < 12; i++) {
				roots.push(page(d, 'aux-brain').root);
				await d.turn(2, 1);
			}
			expect(roots).toEqual(['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']);
			expect(page(d, 'aux-brain').root).toBe('b'); // no wrap at the ends (ours)
			await d.turn(3, -7);
			const scales: string[] = [];
			for (let i = 0; i < 7; i++) {
				scales.push(page(d, 'aux-brain').scale);
				await d.turn(3, 1);
			}
			// the device's screen writes mixolydian "mixo" (OS 1.1.33)
			expect(scales).toEqual(['major', 'dorian', 'phrygian', 'lydian', 'mixo', 'minor', 'locrian']);
		});

		it('links an instrument track with E4, or none at the left end', async () => {
			const d = await start();
			await aux(d, 1);
			await d.turn(4, 1);
			expect(d.screen()).toBe('brain: c major, auto, root c, scale major, linked track 1');
			await d.turn(4, 5);
			expect(page(d, 'aux-brain').link).toBe('06');
			await d.turn(4, 10);
			expect(page(d, 'aux-brain').link).toBe('08');
			await d.turn(4, -10);
			expect(page(d, 'aux-brain').link).toBeNull();
		});

		it('hears only the routed tracks: the drums count once routed on M2', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'c4');
			await d.click(step(1));
			await d.click('track.1'); // drums: sounds pulling away from c major
			await play(d, 'fs3');
			await d.clicks(step(1), step(5), step(9));
			await play(d, 'as3');
			await d.click(step(3));
			await play(d, 'cs4');
			await d.click(step(7));
			await aux(d, 1);
			expect(page(d, 'aux-brain')).toMatchObject({ root: 'c', scale: 'major' });
			await d.click('key.m2');
			await d.turn(1, 1);
			expect(d.screen()).toBe('brain routing: tracks 1–4 on the encoders, routed 1 3 4 5 6 7 8');
			await d.click('key.m1');
			expect(page(d, 'aux-brain')).toMatchObject({ root: 'f#', scale: 'lydian' });
		});

		it('transposes with its keyboard: the title names the key the routed tracks play in now', async () => {
			const d = await start();
			await aux(d, 1);
			await d.down(key('g3'));
			await d.wait(GAP_MS);
			expect(d.lit()).toEqual(['g3']);
			expect(d.screen()).toBe('brain: g major, auto, root c, scale major, no linked track');
			await d.up(key('g3'));
			await d.wait(GAP_MS);
			expect(d.lit()).toEqual([]);
			// the transposition holds after the key comes up
			expect(page(d, 'aux-brain').title).toBe('g major');
			// setting the key by hand starts over from it (ours)
			await d.turn(2, 2);
			expect(page(d, 'aux-brain').title).toBe('d major');
		});

		it('moves a detected song key: d minor played from the brain’s f is f minor', async () => {
			const d = await start();
			await dMinorRiff(d);
			await aux(d, 1);
			await play(d, 'f3');
			expect(page(d, 'aux-brain')).toMatchObject({ title: 'f minor', root: 'd', auto: true });
		});

		it('takes a chord to its lowest note, played on the keyboard or sequenced on a step (ours)', async () => {
			const d = await start();
			await aux(d, 1);
			await holdKeys(d, ['c4', 'e4'], async () => {
				expect(page(d, 'aux-brain').title).toBe('c major');
			});
			await holdKeys(d, ['c4', 'e4', 'a3'], () => d.click(step(1)));
			expect(page(d, 'aux-brain').title).toBe('a major');
			await play(d, 'd4'); // stopped, the keyboard moves it on
			expect(page(d, 'aux-brain').title).toBe('d major');
			await d.down('key.play');
			expect(page(d, 'aux-brain').title).toBe('a major'); // the chord on step 1
			await d.wait(GAP_MS);
			await d.up('key.play');
			await d.click('key.stop');
		});

		it('plays chord changes sequenced on its own steps, each holding until the next', async () => {
			const d = await start();
			await aux(d, 1);
			await play(d, 'a3');
			await d.click(step(1));
			await play(d, 'f3');
			await d.click(step(9));
			expect(d.steps()).toBe('w.......w.......');
			await d.down('key.play'); // looking as it starts: step 1's change is sounding
			expect(page(d, 'aux-brain').title).toBe('a major');
			expect(d.lit()).toEqual(['a3']); // the change lights its key while it sounds (ours)
			await d.wait(GAP_MS);
			await d.up('key.play');
			await d.wait(4 * STEP_MS);
			expect(page(d, 'aux-brain').title).toBe('a major');
			expect(d.lit()).toEqual([]);
			await d.wait(4 * STEP_MS);
			expect(page(d, 'aux-brain').title).toBe('f major');
			await d.wait(6 * STEP_MS);
			expect(page(d, 'aux-brain').title).toBe('f major');
			await d.click('key.stop');
			// stopped, the keyboard's last change is in force again
			await play(d, 'd4');
			expect(page(d, 'aux-brain').title).toBe('d major');
		});

		it('records chord changes played live into its pattern (how-to)', async () => {
			const d = await start();
			await aux(d, 1);
			await d.click('key.play');
			await d.down('key.record');
			await d.wait(2 * STEP_MS + 80); // the playhead reaches step 5
			await play(d, 'g3');
			await d.up('key.record');
			await d.click('key.stop');
			expect(d.steps()).toBe('....w...........');
			expect(placed(patternOf(d.state, 1))).toEqual([`4: ${noteOf('g3')}`]);
			await d.click('key.play');
			expect(page(d, 'aux-brain').title).toBe('g major'); // the loop's last change holds
			await d.click('key.stop');
		});

		it('plays its pattern four times slower at track scale 4: a chord change a bar (how-to)', async () => {
			const d = await start();
			await aux(d, 1);
			await d.holding('key.bar', () => d.click(accidental(4)));
			await play(d, 'a3');
			await d.click(step(1));
			await play(d, 'f3');
			await d.click(step(5));
			await d.click('key.play');
			expect(page(d, 'aux-brain').title).toBe('a major');
			await d.wait(12 * STEP_MS); // late in bar 1
			expect(page(d, 'aux-brain').title).toBe('a major');
			await d.wait(4 * STEP_MS); // into bar 2
			expect(page(d, 'aux-brain').title).toBe('f major');
			await d.click('key.stop');
		});

		it('routes on M2: an encoder adds or removes its track, a click swaps tracks 1–4 for 5–8', async () => {
			const d = await start();
			await aux(d, 1, 2);
			await d.turn(1, 2);
			await d.turn(3, -1);
			expect(d.screen()).toBe('brain routing: tracks 1–4 on the encoders, routed 1 4 5 6 7 8');
			await d.push(2);
			expect(d.screen()).toBe('brain routing: tracks 5–8 on the encoders, routed 1 4 5 6 7 8');
			await d.turn(4, -1);
			expect(d.screen()).toBe('brain routing: tracks 5–8 on the encoders, routed 1 4 5 6 7');
			await d.push(4);
			expect(d.screen()).toBe('brain routing: tracks 1–4 on the encoders, routed 1 4 5 6 7');
		});

		it('keeps its settings per pattern of the brain track (OS 1.0.25), routing too (OS 1.0.29)', async () => {
			const d = await start();
			await aux(d, 1);
			await d.turn(2, 2); // pattern 1 in d
			// a second pattern on the brain track: arrange, the aux tracks, T1, M1 (new)
			await d.click('key.arrange');
			await d.click('key.arrange');
			await d.click('track.1');
			await d.click('key.m1');
			await d.click('key.auxiliary');
			expect(page(d, 'aux-brain').root).toBe('d'); // ours: it starts from the first's settings
			await d.turn(2, 2); // pattern 2 in e
			await d.click('key.m2');
			await d.turn(3, -1); // and without track 3
			await d.click('key.arrange');
			await d.turn(4, -1); // back to pattern 1
			await d.click('key.auxiliary');
			expect(d.screen()).toBe('brain routing: tracks 1–4 on the encoders, routed 3 4 5 6 7 8');
			await d.click('key.m1');
			expect(page(d, 'aux-brain').root).toBe('d');
			await d.click('key.arrange');
			await d.turn(4, 1);
			await d.click('key.auxiliary');
			expect(page(d, 'aux-brain').root).toBe('e');
		});

		it('keeps a later pattern’s settings when an earlier brain pattern is removed', async () => {
			const d = await start();
			await aux(d, 1);
			await d.turn(2, 2); // pattern 1 in d
			await d.click('key.arrange');
			await d.click('key.arrange'); // the aux tracks
			await d.click('track.1');
			await d.click('key.m1');
			await d.click('key.auxiliary');
			await d.turn(2, 2); // pattern 2 in e
			await d.click('key.arrange');
			await d.click('key.m1');
			await d.click('key.auxiliary');
			await d.turn(2, 2); // pattern 3 in f#
			await d.click('key.arrange');
			await d.turn(4, -1); // pattern 2
			await d.click('key.m4'); // removed: pattern 1 plays
			await d.turn(4, 1); // the pattern in f#, second now
			await d.click('key.auxiliary');
			expect(page(d, 'aux-brain').root).toBe('f#');
		});
	});

	describe('15.2 punch-in fx', () => {
		it('idles with a heartbeat across the dot matrix; a held key shows its effect (the device)', async () => {
			const d = await start();
			await aux(d, 2);
			// running from the left edge since the page opened
			expect(page(d, 'aux-punch').beat).toMatchObject({ row: 8 });
			expect(page(d, 'aux-punch').beat?.col).toBeLessThan(5);
			await d.down(key('g3'));
			await d.wait(GAP_MS);
			expect(page(d, 'aux-punch')).toMatchObject({ picture: 2, beat: null });
			await d.up(key('g3')); // back at the left edge
			expect(page(d, 'aux-punch').beat).toEqual({ col: 0, row: 8 });
			await d.wait(1340); // the spike's top
			expect(page(d, 'aux-punch').beat).toEqual({ col: 20, row: 4 });
		});

		it('fires each key’s effect while it is held, and combines keys held together', async () => {
			const d = await start();
			await aux(d, 2);
			expect(d.screen()).toBe('punch-in fx: hold keys for effects');
			await d.down(key('f3'));
			await d.wait(GAP_MS);
			expect(d.screen()).toBe('punch-in fx: percussion 1');
			expect(d.lit()).toEqual(['f3']);
			await d.down(key('c4'));
			await d.wait(GAP_MS);
			expect(d.screen()).toBe('punch-in fx: percussion 1 8');
			expect(d.lit()).toEqual(['f3', 'c4']);
			await d.up(key('f3'));
			await d.wait(GAP_MS);
			expect(d.screen()).toBe('punch-in fx: percussion 8');
			await d.up(key('c4'));
			await d.wait(GAP_MS);
			expect(d.screen()).toBe('punch-in fx: hold keys for effects');
			expect(d.lit()).toEqual([]);
		});

		it('gives the lower octave to the percussion tracks and the upper octave to the melodic ones', async () => {
			const d = await start();
			await aux(d, 2);
			await holdKeys(d, ['e4'], async () => {
				expect(d.screen()).toBe('punch-in fx: percussion 12');
			});
			await holdKeys(d, ['f4'], async () => {
				expect(d.screen()).toBe('punch-in fx: melodic 1');
			});
			await holdKeys(d, ['a3', 'e5'], async () => {
				expect(d.screen()).toBe('punch-in fx: percussion 5, melodic 12');
			});
		});

		it('sequences effects like notes, a key and then a step; they fire as the playhead passes', async () => {
			const d = await start();
			await aux(d, 2);
			await play(d, 'gs3');
			await d.click(step(1));
			expect(d.steps()).toBe('w...............');
			expect(d.screen()).toBe('punch-in fx: hold keys for effects');
			await d.down('key.play'); // looking as it starts: step 1's effect is sounding
			expect(d.screen()).toBe('punch-in fx: percussion 4');
			expect(d.lit()).toEqual(['gs3']);
			await d.wait(GAP_MS);
			await d.up('key.play');
			await d.wait(STEP_MS);
			expect(d.screen()).toBe('punch-in fx: hold keys for effects');
			expect(d.lit()).toEqual([]);
			await d.click('key.stop');
		});

		it('plays a sequenced effect as long as its note lasts: stretched over four steps, four steps', async () => {
			const d = await start();
			await aux(d, 2);
			await play(d, 'a3');
			await d.click(step(1));
			await d.holding(step(1), () => d.click(step(4)));
			await d.click('key.play');
			expect(d.screen()).toBe('punch-in fx: percussion 5');
			await d.wait(2 * STEP_MS); // step 4
			expect(d.screen()).toBe('punch-in fx: percussion 5');
			expect(d.lit()).toEqual(['a3']);
			await d.wait(STEP_MS); // step 5
			expect(d.screen()).toBe('punch-in fx: hold keys for effects');
			expect(d.lit()).toEqual([]);
			await d.click('key.stop');
		});

		it('records effects played live on the punch-in track, each as long as it was held', async () => {
			const d = await start();
			await aux(d, 2);
			await d.click('key.play');
			await d.holding('key.record', () => d.click('key.play')); // latched
			await d.down(key('b3'));
			await d.wait(2 * STEP_MS);
			await d.up(key('b3'));
			await d.click('key.stop');
			const recorded = patternOf(d.state, 2).steps.flatMap((s) => s.notes);
			expect(recorded.map((n) => n.note)).toEqual([noteOf('b3')]);
			lasts(recorded[0].length, 2);
			expect(d.steps()).toBe('....w...........'); // played near step 5
		});

		it('fires effects with shift + key on an instrument track, which plays no note', async () => {
			const d = await start();
			await synth(d);
			await play(d, 'c4');
			await d.withShift(async () => {
				await d.down(key('e4'));
				await d.wait(GAP_MS);
				expect(d.lit()).toEqual(['e4']);
				expect(d.frame.page).toBe('synth'); // the track's page stays up
				await d.up(key('e4'));
				await d.wait(GAP_MS);
			});
			await d.click(step(1)); // e4 was an effect: the last note played is still c4
			expect(placed(patternOf(d.state, 3, true))).toEqual(['0: 48']); // T3 starts an octave down
		});

		it('fires them from drum tracks too, but not from a midi engine track (OS 1.0.32)', async () => {
			const d = await start();
			await play(d, 'gs3'); // drum track 1
			await d.withShift(() => play(d, 'a3'));
			await d.click(step(1));
			expect(placed(patternOf(d.state, 1, true))).toEqual([`0: ${noteOf('gs3')}`]);
			// track 3 on the midi engine: a midi preset, loaded from the browser shift + M1 brings up
			await synth(d);
			addMidiPreset(d);
			await loadEngine(d, 'midi');
			expect(d.frame.page).toBe('midi');
			await play(d, 'c4');
			await d.withShift(() => play(d, 'e4'));
			await d.click(step(1));
			expect(placed(patternOf(d.state, 3, true))).toEqual(['0: 52']); // e4, T3 an octave down
		});

		it('writes shift + key effects played while recording to the punch-in track, where they play back', async () => {
			const d = await start();
			await synth(d);
			await d.click('key.play');
			await d.holding('key.record', () => d.click('key.play')); // latched, near step 4
			await d.withShift(async () => {
				await d.wait(230); // the playhead reaches step 7
				await d.down(key('c4'));
				await d.wait(2 * STEP_MS);
				await d.up(key('c4'));
			});
			await d.click('key.stop');
			await aux(d, 2);
			expect(d.steps()).toBe('......w.........');
			const effect = patternOf(d.state, 2).steps[6].notes;
			expect(effect.map((n) => n.note)).toEqual([60]);
			lasts(effect[0].length, 2); // as long as it was held
			await d.click('key.play');
			await d.wait(5 * STEP_MS); // step 7
			expect(d.screen()).toBe('punch-in fx: percussion 8');
			await d.wait(STEP_MS); // step 8: still held
			expect(d.screen()).toBe('punch-in fx: percussion 8');
			await d.wait(STEP_MS); // step 9: let go
			expect(d.screen()).toBe('punch-in fx: hold keys for effects');
			await d.click('key.stop');
		});

		it('records a shift + key effect, not a note, while recording on an instrument track', async () => {
			const d = await start();
			await synth(d);
			await d.click('key.play');
			await d.holding('key.record', () => d.click('key.play'));
			await d.withShift(() => play(d, 'c4'));
			await d.click('key.stop');
			expect(placed(patternOf(d.state, 3, true))).toEqual([]);
			expect(placed(patternOf(d.state, 2))).toHaveLength(1);
		});

		it('keeps the 24 effects in place after [+]: the effect placed is the one played', async () => {
			const d = await start();
			await aux(d, 2);
			await d.click('key.plus');
			await holdKeys(d, ['f3'], async () => {
				expect(d.screen()).toBe('punch-in fx: percussion 1');
			});
			await d.click(step(1));
			await d.down('key.play');
			expect(d.screen()).toBe('punch-in fx: percussion 1');
			await d.wait(GAP_MS);
			await d.up('key.play');
			await d.click('key.stop');
		});
	});

	describe('15.3 external midi', () => {
		it('sets the channel with E1, the bank with E2 and the program with E3 on M1', async () => {
			const d = await start();
			await aux(d, 3);
			// the device writes the channel in two digits, bank and program crossed at none
			expect(d.screen()).toBe('external midi: channel 01, bank none, program none');
			await d.turn(1, 9);
			await d.turn(2, 3);
			await d.turn(3, 8);
			expect(d.screen()).toBe('external midi: channel 10, bank 3, program 8');
			// channel 01–16; bank and program none below 1, 128 at most (the device's CC sweeps)
			await d.turn(1, 20);
			await d.turn(2, -5);
			await d.turn(3, 200);
			expect(d.screen()).toBe('external midi: channel 16, bank none, program 128');
			await d.turn(1, -30);
			expect(page(d, 'aux-midi').channel).toBe('01');
			await d.turn(4, 5); // E4 has nothing to set
			expect(d.screen()).toBe('external midi: channel 01, bank none, program 128');
		});

		it('keeps four CC slots on M2 (set I), each off until shift + turn picks its CC number', async () => {
			const d = await start();
			await aux(d, 3, 2);
			// the device crosses an off slot and writes "off" under it
			expect(d.screen()).toBe('external midi set I: off, off, off, off');
			await d.turn(1, 10); // an off slot has no value to send (ours)
			expect(page(d, 'aux-cc').slots[0]).toEqual({ cc: null, value: '0' });
			await d.withShift(async () => {
				await d.turn(1, 75); // off, then CC 0 … 74
				expect(d.screen()).toBe('external midi set I: cc 74 0, off, off, off');
			});
			expect(d.screen()).toBe('external midi set I: cc 74 0, off, off, off');
			await d.turn(1, 64);
			expect(page(d, 'aux-cc').slots[0]).toEqual({ cc: 74, value: '64' });
			await d.turn(1, 100);
			expect(page(d, 'aux-cc').slots[0].value).toBe('127');
			// below CC 0 the slot is off again (ours)
			await d.withShift(() => d.turn(1, -80));
			expect(page(d, 'aux-cc').slots[0].cc).toBeNull();
		});

		it('keeps four more slots on M3 (set II), apart from set I', async () => {
			const d = await start();
			await aux(d, 3, 3);
			await d.withShift(() => d.turn(4, 12));
			expect(d.screen()).toBe('external midi set II: off, off, off, cc 11 0');
			await d.turn(4, 90);
			expect(page(d, 'aux-cc').slots[3].value).toBe('90');
			await d.click('key.m2');
			expect(d.screen()).toBe('external midi set I: off, off, off, off');
			// the device's midi pages carry no soft labels (TE's art wrote main, set I, set II,
			// modulation)
			expect(page(d, 'aux-cc').set).toBe('I');
		});

		it('aims its LFO on M4 at a slot of either set, naming the slot by its CC', async () => {
			const d = await start();
			await aux(d, 3, 2);
			await d.withShift(() => d.turn(2, 8)); // slot 2: CC 7
			await d.click('key.m4');
			// off in a new project, as the device shows it: M4 again switches it on
			expect(d.screen()).toBe('lfo off: amount 0, destination off, parameter no cc set');
			await d.click('key.m4');
			expect(d.screen()).toBe('lfo: amount 0, destination off, parameter no cc set');
			await d.turn(3, 1);
			expect(d.screen()).toBe('lfo: amount 0, destination cc1, parameter no cc set');
			await d.turn(4, 1);
			expect(d.screen()).toBe('lfo: amount 0, destination cc1, parameter cc 7');
			await d.turn(3, 1);
			expect(d.screen()).toBe('lfo: amount 0, destination cc2, parameter no cc set');
			await d.turn(2, -99);
			await d.turn(1, 1);
			expect(page(d, 'aux-lfo')).toMatchObject({
				amount: -100,
				speed: { synced: true, label: '12' }
			});
		});

		it('plays and sequences notes like any track, the keyboard an octave up after [+]', async () => {
			const d = await start();
			await aux(d, 3);
			await play(d, 'c4');
			await d.click(step(1));
			await d.click('key.plus');
			await play(d, 'c4');
			await d.click(step(9));
			expect(d.steps()).toBe('w.......w.......');
			expect(placed(patternOf(d.state, 3))).toEqual(['0: 60', '8: 72']);
		});

		it('locks a CC value on a held step, keeping the step’s note (CCs are sequenced)', async () => {
			const d = await start();
			await aux(d, 3);
			await play(d, 'c4');
			await d.click(step(1));
			await d.click('key.m2');
			await d.withShift(() => d.turn(1, 75));
			await d.holding(step(1), () => d.turn(1, 20));
			expect(page(d, 'aux-cc').slots[0].value).toBe('0'); // the slot's own value stays
			expect(Object.keys(patternOf(d.state, 3).steps[0].locks)).toHaveLength(1);
			expect(placed(patternOf(d.state, 3))).toEqual(['0: 60']);
		});

		it('records CC moves made while recording live (automation)', async () => {
			const d = await start();
			await aux(d, 3, 2);
			await d.withShift(() => d.turn(1, 75));
			await d.click('key.play');
			await d.holding('key.record', async () => {
				await d.wait(STEP_MS);
				await d.turn(1, 30);
			});
			await d.click('key.stop');
			expect(patternOf(d.state, 3).steps.some((s) => Object.keys(s.locks).length > 0)).toBe(true);
		});
	});

	describe('15.4 external cv', () => {
		it('plays notes from the keyboard: the needle shows the pitch at 1 V per octave from C4 (ours)', async () => {
			const d = await start();
			await aux(d, 4);
			expect(d.screen()).toBe('external cv: +0.00 volts');
			await play(d, 'c5');
			expect(d.screen()).toBe('external cv: +1.00 volts');
			await play(d, 'fs3');
			expect(d.screen()).toBe('external cv: –0.50 volts');
			await d.click('key.plus'); // the keyboard an octave up
			await play(d, 'c5');
			expect(d.screen()).toBe('external cv: +2.00 volts');
		});

		it('follows its pattern as it plays, the needle holding each note until the next (ours)', async () => {
			const d = await start();
			await aux(d, 4);
			await play(d, 'c5');
			await d.click(step(1));
			await d.click('key.minus');
			await play(d, 'c4'); // C3 an octave down
			await d.click(step(9));
			await play(d, 'fs3'); // the keyboard's last note, below both
			await d.click('key.play');
			expect(d.screen()).toBe('external cv: +1.00 volts');
			await d.wait(5 * STEP_MS);
			expect(d.screen()).toBe('external cv: +1.00 volts');
			await d.wait(3 * STEP_MS);
			expect(d.screen()).toBe('external cv: –1.00 volts');
			await d.click('key.stop');
			expect(d.screen()).toBe('external cv: –1.50 volts');
		});

		it('has no settings: every page shows the meter and the encoders change nothing (ours)', async () => {
			const d = await start();
			await aux(d, 4);
			for (const m of [1, 2, 3, 4]) {
				await d.click(`key.m${m}`);
				for (const e of [1, 2, 3, 4]) await d.turn(e, 5);
				await d.push(1);
				expect(d.screen()).toBe('external cv: +0.00 volts');
			}
		});
	});

	describe('15.5 external audio', () => {
		it('chooses the input with E1: mic, headset, audio input, usb audio, main output', async () => {
			const d = await start();
			await aux(d, 5);
			const inputs: string[] = [];
			for (let i = 0; i < 5; i++) {
				inputs.push(page(d, 'aux-audio').input);
				await d.turn(1, 1);
			}
			expect(inputs).toEqual(['mic', 'headset', 'audio input', 'usb audio', 'main output']);
			expect(page(d, 'aux-audio').input).toBe('main output');
		});

		it('switches the chosen input on and off with a click on E1 (how-to)', async () => {
			const d = await start();
			await aux(d, 5);
			await d.turn(1, 2); // the audio input jack
			expect(d.screen()).toBe('external audio: audio input off, drive 00, level 75, mix 99');
			await d.push(1);
			expect(d.screen()).toBe('external audio: audio input on, drive 00, level 75, mix 99');
			await d.push(2); // the other clicks leave it (ours)
			await d.push(4);
			expect(page(d, 'aux-audio').on).toBe(true);
			await d.push(1);
			expect(page(d, 'aux-audio').on).toBe(false);
		});

		it('sets drive 00–20 with E2, level with E3 and mix with E4, 0–99', async () => {
			const d = await start();
			await aux(d, 5);
			// the community's project files: drive 0, level 75, mix 99; the device writes drive 00–20
			await d.turn(2, 15);
			await d.turn(3, -80);
			await d.turn(4, -24);
			expect(d.screen()).toBe('external audio: mic off, drive 15, level 00, mix 75');
			await d.turn(2, 200);
			expect(page(d, 'aux-audio').drive).toBe('20');
		});

		it('routes instrument tracks out of the aux output on M2, each at its own amount (how-to)', async () => {
			const d = await start();
			await aux(d, 5, 2);
			// a new project sends its lead on T5 out of the aux output already
			expect(d.screen()).toBe('aux out routing: tracks 1–4 on the encoders, routed 5');
			await d.turn(3, 40);
			expect(page(d, 'aux-route').tracks[2]).toEqual({
				routed: true,
				amount: 40 / 99,
				value: '40'
			});
			await d.push(1);
			await d.turn(2, 20);
			expect(d.screen()).toBe('aux out routing: tracks 5–8 on the encoders, routed 3 5 6');
			// the track's own send page (M3 with shift) shows the same amount, and sets it too
			await synth(d);
			await d.click('key.m3');
			await d.withShift(async () => {
				expect(d.screen()).toBe('sends: aux 40, tape 99, fx I 00, fx II 00');
				await d.turn(1, -10);
			});
			await aux(d, 5, 2);
			expect(page(d, 'aux-route').tracks[2].value).toBe('30');
		});

		it('filters on M3 (E1 high-pass, E4 low-pass); with shift it sends to tape, FX I and FX II', async () => {
			const d = await start();
			await aux(d, 5, 3);
			// off in a new project, as the device shows it: M3 again switches it on
			expect(d.screen()).toBe('filter off: high-pass 0, low-pass 99');
			await d.click('key.m3');
			expect(d.screen()).toBe('filter: high-pass 0, low-pass 99');
			await d.turn(1, 20);
			await d.turn(4, -30);
			await d.turn(2, 5); // nothing on E2 and E3
			await d.turn(3, 5);
			expect(d.screen()).toBe('filter: high-pass 20, low-pass 69');
			await d.withShift(async () => {
				// (the device's send cards write "no send" at 00)
				expect(d.screen()).toBe('sends: tape 00, fx I 00, fx II 00');
				await d.turn(1, 10); // no aux out send from the aux out's own track (ours)
				await d.turn(2, 20);
				await d.turn(3, 30);
				await d.turn(4, 40);
				expect(d.screen()).toBe('sends: tape 20, fx I 30, fx II 40');
			});
			expect(d.screen()).toBe('filter: high-pass 20, low-pass 69');
			await d.click('key.m3');
			expect(d.screen()).toBe('filter off: high-pass 20, low-pass 69');
		});

		it('aims its LFO on M4 at its own page, its filter or its amp, as the device lists them', async () => {
			const d = await start();
			await aux(d, 5, 4);
			expect(d.screen()).toBe('lfo off: amount 0, destination syn, parameter param1');
			await d.click('key.m4');
			expect(d.screen()).toBe('lfo: amount 0, destination syn, parameter param1');
			await d.turn(4, 2);
			expect(page(d, 'aux-lfo').parameterName).toBe('param3'); // ours past param1
			await d.push(4); // an E4 click steps on, round to the first (ours)
			await d.push(4);
			expect(page(d, 'aux-lfo').parameterName).toBe('param1');
			await d.turn(3, 1);
			expect(d.screen()).toBe('lfo: amount 0, destination filter, parameter hi pass');
			await d.turn(3, 1);
			expect(d.screen()).toBe('lfo: amount 0, destination amp, parameter volume');
			await d.turn(4, 1);
			expect(page(d, 'aux-lfo').parameterName).toBe('pan');
			await d.turn(4, 1); // nothing on the amp's E3 and E4: "-"
			expect(page(d, 'aux-lfo').parameterName).toBe('-');
		});
	});

	describe('15.6 tape', () => {
		it('sets pitch with E1, speed with E2, loop length with E3 and mix with E4', async () => {
			const d = await start();
			await aux(d, 6);
			// the device writes the pitch "x1", the speed with a percent sign and "mix" over its box
			// (TE's picture: "X1", no percent, "dry")
			expect(d.screen()).toBe('tape: pitch x1, speed 100, length 1, mix 00');
			await d.turn(1, 1);
			await d.turn(2, -16);
			await d.turn(3, 2);
			await d.turn(4, 72);
			expect(d.screen()).toBe('tape: pitch x2, speed 84, length 3, mix 72'); // TE's picture
			// ranges as the device's CC sweeps show them: x1–x10, 50–200 %, length 1–16, mix 00–99
			await d.turn(1, 20);
			await d.turn(2, -100);
			await d.turn(3, 20);
			await d.turn(4, 50);
			expect(d.screen()).toBe('tape: pitch x10, speed 50, length 16, mix 99');
		});

		it('plays clips from its keyboard: the keys held light and are dotted on the page', async () => {
			const d = await start();
			await aux(d, 6);
			await d.down(key('e4'));
			await d.wait(GAP_MS);
			expect(d.lit()).toEqual(['e4']);
			expect(page(d, 'aux-tape').keys).toEqual([11]);
			await d.down(key('fs4'));
			await d.wait(GAP_MS);
			expect(page(d, 'aux-tape').keys).toEqual([11, 13]);
			await d.up(key('fs4'));
			await d.up(key('e4'));
			await d.wait(GAP_MS);
			// the device writes the loop length where TE's picture had the last clip's number
			expect(page(d, 'aux-tape')).toMatchObject({ keys: [], length: '1' });
			expect(d.lit()).toEqual([]);
		});

		it('plays clips sequenced on its steps as the playhead passes', async () => {
			const d = await start();
			await aux(d, 6);
			await play(d, 'b3');
			await d.click(step(1));
			await d.down('key.play'); // looking as it starts: step 1's clip is sounding
			expect(page(d, 'aux-tape').keys).toEqual([6]);
			expect(d.lit()).toEqual(['b3']);
			await d.wait(GAP_MS);
			await d.up('key.play');
			await d.wait(STEP_MS);
			expect(page(d, 'aux-tape').keys).toEqual([]);
			await d.click('key.stop');
		});

		it('routes tracks into the tape on M2 at their own amounts; their hits land on the loop (ours)', async () => {
			const d = await start();
			await play(d, 'f3'); // a kick on drum track 1, steps 1 and 3
			await d.clicks(step(1), step(3));
			await aux(d, 6, 2);
			// a new project sends every track to the tape at 99
			expect(d.screen()).toBe('tape routing: tracks 1–4 on the encoders, routed 1 2 3 4 5 6 7 8');
			await d.turn(1, -99); // T1 out …
			expect(d.screen()).toBe('tape routing: tracks 1–4 on the encoders, routed 2 3 4 5 6 7 8');
			await d.turn(1, 50); // … and back in at 50
			expect(d.screen()).toBe('tape routing: tracks 1–4 on the encoders, routed 1 2 3 4 5 6 7 8');
			expect(page(d, 'aux-route').tracks[0].value).toBe('50');
			await d.click('key.m1');
			expect(page(d, 'aux-tape').hits).toEqual([0, 0.5]); // a one-beat loop
			await d.turn(3, 1);
			expect(page(d, 'aux-tape').hits).toEqual([0, 0.25]); // a two-beat loop
			// the drum track's own send page shows its tape send
			await d.click('key.instrument');
			await d.click('track.1');
			await d.click('key.m3');
			await d.withShift(async () => {
				expect(d.screen()).toBe('sends: aux 00, tape 50, fx I 00, fx II 00');
			});
		});

		it('sends to FX I (E3) and FX II (E4) on the M3 shift layer; nothing on E1 or E2', async () => {
			const d = await start();
			await aux(d, 6, 3);
			await d.withShift(async () => {
				expect(d.screen()).toBe('sends: fx I 00, fx II 00');
				await d.turn(1, 10);
				await d.turn(2, 10);
				await d.turn(3, 25);
				await d.turn(4, 35);
				expect(d.screen()).toBe('sends: fx I 25, fx II 35');
			});
			expect(d.screen()).toBe('filter off: high-pass 0, low-pass 99');
		});

		it('aims its LFO on M4 at its own page, its filter or its amp (ours after external audio’s)', async () => {
			const d = await start();
			await aux(d, 6, 4);
			expect(d.screen()).toBe('lfo off: amount 0, destination syn, parameter param1');
			await d.turn(4, 1);
			expect(page(d, 'aux-lfo').parameterName).toBe('param2');
			await d.turn(3, 1);
			expect(page(d, 'aux-lfo')).toMatchObject({
				destinations: ['syn', 'filter', 'amp'],
				destination: 1,
				parameterName: 'hi pass'
			});
		});
	});

	describe('15.7 fx i and fx ii', () => {
		it('starts with the delay on FX I and the reverb on FX II', async () => {
			const d = await start();
			// as a new project on the device sets them, labelled as its screen labels them
			await aux(d, 7);
			expect(d.screen()).toBe('FX I delay: size 1/8 dotted, fine 50, feedback 50, dry 99');
			await d.click('track.8');
			expect(d.screen()).toBe('FX II reverb: size 69, mod 00, tone 29, dry 99');
		});

		it('routes instrument tracks in on M2: the same sends as their send pages and mix M1', async () => {
			const d = await start();
			await aux(d, 8, 2);
			// a new project sends T4–T7 to FX II already
			expect(d.screen()).toBe('FX II routing: tracks 1–4 on the encoders, routed 4 5 6 7');
			await d.push(1);
			await d.turn(4, 33); // track 8 sends 33 to FX II
			expect(d.screen()).toBe('FX II routing: tracks 5–8 on the encoders, routed 4 5 6 7 8');
			// mix M1 sets the selected track's FX II send with E2
			await synth(d);
			await d.click('key.mix');
			await d.turn(2, 20);
			await aux(d, 8, 2);
			// the device writes the sends on its routing pages as plain numbers ("0", "39")
			expect(page(d, 'aux-route').tracks.map((t) => t.value)).toEqual([
				'0',
				'0',
				'20',
				'23',
				'39',
				'15',
				'53',
				'33'
			]);
			// and track 8's own send page shows it
			await d.click('key.instrument');
			await d.click('track.8');
			await d.click('key.m3');
			await d.withShift(async () => {
				expect(d.screen()).toBe('sends: aux 00, tape 99, fx I 00, fx II 33');
			});
			// FX I's routing is the tracks' FX I sends (T5 and T7 in a new project)
			await aux(d, 7, 2);
			expect(d.screen()).toBe('FX I routing: tracks 1–4 on the encoders, routed 5 7');
		});

		it('sends FX I on into FX II with shift + E4 on its M3; FX II sends nowhere (ours)', async () => {
			const d = await start();
			await aux(d, 7, 3);
			await d.withShift(async () => {
				expect(d.screen()).toBe('sends: fx II 00');
				await d.turn(1, 10);
				await d.turn(2, 10);
				await d.turn(3, 10);
				await d.turn(4, 45);
				expect(d.screen()).toBe('sends: fx II 45');
			});
			expect(d.screen()).toBe('filter off: high-pass 0, low-pass 99');
			await d.click('track.8');
			await d.withShift(async () => {
				expect(d.screen()).toBe('filter off: high-pass 0, low-pass 99');
			});
		});

		it('filters its return on M3: E1 high-pass, E4 low-pass', async () => {
			const d = await start();
			await aux(d, 8, 3);
			await d.click('key.m3'); // on: a new project's is off
			await d.turn(1, 15);
			await d.turn(4, -9);
			expect(d.screen()).toBe('filter: high-pass 15, low-pass 90');
			await d.click('track.7'); // each FX track has its own filter, on or off
			expect(d.screen()).toBe('filter off: high-pass 0, low-pass 99');
		});

		it('aims its LFO on M4 at its own page, its filter or its amp (ours after external audio’s)', async () => {
			const d = await start();
			await aux(d, 8, 4);
			expect(d.screen()).toBe('lfo off: amount 0, destination syn, parameter param1');
			await d.turn(4, 1);
			expect(page(d, 'aux-lfo').parameterName).toBe('param2');
			await d.click('track.7'); // each FX track keeps its own
			expect(page(d, 'aux-lfo').parameterName).toBe('param1');
			await d.turn(3, 1);
			expect(page(d, 'aux-lfo').parameterName).toBe('hi pass');
		});

		it('lights the keys played on an FX track, which audition the last instrument track', async () => {
			const d = await start();
			await d.click('track.4');
			await aux(d, 7);
			await d.down(key('c4'));
			await d.wait(GAP_MS);
			expect(d.lit()).toEqual(['c4']);
			// the sound is the app's (sound.svelte.ts); the instrument track stays the one to hear
			expect(d.state.track).toBe(3);
			await d.up(key('c4'));
			await d.wait(GAP_MS);
			expect(d.lit()).toEqual([]);
		});
	});

	describe('21 fx: changing the effect', () => {
		it('opens the effect list with shift + T7, scrolls it with the white encoder, loads with a click', async () => {
			const d = await start();
			await aux(d, 7);
			await d.withShift(() => d.click('track.7'));
			// the device's list: FX I is track 15, and the distortion is "dist"
			const list = page(d, 'aux-fx-list');
			expect(list.track).toBe('15');
			expect(list.items).toEqual(['chorus', 'delay', 'dist', 'lofi', 'phaser', 'reverb']);
			expect(d.screen()).toBe('delay'); // the list opens on the loaded effect
			await d.turn(4, 3);
			expect(d.screen()).toBe('phaser');
			await d.turn(4, -1, { fine: true }); // pushed in while turning it scrolls too (ours)
			expect(d.screen()).toBe('lofi');
			await d.push(4);
			expect(d.screen()).toBe('FX I lofi: rate 50, bits 50, quality 50, drift 50');
			expect(trackRow(d)).toBe(redOn(7));
		});

		it('confirms with M1 as well; M2–M4 leave the list and load nothing (ours)', async () => {
			const d = await start();
			await aux(d, 8);
			await d.withShift(() => d.click('track.8'));
			await d.turn(4, -5);
			expect(d.screen()).toBe('chorus');
			await d.click('key.m1');
			expect(d.screen()).toBe('FX II chorus: rate 50, depth 50, feedback 50, stereo 50');
			await d.withShift(() => d.click('track.8'));
			await d.turn(4, 1);
			expect(d.screen()).toBe('delay');
			await d.click('key.m3');
			expect(d.frame.page).toBe('aux-filter');
			await d.click('key.m1');
			expect(d.screen()).toBe('FX II chorus: rate 50, depth 50, feedback 50, stereo 50');
		});

		it('opens either slot’s list from any aux track, which selects that FX track (ours)', async () => {
			const d = await start();
			await aux(d, 1);
			await d.withShift(() => d.click('track.8'));
			expect(trackRow(d)).toBe(redOn(8));
			expect(d.screen()).toBe('reverb');
			await d.withShift(() => d.click('track.7'));
			expect(trackRow(d)).toBe(redOn(7));
			expect(d.screen()).toBe('delay');
		});

		it('keeps E1–E3 off the list; the keyboard auditions and another track key leaves it (ours)', async () => {
			const d = await start();
			await aux(d, 7);
			await d.withShift(() => d.click('track.7'));
			await d.turn(1, 3);
			await d.turn(2, 3);
			await d.turn(3, 3);
			expect(d.screen()).toBe('delay');
			await play(d, 'c4');
			expect(d.frame.page).toBe('aux-fx-list');
			await d.click('track.3');
			expect(d.screen()).toMatch(/^external midi: /);
			await d.click('track.7');
			expect(d.screen()).toMatch(/^FX I delay: /);
		});

		it('loads any effect on either slot: the reverb on both', async () => {
			const d = await start();
			await aux(d, 7);
			await loadEffect(d, 'track.7', 'reverb');
			expect(d.screen()).toMatch(/^FX I reverb: /);
			await d.click('track.8');
			expect(d.screen()).toMatch(/^FX II reverb: /);
		});

		it('starts a newly loaded effect from its defaults; choosing the loaded one keeps it (ours)', async () => {
			const d = await start();
			await aux(d, 7);
			await loadEffect(d, 'track.7', 'chorus');
			await d.turn(1, 10);
			await loadEffect(d, 'track.7', 'chorus');
			expect(d.screen()).toBe('FX I chorus: rate 60, depth 50, feedback 50, stereo 50');
			await loadEffect(d, 'track.7', 'phaser');
			await loadEffect(d, 'track.7', 'chorus');
			expect(d.screen()).toBe('FX I chorus: rate 50, depth 50, feedback 50, stereo 50');
		});
	});

	describe('21.1–21.6 the six effects: four controls each on M1', () => {
		/** Loads `effect` on FX I, turns E1–E4 and reads the screen before and after. */
		async function turnAll(effect: (typeof EFFECTS)[number]): Promise<[string, string]> {
			const d = await start();
			await aux(d, 7);
			await loadEffect(d, 'track.7', effect);
			const before = d.screen();
			await d.turn(1, 10);
			await d.turn(2, -20);
			await d.turn(3, 30);
			await d.turn(4, 60);
			return [before, d.screen()];
		}

		it('21.1 chorus: rate, depth, feedback and stereo', async () => {
			expect(await turnAll('chorus')).toEqual([
				'FX I chorus: rate 50, depth 50, feedback 50, stereo 50',
				'FX I chorus: rate 60, depth 30, feedback 80, stereo 99'
			]);
		});

		it('21.2 delay: size, fine, feedback and dry (the device’s labels; the guide: amount, fine)', async () => {
			// the delay a new project loads (choosing it again keeps it)
			expect(await turnAll('delay')).toEqual([
				'FX I delay: size 1/8 dotted, fine 50, feedback 50, dry 99',
				'FX I delay: size 1/2, fine 30, feedback 80, dry 99'
			]);
		});

		it('21.2 delay: size steps through eight note values, a detent each (the device, not micro … insane)', async () => {
			const d = await start();
			await aux(d, 7);
			await d.turn(1, -10);
			const sizes: string[] = [];
			for (let i = 0; i < 8; i++) {
				sizes.push(page(d, 'aux-fx').params[0].value);
				await d.turn(1, 1);
			}
			// "1/8" never showed on camera: ours by the pattern
			expect(sizes).toEqual([
				'1/32',
				'1/32 dotted',
				'1/16',
				'1/16 dotted',
				'1/8',
				'1/8 dotted',
				'1/4',
				'1/2'
			]);
			expect(page(d, 'aux-fx').params[0].value).toBe('1/2');
		});

		it('21.3 distortion: drive, clip, lo cut and hi cut ("dist" on the device)', async () => {
			expect(await turnAll('distortion')).toEqual([
				'FX I dist: drive 50, clip 50, lo cut 50, hi cut 50',
				'FX I dist: drive 60, clip 30, lo cut 80, hi cut 99'
			]);
		});

		it('21.4 lofi: rate, bits, quality and drift', async () => {
			expect(await turnAll('lofi')).toEqual([
				'FX I lofi: rate 50, bits 50, quality 50, drift 50',
				'FX I lofi: rate 60, bits 30, quality 80, drift 99'
			]);
		});

		it('21.5 phaser: frequency, depth, rate and feedback', async () => {
			expect(await turnAll('phaser')).toEqual([
				'FX I phaser: frequency 50, depth 50, rate 50, feedback 50',
				'FX I phaser: frequency 60, depth 30, rate 80, feedback 99'
			]);
		});

		it('21.6 reverb: size, mod, tone and dry (the device’s labels; the guide: rate, feedback)', async () => {
			expect(await turnAll('reverb')).toEqual([
				'FX I reverb: size 50, mod 50, tone 50, dry 50',
				'FX I reverb: size 60, mod 30, tone 80, dry 99'
			]);
		});
	});

	describe('every aux track: M1–M4 and what lights', () => {
		const TRACKS = [
			{ name: 'brain', pages: ['aux-brain', 'aux-route', 'aux-brain', 'aux-brain'] },
			{ name: 'punch-in fx', pages: ['aux-punch', 'aux-punch', 'aux-punch', 'aux-punch'] },
			{ name: 'external midi', pages: ['aux-midi', 'aux-cc', 'aux-cc', 'aux-lfo'] },
			{ name: 'external cv', pages: ['aux-cv', 'aux-cv', 'aux-cv', 'aux-cv'] },
			{ name: 'external audio', pages: ['aux-audio', 'aux-route', 'aux-filter', 'aux-lfo'] },
			{ name: 'tape', pages: ['aux-tape', 'aux-route', 'aux-filter', 'aux-lfo'] },
			{ name: 'FX I', pages: ['aux-fx', 'aux-route', 'aux-filter', 'aux-lfo'] },
			{ name: 'FX II', pages: ['aux-fx', 'aux-route', 'aux-filter', 'aux-lfo'] }
		];

		TRACKS.forEach(({ name, pages }, i) => {
			const n = i + 1;
			// the guide gives the brain M1 and M2, punch-in and cv one page each: the others keep the
			// main page (ours)
			it(`T${n} ${name}: ${pages.join(', ')}; its key red, the keys held and its steps lit`, async () => {
				const d = await start();
				await aux(d, n);
				expect(trackRow(d)).toBe(redOn(n));
				const seen: string[] = [];
				for (const m of [1, 2, 3, 4]) {
					await d.click(`key.m${m}`);
					seen.push(d.frame.page);
				}
				expect(seen).toEqual(pages);
				expect(trackRow(d)).toBe(redOn(n));
				await d.down(key('d4'));
				await d.wait(GAP_MS);
				expect(d.lit()).toEqual(['d4']);
				await d.up(key('d4'));
				await d.wait(GAP_MS);
				expect(d.lit()).toEqual([]);
				await d.click(step(3));
				expect(d.steps()).toBe('..w.............');
				expect(placed(patternOf(d.state, n))).toEqual(['2: 62']);
			});
		});
	});

	describe('22 how to (the auxiliary parts)', () => {
		it('22.2 controls a synth with midi: channel on M1, CCs on M2 and M3, notes on the keyboard', async () => {
			const d = await start();
			await aux(d, 3);
			await d.turn(1, 4);
			expect(page(d, 'aux-midi').channel).toBe('05');
			await d.click('key.m2');
			await d.withShift(() => d.turn(2, 75));
			await d.turn(2, 100);
			await d.click('key.m3');
			await d.withShift(() => d.turn(1, 72));
			await d.turn(1, 40);
			expect(d.screen()).toBe('external midi set II: cc 71 40, off, off, off');
			await d.click('key.m2');
			expect(d.screen()).toBe('external midi set I: off, cc 74 100, off, off');
			await holdKeys(d, ['c4', 'e4', 'g4'], async () => {
				expect(d.lit()).toEqual(['c4', 'e4', 'g4']);
			});
		});

		it('22.6 sends tracks to an outboard effect and brings them back through the audio input', async () => {
			const d = await start();
			await d.click('key.com');
			await d.turn(3, 5); // the multi-out to audio
			expect(d.screen()).toBe('com: multi-out audio');
			await aux(d, 5);
			await d.turn(1, 2); // the audio input jack…
			await d.push(1); // …switched on
			await d.click('key.m2');
			await d.turn(3, 60); // track 3 out of the aux output
			await d.click('key.m1');
			await d.turn(2, 15);
			await d.turn(3, 5);
			await d.turn(4, -40);
			expect(d.screen()).toBe('external audio: audio input on, drive 15, level 80, mix 59');
			await d.click('key.m2');
			// with T5, whose lead a new project sends out of the aux output
			expect(d.screen()).toBe('aux out routing: tracks 1–4 on the encoders, routed 3 5');
		});

		it('22.12 writes a song fast with the brain: detected key, a chord change a bar, a lead left out', async () => {
			const d = await start();
			await d.clicks(step(1), step(5), step(9), step(13)); // a beat on drum track 1
			await synth(d); // a bass of one note
			await play(d, 'd4');
			await d.clicks(step(1), step(9));
			await d.click('track.7'); // one chord
			await holdKeys(d, ['d4', 'f4', 'a4'], () => d.click(step(1)));
			await aux(d, 1);
			expect(page(d, 'aux-brain')).toMatchObject({ auto: true, root: 'd', scale: 'minor' });
			await d.holding('key.bar', () => d.click(accidental(4)));
			await play(d, 'd4');
			await d.click(step(1));
			await play(d, 'g3');
			await d.click(step(5));
			await d.click('key.play');
			expect(page(d, 'aux-brain').title).toBe('d minor');
			await d.wait(16 * STEP_MS);
			expect(page(d, 'aux-brain').title).toBe('g minor');
			await d.click('key.stop');
			// a lead on track 5 should not follow: out of the routing
			await d.click('key.m2');
			await d.push(1);
			await d.turn(1, -1);
			expect(d.screen()).toBe('brain routing: tracks 5–8 on the encoders, routed 3 4 6 7 8');
		});

		it('22.8 brings an audio interface into the external audio track: usb audio, switched on with E1', async () => {
			const d = await start();
			await aux(d, 5);
			await d.turn(1, 3);
			expect(page(d, 'aux-audio')).toMatchObject({ input: 'usb audio', on: false });
			await d.push(1);
			expect(d.screen()).toBe('external audio: usb audio on, drive 00, level 75, mix 99');
		});

		it('4.4 adds punch-in fx while the song plays, and sequences them like any track', async () => {
			const d = await start();
			await d.clicks(step(1), step(5), step(9), step(13));
			await aux(d, 2);
			await d.click('key.play');
			await holdKeys(d, ['g3', 'b4'], async () => {
				expect(d.screen()).toBe('punch-in fx: percussion 3, melodic 7');
			});
			await play(d, 'g3');
			await d.click(step(9));
			expect(placed(patternOf(d.state, 2))).toEqual([`8: ${noteOf('g3')}`]);
			await d.click('key.stop');
			expect(d.steps()).toBe('........w.......');
		});
	});
}
