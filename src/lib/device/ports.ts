/**
 * Port bookkeeping for the access layer: plain snapshots of Web MIDI ports, finding the OP-XY's
 * input/output pair by name, and turning browser failures into guidance a person can act on.
 *
 * Facts (docs/research/90-device-probe.md, 60-firmware.md §4.4, 80-midilab-patterns.md §3):
 * - The OP-XY shows up as one input and one output, both named `OP-XY` (macOS, OS 1.1.33). Web MIDI
 *   exposes names only (no USB VID/PID), and Windows may decorate them (`MIDIIN2 (OP-XY)`), so we
 *   match a pattern rather than an exact string.
 * - In MTP mode (com → M4) the device re-enumerates without a MIDI interface: its ports vanish.
 *   That is a disconnect, not an error.
 * - TE's updater warns that Chrome 152 on macOS broke Web MIDI (ports missing although the device
 *   is plugged in); the fix is updating the browser.
 */
import type { MidiInputLike, MidiOutputLike, MidiPortLike } from './types';

/** A plain, serialisable snapshot of a port, for the UI. */
export interface PortInfo {
	readonly id: string;
	readonly name: string;
	readonly manufacturer: string;
	readonly version: string;
	readonly type: MidiPortLike['type'];
	readonly state: MidiPortLike['state'];
	readonly connection: MidiPortLike['connection'];
}

/** Snapshot of a port. A port without a name reads `unnamed port`. */
export function portInfo(port: MidiPortLike): PortInfo {
	return {
		id: port.id,
		name: port.name ?? 'unnamed port',
		manufacturer: port.manufacturer ?? '',
		version: port.version ?? '',
		type: port.type,
		state: port.state,
		connection: port.connection
	};
}

/** Port names that belong to an OP-XY: `OP-XY`, `OP XY`, `opxy`, `MIDIIN2 (OP-XY)`, `OP–XY`… */
export const OPXY_PORT_PATTERN = /\bop[\s_\-–—]?xy\b/i;

/** True when a port name looks like the OP-XY's. */
export function isOpxyPortName(name: string | null): boolean {
	return name !== null && OPXY_PORT_PATTERN.test(name);
}

/** The OP-XY's input and output. */
export interface PortPair {
	readonly input: MidiInputLike;
	readonly output: MidiOutputLike;
}

/**
 * Finds the OP-XY among the connected ports. Disconnected ports never count (Chrome keeps them in
 * its maps with `state: 'disconnected'`). With several candidates, an input and output with the very
 * same name win; otherwise the first of each, in the browser's order.
 */
export function findOpxyPair(
	inputs: Iterable<MidiInputLike>,
	outputs: Iterable<MidiOutputLike>,
	match: (name: string | null) => boolean = isOpxyPortName
): PortPair | null {
	const ins = [...inputs].filter((p) => p.state === 'connected' && match(p.name));
	const outs = [...outputs].filter((p) => p.state === 'connected' && match(p.name));
	if (ins.length === 0 || outs.length === 0) return null;
	for (const input of ins) {
		const output = outs.find((o) => o.name === input.name);
		if (output) return { input, output };
	}
	return { input: ins[0], output: outs[0] };
}

// ─── problems and guidance ──────────────────────────────────────────────────────────────────────

/** Why Web MIDI is not (fully) available. */
export type AccessProblemCode =
	| 'unsupported-browser'
	| 'insecure-context'
	| 'permission-denied'
	| 'sysex-denied'
	| 'system-error'
	| 'not-supported'
	| 'aborted'
	| 'open-failed'
	| 'unknown';

/** A problem, phrased for the person in front of the screen. */
export interface AccessProblem {
	readonly code: AccessProblemCode;
	/** Short lowercase headline. */
	readonly title: string;
	/** What happened, in a sentence or two. */
	readonly detail: string;
	/** What to do about it. */
	readonly action: string;
	/** The browser's error name (`NotAllowedError`, …), when there was one. */
	readonly errorName: string | null;
}

