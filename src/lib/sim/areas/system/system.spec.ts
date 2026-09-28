import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import { DEFAULT_LEVEL } from '../../params';
import type { ScreenFrame } from '../../screen/frame';
import { RecordingContext } from '../../screen/recording';
import { describeFrame, renderFrame } from '../../screen/render';
import { PRESET_CATEGORIES } from './catalogue';
import type { SystemListFrame, SystemPresetsFrame } from './frames';
import { groups, loadPreset, presetsIn } from './presets';
import { HOLD_MS, VIEW_POPUP_MS } from './state';

/** A simulator with a clock the test moves. */
function sim(): { sim: OpxySim; clock: { now: number } } {
	const clock = { now: 1000 };
	return { sim: new OpxySim({ now: () => clock.now }), clock };
}

/** The frame, narrowed to one page (fails the test on another page). */
function page<P extends ScreenFrame['page']>(
	s: OpxySim,
	name: P
): Extract<ScreenFrame, { page: P }> {
	const frame = s.frame;
	expect(frame.page).toBe(name);
	return frame as Extract<ScreenFrame, { page: P }>;
}

/** The selected item of each column of a list page. */
const picks = (f: SystemListFrame) =>
	f.columns.map((c) => (c.selected === null ? null : c.items[c.selected]));

/** The preset browser's chosen group and highlighted preset. */
const chosen = (f: SystemPresetsFrame) =>
	[f.groups, f.presets].map((c) => (c.selected === null ? null : c.items[c.selected]));

/** Holds a key for `ms` on the test clock. */
function hold(s: OpxySim, clock: { now: number }, id: string, ms = HOLD_MS + 50): void {
	s.input({ type: 'press', id });
	clock.now += ms;
	s.input({ type: 'release', id });
}

/** Draws the current frame into a recording context. */
function renders(s: OpxySim): RecordingContext {
	const ctx = new RecordingContext();
	renderFrame(ctx, s.frame);
	return ctx;
}

describe('system area: power (manual: hardware/power-and-charging)', () => {
	it('goes black, ignores keys and darkens the LEDs while off', () => {
		const { sim: s } = sim();
		s.press('switch.power');
		expect(page(s, 'system-power').phase).toBe('off');
		expect(describeFrame(s.frame)).toBe('switched off');
		s.press('key.mix');
		s.press('track.3');
		expect(s.state.mode).toBe('instrument');
		expect(s.state.track).toBe(0);
		expect(Object.values(s.leds).every((led) => led === 'off')).toBe(true);
		expect(s.state.held).not.toContain('switch.power');
	});

	it('stops playback when switched off and boots back to the last selected track', () => {
		const { sim: s } = sim();
		s.press('track.3');
		s.press('key.play');
		s.press('key.project');
		s.press('switch.power');
		expect(s.state.transport.playing).toBe(false);
		s.press('switch.power');
		const boot = page(s, 'system-power');
		expect(boot).toMatchObject({ phase: 'boot', version: '1.1.33' });
		s.advance(1000);
		expect(page(s, 'system-power').progress).toBeGreaterThan(0.3);
		s.advance(2000);
		expect(page(s, 'synth').engine).toBe('prism');
		expect(s.state.overlay).toBeNull();
	});

	it('ends the boot at the first input after its time when nothing advances the clock', () => {
		const { sim: s, clock } = sim();
		s.press('switch.power');
		s.press('switch.power');
		s.press('key.m2');
		expect(s.frame.page).toBe('system-power');
		clock.now += 5000;
		s.press('key.m2');
		expect(s.frame.page).toBe('drum');
	});
});

