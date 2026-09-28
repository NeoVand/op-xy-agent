/**
 * From state to what the system area's screen shows (pure). Each page lists what its columns hold
 * and what is selected; `draw.ts` places it the way TE's art does (the preset browser as the
 * device draws it: `presets-draw.ts`).
 */
import { clamp, type SimState } from '../../params';
import type { SoftLabel, SoftTone } from '../../screen/draw';
import type { ProjectFrame, ScreenFrame } from '../../screen/frame';
import { NOTE_NAMES } from './catalogue';
import type {
	ListLayout,
	SystemDevicesFrame,
	SystemListColumn,
	SystemListFrame,
	SystemNamingFrame,
	SystemPresetsFrame
} from './frames';
import { neighbours } from './naming';
import {
	BROWSER_ROWS,
	canPaste,
	currentGroup,
	findPreset,
	highlighted,
	presetKey,
	presetsIn,
	scrolled
} from './presets';
import {
	DEVICE_ROWS,
	OS_VERSION,
	PITCHBEND_SECTION,
	PRESET_SECTIONS,
	PROJECT_SECTIONS,
	SYSTEM_SECTIONS,
	TUNING_ROW,
	type Section
} from './settings';
import {
	BOOT_MS,
	PROJECT_FOLDERS,
	VIEW_POPUP_FADE_MS,
	type ListCursor,
	type NamingPurpose
} from './state';
import { indicators } from './usage';

/** Rows each list shows at once (TE's art: up to eight above the soft labels). */
const ROWS: Readonly<Record<ListLayout, number>> = {
	'project-settings': 8,
	'system-settings': 8,
	'preset-settings': 9,
	folder: 8,
	history: 8
};
/** Rows of the devices page's list (guide art com-030: from baseline 75 to 195). */
const DEVICE_LIST_ROWS = 7;
/** Switches in view under the device picture (four, as the art's scroll bar says of five). */
const DEVICE_SETTING_ROWS = 4;

/** The rows in view around `index`: the selection stays in the middle once the list scrolls. */
function windowOf(total: number, index: number, rows: number) {
	const first = clamp(index - Math.floor(rows / 2), 0, Math.max(0, total - rows));
	return { first, last: Math.min(total, first + rows) };
}

/** A column showing `items` with `index` selected (null: nothing selected). */
function column(
	items: readonly string[],
	index: number | null,
	rows: number,
	dim?: (i: number) => boolean
): SystemListColumn {
	const { first, last } = windowOf(items.length, index ?? 0, rows);
	const inView = items.slice(first, last);
	const dimRows = dim ? inView.flatMap((_, i) => (dim(first + i) ? [i] : [])) : undefined;
	return {
		items: inView,
		selected: index === null || items.length === 0 ? null : index - first,
		...(dimRows && dimRows.length ? { dim: dimRows } : {}),
		first,
		total: items.length
	};
}

/** A settings page: sections, the chosen section's settings, and their values. */
function settingsFrame(
	s: SimState,
	sections: readonly Section[],
	cursor: ListCursor,
	layout: ListLayout,
	title: string,
	soft: readonly (SoftLabel | null)[]
): SystemListFrame {
	const rows = ROWS[layout];
	const section = clamp(cursor.section, 0, sections.length - 1);
	const settings = sections[section].rows(s);
	const row = clamp(cursor.row, 0, settings.length - 1);
	const labels = settings.map((r) => r.label);
	const values = settings.map((r) => r.value(s));
	return {
		page: 'system-list',
		layout,
		title,
		columns: [
			column(
				sections.map((x) => x.label),
				section,
				rows
			),
			column(labels, row, rows),
			column(values, row, rows)
		],
		soft
	};
}

const BACK: readonly (SoftLabel | null)[] = [{ text: 'back' }];

/** Names of the naming screen's purposes (ours). */
const NAMING_TITLES: Readonly<Record<NamingPurpose, string>> = {
	'rename-project': 'rename project',
	'save-as': 'save project as',
	'rename-preset': 'rename preset',
	'new-folder': 'new folder',
	'rename-folder': 'rename folder'
};

/** The project page (guide art project-003/004) with its usage indicators and brief labels. */
function projectFrame(s: SimState): ProjectFrame {
	const sys = s.areas.system;
	const soft: SoftLabel[] = [
		{ text: 'new', tone: 'normal' },
		{ text: s.shift ? 'save as' : 'save', tone: 'dim' },
		{ text: 'rename', tone: 'dim' },
		{ text: 'config', tone: 'dim' }
	];
	if (sys.flash) soft[sys.flash.slot] = { text: sys.flash.text, tone: 'bright' };
	return { page: 'project', name: s.project.name, usage: indicators(s), soft };
}

