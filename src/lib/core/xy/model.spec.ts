// Quantisation and groove cases ported from kmorrill/xy-format (MIT, Copyright (c) 2026 Kevin
// Morrill) tests/test_bar_menu_inspection.py (the bar-q-* and bar-g* device captures).
import { describe, expect, it } from 'vitest';
import { GROOVE_VALUES } from '$lib/sim/sequencer';
import ccMap from '$knowledge/midi/xy-format-cc-map.json';
import {
	TRACK_GROOVE_DETENTS,
	XY_LOCK_COLUMNS,
	XY_SCALES,
	lockBit,
	quantizeByte,
	quantizePercent,
	scaleByte,
	trackGrooveByte,
	trackGrooveValue
} from './model';

describe('lock columns', () => {
	it('agree with knowledge/midi/xy-format-cc-map.json', () => {
		expect(XY_LOCK_COLUMNS.map(({ column, bit, name, cc }) => ({ column, bit, name, cc }))).toEqual(
			ccMap.plock_columns.columns.map((c) => ({
				column: c.column,
				bit: c.mask_bit,
				name: c.name,
				cc: c.cc
			}))
		);
	});

	it('arm column 0 (volume) with bit 41 and column c with bit c − 1', () => {
		expect([0, 1, 17, 41].map(lockBit)).toEqual([41, 0, 16, 40]);
	});
});

describe('quantisation (bar-q-*)', () => {
	it.each([
		[0x00, 0],
		[0x02, 0],
		[0x03, 1],
		[0x04, 1],
		[0x40, 25],
		[0x80, 50],
		[0x81, 50],
		[0xc0, 75],
		[0xfc, 98],
		[0xfd, 99],
		[0xfe, 99],
		[0xff, 100]
	])('byte %i shows %i %%', (raw, percent) => {
		expect(quantizePercent(raw)).toBe(percent);
	});

	it.each([
		[0, 0x00],
		[1, 0x03],
		[25, 0x40],
		[50, 0x80],
		[75, 0xc0],
		[98, 0xfa],
		[99, 0xfd],
		[100, 0xff]
	])('%i %% is written as the smallest byte that shows it, %i', (percent, raw) => {
		expect(quantizeByte(percent)).toBe(raw);
		expect(quantizePercent(raw)).toBe(percent);
		if (raw > 0) expect(quantizePercent(raw - 1)).toBeLessThan(percent);
	});
});

describe('track groove (bar-g*)', () => {
	it.each([
		[-15, -11],
		[-3, -2],
		[3, 2],
		[9, 7],
		[78, 60],
		[108, 84],
		[123, 96],
		[127, 99],
		[-102, -79],
		[-123, -96],
		[-127, -99]
	])('byte %i shows %i', (raw, value) => {
		expect(trackGrooveValue(raw)).toBe(value);
		expect(trackGrooveByte(value)).toBe(raw);
	});

	it('knows only the detents', () => {
		expect(trackGrooveByte(3)).toBeNull();
		expect(trackGrooveValue(4)).toBeNull();
		expect(trackGrooveByte(0)).toBe(0);
		expect(trackGrooveValue(0)).toBe(0);
	});

	it('steps through the same values as the simulator’s bar menu', () => {
		expect(GROOVE_VALUES).toEqual([
			...[...TRACK_GROOVE_DETENTS].reverse().map((v) => -v),
			0,
			...TRACK_GROOVE_DETENTS
		]);
	});
});

describe('track scales', () => {
	it('decode the four captured bytes (u20–u22 and the default)', () => {
		expect(XY_SCALES).toEqual({ 1: 0.5, 3: 1, 5: 2, 14: 16 });
		expect([0.5, 1, 2, 16, 3].map(scaleByte)).toEqual([0x01, 0x03, 0x05, 0x0e, null]);
	});
});
