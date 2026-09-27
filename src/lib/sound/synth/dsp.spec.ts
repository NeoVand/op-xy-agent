// The synth core's building blocks, measured: harmonic levels against the waveforms' series,
// aliasing against plain (naive) waveforms, filter slopes against their analog prototypes, and FM
// sidebands against Bessel functions.
import { describe, expect, it } from 'vitest';
import { fft, harmonicLevels, inharmonicDb, levelAt, rms, spectralDistance } from './analysis';
import { BLEP_OVERSAMPLE, BLEP_SPAN, blepResidual } from './blep';
import { Decimator, Ladder, OnePole, Svf, prewarp } from './filters';
import { Noise, Wander } from './noise';
import { NO_WRAP, Operator, Phase, Saw, ShapeOscillator, type ShapeMix } from './oscillators';
import { WaveTable, partialsOf } from './wavetable';

const SR = 48000;
const db = (x: number) => 20 * Math.log10(x);

function render(n: number, next: (i: number) => number): Float64Array {
	const out = new Float64Array(n);
	for (let i = 0; i < n; i++) out[i] = next(i);
	return out;
}

/** Plain waveforms, for how much the band-limited ones improve on them. */
function naiveSaw(hz: number, n: number): Float64Array {
	let p = 0;
	return render(n, () => {
		p += hz / SR;
		if (p >= 1) p -= 1;
		return 2 * p - 1;
	});
}

const mix = (m: Partial<ShapeMix>): ShapeMix => ({
	sine: 0,
	triangle: 0,
	saw: 0,
	pulse: 0,
	width: 0.5,
	...m
});

describe('analysis', () => {
	it('finds a sine in its FFT bin and inverts back', () => {
		const n = 1024;
		const re = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 16 * i) / n));
		const im = new Float64Array(n);
		fft(re, im);
		expect(Math.hypot(re[16], im[16])).toBeCloseTo(n / 2, 6);
		expect(Math.hypot(re[17], im[17])).toBeLessThan(1e-9);
		fft(re, im, true);
		expect(re[4]).toBeCloseTo(Math.sin((2 * Math.PI * 16 * 4) / n), 9);
	});

	it('reads a sine’s amplitude at its frequency', () => {
		const x = render(SR / 2, (i) => 0.5 * Math.sin((2 * Math.PI * 441 * i) / SR));
		expect(levelAt(x, SR, 441)).toBeCloseTo(0.5, 3);
		expect(levelAt(x, SR, 882)).toBeLessThan(1e-3);
		expect(rms(x)).toBeCloseTo(0.5 / Math.SQRT2, 3);
	});

	it('measures tone apart from level: the same saw quieter is no distance away', () => {
		const a = naiveSaw(220, 8192);
		const b = a.map((v) => v * 0.25);
		const c = render(8192, (i) => Math.sin((2 * Math.PI * 220 * i) / SR));
		expect(spectralDistance(a, b, SR)).toBeLessThan(0.01);
		expect(spectralDistance(a, c, SR)).toBeGreaterThan(10);
	});
});

describe('band-limited steps', () => {
	it('settle from −1 to 0 within their span, with nothing before the jump', () => {
		const r = blepResidual();
		expect(r.length).toBe(BLEP_SPAN * BLEP_OVERSAMPLE + 2);
		expect(r[0]).toBeLessThan(-0.9);
		expect(r[BLEP_SPAN * BLEP_OVERSAMPLE]).toBe(0);
		// minimum phase: the step is done after a few samples of group delay, then only ripples
		expect(Math.abs(r[5 * BLEP_OVERSAMPLE])).toBeLessThan(0.2);
		expect(Math.abs(r[16 * BLEP_OVERSAMPLE])).toBeLessThan(0.01);
	});
});

