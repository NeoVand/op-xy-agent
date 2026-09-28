/**
 * dissolve's M1 picture as the device draws it (camera, OS 1.1.33: the CC sweeps steps-225…265 and
 * the 10 fps recording; docs/research/59-screen-profiling.md §2.5): a mosaic of 10 px squares over
 * the whole page under the top bar, each lit in a grey or dark, at random.
 *
 * - swarm (E1) evens the greys out: at low swarm the lit squares take any grey up to the brightest,
 *   at full nearly all take the brightest;
 * - am (E2) lights more of them: a third up to am 0.6, half at full (0.35, 0.41 at 0.7, 0.51);
 * - fm (E3) whitens them: the brightest grey climbs the ramp from #5x at 0 to white by 0.75;
 * - detune (E4) changes nothing that settles on screen (the frames at detune 0 and 99 match; only
 *   the motion blur of a moving mosaic differs).
 *
 * The mosaic holds still until notes sound, then stirs: while they sound it is dealt afresh about
 * 15 times a second (a quarter of the squares outlast a 0.1 s camera frame), denser and a grey
 * darker (at am 0.7: 0.60 of the squares lit instead of 0.41, one ramp step down). When the notes
 * stop it freezes on a new deal at the resting density. Each square eases into its next grey.
 */
import type { ScreenCtx } from '../../context';
import type { SynthFrame } from '../../frame';
import { RAMP } from '../../palette';
import { ease, hash, motionOf, unit } from './common';

/** The measured layout (design px) and the fitted mappings. */
export const DISSOLVE = {
	/** Squares: size, columns, rows, the first row's top (a black pixel row under the top bar). */
	cell: 10,
	cols: 48,
	rows: 20,
	top: 21,
	/** Share of squares lit: 0.35 up to am 0.6, rising to 0.51 at full. */
	lit: { low: 0.35, high: 0.51, knee: 0.6 },
	/** The brightest grey as a place on the ramp (1 = #2f2f37 … 7 = white): base + fm·rise. */
	grey: { base: 2.8, rise: 6 },
	/** How far below the brightest a square may fall (share of its level): wide at low swarm. */
	spread: { narrow: 0.2, wide: 0.75, from: 0.4, to: 0.9 },
	/** A new deal every … ms of sounding (fitted: squares outlast a 0.1 s frame a quarter of the time). */
	deal: 66,
	/** While notes sound: this share of the dark squares light up, the greys a ramp step darker. */
	sounding: { fill: 0.32, darker: 1 },
	/** How fast that change comes and goes (ours). */
	fade: 80
} as const;

/** The share of squares lit for an am lane. */
export function litShare(am: number): number {
	const l = DISSOLVE.lit;
	const t = unit((unit(am) - l.knee) / (1 - l.knee));
	return l.low + (l.high - l.low) * t;
}

/** The brightest grey's level (0–255) for an fm lane, read along TE's ramp (`darker` steps down). */
export function topGrey(fm: number, darker = 0): number {
	const place = Math.max(
		1,
		Math.min(7, DISSOLVE.grey.base + DISSOLVE.grey.rise * unit(fm)) - darker
	);
	const i = Math.floor(place);
	const f = place - i;
	const level = (k: number) => parseInt(RAMP[Math.min(7, k)].slice(1, 3), 16);
	return level(i) + (level(i + 1) - level(i)) * f;
}

/** How far a square may fall below the brightest (share of its level) for a swarm lane. */
export function greySpread(swarm: number): number {
	const s = DISSOLVE.spread;
	const t = unit((s.to - unit(swarm)) / (s.to - s.from));
	return s.narrow + (s.wide - s.narrow) * t;
}

/** The ramp grey nearest to a level. */
function nearestRamp(level: number): string {
	let best: string = RAMP[1];
	let gap = Infinity;
	for (const c of RAMP.slice(1)) {
		const d = Math.abs(parseInt(c.slice(1, 3), 16) - level);
		if (d < gap) {
			gap = d;
			best = c;
		}
	}
	return best;
}

/** One square's level in deal `deal` (0 when dark). */
function level(
	deal: number,
	i: number,
	j: number,
	lit: number,
	top: number,
	spread: number
): number {
	if (hash(deal, i, j) >= lit) return 0;
	return top * (1 - spread * hash(deal, i + 97, j + 53));
}

/** Draws dissolve's mosaic under the header. */
export function drawDissolve(ctx: ScreenCtx, frame: SynthFrame, tick = 0): void {
	const [swarm, am, fm] = frame.params.map(unit);
	const d = DISSOLVE;
	const motion = motionOf(frame, tick);
	const deals = motion.travel / d.deal;
	const deal = Math.floor(deals);
	// each square eases from its last deal's grey into this one's over the first half of the deal
	const blend = Math.min(1, (deals - deal) * 2);
	// how much the notes sound: eased in on a note, out when they stop
	const sound =
		motion.notes > 0
			? ease((motion.onset ?? d.fade) / d.fade)
			: motion.release === null
				? 0
				: 1 - ease(motion.release / d.fade);
	const rest = litShare(am);
	const lit = rest + (1 - rest) * d.sounding.fill * sound;
	const top = topGrey(fm, d.sounding.darker * sound);
	const spread = greySpread(swarm);
	for (let j = 0; j < d.rows; j++) {
		const y = d.top + j * d.cell;
		for (let i = 0; i < d.cols; i++) {
			const now = level(deal, i, j, lit, top, spread);
			const before = blend < 1 ? level(deal - 1, i, j, lit, top, spread) : now;
			const v = before + (now - before) * blend;
			if (v < 12) continue;
			ctx.fillStyle = nearestRamp(v);
			ctx.fillRect(i * d.cell, y, d.cell, d.cell);
		}
	}
}
