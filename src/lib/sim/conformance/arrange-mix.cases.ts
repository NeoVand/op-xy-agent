/**
 * Arrange and mix as the OP-XY does them: conformance cases written from TE's guide (chapters 16
 * "arrange" and 17 "mix", with the song-building steps of chapter 12 "workflow", guide v1.1.15,
 * reworded in `knowledge/manual/units/arrange/*` and `mix/*`) and TE's release notes up to OS
 * 1.1.33, not from our code. Each case works the machine the way a person does, with real press
 * lengths and the computer's Shift key, and checks what a person sees: the screen (what it says and
 * what it draws), the track, step and keyboard LEDs, and the step keys chasing while time passes.
 * The model is checked too where the screen cannot tell (the sound a pattern carries).
 *
 * The same cases run on the bare simulator (`arrange-mix.spec.ts`, Node) and on the app in a
 * browser, clicking the rendered replica (`src/lib/app/arrange-mix-conformance.svelte.spec.ts`),
 * so a bug in the wiring between them fails too.
 *
 * Where the guide leaves something open the case says "ours" and pins our choice; "device check"
 * marks what only a real unit can settle. A skipped case names the file that needs the fix.
 */
import { describe, expect, it } from 'vitest';
import type { ScreenFrame } from '../screen/frame';
import { accidental, natural, type Driver } from '../testing/driver';

/** A sixteenth at the new project's 120 BPM, and a bar: how long a one-bar scene lasts. */
const STEP_MS = 125;
const BAR_MS = 16 * STEP_MS;

/**
 * The module keys in arrange as the guide's text gives them: M1 new, M2 copy, M3 paste, M4 clear.
 * TE's screen art labels M1 "clear" and M4 "new" (device check).
 */
const NEW = 'key.m1';
const COPY = 'key.m2';
const PASTE = 'key.m3';
const CLEAR = 'key.m4';

const step = (n: number) => `step.${n}`;
const track = (n: number) => `track.${n}`;

const LED_CHAR = { off: '.', dim: 'd', white: 'w', red: 'r' } as const;

/** Track keys 1–8 spelled like the step keys: `.` off, `w` white, `r` red. */
const tracks = (d: Driver) =>
	Array.from({ length: 8 }, (_, i) => LED_CHAR[d.led(track(i + 1))]).join('');

/** The screen's page, narrowed (fails the case on another page). */
function page<P extends ScreenFrame['page']>(
	d: Driver,
	name: P
): Extract<ScreenFrame, { page: P }> {
	const frame = d.frame;
	expect(frame.page).toBe(name);
	return frame as Extract<ScreenFrame, { page: P }>;
}

/** Lets the transport run on for `sixteenths` steps. */
const run = (d: Driver, sixteenths: number) => d.wait(sixteenths * STEP_MS);

/**
 * Lets the transport run on to sixteenth `at` (which must be ahead), counted from where the scene
 * playing began: a scene that plays round and round keeps counting, a new one starts from 0.
 */
async function playTo(d: Driver, at: number): Promise<void> {
	const left = at - d.state.transport.position;
	expect(left).toBeGreaterThan(0);
	await d.wait(left * STEP_MS);
}

/** The black keys of scene `n` (1–99), pressed while shift is down. */
async function sceneKeys(d: Driver, n: number): Promise<void> {
	if (n < 10) return d.click(accidental(n));
	await d.clicks(accidental(0), accidental(Math.floor(n / 10)), accidental(n % 10));
}

/** Selects scene `n`: shift + its black key, or the last black key and both digits for 10–99. */
const scene = (d: Driver, n: number) => d.withShift(() => sceneKeys(d, n));

/**
 * Puts notes on steps of instrument track `t` in instrument mode, on the pattern that plays, then
 * goes back (to arrange unless told otherwise). The track stays selected.
 */
async function sequence(d: Driver, t: number, steps: number[], back = 'key.arrange') {
	await d.clicks('key.instrument', track(t), ...steps.map(step), back);
}

/** The engine instrument mode's M1 page shows on track `t` (a look there, then back to arrange). */
async function engine(d: Driver, t: number, back = 'key.arrange'): Promise<string> {
	await d.clicks('key.instrument', track(t));
	const shown = page(d, 'synth').engine;
	await d.click(back);
	return shown;
}

/**
 * Scenes 1–3 in which T1 plays its patterns 1–3, with a note on step 5, 6 and 7 of them in turn, so
 * the step keys tell them apart away from the playhead. Ends in arrange on scene 1, T1 selected.
 */
async function threeScenes(d: Driver): Promise<void> {
	await d.click('key.arrange');
	await sequence(d, 1, [5]);
	await d.click(NEW);
	await sequence(d, 1, [6]);
	await d.click(NEW);
	await sequence(d, 1, [7]);
	await d.turn(4, -2); // scene 1: pattern 1
	await scene(d, 2);
	await d.turn(4, 1); // scene 2: pattern 2
	await scene(d, 3);
	await d.turn(4, 1); // scene 3: pattern 3
	await scene(d, 1);
}

/** Which of T1's patterns (1–3, see {@link threeScenes}) the step keys show; 0 for none. */
const shown = (d: Driver) => [5, 6, 7].findIndex((n) => d.led(step(n)) === 'white') + 1;

/** From arrange: song mode with the song emptied (shift + M1), ready to key scenes in. */
async function emptySong(d: Driver): Promise<void> {
	await d.withShift(() => d.clicks('key.arrange', 'key.m1'));
}

/** The scene numbers of the song order the song page shows. */
const entries = (d: Driver) => page(d, 'song').slots.flatMap((slot) => (slot ? [slot.scene] : []));

/** The song entry with the white ring (the one playing), −1 for none. */
const ring = (d: Driver) => page(d, 'song').slots.findIndex((slot) => slot?.playing);

/** T4 (epiano) with pattern 1 its own and pattern 2 a paste of T3's prism pattern, on pattern 1. */
async function twoSounds(d: Driver): Promise<void> {
	await d.click('key.arrange');
	await sequence(d, 3, [1]);
	await d.click(COPY); // T3's pattern, with prism
	await sequence(d, 4, [1]); // T4's pattern has notes, so the paste adds one
	await d.click(PASTE); // pattern 2: prism
	await d.turn(4, -1);
}

/** The header values of a mix page (M2–M4), in encoder order. */
function values(d: Driver): string[] {
	const frame = d.frame;
	if (frame.page !== 'mix-eq' && frame.page !== 'mix-saturator' && frame.page !== 'mix-master') {
		throw new Error(`not a master page: ${frame.page}`);
	}
	return frame.header.map((cell) => cell.value);
}