/** The projects folder (guide art project-014). */
function folderFrame(s: SimState): SystemListFrame {
	const sys = s.areas.system;
	const folder = sys.folder.folder;
	const names = sys.projects[folder].map((p) => p.name);
	const row = clamp(sys.folder.rows[folder], 0, Math.max(0, names.length - 1));
	// our key order follows the guide's text (M1 load … hold M4 delete); TE's drawing mirrors it
	const soft: (SoftLabel | null)[] = [
		{ text: 'load', tone: 'bright' },
		{ text: 'history', tone: 'dim' },
		{ text: 'duplicate', tone: 'dim' },
		{ text: sys.notice ?? 'delete', tone: sys.notice ? 'bright' : 'dim' }
	];
	return {
		page: 'system-list',
		layout: 'folder',
		title: 'projects folder',
		columns: [
			column(PROJECT_FOLDERS, PROJECT_FOLDERS.indexOf(folder), ROWS.folder),
			column(names, names.length ? row : null, ROWS.folder)
		],
		soft
	};
}

/** A project's history, newest first (ours: the folder's layout). */
function historyFrame(s: SimState): SystemListFrame {
	const sys = s.areas.system;
	const { folder, name } = sys.history;
	const entry = sys.projects[folder].find((p) => p.name === name);
	const labels = [...(entry?.versions ?? [])].reverse().map((v) => v.label);
	const empty = labels.length === 0;
	return {
		page: 'system-list',
		layout: 'history',
		title: `history of ${name}`,
		columns: [
			column([name], 0, ROWS.history),
			empty
				? column(['no versions'], null, ROWS.history, () => true)
				: column(labels, clamp(sys.history.row, 0, labels.length - 1), ROWS.history)
		],
		soft: [{ text: 'load', tone: 'bright' }, { text: 'back', tone: 'dim' }, null, null]
	};
}

/**
 * A browser column: the rows in view from the stored first row (moved only as far as the
 * highlight needs, as on the device), `index` highlighted.
 */
function browserColumn(
	items: readonly string[],
	index: number | null,
	top: number,
	dim?: (i: number) => boolean
): SystemListColumn {
	const first = scrolled(top, index ?? 0, items.length);
	const inView = items.slice(first, first + BROWSER_ROWS);
	const dimRows = dim ? inView.flatMap((_, i) => (dim(first + i) ? [i] : [])) : [];
	return {
		items: inView,
		selected: index === null || items.length === 0 ? null : index - first,
		...(dimRows.length ? { dim: dimRows } : {}),
		first,
		total: items.length
	};
}

/**
 * The footer over M1–M4: cut, paste, rename and delete, paste dim with nothing cut (b1-1531, with
 * a user preset of the owner's Nostalgic Synths highlighted). With a factory preset highlighted the
 * device showed none (the rest of b1-1495…1568); a paste waiting for a user folder shows it too
 * (ours).
 */
function presetSoft(s: SimState): (SoftLabel | null)[] {
	const b = s.areas.system.presets;
	const user = highlighted(b)?.user === true;
	const paste = canPaste(b);
	if (!user && !paste) return [];
	const tone = (lit: boolean): SoftTone => (lit ? 'normal' : 'dim');
	return [
		{ text: 'cut', tone: tone(user) },
		{ text: 'paste', tone: tone(paste) },
		{ text: 'rename', tone: tone(user) },
		{ text: 'delete', tone: tone(user) }
	];
}

/** The preset browser (shift + M1, shift + Tn), as the device draws it (research 59 §2.6). */
function presetsFrame(s: SimState): SystemPresetsFrame {
	const sys = s.areas.system;
	const b = sys.presets;
	const { list, index } = currentGroup(b);
	const presets = presetsIn(b, list[index] ?? '');
	const cut = findPreset(b, b.clipboard);
	return {
		page: 'system-presets',
		track: b.track + 1,
		view: b.view,
		groups: browserColumn(list, list.length ? index : null, b.groupTop),
		presets: browserColumn(
			presets.map((p) => p.name),
			presets.length ? clamp(b.row, 0, presets.length - 1) : null,
			b.rowTop,
			(i) => cut !== undefined && presetKey(presets[i]) === presetKey(cut)
		),
		soft: presetSoft(s),
		popup:
			sys.presetPopup > 0
				? { view: b.view, alpha: Math.min(1, sys.presetPopup / VIEW_POPUP_FADE_MS) }
				: null
	};
}

/** The devices page (guide art com-030). */
function devicesFrame(s: SimState): SystemDevicesFrame {
	const sys = s.areas.system;
	const devices = sys.devices;
	const index = clamp(sys.deviceCursor.device, 0, Math.max(0, devices.length - 1));
	const list = column(
		devices.map((d) => d.name),
		devices.length ? index : null,
		DEVICE_LIST_ROWS,
		(i) => !devices[i].connected
	);
	const device = devices[index];
	const row = clamp(sys.deviceCursor.setting, 0, DEVICE_ROWS.length - 1);
	const hasDevice = device !== undefined;
	return {
		page: 'system-devices',
		devices: list,
		links: devices
			.slice(list.first, list.first + list.items.length)
			.map((d) => ({ connected: d.connected, wireless: d.wireless })),
		status: hasDevice ? (device.connected ? 'connected' : 'not connected') : null,
		settings: column(
			hasDevice ? DEVICE_ROWS.map((r) => r.label) : [],
			hasDevice ? row : null,
			DEVICE_SETTING_ROWS
		),
		values: column(
			hasDevice ? DEVICE_ROWS.map((r) => r.value(s)) : [],
			hasDevice ? row : null,
			DEVICE_SETTING_ROWS
		)
	};
}

