import { describe, expect, it } from 'vitest';
import { fft } from '../dsp/fft';
import {
	KIT_STYLES,
	VOICE_TYPES,
	buildPreset,
	generateKit,
	renderVoice,
	type PcmAudio
} from './index';

const SR = 44100;

/** The spectral centroid (Hz) of the first 4096 samples. */
function centroid(audio: PcmAudio): number {
	const n = 4096;
	const re = new Float64Array(n);
	const im = new Float64Array(n);
	const x = audio.channels[0];
	for (let i = 0; i < n && i < x.length; i++)
		re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
	fft(re, im);
	let weighted = 0;
	let total = 0;
	for (let k = 1; k < n / 2; k++) {
		const m = Math.hypot(re[k], im[k]);
		weighted += m * ((k * SR) / n);
		total += m;
	}
	return weighted / total;
}

const rms = (x: Float32Array, from: number, to: number) => {
	let sum = 0;
	for (let i = from; i < to; i++) sum += x[i] * x[i];
	return Math.sqrt(sum / Math.max(1, to - from));
};

describe('generated drum sounds', () => {
	it('renders every voice type at its level, ringing as long as asked and ending in silence', () => {
		// the crackle is a bed, not a hit: its own test below
		for (const type of VOICE_TYPES.filter((t) => t !== 'crackle')) {
			const audio = renderVoice({ type, decay: 0.3 });
			const x = audio.channels[0];
			expect(audio.sampleRate).toBe(SR);
			expect(x.length).toBe(Math.ceil(0.31 * SR));
			const peak = x.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
			expect(peak).toBeCloseTo(0.9, 5);
			expect(x.every(Number.isFinite)).toBe(true);
			expect(Math.abs(x.at(-1)!)).toBe(0);
			// the tail has died away by well over 30 dB
			expect(rms(x, x.length - 1000, x.length)).toBeLessThan(rms(x, 0, 2000) / 30);
		}
	});

	it('renders a crackle as an even bed of pops, well below the hits, denser with tone', () => {
		const pops = (tone: number) => {
			const x = renderVoice({ type: 'crackle', tone, decay: 2 }).channels[0];
			let count = 0;
			for (let i = 1; i < x.length; i++)
				if (Math.abs(x[i]) > 0.1 && Math.abs(x[i - 1]) <= 0.1) count++;
			return { x, count };
		};
		const { x, count } = pops(0.5);
		expect(x.reduce((m, s) => Math.max(m, Math.abs(s)), 0)).toBeCloseTo(0.35, 5);
		// as dense at the end as at the start: no decay
		const half = Math.floor(x.length / 2);
		expect(rms(x, half, x.length - 2000)).toBeGreaterThan(rms(x, 0, half) / 3);
		expect(pops(0.95).count).toBeGreaterThan(count);
	});

	it('is deterministic, and a seed gives another take', () => {
		expect(renderVoice({ type: 'snare' }).channels[0]).toEqual(
			renderVoice({ type: 'snare' }).channels[0]
		);
		expect(renderVoice({ type: 'snare', seed: 2 }).channels[0]).not.toEqual(
			renderVoice({ type: 'snare' }).channels[0]
		);
	});

	it('tunes a kick to its pitch once the sweep has fallen', () => {
		for (const pitch of [45, 60, 80]) {
			const x = renderVoice({ type: 'kick', pitch, decay: 1 }).channels[0];
			// zero crossings between 0.2 s and 0.6 s
			let crossings = 0;
			for (let i = 0.2 * SR; i < 0.6 * SR; i++) if (x[i - 1] < 0 !== x[i] < 0) crossings++;
			expect(crossings / 2 / 0.4).toBeCloseTo(pitch, -0.5);
		}
	});

	it('keeps kicks low and hats high', () => {
		expect(centroid(renderVoice({ type: 'kick' }))).toBeLessThan(400);
		expect(centroid(renderVoice({ type: 'closed hat' }))).toBeGreaterThan(5000);
		expect(centroid(renderVoice({ type: 'snare', tone: 1 }))).toBeGreaterThan(
			centroid(renderVoice({ type: 'snare', tone: 0 }))
		);
	});

	it('crushes to fewer levels and keeps agent values in range', () => {
		const levels = (x: Float32Array) => new Set(Array.from(x, (s) => s.toFixed(5))).size;
		const clean = renderVoice({ type: 'kick' }).channels[0];
		const crushed = renderVoice({ type: 'kick', crush: 1 }).channels[0];
		expect(levels(crushed)).toBeLessThan(levels(clean) / 10);
		const wild = renderVoice({ type: 'tom', pitch: 1e6, decay: 1e3, tone: 7, level: 3 });
		expect(wild.channels[0].length).toBe(Math.ceil(4.01 * SR));
		expect(wild.channels[0].reduce((m, s) => Math.max(m, Math.abs(s)), 0)).toBeCloseTo(1, 5);
	});
});

describe('generated kits', () => {
	it('puts a sound on each of the 24 keys in TE’s order, and builds a preset of it', () => {
		for (const style of KIT_STYLES) {
			const kit = generateKit(style);
			expect(kit.map((s) => s.key)).toEqual(Array.from({ length: 24 }, (_, i) => 53 + i));
			expect(kit[0].name).toBe(`${style} kick`);
			expect(kit[10].name).toBe(`${style} open hat`);
			const built = buildPreset(kit, { kind: 'drum', name: `${style} kit` });
			expect(built.warnings).toEqual([]);
			expect(built.patch.regions.map((r) => r.hikey)).toEqual(kit.map((s) => s.key));
		}
	});

	it('dials each style in: a long 808 kick, a short tight one, a crushed lo-fi kit', () => {
		const kick = (style: (typeof KIT_STYLES)[number]) =>
			generateKit(style)[0].audio.channels[0].length;
		expect(kick('808')).toBeGreaterThan(2 * kick('tight'));
		expect(kick('boom')).toBeGreaterThan(kick('808'));
		const levels = (x: Float32Array) => new Set(Array.from(x, (s) => s.toFixed(5))).size;
		expect(levels(generateKit('lo-fi')[2].audio.channels[0])).toBeLessThan(
			levels(generateKit('808')[2].audio.channels[0]) / 4
		);
	});
});
