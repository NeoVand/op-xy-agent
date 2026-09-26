import { describe, expect, it, vi } from 'vitest';
import { MidiBus } from '$lib/core/midi/bus';
import { parse } from '$lib/core/midi/messages';
import { FakeTime } from '../../../test/fakes/fake-time';
import { ClockFollower } from './clock-follower';
import { EchoRegistry } from './echo';
import { Emitter } from './emitter';
import { ExpectTimeoutError } from './errors';
import { waitForEvent } from './expect';
import { TokenBucket } from './rate';
import { RingBuffer } from './ring';

describe('EchoRegistry', () => {
	it('matches a repeat within the window once', () => {
		const echoes = new EchoRegistry(500);
		echoes.remember(Uint8Array.of(0xb0, 7, 1), 100);
		expect(echoes.match([0xb0, 7, 2], 110)).toBe(false);
		expect(echoes.match([0xb0, 7, 1], 110)).toBe(true);
		expect(echoes.match([0xb0, 7, 1], 120)).toBe(false);
	});

	it('forgets sends older than the window and ignores copies from before the send', () => {
		const echoes = new EchoRegistry(500);
		echoes.remember(Uint8Array.of(0xfa), 1000);
		expect(echoes.match([0xfa], 900)).toBe(false);
		expect(echoes.match([0xfa], 1501)).toBe(false);
		expect(echoes.size).toBe(0);
	});

	it('is bounded', () => {
		const echoes = new EchoRegistry(500, 3);
		for (let i = 0; i < 5; i++) echoes.remember(Uint8Array.of(0xb0, 7, i), 0);
		expect(echoes.size).toBe(3);
		expect(echoes.match([0xb0, 7, 0], 1)).toBe(false);
		expect(echoes.match([0xb0, 7, 4], 1)).toBe(true);
		echoes.clear();
		expect(echoes.size).toBe(0);
	});
});

describe('TokenBucket', () => {
	it('allows a burst, then paces at the sustained rate', () => {
		const bucket = new TokenBucket({ capacity: 2, perSecond: 1000, now: 0 });
		expect([bucket.reserve(0), bucket.reserve(0), bucket.reserve(0), bucket.reserve(0)]).toEqual([
			0, 0, 1, 2
		]);
		expect(bucket.available(0)).toBe(-2);
		expect(bucket.available(4)).toBe(2);
	});

	it('refunds and never exceeds capacity', () => {
		const bucket = new TokenBucket({ capacity: 1, perSecond: 10, now: 0 });
		bucket.reserve(0);
		bucket.refund();
		bucket.refund();
		expect(bucket.available(0)).toBe(1);
		expect(bucket.available(10_000)).toBe(1);
	});

	it('rejects nonsense parameters', () => {
		expect(() => new TokenBucket({ capacity: 0, perSecond: 1, now: 0 })).toThrow(RangeError);
		expect(() => new TokenBucket({ capacity: 1, perSecond: 0, now: 0 })).toThrow(RangeError);
	});
});

describe('RingBuffer', () => {
	it('overwrites the oldest item when full', () => {
		const ring = new RingBuffer<number>(3);
		for (let i = 1; i <= 5; i++) ring.push(i);
		expect(ring.size).toBe(3);
		expect(ring.toArray()).toEqual([3, 4, 5]);
		expect([...ring.newestFirst()]).toEqual([5, 4, 3]);
		expect(ring.fromNewest(0)).toBe(5);
		expect(ring.fromNewest(3)).toBeUndefined();
		expect(ring.fromNewest(-1)).toBeUndefined();
		ring.clear();
		expect(ring.toArray()).toEqual([]);
	});

	it('needs a positive integer capacity', () => {
		expect(() => new RingBuffer(0)).toThrow(RangeError);
		expect(() => new RingBuffer(1.5)).toThrow(RangeError);
	});
});

