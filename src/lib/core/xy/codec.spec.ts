// RLE cases ported from kmorrill/xy-format (MIT, Copyright (c) 2026 Kevin Morrill) tests/test_rle.py
// and the layout-family case of tests/test_image_writer.py.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { concat } from './bytes';
import { TRACK_BASE_BY_FAMILY, decodeXy, encodeXy, trackBase } from './container';
import { XyFormatError } from './errors';
import { PATTERN, PATTERN_SIZE, SONGS, TRACKS, laneCounts, lanesSize, walkProject } from './layout';
import { rleDecode, rleEncode } from './rle';

const fixture = (name: string) =>
	new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const bytes = (...values: number[]) => Uint8Array.from(values);
const blank = fixture('blank-1.1.4.xy');

describe('rle (xy/rle.py)', () => {
	it('encodes runs as two literals and a count', () => {
		expect(rleEncode(bytes(0, 0, 0))).toEqual(bytes(0, 0, 1));
		expect(rleDecode(bytes(0, 0, 1))).toEqual(bytes(0, 0, 0));
		expect(rleEncode(bytes(5))).toEqual(bytes(5));
		expect(rleEncode(bytes(5, 5))).toEqual(bytes(5, 5, 0));
		expect(rleDecode(bytes(5, 5, 0))).toEqual(bytes(5, 5));
		expect(rleEncode(new Uint8Array(0))).toEqual(new Uint8Array(0));
	});

	it('reads the legacy "gate token" as a u32 gate of 240', () => {
		expect(rleDecode(bytes(0xf0, 0, 0, 1))).toEqual(bytes(0xf0, 0, 0, 0));
	});

	it('splits long runs at 257', () => {
		const raw = new Uint8Array(600);
		const encoded = rleEncode(raw);
		expect(encoded).toEqual(bytes(0, 0, 0xff, 0, 0, 0xff, 0, 0, 0x54));
		expect(rleDecode(encoded)).toEqual(raw);
		// 258 = one full chunk and a lone literal
		expect(rleEncode(new Uint8Array(258).fill(7))).toEqual(bytes(7, 7, 0xff, 7));
	});

	it('resets the pair state after a count byte', () => {
		expect(rleDecode(bytes(8, 8, 2, 8, 9))).toEqual(bytes(8, 8, 8, 8, 8, 9));
		// a count byte equal to the next byte never pairs with it
		expect(rleDecode(bytes(3, 3, 3, 3))).toEqual(bytes(3, 3, 3, 3, 3, 3));
	});

	it('refuses a stream that ends on a pair without its count', () => {
		expect(() => rleDecode(bytes(0, 0))).toThrow(XyFormatError);
	});

	it('round-trips random data (seeded)', () => {
		let seed = 7;
		const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
		const alphabet = [0, 0, 0, 1, 2, 0xff];
		for (let round = 0; round < 500; round++) {
			const raw = Uint8Array.from({ length: next() % 601 }, () => alphabet[next() % 6]);
			expect(rleDecode(rleEncode(raw))).toEqual(raw);
		}
	});

	it('decodes a slice of a buffer', () => {
		expect(rleDecode(bytes(9, 9, 1, 4, 4, 0), 3)).toEqual(bytes(4, 4));
		expect(rleDecode(bytes(9, 9, 1, 4, 4, 0), 0, 3)).toEqual(bytes(9, 9, 9));
	});
});

describe('container', () => {
	it('splits a file into header and image and joins them back byte for byte', () => {
		const { header, image } = decodeXy(blank);
		expect(Array.from(header)).toEqual([0xdd, 0xcc, 0xbb, 0xaa, 0x09, 0x13, 0x03, 0x86]);
		expect(image.length).toBe(289_521);
		expect(encodeXy(header, image)).toEqual(blank);
	});

	it('refuses files and headers without the magic', () => {
		expect(() => decodeXy(bytes(1, 2, 3))).toThrow(XyFormatError);
		expect(() => decodeXy(bytes(0xdd, 0xcc, 0xbb, 0xab, 9, 0x13, 3, 0x86))).toThrow(/DD CC BB AA/);
		expect(() => encodeXy(bytes(0xdd, 0xcc, 0xbb, 0xaa), new Uint8Array(1))).toThrow(XyFormatError);
	});

	it('knows where Track 1 starts for each layout family', () => {
		expect(trackBase(bytes(0xdd, 0xcc, 0xbb, 0xaa, 9, 0x13, 3, 0x86))).toBe(3449);
		expect(trackBase(bytes(0xdd, 0xcc, 0xbb, 0xaa, 9, 0x14, 7, 0x86))).toBe(3449);
		expect(() => trackBase(bytes(0xdd, 0xcc, 0xbb, 0xaa, 9, 0x12, 3, 0x86))).toThrow(/0x12/);
	});
});

