import { describe, expect, it } from 'vitest';
import teSysex from '$knowledge/firmware/te-sysex.json';
import {
	GM_CC_TABLE,
	GM_DRUMS,
	GM_FAMILIES,
	GM_PROGRAMS,
	gmCcInfo,
	gmCcName,
	gmFamily,
	gmProgramName,
	manufacturerName,
	MANUFACTURERS_3BYTE,
	rpnInfo,
	TEENAGE_ENGINEERING_ID
} from './constants';
import { MidiRangeError } from './validate';

describe('manufacturer IDs', () => {
	it('names Teenage Engineering by the ID the OP-XY actually sends, 00 20 76', () => {
		expect(TEENAGE_ENGINEERING_ID).toEqual([0x00, 0x20, 0x76]);
		expect(manufacturerName([0x00, 0x20, 0x76])).toBe('Teenage Engineering');
		// The knowledge file records the same ID, read from the device's identity reply.
		expect(teSysex.manufacturer_id).toEqual([...TEENAGE_ENGINEERING_ID]);
	});

	it('no longer credits 00 21 0F (Philips) to Teenage Engineering', () => {
		expect(manufacturerName([0x00, 0x21, 0x0f])).toBe('Philips Electronics HK Ltd');
		expect(Object.values(MANUFACTURERS_3BYTE).filter((n) => n === 'Teenage Engineering')).toEqual([
			'Teenage Engineering'
		]);
	});

	it('puts the companies MIDI Lab misfiled back on their own IDs', () => {
		expect(manufacturerName([0x00, 0x21, 0x1d])).toBe('Ableton');
		expect(manufacturerName([0x00, 0x21, 0x32])).toBe('Bome Software');
		expect(manufacturerName([0x00, 0x20, 0x6b])).toBe('Arturia');
		expect(manufacturerName([0x00, 0x01, 0x72])).toBe('Kilpatrick Audio');
		expect(manufacturerName([0x00, 0x00, 0x66])).toBe('Loud Technologies / Mackie');
		expect(manufacturerName([0x51])).toBe('Fostex Corporation');
	});

	it('reads one-byte IDs and the special IDs', () => {
		expect(manufacturerName([0x41, 0x10, 0x42])).toBe('Roland Corporation');
		expect(manufacturerName([0x7e])).toBe('Universal Non-Real Time');
		expect(manufacturerName([0x7d])).toMatch(/Non-Commercial/);
	});

	it('says unknown instead of guessing', () => {
		expect(manufacturerName([])).toBe('unknown');
		expect(manufacturerName([0x03])).toBe('unknown (03)');
		expect(manufacturerName([0x00, 0x7f, 0x7f])).toBe('unknown (00 7F 7F)');
		expect(manufacturerName([0x00, 0x20])).toBe('unknown (incomplete three-byte ID)');
		expect(manufacturerName([0x00, 0x20, 0x80])).toBe('unknown (incomplete three-byte ID)');
		expect(manufacturerName([0xf0])).toBe('unknown');
	});
});

describe('the General MIDI controller table', () => {
	it('covers all 128 controllers', () => {
		expect(GM_CC_TABLE).toHaveLength(128);
		GM_CC_TABLE.forEach((info, n) => expect(info.number).toBe(n));
	});

	it('pairs the 14-bit halves, including CC 32 as Bank Select LSB under GM', () => {
		expect(gmCcInfo(0).lsb).toBe(32);
		expect(gmCcInfo(32)).toMatchObject({ category: 'lsb', msb: 0, name: 'Bank Select (LSB)' });
		expect(gmCcName(32)).toBe('Bank LSB');
		expect(gmCcName(38)).toBe('Data LSB');
		expect(gmCcName(33)).toBe('Mod Wheel LSB');
	});

	it('leaves undefined numbers, and their LSBs, undefined', () => {
		for (const n of [3, 9, 14, 15, 20, 31, 35, 52, 63, 85, 102, 119]) {
			expect(gmCcInfo(n)).toMatchObject({ category: 'undefined', standard: false });
		}
		expect(gmCcName(3)).toBe('CC 3');
	});

	it('names the channel mode messages', () => {
		expect(gmCcName(120)).toBe('All Sound Off');
		expect(gmCcName(123)).toBe('All Notes Off');
		expect(gmCcInfo(123).category).toBe('mode');
	});

	it('refuses controller numbers outside 0–127 instead of masking them', () => {
		// MIDI Lab looked up `n & 0x7f`, so 128 quietly became Bank Select.
		expect(() => gmCcInfo(128)).toThrow(MidiRangeError);
		expect(() => gmCcName(-1)).toThrow(MidiRangeError);
	});
});

describe('registered parameters', () => {
	it('finds RPN null at 7F 7F', () => {
		expect(rpnInfo(0x7f, 0x7f)?.name).toBe('RPN Null');
		expect(rpnInfo(0x3f, 0x7f)).toBeUndefined();
		expect(rpnInfo(0, 0)?.name).toBe('Pitch Bend Sensitivity');
	});
});

describe('General MIDI programs and drums', () => {
	it('has 128 programs in 16 families of 8', () => {
		expect(GM_PROGRAMS).toHaveLength(128);
		expect(GM_FAMILIES).toHaveLength(16);
		expect(gmProgramName(0)).toBe('Acoustic Grand Piano');
		expect(gmProgramName(127)).toBe('Gunshot');
		expect(gmFamily(0)).toBe('Piano');
		expect(gmFamily(127)).toBe('Sound Effects');
	});

	it('refuses program numbers outside 0–127', () => {
		expect(() => gmProgramName(128)).toThrow(MidiRangeError);
		expect(() => gmFamily(-1)).toThrow(MidiRangeError);
	});

	it('maps the GM percussion keys 35–81', () => {
		const keys = Object.keys(GM_DRUMS).map(Number);
		expect(Math.min(...keys)).toBe(35);
		expect(Math.max(...keys)).toBe(81);
		expect(keys).toHaveLength(47);
		expect(GM_DRUMS[36]).toBe('Bass Drum 1');
		expect(GM_DRUMS[42]).toBe('Closed Hi-Hat');
	});
});