const GUIDANCE: Readonly<Record<AccessProblemCode, Omit<AccessProblem, 'code' | 'errorName'>>> = {
	'unsupported-browser': {
		title: 'no web midi in this browser',
		detail: 'This browser does not implement Web MIDI (Safari on macOS and iOS never shipped it).',
		action:
			'Open the app in Chrome, Edge or Firefox on a computer. The manual and the replica still work here.'
	},
	'insecure-context': {
		title: 'web midi needs a secure page',
		detail: 'Browsers only offer Web MIDI on https:// pages and on http://localhost.',
		action: 'Open the app from its https:// address (or localhost while developing).'
	},
	'permission-denied': {
		title: 'midi access was blocked',
		detail: 'The browser (or a site setting) refused MIDI access for this page.',
		action:
			'Click the site settings icon left of the address bar, allow MIDI devices (including "control and reprogram your MIDI devices"), then connect again.'
	},
	'sysex-denied': {
		title: 'sysex was not allowed',
		detail:
			'MIDI works, but without SysEx the app cannot read the firmware version, the device info or the file list.',
		action:
			'Allow "control and reprogram your MIDI devices" in the site settings, then connect again. Notes and CCs still work.'
	},
	'system-error': {
		title: 'the system midi service failed',
		detail: 'The operating system could not open MIDI (the browser reported InvalidStateError).',
		action:
			'Quit other apps that may hold the OP-XY (DAWs, Field Kit, TE tools in another tab), unplug and replug the cable, then try again.'
	},
	'not-supported': {
		title: 'this kind of midi access is not supported',
		detail: 'The browser refused the request (for example SysEx is disabled by a policy).',
		action: 'Try another browser profile or ask your administrator about Web MIDI policies.'
	},
	aborted: {
		title: 'the request was interrupted',
		detail: 'The MIDI request was cancelled, usually because the page was navigating away.',
		action: 'Connect again.'
	},
	'open-failed': {
		title: 'the op-xy port could not be opened',
		detail: 'The device is present, but its MIDI port would not open.',
		action:
			'Another app may be using it exclusively (common on Windows). Close other MIDI apps, then connect again.'
	},
	unknown: {
		title: 'midi is not available',
		detail: 'The browser refused MIDI access for an unknown reason.',
		action: 'Reload the page and connect again; if it persists, try another browser.'
	}
};

/** The guidance for a problem code. */
export function accessProblem(
	code: AccessProblemCode,
	errorName: string | null = null
): AccessProblem {
	return { code, errorName, ...GUIDANCE[code] };
}

/** The `name` of a thrown DOMException or Error, or null for anything else. */
export function errorName(error: unknown): string | null {
	if (typeof error !== 'object' || error === null) return null;
	const name = (error as { name?: unknown }).name;
	return typeof name === 'string' ? name : null;
}

/** Maps a `requestMIDIAccess` rejection (a DOMException, per the Web MIDI spec) to guidance. */
export function problemFromError(error: unknown): AccessProblem {
	const name = errorName(error);
	switch (name) {
		case 'NotAllowedError':
		case 'SecurityError':
			return accessProblem('permission-denied', name);
		case 'InvalidStateError':
			return accessProblem('system-error', name);
		case 'NotSupportedError':
			return accessProblem('not-supported', name);
		case 'AbortError':
			return accessProblem('aborted', name);
		default:
			return accessProblem('unknown', name);
	}
}

/** True for a Chromium 152 browser on macOS, whose Web MIDI is known to be broken. */
export function isChromium152OnMac(userAgent: string): boolean {
	return /Macintosh|Mac OS X/.test(userAgent) && /\bChrome\/152\./.test(userAgent);
}

/** Shown when no OP-XY is found in Chromium 152 on macOS. */
export const CHROME_152_MAC_HINT =
	'Chrome 152 on macOS has a known Web MIDI bug: devices do not show up although they are plugged in. Update Chrome to 153 or later (or use Chrome Beta), then reload.';

/** Shown whenever MIDI is granted but no OP-XY is present. */
export const NO_DEVICE_HINT =
	'No OP-XY found. Plug it in with a USB-C data cable and switch it on. If it is in MTP mode (com → M4), leave MTP first: the MIDI ports disappear while it is on.';
