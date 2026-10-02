// The six send effects rendered offline in a real browser: each one is there and follows its four
// values (and the tempo), a slot crossfades to another effect without a click and takes dry's
// share of the sends out of the mix, and the sound engine runs whatever the simulator's FX slots
// hold, as shift + T7 / T8 choose it.
import { describe, expect, it } from 'vitest';
import { fft } from '$lib/core/dsp/fft';
import { initialAuxiliary } from '$lib/sim/areas/auxiliary/state';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { defaultState, type SimState } from '$lib/sim/params';
import { SoundEngine } from './engine';
import { EffectSlot, lofiHold, type EffectSettings } from './fx';
import { Resources } from './resources';

const SR = 44100;
const [FX1, FX2] = initialAuxiliary().fx;

interface Options {
	readonly bpm?: number;
	/** The input's own sound in the mix too (a track sent at 99), with the slot's bypass. */
	readonly mix?: boolean;
	/** Later settings and the audio time they arrive. */
	readonly changes?: readonly (readonly [number, EffectSettings])[];
}

/** Renders `input` sent into a slot holding `settings`: the slot's return (or the mix), L and R. */
async function render(
	settings: EffectSettings,
	input: Float32Array,
	seconds: number,
	options: Options = {}
): Promise<[Float32Array, Float32Array]> {
	const context = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
	const bpm = options.bpm ?? 120;
	const slot = new EffectSlot(context, new Resources(context), settings, bpm);
	const buffer = context.createBuffer(1, input.length, SR);
	buffer.copyToChannel(input as Float32Array<ArrayBuffer>, 0);
	const source = context.createBufferSource();
	source.buffer = buffer;
	source.connect(slot.input);
	slot.output.connect(context.destination);
	if (options.mix) {
		source.connect(context.destination);
		slot.bypass.connect(context.destination);
	}
	for (const [time, next] of options.changes ?? []) slot.apply(next, bpm, time);
	source.start(0);
	const out = await context.startRendering();
	return [out.getChannelData(0), out.getChannelData(1)];
}

const fx = (type: EffectSettings['type'], params: number[]): EffectSettings => ({ type, params });

const sine = (hz: number, seconds: number, amp = 0.3) =>
	Float32Array.from(
		{ length: Math.round(SR * seconds) },
		(_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR)
	);

/** One sample at full scale `at` seconds in. */
function click(at: number, seconds: number, more: readonly number[] = []) {
	const x = new Float32Array(Math.round(SR * seconds));
	for (const t of [at, ...more]) x[Math.round(SR * t)] = 1;
	return x;
}

/** Seeded white noise, `seconds` long. */
function noise(seconds: number, amp = 0.3) {
	let s = 1;
	return Float32Array.from({ length: Math.round(SR * seconds) }, () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return amp * ((s / 4294967296) * 2 - 1);
	});
}

const range = (x: Float32Array, from: number, to: number) =>
	x.subarray(Math.round(from * SR), Math.min(x.length, Math.round(to * SR)));

function rms(x: Float32Array, from: number, to: number) {
	const d = range(x, from, to);
	let sum = 0;
	for (const v of d) sum += v * v;
	return Math.sqrt(sum / Math.max(1, d.length));
}

/** When `x` peaks between `from` and `to`, s. */
function peakAt(x: Float32Array, from: number, to: number) {
	const d = range(x, from, to);
	let at = 0;
	for (let i = 1; i < d.length; i++) if (Math.abs(d[i]) > Math.abs(d[at])) at = i;
	return from + at / SR;
}

/** The largest step from one sample to the next between `from` and `to`. */
function jump(x: Float32Array, from: number, to: number) {
	const d = range(x, from, to);
	let most = 0;
	for (let i = 1; i < d.length; i++) most = Math.max(most, Math.abs(d[i] - d[i - 1]));
	return most;
}

/** Power spectrum between `from` and `to` (Hann windows of `n`, half overlapping, averaged). */
function spectrum(x: Float32Array, from: number, to: number, n = 4096) {
	const out = new Float64Array(n / 2);
	const d = range(x, from, to);
	let frames = 0;
	for (let start = 0; start + n <= d.length; start += n / 2) {
		const re = new Float64Array(n);
		const im = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			re[i] = d[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
		}
		fft(re, im);
		for (let k = 0; k < n / 2; k++) out[k] += re[k] * re[k] + im[k] * im[k];
		frames++;
	}
	return { power: out.map((v) => v / Math.max(1, frames)), n };
}