describe('system area: the project page (manual: project/project-view)', () => {
	it('draws the usage indicators past their thresholds (manual: system-usage-indicators)', () => {
		const { sim: s } = sim();
		s.press('key.project');
		expect(page(s, 'project').usage).toEqual({ voices: false, cpu: false, memory: false });
		for (const t of [2, 3, 5, 6]) s.state.tracks[t].engine = 'multisampler';
		s.press('track.5');
		s.state.tracks[4].engine = 'dissolve';
		for (const k of ['f3', 'fs3', 'g3', 'gs3', 'a3', 'as3', 'b3', 'c4', 'cs4']) {
			s.input({ type: 'press', id: `keyboard.${k}` });
		}
		for (const k of ['d4', 'ds4', 'e4', 'f4', 'fs4', 'g4', 'gs4', 'a4', 'as4']) {
			s.input({ type: 'press', id: `keyboard.${k}` });
		}
		s.press('key.project');
		expect(page(s, 'project').usage).toEqual({ voices: true, cpu: true, memory: true });
	});

	it('creates a new project on hold M1, autosaving the old one; a tap only says to hold', () => {
		const { sim: s, clock } = sim();
		s.press('key.project');
		s.state.tempo.bpm = 90;
		s.press('key.m1');
		expect(page(s, 'project').soft[0]).toEqual({ text: 'hold', tone: 'bright' });
		expect(s.state.project.name).toBe('project 1');
		hold(s, clock, 'key.m1');
		expect(s.state.project.name).toBe('project 2');
		expect(s.state.tempo.bpm).toBe(120);
		const old = s.state.areas.system.projects.user.find((p) => p.name === 'project 1');
		expect(old?.versions.map((v) => v.auto)).toEqual([true]);
	});

	it('fires a hold while the key is still down when time advances', () => {
		const { sim: s } = sim();
		s.press('key.project');
		s.input({ type: 'press', id: 'key.m1' });
		s.advance(HOLD_MS + 10);
		expect(s.state.project.name).toBe('project 2');
		s.input({ type: 'release', id: 'key.m1' });
		expect(s.state.project.name).toBe('project 2');
	});

	it('saves with M2 (a version, and the label says so)', () => {
		const { sim: s } = sim();
		s.press('key.project');
		s.press('key.m2');
		expect(page(s, 'project').soft[1]).toEqual({ text: 'saved', tone: 'bright' });
		const entry = s.state.areas.system.projects.user[0];
		expect(entry.versions).toHaveLength(1);
		expect(entry.versions[0].label).toBe('09-26 (1) save');
		s.press('key.m2');
		expect(entry.versions[1].label).toBe('09-26 (2) save');
	});

	it('shows "save as" over M2 with shift and names the copy (shift + M2)', () => {
		const { sim: s } = sim();
		s.press('key.project');
		s.input({ type: 'press', id: 'key.shift' });
		expect(page(s, 'project').soft[1]?.text).toBe('save as');
		s.press('key.m2');
		s.input({ type: 'release', id: 'key.shift' });
		expect(page(s, 'system-naming')).toMatchObject({ title: 'save project as', text: 'project 2' });
		s.press('key.m1');
		expect(s.state.project.name).toBe('project 2');
		expect(s.state.areas.system.projects.user.map((p) => p.name)).toEqual([
			'project 1',
			'project 2'
		]);
		expect(s.frame.page).toBe('project');
	});

	it('renames with M3: E1 picks the character, E2 changes it, M1–M4 confirm, next, cancel, delete', () => {
		const { sim: s } = sim();
		s.press('key.project');
		s.press('key.m3');
		let n = page(s, 'system-naming');
		expect(n).toMatchObject({ text: 'project 1', cursor: 8 });
		s.turn(2, 1); // 1 → 2
		s.press('key.m2'); // a new character at the end (a copy of the last)
		s.turn(2, -2);
		n = page(s, 'system-naming');
		expect(n.text).toBe('project 20');
		s.press('key.m4');
		s.turn(1, -3);
		s.press('key.m4'); // deletes the "c"
		expect(page(s, 'system-naming').text).toBe('projet 2');
		s.press('key.m3'); // cancel
		expect(s.state.project.name).toBe('project 1');
		s.press('key.m3');
		s.turn(1, -3);
		s.turn(2, 1);
		s.press('key.m1');
		expect(s.state.project.name).toBe('projedt 1');
		expect(s.state.areas.system.projects.user[0].name).toBe('projedt 1');
	});

	it('refuses an empty name or one another project has', () => {
		const { sim: s } = sim();
		s.press('key.project');
		s.combo('key.shift', 'key.m2');
		s.press('key.m1'); // "project 2" exists now
		s.press('key.m3');
		s.turn(2, 1); // "project 3"
		s.turn(2, -2); // "project 1"
		s.press('key.m1');
		expect(page(s, 'system-naming').notice).toBe('name taken');
		for (let i = 0; i < 12; i++) s.press('key.m4');
		s.press('key.m1');
		expect(page(s, 'system-naming').notice).toBe('name is empty');
	});

	it('opens the project settings with M4 and leaves them with M1', () => {
		const { sim: s } = sim();
		s.press('key.project');
		s.press('key.m4');
		const f = page(s, 'system-list');
		expect(f.layout).toBe('project-settings');
		expect(f.columns[0].items).toEqual(['general', 'tempo', 'voices', 'midi']);
		expect(f.soft[0]?.text).toBe('back');
		s.press('key.m1');
		expect(s.frame.page).toBe('project');
	});
});

