/**
 * wavetable's M1 picture as the device draws it (camera, OS 1.1.33: the CC sweeps steps-348…388 and
 * the 10 fps recording of the drift sweep; docs/research/59-screen-profiling.md §2.5): one cycle of
 * the table's frame at the position, 2 px white on black, 40…440 across and centred on y 130.3.
 *
 * - table (E1) and position (E2) pick the frame: the sound engine's own (`TABLES`), crossfaded
 *   between neighbouring frames as it plays them, drawn at each table's level: 271 px per unit of
 *   10^(dB/20)/RMS fitted all tables within 4 % (fractal excepted), up to the 96th harmonic. Each
 *   table has a polarity (and some a half-cycle turn) on screen, fitted per table;
 * - warp (E3) bends the drawing: the frame's phase s is drawn across at
 *   x = s − 0.228w·(sin(2πs + θ₁) − sin θ₁) − 0.018w·(sin(4πs + θ₂) − sin θ₂), θ₁ = −95°, θ₂ = −27°
 *   (fitted on zap at position 99 for nine warps; past w ≈ 0.7 the start loops back on itself);
 * - drift (E4) turns that bend round the cycle (by α, the second term twice as fast) and draws the
 *   two cycles before in fading copies, each α = π·drift behind (the settled frames show the
 *   copies' spread growing to half a turn at full drift).
 */
import { TABLES } from '$lib/sound/synth/engines/wavetable';
import type { ScreenCtx } from '../../context';
import type { SynthFrame } from '../../frame';
import { COLORS } from '../../palette';
import { motionOf, unit } from './common';

/** The measured layout and mappings. */
export const WAVE = {
	left: 40,
	width: 400,
	centre: 130.3,
	/** Pixels per unit of level-scaled frame (the frame × 10^(dB/20) / its RMS). */
	scale: 271,
	/** Harmonics drawn, Lanczos-smoothed (64–160 fitted best; the device draws no ripple at steps). */
	harmonics: 128,
	/** Points across the cycle. */
	points: 400,
	line: 2,
	/** Warp's bend: its two terms' depth at full warp (in proportion below) and phases at drift 0. */
	warp: { depth: [0.228, 0.018], phase: [(-95 * Math.PI) / 180, (-27 * Math.PI) / 180] },
	/** Drift's copies: how bright each is, newest first (the frames show two or three). */
	copies: [1, 0.55, 0.3],
	/** How fast θ turns at full drift, turns per second (ours: the camera's 10 fps cannot tell). */
	spin: 1.2
} as const;

/** Each table's polarity and half-cycle turn on screen (fitted per table, in `TABLES` order). */
const ORIENT: readonly (readonly [1 | -1, 0 | 0.5])[] = [
	[-1, 0.5], // basic
	[-1, 0], // buzz
	[-1, 0.5], // crush
	[-1, 0.5], // drawbars
	[-1, 0.5], // fibonacci
	[-1, 0], // fractal
	[-1, 0.5], // geometric
	[-1, 0.5], // primes (unseen: as its neighbours)
	[-1, 0] // zap
];

/** A table drawn off centre: fractal sits 4.3 px high (one capture, position 96; in frame units). */
const LIFT: Readonly<Record<number, number>> = { 5: 4.3 / 271 };

const frames = new Map<string, Float32Array>();

/** One frame of table `t` as drawn: `points` samples of a cycle, level-scaled and oriented. */
function frame(t: number, f: number): Float32Array {
	const key = `${t}:${f}`;
	const cached = frames.get(key);
	if (cached) return cached;
	const table = TABLES[t];
	const count = table.frames ?? 32;
	const x = count > 1 ? f / (count - 1) : 0;
	const p = table.frame(x);
	// buzz's frames all share its first frame's gain, as the engine plays them
	const gain = table.shared ? levelGain(t, table.frame(0), 0) : levelGain(t, p, x);
	const [sign, turn] = ORIENT[t] ?? [1, 0];
	const n = WAVE.points;
	const out = new Float32Array(n + 1);
	const top = Math.min(p.amp.length, WAVE.harmonics);
	for (let h = 1; h <= top; h++) {
		const k = (Math.PI * h) / (WAVE.harmonics + 1);
		const a = p.amp[h - 1] * (Math.sin(k) / k);
		if (!a) continue;
		const phase = (p.phase?.[h - 1] ?? 0) + 2 * Math.PI * h * turn;
		for (let i = 0; i <= n; i++) out[i] += a * Math.sin((2 * Math.PI * h * i) / n + phase);
	}
	const lift = LIFT[t] ?? 0;
	for (let i = 0; i <= n; i++) out[i] = out[i] * sign * gain + lift;
	frames.set(key, out);
	return out;
}

