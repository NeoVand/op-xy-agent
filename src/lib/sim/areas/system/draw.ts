/**
 * Drawing the system area's frames on the 480 × 220 screen (see `../../screen/areas.ts`): one entry
 * per frame page, with a short spoken description. List pages follow TE's art for each page
 * (project-019, com-014, instrument-103, instrument-118, project-014), which place their columns
 * and selection boxes a little differently; the devices page follows com-030, controller and MTP
 * mode com-022 and com-039. The naming, confirm, tuning and power pages have no art: ours.
 */
import type { AreaDrawers } from '../../screen/areas';
import type { ScreenCtx } from '../../screen/context';
import {
	card,
	encoderDot,
	fillBox,
	line,
	strokeBox,
	text,
	type SoftLabel,
	type SoftTone
} from '../../screen/draw';
import { screenFont } from '../../screen/font';
import { drawIcon } from '../../screen/icons';
import { COLORS, RAMP, SOFT_KEY_BASELINE, SOFT_KEY_X } from '../../screen/palette';
import type {
	ListLayout,
	SystemConfirmFrame,
	SystemDevicesFrame,
	SystemFrame,
	SystemLinkFrame,
	SystemListColumn,
	SystemListFrame,
	SystemNamingFrame,
	SystemPowerFrame,
	SystemTuningFrame
} from './frames';

/** Soft-label colours by tone (the core's; project-014 draws its main label in #dcdcde). */
const SOFT: Readonly<Record<SoftTone, string>> = {
	bright: COLORS.white,
	normal: COLORS.light,
	dim: COLORS.dim
};

/**
 * Soft labels over M1–M4, shifted and recoloured where a drawing does so. A label too long for
 * its slot at the screen's edge ("calibrate") moves in until it fits (ours).
 */
function soft(
	ctx: ScreenCtx,
	labels: readonly (SoftLabel | null)[],
	dx = 0,
	baseline = SOFT_KEY_BASELINE,
	colors: Readonly<Record<SoftTone, string>> = SOFT
): void {
	labels.slice(0, 4).forEach((label, i) => {
		if (!label) return;
		const half = screenFont.measure(label.text, 20) / 2;
		const x = Math.min(Math.max(SOFT_KEY_X[i] + dx, 5 + half), 475 - half);
		text(ctx, label.text, x, baseline, 20, colors[label.tone ?? 'normal'], 'center');
	});
}

// ─────────────────────────────────────────────────────────────── list pages

/** One column's place: text pen x, selection box x and width, and how it selects. */
interface ColumnStyle {
	readonly x: number;
	readonly box: readonly [number, number];
	readonly select: 'outline' | 'ring' | 'dark' | 'white' | 'none';
}

/** A scroll bar beside a column: a thin track with a fixed-length thumb (TE's art: 80 px). */
interface ScrollStyle {
	readonly column: number;
	readonly x: number;
	readonly top: number;
	readonly bottom: number;
	readonly track: number;
	readonly width: number;
	readonly thumb: number;
	readonly color: string;
}

/** Everything a list drawing fixes. */
interface ListStyle {
	/** The first row's baseline; rows are 20 px apart. */
	readonly baseline: number;
	readonly columns: readonly ColumnStyle[];
	readonly text: string;
	/** Text on the white selection box. */
	readonly onWhite: string;
	readonly white: string;
	readonly dark: string;
	readonly dim: string;
	/** Selection boxes: top relative to the baseline, height, corner radius. */
	readonly boxTop: number;
	readonly boxHeight: number;
	readonly radius: number;
	/** The outline selection (sections): colour, stroke, top, height, radius. */
	readonly outline: {
		readonly color: string;
		readonly width: number;
		readonly top: number;
		readonly height: number;
		readonly radius: number;
	};
	readonly scroll: readonly ScrollStyle[];
	readonly soft: {
		readonly dx: number;
		readonly baseline: number;
		readonly colors: Readonly<Record<SoftTone, string>>;
	};
}

const WHITE_TEXT = COLORS.white;

