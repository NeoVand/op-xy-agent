/**
 * The drum sampler's M1 page for the selected key (guide art sample-056, sample-025): two lanes
 * (left, right) with the sample's waveform, a grey start marker and a white end marker with handles
 * at the lanes' edges, and the fade shading before the end. The top row is the tune readout (main
 * layer, as on the synth sampler) or, with shift held, direction / pan / fade / gain.
 *
 * We have no audio, so the waveform is a deterministic stand-in seeded per key.
 */
import type { ScreenCtx } from '../context';
import { fillBox, line, text } from '../draw';
import type { DrumFrame } from '../frame';
import { drawIcon } from '../icons';
import { COLORS } from '../palette';

/** The two lanes: top-left y and height, full width. */
const LANES = [
	{ y: 30, label: 'L', box: 4.4 },
	{ y: 125, label: 'R', box: 10 }
] as const;
const LANE_H = 90;

/** 0–1 pseudo-random from an integer (mulberry32 step). */
function rand(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Relative half-heights of one hit around its spike (TE's stepped "tree"): before, spike, tail. */
const HIT = [0.06, 0.12, 1, 0.56, 0.12, 0.19, 0.25, 0.19, 0.12, 0.06] as const;
const SPIKE_AT = 2;

/**
 * Half-heights of the stand-in waveform, one per 2.1 px column, in TE's 1.25 px steps: a roll of
 * three hits near the start and a few single hits, silence (just the centre line) between.
 */
export function drumWave(seed: number, columns = 229): number[] {
	const next = rand(seed * 7919 + 17);
	const hits = [
		{ at: 5, peak: 1 },
		{ at: 9, peak: 1 },
		{ at: 13, peak: 1 },
		{ at: 40 + Math.floor(next() * 8), peak: 0.75 + 0.2 * next() },
		{ at: 66 + Math.floor(next() * 10), peak: 0.7 + 0.25 * next() },
		{ at: 112 + Math.floor(next() * 16), peak: 0.6 + 0.35 * next() }
	];
	const out = new Array<number>(columns).fill(0);
	for (const hit of hits) {
		HIT.forEach((k, i) => {
			const c = hit.at + i - SPIKE_AT;
			if (c >= 0 && c < columns) out[c] = Math.max(out[c], k * hit.peak);
		});
	}
	return out.map((v) => Math.round(v * 16) * 1.25);
}

/** Draws the drum sampler page. */
export function drawDrum(ctx: ScreenCtx, frame: DrumFrame): void {
	const wave = drumWave(frame.seed);
	const startX = Math.round(frame.start * 480);
	const endX = Math.round(frame.end * 480);
	for (const lane of LANES) {
		fillBox(ctx, 0, lane.y, 480, LANE_H, COLORS.dark, 2.5);
		const mid = lane.y + LANE_H / 2;
		ctx.fillStyle = COLORS.white;
		wave.forEach((h, i) => {
			if (h > 0) ctx.fillRect(i * 2.1, mid - h, 2.1, 2 * h);
		});
		line(ctx, 0.7, mid, 479.7, mid, COLORS.white, 0.71);
		// fade: the wedge that darkens toward the end marker
		const fadeW = Math.round(frame.fade * 70);
		if (fadeW > 0) {
			ctx.save();
			ctx.globalAlpha = 0.3;
			ctx.fillStyle = COLORS.black;
			ctx.beginPath();
			ctx.moveTo(endX - fadeW, lane.y + LANE_H);
			ctx.lineTo(endX, lane.y);
			ctx.lineTo(endX, lane.y + LANE_H);
			ctx.closePath();
			ctx.fill();
			ctx.restore();
		}
		// TE sets the R badge lower in its lane than the L badge
		fillBox(ctx, 5, lane.y + lane.box, 20, 20, COLORS.light, 1.6);
		text(ctx, lane.label, 15.5, lane.y + lane.box + 16.6, 17.5, COLORS.black, 'center');
	}
	// markers: black lines across both lanes, handles at the edges (start grey, end white)
	line(ctx, startX + 0.5, 30, startX + 0.5, 216, COLORS.black, 1);
	line(ctx, endX + 0.5, 30, endX + 0.5, 216, COLORS.black, 1);
	for (const y of [25, 120, 215]) fillBox(ctx, startX - 4.5, y, 10, 5, COLORS.grey3);
	for (const y of [25, 120, 215]) fillBox(ctx, endX - 4.5, y, 10, 5, COLORS.white);

	if (!frame.shift) {
		// main layer: tune (♩ −1.22) at the left, the key and play mode at the right
		drawIcon(ctx, 'sampler.note', 9, 4);
		text(ctx, frame.tune, 23.2, 20, 20, COLORS.white);
		text(ctx, `${frame.key}  ${frame.playMode}`, 470, 20, 20, COLORS.light, 'right');
		return;
	}
	// shift layer: direction, pan between L and R, fade, gain
	if (frame.reverse) {
		ctx.save();
		ctx.translate(38 + 71, 0);
		ctx.scale(-1, 1);
		drawIcon(ctx, 'sampler.direction', 38, 4);
		ctx.restore();
	} else drawIcon(ctx, 'sampler.direction', 38, 4);
	text(ctx, 'L', 124.3, 20, 20, COLORS.light);
	text(ctx, 'R', 188.3, 20, 20, COLORS.light);
	line(ctx, 144.4, 5, 179.4, 5, COLORS.grey3, 1);
	line(ctx, 144.4, 19.8, 179.4, 19.8, COLORS.grey3, 1);
	const panX = 161.9 + Math.max(-1, Math.min(1, frame.pan)) * 17.5;
	line(ctx, panX, 5, panX, 20, COLORS.light, 1.5);
	drawIcon(ctx, 'sampler.fade', 283, 4);
	// gain: a white wedge, the part above the gain covered by a dark block (full height, as TE draws)
	ctx.fillStyle = COLORS.white;
	ctx.beginPath();
	ctx.moveTo(424.2, 20);
	ctx.lineTo(470, 20);
	ctx.lineTo(470, 5);
	ctx.closePath();
	ctx.fill();
	const cut = 424.2 + 45.8 * Math.max(0, Math.min(1, frame.gain));
	if (cut < 470) fillBox(ctx, cut, 5, 470 - cut, 15, COLORS.dark);
}
