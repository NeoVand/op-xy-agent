/**
 * The project, COM, preset and sample chapters as the OP-XY does them: conformance cases written
 * from TE's guide (chapters 10 "project", 18 "sample", 19 "com" and 24 "te boot", the preset parts
 * of 14 "instrument" and the how-tos of 22 that use them; guide v1.1.15, reworded in
 * `knowledge/manual/units/{project,com,sampler,instrument}/*`), not from our code. Each case works
 * the machine the way a person does, with real press lengths and the computer's Shift key, and
 * checks what a person sees: the screen, its soft labels, the LED windows. The model is checked too
 * where the screen cannot tell (what a saved version holds, which file a key plays).
 *
 * The same cases run on the bare simulator (`system-sample.spec.ts`, Node) and on the app in a
 * browser, clicking the rendered replica (`src/lib/app/system-sample-conformance.svelte.spec.ts`),
 * so a bug in the wiring between them fails too.
 *
 * Where the guide leaves something open the case says "ours" and pins our choice; "device check"
 * marks what only a real unit can settle. The simulator has no audio input: its recorder listens
 * to a stand-in (TE's demo waveform on a 20 s loop, `areas/sample/record.ts`), so cases that only
 * need a take turn the threshold down to 0 first.
 */
import { describe, expect, it } from 'vitest';
import { NAME_CHARACTERS, NAME_MAX } from '../areas/system/catalogue';
import { currentGroup, groups } from '../areas/system/presets';
import { usageOf } from '../areas/system/usage';
import type { ScreenFrame } from '../screen/frame';
import { currentPattern } from '../sequencer';
import {
	GAP_MS,
	HOLD_MS,
	KEYBOARD,
	addMidiPreset,
	loadEngine,
	noteOf,
	type Driver
} from '../testing/driver';

/** The screen, narrowed to one page (the case fails on any other page). */
function on<P extends ScreenFrame['page']>(d: Driver, page: P): Extract<ScreenFrame, { page: P }> {
	const frame = d.frame;
	expect(frame.page).toBe(page);
	return frame as Extract<ScreenFrame, { page: P }>;
}

/** What each column of a list page has selected (null where nothing is). */
const picks = (d: Driver) =>
	on(d, 'system-list').columns.map((c) => (c.selected === null ? null : c.items[c.selected]));
/** The rows of column `n` of a list page that are in view. */
const rows = (d: Driver, n: number) => on(d, 'system-list').columns[n].items;
/** The soft labels over M1–M4 of a list page. */
const listSoft = (d: Driver) => on(d, 'system-list').soft.map((l) => l?.text ?? '');
/** The soft labels over M1–M4 of the project view. */
const projectSoft = (d: Driver) => on(d, 'project').soft.map((l) => l?.text ?? '');

const key = (name: string) => `keyboard.${name}`;
const step = (n: number) => `step.${n}`;
/** A press long enough to count as holding a key. */
const hold = (d: Driver, id: string) => d.click(id, HOLD_MS);
const sys = (d: Driver) => d.state.areas.system;
const smp = (d: Driver) => d.state.areas.sample;
/** The names of the presets in a folder of the library, oldest first. */
const presetsIn = (d: Driver, folder: string) =>
	sys(d)
		.presets.library.filter((p) => p.folder === folder)
		.map((p) => p.name);

/** The date a saved sound is named after on a unit fresh from the box (our clock default). */
const TODAY = '2026-09-26';

/** The preset browser's page (research 59 §2.6). */
const browser = (d: Driver) => on(d, 'system-presets');
/** What the preset browser has chosen: the engine or folder, and the highlighted preset. */
const chosen = (d: Driver) =>
	[browser(d).groups, browser(d).presets].map((c) =>
		c.selected === null ? null : c.items[c.selected]
	);

/** Turns E1 of the preset browser to `group` (an engine or a folder), as someone reading it. */
async function toGroup(d: Driver, group: string): Promise<void> {
	const b = sys(d).presets;
	const by = groups(b).indexOf(group) - currentGroup(b).index;
	if (by !== 0) await d.turn(1, by);
	expect(chosen(d)[0]).toBe(group);
}

/**
 * Types `word` on the naming screen: M4 deletes the name character by character, then E2 picks
 * each character and M2 moves on to the next (ours: M2 past the end adds one).
 */
async function spell(d: Driver, word: string): Promise<void> {
	const naming = () => on(d, 'system-naming');
	await d.turn(1, NAME_MAX);
	while (naming().text.length > 0) await d.click('key.m4');
	let previous = NAME_CHARACTERS[0];
	for (const [i, c] of [...word].entries()) {
		if (i > 0) await d.click('key.m2');
		const by = NAME_CHARACTERS.indexOf(c) - NAME_CHARACTERS.indexOf(previous);
		if (by !== 0) await d.turn(2, by);
		previous = c;
	}
	expect(naming().text).toBe(word);
}

/** Turns the record page's threshold all the way down (E4), so a take starts at once. */
const noThreshold = (d: Driver) => d.turn(4, -99);

/** Holds M1 on a record page for `ms`. */
async function record(d: Driver, ms = 1000): Promise<void> {
	await d.down('key.m1');
	await d.wait(ms);
	await d.up('key.m1');
	await d.wait(GAP_MS);
}

/**
 * Puts TE's demo loop (the library's bass/cherry: a drum roll, then single hits) on a drum key of
 * track 1: that key held with sample opens the library for it, E2 finds the loop, a click loads
 * it, the lit track key leaves.
 */
async function loopOnKey(d: Driver, name: string): Promise<void> {
	await d.holding(key(name), () => d.click('key.sample'));
	await d.turn(2, 2);
	await d.push(2);
	await d.click('track.1');
}

/** Opens the slicer on a drum key holding TE's demo loop (the key held, then M1). */
async function slicer(d: Driver, name = 'c4'): Promise<void> {
	await loopOnKey(d, name);
	await d.holding(key(name), () => d.click('key.m1'));
}

/** Where the slicer's markers stand, 0–1 across the view. */
const markers = (d: Driver) => on(d, 'sample-slice').markers.map((m) => m.at);