describe('system area: project settings (manual: project/settings, midi-channels, transpose)', () => {
	it('sets the time signature and the groove the tempo page shows', () => {
		const { sim: s } = sim();
		s.press('key.project');
		s.press('key.m4');
		s.turn(1, 1);
		expect(picks(page(s, 'system-list'))).toEqual(['tempo', 'signature', '4/4']);
		s.turn(3, 2);
		expect(picks(page(s, 'system-list'))[2]).toBe('6/8');
		s.turn(2, 1);
		s.turn(4, 1);
		expect(s.state.tempo.groove).toBe(1);
		expect(picks(page(s, 'system-list'))).toEqual(['tempo', 'groove type', 'half shuffle']);
	});

	it('gives each of the 16 tracks a MIDI channel, off in a new project', () => {
		const { sim: s } = sim();
		s.press('key.project');
		s.press('key.m4');
		s.turn(1, 3);
		let f = page(s, 'system-list');
		expect(f.columns[1].total).toBe(16);
		expect(f.columns[2].items.every((v) => v === 'off')).toBe(true);
		s.turn(2, 15);
		s.turn(3, 3);
		f = page(s, 'system-list');
		expect(picks(f)).toEqual(['midi', 'fx II', '3']);
		expect(s.state.areas.system.projectSettings.channels[15]).toBe(3);
		expect(f.columns[1].first).toBeGreaterThan(0);
	});

	it('transposes and reserves voices', () => {
		const { sim: s } = sim();
		s.press('key.project');
		s.press('key.m4');
		s.turn(3, -3);
		expect(picks(page(s, 'system-list'))[2]).toBe('-3 semi');
		s.turn(1, 2);
		s.turn(3, 4);
		expect(picks(page(s, 'system-list'))).toEqual(['voices', 'track 1', '4']);
		s.turn(3, -9);
		expect(picks(page(s, 'system-list'))[2]).toBe('auto');
	});
});

describe('system area: the projects folder (manual: projects-folder, versions-and-autosave)', () => {
	it('opens on the open project with shift + project, from anywhere', () => {
		const { sim: s } = sim();
		s.press('key.mix');
		s.combo('key.shift', 'key.project');
		const f = page(s, 'system-list');
		expect(f.layout).toBe('folder');
		expect(picks(f)).toEqual(['user', 'project 1']);
		expect(f.soft.map((l) => l?.text)).toEqual(['load', 'history', 'duplicate', 'delete']);
	});

	it('loads a factory project as a fresh one under its name, autosaving first (M1)', () => {
		const { sim: s } = sim();
		s.state.tempo.bpm = 99;
		s.combo('key.shift', 'key.project');
		s.turn(1, -2);
		s.turn(2, 2);
		expect(picks(page(s, 'system-list'))).toEqual(['factory', 'demo 3']);
		s.press('key.m1');
		expect(s.state.project.name).toBe('demo 3');
		expect(s.state.tempo.bpm).toBe(120);
		expect(s.frame.page).toBe('project');
		expect(s.state.areas.system.projects.user[0].versions[0].auto).toBe(true);
	});

	it('loads a saved project back as it was saved', () => {
		const { sim: s, clock } = sim();
		s.press('key.project');
		s.state.tempo.bpm = 101;
		s.state.tracks[2].m1[0] = 12;
		s.press('key.m2'); // save project 1
		hold(s, clock, 'key.m1'); // project 2
		expect(s.state.tempo.bpm).toBe(120);
		s.combo('key.shift', 'key.project');
		s.turn(2, -5);
		s.press('key.m1');
		expect(s.state.project.name).toBe('project 1');
		expect(s.state.tempo.bpm).toBe(101);
		expect(s.state.tracks[2].m1[0]).toBe(12);
	});

	it('lists the history newest first and loads a version (M2, then M1)', () => {
		const { sim: s } = sim();
		s.press('key.project');
		s.state.tempo.bpm = 100;
		s.press('key.m2');
		s.state.tempo.bpm = 110;
		s.press('key.m2');
		s.state.tempo.bpm = 130;
		s.combo('key.shift', 'key.project');
		s.press('key.m2');
		let f = page(s, 'system-list');
		expect(f.layout).toBe('history');
		expect(f.columns[1].items).toEqual(['09-26 (2) save', '09-26 (1) save']);
		s.turn(2, 1);
		s.press('key.m1');
		expect(s.state.tempo.bpm).toBe(100);
		// the unsaved 130 was autosaved before the version loaded
		s.combo('key.shift', 'key.project');
		s.press('key.m2');
		f = page(s, 'system-list');
		expect(f.columns[1].items[0]).toBe('09-26 (3) auto');
		s.press('key.m2');
		expect(page(s, 'system-list').layout).toBe('folder');
	});

	it('duplicates a project into the user folder (M3)', () => {
		const { sim: s } = sim();
		s.combo('key.shift', 'key.project');
		s.turn(1, -2);
		s.press('key.m3');
		expect(picks(page(s, 'system-list'))).toEqual(['user', 'demo 2']);
	});

	it('deletes on hold M4 after asking; a tap says to hold; factory projects stay', () => {
		const { sim: s, clock } = sim();
		s.press('key.project');
		s.combo('key.shift', 'key.m2');
		s.press('key.m1'); // project 2 saved as
		s.combo('key.shift', 'key.project');
		s.press('key.m4');
		expect(page(s, 'system-list').soft[3]).toEqual({ text: 'hold', tone: 'bright' });
		hold(s, clock, 'key.m4');
		expect(page(s, 'system-confirm')).toMatchObject({
			question: 'delete project?',
			name: 'project 2'
		});
		s.press('key.m3');
		expect(s.state.areas.system.projects.user).toHaveLength(2);
		hold(s, clock, 'key.m4');
		s.press('key.m4');
		expect(s.state.areas.system.projects.user.map((p) => p.name)).toEqual(['project 1']);
		expect(page(s, 'system-list').layout).toBe('folder');
		s.turn(1, -2);
		hold(s, clock, 'key.m4');
		expect(page(s, 'system-list').layout).toBe('folder');
	});

	it('goes back to the project page with the project key and leaves with a mode key', () => {
		const { sim: s } = sim();
		s.combo('key.shift', 'key.project');
		s.press('key.project');
		expect(s.frame.page).toBe('project');
		s.combo('key.shift', 'key.project');
		s.press('key.instrument');
		expect(s.frame.page).toBe('drum');
	});
});

