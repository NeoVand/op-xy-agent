import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyParseError } from '$lib/core/opxy';
import { DEFAULT_TIMING } from './animation';
import { ReplicaError, ReplicaState, type ReplicaEvent } from './state.svelte';

const T = DEFAULT_TIMING;

function recorder(state: ReplicaState) {
	const events: string[] = [];
	const log = (e: ReplicaEvent) =>
		events.push(
			`${e.type} ${e.id}` +
				(e.type === 'turn' ? ` ${e.delta}` : '') +
				(e.type === 'bend' ? ` ${e.value}` : '') +
				` ${e.source}`
		);
	for (const type of ['press', 'release', 'turn', 'click', 'bend'] as const) state.on(type, log);
	return events;
}

describe('ReplicaState input', () => {
	it('presses and releases keys, emitting once per change', () => {
		const state = new ReplicaState();
		const events = recorder(state);
		state.press('key.shift', 'pointer');
		state.press('key.shift', 'pointer');
		expect(state.isPressed('key.shift')).toBe(true);
		expect(state.shift).toBe(true);
		state.press('key.m1', 'keyboard');
		expect(state.pressed).toEqual(['key.shift', 'key.m1']);
		state.release('key.m1', 'keyboard');
		state.release('key.shift', 'pointer');
		state.release('key.shift', 'pointer');
		expect(state.shift).toBe(false);
		expect(events).toEqual([
			'press key.shift pointer',
			'press key.m1 keyboard',
			'release key.m1 keyboard',
			'release key.shift pointer'
		]);
	});

	it('wires constructor callbacks and lets listeners unsubscribe', () => {
		const onPress = vi.fn();
		const onTurn = vi.fn();
		const state = new ReplicaState({ onPress, onTurn });
		const extra = vi.fn();
		const off = state.on('press', extra);
		state.press('track.3', 'pointer');
		off();
		state.press('track.4', 'pointer');
		state.turn('encoder.2', 1, { source: 'pointer' });
		expect(onPress).toHaveBeenCalledTimes(2);
		expect(onPress.mock.calls[0][0]).toEqual({ type: 'press', id: 'track.3', source: 'pointer' });
		expect(extra).toHaveBeenCalledTimes(1);
		expect(onTurn.mock.calls[0][0]).toMatchObject({
			id: 'encoder.2',
			delta: 1,
			value: 1,
			fine: false
		});
	});

	it('does not emit for mirrored device input or demos', () => {
		const state = new ReplicaState();
		const events = recorder(state);
		state.press('key.play', 'device');
		state.release('key.play', 'device');
		state.turn('encoder.1', -2, { source: 'demo' });
		expect(events).toEqual([]);
		expect(state.turns('encoder.1')).toBe(-2);
	});

	it('latches a key down until toggled again', () => {
		const state = new ReplicaState();
		expect(state.toggleLatch('key.shift', 'pointer')).toBe(true);
		expect(state.isLatched('key.shift')).toBe(true);
		expect(state.isPressed('key.shift')).toBe(true);
		expect(state.toggleLatch('key.shift', 'pointer')).toBe(false);
		expect(state.isPressed('key.shift')).toBe(false);
		state.toggleLatch('key.bar');
		state.press('step.4');
		state.releaseAll();
		expect(state.pressed).toEqual([]);
		expect(state.isLatched('key.bar')).toBe(false);
	});

	it('turns encoders in whole detents and reports fine turns with the click held', () => {
		const state = new ReplicaState({ detentsPerTurn: 24 });
		const turns = vi.fn();
		state.on('turn', turns);
		state.turn('encoder.4', 3);
		expect(state.turns('encoder.4')).toBe(3);
		expect(state.angle('encoder.4')).toBe(45);
		state.press('encoder.4');
		state.turn('encoder.4', -1);
		expect(turns.mock.calls[1][0]).toMatchObject({ delta: -1, value: 2, fine: true });
		expect(() => state.turn('encoder.4', 0.5)).toThrow(ReplicaError);
		expect(() => state.turn('key.m1' as never, 1)).toThrow(ReplicaError);
		expect(() => new ReplicaState({ detentsPerTurn: 0 })).toThrow(ReplicaError);
	});

	it('clicks encoders, moves the volume and the pitch bend within range', () => {
		const state = new ReplicaState();
		const events = recorder(state);
		state.click('encoder.1', 'pointer');
		state.setVolume(1, 'pointer');
		state.setBend(-0.5, 'pointer');
		state.setBend(-0.5, 'pointer');
		expect(state.volume).toBe(1);
		expect(state.bend).toBe(-0.5);
		expect(events).toEqual([
			'click encoder.1 pointer',
			'turn knob.volume ' + String(1 - new ReplicaState().volume) + ' pointer',
			'bend strip.pitchbend -0.5 pointer'
		]);
		expect(() => state.setVolume(1.2)).toThrow(ReplicaError);
		expect(() => state.setBend(Number.NaN)).toThrow(ReplicaError);
		expect(() => state.setMeter(-0.1)).toThrow(ReplicaError);
	});

	it('rejects controls that cannot be pressed', () => {
		const state = new ReplicaState();
		expect(() => state.press('knob.volume' as never)).toThrow(ReplicaError);
		expect(() => state.press('nope' as never)).toThrow(/unknown control/);
	});
});