/** The five list drawings, measured from TE's SVGs (screen pixels). */
const LISTS: Readonly<Record<ListLayout, ListStyle>> = {
	// project-019: rows start 5 px lower than the other lists
	'project-settings': {
		baseline: 35.57,
		columns: [
			{ x: 5.58, box: [0.3, 104.87], select: 'outline' },
			{ x: 120.45, box: [115.39, 169.82], select: 'dark' },
			{ x: 300.3, box: [295.2, 164.83], select: 'white' }
		],
		text: WHITE_TEXT,
		onWhite: COLORS.ink,
		white: COLORS.white,
		dark: COLORS.dark,
		dim: COLORS.dim,
		boxTop: -14.98,
		boxHeight: 19.98,
		radius: 2.5,
		outline: { color: COLORS.white, width: 0.56, top: -14.86, height: 19.44, radius: 1.3 },
		scroll: [
			{
				column: 1,
				x: 470.01,
				top: 9.99,
				bottom: 200.4,
				track: 0.56,
				width: 4.47,
				thumb: 79.92,
				color: COLORS.white
			}
		],
		soft: { dx: 0, baseline: 214.78, colors: SOFT }
	},
	// com-014: TE drew this page 2 units (4.47 px) to the right of the others
	'system-settings': {
		baseline: 30.61,
		columns: [
			{ x: 9.53, box: [4.47, 105], select: 'outline' },
			{ x: 124.55, box: [119.47, 170], select: 'dark' },
			{ x: 304.65, box: [299.47, 165], select: 'white' }
		],
		text: WHITE_TEXT,
		onWhite: COLORS.black,
		white: COLORS.white,
		dark: COLORS.dark,
		dim: COLORS.dim,
		boxTop: -15,
		boxHeight: 20,
		radius: 2.5,
		outline: { color: COLORS.white, width: 1, top: -15, height: 20, radius: 2.5 },
		scroll: [
			{
				column: 1,
				x: 474.47,
				top: 5,
				bottom: 195.61,
				track: 0.5,
				width: 5,
				thumb: 80,
				color: COLORS.white
			}
		],
		soft: { dx: 4.47, baseline: 215, colors: SOFT }
	},
	// instrument-103: no scroll bar, no soft labels
	'preset-settings': {
		baseline: 30.61,
		columns: [
			{ x: 5.06, box: [0.28, 104.64], select: 'outline' },
			{ x: 120.1, box: [115, 170], select: 'dark' },
			{ x: 300.17, box: [295, 180], select: 'white' }
		],
		text: WHITE_TEXT,
		onWhite: COLORS.ink,
		white: COLORS.white,
		dark: COLORS.dark,
		dim: COLORS.dim,
		boxTop: -15,
		boxHeight: 20,
		radius: 2.5,
		outline: { color: COLORS.white, width: 0.56, top: -14.87, height: 19.46, radius: 1.3 },
		scroll: [],
		soft: { dx: 0, baseline: SOFT_KEY_BASELINE, colors: SOFT }
	},
	// instrument-118: the track and view, the groups (outlined) and the presets (white)
	presets: {
		baseline: 35,
		columns: [
			{ x: 5.06, box: [0, 0], select: 'none' },
			{ x: 120.11, box: [115.28, 159.23], select: 'outline' },
			{ x: 300.06, box: [295, 165], select: 'white' }
		],
		text: WHITE_TEXT,
		onWhite: COLORS.ink,
		white: COLORS.white,
		dark: COLORS.dark,
		dim: COLORS.dim,
		boxTop: -15.61,
		boxHeight: 20,
		radius: 2.5,
		outline: { color: COLORS.white, width: 0.56, top: -16.08, height: 19.44, radius: 2.2 },
		scroll: [
			{
				column: 1,
				x: 285,
				top: 9.39,
				bottom: 200,
				track: 0.56,
				width: 4.47,
				thumb: 80,
				color: COLORS.dark
			},
			{
				column: 2,
				x: 470,
				top: 9.39,
				bottom: 200,
				track: 0.56,
				width: 4.47,
				thumb: 80,
				color: COLORS.white
			}
		],
		soft: { dx: 0, baseline: SOFT_KEY_BASELINE, colors: SOFT }
	},
	// project-014: softer greys throughout, a 1 px ring for the folder
	folder: folderStyle(),
	history: folderStyle()
};

function folderStyle(): ListStyle {
	return {
		baseline: 35.13,
		columns: [
			{ x: 119.87, box: [114.82, 165], select: 'ring' },
			{ x: 299.88, box: [294.82, 165], select: 'white' }
		],
		text: '#c6c6c3',
		onWhite: '#141514',
		white: '#dcdcde',
		dark: COLORS.dark,
		dim: COLORS.dim,
		boxTop: -15,
		boxHeight: 20,
		radius: 2.5,
		outline: { color: '#c7c7c4', width: 1, top: -15, height: 20, radius: 2.5 },
		scroll: [
			{
				column: 1,
				x: 469.38,
				top: 20.33,
				bottom: 190.33,
				track: 0.5,
				width: 5,
				thumb: 80,
				color: '#dcdcde'
			}
		],
		soft: { dx: 0, baseline: 215.13, colors: { ...SOFT, bright: '#dcdcde' } }
	};
}