describe('system area: COM (manual: com/overview, system-settings, midi-settings)', () => {
	it('keeps the COM page’s encoders: E1 advertise, E3 multi-out, E4 charging', () => {
		const { sim: s } = sim();
		s.press('key.com');
		s.turn(3, 3);
		s.turn(4, 1);
		s.click(1);
		expect(page(s, 'com')).toMatchObject({ multiOut: 'sync24', charging: true, advertising: true });
		s.turn(1, -1);
		expect(page(s, 'com').advertising).toBe(false);
	});

	it('lists the system settings by section and edits them (M1 back)', () => {
		const { sim: s } = sim();
		s.press('key.com');
		s.press('key.m1');
		let f = page(s, 'system-list');
		expect(f.layout).toBe('system-settings');
		expect(f.columns[0].items).toEqual([
			'system',
			'keyboard',
			'midi',
			'clock',
			'pitchbend',
			'battery',
			'monitor',
			'legal'
		]);
		expect(picks(f)).toEqual(['system', 'screen brightness', '80']);
		s.turn(1, 1);
		s.turn(3, 2); // velocity off → hard (manual: howto/enable-velocity)
		expect(picks(page(s, 'system-list'))).toEqual(['keyboard', 'velocity', 'hard']);
		s.turn(1, 1);
		f = page(s, 'system-list');
		// stock midi settings as found on OS 1.1.33 (manual: midi-settings)
		expect(f.columns[2].items).toEqual(['in', 'both', 'both', '1', 'off']);
		s.turn(3, 2);
		expect(s.state.areas.system.system.clock).toBe(3);
		s.press('key.m1');
		expect(s.frame.page).toBe('com');
	});

	it('turns the pitchbend sides with E2 and E3 and calibrates with M4', () => {
		const { sim: s } = sim();
		s.press('key.com');
		s.press('key.m1');
		s.turn(1, 4);
		s.turn(2, 5);
		s.turn(3, -5);
		const sys = s.state.areas.system.system;
		expect([sys.bendLeft, sys.bendRight]).toEqual([55, 45]);
		expect(page(s, 'system-list').soft[3]?.text).toBe('calibrate');
		s.press('key.m4');
		expect(page(s, 'system-list').soft[3]?.text).toBe('calibrated');
	});

	it('shows incoming MIDI on the monitor page', () => {
		const { sim: s } = sim();
		s.state.areas.system.monitor.push('note on 1', 'clock');
		s.press('key.com');
		s.press('key.m1');
		s.turn(1, 6);
		expect(page(s, 'system-list').columns[1].items).toEqual(['clock', 'note on 1']);
	});

	it('turns the panel into a controller (M2): keys belong to it, shift + E1–E3 set it, shift + com leaves', () => {
		const { sim: s } = sim();
		s.press('key.com');
		s.press('key.m2');
		expect(page(s, 'system-link')).toMatchObject({ mode: 'controller', shift: null });
		s.press('key.instrument');
		s.press('key.play');
		expect(s.state.transport.playing).toBe(false);
		expect(s.frame.page).toBe('system-link');
		s.input({ type: 'press', id: 'key.shift' });
		s.turn(1, 9);
		s.turn(2, 1);
		s.turn(3, -1);
		expect(page(s, 'system-link').shift).toEqual(['10', 'relative', 'off']);
		s.press('key.com');
		s.input({ type: 'release', id: 'key.shift' });
		expect(s.frame.page).toBe('com');
	});

	it('edits and forgets devices (M3: E1 device, E2 setting, E3 value, M2 forget)', () => {
		const { sim: s } = sim();
		s.state.areas.system.devices.push({
			name: 'op-1',
			connected: false,
			wireless: true,
			settings: [3, 3, 3, 0, 1]
		});
		s.press('key.com');
		s.press('key.m3');
		let f = page(s, 'system-devices');
		expect(f.status).toBe('connected');
		expect(f.settings.items).toEqual(['clock', 'notes', 'other', 'timestamp']);
		s.turn(1, 1);
		s.turn(2, 4);
		s.turn(3, -1);
		f = page(s, 'system-devices');
		expect(f.status).toBe('not connected');
		expect(f.settings.items[f.settings.selected ?? 0]).toBe('velocity');
		expect(s.state.areas.system.devices[1].settings[4]).toBe(0);
		s.press('key.m2');
		expect(s.state.areas.system.devices.map((d) => d.name)).toEqual(['computer']);
		s.press('key.m1');
		expect(s.frame.page).toBe('com');
	});

	it('enters MTP mode (M4) and ejects with M4', () => {
		const { sim: s } = sim();
		s.press('key.com');
		s.press('key.m4');
		const f = page(s, 'system-link');
		expect(f.mode).toBe('mtp');
		expect(f.soft[3]?.text).toBe('eject');
		expect(describeFrame(s.frame)).toContain('field kit');
		s.press('key.mix');
		expect(s.frame.page).toBe('system-link');
		s.press('key.m4');
		expect(s.frame.page).toBe('com');
	});
});

