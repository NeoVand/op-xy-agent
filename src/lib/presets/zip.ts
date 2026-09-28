/**
 * A minimal zip writer (stored, no compression: WAV hardly compresses) for handing a `.preset`
 * folder to the user, who unzips it into Field Kit or the device's `presets/` over MTP. Names are
 * UTF-8 (general purpose flag bit 11); every entry carries its CRC-32 and a fixed timestamp so the
 * same preset always zips to the same bytes.
 */

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

/** The CRC-32 zip uses. */
export function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** One file in the archive. */
export interface ZipEntry {
	readonly path: string;
	readonly bytes: Uint8Array;
}

/** 2026-01-01 00:00 in MS-DOS time and date. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** A zip archive of `entries`, stored. */
export function zip(entries: readonly ZipEntry[]): Uint8Array {
	const encoder = new TextEncoder();
	const names = entries.map((e) => encoder.encode(e.path));
	const crcs = entries.map((e) => crc32(e.bytes));
	const localSize = entries.reduce((n, e, i) => n + 30 + names[i].length + e.bytes.length, 0);
	const centralSize = entries.reduce((n, _e, i) => n + 46 + names[i].length, 0);
	const out = new Uint8Array(localSize + centralSize + 22);
	const view = new DataView(out.buffer);
	let at = 0;
	const offsets: number[] = [];
	entries.forEach((entry, i) => {
		offsets.push(at);
		view.setUint32(at, 0x04034b50, true);
		view.setUint16(at + 4, 20, true);
		view.setUint16(at + 6, 0x0800, true);
		view.setUint16(at + 8, 0, true);
		view.setUint16(at + 10, DOS_TIME, true);
		view.setUint16(at + 12, DOS_DATE, true);
		view.setUint32(at + 14, crcs[i], true);
		view.setUint32(at + 18, entry.bytes.length, true);
		view.setUint32(at + 22, entry.bytes.length, true);
		view.setUint16(at + 26, names[i].length, true);
		view.setUint16(at + 28, 0, true);
		out.set(names[i], at + 30);
		out.set(entry.bytes, at + 30 + names[i].length);
		at += 30 + names[i].length + entry.bytes.length;
	});
	const central = at;
	entries.forEach((entry, i) => {
		view.setUint32(at, 0x02014b50, true);
		view.setUint16(at + 4, 20, true);
		view.setUint16(at + 6, 20, true);
		view.setUint16(at + 8, 0x0800, true);
		view.setUint16(at + 10, 0, true);
		view.setUint16(at + 12, DOS_TIME, true);
		view.setUint16(at + 14, DOS_DATE, true);
		view.setUint32(at + 16, crcs[i], true);
		view.setUint32(at + 20, entry.bytes.length, true);
		view.setUint32(at + 24, entry.bytes.length, true);
		view.setUint16(at + 28, names[i].length, true);
		view.setUint32(at + 42, offsets[i], true);
		out.set(names[i], at + 46);
		at += 46 + names[i].length;
	});
	view.setUint32(at, 0x06054b50, true);
	view.setUint16(at + 8, entries.length, true);
	view.setUint16(at + 10, entries.length, true);
	view.setUint32(at + 12, at - central, true);
	view.setUint32(at + 16, central, true);
	return out;
}