/** Harmonics 2–10 against the fundamental `hz`, in amplitude. */
function distortionOf(x: Float32Array, hz: number, from: number, to: number) {
	const { power, n } = spectrum(x, from, to);
	const band = (f: number) => {
		const k = Math.round((f * n) / SR);
		let s = 0;
		for (let j = k - 3; j <= k + 3; j++) s += power[j] ?? 0;
		return s;
	};
	let harmonics = 0;
	for (let h = 2; h <= 10; h++) harmonics += band(hz * h);
	return Math.sqrt(harmonics / band(hz));
}

/** The spectrum in 1/24-octave bands from 100 Hz to 10 kHz, with each band's centre. */
function bands(x: Float32Array, from: number, to: number, n = 4096) {
	const { power } = spectrum(x, from, to, n);
	const out: { hz: number; power: number }[] = [];
	for (let hz = 100; hz < 10000; hz *= Math.pow(2, 1 / 24)) {
		const a = Math.round((hz * n) / SR);
		const b = Math.max(a + 1, Math.round((hz * Math.pow(2, 1 / 24) * n) / SR));
		let s = 0;
		for (let k = a; k < b; k++) s += power[k];
		out.push({ hz, power: s / (b - a) });
	}
	return out;
}

/** The deepest notches of a band spectrum: local minima 10 dB or more under its peak. */
function notches(spectrumBands: { hz: number; power: number }[]) {
	const top = Math.max(...spectrumBands.map((b) => b.power));
	return spectrumBands.filter(
		(b, i, all) =>
			i > 0 &&
			i < all.length - 1 &&
			b.power < all[i - 1].power &&
			b.power < all[i + 1].power &&
			b.power < top * 0.1
	);
}

/** How much the pitch of a steady tone wanders: its periods' spread over their mean. */
function wander(x: Float32Array, from: number, to: number) {
	const d = range(x, from, to);
	const periods: number[] = [];
	let last = -1;
	for (let i = 1; i < d.length; i++) {
		if (d[i - 1] < 0 && d[i] >= 0) {
			const at = i - 1 + d[i - 1] / (d[i - 1] - d[i]);
			if (last >= 0) periods.push(at - last);
			last = at;
		}
	}
	const mean = periods.reduce((a, b) => a + b, 0) / periods.length;
	const spread = Math.sqrt(periods.reduce((a, b) => a + (b - mean) ** 2, 0) / periods.length);
	return spread / mean;
}

/** How alike two channels are: 1 the same, 0 unrelated. */
function correlation(a: Float32Array, b: Float32Array, from: number, to: number) {
	const [x, y] = [range(a, from, to), range(b, from, to)];
	let xy = 0;
	let xx = 0;
	let yy = 0;
	for (let i = 0; i < x.length; i++) {
		xy += x[i] * y[i];
		xx += x[i] * x[i];
		yy += y[i] * y[i];
	}
	return xy / Math.sqrt(xx * yy);
}

/** The average run of equal samples (a held value lasts its run). */
function run(x: Float32Array, from: number, to: number) {
	const d = range(x, from, to);
	let changes = 0;
	for (let i = 1; i < d.length; i++) if (Math.abs(d[i] - d[i - 1]) > 1e-6) changes++;
	return d.length / Math.max(1, changes);
}