describe('system area: presets (manual: instrument/preset-browser, preset-management)', () => {
	it('opens the browser on the track’s preset with shift + Tn, by engine as on the device', () => {
		const { sim: s } = sim();
		s.combo('key.shift', 'track.3');
		const f = page(s, 'system-presets');
		expect(s.state.track).toBe(2);
		// a new project's track 3 plays the device's bass/shoulder (b1-1495)
		expect([f.track, f.view, ...chosen(f)]).toEqual([3, 'engine', 'prism', 'shoulder']);
		expect(describeFrame(s.frame)).toBe('presets for track 3, by engine: prism, shoulder');
	});

	it('lists the device’s eleven engines and their factory presets by name (b1-1495…1568), then midi (ours)', () => {
		const { sim: s } = sim();
		const b = s.state.areas.system.presets;
		expect(groups(b, 'engine')).toEqual([
			'axis',
			'dissolve',
			'drum',
			'epiano',
			'hardsync',
			'multisampler',
			'organ',
			'prism',
			'sampler',
			'simple',
			'wavetable',
			'midi'
		]);
		const names = (engine: string) => presetsIn(b, engine, 'engine').map((p) => p.name);
		expect(names('organ')).toEqual([
			'avant garde',
			'chorale',
			'chunk',
			'dingus',
			'manual',
			'vestigial'
		]);
		expect(names('axis')).toHaveLength(14);
		expect(names('axis').at(-1)).toBe('whitness');
		expect(names('wavetable')).toHaveLength(13);
		expect(names('sampler').slice(0, 3)).toEqual(['80s lover', 'ambi piano', 'any time']);
		expect(b.library).toHaveLength(156);
		expect(groups(b, 'category')).toEqual([...PRESET_CATEGORIES]);
		const pluck = presetsIn(b, 'pluck', 'category').map((p) => p.name);
		expect(pluck.slice(0, 3)).toEqual(['avant garde', 'beach bum', 'bellissimo']);
		expect(pluck).toHaveLength(23);
	});

	it('scrolls each list only as far as the highlight needs (b1-1495, 1507, 1517, 1518)', () => {
		const { sim: s } = sim();
		s.combo('key.shift', 'track.3');
		let f = page(s, 'system-presets');
		// shoulder, prism's 14th preset, on the bottom row
		expect([f.groups.first, f.presets.first, f.presets.selected]).toEqual([0, 5, 8]);
		expect(f.presets.items[0]).toBe('gradient');
		s.turn(1, 3); // wavetable, the last engine: the column scrolls by two
		f = page(s, 'system-presets');
		expect(chosen(f)).toEqual(['wavetable', 'asinine']);
		expect([f.groups.first, f.groups.selected, f.presets.first]).toEqual([2, 8, 0]);
		s.turn(2, 11);
		expect(page(s, 'system-presets').presets.items).toEqual([
			'corporate',
			'meat org',
			'modulus',
			'not fm',
			'post order',
			'sad triangle',
			'spacious',
			'ulysses',
			'wobbler'
		]);
		s.turn(2, 1);
		f = page(s, 'system-presets');
		expect([f.presets.first, f.presets.items.at(-1), chosen(f)[1]]).toEqual([4, 'zafu', 'zafu']);
		// back up to organ: the engine column stays where it is, the presets start from the top
		s.turn(1, -4);
		f = page(s, 'system-presets');
		expect([f.groups.first, ...chosen(f), f.presets.first]).toEqual([2, 'organ', 'avant garde', 0]);
	});

	it('swaps the view with an E1 click, keeping the preset and saying which in a popup', () => {
		const { sim: s } = sim();
		s.combo('key.shift', 'track.3');
		s.turn(1, -7); // axis: its first preset, bellissimo
		s.click(1);
		let f = page(s, 'system-presets');
		// b1-1524: pluck, where bellissimo lives, under the popup
		expect([f.view, ...chosen(f)]).toEqual(['category', 'pluck', 'bellissimo']);
		expect(f.popup).toEqual({ view: 'category', alpha: 1 });
		expect(describeFrame(s.frame)).toBe(
			'presets for track 3, by category (view popup): pluck, bellissimo'
		);
		s.advance(VIEW_POPUP_MS);
		expect(page(s, 'system-presets').popup).toBeNull();
		// b1-1528, 1536: strings' draemy, then back by engine with draemy still highlighted
		s.turn(1, 1);
		expect(chosen(page(s, 'system-presets'))).toEqual(['strings', 'draemy']);
		s.click(1);
		f = page(s, 'system-presets');
		expect([f.view, ...chosen(f)]).toEqual(['engine', 'axis', 'draemy']);
		// any other input ends the popup (ours)
		s.turn(2, 1);
		expect(page(s, 'system-presets').popup).toBeNull();
	});

	it('loads a preset with an E2–E4 click and leaves for the track’s M1 page (b1-1568 → 1569)', () => {
		const { sim: s } = sim();
		s.press('key.m3');
		s.combo('key.shift', 'track.3');
		s.turn(1, 2); // simple: belch bass
		expect(chosen(page(s, 'system-presets'))).toEqual(['simple', 'belch bass']);
		s.click(3);
		expect(page(s, 'synth').engine).toBe('simple');
		expect(s.state.pages.instrument).toBe(1);
		expect(s.state.areas.system.page).toBeNull();
		expect(s.state.areas.system.trackPresets[2]).toBe('bass/belch bass');
		// steps and mixer stay with the track (a new project's level)
		expect(s.state.tracks[2].mix.level).toBe(DEFAULT_LEVEL);
	});

	it('opens with shift + M1 on the selected track too, on the device in place of an engine list', () => {
		const { sim: s } = sim();
		s.press('track.6');
		s.press('key.m4');
		s.combo('key.shift', 'key.m1');
		expect(chosen(page(s, 'system-presets'))).toEqual(['hardsync', 'dielectric']);
		expect(s.state.picker).toBeNull();
		s.turn(1, 1); // multisampler
		s.click(2);
		expect(s.state.tracks[5].engine).toBe('multisampler');
		expect(s.state.pages.instrument).toBe(1);
	});

	it('lists midi after the engines with presets until one of its own takes it into its place, and the snapshot folder once it holds one', () => {
		const { sim: s } = sim();
		const b = s.state.areas.system.presets;
		expect(groups(b, 'engine').at(-1)).toBe('midi');
		expect(groups(b, 'category')).not.toContain('snapshot');
		b.library.push({ name: 'my synth', folder: 'snapshot', engine: 'midi', user: true });
		expect(groups(b, 'engine').indexOf('midi')).toBe(groups(b, 'engine').indexOf('hardsync') + 1);
		expect(groups(b, 'category')).toContain('snapshot');
		// by character code: a folder named with a capital first (b1-1524: Nostalgic Synths)
		b.library.push({
			name: 'bass 01',
			folder: 'Nostalgic Synths',
			engine: 'multisampler',
			user: true
		});
		expect(groups(b, 'category').slice(0, 2)).toEqual(['Nostalgic Synths', 'bass']);
		expect(
			presetsIn(b, 'multisampler', 'engine')
				.map((p) => p.name)
				.slice(0, 3)
		).toEqual(['bandpasser', 'bass 01', 'ensemble']);
	});

	it('shows cut, paste, rename and delete while a user preset is highlighted (b1-1531)', () => {
		const { sim: s } = sim();
		const b = s.state.areas.system.presets;
		b.library.push({
			name: 'bass 01',
			folder: 'Nostalgic Synths',
			engine: 'multisampler',
			user: true
		});
		s.combo('key.shift', 'track.8');
		expect(page(s, 'system-presets').soft).toEqual([]);
		s.click(1);
		s.turn(1, -20); // Nostalgic Synths, above the factory categories
		const f = page(s, 'system-presets');
		expect(chosen(f)).toEqual(['Nostalgic Synths', 'bass 01']);
		expect(f.soft).toEqual([
			{ text: 'cut', tone: 'normal' },
			{ text: 'paste', tone: 'dim' },
			{ text: 'rename', tone: 'normal' },
			{ text: 'delete', tone: 'normal' }
		]);
		expect(describeFrame(s.frame)).toMatch(
			/: Nostalgic Synths, bass 01; M1 cut, M3 rename, M4 delete$/
		);
	});

	it('brings a stored preset’s keyboard octave along when it loads', () => {
		const { sim: s } = sim();
		const pluck = s.state.areas.system.presets.library.find((p) => p.name === 'beach bum')!;
		loadPreset(s.state, 2, pluck);
		// beach bum plays an octave up on the device; the bass it replaced an octave down
		expect(s.state.areas.sequencer.octaves['instrument.2']).toBe(1);
		expect(s.state.tracks[2].engine).toBe('epiano');
	});

	it('leaves the browser with a track key, which selects that track', () => {
		const { sim: s } = sim();
		s.combo('key.shift', 'track.3');
		s.press('track.5');
		expect(page(s, 'synth').engine).toBe('dissolve');
	});

	it('makes, fills, renames and deletes user folders and presets', () => {
		const { sim: s } = sim();
		const b = s.state.areas.system.presets;
		b.library.push({ name: 'my bass', folder: 'snapshot', engine: 'prism', user: true });
		s.combo('key.shift', 'track.3');
		s.click(1); // by category
		// shift + M1: a new folder
		s.combo('key.shift', 'key.m1');
		expect(page(s, 'system-naming')).toMatchObject({ title: 'new folder', text: 'folder 1' });
		s.press('key.m1');
		expect(b.folders).toEqual(['folder 1']);
		expect(chosen(page(s, 'system-presets'))).toEqual(['folder 1', null]);
		// cut the user preset from the snapshot folder, paste it into the new folder
		const at = (folder: string) => groups(b).indexOf(folder);
		s.turn(1, at('snapshot') - at('folder 1'));
		expect(chosen(page(s, 'system-presets'))).toEqual(['snapshot', 'my bass']);
		s.press('key.m1');
		expect(page(s, 'system-presets').presets.dim).toEqual([0]);
		s.turn(1, at('folder 1') - at('snapshot'));
		expect(page(s, 'system-presets').soft[1]).toEqual({ text: 'paste', tone: 'normal' });
		s.press('key.m2');
		expect(chosen(page(s, 'system-presets'))).toEqual(['folder 1', 'my bass']);
		// the snapshot folder, empty now, is gone from the list
		expect(groups(b)).not.toContain('snapshot');
		// shift + M4 only deletes an empty folder
		s.combo('key.shift', 'key.m4');
		expect(b.folders).toEqual(['folder 1']);
		// M3 renames the preset, M4 deletes it
		s.press('key.m3');
		s.turn(2, 1);
		s.press('key.m1');
		expect(b.library.at(-1)?.name).toBe('my bast');
		s.press('key.m4');
		expect(b.library.some((p) => p.user)).toBe(false);
		// shift + M3 renames the folder, shift + M4 deletes it once empty
		s.combo('key.shift', 'key.m3');
		s.press('key.m4');
		s.press('key.m1');
		expect(b.folders).toEqual(['folder']);
		s.combo('key.shift', 'key.m4');
		expect(b.folders).toEqual([]);
		expect(chosen(page(s, 'system-presets'))[0]).toBe('keys');
	});

	it('leaves factory presets alone', () => {
		const { sim: s } = sim();
		const count = s.state.areas.system.presets.library.length;
		s.combo('key.shift', 'track.1');
		s.press('key.m4');
		s.press('key.m1');
		s.press('key.m3');
		expect(s.state.areas.system.presets.library).toHaveLength(count);
		expect(s.frame.page).toBe('system-presets');
	});
});