describe('ClockFollower', () => {
	const ticks = (follower: ClockFollower, bpm: number, count: number, start = 0, jitter = 0) => {
		const interval = 60_000 / (bpm * 24);
		for (let i = 0; i < count; i++) {
			follower.tick(start + i * interval + (i % 2 === 0 ? jitter : -jitter));
		}
		return start + count * interval;
	};

	it('needs a few ticks before it reports a tempo', () => {
		const follower = new ClockFollower();
		ticks(follower, 120, 12);
		expect(follower.bpm).toBeNull();
		ticks(follower, 120, 13);
		expect(follower.bpm).toBeCloseTo(120, 6);
	});

	it('is robust to jitter and bursts', () => {
		const follower = new ClockFollower();
		ticks(follower, 128, 60, 0, 3);
		expect(follower.bpm).toBeCloseTo(128, 0);
	});

	it('starts over after a gap or a timestamp going backwards', () => {
		const follower = new ClockFollower();
		const end = ticks(follower, 120, 49);
		follower.tick(end + 1000);
		expect(follower.samples).toBe(1);
		expect(follower.bpm).toBeNull();
		follower.tick(end + 500);
		expect(follower.samples).toBe(1);
		follower.reset();
		expect(follower.samples).toBe(0);
	});

	it('keeps only the window', () => {
		const follower = new ClockFollower({ window: 10, minIntervals: 5 });
		ticks(follower, 90, 50);
		expect(follower.samples).toBe(11);
		expect(follower.bpm).toBeCloseTo(90, 6);
	});
});

describe('waitForEvent', () => {
	function emit(bus: MidiBus, bytes: number[]) {
		bus.emit({
			time: 0,
			portId: 'p',
			portName: 'p',
			direction: 'in',
			source: 'device',
			bytes: Uint8Array.from(bytes),
			message: parse(bytes)
		});
	}

	it('resolves with the first match and unsubscribes', async () => {
		const time = new FakeTime();
		const bus = new MidiBus();
		const wait = waitForEvent(bus, (e) => e.message.type === 'start', {
			timeoutMs: 100,
			timers: time
		});
		emit(bus, [0xf8]);
		emit(bus, [0xfa]);
		expect((await wait).message.type).toBe('start');
		expect(bus.listenerCount).toBe(0);
		expect(time.pendingTimers).toBe(0);
	});

	it('times out with a clear message, and treats a throwing test as no match', async () => {
		const time = new FakeTime();
		const bus = new MidiBus();
		const wait = waitForEvent(
			bus,
			() => {
				throw new Error('bad predicate');
			},
			{ timeoutMs: 100, timers: time, description: 'play press' }
		);
		const settled = wait.catch((error: unknown) => error);
		emit(bus, [0xfa]);
		await time.advance(100);
		const error = await settled;
		expect(error).toBeInstanceOf(ExpectTimeoutError);
		expect((error as Error).message).toBe('no play press within 100 ms');
		expect(bus.listenerCount).toBe(0);
	});

	it('can be aborted', async () => {
		const time = new FakeTime();
		const bus = new MidiBus();
		const abort = new AbortController();
		const wait = waitForEvent(bus, () => true, {
			timeoutMs: 100,
			timers: time,
			signal: abort.signal
		});
		abort.abort(new Error('cancelled'));
		await expect(wait).rejects.toThrow('cancelled');
		expect(bus.listenerCount).toBe(0);
		const already = waitForEvent(bus, () => true, {
			timeoutMs: 100,
			timers: time,
			signal: abort.signal
		});
		await expect(already).rejects.toThrow('cancelled');
	});
});

describe('Emitter', () => {
	it('delivers in order, isolates throwing listeners and supports removal during delivery', () => {
		const onError = vi.fn();
		const emitter = new Emitter<[number]>(onError);
		const seen: string[] = [];
		const offB = emitter.on((n) => {
			seen.push(`a${n}`);
			offB();
		});
		emitter.on(() => {
			throw new Error('boom');
		});
		emitter.on((n) => seen.push(`c${n}`));
		emitter.emit(1);
		emitter.emit(2);
		expect(seen).toEqual(['a1', 'c1', 'c2']);
		expect(onError).toHaveBeenCalledTimes(2);
		expect(emitter.size).toBe(2);
	});
});