/** Draws one column: its rows, with the selection shown the column's way. */
function drawColumn(
	ctx: ScreenCtx,
	style: ListStyle,
	col: ColumnStyle,
	data: SystemListColumn
): void {
	data.items.forEach((item, i) => {
		const baseline = style.baseline + 20 * i;
		let ink = data.dim?.includes(i) ? style.dim : style.text;
		if (i === data.selected) {
			const [x, w] = col.box;
			const o = style.outline;
			switch (col.select) {
				case 'outline':
					strokeBox(ctx, x, baseline + o.top, w, o.height, o.color, o.width, o.radius);
					break;
				case 'ring':
					// a 1 px ring drawn inside the box (TE's outline as a filled ring)
					strokeBox(ctx, x + 0.5, baseline + o.top + 0.5, w - 1, o.height - 1, o.color, 1, 2);
					break;
				case 'dark':
					fillBox(ctx, x, baseline + style.boxTop, w, style.boxHeight, style.dark, style.radius);
					break;
				case 'white':
					fillBox(ctx, x, baseline + style.boxTop, w, style.boxHeight, style.white, style.radius);
					ink = style.onWhite;
					break;
				case 'none':
					break;
			}
		}
		text(ctx, item, col.x, baseline, 20, ink);
	});
}

/** A scroll bar: the thumb's place follows how far the column has scrolled. */
function drawScroll(ctx: ScreenCtx, bar: ScrollStyle, data: SystemListColumn | undefined): void {
	line(ctx, bar.x, bar.top, bar.x, bar.bottom, bar.color, bar.track);
	const rows = data?.items.length ?? 0;
	const scrollable = data ? data.total - rows : 0;
	const at = scrollable > 0 && data ? data.first / scrollable : 0;
	const top = bar.top + at * (bar.bottom - bar.top - bar.thumb);
	line(ctx, bar.x, top, bar.x, top + bar.thumb, bar.color, bar.width);
}

function drawList(ctx: ScreenCtx, frame: SystemListFrame): void {
	const style = LISTS[frame.layout];
	frame.columns.forEach((data, i) => {
		const col = style.columns[i];
		if (col) drawColumn(ctx, style, col, data);
	});
	for (const bar of style.scroll) drawScroll(ctx, bar, frame.columns[bar.column]);
	soft(ctx, frame.soft, style.soft.dx, style.soft.baseline, style.soft.colors);
}

// ─────────────────────────────────────────────────────────────── devices (com-030)

const DEVICE = {
	title: '#c5c5c2',
	text: '#cccccc',
	off: '#4b4b4b',
	light: '#cdcdcd',
	dark: '#323232'
} as const;

function drawDevices(ctx: ScreenCtx, frame: SystemDevicesFrame): void {
	text(ctx, 'devices', 4.4, 35.45, 20, DEVICE.title);
	frame.devices.items.forEach((name, i) => {
		const baseline = 75.44 + 20 * i;
		const link = frame.links[i];
		if (i === frame.devices.selected) {
			strokeBox(ctx, -0.39, baseline - 17, 104.96, 19.99, DEVICE.light, 1, 2.5);
		}
		text(ctx, name, 4.8, baseline, 20, link?.connected ? DEVICE.text : DEVICE.off);
		if (link?.wireless) drawIcon(ctx, 'system.wireless', 127, baseline - 11.44);
	});
	// the list's scroll bar: a 1 px track and a 7 px thumb
	fillBox(ctx, 155.75, 20.45, 1, 184.93, DEVICE.dark);
	const listScroll = frame.devices.total - frame.devices.items.length;
	const listAt = listScroll > 0 ? frame.devices.first / listScroll : 0;
	fillBox(ctx, 152.75, 20.45 + listAt * (184.93 - 85.08), 6.99, 85.08, DEVICE.dark);

	if (frame.status !== null) {
		drawIcon(ctx, 'system.din', 178, 19);
		fillBox(ctx, 319.18, 20.45, 124.95, 20, DEVICE.light, 2.5);
		text(ctx, frame.status, 323.24, 35.45, 20, COLORS.black);
	}
	frame.settings.items.forEach((label, i) => {
		const baseline = 115.08 + 20 * i;
		const selected = i === frame.settings.selected;
		if (selected) fillBox(ctx, 174.24, baseline - 16.66, 139.94, 20, DEVICE.dark, 2.5);
		text(ctx, label, 178.3, baseline, 20, DEVICE.text);
		const value = frame.values.items[i] ?? '';
		if (selected) fillBox(ctx, 319.18, baseline - 16.66, 139.94, 20, DEVICE.light, 2.5);
		text(ctx, value, 324.25, baseline, 20, selected ? COLORS.black : DEVICE.text);
	});
	// the switches' scroll bar: the thumb's length shows how many are in view
	const track = 205.38 - 20.45;
	fillBox(ctx, 468.86, 29.91, 0.5, 205.38 - 29.91, DEVICE.light);
	const total = Math.max(1, frame.settings.total);
	const thumb = track * Math.min(1, frame.settings.items.length / total);
	const scroll = frame.settings.total - frame.settings.items.length;
	const at = scroll > 0 ? frame.settings.first / scroll : 0;
	fillBox(ctx, 466.61, 20.45 + at * (track - thumb), 5, thumb, DEVICE.light);
}