describe('saw', () => {
	it('has the saw’s harmonics, 2/(πn), band-limited far below a plain saw’s aliasing', () => {
		// pitches that do not divide the sample rate, so aliases fall between the harmonics
		for (const hz of [110, 1003, 3527]) {
			const saw = new Saw();
			const x = render(16384, () => saw.next(hz / SR));
			const levels = harmonicLevels(x, SR, hz, 5);
			levels.forEach((level, i) => expect(level).toBeCloseTo(2 / (Math.PI * (i + 1)), 2));
			const clean = inharmonicDb(x, SR, hz);
			const plain = inharmonicDb(naiveSaw(hz, 16384), SR, hz);
			expect(clean).toBeLessThan(-55);
			expect(clean).toBeLessThan(plain - 40);
		}
	});

	it('hard-syncs to a master: the pitch is the master’s, and the jumps stay band-limited', () => {
		const f0 = 220;
		const master = new Phase();
		const slave = new Saw();
		const x = render(16384, () => slave.next((2.7 * f0) / SR, master.step(f0 / SR)));
		expect(inharmonicDb(x, SR, f0)).toBeLessThan(-55);
		// the plain version: restart the phase with no correction
		const m2 = new Phase();
		let p = 0;
		const plain = render(16384, () => {
			const ago = m2.step(f0 / SR);
			p = ago === NO_WRAP ? (p + (2.7 * f0) / SR) % 1 : ((2.7 * f0) / SR) * ago;
			return 2 * p - 1;
		});
		expect(inharmonicDb(x, SR, f0)).toBeLessThan(inharmonicDb(plain, SR, f0) - 20);
	});
});

describe('shape oscillator', () => {
	const levels = (m: ShapeMix, hz: number, count: number) => {
		const osc = new ShapeOscillator();
		return harmonicLevels(
			render(16384, () => osc.next(hz / SR, m)),
			SR,
			hz,
			count
		);
	};

	it('makes a sine, a triangle, a saw and a square with their series', () => {
		const sine = levels(mix({ sine: 1 }), 440, 4);
		expect(sine[0]).toBeCloseTo(1, 2);
		expect(Math.max(...sine.slice(1))).toBeLessThan(1e-3);
		const tri = levels(mix({ triangle: 1 }), 440, 5);
		[1, 0, 1 / 9, 0, 1 / 25].forEach((k, i) =>
			expect(tri[i]).toBeCloseTo((8 / Math.PI ** 2) * k, 2)
		);
		const saw = levels(mix({ saw: 1 }), 440, 4);
		saw.forEach((level, i) => expect(level).toBeCloseTo(2 / (Math.PI * (i + 1)), 2));
		const square = levels(mix({ pulse: 1 }), 440, 5);
		[1, 0, 1 / 3, 0, 1 / 5].forEach((k, i) => expect(square[i]).toBeCloseTo((4 / Math.PI) * k, 2));
	});

	it('narrows the pulse: a 25% pulse has every fourth harmonic missing', () => {
		const pulse = levels(mix({ pulse: 1, width: 0.25 }), 440, 8);
		expect(pulse[3]).toBeLessThan(0.01);
		expect(pulse[7]).toBeLessThan(0.01);
		expect(pulse[0]).toBeCloseTo((4 / Math.PI) * Math.sin(Math.PI * 0.25), 2);
	});

	it('stays band-limited for every shape, high notes included', () => {
		for (const hz of [1003, 2489, 4001]) {
			for (const m of [mix({ saw: 1 }), mix({ pulse: 1, width: 0.3 }), mix({ pulse: 1 })]) {
				const osc = new ShapeOscillator();
				const x = render(16384, () => osc.next(hz / SR, m));
				expect(inharmonicDb(x, SR, hz)).toBeLessThan(-55);
			}
			// the triangle's corners take the cheaper two-sample correction: still well below plain
			const osc = new ShapeOscillator();
			const x = render(16384, () => osc.next(hz / SR, mix({ triangle: 1 })));
			expect(inharmonicDb(x, SR, hz)).toBeLessThan(-48);
		}
	});

	it('flips the pulse with a band-limited edge when its width moves past the phase', () => {
		const dt = 440 / SR;
		const largestStep = (x: ArrayLike<number>) => {
			let s = 0;
			for (let i = 1; i < x.length; i++) s = Math.max(s, Math.abs(x[i] - x[i - 1]));
			return s;
		};
		// the steepest its own (band-limited) edges get, over many sub-sample positions
		const plain = new ShapeOscillator();
		const natural = largestStep(render(4096, () => plain.next(dt, mix({ pulse: 1 }))));
		// high at phase 0.4 until the width drops to 0.3 (it falls), low until it rises to 0.9
		for (const [before, after, settled] of [
			[0.5, 0.3, -1],
			[0.3, 0.9, 1]
		]) {
			const osc = new ShapeOscillator();
			const m = mix({ pulse: 1, width: before });
			while (osc.phase < 0.39 || osc.phase > 0.41) osc.next(dt, m);
			const last = osc.next(dt, m);
			m.width = after;
			const x = [last, ...render(24, () => osc.next(dt, m))];
			// a plain flip would jump the whole 2 in one sample
			expect(largestStep(x)).toBeLessThanOrEqual(natural + 0.01);
			expect(x[24]).toBeCloseTo(settled, 2);
		}
	});

	it('hard-syncs a blend as cleanly as a saw', () => {
		const f0 = 180;
		const master = new Phase();
		const osc = new ShapeOscillator();
		const m = mix({ saw: 0.5, pulse: 0.5, width: 0.4 });
		const x = render(16384, () => osc.next((3.3 * f0) / SR, m, master.step(f0 / SR)));
		expect(inharmonicDb(x, SR, f0)).toBeLessThan(-50);
	});
});

