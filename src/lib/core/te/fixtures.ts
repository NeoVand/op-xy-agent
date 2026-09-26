// Test fixtures: real OP-XY traffic (OS 1.1.33, 2026-09-26) copied from the git-ignored
// research/device/captures/te-sysex-*.json transcripts of research/device/te_sysex_probe.py, and
// logged in docs/research/90-device-probe.md. None of these frames carries a serial number; the only
// GREET reply here is synthetic, with fake serials. Not exported from index.ts.

/** Parses space-separated hex (`"F0 00 20 76"`) into bytes. */
export function hex(text: string): Uint8Array {
	const tokens = text.trim().split(/\s+/).filter(Boolean);
	return Uint8Array.from(tokens.map((token) => Number.parseInt(token, 16)));
}

/** Encodes ASCII text as bytes (test helper). */
export function ascii(text: string): Uint8Array {
	return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

/** Universal identity reply of the owner's OP-XY. */
export const OPXY_IDENTITY_REPLY = hex('F0 7E 21 06 02 00 20 76 21 00 01 00 00 00 00 00 F7');

/** FILE LIST page 0 of node 0 as quoted in the M1 task (rid 2306): `drum` (1) and `synth` (2). */
export const LIST_ROOT_REPLY = hex(
	'F0 00 20 76 21 40 32 02 05 00 00 00 00 00 01 0E 00 00 00 00 00 64 72 75 6D 00 00 00 02 0E 00 00 00 00 00 73 79 6E 74 68 00 F7'
);

/** One direction of a captured exchange. */
export interface CaptureFrame {
	readonly dir: 'out' | 'in';
	readonly bytes: Uint8Array;
}

/** A captured session: the probe's first request id and every frame in order. */
export interface Capture {
	readonly firstRequestId: number;
	readonly frames: readonly CaptureFrame[];
}

function capture(firstRequestId: number, lines: readonly string[]): Capture {
	return {
		firstRequestId,
		frames: lines.map((line) => {
			const [dir, bytes] = line.split(':');
			return { dir: dir === 'out' ? 'out' : 'in', bytes: hex(bytes) };
		})
	};
}

/** ECHO `DE AD BE EF 00 7F 80 FF 01` round trip (rid 1290). */
export const CAPTURE_ECHO = capture(1290, [
	'out: F0 00 20 76 21 40 6A 0A 02 4F 5E 2D 3E 6F 00 7F 00 01 7F 01 F7',
	'in: F0 00 20 76 21 40 2A 0A 02 00 4F 5E 2D 3E 6F 00 7F 00 01 7F 01 F7'
]);

/** SETTINGS INIT `[01 03 E8]` → status 2 "command not found" (rid 2336). */
export const CAPTURE_SETTINGS = capture(2336, [
	'out: F0 00 20 76 21 40 72 20 06 04 01 03 68 F7',
	'in: F0 00 20 76 21 40 32 20 06 02 F7'
]);

/** FILE INIT (flags 0, 4 MiB) → LIST page 0 of the root → LIST page 1 (empty), from rid 1515. */
export const CAPTURE_FILES = capture(1515, [
	'out: F0 00 20 76 21 40 6B 6B 05 00 01 00 00 40 00 00 F7',
	'in: F0 00 20 76 21 40 2B 6B 05 00 00 0C 00 02 00 00 F7',
	'out: F0 00 20 76 21 40 6B 6C 05 00 04 00 00 00 00 F7',
	'in: F0 00 20 76 21 40 2B 6C 05 00 00 00 00 00 01 0E 00 00 00 00 00 64 72 75 6D 00 00 00 02 0E 00 00 00 00 00 73 79 6E 74 68 00 F7',
	'out: F0 00 20 76 21 40 6B 6D 05 00 04 00 01 00 00 F7',
	'in: F0 00 20 76 21 40 2B 6D 05 00 00 00 01 F7'
]);

/** FILE LIST page 0 of nodes 1 (`drum`) and 2 (`synth`): both empty (rids 1850, 1851). */
export const CAPTURE_EMPTY_DIRS = capture(1850, [
	'out: F0 00 20 76 21 40 6E 3A 05 00 04 00 00 00 01 F7',
	'in: F0 00 20 76 21 40 2E 3A 05 00 00 00 00 F7',
	'out: F0 00 20 76 21 40 6E 3B 05 00 04 00 00 00 02 F7',
	'in: F0 00 20 76 21 40 2E 3B 05 00 00 00 00 F7'
]);

/**
 * FILE INIT, then FILE INFO and FILE METADATA GET (EP-133 layout) on node 0, both answered with
 * status 3 "bad request" (discovery R1/R2, from rid 2150).
 */
export const CAPTURE_DISCOVER = capture(2150, [
	'out: F0 00 20 76 21 40 70 66 05 00 01 00 00 40 00 00 F7',
	'in: F0 00 20 76 21 40 30 66 05 00 00 0C 00 02 00 00 F7',
	'out: F0 00 20 76 21 40 70 67 05 00 0B 00 00 F7',
	'in: F0 00 20 76 21 40 30 67 05 03 F7',
	'out: F0 00 20 76 21 40 70 68 05 00 07 02 00 00 00 00 F7',
	'in: F0 00 20 76 21 40 30 68 05 03 F7'
]);

/** Synthetic GREET text in the OP-XY's key order, with FAKE serials. */
export const SYNTHETIC_GREET_TEXT =
	'product:OP-XY;mode:normal;serial:TESTSERIAL;dsp_serial:TESTDSPSERIAL;os_version:1.1.33;sw_version:1.1.33;hw_rev:2;sku:TE033AS001';
