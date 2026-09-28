// Ported from kmorrill/xy-format (MIT, Copyright (c) 2026 Kevin Morrill): xy/rle.py
// (decode_project, encode_project) and xy/image_writer.py (TRACK_BASE_BY_FIRMWARE).
//
// A `.xy` file is an 8-byte header and one RLE stream to the end of the file: no length field and no
// checksum (docs/research/10-xy-format.md §2.1). The stream decodes to the firmware's in-RAM project,
// "the image". Header byte 5 is the layout family, which decides where Track 1 starts.

import { hex2 } from './bytes';
import { XyFormatError } from './errors';
import { rleDecode, rleEncode } from './rle';

/** The first four bytes of every project. */
export const XY_MAGIC: readonly number[] = [0xdd, 0xcc, 0xbb, 0xaa];
/** Header length: the magic and four version bytes, copied as they are by every writer. */
export const XY_HEADER_LENGTH = 8;

/**
 * Where Track 1 starts in the image, by layout family (header byte 5). 0x13 is every file of OS
 * 1.1.4–1.1.21 in the upstream corpus. 0x14 is OS 1.1.33: the owner's blank project decodes to the
 * same 289,521 bytes with Track 1 at the same place and only 56 bytes of content different (note 10
 * §8). 0x0E–0x11 are older firmware, from upstream issue #19; no file of theirs is in the corpus.
 */
export const TRACK_BASE_BY_FAMILY: Readonly<Record<number, number>> = {
	0x0e: 3933,
	0x0f: 3933,
	0x10: 3433,
	0x11: 3433,
	0x13: 3449,
	0x14: 3449
};

/**
 * Families whose global header we have mapped (settings at 0x00, 100 scenes at 0x95), and so the ones
 * `readProject` reads and `writeProject` takes templates from. For the older families only the track
 * base is known: the 16 bytes they lack may be the MIDI channel array.
 */
export const MAPPED_FAMILIES: readonly number[] = [0x13, 0x14];

/** A project split into its header and its decoded image. */
export interface XyContainer {
	/** The 8 header bytes. */
	header: Uint8Array;
	/** The decoded image. */
	image: Uint8Array;
}

/**
 * Splits a `.xy` file into its header and decoded image.
 * @throws XyFormatError when the magic is missing or the RLE stream is cut short.
 */
export function decodeXy(file: Uint8Array): XyContainer {
	if (file.length < XY_HEADER_LENGTH || XY_MAGIC.some((b, i) => file[i] !== b)) {
		throw new XyFormatError('not an OP-XY project (the file does not start with DD CC BB AA)');
	}
	return { header: file.slice(0, XY_HEADER_LENGTH), image: rleDecode(file, XY_HEADER_LENGTH) };
}

/**
 * Joins a header and an image into a `.xy` file (the inverse of {@link decodeXy}; greedy RLE, so a
 * device file comes back byte for byte).
 * @throws XyFormatError when the header is not 8 bytes starting with the magic.
 */
export function encodeXy(header: Uint8Array, image: Uint8Array): Uint8Array {
	if (header.length !== XY_HEADER_LENGTH || XY_MAGIC.some((b, i) => header[i] !== b)) {
		throw new XyFormatError('a header is 8 bytes starting with DD CC BB AA');
	}
	const body = rleEncode(image);
	const out = new Uint8Array(XY_HEADER_LENGTH + body.length);
	out.set(header, 0);
	out.set(body, XY_HEADER_LENGTH);
	return out;
}

/**
 * Where Track 1 starts in the image of a file with this header.
 * @throws XyFormatError for a layout family we do not know.
 */
export function trackBase(header: Uint8Array): number {
	const base = TRACK_BASE_BY_FAMILY[header[5]];
	if (base === undefined) throw new XyFormatError(`unknown layout family ${hex2(header[5])}`);
	return base;
}
