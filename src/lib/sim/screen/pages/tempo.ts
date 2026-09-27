/**
 * The tempo page (guide art tempo-005): a grey panel, the BPM large on the left, a metronome whose
 * pendulum swings with the beat and whose dots count the bar, the groove's two letters on its body,
 * a swing/shuffle slider below, and the metronome's level (sound waves) and click (the jack's dot)
 * on the right.
 */
import type { ScreenCtx } from '../context';
import { disc, fillBox, line, text } from '../draw';
import type { TempoFrame } from '../frame';
import { drawIcon } from '../icons';
import { COLORS, SCREEN_CORNER_RADIUS } from '../palette';

/** Pivot of the pendulum and its length (the rod leans 22° in TE's drawing). */
const PIVOT = { x: 240, y: 139.4 } as const;
const ROD = 125.5;
const SWING = (22 * Math.PI) / 180;
/** The weight's centre along the rod, and its size across × along the rod. */
const WEIGHT_AT = 65.2;
const WEIGHT = { across: 21, along: 15 } as const;

/** Sound waves: concentric rings from the speaker, clipped to a cone. */
const WAVES = { cx: 409, cy: 63.05, r0: 5.75, step: 3.19, count: 10 } as const;

/** Draws the tempo page. */
export function drawTempo(ctx: ScreenCtx, frame: TempoFrame): void {
	fillBox(ctx, 0, 0, 480, 220, COLORS.tempo, SCREEN_CORNER_RADIUS);

	// tempo, 50 px, centred where TE's "125" sits (the readout runs a little tight)
	text(ctx, frame.bpm, 100, 125, 50, COLORS.black, 'center', -0.067);

	// metronome: body, groove letters, beat dots, pendulum with its weight
	drawIcon(ctx, 'tempo.metronome', 194, 14);
	text(ctx, frame.groove, 239.5, 110, 20, COLORS.tempo, 'center');
	for (let i = 0; i < 4; i++) {
		disc(ctx, 210 + 20 * i, 155, 2.5, i === frame.beat ? COLORS.card : COLORS.tempo);
	}
	const angle = Math.max(-1, Math.min(1, frame.pendulum)) * SWING;
	const sin = Math.sin(angle);
	const cos = Math.cos(angle);
	line(
		ctx,
		PIVOT.x + sin * 4,
		PIVOT.y - cos * 4,
		PIVOT.x + sin * ROD,
		PIVOT.y - cos * ROD,
		COLORS.chrome,
		2
	);
	ctx.save();
	ctx.translate(PIVOT.x + sin * WEIGHT_AT, PIVOT.y - cos * WEIGHT_AT);
	ctx.rotate(angle);
	fillBox(ctx, -WEIGHT.across / 2, -WEIGHT.along / 2, WEIGHT.across, WEIGHT.along, COLORS.chrome);
	disc(ctx, 0, 0, 5, COLORS.black);
	ctx.restore();

	// swing (right) / shuffle (left) slider: ticks every 10 px, the centre one taller
	const ruler = '#141514';
	line(ctx, 190, 190, 290, 190, ruler, 0.5);
	for (let x = 190; x <= 290; x += 10) line(ctx, x, x === 240 ? 180 : 185, x, 190, ruler, 0.5);
	const swing = Math.max(-1, Math.min(1, frame.swing));
	drawIcon(ctx, 'tempo.thumb', 232 + swing * 50, 169);

	// metronome level: the speaker and as many waves as the level; the click's dot by the jack
	drawIcon(ctx, 'tempo.speaker', 379, 47);
	const waves = Math.round(Math.max(0, Math.min(1, frame.metronome.level)) * WAVES.count);
	if (waves > 0) {
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(411.96, 63.04);
		ctx.lineTo(455, 20);
		ctx.lineTo(455, 106.09);
		ctx.closePath();
		ctx.clip();
		ctx.globalAlpha = frame.metronome.on ? 1 : 0.35;
		for (let i = 0; i < waves; i++) {
			ctx.strokeStyle = COLORS.card;
			ctx.lineWidth = 1 + 0.037 * i;
			ctx.beginPath();
			ctx.arc(WAVES.cx, WAVES.cy, WAVES.r0 + WAVES.step * i, 0, Math.PI * 2);
			ctx.stroke();
		}
		ctx.restore();
	}
	drawIcon(ctx, 'tempo.jack', 374, 139);
	if (frame.metronome.on) disc(ctx, 430.9, 146.75, 3.3, COLORS.card);
}