describe('ReplicaState.subscribe', () => {
	it('hears every outbound event, in order, next to per-name listeners', () => {
		const state = new ReplicaState();
		const all: string[] = [];
		const presses = vi.fn();
		state.on('press', presses);
		state.subscribe((e) => all.push(`${e.type} ${e.id} ${e.source}`));
		state.press('keyboard.c4', 'pointer');
		state.release('keyboard.c4', 'pointer');
		state.turn('encoder.3', -1, { source: 'keyboard' });
		state.click('encoder.3', 'keyboard');
		state.setBend(0.25, 'pointer');
		state.setVolume(0.5, 'program');
		expect(all).toEqual([
			'press keyboard.c4 pointer',
			'release keyboard.c4 pointer',
			'turn encoder.3 keyboard',
			'click encoder.3 keyboard',
			'bend strip.pitchbend pointer',
			'turn knob.volume program'
		]);
		expect(presses).toHaveBeenCalledTimes(1);
	});

	it('lets several consumers subscribe and each unsubscribe on its own', () => {
		const state = new ReplicaState();
		const bridge = vi.fn();
		const agent = vi.fn();
		const stopBridge = state.subscribe(bridge);
		state.subscribe(agent);
		state.press('key.play', 'pointer');
		stopBridge();
		stopBridge();
		state.release('key.play', 'pointer');
		expect(bridge).toHaveBeenCalledTimes(1);
		expect(agent).toHaveBeenCalledTimes(2);
		expect(agent.mock.calls[1][0]).toEqual({ type: 'release', id: 'key.play', source: 'pointer' });
	});

	it('stays silent for mirroring and teaching, like on()', () => {
		vi.useFakeTimers();
		try {
			const state = new ReplicaState();
			const heard = vi.fn();
			state.subscribe(heard);
			state.press('keyboard.e4', 'device');
			state.release('keyboard.e4', 'device');
			state.animate('shift + M1');
			vi.runAllTimers();
			expect(heard).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it('keeps delivering when a subscriber throws, and reports the error asynchronously', () => {
		const reported: (() => void)[] = [];
		const spy = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
			reported.push(callback);
		});
		try {
			const state = new ReplicaState();
			const after = vi.fn();
			state.subscribe(() => {
				throw new Error('boom');
			});
			state.subscribe(after);
			state.press('track.2', 'pointer');
			expect(after).toHaveBeenCalledTimes(1);
			expect(state.isPressed('track.2')).toBe(true);
			expect(reported).toHaveLength(1);
			expect(() => reported[0]()).toThrow('boom');
		} finally {
			spy.mockRestore();
		}
	});
});

describe('ReplicaState output', () => {
	it('sets LEDs per key, with blinking, and clears them', () => {
		const state = new ReplicaState();
		state.setLed('track.1', 'white');
		state.setLed('step.9', 'red', { blink: true });
		state.setLeds({ 'keyboard.c4': 'dim', 'step.1': 'white' });
		expect(state.led('track.1')).toBe('white');
		expect(state.led('step.9')).toBe('red');
		expect(state.isBlinking('step.9')).toBe(true);
		expect(state.led('keyboard.c4')).toBe('dim');
		expect(state.led('track.2')).toBe('off');
		state.setLed('step.9', 'off');
		expect(state.isBlinking('step.9')).toBe(false);
		state.clearLeds();
		expect(state.led('track.1')).toBe('off');
		expect(() => state.setLed('key.m1', 'white')).toThrow(/no LED window/);
		expect(() => state.setLed('track.1', 'blue' as never)).toThrow(/unknown LED state/);
	});

	it('shows screen text and the level meter', () => {
		const state = new ReplicaState({ screen: 'tempo\n120.0' });
		expect(state.screen.lines).toEqual(['tempo', '120.0']);
		state.setScreen(['project', 'untitled 1']);
		expect(state.screen.lines).toEqual(['project', 'untitled 1']);
		state.setMeter(0.5);
		expect(state.meter).toBe(0.5);
	});
});

describe('ReplicaState.animate', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('plays "shift + M1": shift down, M1 tapped, both up, highlights cleared', async () => {
		const state = new ReplicaState();
		const events = recorder(state);
		const { done, plan } = state.animate('shift + M1');
		expect(state.animating).toBe(true);

		vi.advanceTimersByTime(0);
		expect(state.isPressed('key.shift')).toBe(true);
		expect(state.highlight('key.shift')).toBe('hold');
		expect(state.isPressed('key.m1')).toBe(false);

		vi.advanceTimersByTime(T.staggerMs);
		expect(state.isPressed('key.m1')).toBe(true);
		expect(state.highlight('key.m1')).toBe('press');

		vi.advanceTimersByTime(T.pressMs);
		expect(state.isPressed('key.m1')).toBe(false);
		expect(state.isPressed('key.shift')).toBe(true);

		vi.advanceTimersByTime(T.releaseMs);
		expect(state.isPressed('key.shift')).toBe(false);
		expect(state.highlight('key.m1')).toBe('press');

		vi.advanceTimersByTime(plan.duration);
		await expect(done).resolves.toBe('finished');
		expect(state.highlight('key.m1')).toBeUndefined();
		expect(state.animating).toBe(false);
		// Teaching never talks to the device.
		expect(events).toEqual([]);
	});

	it('shows encoder turns and a turn hint', async () => {
		const state = new ReplicaState();
		const { done } = state.animate('step 5 + turn E2', { turnSteps: 3 });
		vi.advanceTimersByTime(T.staggerMs);
		expect(state.turnHint('encoder.2')).toBe(1);
		vi.advanceTimersByTime(3 * T.turnStepMs);
		expect(state.turns('encoder.2')).toBe(3);
		expect(state.isPressed('step.5')).toBe(true);
		await vi.runAllTimersAsync();
		await expect(done).resolves.toBe('finished');
		expect(state.turnHint('encoder.2')).toBeUndefined();
		expect(state.isPressed('step.5')).toBe(false);
	});

	it('cancels cleanly: keys come back up, the next animation replaces the last', async () => {
		const state = new ReplicaState();
		const first = state.animate('shift + hold M1');
		vi.advanceTimersByTime(T.staggerMs + 10);
		expect(state.pressed).toEqual(['key.shift', 'key.m1']);
		const second = state.animate('play');
		await expect(first.done).resolves.toBe('cancelled');
		expect(state.pressed).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(state.isPressed('key.play')).toBe(true);
		second.cancel();
		await expect(second.done).resolves.toBe('cancelled');
		expect(state.isPressed('key.play')).toBe(false);
		expect(state.animating).toBe(false);
	});

	it('leaves keys the user holds alone', () => {
		const state = new ReplicaState();
		state.press('key.shift', 'pointer');
		state.animate('shift + M2');
		vi.runAllTimers();
		expect(state.isPressed('key.shift')).toBe(true);
	});

	it('bends the pitch pad and turns the volume in demos without emitting', async () => {
		const state = new ReplicaState();
		const events = recorder(state);
		const before = state.volume;
		state.animate('pitchbend → turn volume', { turnSteps: 2 });
		vi.advanceTimersByTime(1);
		expect(state.bend).toBeGreaterThan(0);
		await vi.runAllTimersAsync();
		expect(state.bend).toBe(0);
		expect(state.volume).toBeCloseTo(before + 0.12, 5);
		expect(events).toEqual([]);
	});

	it('throws KeyParseError for a bad combo and keeps the running animation', () => {
		const state = new ReplicaState();
		state.animate('play');
		expect(() => state.animate('shift + nonsense')).toThrow(KeyParseError);
		expect(state.animating).toBe(true);
	});

	it('uses injected timers', () => {
		const queue: { fn: () => void; ms: number }[] = [];
		const state = new ReplicaState({
			timers: {
				setTimeout: (fn, ms) => queue.push({ fn, ms }),
				clearTimeout: () => {}
			}
		});
		const { plan } = state.animate('M3');
		expect(queue.map((q) => q.ms)).toEqual(plan.steps.map((s) => s.at));
		queue[0].fn();
		queue[1].fn();
		expect(state.isPressed('key.m3')).toBe(true);
	});
});