describe('the delay', () => {
	it('repeats left after the size’s note value, then right, at the tempo', async () => {
		const [left, right] = await render(FX1, click(0.05, 0.1), 1.2);
		// a new project's 1/8 dotted at 120 bpm: 0.375 s (the right side one render quantum on,
		// where the feedback loop is broken)
		expect(peakAt(left, 0.06, 0.6)).toBeCloseTo(0.425, 3);
		expect(Math.abs(peakAt(right, 0.6, 1.1) - 0.8)).toBeLessThan(0.004);
		const [slower] = await render(FX1, click(0.05, 0.1), 1.2, { bpm: 90 });
		expect(peakAt(slower, 0.06, 0.8)).toBeCloseTo(0.55, 3);
		// size 30 is the 1/16 zone: an eighth of a second
		const [short] = await render(fx('delay', [30, FX1.params[1], 0, 99]), click(0.05, 0.1), 0.5);
		expect(peakAt(short, 0.06, 0.3)).toBeCloseTo(0.175, 3);
	});

	it('brings back as many repeats as feedback says', async () => {
		const repeats = async (feedback: number) => {
			const [left, right] = await render(
				fx('delay', [FX1.params[0], FX1.params[1], feedback, 99]),
				click(0.05, 0.1),
				3.6
			);
			return Array.from({ length: 9 }, (_, i) => {
				const t = 0.05 + (i + 1) * 0.375;
				return rms(i % 2 === 0 ? left : right, t - 0.01, t + 0.03);
			});
		};
		const none = await repeats(0);
		expect(none[0]).toBeGreaterThan(1e-3);
		expect(none[1]).toBeGreaterThan(1e-3);
		for (const later of none.slice(2)) expect(later).toBeLessThan(1e-6);
		const stored = await repeats(FX1.params[2]);
		expect(stored[4]).toBeLessThan(stored[0] * 0.3);
		expect(stored[4]).toBeGreaterThan(stored[0] * 0.03);
		const most = await repeats(99);
		expect(most[8]).toBeGreaterThan(most[0] * 0.2);
		expect(most[8]).toBeGreaterThan(stored[8] * 5);
	});

	it('fades out even at full feedback, never running away', async () => {
		const [left] = await render(
			fx('delay', [FX1.params[0], FX1.params[1], 99, 99]),
			click(0.05, 0.1),
			20
		);
		const early = rms(left, 1, 5);
		expect(early).toBeGreaterThan(1e-3);
		expect(rms(left, 15, 19)).toBeLessThan(early * 0.6);
	});

	it('moves to a new spacing while it runs', async () => {
		// a click before and after the size turns to its 1/16 zone at 0.6 s
		const [left] = await render(FX1, click(0.05, 1.5, [1.0]), 1.5, {
			changes: [[0.6, fx('delay', [30, FX1.params[1], FX1.params[2], 99])]]
		});
		expect(peakAt(left, 0.06, 0.6)).toBeCloseTo(0.425, 3);
		expect(peakAt(left, 1.01, 1.3)).toBeCloseTo(1.125, 3);
	});
});

describe('the reverb', () => {
	/** When the tail of a short noise burst has fallen 40 dB. */
	const fallen = (x: Float32Array) => {
		const level = rms(x, 0, 0.1);
		let at = 0;
		for (let t = 0.1; t < x.length / SR - 0.05; t += 0.05)
			if (rms(x, t, t + 0.05) > level / 100) at = t;
		return at;
	};

	it('rings longer as size grows: a room, the hall a new project rings, a cathedral', async () => {
		const tail = async (size: number) =>
			fallen((await render(fx('reverb', [size, 0, FX2.params[2], 99]), noise(0.05), 7))[0]);
		const room = await tail(20);
		const hall = await tail(FX2.params[0]);
		const cathedral = await tail(99);
		expect(room).toBeLessThan(0.7);
		// the hall's 2.2 s RT60 falls 40 dB in about two thirds of it
		expect(hall).toBeGreaterThan(1.2);
		expect(hall).toBeLessThan(1.8);
		expect(cathedral).toBeGreaterThan(2.5);
	});

	it('darkens with tone down and thins with it up', async () => {
		const brightness = (x: Float32Array) => {
			const d = range(x, 0.1, 1);
			let level = 0;
			let slope = 0;
			for (let i = 1; i < d.length; i++) {
				level += d[i] * d[i];
				slope += (d[i] - d[i - 1]) ** 2;
			}
			return Math.sqrt(slope / level);
		};
		const tone = async (t: number) =>
			brightness((await render(fx('reverb', [40, 0, t, 99]), noise(0.05), 1.2))[0]);
		expect(await tone(0)).toBeLessThan((await tone(FX2.params[2])) * 0.4);
		// at the top a highpass takes the lows out
		const low = async (t: number) =>
			rms((await render(fx('reverb', [40, 0, t, 99]), sine(100, 2), 2))[0], 1, 2);
		expect(await low(99)).toBeLessThan((await low(50)) * 0.05);
	});

	it('swells with mod: a held tone’s tail moves', async () => {
		const movement = async (mod: number) => {
			const [left] = await render(fx('reverb', [20, mod, FX2.params[2], 99]), sine(1000, 3), 3);
			const windows: number[] = [];
			for (let t = 1.5; t < 2.9; t += 0.02) windows.push(rms(left, t, t + 0.02));
			const mean = windows.reduce((a, b) => a + b, 0) / windows.length;
			return Math.sqrt(windows.reduce((a, b) => a + (b - mean) ** 2, 0) / windows.length) / mean;
		};
		expect(await movement(0)).toBeLessThan(0.01);
		expect(await movement(99)).toBeGreaterThan(0.1);
	});

	it('opens a bigger room while it plays, and the sound goes on into it', async () => {
		const late = async (changes: Options['changes']) =>
			rms((await render(fx('reverb', [10, 0, 50, 99]), noise(0.3), 3, { changes }))[0], 1.5, 2);
		const small = await late([]);
		const grown = await late([[0.1, fx('reverb', [99, 0, 50, 99])]]);
		expect(grown).toBeGreaterThan(small * 100 + 1e-4);
	});
});

