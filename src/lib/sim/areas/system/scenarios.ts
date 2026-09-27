/**
 * Simulator states that reproduce TE's guide art for the system area (see `../../scenarios.ts`).
 * Where the art shows content our model cannot know (TE's example projects, presets and devices),
 * the scenario loads the art's names into the virtual unit first, the way a unit with that content
 * would look; the notes say where our pages differ from the drawing on purpose.
 */
import { KEYBOARD_NOTE_NAMES, type EngineId } from '$lib/core/opxy';
import type { OpxySim } from '../../opxy-sim.svelte';
import type { Scenario } from '../../scenarios';
import type { PresetEntry } from './catalogue';
import { groups } from './presets';

/** The example names TE's drawings use for projects and presets (project-014, instrument-118). */
const ART_NAMES = [
	'aeroplane',
	'apes are us',
	'cherry',
	'classix',
	'exoex',
	'grits',
	'hard spunch'
];

/** Why the PNG comparison overstates the difference for com-022 and com-039. */
const WIDE_CANVAS =
	'This SVG’s canvas is 217 units wide around the 215-unit screen, so its guide PNG is 0.8 % smaller and 4 px in; against the SVG re-framed to the screen the page is within 0.6 %.';

/** Loads an engine onto instrument track `n` (1–8) without a preset. */
function engine(sim: OpxySim, n: number, id: EngineId): void {
	sim.state.tracks[n - 1].engine = id;
}

/** Turns an encoder by as many detents as `at()` is away from `want`. */
function turnTo(sim: OpxySim, encoder: 1 | 2 | 3 | 4, at: () => number, want: number): void {
	const delta = want - at();
	if (delta !== 0) sim.turn(encoder, delta);
}

export const scenarios: readonly Scenario[] = [
	{
		id: 'project-usage',
		png: 'project-004-when-creating-complex-projects-you-may-s.png',
		title: 'project · usage indicators',
		page: 'project',
		note: 'TE drew this picture’s pen nib and name a little greyer (#dcdcde) than project-003’s; we keep one white.',
		setup: (sim) => {
			sim.state.project.name = 'demo 1';
			// five multisampled tracks fill the sample memory…
			for (const n of [3, 4, 6, 7]) engine(sim, n, 'multisampler');
			// …and an 18-note chord held on dissolve takes 18 of the 24 voices and most of the CPU
			sim.press('track.5');
			for (const key of KEYBOARD_NOTE_NAMES.slice(0, 18)) {
				sim.input({ type: 'press', id: `keyboard.${key}` });
			}
			sim.press('key.project');
		}
	},
	{
		id: 'project-folder',
		png: 'project-014-you-can-create-and-load-your-own-project.png',
		title: 'projects folder',
		page: 'system-list',
		note: 'Our soft keys follow the guide’s text (M1 load, M2 history, M3 duplicate, hold M4 delete); TE’s drawing labels them delete / history / duplicate / load. The factory names are TE’s examples.',
		setup: (sim) => {
			const sys = sim.state.areas.system;
			sys.projects.factory = [...ART_NAMES, 'jackdish'].map((name) => ({
				name,
				snapshot: null,
				versions: []
			}));
			sim.combo('key.shift', 'key.project');
			sim.turn(1, -2); // user → factory
			sim.turn(2, 2); // cherry
		}
	},
	{
		id: 'project-config',
		png: 'project-019-entering-the-config-page-under-the-proje.png',
		title: 'project settings · tempo',
		page: 'system-list',
		setup: (sim) => {
			sim.press('key.project');
			sim.press('key.m4');
			sim.turn(1, 1); // general → tempo
		}
	},
	{
		id: 'com-system',
		png: 'com-014-section.png',
		title: 'system settings',
		page: 'system-list',
		note: 'TE’s drawing fills the system section with preset-settings rows (mod amount, modwheel target…); ours lists the section’s real settings (brightness, country, power off…), and adds pitchbend and monitor from the manual.',
		setup: (sim) => {
			sim.press('key.com');
			sim.press('key.m1');
		}
	},
	{
		id: 'com-controller',
		png: 'com-022-channel.png',
		title: 'controller mode',
		page: 'system-link',
		note: `TE’s drawing reuses the MTP page’s "eject" label; nothing in the manual ejects from controller mode, so we leave it off. ${WIDE_CANVAS}`,
		setup: (sim) => {
			sim.press('key.com');
			sim.press('key.m2');
		}
	},
	{
		id: 'com-devices',
		png: 'com-030-back.png',
		title: 'devices',
		page: 'system-devices',
		note: 'The devices are TE’s examples; the fifth switch (velocity, from the manual’s how-to) is scrolled out of view as in the drawing.',
		setup: (sim) => {
			sim.state.areas.system.devices = [
				{ name: 'TP-7', connected: true, wireless: false, settings: [2, 1, 3, 0, 1] },
				{ name: 'midi ctrl', connected: false, wireless: true, settings: [3, 3, 3, 0, 1] },
				{ name: 'OP-1', connected: false, wireless: true, settings: [3, 3, 3, 0, 1] },
				{ name: 'ortho remote', connected: false, wireless: true, settings: [3, 3, 3, 0, 1] }
			];
			sim.press('key.com');
			sim.press('key.m3');
		}
	},
	{
		id: 'com-mtp',
		png: 'com-039-press-m1-to-exit-devices-and-return-to-c.png',
		title: 'mtp mode',
		page: 'system-link',
		note: WIDE_CANVAS,
		setup: (sim) => {
			sim.press('key.com');
			sim.press('key.m4');
		}
	},
	{
		id: 'preset-settings',
		png: 'instrument-103-settings-mod.png',
		title: 'preset settings',
		page: 'system-list',
		setup: (sim) => {
			sim.press('track.3');
			sim.combo('key.shift', 'key.instrument');
		}
	},
	{
		id: 'preset-browser',
		png: 'instrument-118-category-engine.png',
		title: 'preset browser · engine view',
		page: 'system-list',
		note: 'The presets are TE’s example names on a unit with four engines’ presets; TE’s art still calls the midi engine by its old name, "external", which also sorts it before hardsync.',
		setup: (sim) => {
			const b = sim.state.areas.system.presets;
			const preset = (name: string, folder: string, id: EngineId): PresetEntry => ({
				name,
				folder,
				engine: id,
				user: false
			});
			b.library = [
				...ART_NAMES.map((name) => preset(name, 'pad', 'dissolve')),
				preset('drum 1', 'drum', 'drum'),
				preset('midi 1', '', 'midi'),
				preset('lead 1', 'lead', 'hardsync')
			];
			sim.combo('key.shift', 'track.6');
			if (b.view !== 'engine') sim.click(1); // category view → engine view
			turnTo(sim, 1, () => groups(b).indexOf(b.group), groups(b).indexOf('dissolve'));
			turnTo(sim, 2, () => b.row, ART_NAMES.indexOf('cherry'));
		}
	}
];
