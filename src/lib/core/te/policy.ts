// THE outgoing deny-list for TE SysEx. device/transport runs every outgoing MIDI message through
// assertSendable before MIDIOutput.send, and TeClient checks its own frames too. It is default-deny:
// a message that contains TE SysEx (manufacturer 00 20 76) passes only if it is exactly one
// well-formed, documented request. DFU (0x03), PRODUCT_SPECIFIC (0x7F), undocumented commands and
// sub-commands, and SETTINGS SET are always refused; FILE writes need an explicit approval.
// Rules: docs/research/60-firmware.md §8.

import { hex2, isByte } from './bytes';
import { isCanonicalPacked7, unpack7 } from './codec';
import {
	SYSEX_END,
	SYSEX_START,
	TE_CMD,
	TE_DFU,
	TE_FILE,
	TE_FILE_GET_TYPE,
	TE_FILE_INIT_FLAG_SUBSCRIBE,
	TE_FILE_METADATA,
	TE_FILE_METADATA_PAGED_TYPE,
	TE_FILE_PLAYBACK,
	TE_FILE_PUT_TYPE,
	TE_FLAG_HAS_REQUEST_ID,
	TE_FLAG_IS_REQUEST,
	TE_MANUFACTURER_ID,
	TE_PROTOCOL_MARKER,
	TE_SETTINGS
} from './constants';
import { TePolicyError } from './errors';

/** `read` is harmless, `write` changes device state (needs approval), `forbidden` is never sent. */
export type TeSafety = 'read' | 'write' | 'forbidden';

/** Verdict for a message that contains (or may contain) TE SysEx. */
export interface TeOutgoingClass {
	readonly kind: 'te';
	/** Byte 4 (device id), when present. */
	readonly deviceId: number | null;
	/** Byte 8 (command), when present. */
	readonly cmd: number | null;
	/** First unpacked payload byte (the sub-command) for FILE, SETTINGS and DFU, when present. */
	readonly sub: number | null;
	/** What the message is, e.g. "FILE LIST", "DFU ENTER", "TE SysEx fragment". */
	readonly name: string;
	readonly safety: TeSafety;
	/** Why it got this class; shown to the user when a message is blocked. */
	readonly reason: string;
}

/** Verdict for a message without TE SysEx (notes, CCs, clock, universal or other SysEx…). */
export interface OtherOutgoingClass {
	readonly kind: 'other';
}

/** Result of {@link classifyOutgoing}. */
export type OutgoingClass = TeOutgoingClass | OtherOutgoingClass;

/** Options for {@link assertSendable}. */
export interface SendPolicyOptions {
	/** True only for an owner-approved state-changing operation (FILE PUT/DELETE/…); never for DFU. */
	readonly allowWrites: boolean;
}

interface Parts {
	readonly deviceId: number | null;
	readonly cmd: number | null;
	readonly sub: number | null;
}

const NO_PARTS: Parts = { deviceId: null, cmd: null, sub: null };
const OTHER: OtherOutgoingClass = { kind: 'other' };

function verdict(parts: Parts, name: string, safety: TeSafety, reason: string): TeOutgoingClass {
	return {
		kind: 'te',
		deviceId: parts.deviceId,
		cmd: parts.cmd,
		sub: parts.sub,
		name,
		safety,
		reason
	};
}

function forbid(parts: Parts, name: string, reason: string): TeOutgoingClass {
	return verdict(parts, name, 'forbidden', reason);
}

/**
 * Classifies an outgoing MIDI message (one `MIDIOutput.send` payload, which may hold several
 * messages). Never throws. Checks, in order:
 *
 * - every value must be a byte: Web MIDI would wrap 0x103 into 0x03, so anything else is forbidden;
 * - every SysEx inside is reassembled without interleaved real-time bytes (F8–FF);
 * - a SysEx with TE's manufacturer id, a SysEx without F7 that could still become one, or a stray
 *   F7 (a continuation we cannot see the start of) counts as TE;
 * - more than one TE frame per message is forbidden (one request in flight);
 * - the TE frame must be a canonical, documented request; anything else is forbidden.
 */
