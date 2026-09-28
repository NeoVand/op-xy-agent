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
		expect(param.calls).toEqual([
			['set', 0, 1],
			['target', 1.6, 1, 0.1 / Math.LN2],
			['set', 0.8, 1.1],
			['target', 0.4, 1.1, 0.4 / TAUS_PER_TIME],
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
		// four time constants into the decay: 98% of the way to sustain
		expect(env.valueAt(0.5)).toBeCloseTo(0.5 + 0.5 * Math.exp(-4), 5);
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
		// already let go: a second release changes nothing
		env.release(param, 1);
		expect(param.calls).toHaveLength(6);
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
});
