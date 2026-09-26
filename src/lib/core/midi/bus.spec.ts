import { describe, expect, it, vi } from 'vitest';
import { MidiBus, type MidiEvent, type MidiEventInit } from './bus';

const clock = (time = 0, extra: Partial<MidiEventInit> = {}): MidiEventInit => ({
	time,
	portId: 'op-xy-in',
	portName: 'OP-XY',
	direction: 'in',
	source: 'device',
	bytes: Uint8Array.of(0xf8),
	message: { type: 'clock' },
	...extra
});

describe('MidiBus', () => {
	it('numbers events per bus, starting at 1', () => {
		const a = new MidiBus();
		const b = new MidiBus();
		expect(a.emit(clock()).id).toBe(1);
		expect(a.emit(clock()).id).toBe(2);
		expect(b.emit(clock()).id).toBe(1);
	});

	it('delivers to every listener in subscription order, events in emit order', () => {
		const bus = new MidiBus();
		const seen: string[] = [];
		bus.subscribe((e) => seen.push(`first ${e.id}`));
		bus.subscribe((e) => seen.push(`second ${e.id}`));
		bus.emit(clock());
		bus.emit(clock());
		expect(seen).toEqual(['first 1', 'second 1', 'first 2', 'second 2']);
	});

	it('carries who caused a message, for the journal and undo', () => {
		const bus = new MidiBus();
		const seen: MidiEvent[] = [];
		bus.subscribe((e) => seen.push(e));
		const sent = bus.emit(
			clock(5, { direction: 'out', source: 'agent', cause: 'toolu_01', portId: 'op-xy-out' })
		);
		expect(seen).toEqual([sent]);
		expect(sent).toMatchObject({ source: 'agent', cause: 'toolu_01', direction: 'out', time: 5 });
	});

	it('isolates a throwing listener: the others still hear the event', () => {
		const errors: Array<[unknown, number]> = [];
		const bus = new MidiBus({ onListenerError: (error, event) => errors.push([error, event.id]) });
		const heard: number[] = [];
		const boom = new Error('boom');
		bus.subscribe(() => {
			throw boom;
		});
		bus.subscribe((e) => heard.push(e.id));
		bus.emit(clock());
		bus.emit(clock());
		expect(heard).toEqual([1, 2]);
		expect(errors).toEqual([
			[boom, 1],
			[boom, 2]
		]);
	});

	it('reports listener errors to the console by default', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const bus = new MidiBus();
		bus.subscribe(() => {
			throw new Error('boom');
		});
		expect(() => bus.emit(clock())).not.toThrow();
		expect(spy).toHaveBeenCalledOnce();
		spy.mockRestore();
	});

	it('unsubscribes, and treats the same function subscribed twice as one', () => {
		const bus = new MidiBus();
		const listener = vi.fn();
		const off = bus.subscribe(listener);
		bus.subscribe(listener);
		expect(bus.listenerCount).toBe(1);
		bus.emit(clock());
		off();
		bus.emit(clock());
		expect(listener).toHaveBeenCalledOnce();
		expect(bus.listenerCount).toBe(0);
	});

	it('does not call a listener removed during delivery, nor one added during it', () => {
		const bus = new MidiBus();
		const calls: string[] = [];
		const late = () => calls.push('late');
		let offSecond = () => {};
		bus.subscribe(() => {
			calls.push('first');
			offSecond();
			bus.subscribe(late);
		});
		offSecond = bus.subscribe(() => calls.push('second'));
		bus.emit(clock());
		expect(calls).toEqual(['first']);
		bus.emit(clock());
		expect(calls).toEqual(['first', 'first', 'late']);
	});
});