export function classifyOutgoing(bytes: ArrayLike<number>): OutgoingClass {
	for (let i = 0; i < bytes.length; i++) {
		if (!isByte(bytes[i])) {
			return forbid(
				NO_PARTS,
				'invalid MIDI data',
				`value at index ${i} is not a byte (0–255 integer); Web MIDI would wrap it into one`
			);
		}
	}
	const found: TeOutgoingClass[] = [];
	let i = 0;
	while (i < bytes.length) {
		const b = bytes[i];
		if (b === SYSEX_END) {
			found.push(
				forbid(NO_PARTS, 'SysEx fragment', 'F7 without F0: a SysEx continuation cannot be checked')
			);
			i++;
			continue;
		}
		if (b !== SYSEX_START) {
			i++;
			continue;
		}
		const body: number[] = [SYSEX_START];
		let terminated = false;
		for (i++; i < bytes.length; i++) {
			const c = bytes[i];
			if (c >= 0xf8) continue; // real-time bytes may be interleaved; they are not part of the SysEx
			if (c === SYSEX_END) {
				body.push(c);
				i++;
				terminated = true;
				break;
			}
			if (c >= 0x80) break; // a new status byte ends the SysEx without F7
			body.push(c);
		}
		if (!mayBeTe(body, terminated)) continue;
		found.push(
			terminated
				? classifyTeMessage(Uint8Array.from(body))
				: forbid(
						fragmentParts(body),
						'TE SysEx fragment',
						'SysEx without F7: a continuation could turn it into any command'
					)
		);
	}
	if (found.length === 0) return OTHER;
	if (found.length === 1) return found[0];
	const refused = found.filter((c) => c.safety === 'forbidden');
	if (refused.length > 0) return refused.find((c) => c.cmd === TE_CMD.DFU) ?? refused[0];
	const first = found[0];
	return forbid(
		{ deviceId: first.deviceId, cmd: first.cmd, sub: first.sub },
		first.name,
		`${found.length} TE frames in one message; send one request at a time`
	);
}

/**
 * Throws a {@link TePolicyError} unless `bytes` may be sent: `forbidden` always throws, `write`
 * throws unless `options.allowWrites` is exactly `true`. Returns the classification otherwise.
 */
export function assertSendable(
	bytes: ArrayLike<number>,
	options: SendPolicyOptions
): OutgoingClass {
	const result = classifyOutgoing(bytes);
	if (result.kind === 'te') {
		if (result.safety === 'forbidden') throw new TePolicyError('forbidden', result);
		if (result.safety === 'write' && options.allowWrites !== true) {
			throw new TePolicyError('write-not-allowed', result);
		}
	}
	return result;
}

/** True when a reassembled SysEx starts with TE's manufacturer id, or is unterminated and still could. */
function mayBeTe(body: readonly number[], terminated: boolean): boolean {
	for (let k = 0; k < TE_MANUFACTURER_ID.length; k++) {
		const value = body[1 + k];
		if (value === undefined) return !terminated;
		if (value !== TE_MANUFACTURER_ID[k]) return false; // includes F7 before the full id
	}
	return true;
}

function fragmentParts(body: readonly number[]): Parts {
	return { deviceId: body[4] ?? null, cmd: body[8] ?? null, sub: null };
}

const DFU_NAMES: Readonly<Record<number, string>> = Object.fromEntries(
	Object.entries(TE_DFU).map(([name, value]) => [value, name])
);

