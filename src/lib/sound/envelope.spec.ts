import { describe, expect, it } from 'vitest';
import { Envelope, TAIL_TAUS, TAUS_PER_TIME, type ParamLike } from './envelope';

type Call = [string, ...number[]];

/** The attack's RC charge (toward twice the peak) at `t` of an attack `attack` long, 0–1 of the peak. */
const charge = (t: number, attack: number) => 2 * (1 - Math.exp((-t * Math.LN2) / attack));

/** Records automation calls, like an AudioParam would receive them. */
function recorder(withHold = true): ParamLike & { calls: Call[] } {
	const calls: Call[] = [];
	const param: ParamLike & { calls: Call[] } = {
		calls,
		setValueAtTime: (v, t) => calls.push(['set', v, t]),
		linearRampToValueAtTime: (v, t) => calls.push(['linear', v, t]),
		exponentialRampToValueAtTime: (v, t) => calls.push(['exponential', v, t]),
		setTargetAtTime: (v, t, c) => calls.push(['target', v, t, c]),
		cancelScheduledValues: (t) => calls.push(['cancel', t])
	};
	if (withHold) param.cancelAndHoldAtTime = (t) => calls.push(['hold', t]);
	return param;
}

const shape = { attack: 0.1, decay: 0.4, sustain: 0.5, release: 0.2 };

describe('envelopes', () => {
	it('schedules attack, decay to sustain and the release of a note whose length is known', () => {
		const env = new Envelope(1, shape, { base: 0, peak: 0.8, curve: 'linear' });
		const param = recorder();
		env.schedule(param, 2);
		// the attack charges toward twice the peak (research 60 §3) and is pinned at the peak
		// then falls toward silence and is held where it meets the sustain, ln 2 time constants on
		const meets = 1.1 + (0.4 / TAUS_PER_TIME) * Math.LN2;
		expect(param.calls).toEqual([
			['set', 0, 1],
			['target', 1.6, 1, 0.1 / Math.LN2],
			['set', 0.8, 1.1],
			['target', 0, 1.1, 0.4 / TAUS_PER_TIME],
			['set', 0.4, meets],
			['target', 0, 2, 0.2 / TAUS_PER_TIME]
		]);
		expect(env.end).toBeCloseTo(2 + (TAIL_TAUS * 0.2) / TAUS_PER_TIME);
	});

	it('knows its level at any time: up the attack, down to sustain, away after the gate', () => {
		const env = new Envelope(0, shape, { base: 0, peak: 1, curve: 'linear' });
		env.schedule(recorder(), 3);
		expect(env.valueAt(-1)).toBe(0);
		expect(env.valueAt(0.05)).toBeCloseTo(charge(0.05, 0.1));
		expect(env.valueAt(0.1)).toBeCloseTo(1);
		// the decay heads for silence: half a time constant in, e^-0.5 of the peak
		expect(env.valueAt(0.15)).toBeCloseTo(Math.exp(-0.5), 5);
		// and stops dead at the sustain, not easing into it
		expect(env.valueAt(0.1 + 0.1 * Math.LN2 + 1e-4)).toBeCloseTo(0.5, 5);
		expect(env.valueAt(0.5)).toBe(0.5);
		expect(env.valueAt(3)).toBeCloseTo(0.5, 3);
		expect(env.valueAt(3.2)).toBeCloseTo(0.5 * Math.exp(-4), 3);
	});

	it('cuts the attack short when the note ends during it', () => {
		const env = new Envelope(0, shape, { base: 0, peak: 1, curve: 'linear' });
		const param = recorder();
		env.schedule(param, 0.05);
		expect(param.calls).toEqual([
			['set', 0, 0],
			['target', 2, 0, 0.1 / Math.LN2],
			['set', charge(0.05, 0.1), 0.05],
			['target', 0, 0.05, 0.05]
		]);
	});

	it('sweeps a filter in ratios: exponential attack between resting and peak cutoff', () => {
		const env = new Envelope(0, shape, { base: 200, peak: 3200, curve: 'exponential' });
		const param = recorder();
		env.schedule(param);
		expect(param.calls[1]).toEqual(['exponential', 3200, 0.1]);
		expect(env.valueAt(0.05)).toBeCloseTo(800);
		expect(env.sustainLevel).toBeCloseTo(800);
		expect(() => new Envelope(0, shape, { base: 0, peak: 1, curve: 'exponential' })).toThrow();
	});

	it('releases a held note from where it is, holding the curve where the browser can', () => {
		const env = new Envelope(0, shape, { base: 0, peak: 1, curve: 'linear' });
		const param = recorder();
		env.schedule(param);
		env.release(param, 0.05);
		expect(param.calls.slice(-2)).toEqual([
			['hold', 0.05],
			['target', 0, 0.05, 0.05]
		]);
		expect(env.gate).toBe(0.05);
		// already let go: a second release changes nothing (the curve took 5 calls, the release 2)
		env.release(param, 1);
		expect(param.calls).toHaveLength(7);
	});

	it('falls back to the computed level without cancelAndHoldAtTime', () => {
		const env = new Envelope(0, shape, { base: 0, peak: 1, curve: 'linear' });
		const param = recorder(false);
		env.schedule(param);
		env.release(param, 0.05, 0.004);
		expect(param.calls.slice(-3)).toEqual([
			['cancel', 0.05],
			['set', charge(0.05, 0.1), 0.05],
			['target', 0, 0.05, 0.001]
		]);
	});

	it('moves a scheduled release later for a legato note', () => {
		const env = new Envelope(0, shape, { base: 0, peak: 1, curve: 'linear' });
		const param = recorder();
		env.schedule(param, 1);
		env.extend(param, 2);
		expect(param.calls.slice(-2)).toEqual([
			['cancel', 1],
			['target', 0, 2, 0.05]
		]);
		expect(env.gate).toBe(2);
		expect(env.valueAt(1.5)).toBeCloseTo(0.5, 3);
	});

	it('holds the sustain again when a legato note carries the voice past where the decay meets it', () => {
		const env = new Envelope(0, shape, { base: 0, peak: 1, curve: 'linear' });
		const param = recorder();
		// let go before the decay meets the sustain (0.1 + 0.069 s): the hold was never scheduled
		env.schedule(param, 0.15);
		expect(param.calls.filter(([kind, v]) => kind === 'set' && v === 0.5)).toHaveLength(0);
		env.extend(param, 1);
		expect(param.calls.slice(-3)).toEqual([
			['cancel', 0.15],
			['set', 0.5, 0.1 + 0.1 * Math.LN2],
			['target', 0, 1, 0.05]
		]);
	});

	it('goes straight to a sustain at the top, and never stops a decay to 0', () => {
		const full = new Envelope(0, { ...shape, sustain: 1 }, { base: 0, peak: 1, curve: 'linear' });
		const a = recorder();
		full.schedule(a, 1);
		expect(a.calls[3]).toEqual(['set', 1, 0.1]);
		const none = new Envelope(0, { ...shape, sustain: 0 }, { base: 0, peak: 1, curve: 'linear' });
		const b = recorder();
		none.schedule(b, 1);
		expect(b.calls[3]).toEqual(['target', 0, 0.1, 0.1]);
		expect(b.calls[4]).toEqual(['target', 0, 1, 0.05]);
	});
});