describe('FM operator', () => {
	it('puts sidebands where Bessel functions say: index 1 at a 1:1 ratio', () => {
		const hz = 300;
		const mod = new Operator();
		const car = new Operator();
		// phase modulation by β·sin: sidebands at hz·(1 ± k) with Jk(β); at 1:1 they fold onto harmonics
		const beta = 1;
		const x = render(24000, () => car.next(hz / SR, (beta / (2 * Math.PI)) * mod.next(hz / SR)));
		const [h1, h2, h3] = harmonicLevels(x, SR, hz, 3);
		// J0(1) = 0.7652, J1 = 0.4401, J2 = 0.1149, J3 = 0.0196: harmonic n gathers J(n−1) + ... terms
		expect(h2).toBeCloseTo(0.4401 + 0.0196, 1);
		expect(h1).toBeGreaterThan(0.6);
		expect(h3).toBeGreaterThan(0.05);
	});
});

describe('filters', () => {
	/** The gain in dB a filter gives a sine at `hz` (settled), sent in at amplitude `level`. */
	const through = (process: (x: number) => number, hz: number, level = 1) => {
		const x = render(SR / 4, (i) => level * Math.sin((2 * Math.PI * hz * i) / SR));
		const y = x.map(process);
		return db(levelAt(y.subarray(SR / 8), SR, hz) / level);
	};

	it('state-variable: 12 dB an octave either side of the cutoff, flat in its passband', () => {
		const lp = new Svf(prewarp(1000, SR), Math.SQRT2);
		expect(through((x) => lp.process(x), 100)).toBeCloseTo(0, 0);
		lp.reset();
		expect(through((x) => lp.process(x), 1000)).toBeCloseTo(-3, 0);
		lp.reset();
		expect(through((x) => lp.process(x), 8000)).toBeLessThan(-34);
		const hp = new Svf(prewarp(1000, SR), Math.SQRT2);
		expect(
			through((x) => {
				hp.process(x);
				return hp.high;
			}, 8000)
		).toBeCloseTo(0, 0);
	});

	it('state-variable resonance peaks at the cutoff by about Q', () => {
		const k = 0.1; // Q 10
		const lp = new Svf(prewarp(1000, SR), k);
		expect(through((x) => lp.process(x), 1000)).toBeCloseTo(db(10), 0);
	});

	it('ladder: 24 dB an octave above the cutoff, and it rings on by itself at full resonance', () => {
		const ladder = new Ladder(prewarp(1000, SR), 0);
		ladder.compensation = 0;
		expect(through((x) => ladder.process(x), 100, 0.25)).toBeCloseTo(0, 0);
		ladder.reset();
		expect(through((x) => ladder.process(x), 8000, 0.25)).toBeLessThan(-60);
		// a full-scale sine passes nearly clean
		ladder.reset();
		expect(through((x) => ladder.process(x), 100)).toBeGreaterThan(-1);
		const ringing = new Ladder(prewarp(1000, SR), 1);
		const y = render(SR, (i) => ringing.process(i === 0 ? 1 : 0));
		expect(rms(y, SR / 2)).toBeGreaterThan(0.05);
		expect(Math.max(...y.map(Math.abs))).toBeLessThanOrEqual(2.5);
	});

	it('one-pole: 6 dB an octave, as the bilinear transform of its analog prototype', () => {
		const lp = new OnePole(prewarp(1000, SR));
		const ratio = Math.tan((Math.PI * 8000) / SR) / Math.tan((Math.PI * 1000) / SR);
		expect(through((x) => lp.process(x), 8000)).toBeCloseTo(db(1 / Math.hypot(1, ratio)), 1);
	});

	it('decimator: flat to 18 kHz of a 96 kHz input, and 60 dB down from 24 kHz', () => {
		// a sine at `hz` sampled at twice the rate, halved: its level out (folded, if above 24 kHz)
		const halved = (hz: number) => {
			const decimator = new Decimator();
			const at = (i: number) => Math.sin((Math.PI * hz * i) / SR);
			const y = render(SR / 4, (i) => decimator.process(at(2 * i), at(2 * i + 1)));
			return db(rms(y, 1000) * Math.SQRT2);
		};
		for (const hz of [100, 1000, 10000, 18000]) expect(halved(hz), `${hz} Hz`).toBeCloseTo(0, 1);
		expect(halved(19000)).toBeGreaterThan(-0.5);
		for (const hz of [24000, 24500, 26000, 30000, 40000, 47000]) {
			expect(halved(hz), `${hz} Hz`).toBeLessThan(-60);
		}
	});
});

