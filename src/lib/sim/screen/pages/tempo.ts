/**
 * The tempo page as the device draws it, measured on the owner's OS 1.1.33 unit by camera
 * (docs/research/59-screen-profiling.md §2.11). TE's guide art (tempo-005) has the same parts on a
 * mid grey; on the device:
 *
 * - the page is light grey and the BPM large on the left in dark grey, its figures set the way the
 *   device sets them (a narrow 1);
 * - the black metronome carries the groove's two letters, bold in the page's grey, and four beat
 *   dots, the beat's dot white while the sequencer plays;
 * - the white pendulum pivots low in the metronome and rests leaning left at the end of its swing;
 *   playing, it swings end to end in a beat, at an end on each beat. Its weight sits lower the
 *   faster the tempo;
 * - the groove amount is a thumb on a ruler below the metronome;
 * - the metronome's level shows as sound waves from a speaker, the outer ones going first as it
 *   drops and none while the metronome is off; the jack beside it is grey.
 *
 * The camera's colours are not usable (a strong cyan cast), so colours are TE's palette tones
 * chosen by the captures' relative brightness. The speaker and the jack are traced off the device
 * (`research/device/icontrace.py`, knowledge/opxy/device-icons/tempo.json). Coordinates are design
 * px, the capture's rows scaled by 220/222.
 */
import type { ScreenCtx } from '../context';
import { disc, fillBox, roundRectPath, text } from '../draw';
import { screenFont } from '../font';
import type { TempoFrame } from '../frame';
import { drawIcon } from '../icons';
import { COLORS, SCREEN, SCREEN_CORNER_RADIUS } from '../palette';

/**
 * The page's grey. Beside it the camera put the jack at 0.85 of its brightness, the thumb at 1.2 and
 * the white pendulum at 1.39: TE's fourth grey, card grey and white against its light grey make
 * 0.86, 1.17 and 1.40, and the tones next to them do not.
 */
const PAGE = COLORS.light;

// ─────────────────────────────────────────────────────────────────────────── BPM

/**
 * The BPM: 50 px figures in TE's grey1 (the camera: 0.36 of the page's brightness, grey1 makes 0.41
 * and the darker tone 0.27), centred at x 107.25 on baseline 125.5. The glyphs are the screen
 * font's, but the device sets them with a proportional 1: its ink starts 73 units further left and
 * it advances 394 units instead of 545 (1000 to the em), with no kerning next to it, as the step
 * and octave popups show it too (research 59 §2.8, §2.12); at this size the run is also set
 * 0.037 em tight. Fitted to 40, 80, 118, 120, 160, 200 and 220 BPM: every glyph within a pixel
 * (0.47 px rms, the device placing each on whole pixels).
 */
const BPM = {
	x: 107.25,
	baseline: 125.5,
	size: 50,
	tracking: -0.037,
	color: COLORS.grey1
} as const;
const ONE = { shift: -73, advance: 394 } as const;

/** Where each character of the BPM goes (pen x from the run's start) and the run's width, px. */
export function bpmLayout(bpm: string): {
	readonly glyphs: readonly { readonly ch: string; readonly x: number }[];
	readonly width: number;
} {
	const { size, tracking } = BPM;
	const k = size / screenFont.data.unitsPerEm;
	const chars = [...bpm];
	const glyphs: { ch: string; x: number }[] = [];
	let pen = 0;
	chars.forEach((ch, i) => {
		const next = chars[i + 1];
		let advance: number;
		if (ch === '1') {
			glyphs.push({ ch, x: pen + ONE.shift * k });
			advance = ONE.advance * k;
		} else {
			glyphs.push({ ch, x: pen });
			// the font's advance and its kerning with the next character (none next to a 1)
			advance =
				next !== undefined && next !== '1'
					? screenFont.measure(ch + next, size) - screenFont.measure(next, size)
					: screenFont.measure(ch, size);
		}
		if (next !== undefined) advance += tracking * size;
		pen += advance;
	});
	return { glyphs, width: pen };
}

function drawBpm(ctx: ScreenCtx, bpm: string): void {
	const { glyphs, width } = bpmLayout(bpm);
	const x0 = BPM.x - width / 2;
	for (const g of glyphs) text(ctx, g.ch, x0 + g.x, BPM.baseline, BPM.size, BPM.color);
}

// ─────────────────────────────────────────────────────────────────────────── metronome

