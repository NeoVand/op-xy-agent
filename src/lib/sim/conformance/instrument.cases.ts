/**
 * The OP-XY's basics and its instrument tracks as TE's guide describes them: conformance cases
 * written from the guide (chapters 2 "layout", 5 "main modes and modules", 6 "track buttons",
 * 11 "tempo", 14 "instrument" and 20 "synth engines", guide v1.1.15, reworded in
 * `knowledge/manual/units/{basics,hardware,instrument,tempo}/*`), not from our code. The preset
 * browser, the preset settings and the track-sound shortcuts of chapter 14 have their own suite.
 *
 * Each case works the machine the way a person does, with real press lengths and the computer's
 * Shift key, and checks what a person sees first: the screen (its spoken description, the values on
 * its page), the track keys' lights, the keys that light. The model is checked where the screen
 * cannot tell (a mute on another track, which tracks are linked).
 *
 * The same cases run on the bare simulator (`instrument.spec.ts`, Node) and on the app in a browser,
 * clicking the rendered replica (`src/lib/app/instrument-conformance.svelte.spec.ts`).
 *
 * Where the guide leaves something open the case says "ours" and pins our choice; "device check"
 * marks what only the owner's unit can settle.
 */
import { describe, expect, it } from 'vitest';
import type { EngineId } from '$lib/core/opxy';
import { currentPattern } from '../sequencer';
import { ENGINE_LIST, FILTER_TYPES, LFO_SYNC_STEPS, LFO_TYPES } from '../params';
import type { ScreenFrame } from '../screen/frame';
import { CLICK_MS, GAP_MS, type Driver } from '../testing/driver';

/** A sixteenth at the new project's 120 BPM. */
const STEP_MS = 125;

/** A frame of one page. */
type Page<P extends ScreenFrame['page']> = Extract<ScreenFrame, { readonly page: P }>;

/** What the screen shows, as page `name`: the case fails when another page is up. */
function on<P extends ScreenFrame['page']>(d: Driver, name: P): Page<P> {
	const frame = d.frame;
	expect(frame.page).toBe(name);
	return frame as Page<P>;
}

const LED_CHAR: Readonly<Record<string, string>> = { off: '.', dim: 'd', white: 'w', red: 'r' };

/** Track keys 1–8 spelled like the step row: `.` off, `d` dim, `w` white, `r` red. */
const trackRow = (d: Driver) =>
	Array.from({ length: 8 }, (_, i) => LED_CHAR[d.led(`track.${i + 1}`)]).join('');

const key = (name: string) => `keyboard.${name}`;
const play = (d: Driver, ...names: string[]) => d.clicks(...names.map(key));

/** The notes on step n (1–16) of the selected instrument track. */
const notesOn = (d: Driver, n: number) =>
	currentPattern(d.state.tracks[d.state.track].sequence).steps[n - 1].notes.map((x) => x.note);

/** A synth engine's header as the screen reads it: "label value" for E1…E4. */
const header = (d: Driver) => on(d, 'synth').header.map((c) => `${c.label} ${c.value}`);

/** Opens the list shift + M1 / M3 / M4 opens: engines, filter types, LFO types. */
const openList = (d: Driver, m: 1 | 3 | 4) => d.withShift(() => d.click(`key.m${m}`));

/** Scrolls an open list with E1 from the item it highlights to `item`, as someone reading it. */
async function scrollTo(d: Driver, list: readonly string[], item: string): Promise<void> {
	await d.turn(1, list.indexOf(item) - list.indexOf(d.screen()));
	expect(d.screen()).toBe(item);
}

/** Loads an engine on the selected track the guide's way: shift + M1, E1 to it, a click of E1. */
async function loadEngine(d: Driver, engine: EngineId): Promise<void> {
	await openList(d, 1);
	await scrollTo(d, ENGINE_LIST, engine);
	await d.push(1);
}

/** Taps the tempo key `ms` after the previous tap went down. */
async function tap(d: Driver, ms: number): Promise<void> {
	await d.wait(ms - CLICK_MS - GAP_MS);
	await d.click('key.tempo');
}

/** Where the playhead is: the lit step key of an empty pattern (0–15), or −1. */
const playhead = (d: Driver) => d.steps().indexOf('w');

/** Selects track 3 (prism in a new project) and opens its LFO page, as type `type`. */
async function lfo(d: Driver, type: (typeof LFO_TYPES)[number]): Promise<void> {
	await d.click('track.3');
	await d.click('key.m4');
	if (on(d, 'lfo').type === type) return;
	await openList(d, 4);
	await scrollTo(d, LFO_TYPES, type);
	await d.push(1);
}