describe('the chorus', () => {
	it('wobbles the pitch as deep and as fast as depth and rate say', async () => {
		const wobble = async (rate: number, depth: number) =>
			wander((await render(fx('chorus', [rate, depth, 0, 0]), sine(440, 3), 3))[0], 0.5, 2.9);
		expect(await wobble(50, 0)).toBeLessThan(1e-4);
		const deep = await wobble(50, 99);
		expect(deep).toBeGreaterThan(0.01);
		expect(await wobble(99, 99)).toBeGreaterThan(deep * 3);
	});

	it('spreads from mono to wide with stereo', async () => {
		const alike = async (stereo: number) => {
			const [left, right] = await render(fx('chorus', [50, 50, 0, stereo]), sine(440, 3), 3);
			return correlation(left, right, 0.5, 2.9);
		};
		expect(await alike(0)).toBeGreaterThan(0.999);
		expect(await alike(99)).toBeLessThan(0.5);
	});

	it('rings on with feedback', async () => {
		const ringing = async (feedback: number) =>
			rms((await render(fx('chorus', [50, 0, feedback, 0]), click(0.05, 0.1), 0.5))[0], 0.1, 0.3);
		expect(await ringing(0)).toBeLessThan(1e-6);
		expect(await ringing(99)).toBeGreaterThan(1e-4);
	});
});

describe('the distortion', () => {
	const tone = (params: number[]) => render(fx('distortion', params), sine(220, 1.5), 1.5);

	it('adds harmonics as drive rises, and more as clip hardens', async () => {
		const harmonics = async (params: number[]) =>
			distortionOf((await tone(params))[0], 220, 0.2, 1.4);
		expect(await harmonics([0, 0, 0, 0])).toBeLessThan(0.02);
		const mid = await harmonics([50, 50, 0, 0]);
		expect(mid).toBeGreaterThan(0.15);
		expect(await harmonics([99, 50, 0, 0])).toBeGreaterThan(mid * 1.3);
		expect(await harmonics([50, 99, 0, 0])).toBeGreaterThan(await harmonics([50, 0, 0, 0]));
	});

	it('keeps its level within a few dB as drive rises', async () => {
		const clean = rms((await tone([0, 50, 0, 0]))[0], 0.2, 1.4);
		for (const drive of [25, 50, 75, 99]) {
			const level = rms((await tone([drive, 50, 0, 0]))[0], 0.2, 1.4) / clean;
			expect(Math.abs(20 * Math.log10(level))).toBeLessThan(6);
		}
	});

	it('cuts lows with lo cut and highs with hi cut, before the drive', async () => {
		const through = async (hz: number, params: number[]) =>
			rms((await render(fx('distortion', params), sine(hz, 1), 1))[0], 0.2, 0.9);
		expect(await through(80, [0, 0, 99, 0])).toBeLessThan((await through(80, [0, 0, 0, 0])) * 0.05);
		expect(await through(5000, [0, 0, 0, 99])).toBeLessThan(
			(await through(5000, [0, 0, 0, 0])) * 0.05
		);
	});
});

