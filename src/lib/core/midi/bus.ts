// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/bus.ts

/**
 * One event bus for every MIDI message that enters or leaves the app.
 *
 * The monitor, the replica's live mirror, the agent's "wait for the user" checks and the undo
 * journal are all subscribers. Nothing gets a private side channel: if a message happened, it
 * appeared here first. Each event says who caused it (`source`, plus an optional `cause` such as an
 * agent tool-call ID) so the journal can attribute and undo it.
 *
 * The bus is plain and injectable. There is no module-level instance and no clock: the device layer
 * creates one, stamps `time` from its own clock, and passes the bus to whoever needs it. IDs are
 * per instance, so two buses (or two tests) never share a counter.
 */

import type { MidiMessage } from './messages';

/** Whether a message arrived from a port or was sent to one. */
export type Direction = 'in' | 'out';

/** Who caused a message: the hardware, the user, the replica UI, the agent, or the app itself. */
export type MidiEventSource = 'device' | 'user' | 'replica' | 'agent' | 'system';

/** One message on the bus. */
export interface MidiEvent {
	/** Unique within this bus, increasing from 1. */
	id: number;
	/** Milliseconds in the `performance.now()` domain, the clock Web MIDI timestamps use. */
	time: number;
	portId: string;
	portName: string;
	direction: Direction;
	source: MidiEventSource;
	/** What made it happen, e.g. an agent tool-call ID, for the journal and undo. */
	cause?: string;
	bytes: Uint8Array;
	message: MidiMessage;
}

/** Everything but the ID, which the bus assigns. */
export type MidiEventInit = Omit<MidiEvent, 'id'>;

/** A subscriber. */
export type MidiListener = (event: MidiEvent) => void;

/** Options for `MidiBus`. */
export interface MidiBusOptions {
	/**
	 * Told when a listener throws. The stream carries on regardless; by default the error goes to
	 * `console.error` so a broken subscriber is visible without being fatal.
	 */
	onListenerError?: (error: unknown, event: MidiEvent) => void;
}

/** A synchronous publish/subscribe bus for MIDI events. */
export class MidiBus {
	#listeners = new Set<MidiListener>();
	#nextId = 1;
	#onListenerError: (error: unknown, event: MidiEvent) => void;

	constructor(options: MidiBusOptions = {}) {
		this.#onListenerError =
			options.onListenerError ??
			((error) => console.error('[midi bus] a listener threw; the stream continues', error));
	}

	/**
	 * Add a listener; returns the function that removes it. The same function subscribed twice is one
	 * subscription.
	 */
	subscribe(listener: MidiListener): () => void {
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	/**
	 * Deliver an event to every listener, in subscription order, and return it with its ID. A
	 * listener added during delivery first hears the next event; one removed during delivery is not
	 * called if it has not been already. A listener that throws is reported and skipped; it never
	 * stops the stream.
	 */
	emit(init: MidiEventInit): MidiEvent {
		const event: MidiEvent = { ...init, id: this.#nextId++ };
		for (const listener of [...this.#listeners]) {
			if (!this.#listeners.has(listener)) continue;
			try {
				listener(event);
			} catch (error) {
				this.#onListenerError(error, event);
			}
		}
		return event;
	}

	/** How many listeners are subscribed. */
	get listenerCount(): number {
		return this.#listeners.size;
	}
}