export function arrangeMixConformance(start: () => Promise<Driver>): void {
	describe('16 arrange mode', () => {
		it('opens with the arrange key: scene 1 in the red box, the instrument tracks, T1 lit white', async () => {
			const d = await start();
			await d.click('key.arrange');
			expect(d.screen()).toBe('arrange, scene 1, instrument tracks, T1 pattern 1 of 1');
			const f = page(d, 'arrange');
			expect(f.columns.map((c) => c.label)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
			expect(f.queued).toBeNull();
			expect(tracks(d)).toBe('w.......');
		});

		it('labels M1–M4 new, copy, paste, clear as the text does (TE’s art swaps M1 and M4: device check)', async () => {
			const d = await start();
			await d.click('key.arrange');
			expect(page(d, 'arrange').soft.map((l) => l?.text)).toEqual([
				'new',
				'copy',
				'paste',
				'clear'
			]);
		});

		it('keeps the track chosen in another mode (ours)', async () => {
			const d = await start();
			await d.clicks(track(4), 'key.arrange');
			expect(d.screen()).toContain('T4 pattern 1 of 1');
			expect(tracks(d)).toBe('...w....');
		});
	});

	describe('16.1 switching tracks and patterns', () => {
		it('picks the track to arrange with its key, which lights white', async () => {
			const d = await start();
			await d.clicks('key.arrange', track(3));
			expect(tracks(d)).toBe('..w.....');
			expect(d.screen()).toBe('arrange, scene 1, instrument tracks, T3 pattern 1 of 1');
			expect(page(d, 'arrange').columns.map((c) => c.selected)).toEqual([
				false,
				false,
				true,
				false,
				false,
				false,
				false,
				false
			]);
		});

		it('flips to the auxiliary tracks with arrange pressed again, lit red, and back', async () => {
			const d = await start();
			await d.clicks('key.arrange', 'key.arrange');
			expect(page(d, 'arrange').columns.map((c) => c.name)).toEqual([
				'brain',
				'punch-in fx',
				'external midi',
				'external cv',
				'external audio',
				'tape',
				'fx I',
				'fx II'
			]);
			expect(tracks(d)).toBe('r.......');
			await d.click(track(6));
			expect(tracks(d)).toBe('.....r..');
			expect(d.screen()).toBe('arrange, scene 1, auxiliary tracks, tape pattern 1 of 1');
			await d.click('key.arrange');
			expect(d.screen()).toBe('arrange, scene 1, instrument tracks, T1 pattern 1 of 1');
			expect(tracks(d)).toBe('w.......');
		});

		it('lights the step keys with the sequence of the track chosen', async () => {
			const d = await start();
			await d.click('key.arrange');
			await sequence(d, 1, [1, 5, 9, 13]);
			await sequence(d, 3, [2, 4]);
			expect(d.steps()).toBe('.w.w............');
			await d.click(track(1));
			expect(d.steps()).toBe('w...w...w...w...');
			await d.click(track(2));
			expect(d.steps()).toBe('................');
		});

		it('lights an auxiliary track’s sequence the same way', async () => {
			const d = await start();
			await d.clicks('key.auxiliary', track(3), step(1), step(9)); // external midi
			await d.clicks('key.arrange', 'key.arrange', track(3));
			expect(d.steps()).toBe('w.......w.......');
			await d.click(track(1));
			expect(d.steps()).toBe('................');
		});

		it('turns the white encoder through the track’s patterns, and the step keys follow', async () => {
			const d = await start();
			await d.click('key.arrange');
			await sequence(d, 1, [1, 5, 9, 13]);
			await d.click(NEW);
			await sequence(d, 1, [3, 7]);
			await d.click(NEW);
			await sequence(d, 1, [16]);
			expect(d.screen()).toContain('T1 pattern 3 of 3');
			expect(d.steps()).toBe('...............w');
			await d.turn(4, -1);
			expect(d.screen()).toContain('T1 pattern 2 of 3');
			expect(d.steps()).toBe('..w...w.........');
			await d.turn(4, -1);
			expect(d.steps()).toBe('w...w...w...w...');
			// only the patterns there are: turning on stays on the first or the last
			await d.turn(4, -3);
			expect(d.screen()).toContain('T1 pattern 1 of 3');
			await d.turn(4, 5);
			expect(d.screen()).toContain('T1 pattern 3 of 3');
		});

		it('moves a stack of patterns: the screen lifts the chosen track’s and shows the others’ edges', async () => {
			const d = await start();
			await d.clicks('key.arrange', track(3), NEW, NEW, NEW, NEW); // five patterns, the fifth playing
			await d.turn(4, -2);
			let column = page(d, 'arrange').columns[2];
			expect(column).toMatchObject({ selected: true, pattern: 3, patterns: 5 });
			expect(column.cells.map((c) => c.number)).toEqual([1, 2, 3, 4, 5]);
			await d.click(track(1));
			column = page(d, 'arrange').columns[2];
			// closed again: one cell on the band, edges for the patterns before and after it
			expect(column.cells).toHaveLength(1);
			expect([column.above, column.below]).toEqual([2, 2]);
		});

		it('mutes the chosen track with a push of the white encoder, and unmutes it with another', async () => {
			const d = await start();
			await d.clicks('key.arrange', track(2));
			await d.push(4);
			expect(d.screen()).toBe('arrange, scene 1, instrument tracks, T2 pattern 1 of 1, muted');
			expect(page(d, 'arrange').columns[1].muted).toBe(true);
			// the same mute as the mix's: with shift held there, T2 is the unlit one
			await d.click('key.mix');
			await d.withShift(async () => {
				expect(tracks(d)).toBe('w.wwwwww');
			});
			await d.click('key.arrange');
			await d.push(4);
			expect(d.screen()).toBe('arrange, scene 1, instrument tracks, T2 pattern 1 of 1');
		});

		it('switches a track’s pattern at once while playing, the playhead keeping its place (ours)', async () => {
			const d = await start();
			await d.click('key.arrange');
			await sequence(d, 1, [9]);
			await d.click(NEW);
			await sequence(d, 1, [11]);
			await d.click('key.play');
			await playTo(d, 4.5);
			await d.turn(4, -1);
			expect(d.screen()).toContain('T1 pattern 1 of 2');
			expect([d.led(step(9)), d.led(step(11))]).toEqual(['white', 'off']);
			expect(d.state.transport.position).toBeGreaterThan(4);
			await d.click('key.stop');
		});

		it('mutes an auxiliary track the same way', async () => {
			const d = await start();
			await d.clicks('key.arrange', 'key.arrange', track(6));
			await d.push(4);
			expect(d.screen()).toBe('arrange, scene 1, auxiliary tracks, tape pattern 1 of 1, muted');
			expect(d.state.aux[5].mix.muted).toBe(true);
		});
	});

	describe('16.1 sound link', () => {
		it('gives each pattern its own sound while the track is not linked', async () => {
			const d = await start();
			await twoSounds(d);
			expect(d.screen()).toContain('T4 pattern 1 of 2');
			expect(await engine(d, 4)).toBe('epiano');
			await d.turn(4, 1);
			expect(await engine(d, 4)).toBe('prism');
		});

		it('links the sound with a turn of the light grey encoder: another pattern keeps it', async () => {
			const d = await start();
			await twoSounds(d);
			await d.turn(3, 1);
			expect(d.screen()).toBe('arrange, scene 1, instrument tracks, T4 pattern 1 of 2, sound link');
			expect(page(d, 'arrange').columns[3].linked).toBe(true);
			await d.turn(4, 1); // pattern 2 would bring prism
			expect(await engine(d, 4)).toBe('epiano');
			await d.turn(3, -1); // ours: turned back the other way, the link comes off
			expect(d.screen()).toBe('arrange, scene 1, instrument tracks, T4 pattern 2 of 2');
			expect(await engine(d, 4)).toBe('prism');
		});

		it('links and unlinks with a push of the light grey encoder', async () => {
			const d = await start();
			await twoSounds(d);
			await d.push(3);
			expect(d.screen()).toContain('sound link');
			await d.turn(4, 1);
			expect(await engine(d, 4)).toBe('epiano');
			await d.push(3);
			// ours: unlinked, each pattern plays its own sound again (the guide does not say)
			expect(d.screen()).not.toContain('sound link');
			expect(await engine(d, 4)).toBe('prism');
		});

		it('takes the pattern on the white encoder as the link’s source with shift + a turn of the light grey one', async () => {
			const d = await start();
			await twoSounds(d);
			await d.turn(4, 1); // pattern 2: prism
			await d.withShift(() => d.turn(3, 1));
			expect(d.screen()).toContain('T4 pattern 2 of 2, sound link');
			await d.turn(4, -1); // pattern 1 now plays pattern 2's sound
			expect(await engine(d, 4)).toBe('prism');
		});

		it('takes the source with shift + a push of the light grey encoder too', async () => {
			const d = await start();
			await twoSounds(d);
			await d.turn(4, 1);
			await d.withShift(() => d.push(3));
			await d.turn(4, -1);
			expect(d.screen()).toContain('T4 pattern 1 of 2, sound link');
			expect(await engine(d, 4)).toBe('prism');
		});

		it('brings each pattern’s sound along when a scene changes the pattern', async () => {
			const d = await start();
			await twoSounds(d); // scene 1: T4 on pattern 1, epiano
			await scene(d, 2);
			await d.turn(4, 1); // scene 2: pattern 2, prism
			await scene(d, 1);
			expect(await engine(d, 4)).toBe('epiano');
			await scene(d, 2);
			expect(await engine(d, 4)).toBe('prism');
		});

		it('keeps a linked track’s sound through scene changes', async () => {
			const d = await start();
			await twoSounds(d);
			await d.push(3); // linked to pattern 1's epiano
			await scene(d, 2);
			await d.turn(4, 1); // scene 2 plays pattern 2
			await scene(d, 1);
			await scene(d, 2);
			expect(d.screen()).toContain('T4 pattern 2 of 2, sound link');
			expect(await engine(d, 4)).toBe('epiano');
		});

		it('keeps an edit made while linked in the one linked sound, whichever pattern plays (ours)', async () => {
			const d = await start();
			await twoSounds(d);
			await d.turn(3, 1); // linked to pattern 1's epiano
			await d.turn(4, 1);
			await d.clicks('key.instrument', track(4));
			await d.turn(1, -30); // epiano's first parameter, 80 → 50
			await d.click('key.arrange');
			await d.turn(4, -1);
			await d.clicks('key.instrument', track(4));
			expect(page(d, 'synth')).toMatchObject({ engine: 'epiano' });
			expect(page(d, 'synth').header[0].value).toBe('50');
		});
	});

	describe('16.2 edit controls', () => {
		it('adds a pattern with M1: the new one plays at once, empty, and the step keys go dark', async () => {
			const d = await start();
			await d.click('key.arrange');
			await sequence(d, 1, [1, 5, 9, 13]);
			await d.click(NEW);
			expect(d.screen()).toContain('T1 pattern 2 of 2');
			expect(d.steps()).toBe('................');
			await d.turn(4, -1);
			expect(d.steps()).toBe('w...w...w...w...');
		});

		it('holds up to 16 patterns on a track (OS 1.1.15; nine before)', async () => {
			const d = await start();
			await d.click('key.arrange');
			for (let i = 0; i < 17; i++) await d.click(NEW);
			expect(d.screen()).toContain('T1 pattern 16 of 16');
			expect(page(d, 'arrange').columns[0].patterns).toBe(16);
		});

		it('adds patterns to an auxiliary track the same way', async () => {
			const d = await start();
			await d.clicks('key.arrange', 'key.arrange', track(3), NEW, NEW);
			expect(d.screen()).toBe('arrange, scene 1, auxiliary tracks, external midi pattern 3 of 3');
			expect(tracks(d)).toBe('..r.....');
		});

		it('gives a new pattern the player type in use (OS 1.1.25)', async () => {
			const d = await start();
			await d.click(track(3));
			await d.withShift(() => d.click('key.player'));
			expect(page(d, 'player').type).toBe('maestro');
			await d.clicks('key.arrange', NEW, 'key.player');
			expect(d.screen()).toBe('maestro player off: roll 00, pattern up, hold off');
		});

		it('copies a pattern with M2 and pastes it on its own track with M3, as a new pattern to vary', async () => {
			const d = await start();
			await d.click('key.arrange');
			await sequence(d, 1, [1, 5, 9, 13]);
			await d.clicks(COPY, PASTE);
			expect(d.screen()).toContain('T1 pattern 2 of 2');
			expect(d.steps()).toBe('w...w...w...w...');
			await sequence(d, 1, [3]); // the variation
			expect(d.steps()).toBe('w.w.w...w...w...');
			await d.turn(4, -1);
			expect(d.steps()).toBe('w...w...w...w...');
		});

		it('pastes onto another track with the whole instrument: engine and settings come along', async () => {
			const d = await start();
			await d.click(track(3)); // prism
			await d.turn(1, -20); // its first parameter, 80 → 60
			await d.click(step(1));
			await d.clicks('key.arrange', COPY, track(5), PASTE); // onto T5, dissolve
			expect(d.screen()).toContain('T5 pattern 1 of 1');
			expect(d.steps()).toBe('w...............');
			await d.clicks('key.instrument', track(5));
			expect(page(d, 'synth')).toMatchObject({ engine: 'prism' });
			expect(page(d, 'synth').header[0].value).toBe('60');
		});

		it('pastes into an empty pattern rather than adding one (OS 1.0.25)', async () => {
			const d = await start();
			await d.click('key.arrange');
			await sequence(d, 1, [1, 2]);
			await d.clicks(COPY, track(2), PASTE);
			expect(d.screen()).toContain('T2 pattern 1 of 1');
			expect(d.steps()).toBe('ww..............');
			await d.click(PASTE); // now it has notes: the next paste adds a pattern
			expect(d.screen()).toContain('T2 pattern 2 of 2');
		});

		it('copies and pastes a pattern without notes too (OS 1.0.50)', async () => {
			const d = await start();
			await d.clicks('key.arrange', track(3), COPY); // T3's empty pattern, with prism
			await sequence(d, 6, [1]); // T6, hardsync, has notes
			await d.click(PASTE);
			expect(d.screen()).toContain('T6 pattern 2 of 2');
			expect(d.steps()).toBe('................');
			expect(await engine(d, 6)).toBe('prism');
		});

		it('pastes nothing before anything was copied (ours)', async () => {
			const d = await start();
			await d.click('key.arrange');
			await sequence(d, 1, [1]);
			await d.click(PASTE);
			expect(d.screen()).toContain('T1 pattern 1 of 1');
		});

		it('removes the chosen pattern with M4; the one before it plays on (ours)', async () => {
			const d = await start();
			await d.click('key.arrange');
			await sequence(d, 1, [1]);
			await d.click(NEW);
			await sequence(d, 1, [2]);
			await d.click(NEW);
			await sequence(d, 1, [3]);
			await d.turn(4, -1); // pattern 2
			await d.click(CLEAR);
			expect(d.screen()).toContain('T1 pattern 1 of 2');
			expect(d.steps()).toBe('w...............');
			await d.turn(4, 1); // the third moved up
			expect(d.steps()).toBe('..w.............');
		});

		it('empties a track’s only pattern rather than removing it (ours)', async () => {
			const d = await start();
			await d.click('key.arrange');
			await sequence(d, 1, [1, 2]);
			await d.click(CLEAR);
			expect(d.screen()).toContain('T1 pattern 1 of 1');
			expect(d.steps()).toBe('................');
		});

		it('copies a brain pattern with its brain settings, which are per pattern (OS 1.0.29)', async () => {
			const d = await start();
			await d.clicks('key.auxiliary', track(1)); // the brain's page
			await d.turn(2, 2); // key d, set by hand
			expect(d.screen()).toBe('brain: d major, manual, root d, scale major, no linked track');
			await d.clicks('key.arrange', 'key.arrange', track(1), COPY, NEW, 'key.auxiliary');
			await d.turn(2, 5); // pattern 2: key g
			expect(d.screen()).toContain('root g');
			await d.clicks('key.arrange', PASTE); // into the empty pattern 2 …
			expect(d.screen()).toContain('brain pattern 2 of 2');
			await d.click('key.auxiliary');
			expect(d.screen()).toContain('root d'); // … with pattern 1's key
		});

		it('keeps each brain pattern’s own settings when a pattern before it goes', async () => {
			const d = await start();
			await d.clicks('key.auxiliary', track(1));
			await d.turn(2, 2); // pattern 1: key d
			await d.clicks('key.arrange', 'key.arrange', track(1), NEW, 'key.auxiliary');
			await d.turn(2, 2); // pattern 2: key e
			expect(d.screen()).toContain('root e');
			await d.click('key.arrange');
			await d.turn(4, -1);
			await d.click(CLEAR); // pattern 1 goes: pattern 2 is the first now
			expect(d.screen()).toContain('brain pattern 1 of 1');
			await d.click('key.auxiliary');
			expect(d.screen()).toContain('root e');
		});

		it('keeps the scenes on their patterns when a pattern before them goes (ours)', async () => {
			const d = await start();
			await d.click('key.arrange');
			await sequence(d, 1, [1]);
			await d.click(NEW);
			await sequence(d, 1, [2]); // scene 1: pattern 2
			await scene(d, 2);
			await d.turn(4, -1); // scene 2: pattern 1
			await d.click(CLEAR); // pattern 1 goes; the second becomes the first
			await scene(d, 1);
			expect(d.screen()).toContain('T1 pattern 1 of 1');
			expect(d.steps()).toBe('.w..............');
		});
	});

	describe('16.3 scenes', () => {
		it('selects scenes 1–9 with shift and the numbered black keys, shown in the red box', async () => {
			const d = await start();
			await d.click('key.arrange');
			await scene(d, 5);
			expect(page(d, 'arrange').scene).toBe('5');
			expect(d.screen()).toBe('arrange, scene 5, instrument tracks, T1 pattern 1 of 1');
			await scene(d, 9);
			expect(page(d, 'arrange').scene).toBe('9');
		});

		it('starts an empty scene as a copy of the one it was chosen from (OS 1.0.29)', async () => {
			const d = await start();
			await d.clicks('key.arrange', track(3), NEW, NEW); // T3 on pattern 3
			await d.click(track(2));
			await d.push(4); // T2 muted
			await scene(d, 4);
			expect(d.screen()).toBe('arrange, scene 4, instrument tracks, T2 pattern 1 of 1, muted');
			expect(page(d, 'arrange').columns[2].pattern).toBe(3);
		});

		it('remembers each scene’s patterns: going back brings them back, and the step keys follow', async () => {
			const d = await start();
			await d.click('key.arrange');
			await sequence(d, 1, [1, 5, 9, 13]);
			await d.click(NEW);
			await sequence(d, 1, [3, 7, 11, 15]); // scene 1: pattern 2
			await scene(d, 2);
			await d.turn(4, -1); // scene 2: pattern 1
			expect(d.steps()).toBe('w...w...w...w...');
			await scene(d, 1);
			expect(d.screen()).toBe('arrange, scene 1, instrument tracks, T1 pattern 2 of 2');
			expect(d.steps()).toBe('..w...w...w...w.');
			await scene(d, 2);
			expect(d.steps()).toBe('w...w...w...w...');
		});

		it('remembers each scene’s patterns on the auxiliary tracks too', async () => {
			const d = await start();
			await d.clicks('key.arrange', 'key.arrange', track(6), NEW); // tape on pattern 2
			await scene(d, 2);
			await d.turn(4, -1);
			await scene(d, 1);
			expect(d.screen()).toBe('arrange, scene 1, auxiliary tracks, tape pattern 2 of 2');
			await scene(d, 2);
			expect(d.screen()).toBe('arrange, scene 2, auxiliary tracks, tape pattern 1 of 2');
		});

		it('remembers each scene’s mix: levels and mutes (pans too: ours)', async () => {
			const d = await start();
			await d.clicks('key.mix', track(2));
			await d.turn(4, -30); // T2 at 50
			await d.turn(3, 10); // panned right
			await d.click('key.arrange');
			await scene(d, 2);
			await d.click('key.mix');
			expect(page(d, 'mix').strips[1]).toMatchObject({ level: 50 / 99, pan: 0.2, muted: false });
			await d.turn(4, 20); // T2 at 70 in scene 2 …
			await d.push(3); // … centred …
			await d.withShift(() => d.click(track(5))); // … and T5 muted there
			await d.click('key.arrange');
			await scene(d, 1);
			await d.click('key.mix');
			expect(page(d, 'mix').strips[1]).toMatchObject({ level: 50 / 99, pan: 0.2 });
			expect(page(d, 'mix').strips[4].muted).toBe(false);
			await d.click('key.arrange');
			await scene(d, 2);
			await d.click('key.mix');
			expect(page(d, 'mix').strips[1]).toMatchObject({ level: 70 / 99, pan: 0 });
			expect(page(d, 'mix').strips[4].muted).toBe(true);
		});

		it('reaches scenes 10–99 with the last black key, then the number, shown as it is typed', async () => {
			const d = await start();
			await d.click('key.arrange');
			await d.withShift(async () => {
				await d.click(accidental(0));
				expect(page(d, 'arrange').scene).toBe('--');
				await d.click(accidental(4));
				expect(page(d, 'arrange').scene).toBe('4-');
				await d.click(accidental(2));
			});
			expect(d.screen()).toBe('arrange, scene 42, instrument tracks, T1 pattern 1 of 1');
			await scene(d, 99);
			expect(page(d, 'arrange').scene).toBe('99');
		});

		it('takes the two digits without shift as well (ours: the guide does not say)', async () => {
			const d = await start();
			await d.click('key.arrange');
			await d.withShift(() => d.click(accidental(0)));
			await d.clicks(accidental(1), accidental(7));
			expect(page(d, 'arrange').scene).toBe('17');
		});

		it('drops a number left half typed when another key is pressed (ours)', async () => {
			const d = await start();
			await d.click('key.arrange');
			await scene(d, 3);
			await d.withShift(() => d.clicks(accidental(0), accidental(2)));
			await d.click(track(2));
			expect(page(d, 'arrange').scene).toBe('3');
		});

		it('clones the scene with shift + M1 into the next free scene (ours: the guide says only “clone”)', async () => {
			const d = await start();
			await d.clicks('key.arrange', NEW); // T1 on pattern 2
			await d.withShift(() => d.click('key.m1'));
			expect(d.screen()).toBe('arrange, scene 2, instrument tracks, T1 pattern 2 of 2');
			await scene(d, 3); // scene 3 is in use now too
			await scene(d, 1);
			await d.withShift(() => d.click('key.m1'));
			expect(page(d, 'arrange').scene).toBe('4');
		});

		it('copies a scene with shift + M2 and pastes it over another with shift + M3 (OS 1.0.45)', async () => {
			const d = await start();
			await d.clicks('key.arrange', NEW); // scene 1: T1 on pattern 2 …
			await d.click(track(3));
			await d.push(4); // … and T3 muted
			await d.withShift(() => d.click('key.m2'));
			await scene(d, 5);
			await d.push(4); // scene 5: T3 unmuted …
			await d.click(track(1));
			await d.turn(4, -1); // … and T1 on pattern 1
			expect(d.screen()).toBe('arrange, scene 5, instrument tracks, T1 pattern 1 of 2');
			await d.withShift(() => d.click('key.m3'));
			expect(d.screen()).toBe('arrange, scene 5, instrument tracks, T1 pattern 2 of 2');
			expect(page(d, 'arrange').columns[2].muted).toBe(true);
		});

		it('resets the scene with shift + M4: every track back on pattern 1, the other scenes untouched', async () => {
			const d = await start();
			await d.clicks('key.arrange', NEW, NEW); // T1 on pattern 3
			await d.clicks('key.arrange', track(6), NEW); // tape on pattern 2
			await d.click('key.arrange');
			await scene(d, 2);
			await d.withShift(() => d.click('key.m4'));
			expect(d.screen()).toBe('arrange, scene 2, instrument tracks, T1 pattern 1 of 3');
			await d.click('key.arrange');
			expect(d.screen()).toBe('arrange, scene 2, auxiliary tracks, tape pattern 1 of 2');
			await d.click('key.arrange');
			await scene(d, 1);
			expect(d.screen()).toBe('arrange, scene 1, instrument tracks, T1 pattern 3 of 3');
		});

		it('leaves the scene’s mix alone on a reset (ours: the guide names only the patterns)', async () => {
			const d = await start();
			await d.clicks('key.arrange', NEW, track(2));
			await d.push(4); // T2 muted
			await d.withShift(() => d.click('key.m4'));
			expect(d.screen()).toBe('arrange, scene 1, instrument tracks, T2 pattern 1 of 1, muted');
			expect(page(d, 'arrange').columns[0].pattern).toBe(1);
		});

		it('labels M1–M4 clone, copy, paste, reset while shift is held (ours: no art shows it)', async () => {
			const d = await start();
			await d.click('key.arrange');
			await d.withShift(async () => {
				expect(page(d, 'arrange').soft.map((l) => l?.text)).toEqual([
					'clone',
					'copy',
					'paste',
					'reset'
				]);
			});
			expect(page(d, 'arrange').soft.map((l) => l?.text)).toEqual([
				'new',
				'copy',
				'paste',
				'clear'
			]);
		});

		it('spells the scene on the black keys while shift is held (ours)', async () => {
			const d = await start();
			await d.click('key.arrange');
			await scene(d, 12);
			expect(d.lit()).toEqual([]);
			await d.withShift(async () => {
				expect(d.lit()).toEqual(['fs3', 'gs3']); // the black keys 1 and 2
			});
		});
	});

	describe('16.3 queue scene', () => {
		it('switches scenes at once by default, playing too, and the playhead keeps its place (ours)', async () => {
			const d = await start();
			await d.clicks('key.arrange', NEW); // scene 1: T1 on pattern 2
			await scene(d, 2);
			await d.turn(4, -1); // scene 2: T1 on pattern 1
			await scene(d, 1);
			await d.click('key.play');
			await run(d, 4);
			const before = d.state.transport.position;
			await scene(d, 2);
			expect(d.screen()).toBe('arrange, scene 2, instrument tracks, T1 pattern 1 of 2');
			expect(d.state.transport.playing).toBe(true);
			expect(d.state.transport.position).toBeGreaterThan(before);
			await d.click('key.stop');
		});

		it('queues a scene with shift held, a tap on play, then its black key: it waits for the scene’s end', async () => {
			const d = await start();
			await d.click('key.arrange');
			await sequence(d, 1, [1, 5, 9, 13]);
			await d.click(NEW);
			await sequence(d, 1, [3, 7, 11, 15]); // scene 1: T1 on pattern 2
			await scene(d, 3);
			await d.turn(4, -1); // scene 3: T1 on pattern 1
			await scene(d, 1);
			await d.click('key.play');
			await run(d, 2);
			await d.withShift(() => d.clicks('key.play', accidental(3)));
			expect(d.state.transport.playing).toBe(true);
			expect(d.state.transport.position).toBeGreaterThan(5); // the tap on play did not start over
			expect(page(d, 'arrange')).toMatchObject({ scene: '1', queued: '3' });
			expect(d.screen()).toBe(
				'arrange, scene 1, scene 3 next, instrument tracks, T1 pattern 2 of 2'
			);
			await playTo(d, 15.5);
			expect(page(d, 'arrange').scene).toBe('1');
			expect([d.led(step(9)), d.led(step(11))]).toEqual(['off', 'white']);
			await run(d, 1);
			expect(page(d, 'arrange')).toMatchObject({ scene: '3', queued: null });
			// the new scene starts on its first step
			expect(d.state.transport.position).toBeLessThan(1);
			expect([d.led(step(9)), d.led(step(11))]).toEqual(['white', 'off']);
			await d.click('key.stop');
		});

		it('shows an empty box beside the scene while shift + play waits for the black key (ours)', async () => {
			const d = await start();
			await d.clicks('key.arrange', 'key.play');
			await d.withShift(async () => {
				await d.click('key.play');
				expect(page(d, 'arrange').queued).toBe('');
				await d.click(accidental(4));
				expect(page(d, 'arrange').queued).toBe('4');
			});
			await d.click('key.stop');
		});

		it('queues scenes 10–99 too', async () => {
			const d = await start();
			await d.clicks('key.arrange', 'key.play');
			await d.withShift(async () => {
				await d.clicks('key.play', accidental(0), accidental(2));
				expect(page(d, 'arrange').queued).toBe('2-');
				await d.click(accidental(7));
			});
			expect(page(d, 'arrange')).toMatchObject({ scene: '1', queued: '27' });
			await playTo(d, 16.5);
			expect(page(d, 'arrange').scene).toBe('27');
			await d.click('key.stop');
		});

		it('lights a queued scene’s black keys red while shift is held (ours)', async () => {
			const d = await start();
			await d.clicks('key.arrange', 'key.play');
			await d.withShift(async () => {
				await d.clicks('key.play', accidental(6));
				expect(d.led(accidental(6))).toBe('red');
				expect(d.led(accidental(1))).toBe('white'); // the scene playing
			});
			await d.click('key.stop');
		});

		it('switches a queued scene at once when nothing plays (ours: there is no end to wait for)', async () => {
			const d = await start();
			await d.click('key.arrange');
			await d.withShift(() => d.clicks('key.play', accidental(5)));
			expect(d.state.transport.playing).toBe(false);
			expect(page(d, 'arrange')).toMatchObject({ scene: '5', queued: null });
		});

		it('forgets the queued scene on stop (ours)', async () => {
			const d = await start();
			await d.clicks('key.arrange', 'key.play');
			await d.withShift(() => d.clicks('key.play', accidental(2)));
			await d.click('key.stop');
			expect(page(d, 'arrange')).toMatchObject({ scene: '1', queued: null });
			await d.click('key.play');
			await playTo(d, 16.5);
			expect(page(d, 'arrange').scene).toBe('1');
			await d.click('key.stop');
		});
	});

	describe('16.3 how long a scene lasts', () => {
		it('lasts as long as its longest pattern: a queued scene waits out a two-bar pattern', async () => {
			const d = await start();
			await d.click(step(1)); // T1: one bar
			await d.click(track(3));
			await d.holding('key.bar', () => d.click('key.plus')); // T3: two bars
			await d.click(step(1));
			await d.clicks('key.arrange', 'key.play');
			await d.withShift(() => d.clicks('key.play', accidental(2)));
			await playTo(d, 16.5);
			expect(page(d, 'arrange')).toMatchObject({ scene: '1', queued: '2' });
			await playTo(d, 31.5);
			expect(page(d, 'arrange').scene).toBe('1');
			await run(d, 1);
			expect(page(d, 'arrange')).toMatchObject({ scene: '2', queued: null });
			await d.click('key.stop');
		});

		it('counts a pattern’s track scale: one bar at scale 2 lasts two', async () => {
			const d = await start();
			await d.click(step(1));
			await d.holding('key.bar', () => d.click(accidental(2)));
			await d.clicks('key.arrange', 'key.play');
			await d.withShift(() => d.clicks('key.play', accidental(2)));
			await playTo(d, 31.5);
			expect(page(d, 'arrange').scene).toBe('1');
			await run(d, 1);
			expect(page(d, 'arrange').scene).toBe('2');
			await d.click('key.stop');
		});

		it('leaves tracks without notes out of the length (ours: an untouched track does not stretch it)', async () => {
			const d = await start();
			await d.click(step(1));
			await d.holding('key.bar', () => d.click(step(12))); // T1 plays 12 steps
			await d.clicks('key.arrange', 'key.play');
			await d.withShift(() => d.clicks('key.play', accidental(2)));
			await playTo(d, 11.5);
			expect(page(d, 'arrange').scene).toBe('1');
			await run(d, 1);
			expect(page(d, 'arrange').scene).toBe('2');
			await d.click('key.stop');
		});

		it('follows the project’s scene length setting: in time signature mode a bar of it (ours: one bar)', async () => {
			const d = await start();
			await d.click(step(1));
			await d.clicks('key.project', 'key.m4'); // the project's settings
			await d.turn(2, 2); // general: scene length
			await d.turn(3, 1);
			expect(d.screen()).toBe('project settings: general, scene length, time signature');
			await d.turn(1, 1); // tempo: the signature
			await d.turn(3, -1);
			expect(d.screen()).toBe('project settings: tempo, signature, 3/4');
			await d.clicks('key.m1', 'key.arrange', 'key.play');
			await d.withShift(() => d.clicks('key.play', accidental(2)));
			await playTo(d, 11.5);
			expect(page(d, 'arrange').scene).toBe('1');
			await run(d, 1);
			expect(page(d, 'arrange').scene).toBe('2');
			await d.click('key.stop');
		});

		it('plays a scene round and round while nothing is queued, the step keys chasing', async () => {
			const d = await start();
			await d.clicks(step(1), step(9), 'key.arrange', 'key.play');
			await playTo(d, 3 * 16 + 4.5); // three times round, the playhead on step 5
			expect(page(d, 'arrange').scene).toBe('1');
			expect(d.steps()).toBe('w...w...w.......');
			await d.click('key.stop');
			expect(d.steps()).toBe('w.......w.......');
		});
	});

	describe('16.4 song mode', () => {
		it('opens with shift + arrange in arrange mode and closes with arrange', async () => {
			const d = await start();
			await d.click('key.arrange');
			await d.withShift(() => d.click('key.arrange'));
			// ours: a new project's songs hold scene 1 and loop, as its project file does
			expect(d.screen()).toBe('song 1, looping: 1 scene, cursor at 2');
			expect(entries(d)).toEqual(['1']);
			await d.click('key.arrange');
			expect(d.screen()).toBe('arrange, scene 1, instrument tracks, T1 pattern 1 of 1');
		});

		it('keys scenes in with shift + the black keys, one after another like a phone number', async () => {
			const d = await start();
			await d.click('key.arrange');
			await emptySong(d);
			expect(d.screen()).toBe('song 1, looping: 0 scenes, cursor at 1');
			await d.withShift(() => sceneKeys(d, 1));
			await d.withShift(() => d.clicks(accidental(2), accidental(2), accidental(3)));
			expect(entries(d)).toEqual(['1', '2', '2', '3']);
			expect(d.screen()).toBe('song 1, looping: 4 scenes, cursor at 5');
			expect(page(d, 'song').count).toBe('05');
		});

		it('takes scenes only with shift held (OS 1.1.0): a black key alone just plays', async () => {
			const d = await start();
			await d.click('key.arrange');
			await emptySong(d);
			await d.click(accidental(5));
			expect(entries(d)).toEqual([]);
		});

		it('keys scenes 10–99 with the last black key and two digits, shown where they go', async () => {
			const d = await start();
			await d.click('key.arrange');
			await emptySong(d);
			await d.withShift(async () => {
				await d.clicks(accidental(1), accidental(0), accidental(9));
				expect(entries(d)).toEqual(['1', '9-']);
				await d.click(accidental(9));
			});
			expect(entries(d)).toEqual(['1', '99']);
		});

		it('clears the song with shift + M1 but leaves the scenes themselves', async () => {
			const d = await start();
			await d.clicks('key.arrange', NEW); // scene 1: T1 on pattern 2
			await scene(d, 2);
			await d.turn(4, -1); // scene 2: T1 on pattern 1
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(1), accidental(2)));
			await d.withShift(() => d.click('key.m1'));
			expect(d.screen()).toBe('song 1, looping: 0 scenes, cursor at 1');
			await d.click('key.arrange');
			await scene(d, 1);
			expect(d.screen()).toContain('T1 pattern 2 of 2');
			await scene(d, 2);
			expect(d.screen()).toContain('T1 pattern 1 of 2');
		});

		it('moves a cursor with shift + M2 / M3, and scenes keyed go in at the cursor', async () => {
			const d = await start();
			await d.click('key.arrange');
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(1), accidental(2), accidental(3)));
			await d.withShift(() => d.clicks('key.m2', 'key.m2'));
			expect(page(d, 'song')).toMatchObject({ count: '02', cursor: 1 });
			await d.withShift(() => d.click(accidental(9)));
			expect(entries(d)).toEqual(['1', '9', '2', '3']);
			await d.withShift(() => d.clicks('key.m3', 'key.m3', 'key.m3'));
			expect(d.screen()).toBe('song 1, looping: 4 scenes, cursor at 5');
		});

		it('deletes a scene from the song with shift + M4 (ours: the one before the cursor), not from the project', async () => {
			const d = await start();
			await d.clicks('key.arrange', NEW); // scene 1: T1 on pattern 2
			await scene(d, 2);
			await d.turn(4, -1); // scene 2: T1 on pattern 1
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(1), accidental(2), accidental(1)));
			await d.withShift(() => d.clicks('key.m2', 'key.m4'));
			expect(entries(d)).toEqual(['1', '1']);
			expect(d.screen()).toBe('song 1, looping: 2 scenes, cursor at 2');
			await d.click('key.m4'); // without shift nothing goes
			expect(entries(d)).toEqual(['1', '1']);
			await d.click('key.arrange');
			await scene(d, 2);
			expect(d.screen()).toContain('T1 pattern 1 of 2');
		});

		it('holds up to 96 scenes in a song', async () => {
			const d = await start();
			await d.click('key.arrange');
			await emptySong(d);
			await d.withShift(async () => {
				for (let i = 0; i < 100; i++) await d.click(accidental((i % 9) + 1), 40);
			});
			expect(page(d, 'song').length).toBe(96);
			expect(page(d, 'song').first).toBe(73); // scrolled to keep the cursor in view
		});

		it('switches looping off and on with the dark grey encoder', async () => {
			const d = await start();
			await d.click('key.arrange');
			await d.withShift(() => d.click('key.arrange'));
			await d.turn(1, -1);
			expect(d.screen()).toBe('song 1: 1 scene, cursor at 2');
			expect(page(d, 'song').loop).toBe(false);
			await d.turn(1, 1);
			expect(d.screen()).toBe('song 1, looping: 1 scene, cursor at 2');
			await d.push(1); // ours: a push toggles it
			expect(page(d, 'song').loop).toBe(false);
		});

		it('picks one of 14 songs with shift + a white key, each with its own order', async () => {
			const d = await start();
			await d.click('key.arrange');
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(4), accidental(4)));
			await d.withShift(() => d.click(natural(3)));
			expect(d.screen()).toBe('song 3, looping: 1 scene, cursor at 2');
			await d.withShift(() => d.clicks(accidental(7)));
			await d.withShift(() => d.click(natural(14)));
			expect(page(d, 'song').song).toBe(14);
			await d.withShift(() => d.click(natural(1)));
			expect(entries(d)).toEqual(['4', '4']);
			await d.withShift(() => d.click(natural(3)));
			expect(entries(d)).toEqual(['1', '7']);
		});

		it('comes back to the song used last when song mode opens again (OS 1.0.32)', async () => {
			const d = await start();
			await d.click('key.arrange');
			await d.withShift(() => d.click('key.arrange'));
			await d.withShift(() => d.click(natural(5)));
			await d.clicks('key.arrange', 'key.mix', 'key.arrange');
			await d.withShift(() => d.click('key.arrange'));
			expect(page(d, 'song').song).toBe(5);
		});

		it('copies a song with shift, its white key held and M2, and pastes it onto another with M3', async () => {
			const d = await start();
			await d.click('key.arrange');
			await emptySong(d);
			await d.withShift(async () => {
				await d.clicks(accidental(7), accidental(8));
				await d.holding(natural(1), async () => {
					expect(page(d, 'song').soft.map((l) => l?.text)).toEqual([
						'clear all',
						'copy',
						'paste',
						'delete'
					]);
					await d.click('key.m2');
				});
				await d.holding(natural(3), () => d.click('key.m3'));
			});
			expect(page(d, 'song').song).toBe(3);
			expect(entries(d)).toEqual(['7', '8']);
			await d.withShift(() => d.click(natural(1)));
			expect(entries(d)).toEqual(['7', '8']);
		});

		it('shows arrows over M2 and M3 for the cursor (TE’s art)', async () => {
			const d = await start();
			await d.click('key.arrange');
			await d.withShift(() => d.click('key.arrange'));
			expect(page(d, 'song').soft.map((l) => l?.icon ?? l?.text)).toEqual([
				'clear all',
				'arrange.left',
				'arrange.right',
				'delete'
			]);
		});

		it('lights the current song’s white key while shift is held (ours)', async () => {
			const d = await start();
			await d.click('key.arrange');
			await d.withShift(() => d.click('key.arrange'));
			await d.withShift(async () => {
				await d.click(natural(4));
				expect(d.led(natural(4))).toBe('white');
			});
			expect(d.led(natural(4))).toBe('off');
		});
	});

	describe('16.4 song playback', () => {
		it('plays the song from its first scene, each scene for its length, the step keys following', async () => {
			const d = await start();
			await threeScenes(d);
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(2), accidental(3), accidental(1)));
			await d.click('key.play');
			expect(d.screen()).toBe('song 1, looping: 3 scenes, cursor at 4, playing');
			expect([ring(d), shown(d)]).toEqual([0, 2]);
			await playTo(d, 15.5);
			expect([ring(d), shown(d)]).toEqual([0, 2]);
			await run(d, 1);
			expect([ring(d), shown(d)]).toEqual([1, 3]);
			expect(d.state.transport.position).toBeLessThan(1); // every scene from its first step
			await playTo(d, 15.5);
			await run(d, 1);
			expect([ring(d), shown(d)]).toEqual([2, 1]);
			await d.click('key.stop');
			expect(d.screen()).toBe('song 1, looping: 3 scenes, cursor at 4');
		});

		it('plays each scene of the song for its own length: a two-bar scene lasts two bars', async () => {
			const d = await start();
			await threeScenes(d);
			await scene(d, 2);
			await d.click('key.instrument');
			await d.holding('key.bar', () => d.click('key.plus')); // scene 2's pattern: two bars
			await d.click('key.arrange');
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(2), accidental(3)));
			await d.click('key.play');
			await playTo(d, 15.5);
			expect([ring(d), shown(d)]).toEqual([0, 2]);
			await playTo(d, 31.5);
			// still scene 2, the step keys on its (empty) second bar with the playhead
			expect([ring(d), shown(d)]).toEqual([0, 0]);
			await run(d, 1);
			expect([ring(d), shown(d)]).toEqual([1, 3]);
			await d.click('key.stop');
		});

		it('starts from the first scene wherever the cursor stands (ours)', async () => {
			const d = await start();
			await threeScenes(d);
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(2), accidental(3), 'key.m2'));
			await d.click('key.play');
			expect([ring(d), shown(d)]).toEqual([0, 2]);
			await d.click('key.stop');
		});

		it('goes back to the first scene after the last while looping', async () => {
			const d = await start();
			await threeScenes(d);
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(3), accidental(2)));
			await d.click('key.play');
			await playTo(d, 15.5);
			await run(d, 1);
			expect([ring(d), shown(d)]).toEqual([1, 2]);
			await playTo(d, 15.5);
			await run(d, 1);
			expect([ring(d), shown(d)]).toEqual([0, 3]);
			expect(d.state.transport.playing).toBe(true);
			await d.click('key.stop');
		});

		it('stops at the end when not looping (ours: the stop at the song’s end of OS 1.0.45)', async () => {
			const d = await start();
			await threeScenes(d);
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(3), accidental(2)));
			await d.turn(1, -1);
			await d.click('key.play');
			await playTo(d, 15.5);
			await run(d, 1);
			await playTo(d, 15.5);
			expect(d.state.transport.playing).toBe(true);
			await run(d, 1);
			expect(d.state.transport.playing).toBe(false);
			expect(d.screen()).toBe('song 1: 2 scenes, cursor at 3');
			// stopped on the last scene, scene 2 (ours): its pattern and no playhead
			expect(d.steps()).toBe('.....w..........');
		});

		it('cues a later scene with shift + [+] and jumps there when the scene ends', async () => {
			const d = await start();
			await threeScenes(d);
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(1), accidental(2), accidental(3)));
			await d.click('key.play');
			await d.withShift(() => d.clicks('key.plus', 'key.plus'));
			expect(page(d, 'song').slots[2]?.cued).toBe(true);
			await playTo(d, 15.5);
			expect([ring(d), shown(d)]).toEqual([0, 1]);
			await run(d, 1);
			expect([ring(d), shown(d)]).toEqual([2, 3]);
			await d.click('key.stop');
		});

		it('cues back with shift + [-]', async () => {
			const d = await start();
			await threeScenes(d);
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(1), accidental(2), accidental(3)));
			await d.click('key.play');
			await playTo(d, 15.5);
			await run(d, 1); // entry 2
			await d.withShift(() => d.click('key.minus'));
			expect(page(d, 'song').slots[0]?.cued).toBe(true);
			await playTo(d, 15.5);
			await run(d, 1);
			expect([ring(d), shown(d)]).toEqual([0, 1]);
			await d.click('key.stop');
		});

		it('starts the song over from its first scene when play is pressed again (ours)', async () => {
			const d = await start();
			await threeScenes(d);
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(1), accidental(2)));
			await d.click('key.play');
			await playTo(d, 16.5);
			expect(ring(d)).toBe(1);
			await d.click('key.play');
			expect([ring(d), shown(d)]).toEqual([0, 1]);
			expect(d.state.transport.position).toBeLessThan(2);
			await d.click('key.stop');
		});

		it('moves on to another song chosen while one plays, from its first scene, when the scene ends (ours)', async () => {
			const d = await start();
			await threeScenes(d);
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(1), accidental(2)));
			await d.withShift(() => d.clicks(natural(2), 'key.m1', accidental(3)));
			await d.withShift(() => d.click(natural(1)));
			await d.click('key.play');
			await d.withShift(() => d.click(natural(2)));
			expect(d.screen()).toBe('song 2, looping: 1 scene, cursor at 2, playing');
			await playTo(d, 15.5);
			expect(shown(d)).toBe(1); // song 1's first scene plays on
			await run(d, 1);
			expect([ring(d), shown(d)]).toEqual([0, 3]);
			await d.click('key.stop');
		});

		it('keeps the playing scene playing when scenes are keyed in before it (ours)', async () => {
			const d = await start();
			await threeScenes(d);
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(1), accidental(2)));
			await d.click('key.play');
			await playTo(d, 16.5); // entry 2: scene 2
			await d.withShift(() => d.clicks('key.m2', 'key.m2', accidental(3)));
			expect(entries(d)).toEqual(['3', '1', '2']);
			await playTo(d, 8.5); // the playhead past the steps that tell the patterns apart
			expect([ring(d), shown(d)]).toEqual([2, 2]);
			await d.click('key.stop');
		});

		it('cues nothing while the song is stopped (ours)', async () => {
			const d = await start();
			await threeScenes(d);
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(1), accidental(2), 'key.plus'));
			expect(page(d, 'song').slots.some((slot) => slot?.cued)).toBe(false);
		});

		it('keeps the song going in other modes; stop ends it', async () => {
			const d = await start();
			await threeScenes(d);
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(1), accidental(3)));
			await d.clicks('key.play', 'key.mix');
			await playTo(d, 16.5);
			expect(d.state.areas.arrange.scene).toBe(2); // scene 3
			expect(shown(d)).toBe(3);
			await d.click('key.stop');
			await d.click('key.arrange'); // the song page again
			expect(d.screen()).toBe('song 1, looping: 2 scenes, cursor at 3');
		});

		it('plays one scene round and round when play is pressed outside song mode (ours)', async () => {
			const d = await start();
			await threeScenes(d);
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(2), accidental(3)));
			await d.click('key.arrange'); // back to the tracks: scene 1
			await d.click('key.play');
			await playTo(d, 16.5);
			expect(page(d, 'arrange').scene).toBe('1');
			await d.click('key.stop');
		});

		it('shows the song’s scene in the red box when the tracks are looked at while it plays', async () => {
			const d = await start();
			await threeScenes(d);
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(3), accidental(2)));
			await d.click('key.play');
			await d.click('key.arrange');
			expect(d.screen()).toBe('arrange, scene 3, instrument tracks, T1 pattern 3 of 3');
			await playTo(d, 16.5);
			expect(d.screen()).toBe('arrange, scene 2, instrument tracks, T1 pattern 2 of 3');
			await d.click('key.stop');
		});
	});

	describe('12.2 creating a song', () => {
		it('sequences the tracks, arranges patterns into scenes, then plays the scenes as a song', async () => {
			const d = await start();
			// a beat on T1 and a bass line on T3, in instrument mode
			await d.clicks(step(1), step(5), step(9), step(13));
			await d.clicks(track(3), step(1), step(9));
			// arrange: scene 2 starts as a copy of scene 1; T3 gets a new pattern there
			await d.click('key.arrange');
			await scene(d, 2);
			await d.click(NEW);
			await sequence(d, 3, [1, 3, 5, 7, 9, 11, 13, 15]);
			expect(d.screen()).toBe('arrange, scene 2, instrument tracks, T3 pattern 2 of 2');
			// song mode: scene 1 twice, then scene 2
			await emptySong(d);
			await d.withShift(() => d.clicks(accidental(1), accidental(1), accidental(2)));
			expect(d.screen()).toBe('song 1, looping: 3 scenes, cursor at 4');
			await d.click('key.play');
			// the step keys show T3: scene 1's bass on steps 1 and 9
			expect([d.led(step(3)), d.led(step(9))]).toEqual(['off', 'white']);
			await playTo(d, 15.5);
			await run(d, 1);
			expect(ring(d)).toBe(1);
			expect([d.led(step(3)), d.led(step(9))]).toEqual(['off', 'white']);
			await playTo(d, 15.5);
			await run(d, 1);
			expect(ring(d)).toBe(2);
			expect([d.led(step(3)), d.led(step(9))]).toEqual(['white', 'white']);
			// round again: scene 1
			await playTo(d, 15.5);
			await run(d, 1);
			expect(ring(d)).toBe(0);
			expect(d.led(step(3))).toBe('off');
			await d.click('key.stop');
			// and the beat on T1 played all along
			await d.click('key.arrange');
			await d.click(track(1));
			expect(d.steps()).toBe('w...w...w...w...');
		});
	});

	describe('17 mix mode', () => {
		it('opens with the mix key on M1: the eight instrument strips, T1 lit white', async () => {
			const d = await start();
			await d.click('key.mix');
			expect(d.screen()).toBe('mix, instrument track 1');
			expect(page(d, 'mix').strips).toHaveLength(8);
			expect(tracks(d)).toBe('w.......');
		});

		it('picks the track to mix with its key', async () => {
			const d = await start();
			await d.clicks('key.mix', track(6));
			expect(d.screen()).toBe('mix, instrument track 6');
			expect(tracks(d)).toBe('.....w..');
		});

		it('flips to the auxiliary tracks with mix pressed again, lit red, and back', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.mix');
			expect(d.screen()).toBe('mix, auxiliary track 1');
			expect(tracks(d)).toBe('r.......');
			await d.click(track(7));
			expect(d.screen()).toBe('mix, auxiliary track 7');
			expect(tracks(d)).toBe('......r.');
			await d.click('key.mix');
			expect(d.screen()).toBe('mix, instrument track 1');
		});

		it('comes back to the strips from the master pages with M1', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.m4', 'key.m1');
			expect(d.screen()).toBe('mix, instrument track 1');
		});
	});

	describe('17.1 levels, pans and sends', () => {
		it('sets the chosen track’s level with the white encoder: its bar moves, no other', async () => {
			const d = await start();
			await d.clicks('key.mix', track(3));
			const before = page(d, 'mix').strips.map((s) => s.level);
			await d.turn(4, -20);
			const after = page(d, 'mix').strips.map((s) => s.level);
			expect(after[2]).toBeLessThan(before[2]);
			expect(after.filter((_, i) => i !== 2)).toEqual(before.filter((_, i) => i !== 2));
			await d.turn(4, 200); // ours: 0–99, a new project's tracks at 80
			expect(page(d, 'mix').strips[2].level).toBe(1);
		});

		it('pans with the light grey encoder and centres it with a push', async () => {
			const d = await start();
			await d.clicks('key.mix', track(3));
			await d.turn(3, 10);
			expect(page(d, 'mix').strips[2].pan).toBeGreaterThan(0);
			await d.turn(3, -25);
			expect(page(d, 'mix').strips[2].pan).toBeLessThan(0);
			await d.push(3);
			expect(page(d, 'mix').strips[2].pan).toBe(0);
		});

		it('pans in whole steps, or finer pushed in (ours: 2 and 1 of ±100)', async () => {
			const d = await start();
			await d.click('key.mix');
			await d.turn(3, 3);
			expect(page(d, 'mix').strips[0].pan).toBeCloseTo(0.06, 9);
			await d.turn(3, 3, { fine: true });
			expect(page(d, 'mix').strips[0].pan).toBeCloseTo(0.09, 9);
		});

		it('sends to FX I and FX II with the dark and mid grey encoders: the track’s send page shows it', async () => {
			const d = await start();
			await d.clicks('key.mix', track(3));
			await d.turn(1, 20);
			await d.turn(2, 10);
			await d.clicks('key.instrument', 'key.m3');
			await d.withShift(async () => {
				expect(d.screen()).toBe('sends: aux 00, tape 00, fx I 20, fx II 10');
			});
		});

		it('levels and pans the auxiliary tracks too', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.mix', track(6)); // tape
			await d.turn(4, -30);
			await d.turn(3, -5);
			expect(page(d, 'mix').strips[5]).toMatchObject({ level: 50 / 99, pan: -0.1 });
			await d.click('key.mix'); // the instrument tracks keep theirs
			expect(page(d, 'mix').strips[5]).toMatchObject({ level: 80 / 99, pan: 0 });
		});

		// bug in src/lib/sim/opxy-sim.svelte.ts: mix M1's E1 / E2 (`#turnMix`) set only instrument
		// tracks' sends; on an auxiliary track with sends (external audio and tape send to FX I and II,
		// FX I on to FX II: its own M3 shift page) they do nothing
		it.skip('sends an auxiliary track to FX I and FX II too, as its own send page shows', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.mix', track(5)); // external audio
			await d.turn(1, 20);
			await d.turn(2, 10);
			await d.clicks('key.auxiliary', track(5), 'key.m3');
			await d.withShift(async () => {
				expect(d.screen()).toBe('sends: tape 00, fx I 20, fx II 10');
			});
		});

		it('keeps every track’s own level and pan while the track keys move between them', async () => {
			const d = await start();
			await d.clicks('key.mix', track(2));
			await d.turn(4, -10);
			await d.click(track(4));
			await d.turn(4, 5);
			await d.turn(3, 5);
			const strips = page(d, 'mix').strips;
			expect(strips.map((s) => Math.round(s.level * 99))).toEqual([80, 70, 80, 85, 80, 80, 80, 80]);
			expect(strips.map((s) => s.pan)).toEqual([0, 0, 0, 0.1, 0, 0, 0, 0]);
		});
	});

	describe('17.1 mute and solo', () => {
		it('mutes and unmutes with shift + a track key; with shift held the unmuted tracks light white', async () => {
			const d = await start();
			await d.click('key.mix');
			await d.withShift(async () => {
				expect(tracks(d)).toBe('wwwwwwww');
				await d.clicks(track(2), track(5));
				expect(tracks(d)).toBe('w.ww.www');
			});
			// shift up: the chosen track again, which the mutes did not change
			expect(tracks(d)).toBe('w.......');
			expect(page(d, 'mix').strips.map((s) => s.muted)).toEqual([
				false,
				true,
				false,
				false,
				true,
				false,
				false,
				false
			]);
			await d.withShift(() => d.click(track(2)));
			expect(page(d, 'mix').strips[1].muted).toBe(false);
		});

		it('lights the unmuted auxiliary tracks red while shift is held', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.mix');
			await d.withShift(async () => {
				await d.click(track(8));
				expect(tracks(d)).toBe('rrrrrrr.');
			});
			expect(d.state.aux[7].mix.muted).toBe(true);
			expect(d.state.tracks[7].mix.muted).toBe(false);
		});

		it('mutes the chosen track with a push of the white encoder', async () => {
			const d = await start();
			await d.clicks('key.mix', track(3));
			await d.push(4);
			expect(page(d, 'mix').strips[2].muted).toBe(true);
			await d.withShift(async () => {
				expect(tracks(d)).toBe('ww.wwwww');
			});
			await d.push(4);
			expect(page(d, 'mix').strips[2].muted).toBe(false);
		});

		it('mutes notes: a muted track’s bar stops moving while its steps go by', async () => {
			const d = await start();
			await d.clicks(...[1, 3, 5, 7, 9, 11, 13, 15].map(step)); // T1 on every eighth
			await d.clicks('key.mix', 'key.play');
			expect(page(d, 'mix').strips[0].meter).toBeGreaterThan(0);
			await d.push(4);
			await run(d, 2);
			expect(page(d, 'mix').strips[0].meter).toBe(0);
			expect(d.led(step(9))).toBe('white'); // the sequence is all there
			await d.push(4);
			await run(d, 2);
			expect(page(d, 'mix').strips[0].meter).toBeGreaterThan(0);
			await d.click('key.stop');
		});

		it('solos a held track key: the other tracks’ bars go still until it is let go', async () => {
			const d = await start();
			await d.clicks(step(1), step(5), step(9), step(13)); // T1
			await d.clicks(track(3), step(1), step(5), step(9), step(13)); // T3
			await d.clicks('key.mix', 'key.play');
			await d.down(track(3));
			await playTo(d, 4.5); // just after the hits on step 5
			let strips = page(d, 'mix').strips;
			expect(strips[2].meter).toBeGreaterThan(0);
			expect(strips[0].meter).toBe(0);
			await d.up(track(3));
			await playTo(d, 8.5);
			strips = page(d, 'mix').strips;
			expect(strips[0].meter).toBeGreaterThan(0);
			expect(strips[2].meter).toBeGreaterThan(0);
			await d.click('key.stop');
		});

		it('solos several track keys held together', async () => {
			const d = await start();
			for (const t of [1, 3, 4]) await d.clicks(track(t), step(1), step(9));
			await d.clicks('key.mix', 'key.play');
			await d.down(track(1));
			await d.down(track(4));
			await playTo(d, 8.5);
			const strips = page(d, 'mix').strips;
			expect([strips[0].meter, strips[3].meter].every((m) => m > 0)).toBe(true);
			expect(strips[2].meter).toBe(0);
			await d.up(track(4));
			await d.up(track(1));
			await d.click('key.stop');
		});

		it('mutes with instrument held and a track key (ours: the instrument key opens instrument mode as it goes down)', async () => {
			const d = await start();
			await d.click('key.mix');
			await d.holding('key.instrument', () => d.click(track(4)));
			expect(d.state.mode).toBe('instrument');
			await d.click('key.mix');
			await d.withShift(async () => {
				expect(tracks(d)).toBe('www.wwww');
			});
			expect(page(d, 'mix').strips[3].muted).toBe(true);
		});

		it('mutes auxiliary tracks with auxiliary held and a track key', async () => {
			const d = await start();
			await d.click('key.mix');
			await d.holding('key.auxiliary', () => d.click(track(2)));
			expect(d.state.aux[1].mix.muted).toBe(true);
			expect(d.state.tracks[1].mix.muted).toBe(false);
			await d.clicks('key.mix', 'key.mix'); // the auxiliary strips
			expect(page(d, 'mix').strips[1].muted).toBe(true);
		});

		it('hatches a muted track on the mix and the arrange pages alike', async () => {
			const d = await start();
			await d.click('key.mix');
			await d.withShift(() => d.click(track(6)));
			expect(page(d, 'mix').strips[5].muted).toBe(true);
			await d.click('key.arrange');
			expect(page(d, 'arrange').columns[5].muted).toBe(true);
		});
	});

	describe('17.2 eq', () => {
		it('opens the master EQ with M2: low, mid, high and blend', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.m2');
			// ours: flat, blend at half, as a new project file stores it
			expect(d.screen()).toBe('master eq: low 00, mid 00, high 00, blend 50');
		});

		it('boosts or cuts the lows, mids and highs with E1–E3 and blends them in with E4', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.m2');
			await d.turn(1, 12);
			await d.turn(2, -8);
			await d.turn(3, 5);
			await d.turn(4, 20);
			expect(d.screen()).toBe('master eq: low +12, mid –08, high +05, blend 70');
			const eq = page(d, 'mix-eq');
			expect(eq.bands).toEqual([12 / 50, -8 / 50, 5 / 50]);
			expect(eq.blend).toBeCloseTo(70 / 99, 9);
		});

		it('resets a band with a push of its encoder', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.m2');
			await d.turn(1, 12);
			await d.turn(2, -8);
			await d.turn(3, 5);
			await d.push(2);
			expect(values(d)).toEqual(['+12', '00', '+05', '50']);
			await d.push(1);
			await d.push(3);
			expect(values(d)).toEqual(['00', '00', '00', '50']);
		});

		it('resets every EQ value with a push of the white encoder (OS 1.1.15)', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.m2');
			await d.turn(1, -20);
			await d.turn(3, 30);
			await d.turn(4, -40);
			await d.push(4);
			expect(d.screen()).toBe('master eq: low 00, mid 00, high 00, blend 50');
		});

		it('is the master’s: the auxiliary tracks show the same EQ', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.m2');
			await d.turn(1, 9);
			await d.click('key.mix');
			expect(values(d)).toEqual(['+09', '00', '00', '50']);
		});

		it('stays as it is when the scene changes (ours: scenes keep the tracks’ mix, not the master’s)', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.m2');
			await d.turn(1, 9);
			await d.click('key.arrange');
			await scene(d, 2);
			await d.clicks('key.mix', 'key.m2');
			await d.turn(1, 1);
			await d.click('key.arrange');
			await scene(d, 1);
			await d.clicks('key.mix', 'key.m2');
			expect(values(d)).toEqual(['+10', '00', '00', '50']);
		});
	});

	describe('17.3 saturator', () => {
		it('opens the master saturator with M3: gain, clip, tone and mix', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.m3');
			// ours: a new project file's values
			expect(d.screen()).toBe('master saturator: gain 20, clip 20, tone 00, mix 00');
		});

		it('drives it with E1, clips with E2, tilts the tone with E3 and mixes it in with E4', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.m3');
			await d.turn(1, 30);
			await d.turn(2, 5);
			await d.turn(3, -12);
			await d.turn(4, 45);
			expect(values(d)).toEqual(['50', '25', '–12', '45']);
			const saturator = page(d, 'mix-saturator');
			expect(saturator.tone).toBeLessThan(0);
			expect(saturator.mix).toBeCloseTo(45 / 99, 9);
		});
	});

	describe('17.4 master', () => {
		it('opens the master page with M4: percussion, melodic, compressor and master level', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.m4');
			// ours: a new project file's values
			expect(d.screen()).toBe('master: percussion 50, melodic 50, compressor 10, master 50');
		});

		it('turns the group levels with E1 and E2, the compressor with E3, the master level with E4', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.m4');
			await d.turn(1, 20);
			await d.turn(2, -15);
			await d.turn(3, 30);
			await d.turn(4, 9);
			expect(values(d)).toEqual(['70', '35', '40', '59']);
		});

		it('routes the drum sampler to the percussion group, the synths and samplers to the melodic group', async () => {
			const d = await start();
			await d.clicks('key.mix', 'key.m4');
			// a new project: drums on T1–T2, synth engines and the multisampler on T3–T8
			expect(page(d, 'mix-master').groups).toEqual(['1 2', '3 4 5 6 7 8']);
		});

		it('moves a track to the percussion group by itself when its engine becomes the drum sampler', async () => {
			const d = await start();
			await d.click(track(3));
			await d.withShift(() => d.click('key.m1')); // the engine list
			await d.turn(1, -5);
			expect(d.screen()).toBe('drum');
			await d.push(1);
			await d.clicks('key.mix', 'key.m4');
			expect(page(d, 'mix-master').groups).toEqual(['1 2 3', '4 5 6 7 8']);
		});

		it('moves the percussion bar while the drums play, and the master with it', async () => {
			const d = await start();
			await d.clicks(step(1), step(5), step(9), step(13));
			await d.clicks('key.mix', 'key.m4', 'key.play');
			await playTo(d, 4.5);
			const [percussion, melodic, master] = page(d, 'mix-master').meters;
			expect(percussion).toBeGreaterThan(0);
			expect(melodic).toBe(0);
			expect(master).toBeGreaterThan(0);
			await d.click('key.stop');
			expect(page(d, 'mix-master').meters).toEqual([0, 0, 0]);
		});
	});

	describe('driver: time', () => {
		it('runs a one-bar scene in two seconds at 120 BPM', async () => {
			const d = await start();
			await d.clicks('key.arrange', 'key.play');
			await d.withShift(() => d.clicks('key.play', accidental(2)));
			const left = BAR_MS - d.state.transport.position * STEP_MS;
			await d.wait(left - STEP_MS / 2);
			expect(page(d, 'arrange').scene).toBe('1');
			await d.wait(STEP_MS);
			expect(page(d, 'arrange').scene).toBe('2');
			await d.click('key.stop');
		});
	});
}