/**
 * The metronome's body: TE's trapezoid on its short upright foot, as measured (its top 0.9 px lower
 * than the art's, its foot 0.3 and 0.6 px narrower at the right and left).
 */
const BODY = [
	[229.67, 15.9],
	[250.38, 15.9],
	[284.72, 157.9],
	[284.72, 164.65],
	[195.56, 164.65],
	[195.56, 157.9]
] as const;

/** The groove's letters: 20 px in the heavier weight, the page's grey, centred at 238.8. */
const GROOVE = { x: 238.8, baseline: 110, size: 20 } as const;

/** The beat dots: four of radius 3, 20 apart, in the page's grey, the beat's white while playing. */
const DOTS = { x: 210.2, pitch: 20, y: 155, r: 3 } as const;

/**
 * The pendulum pivots at (240.5, 136) and leans 43.1° either side at the ends of its swing (it
 * rests at the left end, where the frames at rest caught it; the right end reached 42.3° in the
 * frames that caught it playing). The rod is 3 px wide (3.03 against the page; the camera's glare
 * widens it to 3.3 over the black), from 0.8 px behind the pivot to 121.2 px out, square ended.
 */
const PIVOT = { x: 240.5, y: 136 } as const;
const SWING = (43.1 * Math.PI) / 180;
const ROD = { back: 0.8, length: 121.2, width: 3 } as const;

/**
 * The weight: 16.75 px along the rod by 22 across, corners of 1 px, a black dot of radius 4.7
 * in its middle. Its centre sits 104.9 px up the rod at 40 BPM and 10.5 px at 220, linear in the
 * tempo between them (0.524 px per BPM, measured at seven tempos to 0.05 px).
 */
const WEIGHT = { along: 16.75, across: 22, radius: 1, dot: 4.7, top: 104.9, bottom: 10.5 } as const;

const unit = (v: number) => Math.max(-1, Math.min(1, v));

/** How far up the rod the weight's centre sits (px from the pivot) for `weight` 0 (40 BPM) … 1. */
export function weightAlong(weight: number): number {
	return WEIGHT.top + (WEIGHT.bottom - WEIGHT.top) * Math.max(0, Math.min(1, weight));
}

/** The point `along` px up the rod from the pivot, for a pendulum position −1 (left) … 1. */
export function pendulumPoint(pendulum: number, along: number): { x: number; y: number } {
	const angle = unit(pendulum) * SWING;
	return { x: PIVOT.x + Math.sin(angle) * along, y: PIVOT.y - Math.cos(angle) * along };
}

