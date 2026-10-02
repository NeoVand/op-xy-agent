import { describe, expect, it } from 'vitest';
import { FX_PARAMS, FX_TYPES, initialAuxiliary } from '$lib/sim/areas/auxiliary/state';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { ScreenFrame } from '$lib/sim/screen/frame';
import {
	DELAY_LOOP_PEAK,
	DELAY_NOTES,
	chorusDepth,
	chorusFeedback,
	chorusRate,
	chorusSpread,
	delayFeedback,
	delayFine,
	delaySeconds,
	delayTail,
	delayZone,
	distortionDrive,
	distortionHighCut,
	distortionLowCut,
	keptDry,
	lofiBits,
	lofiCorner,
	lofiDrift,
	lofiHold,
	lofiRate,
	phaserDepth,
	phaserFeedback,
	phaserFrequency,
	phaserRate,
	reverbSeconds,
	reverbTone
} from './fx';

const [FX1, FX2] = initialAuxiliary().fx;

/** Whether `f` rises (or falls) over 0–99 with every detent, or never turns back (`strict` off). */
function monotonic(f: (v: number) => number, direction: 1 | -1 = 1, strict = true): boolean {
	for (let v = 1; v <= 99; v++) {
		const step = (f(v) - f(v - 1)) * direction;
		if (step < 0 || (strict && step === 0)) return false;
	}
	return true;
}

describe('a new project’s effects keep the sound they were tuned to by ear', () => {
	it('repeats FX I’s delay every dotted eighth at 120 bpm, with the feedback it had', () => {
		expect(FX1.type).toBe('delay');
		const [size, fine, feedback] = FX1.params;
		expect(delaySeconds(size, fine, 120)).toBeCloseTo(0.375, 9);
		expect(delayFine(fine)).toBeCloseTo(1, 12);
		expect(delayFeedback(feedback)).toBeCloseTo(0.38, 9);
	});

	it('rings FX II’s reverb as the 2.2 s hall, through the 7 kHz lowpass, without mod', () => {
		expect(FX2.type).toBe('reverb');
		const [size, , tone] = FX2.params;
		expect(reverbSeconds(size)).toBeCloseTo(2.2, 9);
		expect(reverbTone(tone).lowpass).toBeCloseTo(7000, 6);
		expect(reverbTone(tone).highpass).toBe(10);
		expect(FX2.params[1]).toBe(0);
	});

	it('keeps every track’s own sound: both store dry at 99', () => {
		expect(keptDry(FX1.type, FX1.params)).toBe(1);
		expect(keptDry(FX2.type, FX2.params)).toBe(1);
	});
});

describe('the delay', () => {
	it('spaces its repeats by the note value the FX page names, zone for zone', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('key.auxiliary');
		sim.press('track.7');
		const sixteenths: Record<string, number> = {
			'1/32': 0.5,
			'1/32 dotted': 0.75,
			'1/16': 1,
			'1/16 dotted': 1.5,
			'1/8': 2,
			'1/8 dotted': 3,
			'1/4': 4,
			'1/2': 8
		};
		for (let v = 0; v <= 99; v += 0.25) {
			sim.state.areas.auxiliary.fx[0].params[0] = v;
			const frame = sim.frame as Extract<ScreenFrame, { page: 'aux-fx' }>;
			const name = frame.params[0].value;
			expect(DELAY_NOTES[delayZone(v)]).toBe(sixteenths[name]);
			// a sixteenth is 0.125 s at 120 bpm
			expect(delaySeconds(v, FX1.params[1], 120)).toBeCloseTo(sixteenths[name] * 0.125, 9);
		}
	});

	it('follows the tempo, and fine moves the spacing a third either way', () => {
		const [size, fine] = FX1.params;
		expect(delaySeconds(size, fine, 60)).toBeCloseTo(0.75, 9);
		expect(delaySeconds(size, 99, 120) / delaySeconds(size, fine, 120)).toBeCloseTo(4 / 3, 9);
		expect(delaySeconds(size, 0, 120) / delaySeconds(size, fine, 120)).toBeCloseTo(3 / 4, 3);
		expect(monotonic(delayFine)).toBe(true);
		// a 1/2 at the slowest tempo, fine all the way up, stays inside the delay line
		expect(delaySeconds(99, 99, 40)).toBeCloseTo(4, 9);
	});

	it('brings more repeats back as feedback rises, never running away', () => {
		expect(delayFeedback(0)).toBe(0);
		expect(monotonic(delayFeedback)).toBe(true);
		expect(delayFeedback(99)).toBeCloseTo(0.75, 9);
		// the loop's filters lift their corners, but even there each pass loses a little
		expect(delayFeedback(99) * DELAY_LOOP_PEAK).toBeLessThan(0.96);
		// no feedback: one pass (left, then right); full: long, but finite
		expect(delayTail(0.375, 0)).toBeCloseTo(0.75, 9);
		expect(delayTail(0.375, delayFeedback(50))).toBeGreaterThan(3);
		expect(delayTail(0.375, delayFeedback(99))).toBe(60);
	});
});