describe('walkProject', () => {
	it('walks the blank project: 16 single patterns and the default footer', () => {
		const { header, image } = decodeXy(blank);
		const layout = walkProject(header, image);
		expect(layout.trackBase).toBe(3449);
		expect(layout.tracks.map((t) => t.length)).toEqual(Array(TRACKS).fill(1));
		expect(layout.tracks.map((t) => t[0].base)).toEqual(
			Array.from({ length: TRACKS }, (_, t) => 3449 + t * PATTERN_SIZE)
		);
		expect(layout.footer).toBe(3449 + TRACKS * PATTERN_SIZE);
		expect(layout.songs).toHaveLength(SONGS);
		expect(layout.songs.every((s) => s.size === 4)).toBe(true);
	});

	// tests/test_image_writer.py test_track_scanner_uses_firmware_dependent_global_header_size
	it.each(Object.entries(TRACK_BASE_BY_FAMILY))(
		'layout family %s puts Track 1 at %i',
		(family, base) => {
			const { header, image } = decodeXy(blank);
			const resized =
				base >= 3449
					? concat([image.subarray(0, 3449), new Uint8Array(base - 3449), image.subarray(3449)])
					: concat([image.subarray(0, base), image.subarray(3449)]);
			const versioned = header.slice();
			versioned[5] = Number(family);
			const layout = walkProject(versioned, decodeXy(encodeXy(versioned, resized)).image);
			expect(layout.tracks[0][0].base).toBe(base);
			expect(layout.tracks[1][0].base).toBe(base + PATTERN_SIZE);
		}
	);

	it('finds clones one byte before their first byte, and notes and lanes in the size', () => {
		const song = decodeXy(fixture('song.xy'));
		const layout = walkProject(song.header, song.image);
		const [first, second] = layout.tracks[0];
		expect(second.base).toBe(first.end - 1);
		expect(first.noteCount).toBe(4);
		expect(first.end - first.base).toBe(PATTERN_SIZE + 4 * 12);
		expect(second.end - second.base).toBe(PATTERN_SIZE + 8 * 12);
		expect(layout.tracks.map((t) => t.length)).toEqual([
			2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1
		]);
	});

	it('counts performance lanes: a count byte, then 4 bytes a keyframe', () => {
		expect(lanesSize(bytes(0, 0, 0), 0)).toBe(3);
		expect(lanesSize(bytes(2, 1, 1, 1, 1, 9, 9, 9, 9, 0, 1, 7, 7, 7, 7), 0)).toBe(15);
		expect(laneCounts(bytes(2, 1, 1, 1, 1, 9, 9, 9, 9, 0, 1, 7, 7, 7, 7))).toEqual([2, 0, 1]);
		expect(() => lanesSize(bytes(0, 5, 0), 0)).toThrow(XyFormatError);
	});

	it('walks a pattern with performance lanes to the right footer', () => {
		const { header, image } = decodeXy(blank);
		// three keyframes of pitch bend on T1 (the lanes a live take records, note 10 A.1)
		const at = 3449 + PATTERN.notes;
		const lanes = bytes(3, 0, 0, 0xff, 0x1f, 0xe0, 1, 0x22, 2, 0xc0, 3, 0x44, 4, 0, 0);
		const withLanes = concat([image.subarray(0, at), lanes, image.subarray(at + 3)]);
		const layout = walkProject(header, withLanes);
		expect(layout.tracks[0][0].lanesSize).toBe(lanes.length);
		expect(layout.tracks[1][0].base).toBe(3449 + PATTERN_SIZE + lanes.length - 3);
		expect(layout.songs).toHaveLength(SONGS);
	});

	it('refuses images whose counts or sizes do not agree', () => {
		const { header, image } = decodeXy(blank);
		const broken = (edit: (img: Uint8Array) => Uint8Array) => () =>
			walkProject(header, edit(image.slice()));
		expect(
			broken((img) => {
				img[3449] = 0;
				return img;
			})
		).toThrow(/T1 has 0 patterns/);
		expect(
			broken((img) => {
				img[3449 + 2 * PATTERN_SIZE] = 17;
				return img;
			})
		).toThrow(/T3 has 17 patterns/);
		expect(
			broken((img) => {
				img[3449 + PATTERN.noteCount] = 121;
				return img;
			})
		).toThrow(/121 notes/);
		expect(broken((img) => concat([img, bytes(0)]))).toThrow(/footer ends/);
		expect(broken((img) => img.subarray(0, img.length - 1))).toThrow(XyFormatError);
		expect(broken((img) => img.subarray(0, 5000))).toThrow(/past the end/);
	});
});