describe('wavetables', () => {
	const saw = { amp: Array.from({ length: 512 }, (_, i) => 2 / (Math.PI * (i + 1))) };

	it('play a saw’s harmonics from its partials, band-limited at any pitch', () => {
		const table = WaveTable.fromPartials([saw]);
		for (const hz of [55, 1003, 4001]) {
			let p = 0;
			const x = render(16384, () => {
				p = (p + hz / SR) % 1;
				return table.read(0, p, hz / SR);
			});
			const levels = harmonicLevels(x, SR, hz, 3);
			levels.forEach((level, i) => expect(level).toBeCloseTo(2 / (Math.PI * (i + 1)), 2));
			expect(inharmonicDb(x, SR, hz)).toBeLessThan(-50);
		}
	});

	it('blend frames by position, and read drawn cycles back into partials', () => {
		const square = partialsOf(Float32Array.from({ length: 2048 }, (_, i) => (i < 1024 ? 1 : -1)));
		expect(square.amp[0]).toBeCloseTo(4 / Math.PI, 2);
		expect(square.amp[1]).toBeLessThan(1e-3);
		const table = WaveTable.fromPartials([{ amp: [1] }, square]);
		let p = 0;
		const x = render(16384, () => {
			p = (p + 441 / SR) % 1;
			return table.read(0.5, p, 441 / SR);
		});
		const [h1, , h3] = harmonicLevels(x, SR, 441, 3);
		expect(h3).toBeCloseTo((0.5 * 4) / (3 * Math.PI), 2);
		expect(h1).toBeGreaterThan(1);
	});
});

describe('noise', () => {
	it('is white, zero-mean and the same for the same seed', () => {
		const a = new Noise(7);
		const b = new Noise(7);
		const x = render(48000, () => a.next());
		expect(x.every((v, i) => v === b.next() || i < 0)).toBe(true);
		expect(Math.abs(x.reduce((s, v) => s + v, 0) / x.length)).toBeLessThan(0.02);
		expect(rms(x)).toBeCloseTo(1 / Math.sqrt(3), 1);
	});

	it('wanders smoothly within ±1', () => {
		const w = new Wander(3);
		const x = render(4800, () => w.next(1 / SR, 5));
		expect(Math.max(...x.map(Math.abs))).toBeLessThanOrEqual(1);
		let jump = 0;
		for (let i = 1; i < x.length; i++) jump = Math.max(jump, Math.abs(x[i] - x[i - 1]));
		expect(jump).toBeLessThan(0.01);
	});
});