/** The gain that brings a frame to its table's level at `x`: 10^(dB/20) over its RMS. */
function levelGain(t: number, p: { amp: ArrayLike<number> }, x: number): number {
	const db = TABLES[t].db;
	const level = typeof db === 'number' ? db : levelAt(db, x);
	let power = 0;
	for (let h = 1; h <= Math.min(p.amp.length, 400); h++) power += 0.5 * p.amp[h - 1] ** 2;
	return Math.pow(10, level / 20) / Math.sqrt(power || 1);
}

/** A level read linearly between the tenths of the position it was measured at. */
function levelAt(db: readonly number[], x: number): number {
	const at = Math.min(db.length - 2, Math.floor(x * (db.length - 1)));
	const f = x * (db.length - 1) - at;
	return db[at] + (db[at + 1] - db[at]) * f;
}

/** The table a lane picks (nine equal zones, as the engine reads it). */
export const tableIndex = (lane: number): number =>
	Math.min(TABLES.length - 1, Math.floor(unit(lane) * TABLES.length));

/** The cycle drawn for table and position lanes: `points + 1` values (level-scaled). */
export function wavetableCycle(tableLane: number, position: number): Float32Array {
	const t = tableIndex(tableLane);
	const count = TABLES[t].frames ?? 32;
	const at = unit(position) * (count - 1);
	const f0 = Math.floor(at);
	const f1 = Math.min(count - 1, f0 + 1);
	const w = at - f0;
	const a = frame(t, f0);
	if (w < 1e-6 || f1 === f0) return a;
	const b = frame(t, f1);
	return a.map((v, i) => v + (b[i] - v) * w);
}

/**
 * Where the cycle's phase `s` (0–1) is drawn across (0–1) for a warp lane and the bend turned by
 * `turn` (radians; drift).
 */
export function warpedX(s: number, warp: number, turn = 0): number {
	const w = unit(warp);
	let x = s;
	WAVE.warp.depth.forEach((depth, k) => {
		const theta = WAVE.warp.phase[k] + (k + 1) * turn;
		x -= depth * w * (Math.sin(2 * Math.PI * (k + 1) * s + theta) - Math.sin(theta));
	});
	return x;
}

function drawCycle(ctx: ScreenCtx, cycle: Float32Array, warp: number, turn: number): void {
	const n = cycle.length - 1;
	ctx.beginPath();
	for (let i = 0; i <= n; i++) {
		const x = WAVE.left + WAVE.width * warpedX(i / n, warp, turn);
		const y = WAVE.centre - WAVE.scale * cycle[i];
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
	ctx.stroke();
}

/** Draws wavetable's picture under the header. */
export function drawWavetable(ctx: ScreenCtx, frame: SynthFrame, tick = 0): void {
	const [table, position, warp, drift] = frame.params.map(unit);
	const cycle = wavetableCycle(table, position);
	const motion = motionOf(frame, tick);
	ctx.save();
	ctx.strokeStyle = COLORS.white;
	ctx.lineWidth = WAVE.line;
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	if (drift <= 0 || warp <= 0) {
		drawCycle(ctx, cycle, warp, 0);
	} else {
		const turn = 2 * Math.PI * WAVE.spin * drift * (motion.time / 1000);
		const alpha = ctx.globalAlpha;
		// oldest first, so the newest lies on top
		for (let k = WAVE.copies.length - 1; k >= 0; k--) {
			ctx.globalAlpha = alpha * WAVE.copies[k];
			drawCycle(ctx, cycle, warp, turn - k * Math.PI * drift);
		}
		ctx.globalAlpha = alpha;
	}
	ctx.restore();
}