describe('system area: preset settings (manual: instrument/preset-settings, user-tunings)', () => {
	it('opens with shift + instrument for the selected track and edits settings and mods', () => {
		const { sim: s } = sim();
		s.press('track.3');
		s.combo('key.shift', 'key.instrument');
		let f = page(s, 'system-list');
		expect(f.layout).toBe('preset-settings');
		expect(f.columns[1].items).toEqual([
			'high pass',
			'velocity sens',
			'portamento type',
			'tuning',
			'tuning root',
			'transpose',
			'width'
		]);
		// a new project's track 3 (bass/shoulder) as the device stores it
		expect(f.columns[2].items).toEqual(['0', '20', 'exp', 'equal', 'C', '0 semi', '0']);
		s.turn(1, 1);
		s.turn(3, 1);
		f = page(s, 'system-list');
		// prism's first parameter is its first mod target
		expect(picks(f)).toEqual(['mod', 'modwheel target', 'shape']);
		s.turn(2, 1);
		s.turn(3, -40);
		expect(s.state.areas.system.presetSettings[2].amounts[0]).toBe(-40);
	});

	it('leaves to the instrument page of the module key pressed', () => {
		const { sim: s } = sim();
		s.press('key.mix');
		s.combo('key.shift', 'key.instrument');
		s.press('key.m2');
		expect(s.state.mode).toBe('instrument');
		expect(s.frame.page).toBe('envelope');
	});

	it('edits a user tuning slot with M4: the keyboard picks the note, E1 cents, E2 micro-cents', () => {
		const { sim: s } = sim();
		s.combo('key.shift', 'key.instrument');
		s.turn(2, 3);
		expect(page(s, 'system-list').soft).toEqual([]);
		s.turn(3, 3);
		expect(page(s, 'system-list').soft[3]?.text).toBe('edit');
		s.press('key.m4');
		expect(page(s, 'system-tuning')).toMatchObject({ slot: 'user 3', note: 'C' });
		s.press('keyboard.a3');
		s.turn(1, -7);
		s.turn(2, 25);
		expect(page(s, 'system-tuning')).toMatchObject({ note: 'A', cents: '-7', micro: '25' });
		expect(s.state.areas.system.tunings[2].cents[9]).toBe(-7);
		s.press('key.m1');
		expect(page(s, 'system-list').layout).toBe('preset-settings');
	});
});