describe('the lofi', () => {
	const tone = (params: number[], hz = 441, changes?: Options['changes']) =>
		render(fx('lofi', params), sine(hz, 1, 0.4), 1, { changes });

	it('holds each value for the rate’s whole samples, and none at 99', async () => {
		const [held] = await tone([30, 99, 0, 0]);
		expect(run(held, 0.2, 0.9)).toBeCloseTo(lofiHold(30, SR), 0);
		expect(lofiHold(30, SR)).toBeGreaterThan(20);
		const [clean] = await tone([99, 99, 0, 0]);
		expect(run(clean, 0.2, 0.9)).toBeLessThan(1.05);
	});

	it('follows a new rate from when it is set', async () => {
		const [left] = await tone([30, 99, 0, 0], 441, [[0.5, fx('lofi', [50, 99, 0, 0])]]);
		expect(run(left, 0.1, 0.49)).toBeCloseTo(lofiHold(30, SR), 0);
		expect(run(left, 0.51, 0.95)).toBeCloseTo(lofiHold(50, SR), 0);
	});

	it('quantises to its bits', async () => {
		// 440 Hz rarely repeats a sample, so the bits limit the values it takes: how many it takes to
		// cover all but a thousandth of the samples (the curve's interpolation leaves a rare sample
		// between two steps)
		const levels = async (bits: number) => {
			const [left] = await tone([99, bits, 0, 0], 440);
			const samples = range(left, 0.2, 0.9);
			const seen = new Map<number, number>();
			for (const v of samples) {
				const key = Math.round(v * 1e6);
				seen.set(key, (seen.get(key) ?? 0) + 1);
			}
			const counts = [...seen.values()].sort((a, b) => b - a);
			let covered = 0;
			let n = 0;
			while (covered < samples.length * 0.999) covered += counts[n++];
			return n;
		};
		expect(await levels(0)).toBeLessThanOrEqual(5);
		expect(await levels(50)).toBeLessThanOrEqual(2 ** 7 + 1);
		expect(await levels(99)).toBeGreaterThan(1000);
	});

	it('takes the aliasing and the highs away as quality rises', async () => {
		const level = async (quality: number) =>
			rms((await tone([50, 99, quality, 0], 3000))[0], 0.2, 0.9);
		expect(await level(99)).toBeLessThan((await level(0)) * 0.4);
	});

	it('sets the two channels apart with drift', async () => {
		const apart = async (drift: number) => {
			const [left, right] = await tone([50, 99, 0, drift]);
			const l = range(left, 0.2, 0.9);
			const r = range(right, 0.2, 0.9);
			let sum = 0;
			for (let i = 0; i < l.length; i++) sum += (l[i] - r[i]) ** 2;
			return Math.sqrt(sum / l.length);
		};
		expect(await apart(0)).toBe(0);
		expect(await apart(99)).toBeGreaterThan(0.05);
	});
});

describe('the phaser', () => {
	/** A track's own noise and its phaser return, as the mix hears them. */
	const mixed = (params: number[]) => render(fx('phaser', params), noise(2.2), 2.2, { mix: true });

	it('carves notches against the track’s own sound, where frequency puts them', async () => {
		const low = bands((await mixed([30, 0, 50, 0]))[0], 0.2, 2);
		const high = bands((await mixed([70, 0, 50, 0]))[0], 0.2, 2);
		const depth = (b: typeof low) =>
			10 * Math.log10(Math.max(...b.map((x) => x.power)) / Math.min(...b.map((x) => x.power)));
		expect(depth(low)).toBeGreaterThan(20);
		expect(notches(low).length).toBeGreaterThanOrEqual(4);
		expect(notches(high)[0].hz).toBeGreaterThan(notches(low)[0].hz);
	});

	it('sweeps the notches with depth, at the rate', async () => {
		const sweep = async (depth: number) => {
			const [left] = await mixed([50, depth, 50, 0]);
			// a second apart the LFO (0.4 Hz) has turned by more than a third of a cycle
			const a = bands(left, 0.4, 0.6, 2048).map((b) => Math.log(b.power));
			const b = bands(left, 1.4, 1.6, 2048).map((b) => Math.log(b.power));
			const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
			const [ma, mb] = [mean(a), mean(b)];
			let ab = 0;
			let aa = 0;
			let bb = 0;
			for (let i = 0; i < a.length; i++) {
				ab += (a[i] - ma) * (b[i] - mb);
				aa += (a[i] - ma) ** 2;
				bb += (b[i] - mb) ** 2;
			}
			return ab / Math.sqrt(aa * bb);
		};
		expect(await sweep(0)).toBeGreaterThan(0.8);
		expect(await sweep(99)).toBeLessThan((await sweep(0)) - 0.3);
	});

	it('rings on with feedback', async () => {
		const ringing = async (feedback: number) =>
			rms((await render(fx('phaser', [50, 0, 50, feedback]), click(0.05, 0.1), 0.5))[0], 0.1, 0.2);
		expect(await ringing(99)).toBeGreaterThan((await ringing(0)) * 10);
	});
});