// ─────────────────────────────────────────────────────────────── controller and MTP (com-022, 039)

function drawLink(ctx: ScreenCtx, frame: SystemLinkFrame): void {
	// under a shift layer the page stays at half strength, like TE's play mode and sends
	const alpha = frame.shift ? 0.5 : 1;
	drawIcon(ctx, 'system.device', 4, 4, { alpha });
	ctx.save();
	ctx.globalAlpha = alpha;
	line(ctx, 234.99, 110, 319.99, 110, COLORS.white, 0.5);
	ctx.restore();
	drawIcon(ctx, 'system.laptop', 319, 19, { alpha });
	if (frame.mode === 'controller') drawIcon(ctx, 'system.keys', 319, 157, { alpha });
	if (frame.shift) {
		// ours: the shift layer's cards (channel, knob mode, octave keys), like play mode's
		const labels = ['channel', 'knobs', 'octave'];
		frame.shift.forEach((value, i) => {
			const top = 55 + 40 * i;
			card(ctx, 140, top, 200, 35);
			text(ctx, labels[i], 148, top + 21, 10, COLORS.ink);
			text(ctx, value, 205, top + 25, 20, COLORS.black);
			encoderDot(ctx, i as 0 | 1 | 2, 325, top + 5, COLORS.black);
		});
	}
	soft(ctx, frame.soft);
}

// ─────────────────────────────────────────────────────────────── naming, confirm, tuning (ours)

/** Characters laid out one by one (no ligatures), so the cursor sits on one character. */
function spread(value: string, size: number): { x: number; w: number }[] {
	let x = 0;
	return [...value].map((c) => {
		const w = c === ' ' ? screenFont.measure('n', size) * 0.6 : screenFont.measure(c, size);
		const at = { x, w };
		x += w;
		return at;
	});
}

function drawNaming(ctx: ScreenCtx, frame: SystemNamingFrame): void {
	text(ctx, frame.notice ?? frame.title, 5, 35, 20, frame.notice ? COLORS.white : COLORS.light);
	// the name, 40 px (smaller when long), the cursor's character reversed out of a white box
	const chars = [...frame.text];
	let size = 40;
	const width = (s: number) => spread(frame.text, s).reduce((sum, c) => sum + c.w, 0);
	while (size > 20 && width(size) > 440) size -= 2;
	const places = spread(frame.text, size);
	const x0 = 240 - width(size) / 2;
	const baseline = 118;
	if (chars.length === 0) {
		fillBox(ctx, 230, baseline - size * 0.8, 20, size, COLORS.white, 2.5);
	}
	chars.forEach((c, i) => {
		const p = places[i];
		const x = x0 + p.x;
		if (i === frame.cursor) {
			fillBox(
				ctx,
				x - 2,
				baseline - size * 0.82,
				Math.max(p.w, size * 0.3) + 4,
				size,
				COLORS.white,
				2.5
			);
		}
		if (c !== ' ')
			text(ctx, c, x, baseline, size, i === frame.cursor ? COLORS.black : COLORS.white);
	});
	// the character strip: the set turning past the cursor (E2)
	const mid = Math.floor(frame.strip.length / 2);
	frame.strip.forEach((c, i) => {
		const x = 240 + (i - mid) * 26;
		const far = Math.abs(i - mid);
		if (i === mid) fillBox(ctx, x - 11, 152, 22, 24, COLORS.white, 2.5);
		const ink = i === mid ? COLORS.black : RAMP[Math.max(2, 6 - far)];
		if (c === ' ') line(ctx, x - 5, 170, x + 5, 170, ink, 1.12);
		else text(ctx, c, x, 170, 20, ink, 'center');
	});
	soft(ctx, frame.soft);
}

