// Device identity for TE hardware: the universal identity reply (SysEx device id + SKU) and the
// GREET metadata string. Facts: docs/research/60-firmware.md §4.1, docs/research/90-device-probe.md.

import { isByte } from './bytes';
import { SYSEX_END, SYSEX_START, TE_MANUFACTURER_ID } from './constants';

/** Universal identity request (`F0 7E 7F 06 01 F7`, "all devices"). Read-only; TE's updater sends it first. */
export const TE_IDENTITY_REQUEST: readonly number[] = [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7];

/**
 * True for a universal identity request to any device id (`F0 7E <dev> 06 01 F7`). The OP-XY echoes
 * foreign SysEx such as this back to the host, so the input side needs to recognise it.
 */
export function isIdentityRequest(bytes: ArrayLike<number>): boolean {
	return (
		bytes.length === 6 &&
		bytes[0] === SYSEX_START &&
		bytes[1] === 0x7e &&
		isByte(bytes[2]) &&
		bytes[2] <= 0x7f &&
		bytes[3] === 0x06 &&
		bytes[4] === 0x01 &&
		bytes[5] === SYSEX_END
	);
}

/** What a TE device's universal identity reply tells us. */
export interface TeIdentity {
	/** SysEx device id (reply byte 2); goes into byte 4 of every TE frame (0x21 on the OP-XY). */
	readonly deviceId: number;
	/** 14-bit family code, LSB first in the reply (33 on the OP-XY). */
	readonly familyCode: number;
	/** 14-bit family member, LSB first in the reply (1 on the OP-XY). */
	readonly member: number;
	/** TE SKU, e.g. `TE033AS001`. */
	readonly sku: string;
	/** The four software revision bytes; all zero on OP-XY OS 1.1.33 (use GREET `os_version`). */
	readonly softwareRevision: readonly [number, number, number, number];
}

/** TE's SKU format: `"TE" + pad3(family) + "AS" + pad3(member)`. */
export function formatTeSku(familyCode: number, member: number): string {
	const pad3 = (value: number) => String(value).padStart(3, '0');
	return `TE${pad3(familyCode)}AS${pad3(member)}`;
}

/**
 * Decodes a 17-byte universal identity reply from a TE device
 * (`F0 7E <dev> 06 02 00 20 76 <fam lo> <fam hi> <mem lo> <mem hi> <rev×4> F7`).
 * Returns null for anything else (other manufacturers, other messages, malformed input).
 */
export function parseTeIdentityReply(bytes: ArrayLike<number>): TeIdentity | null {
	if (bytes.length !== 17 || bytes[0] !== SYSEX_START || bytes[16] !== SYSEX_END) return null;
	for (let i = 1; i < 16; i++) {
		if (!isByte(bytes[i]) || bytes[i] > 0x7f) return null;
	}
	if (bytes[1] !== 0x7e || bytes[3] !== 0x06 || bytes[4] !== 0x02) return null;
	if (
		bytes[5] !== TE_MANUFACTURER_ID[0] ||
		bytes[6] !== TE_MANUFACTURER_ID[1] ||
		bytes[7] !== TE_MANUFACTURER_ID[2]
	) {
		return null;
	}
	const familyCode = bytes[8] | (bytes[9] << 7);
	const member = bytes[10] | (bytes[11] << 7);
	return {
		deviceId: bytes[2],
		familyCode,
		member,
		sku: formatTeSku(familyCode, member),
		softwareRevision: [bytes[12], bytes[13], bytes[14], bytes[15]]
	};
}

/**
 * GREET keys seen from the OP-XY on OS 1.1.33 (`product`, `mode`, `serial`, `dsp_serial`,
 * `os_version`, `sw_version`, `hw_rev`, `sku`) plus two that TE's updater also reads.
 */
export const TE_GREET_KEYS = [
	'product',
	'mode',
	'serial',
	'dsp_serial',
	'os_version',
	'sw_version',
	'hw_rev',
	'sku',
	'chip_id',
	'base_sku'
] as const;

/** A known GREET key. */
export type TeGreetKey = (typeof TE_GREET_KEYS)[number];

/** Parsed GREET metadata: keys exactly as the device sent them, values as strings. */
export type TeGreetInfo = { readonly [K in TeGreetKey]?: string } & {
	readonly [key: string]: string | undefined;
};

/** GREET keys that identify one physical unit; redact them before logging or saving captures. */
export const TE_GREET_SENSITIVE_KEYS: readonly string[] = ['serial', 'dsp_serial', 'chip_id'];

/**
 * Parses GREET metadata `key:value;key:value;…`. Entries without a colon or with an empty key are
 * skipped; a value keeps any further colons; surrounding whitespace and NULs are trimmed; a repeated
 * key keeps its last value.
 */
export function parseGreetMetadata(text: string): TeGreetInfo {
	const entries: [string, string][] = [];
	for (const entry of text.split(';')) {
		const colon = entry.indexOf(':');
		if (colon === -1) continue;
		const key = trimField(entry.slice(0, colon));
		if (key === '') continue;
		entries.push([key, trimField(entry.slice(colon + 1))]);
	}
	// Object.fromEntries defines own properties, so a key like "__proto__" cannot touch the prototype.
	return Object.fromEntries(entries);
}

/** A copy of `info` with unit-identifying values (serials, chip id) replaced by `<redacted>`. */
export function redactGreetInfo(info: TeGreetInfo): TeGreetInfo {
	return Object.fromEntries(
		Object.entries(info).map(([key, value]) => [
			key,
			TE_GREET_SENSITIVE_KEYS.includes(key) && value !== undefined ? '<redacted>' : value
		])
	);
}

function trimField(value: string): string {
	return value.replace(/^[\s\0]+|[\s\0]+$/g, '');
}
