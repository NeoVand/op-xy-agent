import { describe, expect, it } from 'vitest';
import type { StepKeyId } from '$lib/core/opxy';
import { ReplicaState } from '$lib/replica';
import { FakeTime } from '../../../test/fakes/fake-time';
import { sweepSteps } from './intro';

const lit = (replica: ReplicaState) =>
	Array.from({ length: 16 }, (_, i) => `step.${i + 1}` as StepKeyId).filter(
		(id) => replica.led(id) !== 'off'
	);

describe('sweepSteps', () => {
	it('sweeps one lit step across the row once, then leaves it dark', async () => {
		const time = new FakeTime();
		const replica = new ReplicaState({ timers: time });
		sweepSteps(replica, time, { delayMs: 500, stepMs: 55 });
		await time.advance(499);
		expect(lit(replica)).toEqual([]);
		await time.advance(1);
		expect(lit(replica)).toEqual(['step.1']);
		await time.advance(55);
		expect(lit(replica)).toEqual(['step.2']);
		await time.advance(55 * 14);
		expect(lit(replica)).toEqual(['step.16']);
		await time.advance(55);
		expect(lit(replica)).toEqual([]);
		expect(time.pendingTimers).toBe(0);
	});

	it('puts LEDs that were lit back, and stops early when cancelled', async () => {
		const time = new FakeTime();
		const replica = new ReplicaState({ timers: time });
		replica.setLed('step.2', 'red');
		const cancel = sweepSteps(replica, time, { delayMs: 0, stepMs: 10 });
		await time.advance(10);
		expect(replica.led('step.2')).toBe('white');
		await time.advance(10);
		expect(replica.led('step.2')).toBe('red');
		expect(replica.led('step.3')).toBe('white');
		cancel();
		expect(lit(replica)).toEqual(['step.2']);
		expect(time.pendingTimers).toBe(0);
	});
});
