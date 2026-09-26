// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/router.svelte.ts

/**
 * Pure message routing: filter by kind and channel, remap the channel, transpose, scale velocity,
 * split by key range. Only the transform is here. The stateful router (ports, persistence, loop
 * refusal) was part of MIDI Lab's patchbay and is not needed yet; a future "keyboard → OP-XY thru"
 * would wrap this function.
 *
 * Because `transform` is stateless, changing a route while notes are held can strand a Note Off
 * (the Note On went out transposed, the Note Off does not). Whoever holds route state must release
 * held notes when the route changes.
 */

import type { MidiMessage } from './messages';
import { assertChannel, assertIntInRange, MidiRangeError } from './validate';

/** Which kinds of message a route lets through. */
export interface MessageFilters {
	notes: boolean;
	cc: boolean;
	pitchBend: boolean;
	aftertouch: boolean;
	program: boolean;
	/** Clock, Start, Stop, Continue, Song Position and MTC quarter frames. */
	clock: boolean;
	sysex: boolean;
	/** Song Select, Tune Request, Active Sensing and System Reset. */
	system: boolean;
}

/**
 * Performance messages pass; timing, SysEx and system messages do not. Forwarding clock or SysEx is
 * a deliberate choice (two clock masters, or SysEx reaching a device it was not meant for), and
 * System Reset should never ride along by accident. (MIDI Lab called this `ALL_PASS`.)
 */
export const DEFAULT_FILTERS: Readonly<MessageFilters> = {
	notes: true,
	cc: true,
	pitchBend: true,
	aftertouch: true,
	program: true,
	clock: false,
	sysex: false,
	system: false
};

/** What a route does to the messages it passes. */
export interface RouteTransform {
	/** Wire channels 0–15 to accept; empty accepts every channel. */
	channels: readonly number[];
	/** Force everything onto this wire channel; null leaves channels alone. */
	remapTo: number | null;
	/** Semitones added to every note (integer). */
	transpose: number;
	/**
	 * Multiplier for Note On velocity, ≥ 0. Results saturate at 1–127, so an on never turns into an
	 * off.
	 */
	velocityScale: number;
	/** Only notes in this inclusive range pass (before transposition), for keyboard splits. */
	noteRange: readonly [number, number];
	pass: MessageFilters;
}

/** A transform that changes nothing and passes what `DEFAULT_FILTERS` passes. */
export const IDENTITY_TRANSFORM: Readonly<RouteTransform> = {
	channels: [],
	remapTo: null,
	transpose: 0,
	velocityScale: 1,
	noteRange: [0, 127],
	pass: DEFAULT_FILTERS
};

/** Does this kind of message get through these filters? `unknown` never does. */
export function passes(msg: MidiMessage, filters: MessageFilters): boolean {
	switch (msg.type) {
		case 'noteOn':
		case 'noteOff':
			return filters.notes;
		case 'controlChange':
			return filters.cc;
		case 'pitchBend':
			return filters.pitchBend;
		case 'channelAftertouch':
		case 'polyAftertouch':
			return filters.aftertouch;
		case 'programChange':
			return filters.program;
		case 'clock':
		case 'start':
		case 'stop':
		case 'continue':
		case 'songPosition':
		case 'mtcQuarterFrame':
			return filters.clock;
		case 'sysex':
			return filters.sysex;
		case 'songSelect':
		case 'tuneRequest':
		case 'activeSensing':
		case 'reset':
			return filters.system;
		case 'unknown':
			return false;
	}
}

/** Throws `MidiRangeError` unless every field of a route transform is in range. */
export function assertValidTransform(route: RouteTransform): void {
	route.channels.forEach((channel, i) => assertChannel(channel, `channels[${i}]`));
	if (route.remapTo !== null) assertChannel(route.remapTo, 'remapTo');
	assertIntInRange(route.transpose, -127, 127, 'transpose');
	if (!(Number.isFinite(route.velocityScale) && route.velocityScale >= 0)) {
		throw new MidiRangeError('velocityScale', route.velocityScale, 'a finite number ≥ 0');
	}
	const [low, high] = route.noteRange;
	assertIntInRange(low, 0, 127, 'noteRange[0]');
	assertIntInRange(high, low, 127, 'noteRange[1]');
}

/**
 * Apply a route to one message. Returns the transformed message, or null when it is filtered out,
 * outside the key range, or transposed beyond 0–127 (dropped rather than clamped into a wrong
 * note). Throws `MidiRangeError` for an invalid route.
 */
export function transform(msg: MidiMessage, route: RouteTransform): MidiMessage | null {
	assertValidTransform(route);
	if (!passes(msg, route.pass)) return null;
	if (!('channel' in msg)) return msg;
	if (route.channels.length && !route.channels.includes(msg.channel)) return null;
	const channel = route.remapTo ?? msg.channel;

	if (msg.type === 'noteOn' || msg.type === 'noteOff' || msg.type === 'polyAftertouch') {
		if (msg.note < route.noteRange[0] || msg.note > route.noteRange[1]) return null;
		const note = msg.note + route.transpose;
		if (note < 0 || note > 127) return null;
		if (msg.type !== 'noteOn') return { ...msg, channel, note };
		const velocity = Math.max(1, Math.min(127, Math.round(msg.velocity * route.velocityScale)));
		return { ...msg, channel, note, velocity };
	}
	return { ...msg, channel };
}