/** Classifies one complete SysEx (`F0 00 20 76 … F7`, 7-bit inside, real-time bytes removed). */
function classifyTeMessage(m: Uint8Array): TeOutgoingClass {
	const last = m.length - 1; // index of F7
	const deviceId = last > 4 ? m[4] : null;
	const cmd = last > 8 ? m[8] : null;
	const parts: Parts = { deviceId, cmd, sub: null };
	if (cmd === TE_CMD.DFU) {
		// Refused in any form, whatever the marker, flags or payload look like.
		const sub = last > 10 ? unpack7(m.subarray(9, last))[0] : null;
		const label = sub === null ? 'DFU' : `DFU ${DFU_NAMES[sub] ?? `0x${hex2(sub)}`}`;
		return forbid({ ...parts, sub }, label, 'firmware update / reboot into TE Boot is never sent');
	}
	if (last <= 5) return forbid(parts, 'TE SysEx', 'truncated TE frame (no marker byte)');
	if (m[5] !== TE_PROTOCOL_MARKER) {
		return forbid(
			parts,
			'TE SysEx',
			`byte 5 is 0x${hex2(m[5])}; only TE protocol requests (0x40) may be sent`
		);
	}
	if (cmd === null) return forbid(parts, 'TE frame', 'truncated TE frame (no command byte)');
	const requestBits = TE_FLAG_IS_REQUEST | TE_FLAG_HAS_REQUEST_ID;
	if ((m[6] & requestBits) !== requestBits) {
		return forbid(
			parts,
			commandLabel(cmd),
			'not a request with a request id (byte 6 needs 0x40 and 0x20)'
		);
	}
	const packed = m.subarray(9, last);
	if (!isCanonicalPacked7(packed)) {
		return forbid(parts, commandLabel(cmd), 'payload is not canonical packed-7');
	}
	return classifyCommand(deviceId, cmd, unpack7(packed));
}

function commandLabel(cmd: number): string {
	const known = Object.entries(TE_CMD).find(([, value]) => value === cmd);
	return known ? known[0] : `TE command 0x${hex2(cmd)}`;
}

function classifyCommand(deviceId: number | null, cmd: number, p: Uint8Array): TeOutgoingClass {
	const parts: Parts = { deviceId, cmd, sub: null };
	switch (cmd) {
		case TE_CMD.GREET:
			return p.length === 0
				? verdict(parts, 'GREET', 'read', 'reads device metadata')
				: forbid(parts, 'GREET', 'GREET is only documented without a payload');
		case TE_CMD.ECHO:
			return verdict(parts, 'ECHO', 'read', 'link test: the device returns the payload');
		case TE_CMD.FILE:
			return classifyFile({ deviceId, cmd, sub: p.length > 0 ? p[0] : null }, p);
		case TE_CMD.SETTINGS:
			return classifySettings({ deviceId, cmd, sub: p.length > 0 ? p[0] : null }, p);
		case TE_CMD.PRODUCT_SPECIFIC:
			return forbid(parts, 'PRODUCT_SPECIFIC', 'command 0x7F is undocumented and never sent');
		default:
			return forbid(parts, commandLabel(cmd), 'undocumented TE command');
	}
}

function classifyFile(parts: Parts, p: Uint8Array): TeOutgoingClass {
	const read = (name: string, reason: string) => verdict(parts, name, 'read', reason);
	const write = (name: string, reason: string) => verdict(parts, name, 'write', reason);
	const bad = (name: string) => forbid(parts, name, `${name} payload has an undocumented layout`);
	switch (parts.sub) {
		case TE_FILE.INIT:
			if (p.length !== 6) return bad('FILE INIT');
			if (p[1] !== 0 && p[1] !== TE_FILE_INIT_FLAG_SUBSCRIBE) {
				return forbid(parts, 'FILE INIT', `undocumented FILE INIT flags 0x${hex2(p[1])}`);
			}
			return read('FILE INIT', 'opens a FILE session');
		case TE_FILE.LIST:
			return p.length === 5 ? read('FILE LIST', 'lists a directory') : bad('FILE LIST');
		case TE_FILE.INFO:
			return p.length === 3 ? read('FILE INFO', 'reads node info') : bad('FILE INFO');
		case TE_FILE.GET:
			if (p[1] === TE_FILE_GET_TYPE.INIT && p.length === 8) {
				return read('FILE GET (open)', 'opens a file for reading');
			}
			if (p[1] === TE_FILE_GET_TYPE.DATA && p.length === 4) {
				return read('FILE GET (page)', 'reads one page of a file');
			}
			return bad('FILE GET');
		case TE_FILE.METADATA:
			return classifyFileMetadata(parts, p);
		case TE_FILE.PUT:
			if (p[1] === TE_FILE_PUT_TYPE.INIT && p.length >= 12 && p.indexOf(0, 11) !== -1) {
				return write('FILE PUT (open)', 'creates or overwrites a file on the device');
			}
			if (p[1] === TE_FILE_PUT_TYPE.DATA && p.length >= 4) {
				return write('FILE PUT (data)', 'writes file data to the device');
			}
			return bad('FILE PUT');
		case TE_FILE.DELETE:
			return p.length === 3
				? write('FILE DELETE', 'deletes a file on the device')
				: bad('FILE DELETE');
		case TE_FILE.MOVE:
			return p.length === 7 ? write('FILE MOVE', 'moves a file on the device') : bad('FILE MOVE');
		case TE_FILE.PLAYBACK:
			return p.length === 12 && (p[1] === TE_FILE_PLAYBACK.START || p[1] === TE_FILE_PLAYBACK.STOP)
				? write('FILE PLAYBACK', 'starts or stops audio playback on the device')
				: bad('FILE PLAYBACK');
		case null:
			return forbid(parts, 'FILE', 'FILE command without a sub-command');
		default:
			return forbid(parts, `FILE 0x${hex2(parts.sub)}`, 'undocumented FILE sub-command');
	}
}

