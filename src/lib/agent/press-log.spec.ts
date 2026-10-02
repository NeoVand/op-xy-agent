// The user's presses on the replica, as the next message reads them: keys by their names, combos
// as the device's grammar, holds and runs of one encoder's turns as one entry.
import { describe, expect, it } from 'vitest';
import type { ReplicaEvent } from '$lib/replica';
import { PRESS_LOG_LIMIT, PressLog } from './press-log';

const press = (id: string, source = 'pointer') =>
	({ type: 'press', id, source }) as unknown as ReplicaEvent;
const release = (id: string, source = 'pointer') =>
	({ type: 'release', id, source }) as unknown as ReplicaEvent;
const turn = (id: string, delta: number) =>
	({
		type: 'turn',
		id,
		delta,
		value: 0,
		fine: false,
		source: 'pointer'
	}) as unknown as ReplicaEvent;

describe('PressLog', () => {
	it('names the keys pressed, combos as the device writes them', () => {
		const log = new PressLog();
		let t = 0;
		const tap = (id: string) => {
			log.add(press(id), (t += 100));
			log.add(release(id), (t += 100));
		};
		tap('key.arrange');
		tap('track.3');
		// shift held while M1 goes down: one combo, not shift and then M1
		log.add(press('key.shift'), (t += 100));
		tap('key.m1');
		log.add(release('key.shift'), (t += 100));
		// a step held while an encoder turns: a lock
		log.add(press('step.5'), (t += 100));
		log.add(turn('encoder.1', 3), (t += 10));
		log.add(turn('encoder.1', 2), (t += 10));
		log.add(release('step.5'), (t += 100));
		// a long press is a hold
		log.add(press('key.m1'), (t += 100));
		log.add(release('key.m1'), (t += 900));
		expect(log.list()).toEqual(['arrange', 'T3', 'shift + M1', 'step 5 + turn E1 +5', 'hold M1']);
		log.clear();
		expect(log.list()).toEqual([]);
	});

	it('keeps only the user’s own presses, the last few', () => {
		const log = new PressLog();
		log.add(press('key.play', 'demo'), 0);
		log.add(press('key.play', 'program'), 0);
		expect(log.list()).toEqual([]);
		for (let i = 0; i < PRESS_LOG_LIMIT + 3; i++) {
			log.add(press('key.play', 'keyboard'), i * 1000);
			log.add(release('key.play', 'keyboard'), i * 1000 + 50);
		}
		expect(log.list()).toHaveLength(PRESS_LOG_LIMIT);
	});
});