export function systemSampleConformance(start: () => Promise<Driver>): void {
	describe('10 project', () => {
		it('opens the project view with project, from any mode, and closes it with project again', async () => {
			const d = await start();
			await d.click('key.project');
			expect(d.screen()).toBe('project project 1');
			expect(projectSoft(d)).toEqual(['new', 'save', 'rename', 'config']);
			await d.click('key.project');
			expect(d.frame.page).toBe('drum'); // track 1's page again
			await d.clicks('key.mix', 'key.project');
			expect(d.frame.page).toBe('project');
			await d.click('key.project');
			expect(d.frame.page).toBe('mix');
		});

		it('shows the voice icon only once 17 of the 24 voices sound', async () => {
			const d = await start();
			await d.clicks('track.3', 'key.project');
			const voices = () => on(d, 'project').usage.voices;
			for (const k of KEYBOARD.slice(0, 16)) await d.down(key(k));
			await d.wait(GAP_MS);
			expect(voices()).toBe(false);
			await d.down(key(KEYBOARD[16]));
			await d.wait(GAP_MS);
			expect(voices()).toBe(true);
			for (const k of KEYBOARD.slice(0, 17)) await d.up(key(k));
			await d.wait(GAP_MS);
			expect(voices()).toBe(false);
		});

		it('shows the CPU icon past 70 % load, apart from the voice icon (ours: the load is our estimate)', async () => {
			const d = await start();
			await d.clicks('track.5', 'key.project'); // dissolve: the heaviest engine
			let alone = false;
			for (const k of KEYBOARD) {
				await d.down(key(k));
				await d.wait(GAP_MS);
				const { usage } = on(d, 'project');
				expect(usage.cpu).toBe(usageOf(d.state).cpu > 70);
				if (usage.cpu && !usage.voices) alone = true;
			}
			expect(alone).toBe(true);
			for (const k of KEYBOARD) await d.up(key(k));
			await d.wait(GAP_MS);
			expect(on(d, 'project').usage.cpu).toBe(false);
		});

		it('shows the sample memory icon once samples fill more than 70 % of it (ours: sizes estimated)', async () => {
			const d = await start();
			await d.click('key.project');
			expect(on(d, 'project').usage.memory).toBe(false);
			await d.clicks('key.project', 'track.3');
			await loadEngine(d, 'multisampler');
			await d.click('key.project');
			expect(on(d, 'project').usage.memory).toBe(true);
			expect(usageOf(d.state).memory).toBeGreaterThan(70);
		});

		// bug in src/lib/sim/screen/frame.ts (ProjectFrame) and screen/pages/project.ts: the usage
		// icons are only on or off; nothing shows red for a stolen voice or a full CPU
		it.skip('flashes the voice icon red when a voice is stolen for a new note', async () => {
			const d = await start();
			await d.clicks('track.3', 'key.project');
			for (const k of KEYBOARD) await d.down(key(k));
			await d.clicks(step(1), 'key.play'); // more than 24 voices wanted
			await d.wait(200);
			expect(on(d, 'project').usage).toMatchObject({ voices: true, stolen: true });
		});
	});

	describe('10.1 rename, save, create and configure', () => {
		it('creates a new project on a held M1, saving the open one first; a click only asks for a hold', async () => {
			const d = await start();
			await d.clicks(step(1), step(5), 'key.project');
			await d.click('key.m1');
			expect(d.screen()).toBe('project project 1');
			expect(projectSoft(d)[0]).toBe('hold'); // ours
			await hold(d, 'key.m1');
			expect(d.screen()).toBe('project project 2');
			// auto save is on by default: the old project was saved on the way
			const old = sys(d).projects.user.find((p) => p.name === 'project 1');
			expect(old?.versions.map((v) => v.auto)).toEqual([true]);
			await d.click('key.project');
			expect(d.steps()).toBe('................');
			expect(d.state.tempo.bpm).toBe(120);
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

		it('saves nothing on the way to a new project when auto save is off in the project settings', async () => {
			const d = await start();
			await d.clicks(step(1), 'key.project', 'key.m4');
			await d.turn(2, 1);
			expect(picks(d)).toEqual(['general', 'auto save', 'on']);
			await d.turn(3, -1);
			expect(picks(d)).toEqual(['general', 'auto save', 'off']);
			await d.click('key.m1');
			await hold(d, 'key.m1');
			expect(d.screen()).toBe('project project 2');
			expect(sys(d).projects.user.find((p) => p.name === 'project 1')?.versions).toEqual([]);
			// so project 1 opens as it was last saved: never, without the step
			await d.withShift(() => d.click('key.project'));
			await d.turn(2, -1);
			await d.clicks('key.m1', 'key.project');
			expect(d.steps()).toBe('................');
		});

		it('saves nothing on the way either when auto save is off in the system settings', async () => {
			const d = await start();
			await d.clicks(step(1), 'key.com', 'key.m1');
			await d.turn(2, 4);
			expect(picks(d)).toEqual(['system', 'auto save', 'on']);
			await d.turn(3, -1);
			await d.clicks('key.m1', 'key.project');
			await hold(d, 'key.m1');
			expect(d.screen()).toBe('project project 2');
			expect(sys(d).projects.user.find((p) => p.name === 'project 1')?.versions).toEqual([]);
		});

		it('saves with M2: its label says so for a moment and the project’s history gains a version', async () => {
			const d = await start();
			await d.clicks(step(1), 'key.project', 'key.m2');
			expect(on(d, 'project').soft[1]).toEqual({ text: 'saved', tone: 'bright' });
			const versions = () => sys(d).projects.user[0].versions;
			expect(versions().map((v) => v.auto)).toEqual([false]);
			await d.wait(1600);
			expect(projectSoft(d)[1]).toBe('save'); // ours: the label says it for 1.5 s
			await d.click('key.m2');
			expect(versions()).toHaveLength(2);
		});

		it('saves a copy under a new name with shift + M2, and carries on in the copy', async () => {
			const d = await start();
			await d.clicks(step(1), 'key.project');
			await d.withShift(async () => {
				expect(projectSoft(d)[1]).toBe('save as');
				await d.click('key.m2');
			});
			// ours: the next free name to start from
			expect(d.screen()).toBe('save project as: "project 2", character 9 is "2"');
			await d.click('key.m1');
			expect(d.screen()).toBe('project project 2');
			const user = sys(d).projects.user;
			expect(user.map((p) => p.name)).toEqual(['project 1', 'project 2']);
			expect(user[1].versions).toHaveLength(1);
			await d.click('key.project');
			expect(d.steps()).toBe('w...............');
		});

		it('renames with M3: E1 picks the character, E2 changes it, M1 confirms', async () => {
			const d = await start();
			await d.clicks('key.project', 'key.m3');
			expect(d.screen()).toBe('rename project: "project 1", character 9 is "1"');
			await d.turn(2, 1);
			expect(d.screen()).toBe('rename project: "project 2", character 9 is "2"');
			await d.turn(1, -8);
			expect(d.screen()).toBe('rename project: "project 2", character 1 is "p"');
			await d.turn(2, -3);
			await d.click('key.m1');
			expect(d.screen()).toBe('project mroject 2');
			expect(sys(d).projects.user.map((p) => p.name)).toEqual(['mroject 2']);
		});

		it('moves to the next character with M2, deletes one with M4 and cancels with M3', async () => {
			const d = await start();
			await d.clicks('key.project', 'key.m3');
			await d.turn(1, -8);
			await d.click('key.m2');
			expect(d.screen()).toBe('rename project: "project 1", character 2 is "r"');
			await d.click('key.m4');
			expect(d.screen()).toBe('rename project: "poject 1", character 2 is "o"');
			await d.click('key.m3');
			expect(d.screen()).toBe('project project 1');
		});

		it('takes a whole new name typed letter by letter', async () => {
			const d = await start();
			await d.clicks('key.project', 'key.m3');
			await spell(d, 'late night 2');
			await d.click('key.m1');
			expect(d.screen()).toBe('project late night 2');
		});

		it('refuses an empty name and one another project has (ours: it says why and waits)', async () => {
			const d = await start();
			await d.click('key.project');
			await d.withShift(() => d.click('key.m2'));
			await d.clicks('key.m1', 'key.m3'); // saved as "project 2", renaming it
			await d.turn(2, -1);
			await d.click('key.m1');
			expect(d.screen()).toBe('name taken: "project 1", character 9 is "1"');
			for (let i = 0; i < 9; i++) await d.click('key.m4');
			await d.click('key.m1');
			expect(d.screen()).toBe('name is empty: "", character 1 is ""');
			await d.click('key.m3');
			expect(d.screen()).toBe('project project 2');
		});

		it('opens the project settings with M4 and leaves them with M1', async () => {
			const d = await start();
			await d.clicks('key.project', 'key.m4');
			expect(d.screen()).toBe('project settings: general, transpose, 0 semi');
			expect(listSoft(d)[0]).toBe('back');
			await d.click('key.m1');
			expect(d.screen()).toBe('project project 1');
		});
	});

	describe('10.2 projects folder', () => {
		it('opens with shift + project, from any mode, on the open project beside the factory and templates folders', async () => {
			const d = await start();
			await d.click('key.mix');
			await d.withShift(() => d.click('key.project'));
			expect(rows(d, 0)).toEqual(['factory', 'templates', 'user']);
			expect(picks(d)).toEqual(['user', 'project 1']);
			// ours: the soft keys follow the text (M1 load … M4 delete); TE's art labels them the other
			// way round (device check)
			expect(listSoft(d)).toEqual(['load', 'history', 'duplicate', 'delete']);
		});

		it('picks a folder with E1 and a project with E2, E3 or E4', async () => {
			const d = await start();
			await d.withShift(() => d.click('key.project'));
			await d.turn(1, -2);
			expect(picks(d)).toEqual(['factory', 'demo 1']);
			await d.turn(2, 2);
			expect(picks(d)).toEqual(['factory', 'demo 3']);
			await d.turn(3, 1);
			await d.turn(4, 1);
			expect(picks(d)).toEqual(['factory', 'demo 5']);
			await d.turn(1, 1);
			expect(picks(d)).toEqual(['templates', null]); // empty until a computer adds one over MTP
		});

		it('loads the selected project with M1, saving the open one first', async () => {
			const d = await start();
			await d.clicks(step(1), step(9));
			await d.withShift(() => d.click('key.project'));
			await d.turn(1, -2);
			await d.turn(2, 1);
			await d.click('key.m1');
			expect(d.screen()).toBe('project demo 2');
			await d.click('key.project');
			expect(d.steps()).toBe('................');
			// project 1 was saved when demo 2 opened: it comes back as it was
			await d.withShift(() => d.click('key.project'));
			await d.turn(1, 2);
			expect(picks(d)).toEqual(['user', 'project 1']);
			await d.clicks('key.m1', 'key.project');
			expect(d.steps()).toBe('w.......w.......');
		});

		it('shows the selected project’s history with M2, newest first, autosaves marked; M1 loads a version (ours)', async () => {
			const d = await start();
			await d.clicks(step(1), 'key.project', 'key.m2', 'key.project');
			await d.clicks(step(5), 'key.project', 'key.m2');
			await d.withShift(() => d.click('key.project'));
			await d.click('key.m2');
			expect(on(d, 'system-list').title).toBe('history of project 1');
			expect(rows(d, 1)).toEqual(['09-26 (2) save', '09-26 (1) save']);
			expect(listSoft(d).slice(0, 2)).toEqual(['load', 'back']);
			await d.turn(2, 1);
			await d.click('key.m1');
			expect(d.screen()).toBe('project project 1');
			await d.click('key.project');
			expect(d.steps()).toBe('w...............');
			// the state it replaced was kept as an autosave, listed first
			await d.withShift(() => d.click('key.project'));
			await d.click('key.m2');
			expect(rows(d, 1)[0]).toBe('09-26 (3) auto');
			await d.click('key.m2'); // ours: M2 goes back to the folder
			expect(on(d, 'system-list').title).toBe('projects folder');
		});

		it('shows an empty history for a project never saved, where M1 loads nothing (ours)', async () => {
			const d = await start();
			await d.click(step(1));
			await d.withShift(() => d.click('key.project'));
			await d.click('key.m2');
			expect(rows(d, 1)).toEqual(['no versions']);
			await d.click('key.m1');
			expect(on(d, 'system-list').title).toBe('history of project 1');
			await d.clicks('key.m2', 'key.project', 'key.project');
			expect(d.steps()).toBe('w...............');
		});

		it('duplicates the selected project with M3, unsaved changes included (TE’s art; its text says M2; OS 1.1.25)', async () => {
			const d = await start();
			await d.clicks(step(1), step(5));
			await d.withShift(() => d.click('key.project'));
			await d.click('key.m3');
			expect(picks(d)).toEqual(['user', 'project 2']);
			await d.click('key.m1');
			expect(d.screen()).toBe('project project 2');
			await d.click('key.project');
			expect(d.steps()).toBe('w...w...........');
		});

		it('deletes the selected project on a held M4 once asked again (ours); a click asks for a hold', async () => {
			const d = await start();
			await d.click('key.project');
			await hold(d, 'key.m1');
			await d.withShift(() => d.click('key.project'));
			await d.turn(2, -1);
			expect(picks(d)).toEqual(['user', 'project 1']);
			await d.click('key.m4');
			expect(listSoft(d)[3]).toBe('hold'); // ours
			await hold(d, 'key.m4');
			expect(d.screen()).toBe('delete project? project 1: M4 deletes, M3 cancels');
			await d.click('key.m3');
			expect(rows(d, 1)).toEqual(['project 1', 'project 2']);
			await hold(d, 'key.m4');
			await d.click('key.m4');
			expect(rows(d, 1)).toEqual(['project 2']);
		});

		it('keeps the factory projects: a held M4 there asks nothing (ours)', async () => {
			const d = await start();
			await d.withShift(() => d.click('key.project'));
			await d.turn(1, -2);
			await hold(d, 'key.m4');
			expect(picks(d)).toEqual(['factory', 'demo 1']);
			expect(rows(d, 1)).toHaveLength(6);
		});

		it('goes back to the project view with project, and leaves with a mode key', async () => {
			const d = await start();
			await d.withShift(() => d.click('key.project'));
			await d.click('key.project');
			expect(d.screen()).toBe('project project 1');
			await d.withShift(() => d.click('key.project'));
			await d.click('key.mix');
			expect(d.frame.page).toBe('mix');
		});
	});

	describe('10.3 project settings', () => {
		it('picks the page with E1 (general, tempo, voices, midi), the setting with E2 and its value with E3 or E4', async () => {
			const d = await start();
			await d.clicks('key.project', 'key.m4');
			expect(rows(d, 0)).toEqual(['general', 'tempo', 'voices', 'midi']);
			await d.turn(1, 1);
			expect(picks(d)).toEqual(['tempo', 'signature', '4/4']);
			await d.turn(3, 1);
			expect(picks(d)).toEqual(['tempo', 'signature', '5/4']);
			await d.turn(4, -2);
			expect(picks(d)).toEqual(['tempo', 'signature', '3/4']);
			await d.turn(2, 1);
			expect(picks(d)).toEqual(['tempo', 'groove type', 'shuffle']);
			await d.turn(1, 5); // the last page stops it
			expect(picks(d)).toEqual(['midi', 'track 1', 'off']);
		});

		it('sets the time signature to 3/4, 4/4, 5/4, 6/8, 7/8 or 12/8', async () => {
			const d = await start();
			await d.clicks('key.project', 'key.m4');
			await d.turn(1, 1);
			await d.turn(3, -9);
			const seen = [picks(d)[2]];
			for (let i = 0; i < 6; i++) {
				await d.turn(3, 1);
				seen.push(picks(d)[2]);
			}
			expect(seen).toEqual(['3/4', '4/4', '5/4', '6/8', '7/8', '12/8', '12/8']);
		});

		it('shows and changes the groove type that the tempo page turns', async () => {
			const d = await start();
			await d.click('key.tempo');
			await d.turn(2, 3);
			expect(d.screen()).toBe('tempo 120 bpm, groove BO, metronome on'); // ours: the two letters
			await d.clicks('key.project', 'key.m4');
			await d.turn(1, 1);
			await d.turn(2, 1);
			expect(picks(d)).toEqual(['tempo', 'groove type', 'bombora']);
			await d.turn(3, 1);
			expect(picks(d)[2]).toBe('wobbly');
			await d.click('key.tempo');
			expect(d.screen()).toBe('tempo 120 bpm, groove WO, metronome on');
		});

		it('transposes the whole project on the general page, a semitone a detent (ours: −12…+12; whether drums follow: device check)', async () => {
			const d = await start();
			await d.clicks('key.project', 'key.m4');
			await d.turn(3, 3);
			expect(picks(d)).toEqual(['general', 'transpose', '3 semi']);
			await d.turn(4, -20);
			expect(picks(d)[2]).toBe('-12 semi');
		});

		it('shares the 24 voices out: automatic by default, or a number reserved for a track', async () => {
			const d = await start();
			await d.clicks('key.project', 'key.m4');
			await d.turn(1, 2);
			expect(rows(d, 1)).toEqual(Array.from({ length: 8 }, (_, i) => `track ${i + 1}`));
			expect(rows(d, 2)).toEqual(Array.from({ length: 8 }, () => 'auto'));
			await d.turn(2, 2);
			await d.turn(3, 4);
			expect(picks(d)).toEqual(['voices', 'track 3', '4']);
			await d.turn(4, 40);
			expect(picks(d)[2]).toBe('24');
		});

		it('gives each of the 16 tracks a MIDI channel, all off in a new project', async () => {
			const d = await start();
			await d.clicks('key.project', 'key.m4');
			await d.turn(1, 3);
			expect(on(d, 'system-list').columns[1].total).toBe(16);
			expect(picks(d)).toEqual(['midi', 'track 1', 'off']);
			await d.turn(3, 1);
			expect(picks(d)[2]).toBe('1');
			await d.turn(2, 10); // the eleventh track: auxiliary track 3
			expect(picks(d)).toEqual(['midi', 'external midi', 'off']);
			await d.turn(3, 20);
			expect(picks(d)[2]).toBe('16');
			expect(sys(d).projectSettings.channels).toEqual([
				1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0
			]);
		});

		it('chooses how scene length is worked out (OS 1.1.0; ours: on the general page, longest or time signature)', async () => {
			const d = await start();
			await d.clicks('key.project', 'key.m4');
			await d.turn(2, 2);
			expect(picks(d)).toEqual(['general', 'scene length', 'longest']);
			await d.turn(3, 1);
			expect(picks(d)[2]).toBe('time signature');
		});

		it('gives way to bar and player, whose pages open over it (ours)', async () => {
			const d = await start();
			await d.clicks('track.3', 'key.project', 'key.m4');
			await d.holding('key.bar', async () => {
				expect(d.frame.page).toBe('bar');
			});
			expect(d.frame.page).toBe('project'); // back where bar was pressed from
			await d.clicks('key.m4', 'key.player');
			expect(d.frame).toMatchObject({ page: 'player', type: 'arpeggio' });
		});

		it('keeps its settings with the project: a new project starts from the defaults, loading brings them back', async () => {
			const d = await start();
			await d.clicks('key.project', 'key.m4');
			await d.turn(3, 5);
			await d.click('key.m1');
			await hold(d, 'key.m1');
			await d.click('key.m4');
			expect(picks(d)).toEqual(['general', 'transpose', '0 semi']);
			await d.click('key.m1');
			await d.withShift(() => d.click('key.project'));
			await d.turn(2, -1);
			await d.clicks('key.m1', 'key.m4');
			expect(picks(d)).toEqual(['general', 'transpose', '5 semi']);
		});
	});

	describe('19 com', () => {
		it('opens with com from any mode and closes with com again', async () => {
			const d = await start();
			await d.click('key.com');
			expect(d.screen()).toBe('com: multi-out midi');
			await d.click('key.com');
			expect(d.frame.page).toBe('drum');
			await d.clicks('key.auxiliary', 'key.com');
			expect(d.frame.page).toBe('com');
		});

		it('leads to the system settings (M1), controller mode (M2), the devices (M3) and MTP mode (M4)', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m1');
			expect(on(d, 'system-list').title).toBe('system settings');
			await d.click('key.m1');
			expect(d.frame.page).toBe('com');
			await d.click('key.m2');
			expect(on(d, 'system-link').mode).toBe('controller');
			await d.withShift(() => d.click('key.com'));
			expect(d.frame.page).toBe('com');
			await d.click('key.m3');
			expect(d.frame.page).toBe('system-devices');
			await d.clicks('key.m1', 'key.m4');
			expect(on(d, 'system-link').mode).toBe('mtp');
			await d.click('key.m4');
			expect(d.frame.page).toBe('com');
		});
	});

	describe('19.1 setting the multi-out port and bluetooth midi', () => {
		it('advertises over bluetooth MIDI when E1 turns up or is clicked, and stops when it turns back or is clicked again', async () => {
			const d = await start();
			await d.click('key.com');
			await d.turn(1, 1);
			expect(d.screen()).toBe('com: multi-out midi, bluetooth advertising');
			await d.turn(1, -1);
			expect(d.screen()).toBe('com: multi-out midi');
			await d.push(1);
			expect(on(d, 'com').advertising).toBe(true);
			await d.push(1);
			expect(on(d, 'com').advertising).toBe(false);
		});

		it('sets the multi-out’s job with E3: midi, cv/gate, three sync rates or audio, stopping at both ends (device check: the order)', async () => {
			const d = await start();
			await d.click('key.com');
			await d.turn(3, -9);
			const seen = [on(d, 'com').multiOut as string];
			for (let i = 0; i < 6; i++) {
				await d.turn(3, 1);
				seen.push(on(d, 'com').multiOut);
			}
			// TE's text and ours agree on the ends; between them its text lists cv/gate first, its art
			// shows sync second
			expect(seen[0]).toBe('midi');
			expect(seen.slice(-2)).toEqual(['audio', 'audio']);
			expect(new Set(seen)).toEqual(
				new Set(['midi', 'cv/gate', 'sync8', 'sync16', 'sync24', 'audio'])
			);
			expect(d.screen()).toBe('com: multi-out audio');
		});

		it('keeps the multi-out and bluetooth settings with the unit when a new project opens (ours)', async () => {
			const d = await start();
			await d.click('key.com');
			await d.turn(3, 2);
			await d.push(1);
			const before = d.screen();
			await d.click('key.project');
			await hold(d, 'key.m1');
			await d.click('key.com');
			expect(d.screen()).toBe(before);
		});
	});

	describe('19.2 system settings', () => {
		it('picks a section with E1, a setting with E2 and changes it with E3 or E4; M1 goes back to com', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m1');
			// ours: TE's art lists a legal section last; the replica shows its firmware version there
			expect(rows(d, 0)).toEqual([
				'system',
				'keyboard',
				'midi',
				'clock',
				'pitchbend',
				'battery',
				'monitor',
				'legal'
			]);
			expect(picks(d)).toEqual(['system', 'screen brightness', '80']);
			await d.turn(3, 5);
			expect(picks(d)[2]).toBe('85');
			await d.turn(4, -10);
			expect(picks(d)[2]).toBe('75');
			await d.turn(1, 1);
			expect(picks(d)).toEqual(['keyboard', 'velocity', 'off']);
			expect(listSoft(d)[0]).toBe('back');
			await d.click('key.m1');
			expect(d.frame.page).toBe('com');
		});

		it('system: screen and LED brightness, country, and whether it powers off at once or after a delay', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m1');
			expect(rows(d, 1).slice(0, 4)).toEqual([
				'screen brightness',
				'led brightness',
				'country',
				'power off'
			]);
			await d.turn(2, 3);
			expect(picks(d)).toEqual(['system', 'power off', 'instant']);
			await d.turn(3, 1);
			expect(picks(d)[2]).toBe('delayed');
		});

		it('keyboard: velocity off, soft or hard, and the keys detuned by notes and by cents', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m1');
			await d.turn(1, 1);
			expect(rows(d, 1)).toEqual(['velocity', 'detune notes', 'detune cents']);
			await d.turn(2, 1);
			await d.turn(3, -2);
			expect(picks(d)).toEqual(['keyboard', 'detune notes', '-2 semi']);
			await d.turn(2, 1);
			await d.turn(3, 7);
			expect(picks(d)).toEqual(['keyboard', 'detune cents', '7 cents']);
		});

		it('midi: clock, notes and other messages in or out, the active track’s channel, MIDI echo (ours: stock values of OS 1.1.33)', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m1');
			await d.turn(1, 2);
			expect(rows(d, 1)).toEqual(['clock', 'notes', 'other', 'active channel', 'midi echo']);
			expect(rows(d, 2)).toEqual(['in', 'both', 'both', '1', 'off']);
			await d.turn(3, 2);
			expect(picks(d)).toEqual(['midi', 'clock', 'both']);
		});

		it('clock: sets the date the unit stamps on project versions and saved sounds', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m1');
			await d.turn(1, 3);
			expect(rows(d, 1)).toEqual(['year', 'month', 'day', 'hour', 'minute']);
			await d.turn(2, 2);
			await d.turn(3, 2);
			expect(picks(d)).toEqual(['clock', 'day', '28']);
			await d.clicks('key.project', 'key.m2', 'key.project');
			expect(sys(d).projects.user[0].versions[0].label).toBe('09-28 (1) save');
			await d.holding('track.3', () => d.click('key.m4'));
			expect(presetsIn(d, 'snapshot')).toEqual(['2026-09-28 (1)']);
		});

		it('pitchbend: E2 sets the left side’s sensitivity, E3 the right side’s, M4 calibrates the strip', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m1');
			await d.turn(1, 4);
			expect(listSoft(d)[3]).toBe('calibrate');
			await d.turn(2, -10);
			expect(picks(d)).toEqual(['pitchbend', 'left sensitivity', '40']);
			await d.turn(3, 5);
			expect(picks(d)).toEqual(['pitchbend', 'right sensitivity', '55']);
			await d.click('key.m4');
			expect(listSoft(d)[3]).toBe('calibrated'); // ours
		});

		it('battery: shows the charge and the input current limit, which turning cannot change', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m1');
			await d.turn(1, 5);
			expect(rows(d, 1)).toEqual(['level', 'current limit']);
			await d.turn(3, 10);
			expect(rows(d, 2)).toEqual(['80', '500 ma']);
		});

		it('monitor: lists incoming MIDI, and waits while none comes (ours: nothing is connected here)', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m1');
			await d.turn(1, 6);
			expect(picks(d)).toEqual(['monitor', 'waiting for midi', '']);
		});
	});

	describe('19.3 midi controller mode', () => {
		it('makes the unit a MIDI controller with M2; with shift, E1 sets the channel, E2 absolute or relative knobs, E3 the octave keys', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m2');
			expect(d.screen()).toBe(
				'controller mode: the keys and encoders send midi; shift + com leaves'
			);
			await d.withShift(async () => {
				expect(d.screen()).toBe('controller mode: channel 1, knobs absolute, octave keys on');
				await d.turn(1, 3);
				await d.turn(2, 1);
				await d.turn(3, -1);
				expect(d.screen()).toBe('controller mode: channel 4, knobs relative, octave keys off');
			});
			await d.turn(1, 5); // without shift the encoders are the controller's
			await d.withShift(async () => expect(d.screen()).toContain('channel 4'));
		});

		it('stays until shift + com: com on its own and the module keys are the controller’s', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m2');
			await d.clicks('key.com', 'key.m1', 'key.instrument');
			expect(on(d, 'system-link').mode).toBe('controller');
			await d.withShift(() => d.click('key.com'));
			expect(d.screen()).toBe('com: multi-out midi');
		});

		it('gives every key to the controller: nothing plays, changes or opens underneath (ours: the unit only sends MIDI)', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m2');
			await d.clicks('key.play', 'track.3', step(1), key('c4'));
			await d.clicks('key.player', 'key.player');
			await d.withShift(() => d.click('key.player'));
			await d.holding('key.bar', () => d.click('key.plus'));
			await d.click('key.sample');
			expect(on(d, 'system-link').mode).toBe('controller');
			await d.withShift(() => d.click('key.com'));
			expect(d.screen()).toBe('com: multi-out midi');
			await d.click('key.com');
			expect(d.state.transport.playing).toBe(false);
			expect(d.state.track).toBe(0);
			expect(d.steps()).toBe('................');
			expect(currentPattern(d.state.tracks[0].sequence).bars).toBe(1);
			await d.click('key.player');
			expect(d.frame).toMatchObject({ page: 'player', type: 'arpeggio', on: false });
		});
	});

	describe('19.4 devices', () => {
		it('lists the connected MIDI devices: E1 picks one, E2 a setting, E3 or E4 its value; M1 goes back', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m3');
			// ours: the virtual OP-XY knows the computer running the app
			expect(d.screen()).toBe('devices: computer, connected; clock both');
			await d.turn(2, 1);
			await d.turn(3, -1);
			expect(d.screen()).toBe('devices: computer, connected; notes out');
			await d.turn(4, -2);
			expect(d.screen()).toBe('devices: computer, connected; notes off');
			await d.click('key.m1');
			expect(d.frame.page).toBe('com');
		});

		it('forgets the chosen device with M2', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m3', 'key.m2');
			expect(d.screen()).toBe('devices: none known');
		});
	});

	describe('19.5 mtp', () => {
		it('puts the unit in MTP mode with M4, where a Mac needs field kit; M4 ejects and M1 leaves as well', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m4');
			expect(d.screen()).toBe(
				'mtp mode: the computer can reach the files; M4 ejects. on a mac, open teenage engineering field kit to reach the files'
			);
			expect(on(d, 'system-link').soft[3]?.text).toBe('eject');
			await d.click('key.m4');
			expect(d.screen()).toBe('com: multi-out midi');
			await d.clicks('key.m4', 'key.m1');
			expect(d.frame.page).toBe('com');
		});

		it('waits for the computer while files move: other keys do nothing until it ejects (ours)', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m4');
			await d.clicks('key.sample', 'key.tempo', 'key.play', 'track.4', 'key.project', 'key.m2');
			await d.withShift(() => d.click('track.2'));
			expect(on(d, 'system-link').mode).toBe('mtp');
			await d.click('key.m4');
			expect(d.screen()).toBe('com: multi-out midi');
			expect(d.state.transport.playing).toBe(false);
			expect(d.state.track).toBe(0);
		});
	});

	describe('14.5 preset settings', () => {
		it('opens with shift + instrument on the selected track: E1 settings or mod, E2 a setting, E3 or E4 its value', async () => {
			const d = await start();
			await d.click('track.3');
			await d.withShift(() => d.click('key.instrument'));
			expect(on(d, 'system-list').title).toBe('preset settings of track 3');
			expect(d.led('track.3')).toBe('white');
			expect(rows(d, 0)).toEqual(['settings', 'mod']);
			expect(rows(d, 1)).toEqual([
				'high pass',
				'velocity sens',
				'portamento type',
				'tuning',
				'tuning root',
				'transpose',
				'width'
			]);
			expect(picks(d)).toEqual(['settings', 'high pass', '0']);
			await d.turn(3, 12);
			await d.turn(4, 3);
			expect(picks(d)[2]).toBe('15');
			await d.turn(1, 1);
			expect(rows(d, 1)).toEqual([
				'modwheel target',
				'modwheel amount',
				'aftertouch target',
				'aftertouch amount',
				'pitchbend target',
				'pitchbend amount',
				'velocity target',
				'velocity amount'
			]);
		});

		it('goes back to the instrument pages with a module key (that page) or with instrument (the page it covered)', async () => {
			const d = await start();
			await d.click('track.3');
			await d.withShift(() => d.click('key.instrument'));
			await d.click('key.m2');
			expect(d.frame.page).toBe('envelope');
			await d.click('key.m3');
			await d.withShift(() => d.click('key.instrument'));
			await d.click('key.instrument');
			expect(d.frame.page).toBe('filter');
		});

		it('keeps preset settings per track, with the sound', async () => {
			const d = await start();
			await d.click('track.3');
			await d.withShift(() => d.click('key.instrument'));
			await d.turn(3, 30);
			await d.click('track.4');
			await d.withShift(() => d.click('key.instrument'));
			// track 4's own: a new project's beach bum high-passes a little (the device's 5)
			expect(picks(d)).toEqual(['settings', 'high pass', '5']);
			await d.click('track.3');
			await d.withShift(() => d.click('key.instrument'));
			expect(picks(d)).toEqual(['settings', 'high pass', '30']);
		});

		it('edits one of 11 user tunings: E3 picks the slot, M4 opens it, a played key picks the note, E1 turns cents and E2 micro-cents', async () => {
			const d = await start();
			await d.click('track.3');
			await d.withShift(() => d.click('key.instrument'));
			await d.turn(2, 3);
			expect(picks(d)).toEqual(['settings', 'tuning', 'equal']);
			await d.turn(3, 20);
			expect(picks(d)[2]).toBe('user 11');
			await d.turn(3, -10);
			expect(picks(d)[2]).toBe('user 1');
			expect(listSoft(d)[3]).toBe('edit'); // ours
			await d.click('key.m4');
			expect(d.screen()).toBe('tuning user 1: C 0 cents, 0 micro-cents');
			await d.click(key('e4'));
			await d.turn(1, 12);
			await d.turn(2, 50);
			expect(d.screen()).toBe('tuning user 1: E +12 cents, 50 micro-cents');
			await d.click('key.m1'); // ours: M1 (or M4) goes back
			expect(picks(d)).toEqual(['settings', 'tuning', 'user 1']);
			expect(sys(d).tunings[0].cents[4]).toBe(12);
		});
	});

	describe('14.6 view and create presets', () => {
		it('opens with shift + a track key in instrument mode, on the preset that track plays, the track key lit', async () => {
			const d = await start();
			await d.withShift(() => d.click('track.3'));
			// a new project's track 3 plays the device's bass/shoulder, by engine as on the owner's
			// unit (device, b1-1495)
			expect(d.screen()).toBe('presets for track 3, by engine: prism, shoulder');
			expect(d.led('track.3')).toBe('white');
			expect(browser(d).groups.items.slice(0, 4)).toEqual(['axis', 'dissolve', 'drum', 'epiano']);
		});

		it('switches between engine and category view with a click of E1, a popup saying which (device, b1-1523…1535)', async () => {
			const d = await start();
			await d.withShift(() => d.click('track.3'));
			await d.push(1);
			expect(d.screen()).toBe('presets for track 3, by category (view popup): bass, shoulder');
			expect(browser(d).groups.items).toEqual([
				...['bass', 'drum', 'keys', 'lead'],
				...['organ', 'pad', 'pluck', 'strings']
			]);
			await d.wait(1500);
			expect(d.screen()).toBe('presets for track 3, by category: bass, shoulder');
			await d.push(1);
			expect(d.screen()).toBe('presets for track 3, by engine (view popup): prism, shoulder');
			// the device's eleven engines, then midi (ours: a new unit listed no midi, b1-1500); with no
			// preset of its own, a load gives the engine's starting sound and makes the track a MIDI track
			expect(groups(sys(d).presets).at(-1)).toBe('midi');
			await toGroup(d, 'midi');
			expect(chosen(d)[0]).toBe('midi');
			await d.push(2);
			expect(d.screen()).toMatch(/^midi: channel 1, bank none, program /);
			// a midi preset of the user's is listed and loads as any preset does
			addMidiPreset(d);
			await d.withShift(() => d.click('track.3'));
			await toGroup(d, 'midi');
			expect(chosen(d)).toEqual(['midi', 'my midi']);
		});

		it('picks an engine or category with E1 and a preset with E2, E3 or E4; a click loads it and leaves for M1: the whole sound changes, the steps stay', async () => {
			const d = await start();
			await d.clicks('track.3', key('c4'), step(1));
			await d.withShift(() => d.click('track.3'));
			await d.push(1); // by category
			await toGroup(d, 'lead');
			expect(chosen(d)).toEqual(['lead', 'asinine']); // the first, by name
			await d.turn(2, 1);
			await d.turn(3, 1);
			await d.turn(4, -1);
			expect(chosen(d)).toEqual(['lead', 'azimuth']);
			await d.push(3);
			// the device shows the new sound's M1 straight after (b1-1568 → 1569)
			expect(d.state.tracks[2].engine).toBe('sampler');
			expect(d.screen()).toMatch(/^sampler, root /);
			await d.withShift(() => d.click('track.3'));
			expect(chosen(d)).toEqual(['lead', 'azimuth']); // the view it was left in
			await d.turn(2, 2);
			await d.push(2); // bowed
			expect(d.state.tracks[2].engine).toBe('axis');
			await d.withShift(() => d.click('track.3'));
			await d.turn(4, 1);
			await d.push(4); // burbie
			expect(d.state.tracks[2].engine).toBe('simple');
			expect(d.frame.page).toBe('synth');
			expect(d.screen()).toMatch(/^simple: /);
			expect(d.steps()).toBe('w...............');
		});

		it('opens only in instrument mode: shift + a track key in auxiliary mode brings up no preset page', async () => {
			const d = await start();
			await d.click('key.auxiliary');
			await d.withShift(() => d.click('track.3'));
			expect(d.frame.page).not.toBe('text');
			expect(d.screen()).not.toContain('preset');
		});

		it('follows another track with shift + its key (ours)', async () => {
			const d = await start();
			await d.withShift(() => d.click('track.3'));
			await d.withShift(() => d.click('track.1'));
			expect(d.screen()).toBe('presets for track 1, by engine: drum, boop'); // a new project's
			expect(d.led('track.1')).toBe('white');
		});

		it('moves a user preset: M1 cuts it, M2 pastes it into the folder chosen', async () => {
			const d = await start();
			await d.holding('track.3', () => d.click('key.m4')); // a user preset
			await d.withShift(() => d.click('track.3'));
			await d.push(1); // by category: the folders
			expect(chosen(d)).toEqual(['snapshot', `${TODAY} (1)`]);
			// a user preset brings up cut · paste · rename · delete (device, b1-1531)
			expect(browser(d).soft.map((l) => l?.text)).toEqual(['cut', 'paste', 'rename', 'delete']);
			await d.withShift(() => d.click('key.m1'));
			await d.click('key.m1'); // a new folder, named "folder 1"
			expect(chosen(d)).toEqual(['folder 1', null]);
			await toGroup(d, 'snapshot');
			await d.click('key.m1');
			expect(browser(d).presets.dim).toEqual([0]); // ours: dim until pasted
			await toGroup(d, 'folder 1');
			await d.click('key.m2');
			expect(chosen(d)).toEqual(['folder 1', `${TODAY} (1)`]);
			expect(presetsIn(d, 'snapshot')).toEqual([]);
			// the track still knows where its sound lives
			expect(sys(d).trackPresets[2]).toBe(`folder 1/${TODAY} (1)`);
		});

		it('will not paste over a preset of the same name in that folder', async () => {
			const d = await start();
			await d.holding('track.3', () => d.click('key.m4'));
			await d.withShift(() => d.click('track.3'));
			await d.push(1);
			await d.withShift(() => d.click('key.m1'));
			await d.click('key.m1');
			await toGroup(d, 'snapshot');
			await d.click('key.m1');
			await toGroup(d, 'folder 1');
			await d.click('key.m2');
			// the next save takes the free name in the snapshot folder again
			await d.holding('track.3', () => d.click('key.m4'));
			await d.withShift(() => d.click('track.3'));
			expect(chosen(d)).toEqual(['snapshot', `${TODAY} (1)`]);
			await d.click('key.m1');
			await toGroup(d, 'folder 1');
			expect(browser(d).soft[1]).toEqual({ text: 'paste', tone: 'dim' });
			await d.click('key.m2');
			expect(presetsIn(d, 'folder 1')).toEqual([`${TODAY} (1)`]);
			expect(presetsIn(d, 'snapshot')).toEqual([`${TODAY} (1)`]);
		});

		it('renames a user preset with M3: E1 picks the character, E2 changes it, M1 confirms', async () => {
			const d = await start();
			await d.holding('track.3', () => d.click('key.m4'));
			await d.withShift(() => d.click('track.3'));
			await d.click('key.m3');
			expect(d.screen()).toBe(`rename preset: "${TODAY} (1)", character 14 is ")"`);
			await spell(d, 'fat bass');
			await d.click('key.m1');
			expect(chosen(d)).toEqual(['prism', 'fat bass']);
			expect(sys(d).trackPresets[2]).toBe('snapshot/fat bass');
		});

		it('deletes a user preset with M4; factory presets stay', async () => {
			const d = await start();
			await d.holding('track.3', () => d.click('key.m4'));
			await d.withShift(() => d.click('track.3'));
			// dates sort before letters: the snapshot is prism's first preset
			expect(chosen(d)).toEqual(['prism', `${TODAY} (1)`]);
			await d.click('key.m4');
			expect(chosen(d)).toEqual(['prism', 'alloy']);
			await d.turn(1, -20);
			await d.click('key.m4');
			expect(chosen(d)).toEqual(['axis', 'bellissimo']);
			expect(presetsIn(d, 'pluck')).toContain('bellissimo');
		});

		it('keeps its soft keys while a note sounds: a held key and M4 still delete the preset (ours)', async () => {
			const d = await start(); // track 1: the drum sampler, whose M1 page has key + M4
			await d.holding('track.1', () => d.click('key.m4'));
			await d.withShift(() => d.click('track.1'));
			await d.holding(key('c4'), () => d.click('key.m4'));
			expect(chosen(d)).toEqual(['drum', 'boop']);
			expect(presetsIn(d, 'snapshot')).toEqual([]);
			expect(smp(d).tracks[0].selection).toEqual([]);
		});

		it('makes a folder with shift + M1, renames it with shift + M3, deletes it with shift + M4 once it is empty', async () => {
			const d = await start();
			await d.withShift(() => d.click('track.3'));
			await d.push(1); // by category: the folders
			await d.withShift(() => d.click('key.m1'));
			expect(d.screen()).toBe('new folder: "folder 1", character 8 is "1"'); // ours
			await d.click('key.m1');
			expect(chosen(d)).toEqual(['folder 1', null]);
			await d.withShift(() => d.click('key.m3'));
			await spell(d, 'mine');
			await d.click('key.m1');
			expect(chosen(d)).toEqual(['mine', null]);
			// a folder with a preset in it stays
			await d.holding('track.3', () => d.click('key.m4'));
			await d.withShift(() => d.click('track.3'));
			await d.click('key.m1');
			await toGroup(d, 'mine');
			await d.click('key.m2');
			await d.withShift(() => d.click('key.m4'));
			expect(chosen(d)).toEqual(['mine', `${TODAY} (1)`]);
			// emptied, it goes
			await d.click('key.m4');
			expect(chosen(d)).toEqual(['mine', null]);
			await d.withShift(() => d.click('key.m4'));
			expect(browser(d).groups.items).not.toContain('mine');
		});

		it('scrambles a track’s sound with its key held and M1, differently each time', async () => {
			const d = await start();
			await d.click('track.5');
			const before = d.screen();
			await d.holding('track.5', () => d.click('key.m1'));
			const once = d.screen();
			expect(once).not.toBe(before);
			await d.holding('track.5', () => d.click('key.m1'));
			expect(d.screen()).not.toBe(once);
			expect(d.screen()).toMatch(/^dissolve: /); // the engine stays
		});

		it('leaves a MIDI track as it is when scrambled (OS 1.0.45)', async () => {
			const d = await start();
			await d.click('track.3');
			addMidiPreset(d);
			await loadEngine(d, 'midi');
			const before = d.screen();
			await d.holding('track.3', () => d.click('key.m1'));
			expect(d.screen()).toBe(before);
		});

		it('copies a track’s sound with its key held and M2, and pastes it onto another track held with M3', async () => {
			const d = await start();
			await d.clicks('track.3', key('c4'), step(1), 'track.5');
			const five = d.screen();
			await d.holding('track.5', () => d.click('key.m2'));
			await d.holding('track.3', () => d.click('key.m3'));
			expect(d.screen()).toBe(five);
			expect(d.state.tracks[2].engine).toBe('dissolve');
			expect(d.steps()).toBe('w...............'); // track 3's steps stay
		});

		it('copies a sampler track’s samples along with its sound: a take on a drum key reaches the other track', async () => {
			const d = await start();
			await d.click('key.sample');
			await noThreshold(d);
			await record(d, 1000); // onto F3 of track 1
			await d.click('track.1');
			await d.holding('track.1', () => d.click('key.m2'));
			await d.holding('track.2', () => d.click('key.m3'));
			await d.click('key.sample');
			expect(d.screen()).toBe('drum sampler record: ready, take 1.wav, mic, gain 0');
		});

		it('saves a sampler track’s samples in the preset (the manual: saving copies them): loaded elsewhere, the take comes along', async () => {
			const d = await start();
			await d.click('key.sample');
			await noThreshold(d);
			await record(d, 1000);
			await d.click('track.1');
			await d.holding('track.1', () => d.click('key.m4'));
			await d.withShift(() => d.click('track.2'));
			// by engine, on track 2's in phase: the snapshot is the drum sampler's first preset
			expect(chosen(d)).toEqual(['drum', 'in phase']);
			await d.turn(2, -20);
			expect(chosen(d)).toEqual(['drum', `${TODAY} (1)`]);
			await d.push(2);
			await d.clicks('track.2', 'key.sample');
			expect(d.screen()).toBe('drum sampler record: ready, take 1.wav, mic, gain 0');
		});

		it('saves a track’s sound as a new dated preset in the snapshot folder with its key held and M4', async () => {
			const d = await start();
			await d.holding('track.3', () => d.click('key.m4'));
			await d.holding('track.3', () => d.click('key.m4'));
			expect(presetsIn(d, 'snapshot')).toEqual([`${TODAY} (1)`, `${TODAY} (2)`]);
			await d.withShift(() => d.click('track.3'));
			expect(chosen(d)).toEqual(['prism', `${TODAY} (2)`]);
			await d.push(1);
			expect(chosen(d)).toEqual(['snapshot', `${TODAY} (2)`]);
		});

		it('writes back into the snapshot the sound came from with shift added before M4 (OS 1.1.17; ours: track key first)', async () => {
			const d = await start();
			await d.holding('track.3', () => d.click('key.m4'));
			await d.turn(1, 5); // shape 20 (a new project's shoulder has 15)
			await d.holding('track.3', () => d.withShift(() => d.click('key.m4')));
			expect(presetsIn(d, 'snapshot')).toEqual([`${TODAY} (1)`]);
			// loaded onto track 4, it has the change
			await d.withShift(() => d.click('track.4'));
			await toGroup(d, 'prism');
			expect(chosen(d)).toEqual(['prism', `${TODAY} (1)`]);
			await d.push(2);
			expect(d.state.track).toBe(3);
			expect(d.screen()).toMatch(/^prism: shape 20, /);
		});
	});

	describe('18 sample', () => {
		it('opens the record page of the track’s sampler from any screen; on other tracks it records to the library', async () => {
			const d = await start();
			await d.click('key.sample');
			expect(d.screen()).toBe('drum sampler record: ready, kick 1.wav, mic, gain 0');
			await d.clicks('track.1', 'track.3', 'key.sample');
			expect(d.screen()).toBe('record to the library: ready, mic, gain 0');
			expect(on(d, 'sample-record').header).toBe('prompt');
			await d.clicks('track.3', 'track.8', 'key.mix', 'key.project', 'key.sample');
			expect(d.screen()).toBe('multisampler record: ready, pad a3.wav, mic, gain 0');
		});

		it('closes with the lit track key (ours: or with sample again)', async () => {
			const d = await start();
			await d.clicks('track.3', 'key.sample');
			expect(d.led('track.3')).toBe('white');
			await d.click('track.3');
			expect(d.frame.page).toBe('synth');
			await d.clicks('key.sample', 'key.sample');
			expect(d.frame.page).toBe('synth');
		});

		it('records to the library from an auxiliary track, which is no sample track, and closes with its lit key', async () => {
			const d = await start(); // instrument track 1 is still the drum sampler underneath
			await d.clicks('key.auxiliary', 'track.3', 'key.sample');
			expect(d.screen()).toBe('record to the library: ready, mic, gain 0');
			expect(d.lit()).toEqual([]);
			await noThreshold(d);
			await record(d, 1000);
			expect(d.screen()).toBe('record to the library: ready, take 1.wav, mic, gain 0');
			expect(smp(d).tracks[0].keys[0]?.name).toBe('kick 1.wav');
			expect(d.led('track.3')).toBe('red');
			await d.click('track.3');
			expect(d.frame.page).not.toBe('sample-record');
			await d.withShift(() => d.click('key.sample'));
			expect(on(d, 'sample-library').keyControls).toBe(false);
		});

		it('opens even over a settings page or the preset browser', async () => {
			const d = await start();
			await d.clicks('track.3', 'key.project', 'key.m4', 'key.sample');
			expect(d.screen()).toBe('record to the library: ready, mic, gain 0');
			await d.click('track.3');
			await d.withShift(() => d.click('track.3'));
			await d.click('key.sample');
			expect(d.screen()).toBe('record to the library: ready, mic, gain 0');
		});

		it('sets the source with E1, the gain with E3 (the meter shows the level) and the threshold with E4', async () => {
			const d = await start();
			await d.clicks('track.3', 'key.sample');
			const f = () => on(d, 'sample-record');
			await d.turn(1, 1);
			expect(f().source).toBe('line in');
			await d.turn(1, 5);
			expect(f().source).toBe('usb'); // mic, line in, usb: the list stops there
			await d.turn(3, 11);
			expect(d.screen()).toBe('record to the library: ready, usb, gain +11');
			await d.turn(4, 27);
			expect(f().threshold).toBeCloseTo(47 / 99, 9);
			const levels = new Set<number>();
			for (let i = 0; i < 12; i++) {
				levels.add(f().level);
				await d.wait(100);
			}
			expect(levels.size).toBeGreaterThan(1);
		});

		it('picks the input channel of line in and USB with shift + E1; the microphone has none', async () => {
			const d = await start();
			await d.clicks('track.3', 'key.sample');
			await d.withShift(async () => {
				await d.turn(1, 1);
				expect(on(d, 'sample-record').channel).toBeNull();
			});
			await d.turn(1, 1);
			await d.withShift(async () => {
				expect(d.screen()).toBe('record to the library: ready, line in 1+2');
				await d.turn(1, 1);
				expect(d.screen()).toBe('record to the library: ready, line in 1');
			});
			await d.turn(1, 1); // usb: its channels start over
			await d.withShift(async () => {
				expect(d.screen()).toBe('record to the library: ready, usb 1+2');
			});
		});

		it('records only while M1 is held and once the input passes the threshold', async () => {
			const d = await start();
			await d.clicks('track.3', 'key.sample');
			await d.turn(4, 99); // the stand-in input never gets that loud
			await d.down('key.m1');
			await d.wait(2000);
			expect(d.screen()).toBe('record to the library: armed, mic, gain 0');
			await d.up('key.m1');
			await d.wait(GAP_MS);
			expect(d.screen()).toBe('record to the library: ready, mic, gain 0');
			expect(smp(d).user).toEqual([]);
			await noThreshold(d);
			await d.down('key.m1');
			await d.wait(1500);
			expect(d.screen()).toMatch(/^record to the library: recording, 18:\d\d left/);
			await d.up('key.m1');
			await d.wait(GAP_MS);
			expect(d.screen()).toBe('record to the library: ready, take 1.wav, mic, gain 0');
			expect(smp(d).user.map((f) => f.name)).toEqual(['take 1.wav']);
		});

		it('counts down from 20 seconds while recording and stops by itself at the limit', async () => {
			const d = await start();
			await d.clicks('track.3', 'key.sample');
			await noThreshold(d);
			await d.down('key.m1');
			await d.wait(100);
			expect(d.screen()).toMatch(/recording, 19:\d\d left/);
			await d.wait(5000);
			expect(d.screen()).toMatch(/recording, 14:\d\d left/);
			await d.wait(16000);
			expect(d.screen()).toBe('record to the library: ready, take 1.wav, mic, gain 0');
			await d.up('key.m1');
			await d.wait(GAP_MS);
			expect(smp(d).user.map((f) => f.seconds)).toEqual([20]);
		});

		it('plays the take with M2 and throws it away with M4 before it reaches the library', async () => {
			const d = await start();
			await d.clicks('track.3', 'key.sample');
			await noThreshold(d);
			await record(d, 1000);
			expect(on(d, 'sample-record').soft).toMatchObject({ play: true, clear: true });
			await d.click('key.m2');
			expect(smp(d).record.playing).toBe(true);
			await d.wait(1100);
			expect(smp(d).record.playing).toBe(false);
			await d.click('key.m4');
			expect(d.screen()).toBe('record to the library: ready, mic, gain 0');
			expect(smp(d).user).toEqual([]);
		});
	});

	describe('18.1 one shot synth sampler', () => {
		it('starts sampling with a played key, which becomes the note the sample is tuned to (ours: while it is held)', async () => {
			const d = await start();
			await d.click('track.3');
			await loadEngine(d, 'sampler');
			await d.click('key.sample');
			// TE's art: a prompt, the sample a take would replace, and no soft keys
			expect(d.screen()).toBe('synth sampler record: ready, keys c4.wav, mic, gain 0');
			expect(on(d, 'sample-record')).toMatchObject({ header: 'prompt', nameTone: 'light' });
			expect(on(d, 'sample-record').soft).toEqual({
				record: false,
				play: null,
				arrows: false,
				clear: null
			});
			await noThreshold(d);
			await d.down(key('a3'));
			await d.wait(1200);
			expect(d.screen()).toMatch(/^synth sampler record: recording/);
			await d.up(key('a3'));
			await d.wait(GAP_MS);
			expect(d.screen()).toBe('synth sampler record: ready, take 1.wav, mic, gain 0');
			await d.click('track.3');
			expect(d.screen()).toBe('sampler, root A: tune +0.00');
			expect(smp(d).tracks[2].synth.root).toBe(noteOf('a3'));
		});

		it('M1: E1 moves the sample start, E2 the loop start, E3 the loop end, E4 the sample end, finer pushed in', async () => {
			const d = await start();
			await d.click('track.3');
			await loadEngine(d, 'sampler');
			const f = () => on(d, 'drum');
			// the loop a unit sets after sampling: 20–80 %, forever
			expect([f().start, f().sampler?.loop?.start, f().sampler?.loop?.end, f().end]).toEqual([
				0, 0.2, 0.8, 1
			]);
			await d.turn(1, 10);
			await d.turn(1, 5, { fine: true });
			expect(f().start).toBeCloseTo(0.105, 9);
			await d.turn(2, 10);
			expect(f().sampler?.loop?.start).toBeCloseTo(0.3, 9);
			await d.turn(3, -10);
			expect(f().sampler?.loop?.end).toBeCloseTo(0.7, 9);
			await d.turn(4, -20);
			expect(f().end).toBeCloseTo(0.8, 9);
			// loop start at the end of the sample: no loop
			await d.turn(2, 100);
			expect(f().sampler?.loop).toMatchObject({ start: f().end, end: f().end });
		});

		it('M1 with shift: E1 the direction, E2 the tune, E3 the loop crossfade, E4 the sample gain', async () => {
			const d = await start();
			await d.click('track.3');
			await loadEngine(d, 'sampler');
			await d.withShift(async () => {
				expect(d.screen()).toBe('sampler, root C (shift): tune +0.00');
				await d.turn(1, -1);
				await d.turn(2, 5);
				await d.turn(3, 40);
				await d.turn(4, -6);
				const f = on(d, 'drum');
				expect([f.reverse, f.tune]).toEqual([true, '+0.50']);
				expect(f.fade).toBeCloseTo(40 / 99, 9);
				expect(f.gain).toBeCloseTo(24 / 50, 9); // −6 dB on −30…+20
			});
		});

		it('switches the loop type with shift + a click of E3: forever, until release, off', async () => {
			const d = await start();
			await d.click('track.3');
			await loadEngine(d, 'sampler');
			const type = () => on(d, 'drum').sampler?.loop?.type;
			const seen = [type()];
			for (let i = 0; i < 3; i++) {
				await d.withShift(() => d.push(3));
				seen.push(type());
			}
			expect(seen).toEqual(['forever', 'release', 'off', 'forever']);
		});
	});

	describe('18.2 drum sampler', () => {
		it('selects a key with a press, which lights, and records onto it while M1 is held; the take also goes to the user folder', async () => {
			const d = await start();
			await d.click('key.sample');
			expect(on(d, 'sample-record').soft).toEqual({
				record: true,
				play: null,
				arrows: true,
				clear: true
			});
			await d.click(key('c4'));
			expect(d.led(key('c4'))).toBe('white');
			expect(d.led(key('f3'))).toBe('dim'); // ours: keys holding a sample glow
			await noThreshold(d);
			await record(d, 1000);
			expect(d.screen()).toBe('drum sampler record: ready, take 1.wav, mic, gain 0');
			expect(smp(d).tracks[0].keys[7]?.name).toBe('take 1.wav');
			expect(smp(d).user.map((f) => f.name)).toEqual(['take 1.wav']);
			expect(d.state.tracks[0].drumKeys[7].playMode).toBe('oneshot');
		});

		it('gives a long take the key play mode, sounding only while held (OS 1.0.32; ours: past 2.5 s)', async () => {
			const d = await start();
			await d.click('key.sample');
			await noThreshold(d);
			await record(d, 3000);
			expect(d.state.tracks[0].drumKeys[0].playMode).toBe('key');
		});

		it('steps with M2 / M3 to the previous / next key holding a sample, past empty ones; M4 clears a key but keeps its file', async () => {
			const d = await start();
			await d.click('key.sample');
			for (const k of ['fs3', 'g3', 'gs3', 'a3', 'as3', 'b3']) await d.clicks(key(k), 'key.m4');
			expect(d.led(key('a3'))).toBe('off');
			expect(on(d, 'sample-record').soft.clear).toBe(false);
			await d.clicks(key('f3'), 'key.m3');
			expect(d.lit()).toEqual(['c4']);
			await d.click('key.m2');
			expect(d.lit()).toEqual(['f3']);
			// a take cleared off its key stays in the library
			await noThreshold(d);
			await record(d, 1000);
			await d.click('key.m4');
			expect(smp(d).tracks[0].keys[0]).toBeNull();
			expect(smp(d).user.map((f) => f.name)).toEqual(['take 1.wav']);
		});

		it('M1: E1 tunes the selected key, E2 and E3 move its start and end (finer pushed in), E4 sets its play mode', async () => {
			const d = await start();
			const f = () => on(d, 'drum');
			expect(d.screen()).toBe('drum key F3: tune +0.00, play mode oneshot');
			await d.turn(1, 5);
			await d.turn(1, 3, { fine: true });
			expect(f().tune).toBe('+0.53');
			await d.turn(2, 10);
			await d.turn(2, 5, { fine: true });
			expect(f().start).toBeCloseTo(10.5 / 99, 9);
			await d.turn(3, -9);
			await d.turn(3, -5, { fine: true });
			expect(f().end).toBeCloseTo(89.5 / 99, 9);
			await d.turn(4, -3);
			const modes: string[] = [];
			for (let i = 0; i < 4; i++) {
				modes.push(f().playMode);
				await d.turn(4, 1);
			}
			expect(modes).toEqual(['key', 'oneshot', 'mute group', 'loop']);
		});

		it('M1 with shift: E1 the direction, E2 the pan, E3 the fade, E4 the gain of the selected key', async () => {
			const d = await start();
			await d.withShift(async () => {
				expect(d.screen()).toBe('drum key F3 (shift): tune +0.00, play mode oneshot');
				await d.turn(1, -1);
				await d.turn(2, 10);
				await d.turn(3, 30);
				await d.turn(4, -40);
			});
			const k = d.state.tracks[0].drumKeys[0];
			expect([k.reverse, k.pan, k.fade, k.gain]).toEqual([true, 20, 30, -30]); // ours: pan 2 a detent
			const f = on(d, 'drum');
			expect([f.reverse, f.pan, f.gain]).toEqual([true, 0.2, 0]);
			expect(f.fade).toBeCloseTo(30 / 99, 9);
		});

		it('keeps each key’s settings apart: a key pressed on M1 selects it', async () => {
			const d = await start();
			await d.turn(1, 10);
			await d.click(key('g3'));
			expect(d.screen()).toBe('drum key G3: tune +0.00, play mode oneshot');
			await d.click(key('f3'));
			expect(d.screen()).toBe('drum key F3: tune +1.00, play mode oneshot');
		});

		it('copies a key with it held and M2, and pastes onto another key held with M3', async () => {
			const d = await start();
			await d.turn(1, 10);
			await d.holding(key('f3'), () => d.click('key.m2'));
			await d.holding(key('c4'), () => d.click('key.m3'));
			expect(d.screen()).toBe('drum key C4: tune +1.00, play mode oneshot');
			expect(smp(d).tracks[0].keys[7]?.name).toBe('kick 1.wav');
		});

		it('selects several keys, each held with M4, so one turn edits them all', async () => {
			const d = await start();
			await d.holding(key('f3'), () => d.click('key.m4'));
			await d.holding(key('g3'), () => d.click('key.m4'));
			expect(d.screen()).toBe('drum key G3 +1: tune +0.00, play mode oneshot');
			await d.turn(1, 5);
			expect(d.state.tracks[0].drumKeys.slice(0, 3).map((k) => k.tune)).toEqual([0.5, 0, 0.5]);
			await d.holding(key('f3'), () => d.click('key.m4')); // ours: again leaves the selection
			expect(smp(d).tracks[0].selection).toEqual([2]);
		});
	});

	describe('18.2 sample slicer', () => {
		it('opens with a key held and M1 on the drum sampler’s M1 page, in transient mode', async () => {
			const d = await start();
			await slicer(d);
			expect(d.screen()).toMatch(/^slice transient: \d+ slices$/);
			expect(on(d, 'sample-slice').markers.length).toBeGreaterThan(1);
		});

		it('transient: E4 sets how many slices; a key selects its slice, which lights, and E2 / E3 move its start and end', async () => {
			const d = await start();
			await slicer(d);
			await d.turn(4, -30);
			expect(d.screen()).toBe('slice transient: 1 slices');
			await d.turn(4, 2);
			expect(d.screen()).toBe('slice transient: 3 slices'); // TE's art: three, for this loop
			await d.click(key('fs3'));
			expect(d.lit()).toEqual(['fs3']);
			expect(['f3', 'g3'].map((k) => d.led(key(k)))).toEqual(['dim', 'dim']); // ours
			const before = markers(d);
			await d.turn(2, 3);
			const moved = markers(d);
			expect(moved).not.toEqual(before);
			await d.turn(3, -3);
			expect(markers(d)).not.toEqual(moved);
			expect(on(d, 'sample-slice').markers.some((m) => m.selected)).toBe(true);
		});

		it('even: E2 and E3 set the section, E4 how many equal slices it gives', async () => {
			const d = await start();
			await slicer(d);
			await d.turn(1, 1);
			expect(d.screen()).toBe('slice even: 8 slices'); // ours: eight to start with
			await d.turn(4, -4);
			expect(d.screen()).toBe('slice even: 4 slices');
			expect(markers(d)).toEqual([0, 0.25, 0.5, 0.75, 1]);
			await d.turn(2, 20);
			await d.turn(3, -20);
			expect(markers(d)).toEqual([0.2, 0.35, 0.5, 0.65, 0.8]);
		});

		it('tap: M1 starts the sample and then marks a slice at each tap; M2 stops and lets the last one run to the end', async () => {
			const d = await start();
			await slicer(d);
			await d.turn(1, 2);
			expect(d.screen()).toBe('slice tap: 0 slices');
			await d.click('key.m1');
			expect(on(d, 'sample-slice').playhead).not.toBeNull();
			for (let i = 0; i < 3; i++) {
				await d.wait(400);
				await d.click('key.m1');
			}
			expect(d.screen()).toBe('slice tap: 2 slices');
			await d.click('key.m2');
			expect(d.screen()).toBe('slice tap: 3 slices');
			expect(on(d, 'sample-slice').playhead).toBeNull();
		});

		it('tap: a key picks a slice, E2 moves its start (the end of the one before), shift + its key deletes it', async () => {
			const d = await start();
			await slicer(d);
			await d.turn(1, 2);
			await d.click('key.m1');
			for (let i = 0; i < 3; i++) {
				await d.wait(400);
				await d.click('key.m1');
			}
			await d.click('key.m2');
			const taps = () => smp(d).slicer?.taps ?? [];
			const [, second] = taps();
			await d.click(key('fs3'));
			await d.turn(2, -3);
			expect(taps()[1]).toBeLessThan(second);
			expect(markers(d)).toEqual(taps());
			await d.withShift(() => d.click(key('fs3')));
			expect(d.screen()).toBe('slice tap: 2 slices');
		});

		it('done (M4) lays the slices over the keys from F3, cut to choke each other; cancel (M3) changes nothing (TE’s art: the labels there)', async () => {
			const d = await start();
			await slicer(d);
			await d.turn(1, 1);
			await d.turn(4, -4);
			await d.click('key.m3');
			expect(d.screen()).toBe('drum key C4: tune +0.00, play mode oneshot');
			expect(smp(d).tracks[0].keys[0]?.name).toBe('kick 1.wav');
			await d.holding(key('c4'), () => d.click('key.m1'));
			await d.turn(1, 1);
			await d.turn(4, -4);
			await d.click('key.m4');
			expect(d.frame.page).toBe('drum');
			expect(
				smp(d)
					.tracks[0].keys.slice(0, 5)
					.map((f) => f?.name)
			).toEqual([
				'cherry.wav',
				'cherry.wav',
				'cherry.wav',
				'cherry.wav',
				'rim 1.wav' // ours: the keys past the last slice stay
			]);
			const keys = d.state.tracks[0].drumKeys.slice(0, 4);
			expect(keys.map((k) => [k.start, k.end])).toEqual([
				[0, 25],
				[25, 50],
				[50, 74],
				[74, 99]
			]);
			expect(keys.every((k) => k.playMode === 'mute group')).toBe(true);
		});

		it('makes at most 24 slices, one a key', async () => {
			const d = await start();
			await slicer(d);
			await d.turn(1, 1);
			await d.turn(4, 30);
			expect(d.screen()).toBe('slice even: 24 slices');
		});
	});

	describe('18.3 multisampler', () => {
		it('records a zone on the selected key, which lights; each sample also plays the keys below it, down to the next zone', async () => {
			const d = await start();
			await d.clicks('track.8', 'key.sample', key('c4'));
			expect(d.led(key('c4'))).toBe('white');
			await noThreshold(d);
			await record(d, 1000);
			expect(d.screen()).toBe('multisampler record: ready, take 1.wav, mic, gain 0');
			expect(on(d, 'sample-record').keyboard?.tops).toEqual([57, 60, 64, 71, 76]);
			await d.clicks('track.8', key('as3'));
			expect(d.screen()).toBe('multisampler zone A#3: tune +0.00');
			expect(on(d, 'drum').sampler?.zone).toEqual({ lo: 58, hi: 60 });
		});

		it('steps through the keys holding samples with M2 / M3, and M4 clears the selected key’s zone (the keys below join the next one up)', async () => {
			const d = await start();
			await d.clicks('track.8', 'key.sample', key('f3'), 'key.m3');
			expect(d.lit()).toEqual(['a3']);
			await d.click('key.m3');
			expect(d.lit()).toEqual(['e4']);
			await d.click('key.m2');
			expect(d.lit()).toEqual(['a3']);
			await d.clicks('key.m3', 'key.m4');
			expect(on(d, 'sample-record').keyboard).toMatchObject({
				tops: [57, 71, 76],
				zone: { lo: 58, hi: 71 }
			});
		});

		it('holds at most 24 zones', async () => {
			const d = await start();
			await d.click('track.8');
			await d.withShift(() => d.click('key.sample'));
			for (const k of KEYBOARD) {
				await d.click(key(k));
				await d.push(2);
			}
			expect(smp(d).tracks[7].zones).toHaveLength(24);
			await d.clicks('key.plus', key('e5')); // an octave up, past the top zone
			await d.push(2);
			expect(smp(d).tracks[7].zones).toHaveLength(24);
			await d.click('track.8');
			expect(d.screen()).toBe('multisampler zone E6: tune +0.00, empty');
		});

		it('edits the selected key’s zone on M1 like the synth sampler, loop type included', async () => {
			const d = await start();
			await d.clicks('track.8', key('b3'));
			expect(d.screen()).toBe('multisampler zone B3: tune +0.00');
			expect(on(d, 'drum').sampler?.zone).toEqual({ lo: 58, hi: 64 });
			await d.turn(1, 10);
			await d.withShift(() => d.push(3));
			await d.click(key('e4')); // another key of the same zone
			expect(on(d, 'drum').start).toBeCloseTo(0.1, 9);
			expect(on(d, 'drum').sampler?.loop?.type).toBe('release');
			await d.click(key('f4')); // the next zone keeps its own
			expect(on(d, 'drum').start).toBe(0);
		});

		it('M1 with shift: the zone’s direction, tune, loop crossfade and gain (the guide’s captions say pan and fade: device check)', async () => {
			const d = await start();
			await d.clicks('track.8', key('b3'));
			await d.withShift(async () => {
				expect(d.screen()).toBe('multisampler zone B3 (shift): tune +0.00');
				await d.turn(1, -1);
				await d.turn(2, 12);
				await d.turn(3, 20);
				await d.turn(4, 5);
			});
			const f = on(d, 'drum');
			expect([f.reverse, f.tune]).toEqual([true, '+1.20']);
			expect(f.fade).toBeCloseTo(20 / 99, 9);
			expect(f.gain).toBeCloseTo(35 / 50, 9); // +5 dB on −30…+20
		});
	});

	describe('18.4 sample library', () => {
		it('opens with shift + sample: E1 picks a folder, E2–E4 a sample, which plays as soon as it is picked; stop ends it', async () => {
			const d = await start();
			await d.click('track.3');
			await d.withShift(() => d.click('key.sample'));
			expect(d.screen()).toBe('sample library: bass, aeroplane');
			expect(on(d, 'sample-library').folders.items).toEqual([
				'bass',
				'drum',
				'keys',
				'lead',
				'organ',
				'pad',
				'pluck',
				'sampler'
			]);
			await d.turn(2, 2);
			expect(d.screen()).toBe('sample library: bass, cherry');
			expect(smp(d).library.previewing).toBe(true);
			await d.turn(3, 1);
			await d.turn(4, 1);
			expect(d.screen()).toBe('sample library: bass, exoex');
			await d.click('key.stop');
			expect(smp(d).library.previewing).toBe(false);
			await d.turn(1, 1);
			expect(d.screen()).toBe('sample library: drum, [kit 1]');
		});

		it('shows sub-folders in square brackets and opens one with a click of any encoder (ours: M1 goes back up)', async () => {
			const d = await start();
			await d.click('track.3');
			await d.withShift(() => d.click('key.sample'));
			await d.turn(1, 1);
			await d.push(4);
			expect(d.screen()).toBe('sample library: kit 1, kick 1');
			await d.turn(1, 1);
			expect(d.screen()).toBe('sample library: kit 2, kick 1');
			await d.click('key.m1');
			expect(d.screen()).toBe('sample library: drum, [kit 2]');
		});

		it('loads the picked sample with a click, onto the drum key held when the library opened (OS 1.1.0)', async () => {
			const d = await start();
			await d.holding(key('c4'), () => d.click('key.sample'));
			await d.turn(2, 2);
			await d.push(2);
			expect(smp(d).tracks[0].keys[7]?.name).toBe('cherry.wav');
			expect(smp(d).library.previewing).toBe(false);
			await d.click('track.1');
			expect(d.screen()).toBe('drum key C4: tune +0.00, play mode oneshot');
		});

		it('steps through filled keys with M2 / M3 and clears with M4 on the drum sampler and multisampler only', async () => {
			const d = await start();
			await d.withShift(() => d.click('key.sample'));
			expect(on(d, 'sample-library').keyControls).toBe(true);
			await d.click('key.m3');
			expect(d.lit()).toEqual(['fs3']);
			await d.click('key.m4');
			expect(smp(d).tracks[0].keys[1]).toBeNull();
			await d.click('key.m2');
			expect(d.lit()).toEqual(['f3']);
			await d.clicks('track.1', 'track.8');
			await d.withShift(() => d.click('key.sample'));
			expect(on(d, 'sample-library').keyControls).toBe(true);
			await d.clicks('track.8', 'track.3');
			await d.withShift(() => d.click('key.sample'));
			expect(on(d, 'sample-library').keyControls).toBe(false);
		});

		it('loads into the synth sampler as its sample, and into a multisampler zone on the selected key', async () => {
			const d = await start();
			await d.click('track.3');
			await loadEngine(d, 'sampler');
			await d.withShift(() => d.click('key.sample'));
			await d.turn(2, 2);
			await d.push(2);
			expect(smp(d).tracks[2].synth.file?.name).toBe('cherry.wav');
			await d.clicks('track.3', 'track.8');
			await d.holding(key('c4'), () => d.click('key.sample'));
			await d.turn(2, 2);
			await d.push(2);
			expect(smp(d).tracks[7].zones.map((z) => z.note)).toEqual([57, 60, 64, 71, 76]);
		});

		it('lists recordings in the user folder', async () => {
			const d = await start();
			await d.clicks('track.3', 'key.sample');
			await noThreshold(d);
			await record(d, 1000);
			await d.click('track.3');
			await d.withShift(() => d.click('key.sample'));
			await d.turn(1, 8);
			expect(d.screen()).toBe('sample library: user, take 1');
		});

		it('stays quiet while browsing once sample preview is off in the system settings (OS 1.1.17; ours: in the system section)', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m1');
			await d.turn(2, 5);
			expect(picks(d)).toEqual(['system', 'sample preview', 'on']);
			await d.turn(3, -1);
			await d.clicks('key.m1', 'key.com', 'track.3');
			await d.withShift(() => d.click('key.sample'));
			await d.turn(2, 2);
			expect(d.screen()).toBe('sample library: bass, cherry');
			expect(smp(d).library.previewing).toBe(false);
		});

		it('only previews on a track without a sampler (ours)', async () => {
			const d = await start();
			await d.click('track.3');
			await d.withShift(() => d.click('key.sample'));
			await d.turn(2, 2);
			await d.push(2);
			expect(d.screen()).toBe('sample library: bass, cherry');
			expect(d.state.tracks[2].engine).toBe('prism');
		});
	});

	describe('22 how to', () => {
		it('22.1 switches the keyboard to velocity: com, M1, the keyboard section, E3 to soft or hard; M1 back, instrument to play', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m1');
			await d.turn(1, 1);
			expect(picks(d)).toEqual(['keyboard', 'velocity', 'off']);
			await d.turn(3, 1);
			expect(picks(d)[2]).toBe('soft');
			await d.turn(3, 1);
			expect(picks(d)[2]).toBe('hard');
			await d.click('key.m1');
			expect(d.frame.page).toBe('com');
			await d.click('key.instrument');
			expect(d.frame.page).toBe('drum');
			expect(sys(d).system.velocity).toBe(2);
		});

		it('22.2–22.6 turns E3 on the com page until the multi-out shows midi, cv, sync24, sync8 or audio', async () => {
			const d = await start();
			await d.click('key.com');
			for (const mode of ['midi', 'cv/gate', 'sync24', 'sync8', 'audio']) {
				await d.turn(3, -9);
				for (let turns = 0; turns < 6 && on(d, 'com').multiOut !== mode; turns++) {
					await d.turn(3, 1);
				}
				expect(d.screen()).toBe(`com: multi-out ${mode}`);
			}
		});

		it('22.2 advertises over bluetooth with a click of E1 on the com page', async () => {
			const d = await start();
			await d.click('key.com');
			await d.push(1);
			expect(d.screen()).toBe('com: multi-out midi, bluetooth advertising');
		});

		it('22.7 sets what each device may send and receive: clock, notes, other, timestamp and velocity', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m3');
			const seen: string[] = [];
			for (let i = 0; i < 5; i++) {
				seen.push(d.screen().split('; ')[1]);
				await d.turn(2, 1);
			}
			expect(seen).toEqual([
				'clock both',
				'notes both',
				'other both',
				'timestamp off',
				'velocity on'
			]);
			await d.turn(4, -1);
			expect(d.screen()).toBe('devices: computer, connected; velocity off');
		});

		it('22.8 picks usb as the record source with E1 and its channel with shift + E1 (ours, from 18; the how-to says E2: device check)', async () => {
			const d = await start();
			await d.click('key.sample');
			await d.turn(1, 2);
			expect(on(d, 'sample-record').source).toBe('usb');
			await d.withShift(async () => {
				await d.turn(1, 1);
				expect(on(d, 'sample-record').channel).toBe('3+4');
				await d.turn(2, 1); // E2 leaves the channel alone here
				expect(on(d, 'sample-record').channel).toBe('3+4');
			});
		});

		it('22.9 aims the pitchbend at a parameter (preset settings, mod), turns its pitch bend off (M2, shift + E3) and saves it all with the sound', async () => {
			const d = await start();
			await d.click('track.3');
			await d.withShift(() => d.click('key.instrument'));
			await d.turn(1, 1);
			await d.turn(2, 4);
			expect(picks(d)).toEqual(['mod', 'pitchbend target', 'none']);
			await d.turn(3, 5);
			expect(picks(d)[2]).toBe('cutoff');
			await d.turn(2, 1);
			await d.turn(3, -40); // a negative amount inverts it
			expect(picks(d)).toEqual(['mod', 'pitchbend amount', '-40']);
			await d.click('key.m2');
			expect(d.frame.page).toBe('envelope');
			await d.withShift(async () => {
				await d.turn(3, -2); // a new project's shoulder bends 2 semitones: 1, then off
				expect(d.screen()).toBe('play mode mono, portamento 00, bend off, volume 75');
			});
			await d.holding('track.3', () => d.click('key.m4'));
			// the saved sound brings its preset settings and bend range along to another track
			await d.withShift(() => d.click('track.4'));
			await toGroup(d, 'prism');
			expect(chosen(d)).toEqual(['prism', `${TODAY} (1)`]);
			await d.push(2);
			await d.click('track.4');
			await d.withShift(() => d.click('key.instrument'));
			expect(picks(d)).toEqual(['mod', 'pitchbend amount', '-40']);
			await d.turn(2, -1);
			expect(picks(d)).toEqual(['mod', 'pitchbend target', 'cutoff']);
			await d.click('key.m2');
			await d.withShift(async () => {
				expect(d.screen()).toBe('play mode mono, portamento 00, bend off, volume 75');
			});
		});

		it('22.10–22.11 reaches the files with com then M4, and ejects with M4 before unplugging', async () => {
			const d = await start();
			await d.clicks('key.com', 'key.m4');
			expect(on(d, 'system-link').mode).toBe('mtp');
			await d.click('key.m4');
			expect(d.frame.page).toBe('com');
		});
	});

	describe('24 te boot', () => {
		it('is on and past its boot when the app opens', async () => {
			const d = await start();
			expect(sys(d).power).toMatchObject({ on: true, booting: false });
			expect(d.frame.page).toBe('drum');
		});

		// not testable in both runners: the replica draws no power switch (src/lib/replica), so the
		// app's driver cannot flip it, and TE boot (com held while powering on) is not modelled
		it.skip('boots back to the last track after power off and on; com held while powering on opens TE boot', async () => {
			const d = await start();
			await d.click('track.3');
			await d.click('switch.power');
			expect(d.screen()).toBe('switched off');
			await d.holding('key.com', () => d.click('switch.power'));
			await d.wait(3000);
			expect(d.screen()).toContain('te boot');
		});
	});
}