function classifyFileMetadata(parts: Parts, p: Uint8Array): TeOutgoingClass {
	const op = p[1];
	if (op === TE_FILE_METADATA.GET) {
		// [07 02 id id page page] or the same plus a NUL-terminated key.
		const plain = p.length === 6;
		const keyed = p.length >= 8 && p.indexOf(0, 6) === p.length - 1;
		return plain || keyed
			? verdict(parts, 'FILE METADATA GET', 'read', 'reads node metadata')
			: forbid(parts, 'FILE METADATA GET', 'FILE METADATA GET payload has an undocumented layout');
	}
	if (op === TE_FILE_METADATA.SET) {
		return p.length >= 5 && p[p.length - 1] === 0
			? verdict(parts, 'FILE METADATA SET', 'write', 'changes node metadata on the device')
			: forbid(parts, 'FILE METADATA SET', 'FILE METADATA SET payload has an undocumented layout');
	}
	if (op === TE_FILE_METADATA.SET_PAGED) {
		const init = p[2] === TE_FILE_METADATA_PAGED_TYPE.INIT && p.length === 9;
		const data = p[2] === TE_FILE_METADATA_PAGED_TYPE.DATA && p.length >= 5;
		return init || data
			? verdict(parts, 'FILE METADATA SET (paged)', 'write', 'changes node metadata on the device')
			: forbid(
					parts,
					'FILE METADATA SET (paged)',
					'FILE METADATA SET (paged) payload has an undocumented layout'
				);
	}
	return forbid(
		parts,
		'FILE METADATA',
		op === undefined ? 'FILE METADATA without an operation' : `undocumented operation 0x${hex2(op)}`
	);
}

function classifySettings(parts: Parts, p: Uint8Array): TeOutgoingClass {
	switch (parts.sub) {
		case TE_SETTINGS.INIT:
			return p.length === 3
				? verdict(parts, 'SETTINGS INIT', 'read', 'asks whether settings are supported')
				: forbid(parts, 'SETTINGS INIT', 'SETTINGS INIT payload has an undocumented layout');
		case TE_SETTINGS.GET_ALL:
			return p.length === 3
				? verdict(parts, 'SETTINGS GET_ALL', 'read', 'reads all settings')
				: forbid(parts, 'SETTINGS GET_ALL', 'SETTINGS GET_ALL payload has an undocumented layout');
		case TE_SETTINGS.SET:
			return forbid(parts, 'SETTINGS SET', 'changes device settings; this app never sends it');
		case null:
			return forbid(parts, 'SETTINGS', 'SETTINGS command without a sub-command');
		default:
			return forbid(parts, `SETTINGS 0x${hex2(parts.sub)}`, 'undocumented SETTINGS sub-command');
	}
}
