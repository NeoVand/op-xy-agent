/**
 * Drawing the sequencer area's frames on the 480 × 220 screen (see `../../screen/areas.ts`): one entry per
 * frame page, with a short spoken description for screen readers.
 *
 * TE's guide shows none of these pages. The player pages are drawn as the device draws them
 * (`player-draw.ts`, measured by camera). The rest are still ours, built from the pieces of the
 * pages the guide does show (research 55 §5): the header's grey ramp for the bar menu's four
 * encoders, list selection styles (a white fill for on, an outline for off), 10 px labels over
 * 20 px values, soft labels over M1–M4, and TE's key icons for the step components.
 */
import type { AreaDrawers } from '../../screen/areas';
import type { ScreenCtx } from '../../screen/context';
import { card, fillBox, header, softLabels, strokeBox, text } from '../../screen/draw';
import { screenFont } from '../../screen/font';
import { drawIcon } from '../../screen/icons';
import { COLORS } from '../../screen/palette';
import { describeFrame, renderFrame } from '../../screen/render';
import { COMPONENT_ICONS, COMPONENT_NAMES } from './components';
import { drawPlayer } from './player-draw';
import type { BarFrame, ComponentsFrame, LockFrame, SequencerFrame } from './frames';

// ─────────────────────────────────────────────────────────────────────────── bar menu

/** The pattern map: 16 cells a row, a small gap after every beat, one row per bar. */
const MAP = { x: 35, y: 35, cell: 20, pitch: 25, beatGap: 5, rowPitch: 30 } as const;
const cellX = (i: number) => MAP.x + MAP.pitch * i + MAP.beatGap * Math.floor(i / 4);
const rowY = (bar: number) => MAP.y + MAP.rowPitch * bar;

/** The bar menu: encoder header, pattern map, bars / steps / scale, and what M1 / M2 / M4 clear. */
function drawBar(ctx: ScreenCtx, frame: BarFrame): void {
	header(ctx, frame.header);
	frame.cells.forEach((row, bar) => {
		const y = rowY(bar);
		const exists = bar < frame.bars;
		text(
			ctx,
			String(bar + 1),
			20,
			y + 14,
			10,
			bar === frame.shown ? COLORS.white : COLORS.dim,
			'center'
		);
		if (exists && bar === frame.shown) {
			strokeBox(
				ctx,
				MAP.x - 4.5,
				y - 4.5,
				cellX(15) + MAP.cell - MAP.x + 9,
				MAP.cell + 9,
				COLORS.white,
				1,
				2.5
			);
		}
		row.forEach((cell, i) => {
			const x = cellX(i);
			const head = frame.playhead === bar * 16 + i;
			if (cell === 'none')
				strokeBox(ctx, x + 0.5, y + 0.5, MAP.cell - 1, MAP.cell - 1, COLORS.dark, 0.5, 2);
			else if (cell === 'trimmed')
				strokeBox(ctx, x + 0.5, y + 0.5, MAP.cell - 1, MAP.cell - 1, COLORS.grey1, 1, 2);
			else if (cell === 'empty')
				fillBox(ctx, x, y, MAP.cell, MAP.cell, head ? COLORS.grey4 : COLORS.dark, 2);
			else fillBox(ctx, x, y, MAP.cell, MAP.cell, head ? COLORS.light : COLORS.white, 2);
		});
	});
	const readouts: [string, string][] = [
		['bars', String(frame.bars)],
		['steps', String(frame.length)],
		['scale', frame.scale]
	];
	readouts.forEach(([label, value], i) => {
		const x = MAP.x + 120 * i;
		text(ctx, label, x, 162, 10, COLORS.light);
		text(ctx, value, x, 186, 20, COLORS.white);
	});
	if (frame.pinned) text(ctx, 'pinned', MAP.x + 360, 162, 10, COLORS.light);
	softLabels(ctx, frame.soft);
}

// ─────────────────────────────────────────────────────────────────────────── step components

/** A component's pictogram (TE's key icon, a 40 px box) at `size` px, top-left at (x, y). */
function componentIcon(
	ctx: ScreenCtx,
	index: number,
	x: number,
	y: number,
	size: number,
	color: string
): void {
	drawIcon(ctx, COMPONENT_ICONS[index], x, y, { scale: size / 40, tint: color });
}

/**
 * The step components: the selected steps; the chosen component's key icon on a white card with
 * its name, what its digit does and the ten digits (the black keys, the chosen digit filled); and
 * along the bottom the fourteen components as on the white keys, carded when the selected steps
 * carry them (white: all of them, grey: some).
 */
