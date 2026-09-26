/**
 * Words for MIDI traffic in OP-XY terms: CC names from the CC map ("tempo", "T3 filter cutoff"),
 * TE SysEx frames by command ("TE FILE LIST request"), and a byte display that never shows the
 * unit's serial numbers (GREET replies carry `serial` and `dsp_serial`; they are hidden, not just
 * trimmed).
 */
import {
	describe,
	hexBytes,
	shortLabel,
	type DescribeProfile,
	type MidiMessage
} from '$lib/core/midi/messages';
import { describeCc, type CcTarget } from '$lib/core/opxy';
import {
	decodeStatus,
	parseFrame,
	parseGreetMetadata,
	redactGreetInfo,
	TE_CMD,
	TE_FILE
} from '$lib/core/te';

const targetCache = new Map<number, readonly CcTarget[]>();

/** What a controller means on a wire channel (global and track targets), memoised. */
export function ccTargets(controller: number, channel: number): readonly CcTarget[] {
	const key = controller * 16 + channel;
	let targets = targetCache.get(key);
	if (targets === undefined) {
		targets = describeCc(controller, channel);
		targetCache.set(key, targets);
	}
	return targets;
}

/**
 * The OP-XY's names for core/midi's `describe` / `shortLabel`: global CCs by name (`tempo`,
 * `track select`), per-track CCs with their track (`T3 filter cutoff`, `T1 mute`).
 */
export const OPXY_DESCRIBE_PROFILE: DescribeProfile = {
	ccName(controller, channel) {
		const targets = ccTargets(controller, channel);
		const global = targets.find((t) => t.scope === 'global');
		if (global) return global.name;
		const local = targets.find((t) => t.scope === 'track');
		return local ? `T${local.track} ${local.name.replace(/^track /, '')}` : undefined;
	}
};

const COMMAND_NAMES: Readonly<Record<number, string>> = Object.fromEntries(
	Object.entries(TE_CMD).map(([name, value]) => [value, name])
);
const FILE_NAMES: Readonly<Record<number, string>> = Object.fromEntries(
	Object.entries(TE_FILE).map(([name, value]) => [value, name])
);

function commandName(cmd: number, payload?: Uint8Array): string {
	const name = COMMAND_NAMES[cmd] ?? `command 0x${cmd.toString(16).toUpperCase().padStart(2, '0')}`;
	if (cmd === TE_CMD.FILE && payload && payload.length > 0) {
		return `FILE ${FILE_NAMES[payload[0]] ?? `0x${payload[0].toString(16).toUpperCase()}`}`;
	}
	return name;
}

/** A label for a TE SysEx frame, or null when the bytes are not TE protocol traffic. */
export function teFrameLabel(bytes: ArrayLike<number>): string | null {
	const frame = parseFrame(bytes);
	switch (frame.kind) {
		case 'not-te':
			return null;
		case 'malformed':
			return `TE frame (malformed: ${frame.reason})`;
		case 'debug':
			return 'TE debug log (all TE traffic stops)';
		case 'request':
			return `TE ${commandName(frame.cmd, frame.payload)} request`;
		case 'response':
			return `TE ${commandName(frame.cmd)} reply · ${decodeStatus(frame.status).label}`;
		case 'event':
			return `TE ${commandName(frame.cmd)} event`;
	}
}

/** True for a GREET reply, whose payload carries the unit's serial numbers. */
export function isGreetReply(bytes: ArrayLike<number>): boolean {
	const frame = parseFrame(bytes);
	return frame.kind === 'response' && frame.cmd === TE_CMD.GREET;
}

/** Header bytes of a TE response shown before the hidden GREET payload. */
const GREET_VISIBLE_BYTES = 10;

/**
 * Bytes as hex for display. Long messages are shortened; a GREET reply shows its header only,
 * because the payload spells out the serial numbers.
 */
export function displayHex(bytes: Uint8Array, maxBytes = 32): string {
	if (isGreetReply(bytes)) {
		const hidden = bytes.length - GREET_VISIBLE_BYTES;
		return `${hexBytes(bytes.subarray(0, GREET_VISIBLE_BYTES))} … (${hidden} bytes hidden: device metadata with serial numbers)`;
	}
	return bytes.length > maxBytes
		? `${hexBytes(bytes.subarray(0, maxBytes))} … (+${bytes.length - maxBytes} bytes)`
		: hexBytes(bytes);
}

/** GREET metadata as `key: value` text with serials redacted, or null for other messages. */
export function redactedGreetText(bytes: ArrayLike<number>): string | null {
	const frame = parseFrame(bytes);
	if (frame.kind !== 'response' || frame.cmd !== TE_CMD.GREET) return null;
	const info = redactGreetInfo(parseGreetMetadata(new TextDecoder().decode(frame.data)));
	return Object.entries(info)
		.map(([key, value]) => `${key}: ${value ?? ''}`)
		.join('; ');
}

/** A one-line label for a message: TE frames by command, everything else via `shortLabel`. */
export function labelFor(message: MidiMessage, bytes: Uint8Array): string {
	return teFrameLabel(bytes) ?? shortLabel(message, { profile: OPXY_DESCRIBE_PROFILE });
}

/** A full sentence for a message, with GREET metadata redacted. */
export function detailFor(message: MidiMessage, bytes: Uint8Array): string {
	const greet = redactedGreetText(bytes);
	if (greet !== null) return `GREET reply (serial numbers redacted): ${greet}`;
	const te = teFrameLabel(bytes);
	const sentence = describe(message, { profile: OPXY_DESCRIBE_PROFILE });
	return te ? `${te}. ${sentence}` : sentence;
}