export function instrumentConformance(start: () => Promise<Driver>): void {
	describe('2 layout: transport, octave and shift keys', () => {
		it('starts playback with play; play again goes back to the start instead of stopping', async () => {
			const d = await start();
			expect(playhead(d)).toBe(-1);
			await d.click('key.play');
			await d.wait(3 * STEP_MS);
			const before = playhead(d);
			expect(before).toBeGreaterThanOrEqual(3);
			await d.click('key.play'); // down at the top: the click itself lasts about a step
			expect(playhead(d)).toBe(1);
			expect(d.state.transport.playing).toBe(true);
		});

		it('stops with stop, and stays stopped when it is pressed again', async () => {
			const d = await start();
			await d.click('key.play');
			await d.wait(4 * STEP_MS);
			await d.click('key.stop');
			expect(d.steps()).toBe('................');
			await d.wait(4 * STEP_MS);
			await d.click('key.stop');
			expect(d.steps()).toBe('................');
			expect(d.state.transport).toMatchObject({ playing: false, position: 0 });
		});

		it('moves a synth track’s keyboard an octave with [+] / [-]; the key pressed still lights', async () => {
			const d = await start();
			// a new project's bass (T3) starts an octave down: [+] brings c4 back to middle C
			await d.click('track.3');
			await d.click('key.plus');
			await d.down(key('c4'));
			await d.wait(GAP_MS);
			expect(d.lit()).toEqual(['c4']);
			await d.up(key('c4'));
			await d.click('step.1');
			expect(notesOn(d, 1)).toEqual([60]);
			await d.clicks('key.minus', 'key.minus');
			await play(d, 'c4');
			await d.click('step.2');
			expect(notesOn(d, 2)).toEqual([36]);
		});

		it('stops the keyboard three octaves up or down (ours; device check)', async () => {
			const d = await start();
			await d.click('track.3');
			for (let i = 0; i < 5; i++) await d.click('key.plus');
			await play(d, 'c4');
			await d.click('step.1');
			expect(notesOn(d, 1)).toEqual([60 + 36]);
			for (let i = 0; i < 9; i++) await d.click('key.minus');
			await play(d, 'c4');
			await d.click('step.2');
			expect(notesOn(d, 2)).toEqual([60 - 36]);
		});

		// Each track keeps its own keyboard octave (OS 1.0.38: a copied track takes its active octave
		// along; manual instrument/save-copy-scramble). Device check as well.
		it('keeps each track’s keyboard octave: an octave up on T3 leaves T4 where it was', async () => {
			const d = await start();
			// a new project starts T3 an octave down and T4 an octave up, as their presets say
			await d.click('track.3');
			await d.click('key.plus');
			await d.click('track.4');
			await play(d, 'c4');
			await d.click('step.1');
			expect(notesOn(d, 1)).toEqual([72]);
			await d.click('track.3');
			await play(d, 'c4');
			await d.click('step.1');
			expect(notesOn(d, 1)).toEqual([60]);
		});

		it('leaves a drum track’s 24 sounds where they are with [+] (ours; device check)', async () => {
			const d = await start();
			await d.click('key.plus');
			await play(d, 'a3');
			await d.click('step.1');
			expect(notesOn(d, 1)).toEqual([57]);
			expect(d.screen()).toMatch(/^drum key A3/);
		});

		it('does nothing with shift alone: pages without a second layer stay as they are', async () => {
			const d = await start();
			await d.click('track.3');
			const synth = d.screen();
			await d.withShift(async () => {
				expect(d.screen()).toBe(synth);
				expect(trackRow(d)).toBe('..w.....');
			});
			await d.click('key.tempo');
			const tempo = d.screen();
			await d.withShift(async () => {
				expect(d.screen()).toBe(tempo);
			});
		});
	});

	describe('5.1 main modes', () => {
		it('starts in instrument mode on track 1: its engine page is up and T1 lights white', async () => {
			const d = await start();
			expect(d.screen()).toMatch(/^drum key F3/);
			expect(trackRow(d)).toBe('w.......');
			expect(d.state.mode).toBe('instrument');
		});

		it('gives each mode key its own screen: instrument, auxiliary, arrange and mix', async () => {
			const d = await start();
			await d.click('key.auxiliary');
			expect(d.frame.page).toBe('aux-brain');
			await d.click('key.arrange');
			expect(d.frame.page).toBe('arrange');
			await d.click('key.mix');
			expect(on(d, 'mix').bank).toBe('instrument');
			await d.click('key.instrument');
			expect(d.screen()).toMatch(/^drum key F3/);
			expect(d.state.mode).toBe('instrument');
		});

		it('points the track keys at the auxiliary tracks in auxiliary mode, the active one red', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.auxiliary');
			expect(trackRow(d)).toBe('r.......');
			await d.click('track.6');
			expect(d.frame.page).toBe('aux-tape');
			expect(trackRow(d)).toBe('.....r..');
			// each set keeps its own active track
			await d.click('key.instrument');
			expect(d.screen()).toMatch(/^prism/);
			expect(trackRow(d)).toBe('..w.....');
			await d.click('key.auxiliary');
			expect(trackRow(d)).toBe('.....r..');
		});

		it('swaps arrange’s track keys between instrument and auxiliary tracks when arrange is pressed again', async () => {
			const d = await start();
			await d.click('key.arrange');
			expect(trackRow(d)).toBe('w.......');
			await d.click('key.arrange');
			expect(trackRow(d)).toBe('r.......');
			await d.click('track.4');
			expect(trackRow(d)).toBe('...r....');
			expect(d.state.auxTrack).toBe(3);
			await d.click('key.arrange');
			expect(trackRow(d)).toBe('w.......');
			expect(d.frame.page).toBe('arrange');
		});

		it('swaps the mixer between instrument and auxiliary tracks when mix is pressed again', async () => {
			const d = await start();
			await d.click('key.mix');
			expect(on(d, 'mix').bank).toBe('instrument');
			expect(trackRow(d)).toBe('w.......');
			await d.click('key.mix');
			expect(on(d, 'mix').bank).toBe('auxiliary');
			expect(trackRow(d)).toBe('r.......');
			await d.click('key.mix');
			expect(on(d, 'mix').bank).toBe('instrument');
		});

		it('keeps the set when instrument or auxiliary is pressed again (ours)', async () => {
			const d = await start();
			await d.click('track.2');
			await d.click('key.instrument');
			expect(trackRow(d)).toBe('.w......');
			expect(d.screen()).toMatch(/^drum key/);
			await d.clicks('key.auxiliary', 'key.auxiliary');
			expect(trackRow(d)).toBe('r.......');
			expect(d.frame.page).toBe('aux-brain');
		});
	});

	describe('5.2 modules', () => {
		it('opens an instrument track’s engine, envelopes, filter and LFO with M1–M4', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m2');
			expect(d.screen()).toMatch(/^amp envelope/);
			await d.click('key.m3');
			expect(d.screen()).toMatch(/^svf filter/);
			await d.click('key.m4');
			expect(d.screen()).toMatch(/^tremolo lfo/);
			await d.click('key.m1');
			expect(d.screen()).toMatch(/^prism: shape 15/);
		});

		it('gives auxiliary and mix mode four modules too; arrange has none', async () => {
			const d = await start();
			await d.click('key.auxiliary');
			await d.click('track.7'); // FX I
			const aux: string[] = [];
			for (const m of [1, 2, 3, 4]) {
				await d.click(`key.m${m}`);
				aux.push(d.frame.page);
			}
			expect(aux).toEqual(['aux-fx', 'aux-route', 'aux-filter', 'aux-lfo']);
			await d.click('key.mix');
			const mix: string[] = [];
			for (const m of [1, 2, 3, 4]) {
				await d.click(`key.m${m}`);
				mix.push(d.frame.page);
			}
			expect(mix).toEqual(['mix', 'mix-eq', 'mix-saturator', 'mix-master']);
			// in arrange the same keys act on patterns: the screen stays arrange's
			await d.click('key.arrange');
			await d.click('key.m2');
			expect(d.frame.page).toBe('arrange');
		});

		it('keeps each mode’s module: back in a mode, its page is where it was left', async () => {
			const d = await start();
			await d.click('key.m3');
			await d.click('key.mix');
			await d.click('key.m2');
			await d.click('key.instrument');
			expect(d.frame.page).toBe('filter');
			await d.click('key.mix');
			expect(d.frame.page).toBe('mix-eq');
		});

		it('keeps the module when the track changes: M3 on T3, then T4 shows T4’s filter', async () => {
			const d = await start();
			// a new project's bass starts closed (svf, cutoff 0); the pluck on T4 has a z hipass
			await d.click('track.3');
			await d.click('key.m3');
			await d.turn(1, 50);
			expect(d.screen()).toBe('svf filter: cutoff 51, resonance 10');
			await d.click('track.4');
			expect(d.screen()).toBe('z hipass filter: cutoff 80, resonance 53');
			await d.click('track.3');
			expect(d.screen()).toBe('svf filter: cutoff 51, resonance 10');
		});

		it('shows a page’s extra parameters while shift is held, and the page again when it comes up', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m2');
			await d.withShift(async () => {
				expect(d.screen()).toMatch(/^play mode mono/);
			});
			expect(d.screen()).toMatch(/^amp envelope/);
			await d.click('key.m3');
			await d.withShift(async () => {
				expect(d.screen()).toMatch(/^sends: aux 00/);
			});
			expect(d.screen()).toMatch(/^svf filter/);
			await d.click('track.1');
			await d.click('key.m1');
			await d.withShift(async () => {
				expect(on(d, 'drum').shift).toBe(true);
			});
			expect(on(d, 'drum').shift).toBe(false);
		});

		it('turns what shift shows while it is held, and the page’s own values once it is up', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m3');
			await d.withShift(() => d.turn(3, 40));
			await d.turn(3, -20);
			// the bass's envelope amount, 34, less 20; its tape send is full, as on every new track
			expect(on(d, 'filter').envAmount).toBeCloseTo(14 / 99, 9);
			await d.withShift(async () => {
				expect(on(d, 'sends').values).toEqual(['00', '99', '40', '00']);
			});
		});
	});

	describe('6.1 using the track buttons', () => {
		it('moves the light to the track key pressed, and the screen to that track', async () => {
			const d = await start();
			const seen: string[] = [];
			for (let n = 1; n <= 8; n++) {
				await d.click(`track.${n}`);
				expect(trackRow(d)).toBe('........'.slice(0, n - 1) + 'w' + '........'.slice(n));
				seen.push(d.screen().split(/[ :]/)[0]);
			}
			expect(seen).toEqual([
				'drum',
				'drum',
				'prism',
				'epiano',
				'dissolve',
				'hardsync',
				'axis',
				'multisampler'
			]);
		});

		it('reaches one auxiliary track per key in auxiliary mode, lit red', async () => {
			const d = await start();
			await d.click('key.auxiliary');
			const pages: string[] = [];
			for (let n = 1; n <= 8; n++) {
				await d.click(`track.${n}`);
				expect(d.led(`track.${n}`)).toBe('red');
				pages.push(d.frame.page);
			}
			expect(pages).toEqual([
				'aux-brain',
				'aux-punch',
				'aux-midi',
				'aux-cv',
				'aux-audio',
				'aux-tape',
				'aux-fx',
				'aux-fx'
			]);
			expect(d.screen()).toMatch(/^FX II/);
		});

		it('shares the active track between modes: picked in arrange, it is the mixer’s strip and the instrument page', async () => {
			const d = await start();
			await d.click('key.arrange');
			await d.click('track.5');
			expect(trackRow(d)).toBe('....w...');
			expect(on(d, 'arrange').columns.findIndex((c) => c.selected)).toBe(4);
			await d.click('key.mix');
			expect(on(d, 'mix').selected).toBe(4);
			await d.click('key.instrument');
			expect(d.screen()).toMatch(/^dissolve/);
		});

		it('gives the pages to the active track: a turn on T3 stays on T3', async () => {
			const d = await start();
			await d.click('track.3');
			await d.turn(1, 10);
			expect(header(d)[0]).toBe('shape 25');
			await d.click('track.4');
			expect(header(d)[0]).toBe('tone 00');
			await d.click('track.3');
			expect(header(d)[0]).toBe('shape 25');
		});

		it('mutes an instrument track with instrument + its key, leaving the active track lit (ours outside mix; device check)', async () => {
			const d = await start();
			await d.holding('key.instrument', () => d.click('track.5'));
			expect(trackRow(d)).toBe('w.......');
			expect(d.screen()).toMatch(/^drum key F3/);
			expect(d.state.tracks[4].mix.muted).toBe(true);
			await d.click('key.mix');
			expect(on(d, 'mix').strips[4].muted).toBe(true);
			await d.click('key.instrument');
			await d.holding('key.instrument', () => d.click('track.5'));
			expect(d.state.tracks[4].mix.muted).toBe(false);
		});

		it('mutes an auxiliary track with auxiliary + its key (ours outside mix; device check)', async () => {
			const d = await start();
			await d.click('key.auxiliary');
			await d.holding('key.auxiliary', () => d.click('track.7'));
			expect(trackRow(d)).toBe('r.......');
			expect(d.state.aux[6].mix.muted).toBe(true);
			await d.clicks('key.mix', 'key.mix');
			expect(on(d, 'mix')).toMatchObject({ bank: 'auxiliary' });
			expect(on(d, 'mix').strips[6].muted).toBe(true);
		});
	});

	describe('6.2 linking tracks', () => {
		it('links a track pressed while another is held: the held one stays active, the linked one lights dim', async () => {
			const d = await start();
			await d.click('track.3');
			await d.holding('track.3', async () => {
				await d.click('track.5');
				expect(trackRow(d)).toBe('..w.d...');
			});
			expect(trackRow(d)).toBe('..w.....');
			expect(d.screen()).toMatch(/^prism/);
			expect(d.state.tracks[2].links).toEqual([4]);
		});

		it('links four tracks at most: the held one and three more', async () => {
			const d = await start();
			await d.holding('track.1', () => d.clicks('track.2', 'track.3', 'track.4', 'track.5'));
			expect(d.state.tracks[0].links).toEqual([1, 2, 3]);
			await d.holding('track.1', async () => {
				expect(trackRow(d)).toBe('wddd....');
			});
		});

		it('lets a linked track be selected and played on its own; the link stays', async () => {
			const d = await start();
			await d.holding('track.3', () => d.click('track.5'));
			await d.click('track.5');
			expect(trackRow(d)).toBe('....w...');
			expect(d.screen()).toMatch(/^dissolve/);
			await play(d, 'c4');
			await d.click('step.1');
			expect(notesOn(d, 1)).toEqual([60]);
			expect(currentPattern(d.state.tracks[2].sequence).steps[0].notes).toEqual([]);
			await d.holding('track.3', async () => {
				expect(trackRow(d)).toBe('..w.d...');
			});
		});

		it('unlinks a linked track pressed again while the held one is down (ours: the guide has no way)', async () => {
			const d = await start();
			await d.holding('track.3', () => d.clicks('track.4', 'track.5'));
			await d.holding('track.3', () => d.click('track.4'));
			expect(d.state.tracks[2].links).toEqual([4]);
			await d.holding('track.3', async () => {
				expect(trackRow(d)).toBe('..w.d...');
			});
		});
	});

	describe('11 tempo', () => {
		it('opens the tempo page from any screen', async () => {
			const d = await start();
			const screens: string[] = [];
			for (const open of [
				'key.m3',
				'key.auxiliary',
				'key.arrange',
				'key.mix',
				'key.project',
				'key.com'
			]) {
				await d.click(open);
				screens.push(d.frame.page);
				await d.click('key.tempo');
				expect(d.screen()).toMatch(/^tempo 120 bpm/);
				await d.click('key.instrument'); // back home before the next screen
			}
			expect(screens).toEqual(['filter', 'aux-brain', 'arrange', 'mix', 'project', 'com']);
		});

		it('shows the tempo, the groove and the metronome of a new project', async () => {
			const d = await start();
			await d.click('key.tempo');
			expect(d.screen()).toBe('tempo 120 bpm, groove SH, metronome off');
			expect(on(d, 'tempo')).toMatchObject({
				bpm: '120',
				groove: 'SH',
				swing: 0,
				metronome: { level: 1, on: false }
			});
		});

		it('sets the tempo from taps: four taps 400 ms apart make 150 BPM', async () => {
			const d = await start();
			await d.click('key.tempo'); // the page opens: the first tap
			for (let i = 0; i < 3; i++) await tap(d, 400);
			expect(on(d, 'tempo').bpm).toBe('150');
			expect(d.state.tempo.bpm).toBe(150);
		});

		it('follows the last three intervals as the taps speed up (ours: how many is not documented)', async () => {
			const d = await start();
			await d.click('key.tempo');
			const seen: string[] = [];
			for (const ms of [500, 500, 400, 400, 400]) {
				await tap(d, ms);
				seen.push(on(d, 'tempo').bpm);
			}
			expect(seen).toEqual(['120', '120', '128.6', '138.5', '150']);
		});

		it('starts counting again after a pause of more than two seconds (ours)', async () => {
			const d = await start();
			await d.click('key.tempo');
			for (let i = 0; i < 3; i++) await tap(d, 400);
			await tap(d, 2500);
			expect(on(d, 'tempo').bpm).toBe('150');
			await tap(d, 600);
			expect(on(d, 'tempo').bpm).toBe('100');
		});

		it('keeps tapped tempos within 40–220 BPM (ours: the range CC80 reaches)', async () => {
			const d = await start();
			await d.click('key.tempo');
			for (let i = 0; i < 3; i++) await tap(d, 200);
			expect(on(d, 'tempo').bpm).toBe('220');
			for (let i = 0; i < 3; i++) await tap(d, 1900);
			expect(on(d, 'tempo').bpm).toBe('40');
		});

		it('leaves the tempo page with a module key, onto that page of the mode, or a track key (ours)', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.tempo');
			await d.click('key.m2');
			expect(d.screen()).toMatch(/^amp envelope/);
			await d.click('key.tempo');
			await d.click('track.4');
			expect(d.screen()).toMatch(/^amp envelope/);
			expect(trackRow(d)).toBe('...w....');
		});

		it('counts the beats on the metronome while playing, and rests at the top once stopped (ours)', async () => {
			const d = await start();
			await d.click('key.tempo');
			expect(on(d, 'tempo')).toMatchObject({ beat: 0, pendulum: 1 });
			await d.click('key.play');
			const beats: number[] = [];
			for (let i = 0; i < 5; i++) {
				beats.push(on(d, 'tempo').beat);
				await d.wait(4 * STEP_MS);
			}
			expect(beats).toEqual([0, 1, 2, 3, 0]);
			await d.click('key.stop');
			expect(on(d, 'tempo')).toMatchObject({ beat: 0, pendulum: 1 });
		});
	});

	describe('11.1 edit tempo', () => {
		it('sets the tempo with E1, a BPM a detent and a tenth pushed in, within 40–220', async () => {
			const d = await start();
			await d.click('key.tempo');
			await d.turn(1, 5);
			expect(on(d, 'tempo').bpm).toBe('125');
			await d.turn(1, 3, { fine: true });
			expect(on(d, 'tempo').bpm).toBe('125.3');
			await d.turn(1, 200);
			expect(on(d, 'tempo').bpm).toBe('220');
			await d.turn(1, -300);
			expect(on(d, 'tempo').bpm).toBe('40');
		});

		it('plays at the tempo set: at 60 BPM the playhead takes a quarter second a step', async () => {
			const d = await start();
			await d.click('key.tempo');
			await d.turn(1, -60);
			await d.click('key.play');
			const first = playhead(d);
			await d.wait(2 * 2 * STEP_MS);
			expect(playhead(d) - first).toBe(2);
			await d.click('key.stop');
		});

		it('adds swing with E3 clockwise past the centre, shuffle anticlockwise', async () => {
			const d = await start();
			await d.click('key.tempo');
			await d.turn(3, 30);
			expect(on(d, 'tempo').swing).toBeCloseTo(30 / 99, 9);
			await d.turn(3, -60);
			expect(on(d, 'tempo').swing).toBeCloseTo(-30 / 99, 9);
			await d.turn(3, -100);
			expect(on(d, 'tempo').swing).toBe(-1);
		});

		it('sets the metronome’s level with E4 and switches it on and off with a click', async () => {
			const d = await start();
			await d.click('key.tempo');
			await d.turn(4, -49);
			expect(on(d, 'tempo').metronome).toEqual({ level: 50 / 99, on: false });
			await d.push(4);
			expect(d.screen()).toBe('tempo 120 bpm, groove SH, metronome on');
			await d.push(4);
			expect(on(d, 'tempo').metronome.on).toBe(false);
		});
	});

	describe('11.2 what are grooves?', () => {
		it('turns E2 through the seven grooves in the guide’s order, stopping at the ends (ours)', async () => {
			const d = await start();
			await d.click('key.tempo');
			const seen: string[] = [];
			for (let i = 0; i < 8; i++) {
				seen.push(on(d, 'tempo').groove);
				await d.turn(2, 1);
			}
			// shuffle, half shuffle, bombora, wobbly, gaussian, accents, island nod: only "SH" is TE's
			expect(seen).toEqual(['SH', 'HS', 'BO', 'WO', 'GA', 'AC', 'IN', 'IN']);
			await d.turn(2, -20);
			expect(on(d, 'tempo').groove).toBe('SH');
		});
	});

	describe('14 instrument', () => {
		it('holds eight instrument tracks: drums on T1–T2, then prism, epiano, dissolve, hardsync, axis, multisampler', async () => {
			const d = await start();
			const engines: string[] = [];
			for (let n = 1; n <= 8; n++) {
				await d.click(`track.${n}`);
				engines.push(d.frame.page === 'drum' ? `${on(d, 'drum').sampler?.engine}` : header(d)[0]);
			}
			// each with its new-project preset: shoulder, beach bum, gaussian, dielectric, draemy
			expect(engines).toEqual([
				'drum',
				'drum',
				'shape 15',
				'tone 00',
				'swarm 00',
				'freq 13',
				'tone 34',
				'multisampler'
			]);
			expect(d.state.tracks.map((t) => t.engine)).toEqual([
				'drum',
				'drum',
				'prism',
				'epiano',
				'dissolve',
				'hardsync',
				'axis',
				'multisampler'
			]);
		});
	});

	describe('14.1 engine', () => {
		it('opens the engine list at the track’s engine with shift + M1; E1 scrolls, a click loads', async () => {
			const d = await start();
			await d.click('track.3');
			await openList(d, 1);
			expect(d.screen()).toBe('prism');
			expect(on(d, 'list').columns[0].items).toEqual(['3', 'engine']);
			await d.turn(1, 2);
			expect(d.screen()).toBe('simple');
			await d.push(1);
			// an engine picked without a preset starts from the device's own values
			expect(d.screen()).toBe('simple: shape 99, pw 00, noise 18, stereo 00');
			expect(d.state.tracks[2].engine).toBe('simple');
		});

		it('lists all twelve engines: eight synths, three samplers and midi (the order and the stops at the ends are ours; device check)', async () => {
			const d = await start();
			await d.click('track.3');
			await openList(d, 1);
			await d.turn(1, -20);
			const seen: string[] = [];
			for (let i = 0; i < 13; i++) {
				seen.push(d.screen());
				await d.turn(1, 1);
			}
			expect(seen.slice(0, 12)).toEqual([...ENGINE_LIST]);
			expect(seen[12]).toBe('midi');
			expect([...ENGINE_LIST].sort()).toEqual(
				[
					...['axis', 'dissolve', 'epiano', 'hardsync', 'organ', 'prism', 'simple', 'wavetable'],
					...['drum', 'sampler', 'multisampler'],
					'midi'
				].sort()
			);
		});

		it('leaves the list unchanged with another module key, or shift + M1 again (ours)', async () => {
			const d = await start();
			await d.click('track.3');
			await openList(d, 1);
			await scrollTo(d, ENGINE_LIST, 'wavetable');
			await d.click('key.m2');
			expect(d.screen()).toMatch(/^amp envelope/);
			expect(d.state.tracks[2].engine).toBe('prism');
			await openList(d, 1);
			expect(d.screen()).toBe('prism');
			await d.turn(1, 1);
			await openList(d, 1);
			expect(d.screen()).toMatch(/^prism: shape 15/);
		});

		it('scrolls a list with any encoder; only E1’s click loads (ours: the guide names E1)', async () => {
			const d = await start();
			await d.click('track.3');
			await openList(d, 1);
			await d.turn(4, 1);
			expect(d.screen()).toBe('sampler');
			await d.turn(2, -2);
			expect(d.screen()).toBe('organ');
			await d.push(4);
			expect(d.screen()).toBe('organ');
			await d.push(1);
			expect(header(d)[0]).toBe('type 40');
		});

		it('closes the list when another track is picked (ours)', async () => {
			const d = await start();
			await d.click('track.3');
			await openList(d, 1);
			await d.turn(1, 1);
			await d.click('track.4');
			expect(d.screen()).toMatch(/^epiano/);
			expect(d.state.tracks[2].engine).toBe('prism');
		});

		it('swaps only the engine: M1 gets the new engine’s values, envelopes, filter and LFO stay', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m3');
			await d.turn(1, 50);
			await d.click('key.m1');
			await d.turn(1, 5);
			expect(header(d)[0]).toBe('shape 20');
			await loadEngine(d, 'wavetable');
			expect(header(d)).toEqual(['table 00', 'position 00', 'warp 00', 'drift 00']);
			await d.click('key.m3');
			expect(d.screen()).toBe('svf filter: cutoff 51, resonance 10');
		});

		it('edits the drum key last played on a drum track’s M1: tune, start, end, play mode', async () => {
			const d = await start();
			await play(d, 'a3');
			expect(d.screen()).toMatch(/^drum key A3: tune 0\.00, play mode oneshot/);
			await d.turn(1, -12);
			await d.turn(2, 10);
			await d.turn(3, -20);
			await d.turn(4, -1);
			expect(on(d, 'drum')).toMatchObject({
				key: 'A3',
				tune: '–1.20',
				start: 10 / 99,
				end: 79 / 99,
				playMode: 'key'
			});
			// each key keeps its own
			await play(d, 'f3');
			expect(d.screen()).toMatch(/^drum key F3: tune 0\.00, play mode oneshot/);
			await play(d, 'a3');
			expect(d.screen()).toMatch(/^drum key A3: tune –1\.20, play mode key/);
		});

		it('tunes a drum key finer with the encoder pushed in', async () => {
			const d = await start();
			await d.turn(1, 3, { fine: true });
			expect(on(d, 'drum').tune).toBe('+0.03');
			await d.turn(1, 2);
			expect(on(d, 'drum').tune).toBe('+0.23');
		});

		// guide 18, drum sampler: pushed in, start and end move finer
		it('moves a drum key’s start and end finer with the encoder pushed in', async () => {
			const d = await start();
			await d.turn(2, 10);
			await d.turn(2, 3, { fine: true });
			expect(on(d, 'drum').start).toBeGreaterThan(10 / 99);
			expect(on(d, 'drum').start).toBeLessThan(11 / 99);
			await d.turn(3, -3, { fine: true });
			expect(on(d, 'drum').end).toBeGreaterThan(98 / 99);
			expect(on(d, 'drum').end).toBeLessThan(1);
		});

		it('steps a drum key’s play mode through key, oneshot, mute group and loop', async () => {
			const d = await start();
			const seen: string[] = [];
			await d.turn(4, -5);
			for (let i = 0; i < 5; i++) {
				seen.push(on(d, 'drum').playMode);
				await d.turn(4, 1);
			}
			expect(seen).toEqual(['key', 'oneshot', 'mute group', 'loop', 'loop']);
		});

		it('shows a drum key’s second layer while shift is held: direction, pan, fade, gain', async () => {
			const d = await start();
			await d.withShift(async () => {
				expect(d.screen()).toMatch(/^drum key F3 \(shift\)/);
				await d.turn(1, -1);
				await d.turn(2, 10);
				await d.turn(3, 50);
				await d.turn(4, 3);
				expect(on(d, 'drum')).toMatchObject({
					shift: true,
					reverse: true,
					pan: 0.2,
					fade: 50 / 99,
					gain: 33 / 50
				});
			});
			expect(on(d, 'drum')).toMatchObject({ shift: false, reverse: true, tune: '0.00' });
		});

		it('edits a synth sampler’s sample on M1, and its tune on the shift layer', async () => {
			const d = await start();
			await d.click('track.3');
			await loadEngine(d, 'sampler');
			expect(d.screen()).toMatch(/^sampler, root /);
			await d.turn(1, 10);
			expect(on(d, 'drum').start).toBeCloseTo(0.1, 9);
			await d.turn(1, 5, { fine: true }); // pushed in, the points move finer
			expect(on(d, 'drum').start).toBeCloseTo(0.105, 9);
			await d.withShift(() => d.turn(2, 5));
			expect(on(d, 'drum').tune).toBe('+0.50');
		});

		it('shows the zone of the key last played on a multisampler track’s M1', async () => {
			const d = await start();
			await d.click('track.8');
			expect(d.screen()).toMatch(/^multisampler zone F3/);
			await play(d, 'c5');
			expect(d.screen()).toMatch(/^multisampler zone C5/);
		});
	});

	describe('14.2 envelopes', () => {
		it('shows the amp envelope on M2; E1–E4 set attack, decay, sustain and release', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m2');
			// a new project's bass: a sharp attack, a decay to a low sustain, a long release
			expect(d.screen()).toBe('amp envelope: attack 0, decay 32, sustain 39, release 80');
			await d.turn(1, 20);
			await d.turn(2, 20);
			await d.turn(3, -26);
			await d.turn(4, 10);
			expect(d.screen()).toBe('amp envelope: attack 20, decay 52, sustain 12, release 90');
		});

		it('swaps to the filter envelope with a click of any encoder, and back; turns edit the one shown', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m2');
			const shown: string[] = [];
			for (const e of [1, 2, 3, 4]) {
				await d.push(e);
				shown.push(on(d, 'envelope').selected);
			}
			expect(shown).toEqual(['filter', 'amp', 'filter', 'amp']);
			await d.push(3);
			expect(d.screen()).toBe('filter envelope: attack 0, decay 64, sustain 68, release 29');
			await d.turn(1, 49);
			expect(d.screen()).toBe('filter envelope: attack 49, decay 64, sustain 68, release 29');
			await d.push(1);
			expect(d.screen()).toBe('amp envelope: attack 0, decay 32, sustain 39, release 80');
		});

		it('has both envelopes on a drum track too', async () => {
			const d = await start();
			await d.click('key.m2');
			expect(on(d, 'envelope').selected).toBe('amp');
			await d.push(2);
			expect(on(d, 'envelope').selected).toBe('filter');
			await d.turn(3, -41);
			expect(on(d, 'envelope').filter.sustain).toBe(0);
		});

		it('draws the filter envelope’s reach from M3’s envelope amount', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m2');
			// the bass preset opens its filter with the envelope, a third of the way (34)
			expect(on(d, 'envelope').filterDepth).toBeCloseTo(11120 / 32767, 9);
			await d.click('key.m3');
			await d.turn(3, -50);
			await d.click('key.m2');
			expect(on(d, 'envelope').filterDepth).toBeCloseTo(16 / 99, 9);
		});

		it('shows play mode while shift is held on M2: a new project’s bass is mono, bend 2 semitones, volume 75', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m2');
			// (its preset glides the least bit: portamento shows 00, not off)
			await d.withShift(async () => {
				expect(d.screen()).toBe('play mode mono, portamento 00, bend 2 semitones, volume 75');
			});
		});

		it('picks poly, mono or legato with shift + E1', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m2');
			const seen: string[] = [];
			await d.withShift(async () => {
				await d.turn(1, -1); // from the bass preset's mono
				for (let i = 0; i < 4; i++) {
					seen.push(on(d, 'playmode').values[0]);
					await d.turn(1, 1);
				}
				await d.turn(1, -5);
				seen.push(on(d, 'playmode').values[0]);
			});
			expect(seen).toEqual(['poly', 'mono', 'legato', 'legato', 'poly']);
		});

		it('sets portamento, bend range (off fully anticlockwise) and preset volume, apart from the mixer', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m2');
			await d.withShift(async () => {
				await d.turn(2, 10);
				await d.turn(3, 1);
				await d.turn(4, 10);
				expect(on(d, 'playmode').values).toEqual(['mono', '10', '3 semitones', '85']);
				await d.turn(3, -5);
				await d.turn(2, -20);
				expect(on(d, 'playmode').values).toEqual(['mono', 'off', 'off', '85']);
			});
			// the mixer keeps a new project's level (the device stores 0x6000 of 0x7FFF)
			await d.click('key.mix');
			await d.click('track.3');
			expect(on(d, 'mix').strips[2].level).toBeCloseTo(0x6000 / 0x7fff, 9);
		});
	});

	describe('14.3 filter', () => {
		it('shows the filter on M3: E1 cutoff, E2 resonance, E3 envelope amount, E4 key tracking', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m3');
			// from the bass preset's cutoff 0, resonance 09, envelope amount 34 and key tracking 17
			await d.turn(1, 50);
			await d.turn(2, 31);
			await d.turn(3, -64);
			await d.turn(4, 43);
			expect(d.screen()).toBe('svf filter: cutoff 51, resonance 40');
			expect(on(d, 'filter')).toMatchObject({
				cutoff: 50 / 99,
				resonance: 40 / 99,
				envAmount: -30 / 99,
				keyTracking: 60 / 99
			});
		});

		it('runs the envelope amount both ways from zero (ours: −99…99)', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m3');
			await d.turn(3, 150);
			expect(on(d, 'filter').envAmount).toBe(1);
			await d.turn(3, -300);
			expect(on(d, 'filter').envAmount).toBe(-1);
		});

		it('opens the filter types at the track’s type with shift + M3; a click of E1 loads one', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m3');
			await openList(d, 3);
			expect(d.screen()).toBe('svf');
			expect(on(d, 'list').columns[0].items).toEqual(['3', 'filter']);
			await d.turn(1, -3);
			const seen: string[] = [];
			for (let i = 0; i < 4; i++) {
				seen.push(d.screen());
				await d.turn(1, 1);
			}
			// the four types factory presets use; which others exist, and their order, is a device check
			expect(seen).toEqual(['svf', 'ladder', 'z lowpass', 'z hipass']);
			await scrollTo(d, FILTER_TYPES, 'ladder');
			await d.push(1);
			// a new type keeps the cutoff and resonance (ours; device check)
			expect(d.screen()).toBe('ladder filter: cutoff 0, resonance 10');
		});

		it('confirms the highlighted filter type with M3 as well (ours, like M1 in the engine list; device check)', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m3');
			await openList(d, 3);
			await scrollTo(d, FILTER_TYPES, 'z lowpass');
			await d.click('key.m3');
			expect(d.screen()).toBe('z lowpass filter: cutoff 0, resonance 10');
		});

		it('leaves the filter types unchanged with another module key (ours)', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m3');
			await openList(d, 3);
			await scrollTo(d, FILTER_TYPES, 'z hipass');
			await d.click('key.m2');
			expect(d.screen()).toMatch(/^amp envelope/);
			await d.click('key.m3');
			expect(on(d, 'filter').type).toBe('svf');
		});

		it('shows the sends while shift is held on M3: aux out, tape, FX I and FX II on E1–E4', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m3');
			// a new project sends every instrument track to tape in full
			await d.withShift(async () => {
				expect(d.screen()).toBe('sends: aux 00, tape 99, fx I 00, fx II 00');
				await d.turn(1, 50);
				await d.turn(2, -68);
				await d.turn(3, 77);
				await d.turn(4, 25);
				expect(d.screen()).toBe('sends: aux 50, tape 31, fx I 77, fx II 25');
			});
			expect(d.screen()).toBe('svf filter: cutoff 0, resonance 10');
			await d.click('track.4');
			await d.withShift(async () => {
				expect(d.screen()).toBe('sends: aux 00, tape 99, fx I 00, fx II 23');
			});
		});
	});

	describe('14.4 lfo', () => {
		it('shows the LFO on M4; a new project’s bass has a still tremolo', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m4');
			expect(d.screen()).toBe('tremolo lfo: amount 0, destination syn');
		});

		it('lists the LFO types with shift + M4: duck, element, random, tremolo and value', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m4');
			await openList(d, 4);
			expect(d.screen()).toBe('tremolo');
			expect(on(d, 'list').columns[0].items).toEqual(['3', 'lfo']);
			await d.turn(1, -10);
			const seen: string[] = [];
			for (let i = 0; i < 5; i++) {
				seen.push(d.screen());
				await d.turn(1, 1);
			}
			// the guide counts four; duck came with OS 1.1.0
			expect(seen).toEqual(['duck', 'element', 'random', 'tremolo', 'value']);
			await scrollTo(d, LFO_TYPES, 'random');
			await d.push(1);
			expect(on(d, 'lfo').type).toBe('random');
		});

		it('confirms the highlighted LFO type with M4 as well (ours, like M1 in the engine list; device check)', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('key.m4');
			await openList(d, 4);
			await scrollTo(d, LFO_TYPES, 'tremolo');
			await d.click('key.m4');
			expect(on(d, 'lfo').type).toBe('tremolo');
		});

		it('keeps the LFO type per track', async () => {
			const d = await start();
			await lfo(d, 'duck');
			await d.click('track.4');
			expect(on(d, 'lfo').type).toBe('tremolo');
			await d.click('track.3');
			expect(on(d, 'lfo').type).toBe('duck');
		});

		it('locks on a held step what each LFO encoder turns on the page', async () => {
			const d = await start();
			const base = () => on(d, 'lock').base as Page<'lfo'>;
			await lfo(d, 'element');
			await d.click('step.1');
			await d.holding('step.1', async () => {
				await d.turn(1, 1);
				expect(base().source).toBe('M');
			});
			expect(on(d, 'lfo').source).toBe('G'); // the track's own source stays
			// the bass preset's tremolo left the envelope at −2 (random and tremolo share it: ours)
			await lfo(d, 'random');
			await d.holding('step.1', () => d.withShift(() => d.turn(2, 50)));
			await d.holding('step.1', async () => {
				expect(base()).toMatchObject({ amount: 0, envelope: 48 / 99 });
			});
			// random's and tremolo's envelope are one value (ours), so tremolo's goes on a new step
			await lfo(d, 'tremolo');
			const own = on(d, 'lfo').envelope;
			await d.click('step.2');
			await d.holding('step.2', async () => {
				await d.turn(4, 40);
				expect(base().envelope).toBeCloseTo(38 / 99, 9);
			});
			expect(on(d, 'lfo').envelope).toBe(own);
			await lfo(d, 'duck');
			await d.holding('step.1', async () => {
				await d.turn(1, 16);
				expect(base().source).toBe('metronome');
			});
		});

		it('changes nothing with a click of E1 on value, random, tremolo or element (ours: which LFOs take a new shape from it is a device check)', async () => {
			const d = await start();
			for (const type of ['value', 'random', 'tremolo', 'element'] as const) {
				await lfo(d, type);
				const before = d.frame;
				await d.push(1);
				expect(d.frame).toEqual(before);
			}
		});
	});

	describe('14.4 lfo: value', () => {
		it('syncs E1’s speed to the tempo anticlockwise, and runs free past the dial clockwise', async () => {
			const d = await start();
			await lfo(d, 'value');
			// the bass preset's LFO runs free; far enough anticlockwise it keeps to the tempo
			expect(on(d, 'lfo').speed.synced).toBe(false);
			await d.turn(1, -200);
			expect(on(d, 'lfo').speed).toMatchObject({ synced: true, label: '1' });
			await d.turn(1, 3);
			expect(on(d, 'lfo').speed).toMatchObject({ synced: true, label: '4' });
			await d.turn(1, LFO_SYNC_STEPS.length - 4);
			expect(on(d, 'lfo').speed).toMatchObject({
				synced: true,
				label: LFO_SYNC_STEPS[LFO_SYNC_STEPS.length - 1]
			});
			await d.turn(1, 1);
			expect(on(d, 'lfo').speed.synced).toBe(false);
			const dial = on(d, 'lfo').speed.position;
			await d.turn(1, 40);
			expect(on(d, 'lfo').speed.position).toBeGreaterThan(dial);
		});

		it('sets the amount with E2, either side of zero', async () => {
			const d = await start();
			await lfo(d, 'value');
			await d.turn(2, 50);
			expect(d.screen()).toMatch(/amount 51/);
			await d.turn(2, -200);
			expect(on(d, 'lfo').amount).toBe(-100);
		});

		it('picks the destination page with E3, each page regular and then free', async () => {
			const d = await start();
			await lfo(d, 'value');
			const seen: string[] = [];
			for (let i = 0; i < 8; i++) {
				const dest = on(d, 'lfo').destination;
				seen.push(dest.free ? `${dest.label} free` : dest.label);
				await d.turn(3, 1);
			}
			expect(seen).toEqual([
				'syn',
				'syn free',
				'env',
				'env free',
				'filter',
				'filter free',
				'lfo',
				'lfo free'
			]);
		});

		it('picks the parameter on that page with E4, turned or clicked; the card names it', async () => {
			const d = await start();
			await lfo(d, 'value');
			expect(on(d, 'lfo').fourth).toBe('shape');
			await d.turn(4, 2);
			expect(on(d, 'lfo')).toMatchObject({ fourth: 'detune', parameter: 2 });
			await d.push(4);
			expect(on(d, 'lfo').fourth).toBe('stereo');
			await d.push(4);
			expect(on(d, 'lfo').fourth).toBe('shape'); // ours: the click wraps round
			await d.turn(3, 4); // the filter page
			expect(on(d, 'lfo')).toMatchObject({ destination: { label: 'filter' }, fourth: 'cutoff' });
			await d.turn(4, 1);
			expect(on(d, 'lfo').fourth).toBe('res');
		});

		it('names the engine’s own parameters on the card: epiano’s first is tone', async () => {
			const d = await start();
			await d.click('track.4');
			await d.click('key.m4');
			// the pluck preset's is a tremolo: make it a value LFO
			await openList(d, 4);
			await scrollTo(d, LFO_TYPES, 'value');
			await d.push(1);
			expect(on(d, 'lfo').fourth).toBe('tone');
		});
	});

	describe('14.4 lfo: random', () => {
		it('sets speed (synced in triplets, or free), amount, destination and parameter on E1–E4', async () => {
			const d = await start();
			await lfo(d, 'random');
			// from the free speed the bass preset left: the slowest triplet step, then two faster
			await d.turn(1, -200);
			await d.turn(1, 2);
			await d.turn(2, -63);
			await d.turn(3, 2);
			await d.turn(4, 1);
			expect(on(d, 'lfo')).toMatchObject({
				type: 'random',
				speed: { synced: true, label: '3' },
				amount: (-63 * 100) / 99,
				destination: { label: 'env', free: false },
				fourth: 'decay'
			});
		});

		it('fades the modulation in or out with shift + E2, leaving the amount alone', async () => {
			const d = await start();
			await lfo(d, 'random');
			await d.turn(2, 30);
			// from the −2 the bass preset's tremolo left (random and tremolo share it: ours)
			await d.withShift(() => d.turn(2, 62));
			expect(on(d, 'lfo').amount).toBeCloseTo((30 * 100) / 99, 9);
			expect(on(d, 'lfo').envelope).toBeCloseTo(60 / 99, 9);
			await d.withShift(() => d.turn(2, -140));
			expect(on(d, 'lfo').envelope).toBeCloseTo(-80 / 99, 9); // ours: −99 fades out … 99 in
			expect(on(d, 'lfo').amount).toBeCloseTo((30 * 100) / 99, 9);
		});
	});

	describe('14.4 lfo: tremolo', () => {
		it('sets speed with E1, vibrato (pitch) with E2 and volume with E3', async () => {
			const d = await start();
			await lfo(d, 'tremolo');
			// the bass preset's runs free with its volume at −3
			await d.turn(1, -200);
			await d.turn(1, 4);
			await d.turn(2, 9);
			await d.turn(3, -51);
			expect(on(d, 'lfo')).toMatchObject({
				type: 'tremolo',
				speed: { synced: true, label: '5' },
				amount: (9 * 100) / 99,
				volume: (-54 * 100) / 99
			});
		});

		it('fades the tremolo in or out with E4 (its envelope)', async () => {
			const d = await start();
			await lfo(d, 'tremolo');
			await d.turn(4, 42); // from the bass preset's −2
			expect(on(d, 'lfo').envelope).toBeCloseTo(40 / 99, 9);
			await d.turn(4, -60);
			expect(on(d, 'lfo').envelope).toBeCloseTo(-20 / 99, 9);
		});

		it('changes the shape with shift + E2, leaving the vibrato alone', async () => {
			const d = await start();
			await lfo(d, 'tremolo');
			await d.turn(2, 9);
			await d.withShift(() => d.turn(2, 30));
			expect(on(d, 'lfo').amount).toBeCloseTo((9 * 100) / 99, 9);
			// the shape card is TE's saw whatever the shape (ours): the model tells
			expect(d.state.tracks[2].lfo.shape).toBe(30);
		});
	});

	describe('14.4 lfo: element', () => {
		it('picks the source with E1: gyroscope, microphone, amp envelope, then all three summed', async () => {
			const d = await start();
			await lfo(d, 'element');
			const seen: string[] = [];
			for (let i = 0; i < 5; i++) {
				seen.push(on(d, 'lfo').source ?? '');
				await d.turn(1, 1);
			}
			// ours: TE's art shows only G; the other letters are ours
			expect(seen).toEqual(['G', 'M', 'E', 'S', 'S']);
			await d.turn(1, -10);
			expect(on(d, 'lfo').source).toBe('G');
		});

		it('sets amount with E2, the destination page with E3 (no free twins) and the parameter with E4', async () => {
			const d = await start();
			await lfo(d, 'element');
			await d.turn(2, 27);
			const seen: string[] = [];
			for (let i = 0; i < 5; i++) {
				const dest = on(d, 'lfo').destination;
				seen.push(dest.free ? `${dest.label} free` : dest.label);
				await d.turn(3, 1);
			}
			expect(seen).toEqual(['syn', 'env', 'filter', 'lfo', 'lfo']);
			expect(on(d, 'lfo').amount).toBeCloseTo((27 * 100) / 99, 9);
			await d.turn(4, 1);
			expect(on(d, 'lfo').parameter).toBe(1);
		});
	});

	describe('14.4 lfo: duck', () => {
		it('picks the source with E1: tracks 1–8, auxiliary tracks 9–16, then the metronome', async () => {
			const d = await start();
			await lfo(d, 'duck');
			expect(on(d, 'lfo').source).toBe('1');
			await d.turn(1, 3);
			expect(on(d, 'lfo').source).toBe('4');
			await d.turn(1, 8);
			expect(on(d, 'lfo').source).toBe('12');
			await d.turn(1, 4);
			expect(on(d, 'lfo').source).toBe('16');
			await d.turn(1, 1);
			expect(d.screen()).toMatch(/source metronome/);
			await d.turn(1, 5);
			expect(d.screen()).toMatch(/source metronome/);
		});

		it('switches the source between its audio and its notes with a click of E1', async () => {
			const d = await start();
			await lfo(d, 'duck');
			expect(on(d, 'lfo').sourceAudio).toBe(true);
			await d.push(1);
			expect(on(d, 'lfo').sourceAudio).toBe(false);
			await d.push(1);
			expect(on(d, 'lfo').sourceAudio).toBe(true);
		});

		it('switches the source type with shift + E1 too (the guide: a click, or shift and a turn; the directions are ours)', async () => {
			const d = await start();
			await lfo(d, 'duck');
			await d.withShift(() => d.turn(1, 1));
			expect(d.screen()).toBe('duck lfo: source 1 (notes), amount 0');
			await d.withShift(() => d.turn(1, -1));
			expect(on(d, 'lfo')).toMatchObject({ source: '1', sourceAudio: true });
		});

		it('sets the amount with E2, hold with E3 and release with E4', async () => {
			const d = await start();
			await lfo(d, 'duck');
			await d.turn(2, 40);
			await d.turn(3, -20);
			await d.turn(4, 30);
			expect(on(d, 'lfo').amount).toBeCloseTo((40 * 100) / 99, 9);
			// the hold and release cards are TE's pictograms (ours): the model tells
			expect(d.state.tracks[2].lfo).toMatchObject({ hold: 30, release: 80 });
		});
	});

	describe('20 synth engines', () => {
		it('changes the engine the guide’s way: track, shift + M1, E1 to it, then M1 confirms', async () => {
			const d = await start();
			await d.click('key.instrument');
			await d.click('track.6');
			await openList(d, 1);
			expect(d.screen()).toBe('hardsync');
			await scrollTo(d, ENGINE_LIST, 'organ');
			await d.click('key.m1');
			// with no preset, the device's own starting values
			expect(d.screen()).toBe('organ: type 40, bass 53, tremolo amount 82, tremolo speed 09');
			expect(d.state.tracks[5].engine).toBe('organ');
		});

		const engines: [EngineId, number | null, string[]][] = [
			['axis', 7, ['tone', 'ratio', 'shape', 'tremolo']],
			['dissolve', 5, ['swarm', 'am', 'fm', 'detune']],
			['epiano', 4, ['tone', 'texture', 'punch', 'tine']],
			['hardsync', 6, ['freq', 'sub', 'noise', 'lowcut']],
			['organ', null, ['type', 'bass', 'tremolo amount', 'tremolo speed']],
			['prism', 3, ['shape', 'ratio', 'detune', 'stereo']],
			['simple', null, ['shape', 'pw', 'noise', 'stereo']],
			['wavetable', null, ['table', 'position', 'warp', 'drift']]
		];
		/** The guide's section numbers: 20.1 axis … 20.9 wavetable, external (midi) at 20.4. */
		const ORDER = ['axis', 'dissolve', 'epiano', 'midi', 'hardsync', 'organ', 'prism', 'simple'];
		const section = (engine: EngineId) => `20.${[...ORDER, 'wavetable'].indexOf(engine) + 1}`;

		for (const [engine, track, names] of engines) {
			it(`${section(engine)} ${engine}: ${names.join(', ')} on E1–E4, 0–99 each (ours: two digits)`, async () => {
				const d = await start();
				await d.click(`track.${track ?? 3}`);
				if (track === null) await loadEngine(d, engine);
				const synth = on(d, 'synth');
				expect(synth.engine).toBe(engine);
				expect(synth.header.map((c) => c.label)).toEqual(names);
				const values = synth.header.map((c) => Number(c.value));
				await d.turn(1, 5);
				await d.turn(2, -10);
				await d.turn(3, 200);
				await d.turn(4, -200);
				const want = [Math.min(99, values[0] + 5), Math.max(0, values[1] - 10), 99, 0];
				expect(header(d)).toEqual(names.map((n, i) => `${n} ${String(want[i]).padStart(2, '0')}`));
				expect(d.screen()).toBe(
					`${engine}: ${names.map((n, i) => `${n} ${String(want[i]).padStart(2, '0')}`).join(', ')}`
				);
				expect(on(d, 'synth').params).toEqual(want.map((v) => v / 99));
			});
		}

		it('gives a synth its own starting values again after a trip to another synth (ours; device check)', async () => {
			const d = await start();
			await d.click('track.3');
			await d.turn(1, -30);
			await loadEngine(d, 'organ');
			await loadEngine(d, 'prism');
			// prism picked with no preset: the device's shape 50, not the bass preset's 15
			expect(header(d)[0]).toBe('shape 50');
		});
	});

	describe('20.4 external (the midi engine)', () => {
		it('sets channel, bank and program on M1 with E1, E2 and E3', async () => {
			const d = await start();
			await d.click('track.3');
			await loadEngine(d, 'midi');
			expect(d.screen()).toBe('midi: channel 1, bank none, program 1');
			await d.turn(1, 15);
			await d.turn(2, 1);
			await d.turn(3, 7);
			expect(d.screen()).toBe('midi: channel 16, bank 0, program 8');
			await d.turn(1, 5);
			await d.turn(2, 200);
			await d.turn(3, 200);
			expect(d.screen()).toBe('midi: channel 16, bank 127, program 128');
			await d.turn(2, -300);
			await d.turn(1, -30);
			expect(d.screen()).toBe('midi: channel 1, bank none, program 128');
			await d.turn(4, 5); // ours: the page has three settings
			expect(d.screen()).toBe('midi: channel 1, bank none, program 128');
		});

		it('keeps its CCs on M2 and M3: shift + turn switches a slot on and picks its number, a turn sets it', async () => {
			const d = await start();
			await d.click('track.3');
			await loadEngine(d, 'midi');
			await d.click('key.m2');
			expect(d.screen()).toBe('midi cc set I: off, off, off, off');
			await d.withShift(async () => {
				await d.turn(1, 75);
				expect(d.screen()).toBe('midi cc set I cc numbers: cc 74, off, off, off');
			});
			await d.turn(1, 64);
			await d.turn(2, 30); // ours: a slot that is off has no value to turn
			expect(d.screen()).toBe('midi cc set I: cc 74 64, off, off, off');
			await d.click('key.m3');
			expect(d.screen()).toBe('midi cc set II: off, off, off, off');
		});

		it('goes to the second CC page with shift + M3 (ours: the midi engine has no filter)', async () => {
			const d = await start();
			await d.click('track.3');
			await loadEngine(d, 'midi');
			await d.click('key.m2');
			await openList(d, 3);
			expect(d.screen()).toBe('midi cc set II: off, off, off, off');
			await openList(d, 1);
			expect(d.screen()).toBe('midi');
		});

		it('keeps the LFO on M4 of a midi track (ours: the guide names only M1–M3)', async () => {
			const d = await start();
			await d.click('track.3');
			await loadEngine(d, 'midi');
			await d.click('key.m4');
			expect(d.screen()).toBe('tremolo lfo: amount 0, destination syn');
		});

		it('keeps the synth’s settings through a switch to midi and back (OS 1.0.50)', async () => {
			const d = await start();
			await d.click('track.3');
			await d.turn(1, 30);
			await d.turn(4, 10);
			await loadEngine(d, 'midi');
			await loadEngine(d, 'prism');
			// the bass preset's shape 15, ratio 00, detune 05, stereo 22, as turned
			expect(header(d)).toEqual(['shape 45', 'ratio 00', 'detune 05', 'stereo 32']);
		});

		// manual instrument/engine-midi: program changes lock per step (fixed in OS 1.1.15)
		it('locks a program change on a held step, leaving the track’s own program (OS 1.1.15)', async () => {
			const d = await start();
			await d.click('track.3');
			await loadEngine(d, 'midi');
			await play(d, 'c4');
			await d.click('step.1');
			await d.holding('step.1', async () => {
				await d.turn(3, 4);
				expect((on(d, 'lock').base as Page<'midi'>).program).toBe('5');
			});
			expect(d.screen()).toBe('midi: channel 1, bank none, program 1');
		});
	});
}