/** The naming screen. */
function namingFrame(s: SimState): SystemNamingFrame {
	const n = s.areas.system.naming;
	const text = n?.text ?? '';
	const cursor = clamp(n?.cursor ?? 0, 0, Math.max(0, text.length - 1));
	return {
		page: 'system-naming',
		title: n ? NAMING_TITLES[n.purpose] : '',
		text,
		cursor,
		strip: neighbours(text[cursor] ?? 'a', 7),
		notice: n?.notice ?? null,
		soft: [
			{ text: 'done', tone: 'bright' },
			{ text: 'next', tone: 'normal' },
			{ text: 'cancel', tone: 'normal' },
			{ text: 'delete', tone: 'normal' }
		]
	};
}

const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

/** What the screen shows while the system area owns it. */
export function systemFrame(s: SimState): ScreenFrame {
	const sys = s.areas.system;
	if (!sys.power.on)
		return { page: 'system-power', phase: 'off', progress: 0, version: OS_VERSION };
	if (sys.power.booting) {
		return {
			page: 'system-power',
			phase: 'boot',
			progress: clamp(sys.power.elapsed / BOOT_MS, 0, 1),
			version: OS_VERSION
		};
	}
	switch (sys.page) {
		case 'folder':
			return folderFrame(s);
		case 'history':
			return historyFrame(s);
		case 'project-settings':
			return settingsFrame(
				s,
				PROJECT_SECTIONS,
				sys.projectCursor,
				'project-settings',
				'project settings',
				BACK
			);
		case 'system-settings': {
			const section =
				SYSTEM_SECTIONS[clamp(sys.systemCursor.section, 0, SYSTEM_SECTIONS.length - 1)];
			const calibrate = section.label === PITCHBEND_SECTION;
			return settingsFrame(
				s,
				SYSTEM_SECTIONS,
				sys.systemCursor,
				'system-settings',
				'system settings',
				[
					{ text: 'back' },
					null,
					null,
					calibrate
						? { text: sys.notice ?? 'calibrate', tone: sys.notice ? 'bright' : 'normal' }
						: null
				]
			);
		}
		case 'preset-settings': {
			const sections = PRESET_SECTIONS;
			const section = clamp(sys.presetCursor.section, 0, sections.length - 1);
			const rows = sections[section].rows(s);
			const onSlot =
				rows[clamp(sys.presetCursor.row, 0, rows.length - 1)]?.label === TUNING_ROW &&
				sys.presetSettings[s.track].tuning > 0;
			// TE's art shows no soft labels; "edit" over M4 on a user tuning slot is ours
			return settingsFrame(
				s,
				sections,
				sys.presetCursor,
				'preset-settings',
				`preset settings of track ${s.track + 1}`,
				onSlot ? [null, null, null, { text: 'edit' }] : []
			);
		}
		case 'presets':
			return presetsFrame(s);
		case 'naming':
			return namingFrame(s);
		case 'confirm':
			return {
				page: 'system-confirm',
				question: 'delete project?',
				name: sys.confirm?.name ?? '',
				soft: [null, null, { text: 'cancel', tone: 'normal' }, { text: 'delete', tone: 'bright' }]
			};
		case 'controller': {
			const c = sys.controller;
			return {
				page: 'system-link',
				mode: 'controller',
				shift: s.shift
					? [String(c.channel), c.knobs === 0 ? 'absolute' : 'relative', c.octave ? 'on' : 'off']
					: null,
				soft: [],
				hint: null
			};
		}
		case 'mtp':
			return {
				page: 'system-link',
				mode: 'mtp',
				shift: null,
				soft: [null, null, null, { text: 'eject' }],
				hint: 'on a mac, open teenage engineering field kit to reach the files'
			};
		case 'devices':
			return devicesFrame(s);
		case 'tuning': {
			const { slot, note } = sys.tuningCursor;
			const tuning = sys.tunings[slot];
			return {
				page: 'system-tuning',
				slot: `user ${slot + 1}`,
				note: NOTE_NAMES[note],
				cents: signed(tuning.cents[note]),
				micro: String(tuning.micro[note]),
				soft: [{ text: 'back' }]
			};
		}
		case null:
			break;
	}
	if (s.overlay === 'project') return projectFrame(s);
	if (s.overlay === 'com') return { page: 'com', ...s.com };
	// a page the core only names (s.sub)
	return { page: 'text', title: s.sub ?? '', lines: [s.sub ?? '', 'this page is not drawn yet'] };
}