describe('an FX slot', () => {
	it('crossfades to another effect without a click', async () => {
		// a small room, whose under-a-second impulse has filled by the time the chorus comes in
		const [left] = await render(fx('reverb', [20, 0, FX2.params[2], 99]), sine(220, 2.5), 2.5, {
			changes: [[1.5, fx('chorus', [50, 99, 0, 0])]]
		});
		// the reverb of a steady tone is a steady tone; the chorus after it wobbles
		expect(wander(left, 1, 1.45)).toBeLessThan(1e-3);
		expect(wander(left, 1.8, 2.45)).toBeGreaterThan(0.01);
		const steady = Math.max(jump(left, 1, 1.45), jump(left, 1.8, 2.45));
		expect(jump(left, 1.45, 1.8)).toBeLessThan(steady * 1.2);
	});

	it('runs the new effect once it has faded in', async () => {
		const [left] = await render(FX2, sine(220, 2), 2, {
			changes: [[1, fx('distortion', [50, 50, 0, 0])]]
		});
		expect(distortionOf(left, 220, 0.4, 0.95)).toBeLessThan(0.05);
		expect(distortionOf(left, 220, 1.3, 1.95)).toBeGreaterThan(0.15);
	});

	it('takes dry’s share of the sends out of the mix: all at 0, none at 99', async () => {
		const own = async (dry: number) => {
			const [left] = await render(
				fx('delay', [FX1.params[0], FX1.params[1], FX1.params[2], dry]),
				sine(220, 0.3),
				0.4,
				{ mix: true }
			);
			// before the first repeat: only the input's own sound
			return rms(left, 0.05, 0.3);
		};
		const kept = await own(99);
		expect(kept).toBeCloseTo(0.3 / Math.SQRT2, 3);
		expect(await own(0)).toBeLessThan(kept * 1e-3);
		expect((await own(49.5)) / kept).toBeCloseTo(0.5, 2);
	});
});

describe('the sound engine runs the effect each FX slot holds', () => {
	/**
	 * A short note on T3 at 0.3 s (once the first sync's glides have settled), sent to FX I only,
	 * through an engine that took `state`.
	 */
	const note = async (state: SimState) => {
		state.tracks[2].sends = [0, 0, 99, 0];
		state.tracks[2].amp.release = 97;
		const context = new OfflineAudioContext(2, Math.round(SR * 1.2), SR);
		const engine = new SoundEngine({ context });
		engine.sync(state, 0);
		engine.noteOn({
			track: 2,
			settings: state.tracks[2],
			note: 60,
			velocity: 100,
			time: 0.3,
			duration: 0.05
		});
		const out = await context.startRendering();
		const effects = engine.effects;
		engine.dispose();
		return { left: out.getChannelData(0), effects };
	};

	it('builds the effect shift + T7 / T8 choose', async () => {
		const sim = new OpxySim({ now: () => 0 });
		const context = new OfflineAudioContext(2, SR, SR);
		const engine = new SoundEngine({ context });
		engine.sync(sim.state, 0);
		expect(engine.effects).toEqual(['delay', 'reverb']);
		sim.press('key.auxiliary');
		sim.combo('key.shift', 'track.7');
		sim.turn(4, 1);
		sim.click(4);
		engine.sync(sim.state, 0);
		expect(engine.effects).toEqual(['distortion', 'reverb']);
		sim.combo('key.shift', 'track.8');
		sim.turn(4, -2);
		sim.click(4);
		engine.sync(sim.state, 0);
		expect(engine.effects).toEqual(['distortion', 'lofi']);
		engine.dispose();
	});

	it('echoes a new project’s notes on FX I a dotted eighth later, and stops once FX I runs a chorus', async () => {
		const plain = await note(defaultState());
		expect(plain.effects).toEqual(['delay', 'reverb']);
		const sounded = rms(plain.left, 0.3, 0.36);
		expect(sounded).toBeGreaterThan(1e-3);
		// the note ends by 0.4 s; its echo comes 0.375 s after it started
		expect(rms(plain.left, 0.67, 0.73)).toBeGreaterThan(sounded * 0.1);
		const state = defaultState();
		state.areas.auxiliary.fx[0] = { type: 'chorus', params: [50, 50, 50, 50] };
		const chorused = await note(state);
		expect(chorused.effects).toEqual(['chorus', 'reverb']);
		expect(rms(chorused.left, 0.67, 0.73)).toBeLessThan(sounded * 1e-3);
	});

	it('leaves only the echoes of a track sent at 99 when FX I’s dry is at 0', async () => {
		const kept = rms((await note(defaultState())).left, 0.3, 0.36);
		const state = defaultState();
		state.areas.auxiliary.fx[0].params[3] = 0;
		const insert = await note(state);
		expect(rms(insert.left, 0.3, 0.36)).toBeLessThan(kept * 1e-3);
		expect(rms(insert.left, 0.67, 0.73)).toBeGreaterThan(kept * 0.1);
	});
});