function drawComponents(ctx: ScreenCtx, frame: ComponentsFrame): void {
	text(ctx, 'steps', 5, 15, 10, COLORS.light);
	const steps = frame.steps.length > 0 ? frame.steps.join(' ') : 'none selected';
	text(ctx, steps, 40, 20, screenFont.fit(steps, 430, 20, 10), COLORS.white);

	const chosen = frame.chosen;
	card(ctx, 20, 35, 110, 110, chosen ? COLORS.white : COLORS.dark);
	if (chosen) {
		componentIcon(ctx, chosen.index, 30, 45, 90, COLORS.ink);
		text(ctx, chosen.name, 150, 55, 20, COLORS.light);
		text(ctx, chosen.value, 150, 100, screenFont.fit(chosen.value, 320, 40, 20), COLORS.white);
		for (let i = 0; i < 10; i++) {
			const digit = (i + 1) % 10;
			const x = 150 + 30 * i;
			const on = chosen.digit === digit;
			if (on) fillBox(ctx, x, 115, 25, 25, COLORS.white, 2.5);
			else strokeBox(ctx, x + 0.5, 115.5, 24, 24, COLORS.grey1, 1, 2.5);
			text(ctx, String(digit), x + 12.5, 134, 20, on ? COLORS.black : COLORS.light, 'center');
		}
	} else {
		text(ctx, 'choose a component', 150, 80, 20, COLORS.light);
		text(ctx, 'then its value', 150, 105, 20, COLORS.dim);
	}

	frame.present.forEach((present, i) => {
		const x = 10.5 + 33 * i;
		const y = 165;
		if (present !== 'none')
			card(ctx, x, y, 30, 30, present === 'all' ? COLORS.white : COLORS.grey4);
		componentIcon(ctx, i, x + 3, y + 3, 24, present === 'none' ? COLORS.grey2 : COLORS.ink);
		if (chosen?.index === i) fillBox(ctx, x, y + 34, 30, 2, COLORS.white);
	});
}

// ─────────────────────────────────────────────────────────────────────────── locks

/**
 * A held step's page: the page itself (its values the step's), and a white tag at the bottom
 * right naming the step, how many locks it has, and the lock turned last.
 */
function drawLock(ctx: ScreenCtx, frame: LockFrame, tick: number): void {
	renderFrame(ctx, frame.base, { tick });
	const head = `step ${frame.step}${frame.locks > 0 ? `  ${frame.locks} lock${frame.locks === 1 ? '' : 's'}` : ''}`;
	const last = frame.last ? `${frame.last.label} ${frame.last.value}` : null;
	const w = Math.max(screenFont.measure(head, 10), last ? screenFont.measure(last, 20) : 0) + 10;
	const h = last ? 38 : 18;
	const x = 474 - w;
	const y = 214 - h;
	fillBox(ctx, x, y, w, h, COLORS.white, 2.5);
	text(ctx, head, x + 5, y + 13, 10, COLORS.ink);
	if (last) text(ctx, last, x + 5, y + 33, 20, COLORS.ink);
}

export const drawers: AreaDrawers<SequencerFrame> = {
	bar: {
		draw: (ctx, frame) => drawBar(ctx, frame),
		describe: (f) =>
			`bar menu: ${f.header.map((c) => `${c.label} ${c.value}`).join(', ')}; ${f.bars} bar${f.bars === 1 ? '' : 's'}, ${f.length} steps, scale ${f.scale}`
	},
	components: {
		draw: (ctx, frame) => drawComponents(ctx, frame),
		describe: (f) =>
			`step components on steps ${f.steps.join(', ') || 'none'}${f.chosen ? `: ${f.chosen.name} ${f.chosen.value}` : ''}; on them: ${
				f.present
					.map((p, i) => (p === 'none' ? '' : COMPONENT_NAMES[i]))
					.filter(Boolean)
					.join(', ') || 'nothing'
			}`
	},
	player: {
		draw: (ctx, frame) => drawPlayer(ctx, frame),
		describe: (f) => {
			if (f.list)
				return `player list for track ${f.list.track}: arpeggio, hold, maestro; ${f.type} chosen`;
			const cards = f.cards
				.filter((c) => c.label)
				.map((c) => `${c.label} ${c.value}`)
				.join(', ');
			const chord = f.maestro
				? f.maestro.root
					? `; chord of ${f.maestro.notes} note${f.maestro.notes === 1 ? '' : 's'} from ${f.maestro.root}`
					: '; no chord stored'
				: '';
			return `${f.type} player ${f.on ? 'on' : 'off'}${cards ? `: ${cards}` : ''}${chord}`;
		}
	},
	lock: {
		draw: (ctx, frame, options) => drawLock(ctx, frame, options.tick ?? 0),
		describe: (f) =>
			`step ${f.step} held, ${f.locks} lock${f.locks === 1 ? '' : 's'}${f.last ? `, ${f.last.label} ${f.last.value}` : ''}: ${describeFrame(f.base)}`
	}
};