describe('system area: track sounds (manual: save-copy-scramble, save-to-same-snapshot)', () => {
	/** Presses `key` while track key `n` is held. */
	function withTrack(s: OpxySim, n: number, key: string, shift = false): void {
		s.input({ type: 'press', id: `track.${n}` });
		if (shift) s.combo('key.shift', key);
		else s.press(key);
		s.input({ type: 'release', id: `track.${n}` });
	}

	it('saves a sound as a dated snapshot (Tn + M4), over it with shift, and loads it back', () => {
		const { sim: s } = sim();
		const b = s.state.areas.system.presets;
		s.state.tracks[2].m1[0] = 5;
		withTrack(s, 3, 'key.m4');
		expect(b.library.at(-1)).toMatchObject({
			name: '2026-09-26 (1)',
			folder: 'snapshot',
			engine: 'prism',
			user: true
		});
		expect(s.state.areas.system.trackPresets[2]).toBe('snapshot/2026-09-26 (1)');
		expect(page(s, 'synth').engine).toBe('prism');
		s.state.tracks[2].m1[0] = 6;
		withTrack(s, 3, 'key.m4', true);
		expect(b.library.filter((p) => p.user)).toHaveLength(1);
		withTrack(s, 3, 'key.m4');
		expect(b.library.at(-1)?.name).toBe('2026-09-26 (2)');
		// the browser opens on the new snapshot (dates sort before letters under prism); loading the
		// first one brings back its sound
		s.combo('key.shift', 'track.3');
		expect(chosen(page(s, 'system-presets'))).toEqual(['prism', '2026-09-26 (2)']);
		s.turn(2, -1);
		s.click(2);
		expect(s.state.tracks[2].m1[0]).toBe(6);
	});

	it('copies a sound from one track and pastes it onto another (Tn + M2, Tn + M3)', () => {
		const { sim: s } = sim();
		s.state.tracks[4].m1 = [1, 2, 3, 4];
		s.state.areas.system.presetSettings[4].width = 40;
		s.state.areas.sequencer.octaves['instrument.4'] = -2;
		withTrack(s, 5, 'key.m2');
		withTrack(s, 3, 'key.m3');
		expect(s.state.tracks[2]).toMatchObject({ engine: 'dissolve', m1: [1, 2, 3, 4] });
		expect(s.state.areas.system.presetSettings[2].width).toBe(40);
		expect(s.state.areas.system.trackPresets[2]).toBe('lead/gaussian'); // track 5's in a new project
		// the keyboard octave comes along (OS 1.0.38)
		expect(s.state.areas.sequencer.octaves['instrument.2']).toBe(-2);
	});

	it('scrambles a sound (Tn + M1) and leaves the midi engine alone', () => {
		const { sim: s } = sim();
		const before = JSON.stringify(s.state.tracks[3]);
		withTrack(s, 4, 'key.m1');
		expect(JSON.stringify(s.state.tracks[3])).not.toBe(before);
		expect(s.state.tracks[3].engine).toBe('epiano');
		s.state.tracks[5].engine = 'midi';
		const midi = JSON.stringify(s.state.tracks[5]);
		withTrack(s, 6, 'key.m1');
		expect(JSON.stringify(s.state.tracks[5])).toBe(midi);
	});

	it('keeps a track pointing at its preset when the preset is renamed or moved', () => {
		const { sim: s } = sim();
		const keys = s.state.areas.system.trackPresets;
		withTrack(s, 3, 'key.m4');
		expect(keys[2]).toBe('snapshot/2026-09-26 (1)');
		s.combo('key.shift', 'track.3');
		s.click(1); // by category: folders take pastes
		s.press('key.m3');
		expect(page(s, 'system-naming').text).toBe('2026-09-26 (1)');
		s.turn(1, -1);
		s.turn(2, 1);
		s.press('key.m1');
		expect(keys[2]).toBe('snapshot/2026-09-26 (2)');
		// into a new folder, then the folder renamed
		s.press('key.m1');
		s.combo('key.shift', 'key.m1');
		s.press('key.m1');
		s.press('key.m2');
		expect(keys[2]).toBe('folder 1/2026-09-26 (2)');
		s.combo('key.shift', 'key.m3');
		s.press('key.m4');
		s.press('key.m1');
		expect(keys[2]).toBe('folder/2026-09-26 (2)');
	});
});

describe('system area: drawing', () => {
	it('draws every page and describes it', () => {
		const { sim: s, clock } = sim();
		const visits: (() => void)[] = [
			() => s.press('key.project'),
			() => s.combo('key.shift', 'key.project'),
			() => s.press('key.m2'),
			() => hold(s, clock, 'key.m4'),
			() => {
				s.press('key.project');
				s.press('key.m3');
			},
			() => {
				s.press('key.com');
				s.press('key.m1');
			},
			() => {
				s.press('key.com');
				s.press('key.m3');
			},
			() => {
				s.press('key.com');
				s.press('key.m4');
			},
			() => s.combo('key.shift', 'track.2'),
			() => s.combo('key.shift', 'key.instrument')
		];
		for (const visit of visits) {
			visit();
			expect(renders(s).fills.length, s.frame.page).toBeGreaterThan(10);
			expect(describeFrame(s.frame).length).toBeGreaterThan(5);
			s.press('key.instrument');
		}
	});
});