function drawConfirm(ctx: ScreenCtx, frame: SystemConfirmFrame): void {
	text(ctx, frame.question, 240, 80, 20, COLORS.light, 'center');
	const size = screenFont.fit(frame.name, 440, 40, 20);
	text(ctx, frame.name, 240, 132, size, COLORS.white, 'center');
	soft(ctx, frame.soft);
}

function drawTuning(ctx: ScreenCtx, frame: SystemTuningFrame): void {
	text(ctx, `tuning ${frame.slot}`, 5, 35, 20, COLORS.light);
	const blocks = [
		{ label: 'note', value: frame.note, x: 110 },
		{ label: 'cents', value: frame.cents, x: 250 },
		{ label: 'micro', value: frame.micro, x: 370 }
	];
	for (const b of blocks) {
		text(ctx, b.label, b.x, 80, 10, COLORS.light, 'center');
		text(ctx, b.value, b.x, 130, 40, COLORS.white, 'center');
	}
	soft(ctx, frame.soft);
}

// ─────────────────────────────────────────────────────────────── power (ours)

/**
 * Our boot sequence (TE's is not in the guide, and its wordmarks stay off the replica, decision
 * D6): the grey ramp fills in as a bar, then the OS version appears under it (manual: power-and-
 * charging: the screen shows the logo and the OS version, then the last selected track).
 */
function drawPower(ctx: ScreenCtx, frame: SystemPowerFrame): void {
	if (frame.phase === 'off') return;
	const cells = RAMP.slice(1);
	const lit = Math.min(cells.length, Math.floor((frame.progress / 0.55) * cells.length));
	cells.forEach((color, i) => {
		if (i < lit) fillBox(ctx, 100 + i * 40, 102, 40, 8, color);
	});
	if (frame.progress >= 0.6) {
		ctx.save();
		ctx.globalAlpha = Math.min(1, (frame.progress - 0.6) / 0.2);
		text(ctx, frame.version, 240, 150, 20, COLORS.light, 'center');
		ctx.restore();
	}
}

const selectedOf = (c: SystemListColumn | undefined) =>
	c && c.selected !== null ? (c.items[c.selected] ?? '') : '';

export const drawers: AreaDrawers<SystemFrame> = {
	'system-list': {
		draw: (ctx, frame) => drawList(ctx, frame),
		describe: (frame) => {
			const [a, b, c] = frame.columns;
			const parts = [selectedOf(a), selectedOf(b), selectedOf(c)].filter(Boolean);
			return `${frame.title}: ${parts.join(', ') || 'empty'}`;
		}
	},
	'system-naming': {
		draw: drawNaming,
		describe: (f) =>
			`${f.notice ?? f.title}: "${f.text}", character ${f.cursor + 1} is "${f.text[f.cursor] ?? ''}"`
	},
	'system-confirm': {
		draw: drawConfirm,
		describe: (f) => `${f.question} ${f.name}: M4 deletes, M3 cancels`
	},
	'system-link': {
		draw: drawLink,
		describe: (f) =>
			f.mode === 'mtp'
				? `mtp mode: the computer can reach the files; M4 ejects. ${f.hint ?? ''}`.trim()
				: f.shift
					? `controller mode: channel ${f.shift[0]}, knobs ${f.shift[1]}, octave keys ${f.shift[2]}`
					: 'controller mode: the keys and encoders send midi; shift + com leaves'
	},
	'system-devices': {
		draw: drawDevices,
		describe: (f) => {
			const device = selectedOf(f.devices);
			if (!device) return 'devices: none known';
			return `devices: ${device}, ${f.status}; ${selectedOf(f.settings)} ${selectedOf(f.values)}`;
		}
	},
	'system-tuning': {
		draw: drawTuning,
		describe: (f) => `tuning ${f.slot}: ${f.note} ${f.cents} cents, ${f.micro} micro-cents`
	},
	'system-power': {
		draw: drawPower,
		describe: (f) => (f.phase === 'off' ? 'switched off' : `starting up, os ${f.version}`)
	}
};
