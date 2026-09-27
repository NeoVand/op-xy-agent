/**
 * The M1 page of sampler tracks (guide art sample-056 drum sampler, sample-025 synth sampler,
 * sample-113 multisampler): two lanes (left, right) with the sample's waveform, a grey start
 * marker and a white end marker with handles at the lanes' edges, and a shaded wedge (the drum
 * sampler's fade before the end, the loop crossfade before the loop end). The synth sampler and
 * multisampler add loop markers (ours: TE's art shows the loop spanning start to end, so its
 * markers hide under them). The top row is the tune (main layer) or direction / pan / fade / gain
 * with shift on the drum sampler; the synth sampler shows the tune and its root key, its shift
 * layer direction / tune / crossfade and loop type / gain; the multisampler shows its key strip
 * with the selected zone.
 *
 * Waveforms come from the sample area (`frame.sampler.waves`: stand-ins or measured peaks); frames
 * without them fall back to the seeded stand-in below.
 */
import { decodeWave } from '../../areas/sample/wave';
import type { ScreenCtx } from '../context';
import { fillBox, line, text } from '../draw';
import type { DrumFrame } from '../frame';
import { drawIcon } from '../icons';
import { COLORS } from '../palette';

/** The two lanes: top-left y, the L / R badge's offset, and TE's waveform x offset. */
const LANES = [
	{ y: 30, label: 'L', box: 4.4, x0: 0.51 },
	{ y: 125, label: 'R', box: 10, x0: 1.04 }
] as const;
const LANE_H = 90;
/** A waveform column (2.07 px) and a level step (1.25 px: 16 steps to 20 px). */
const COLUMN = 2.07;
const STEP = 1.25;
/** Widest wedge (fade or crossfade at 99). */
const WEDGE = 70;

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
 * Half-heights of the fallback stand-in waveform (for frames without the sample area's waves),
 * one per 2.1 px column, in TE's 1.25 px steps: a roll of three hits near the start and a few
 * single hits, silence (just the centre line) between.
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

/** A marker across both lanes: a black line (TE draws it under the waveform). */
function markerLine(ctx: ScreenCtx, x: number): void {
	line(ctx, x, 30, x, 216, COLORS.black, 1);
}

/** A marker's 10 × 5 handles in the gaps above, between and below the lanes. */
function handles(ctx: ScreenCtx, x: number, color: string): void {
	for (const y of [25, 120, 215]) fillBox(ctx, x - 5, y, 10, 5, color);
}

/** The shaded wedge that darkens toward `x` (fade before the end, crossfade before the loop end). */
function wedge(ctx: ScreenCtx, x: number, width: number): void {
	if (width <= 0) return;
	ctx.save();
	ctx.globalAlpha = 0.3;
	ctx.fillStyle = COLORS.black;
	for (const [top, bottom] of [
		[30, 120],
		[120, 215]
	]) {
		ctx.beginPath();
		ctx.moveTo(x - width, bottom);
		ctx.lineTo(x, top);
		ctx.lineTo(x, bottom);
		ctx.closePath();
		ctx.fill();
	}
	ctx.restore();
}

/** A lane's L / R badge. */
function badge(ctx: ScreenCtx, lane: (typeof LANES)[number]): void {
	fillBox(ctx, 5, lane.y + lane.box, 20, 20, COLORS.light, 1.6);
	text(ctx, lane.label, 15.5, lane.y + lane.box + 16.6, 17.5, COLORS.black, 'center');
}

/** The tune readout: TE's note and the value (sample-025). */
function tune(ctx: ScreenCtx, value: string, x: number): void {
	drawIcon(ctx, 'sampler.note', x, 4);
	text(ctx, value, x + 14.2, 20, 20, COLORS.white);
}

/** The drum sampler's shift layer (sample-056): direction, pan between L and R, fade, gain. */
function directionIcon(ctx: ScreenCtx, reverse: boolean): void {
	if (!reverse) {
		drawIcon(ctx, 'sampler.direction', 38, 4);
		return;
	}
	ctx.save();
	ctx.translate(38 + 71, 0);
	ctx.scale(-1, 1);
	drawIcon(ctx, 'sampler.direction', 38, 4);
	ctx.restore();
}

/** The gain wedge: white, the part above the gain covered by a dark block (as TE draws it). */
function gainWedge(ctx: ScreenCtx, gain: number): void {
	ctx.fillStyle = COLORS.white;
	ctx.beginPath();
	ctx.moveTo(424.2, 20);
	ctx.lineTo(470, 20);
	ctx.lineTo(470, 5);
	ctx.closePath();
	ctx.fill();
	const cut = 424.2 + 45.8 * Math.max(0, Math.min(1, gain));
	if (cut < 470) fillBox(ctx, cut, 5, 470 - cut, 15, COLORS.dark);
}

/** The loop types as the synth sampler's shift layer names them (ours). */
const LOOP_LABELS: Readonly<Record<string, string>> = {
	forever: 'forever',
	release: 'release',
	off: 'loop off'
};

/**
 * The multisampler's key strip (sample-113): 96 keys of 5 px from F−1, the selected zone's keys
 * white and edged in black, octave lines between F and E, black keys as short strokes.
 */
function keyStrip(ctx: ScreenCtx, zone: { lo: number; hi: number } | null): void {
	const WHITE = [0, 2, 4, 6, 7, 9, 11];
	const noteOf = (cell: number) => 5 + 12 * Math.floor(cell / 7) + WHITE[cell % 7];
	const inZone = (cell: number) =>
		zone !== null && noteOf(cell) >= zone.lo && noteOf(cell) <= zone.hi;
	for (let c = 0; c < 96; c++) {
		const on = inZone(c);
		fillBox(ctx, c * 5, 0, 5, 25, on ? COLORS.white : COLORS.grey2);
		ctx.strokeStyle = on ? COLORS.black : COLORS.grey2;
		ctx.lineWidth = 0.25;
		ctx.beginPath();
		ctx.rect(c * 5, 0, 5, 25);
		ctx.stroke();
	}
	// black keys: after F, G, A, C and D (F-based cells 0, 1, 2, 4, 5)
	for (let c = 0; c < 95; c++) {
		if (![0, 1, 2, 4, 5].includes(c % 7)) continue;
		line(ctx, (c + 1) * 5, 0, (c + 1) * 5, 15, inZone(c) ? COLORS.black : COLORS.grey2, 3);
	}
	for (let x = 35; x < 480; x += 35) line(ctx, x, 0, x, 25, COLORS.black, 0.25);
	if (!zone) return;
	const cells = Array.from({ length: 96 }, (_, c) => c).filter(inZone);
	if (cells.length === 0) return;
	line(ctx, cells[0] * 5, 0, cells[0] * 5, 25, COLORS.black, 1);
	const right = (cells[cells.length - 1] + 1) * 5;
	line(ctx, right, 0, right, 25, COLORS.black, 1);
}

/** Draws the M1 page of a sampler track. */
export function drawDrum(ctx: ScreenCtx, frame: DrumFrame): void {
	const view = frame.sampler;
	const engine = view?.engine ?? 'drum';
	const filled = view ? view.waves !== null : true;
	const levels = view?.waves
		? view.waves.map((w) => decodeWave(w).map((v) => v * STEP))
		: [drumWave(frame.seed), drumWave(frame.seed)];
	const startX = frame.start * 480;
	const endX = frame.end * 480;
	const loop =
		view?.loop && view.loop.type !== 'off' && view.loop.start < view.loop.end ? view.loop : null;

	for (const lane of LANES) fillBox(ctx, 0, lane.y, 480, LANE_H, COLORS.dark, 2.5);
	badge(ctx, LANES[0]);
	if (filled) {
		// TE draws the marker lines and the wedge under the waveform
		if (loop) {
			markerLine(ctx, loop.start * 480);
			markerLine(ctx, loop.end * 480);
		}
		markerLine(ctx, startX);
		markerLine(ctx, endX);
		if (engine === 'drum') wedge(ctx, endX, Math.round(frame.fade * WEDGE));
		else if (loop) wedge(ctx, loop.end * 480, Math.round(loop.crossfade * WEDGE));
		ctx.fillStyle = COLORS.white;
		LANES.forEach((lane, i) => {
			const mid = lane.y + LANE_H / 2;
			const x0 = view?.waves ? lane.x0 : 0;
			const width = view?.waves ? COLUMN : 2.1;
			levels[i].forEach((h, c) => {
				if (h > 0) ctx.fillRect(x0 + c * width, mid - h, width, 2 * h);
			});
		});
	}
	for (const lane of LANES) {
		const mid = lane.y + LANE_H / 2;
		line(ctx, lane.x0, mid, 480, mid, COLORS.white, 0.71);
	}
	if (filled) {
		if (loop) {
			handles(ctx, loop.start * 480, COLORS.grey2);
			handles(ctx, loop.end * 480, COLORS.grey2);
		}
		// start handles: TE's drum art is a darker grey than the synth and multi art
		handles(ctx, startX, engine === 'drum' ? COLORS.grey3 : COLORS.grey4);
		handles(ctx, endX, COLORS.white);
	}
	badge(ctx, LANES[1]);

	if (frame.shift) {
		directionIcon(ctx, frame.reverse);
		if (engine === 'drum') {
			text(ctx, 'L', 124.3, 20, 20, COLORS.light);
			text(ctx, 'R', 188.3, 20, 20, COLORS.light);
			line(ctx, 144.4, 5, 179.4, 5, COLORS.grey3, 1);
			line(ctx, 144.4, 19.8, 179.4, 19.8, COLORS.grey3, 1);
			const panX = 161.9 + Math.max(-1, Math.min(1, frame.pan)) * 17.5;
			line(ctx, panX, 5, panX, 20, COLORS.light, 1.5);
		} else {
			// synth sampler and multisampler: tune on E2, the loop type beside the crossfade
			tune(ctx, frame.tune, 132.5);
			text(ctx, LOOP_LABELS[view?.loop?.type ?? 'forever'] ?? '', 336, 17.5, 10, COLORS.light);
		}
		drawIcon(ctx, 'sampler.fade', 283, 4);
		gainWedge(ctx, frame.gain);
		return;
	}
	if (engine === 'multisampler') {
		keyStrip(ctx, view?.zone ?? null);
		return;
	}
	tune(ctx, frame.tune, 9);
	if (engine === 'sampler') {
		// the root key the sample is tuned to (sample-025: an arrow and the note's letter)
		const root = view?.root ?? '';
		drawIcon(ctx, 'sample.root', 439.5, 4.5);
		text(ctx, root, 462.2, 17.5, root.length > 1 ? 10 : 13.4, COLORS.white, 'center');
		return;
	}
	// drum sampler: the key and its play mode at the right (ours)
	text(ctx, `${frame.key}  ${frame.playMode}`, 470, 20, 20, COLORS.light, 'right');
}
