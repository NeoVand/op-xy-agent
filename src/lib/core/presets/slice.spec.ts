import { describe, expect, it } from 'vitest';
import {
	buildPreset,
	equalSlices,
	findOnsets,
	sliceAudio,
	snapToZero,
	type PcmAudio
} from './index';

const SR = 44100;

/** A seeded noise source, so the loops are the same on every run. */
function noise(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 2 ** 31 - 1;
	};
}

type Hit = 'kick' | 'snare' | 'hat';

/** A drum loop with hits at known times: kick (a falling sine), snare (tone + noise), hat (noise). */
function loop(hits: readonly [number, Hit, number?][], seconds: number): PcmAudio {
	const x = new Float32Array(Math.round(seconds * SR));
	const rand = noise(7);
	for (const [time, kind, gain = 1] of hits) {
		const at = Math.round(time * SR);
		const length = Math.round((kind === 'kick' ? 0.3 : kind === 'snare' ? 0.18 : 0.05) * SR);
		let phase = 0;
		for (let i = 0; i < length && at + i < x.length; i++) {
			const t = i / SR;
			let v: number;
			if (kind === 'kick') {
				phase += (2 * Math.PI * (50 + 120 * Math.exp(-t * 40))) / SR;
				v = Math.sin(phase) * Math.exp(-t * 12);
			} else if (kind === 'snare') {
				v = (0.5 * Math.sin(2 * Math.PI * 190 * t) + 0.6 * rand()) * Math.exp(-t * 25);
			} else {
				v = 0.5 * rand() * Math.exp(-t * 90);
			}
			x[at + i] += 0.8 * gain * v;
		}
	}
	return { sampleRate: SR, channels: [x] };
}

const BEAT: [number, Hit, number?][] = [
	[0.1, 'kick'],
	[0.35, 'hat', 0.4],
	[0.6, 'snare'],
	[0.85, 'hat', 0.25],
	[1.1, 'kick'],
	[1.35, 'hat', 0.4],
	[1.6, 'snare'],
	[1.85, 'hat', 0.25]
];

describe('slicing a loop', () => {
	it('starts a slice just before every hit, and every slice starts and ends silent', () => {
		const audio = loop(BEAT, 2.2);
		const starts = findOnsets(audio);
		expect(starts).toHaveLength(BEAT.length);
		starts.forEach((start, i) => {
			const hit = Math.round(BEAT[i][0] * SR);
			// at most 5 ms early, never late: the attack stays in the slice
			expect(start).toBeLessThanOrEqual(hit);
			expect(hit - start).toBeLessThanOrEqual(0.005 * SR);
		});
		for (const slice of sliceAudio(audio, starts)) {
			expect(slice.channels[0][0]).toBe(0);
			expect(slice.channels[0].at(-1)).toBe(0);
		}
	});

	it('keeps quiet hits at high sensitivity and drops them at low', () => {
		const audio = loop(BEAT, 2.2);
		const loud = findOnsets(audio, { sensitivity: 0.05 });
		expect(loud.length).toBeLessThan(BEAT.length);
		expect(loud.length).toBeGreaterThanOrEqual(4);
		expect(findOnsets(audio, { sensitivity: 0.9 })).toHaveLength(BEAT.length);
	});

	it('keeps the strongest hits when there are more than asked for, and at most 24', () => {
		const audio = loop(BEAT, 2.2);
		const four = findOnsets(audio, { max: 4 });
		expect(four).toHaveLength(4);
		// the kicks and snares outlast the quiet hats
		const kept = four.map((s) => BEAT.findIndex(([t]) => Math.abs(t * SR - s) < 0.01 * SR));
		expect(kept.sort()).toEqual([0, 2, 4, 6]);
		const busy = loop(
			Array.from({ length: 40 }, (_, i) => [0.05 + i * 0.1, 'snare'] as [number, Hit]),
			4.2
		);
		expect(findOnsets(busy)).toHaveLength(24);
	});

	it('gives a sustained note one slice, and silence none', () => {
		const tone = Float32Array.from({ length: SR * 2 }, (_, i) => {
			const t = i / SR;
			return (
				0.5 *
				Math.min(1, t * 20) *
				Math.sin(2 * Math.PI * 440 * t + 0.3 * Math.sin(2 * Math.PI * 5 * t))
			);
		});
		expect(findOnsets({ sampleRate: SR, channels: [tone] })).toHaveLength(1);
		expect(findOnsets({ sampleRate: SR, channels: [new Float32Array(SR)] })).toEqual([]);
	});

	it('divides equally, on zero crossings, and cuts slices that fade out', () => {
		const audio = loop(BEAT, 2);
		const starts = equalSlices(audio, 8);
		expect(starts).toHaveLength(8);
		expect(starts[0]).toBe(0);
		starts
			.slice(1)
			.forEach((s, i) => expect(Math.abs(s - ((i + 1) * 2 * SR) / 8)).toBeLessThan(0.003 * SR));
		expect(equalSlices(audio, 40)).toHaveLength(24);
		const slices = sliceAudio(audio, starts);
		expect(slices.reduce((n, s) => n + s.channels[0].length, 0)).toBe(audio.channels[0].length);
		for (const s of slices) expect(s.channels[0].at(-1)).toBe(0);
		const x = Float32Array.from([0.5, 0.2, -0.1, -0.4, 0.3, 0.6]);
		expect(snapToZero(x, 5, 10)).toBe(4);
		expect(snapToZero(x, 2, 10)).toBe(2);
		expect(snapToZero(x, 5, 0)).toBe(5);
	});

	it('builds a kit whose slices sit on 53 upwards and choke each other', () => {
		const audio = loop(BEAT, 2.2);
		const slices = sliceAudio(audio, findOnsets(audio));
		const built = buildPreset(
			slices.map((s, i) => ({ name: `break-${i + 1}`, audio: s, key: 53 + i })),
			{ kind: 'drum', name: 'break', choke: true, trim: false }
		);
		expect(built.patch.regions.map((r) => [r.sample, r.hikey])).toEqual(
			slices.map((_, i) => [`break-${i + 1}.wav`, 53 + i])
		);
		for (const r of built.patch.regions) expect(r).toMatchObject({ playmode: 'group' });
	});
});
