// Ported from kmorrill/xy-format (MIT, Copyright (c) 2026 Kevin Morrill) xy/rle.py.
//
// The byte-level RLE of the `.xy` body (docs/research/10-xy-format.md §2.2): after two equal bytes
// the next byte counts how many more of them follow, and that count byte never pairs with the byte
// after it. The firmware encodes greedily (maximal runs, split at 257), so re-encoding a device file
// gives it back byte for byte; any valid stream decodes, but only a greedy one re-encodes the same.

import { XyFormatError } from './errors';

/** Longest run one emission covers: the two literal bytes and a count of 255. */
const MAX_RUN = 257;

/**
 * Decodes an RLE stream (the bytes of `buf` from `start` to `end`). The output size is counted in
 * a first pass, so the image is allocated once.
 * @throws XyFormatError when the stream ends on an equal pair with no count byte after it.
 */
export function rleDecode(buf: Uint8Array, start = 0, end = buf.length): Uint8Array {
	let size = 0;
	for (let i = start, prev = -1; i < end;) {
		const b = buf[i++];
		size++;
		if (b === prev) {
			if (i >= end) throw new XyFormatError(`RLE count byte missing at offset ${i}`);
			size += buf[i++];
			prev = -1;
		} else prev = b;
	}
	const out = new Uint8Array(size);
	for (let i = start, o = 0, prev = -1; i < end;) {
		const b = buf[i++];
		out[o++] = b;
		if (b === prev) {
			const extra = buf[i++];
			out.fill(b, o, o + extra);
			o += extra;
			prev = -1;
		} else prev = b;
	}
	return out;
}

/** Encodes greedily, as the firmware does: `00 00 00` → `00 00 01`, a lone byte stays as it is. */
export function rleEncode(data: Uint8Array): Uint8Array {
	const emit = (write: (at: number, value: number) => void): number => {
		let o = 0;
		for (let i = 0; i < data.length;) {
			const v = data[i];
			let j = i + 1;
			while (j < data.length && data[j] === v) j++;
			let run = j - i;
			while (run >= 2) {
				const chunk = Math.min(run, MAX_RUN);
				write(o++, v);
				write(o++, v);
				write(o++, chunk - 2);
				run -= chunk;
			}
			if (run === 1) write(o++, v);
			i = j;
		}
		return o;
	};
	const out = new Uint8Array(emit(() => {}));
	emit((at, value) => {
		out[at] = value;
	});
	return out;
}