function drawMetronome(ctx: ScreenCtx, frame: TempoFrame): void {
	ctx.fillStyle = COLORS.black;
	ctx.beginPath();
	ctx.moveTo(BODY[0][0], BODY[0][1]);
	for (const [x, y] of BODY.slice(1)) ctx.lineTo(x, y);
	ctx.closePath();
	ctx.fill();

	text(ctx, frame.groove, GROOVE.x, GROOVE.baseline, GROOVE.size, PAGE, 'center', 0, true);
	for (let i = 0; i < 4; i++) {
		disc(ctx, DOTS.x + DOTS.pitch * i, DOTS.y, DOTS.r, i === frame.beat ? COLORS.white : PAGE);
	}

	// the pendulum, drawn pointing up from the pivot and turned (as pendulumPoint): + leans right
	const at = weightAlong(frame.weight);
	ctx.save();
	ctx.translate(PIVOT.x, PIVOT.y);
	ctx.rotate(unit(frame.pendulum) * SWING);
	fillBox(ctx, -ROD.width / 2, -ROD.length, ROD.width, ROD.length + ROD.back, COLORS.white);
	const { along, across } = WEIGHT;
	fillBox(ctx, -across / 2, -at - along / 2, across, along, COLORS.white, WEIGHT.radius);
	disc(ctx, 0, -at, WEIGHT.dot, COLORS.black);
	ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────── groove amount

/**
 * The ruler: a 2 px line from x 189.5 to 290.5 (its top at 188.95) with 1 px ticks every 10 px
 * rising 4 px above it, the middle one 9 px; in TE's grey2 (the camera: 0.58 of the page's
 * brightness, grey2 makes 0.56).
 */
const RULER = {
	x0: 189.5,
	x1: 290.5,
	top: 188.95,
	height: 2.05,
	tick: 184.9,
	middle: 179.9
} as const;

/**
 * The thumb: 15.6 × 40.1 px from y 169.8, corners of 1, in the card grey, with a hole of radius 5
 * at its centre on the ruler's line (the ruler shows through it). Its centre is at 240.15 at no
 * groove and moves 44.25 px either way: CC81 put it at 195.9 for 0, 240.2 for 64 and 283.7 for
 * 127, linear to 0.3 px. (Where our ±99 swing sits on the device's scale is ours.)
 */
const THUMB = { x: 240.15, travel: 44.25, width: 15.6, top: 169.8, height: 40.1, hole: 5 } as const;

/** The thumb's centre x for a swing −1 (shuffle) … 1 (swing). */
export function thumbX(swing: number): number {
	return THUMB.x + THUMB.travel * unit(swing);
}

function drawGroove(ctx: ScreenCtx, swing: number): void {
	const color = COLORS.grey2;
	fillBox(ctx, RULER.x0, RULER.top, RULER.x1 - RULER.x0, RULER.height, color);
	for (let i = 0; i <= 10; i++) {
		const top = i === 5 ? RULER.middle : RULER.tick;
		fillBox(ctx, 189.5 + 10 * i, top, 1, RULER.top - top, color);
	}
	const cx = thumbX(swing);
	const holeY = RULER.top + RULER.height / 2;
	ctx.fillStyle = COLORS.card;
	ctx.beginPath();
	roundRectPath(ctx, cx - THUMB.width / 2, THUMB.top, THUMB.width, THUMB.height, 1);
	ctx.moveTo(cx + THUMB.hole, holeY);
	ctx.arc(cx, holeY, THUMB.hole, 0, Math.PI * 2);
	ctx.fill('evenodd');
}

// ─────────────────────────────────────────────────────────────────────────── metronome level

/**
 * Sound waves: rings every 3.19 px from radius 5.52 around (408.85, 63.45), 1.6 px wide, cut to a
 * 90° cone opening from (405.75, 64), so the inner rings reach further round. The outer rings go
 * first as the level drops. Ten at full is TE's art; the level a new project stores (0xA8 of 0xFF,
 * docs/research/10-xy-format.md §3.2) then makes seven, as the owner's frames showed before E4
 * moved, and a little higher showed eight. The last ring stays at any level above zero (ours).
 */
const WAVES = { cx: 408.85, cy: 63.45, r0: 5.52, step: 3.19, width: 1.6, count: 10 } as const;
const CONE = { x: 405.75, y: 64 } as const;

/** How many sound waves a level shows (0–1), none while the metronome is off. */
export function waveCount(level: number, on: boolean): number {
	if (!on) return 0;
	return Math.max(0, Math.ceil(Math.min(1, level) * WAVES.count - 1e-9));
}

function drawLevel(ctx: ScreenCtx, metronome: TempoFrame['metronome']): void {
	drawIcon(ctx, 'tempo.device.speaker', 376, 44, { tint: COLORS.black });
	const waves = waveCount(metronome.level, metronome.on);
	if (waves > 0) {
		const reach = SCREEN.width - CONE.x;
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(CONE.x, CONE.y);
		ctx.lineTo(SCREEN.width, CONE.y - reach);
		ctx.lineTo(SCREEN.width, CONE.y + reach);
		ctx.closePath();
		ctx.clip();
		ctx.strokeStyle = COLORS.white;
		ctx.lineWidth = WAVES.width;
		for (let i = 0; i < waves; i++) {
			ctx.beginPath();
			ctx.arc(WAVES.cx, WAVES.cy, WAVES.r0 + WAVES.step * i, 0, Math.PI * 2);
			ctx.stroke();
		}
		ctx.restore();
	}
	// the jack and its dot: grey in every frame, the waves showing or not. TE's art draws them
	// black with the dot lit; what that means on the device is not seen.
	drawIcon(ctx, 'tempo.device.jack', 372, 144, { tint: COLORS.grey4 });
	disc(ctx, 432.05, 155.47, 3.65, COLORS.grey4);
}

/** Draws the tempo page. */
export function drawTempo(ctx: ScreenCtx, frame: TempoFrame): void {
	fillBox(ctx, 0, 0, SCREEN.width, SCREEN.height, PAGE, SCREEN_CORNER_RADIUS);
	drawBpm(ctx, frame.bpm);
	drawMetronome(ctx, frame);
	drawGroove(ctx, frame.swing);
	drawLevel(ctx, frame.metronome);
}