describe('the reverb', () => {
	it('grows from a small room to a cathedral with size', () => {
		expect(reverbSeconds(0)).toBeCloseTo(0.3, 9);
		expect(monotonic(reverbSeconds)).toBe(true);
		expect(reverbSeconds(99)).toBeGreaterThan(5);
	});

	it('darkens below the middle of tone and thins above it', () => {
		expect(reverbTone(0).lowpass).toBeCloseTo(800, 6);
		expect(monotonic((t) => reverbTone(t).lowpass, 1, false)).toBe(true);
		expect(monotonic((t) => reverbTone(t).highpass, 1, false)).toBe(true);
		expect(reverbTone(50)).toEqual({ lowpass: 20000, highpass: 10 });
		expect(reverbTone(99).highpass).toBeCloseTo(1000, 6);
		expect(reverbTone(80).highpass).toBeGreaterThan(reverbTone(60).highpass);
	});
});

describe('dry', () => {
	it('is the share of the sends the delay and the reverb keep untreated; the others keep it all', () => {
		expect(keptDry('delay', [50, 50, 50, 0])).toBe(0);
		expect(keptDry('reverb', [50, 50, 50, 49.5])).toBeCloseTo(0.5, 9);
		for (const type of FX_TYPES.filter((t) => t !== 'delay' && t !== 'reverb')) {
			expect(FX_PARAMS[type]).not.toContain('dry');
			expect(keptDry(type, [0, 0, 0, 0])).toBe(1);
		}
		expect(FX_PARAMS.delay[3]).toBe('dry');
		expect(FX_PARAMS.reverb[3]).toBe('dry');
	});
});

describe('the other four effects’ ranges', () => {
	it('chorus: rate 0.1–10 Hz, depth from nothing, feedback under 0.9, spread from mono to opposite', () => {
		expect(chorusRate(0)).toBeCloseTo(0.1, 9);
		expect(chorusRate(99)).toBeCloseTo(10, 9);
		expect(chorusRate(50)).toBeGreaterThan(0.9);
		expect(chorusRate(50)).toBeLessThan(1.1);
		expect(chorusDepth(0)).toBe(0);
		expect(chorusDepth(99)).toBeCloseTo(0.007, 9);
		expect(chorusFeedback(99)).toBeLessThan(0.9);
		expect(chorusSpread(0)).toBe(0);
		expect(chorusSpread(99)).toBeCloseTo(Math.PI, 9);
		for (const f of [chorusRate, chorusDepth, chorusFeedback, chorusSpread]) {
			expect(monotonic(f)).toBe(true);
		}
	});

	it('distortion: drive up to +36 dB; lo cut rises and hi cut falls into the drive', () => {
		expect(distortionDrive(0)).toBe(1);
		expect(20 * Math.log10(distortionDrive(99))).toBeCloseTo(36, 9);
		expect(monotonic(distortionDrive)).toBe(true);
		expect(distortionLowCut(0)).toBeCloseTo(20, 9);
		expect(monotonic(distortionLowCut)).toBe(true);
		expect(distortionHighCut(0)).toBeCloseTo(20000, 6);
		expect(monotonic(distortionHighCut, -1)).toBe(true);
	});

	it('lofi: a clock from 250 Hz up to no hold at all, 2 to 12 bits, quality closing in on it', () => {
		const sr = 48000;
		expect(lofiRate(0, sr)).toBeCloseTo(250, 9);
		expect(lofiRate(99, sr)).toBeCloseTo(sr, 6);
		expect(monotonic((v) => lofiRate(v, sr))).toBe(true);
		expect(lofiBits(0)).toBe(2);
		expect(lofiBits(99)).toBe(12);
		const clock = lofiRate(50, sr);
		expect(lofiCorner(0, clock, sr)).toBe(sr / 2);
		expect(lofiCorner(99, clock, sr)).toBeCloseTo(0.45 * clock, 6);
		expect(monotonic((q) => lofiCorner(q, clock, sr), -1)).toBe(true);
		// held in whole samples: 192 at 48 kHz from the slowest clock, none at 99
		expect(lofiHold(0, sr)).toBe(192);
		expect(lofiHold(50, sr)).toBe(Math.round(sr / clock));
		expect(lofiHold(99, sr)).toBe(1);
		expect(monotonic((v) => lofiHold(v, sr), -1, false)).toBe(true);
		// drift: the right clock up to half a hold behind, never a whole one
		expect(lofiDrift(0, 14)).toBe(0);
		expect(lofiDrift(99, 14)).toBe(7);
		expect(lofiDrift(99, 1)).toBe(0);
	});

	it('phaser: centre 60 Hz–6 kHz, up to three octaves of sweep, 0.02–8 Hz, feedback under 0.75', () => {
		expect(phaserFrequency(0)).toBeCloseTo(60, 9);
		expect(phaserFrequency(99)).toBeCloseTo(6000, 6);
		expect(phaserDepth(0)).toBe(0);
		expect(phaserDepth(99)).toBe(3600);
		expect(phaserRate(0)).toBeCloseTo(0.02, 9);
		expect(phaserRate(99)).toBeCloseTo(8, 9);
		expect(phaserFeedback(0)).toBe(0);
		expect(phaserFeedback(99)).toBeLessThan(0.75);
		for (const f of [phaserFrequency, phaserDepth, phaserRate, phaserFeedback]) {
			expect(monotonic(f)).toBe(true);
		}
	});
});
