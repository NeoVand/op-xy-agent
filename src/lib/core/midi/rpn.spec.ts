import { describe, expect, it } from 'vitest';
import type { MidiMessage } from './messages';
import { CC, nrpn, parameterEdit, rpn, RpnParser, RPN_NULL, setBendRange } from './rpn';
import { MidiRangeError } from './validate';

const cc = (controller: number, value: number, channel = 0): MidiMessage => ({
	type: 'controlChange',
	channel,
	controller,
	value
});

describe('building parameter edits', () => {
	it('selects, sets and then deselects an RPN', () => {
		expect(rpn(2, 0, 5, 64)).toEqual([
			cc(CC.RpnMsb, 0, 2),
			cc(CC.RpnLsb, 5, 2),
			cc(CC.DataEntryMsb, 64, 2),
			cc(CC.RpnMsb, RPN_NULL.msb, 2),
			cc(CC.RpnLsb, RPN_NULL.lsb, 2)
		]);
	});

	it('uses the NRPN selectors and can skip the null or send 14 bits', () => {
		expect(nrpn(0, 1, 2, 16383, { fine: true, nullAfter: false })).toEqual([
			cc(CC.NrpnMsb, 1),
			cc(CC.NrpnLsb, 2),
			cc(CC.DataEntryMsb, 127),
			cc(CC.DataEntryLsb, 127)
		]);
	});

	it('refuses values it cannot send instead of masking them', () => {
		// MIDI Lab sent `value & 0x7f`, so 200 became 72.
		expect(() => rpn(0, 0, 0, 200)).toThrow(MidiRangeError);
		expect(() => rpn(0, 0, 0, 16384, { fine: true })).toThrow(MidiRangeError);
		expect(() => rpn(16, 0, 0, 1)).toThrow(/wire channels are 0–15/);
		expect(() => nrpn(0, 128, 0, 1)).toThrow(MidiRangeError);
		expect(() => nrpn(0, 0, -1, 1)).toThrow(MidiRangeError);
		expect(() => parameterEdit('sysex' as 'rpn', 0, 0, 0, 0)).toThrow(/'rpn' or 'nrpn'/);
	});

	it('sets the bend range with RPN 0,0 and rejects impossible ranges', () => {
		expect(setBendRange(1, 12, 50)).toEqual([
			cc(CC.RpnMsb, 0, 1),
			cc(CC.RpnLsb, 0, 1),
			cc(CC.DataEntryMsb, 12, 1),
			cc(CC.DataEntryLsb, 50, 1),
			cc(CC.RpnMsb, 127, 1),
			cc(CC.RpnLsb, 127, 1)
		]);
		expect(setBendRange(0, 2)[3]).toEqual(cc(CC.DataEntryLsb, 0));
		expect(() => setBendRange(0, 128)).toThrow(MidiRangeError);
		expect(() => setBendRange(0, 2, 100)).toThrow(MidiRangeError);
		expect(() => setBendRange(16, 2)).toThrow(MidiRangeError);
	});
});

describe('reassembling parameter edits', () => {
	it('round-trips a 7-bit RPN edit and deselects on the null', () => {
		const p = new RpnParser();
		const edits = rpn(3, 0, 0, 12).map((m) => p.push(m));
		expect(edits).toEqual([
			null,
			null,
			{ kind: 'rpn', msb: 0, lsb: 0, value: 12, fine: false },
			null,
			null
		]);
		expect(p.selected(3)).toBeNull();
		expect(p.push(cc(CC.DataEntryMsb, 5, 3))).toBeNull();
	});

	it('round-trips a 14-bit NRPN edit', () => {
		const p = new RpnParser();
		const edits = nrpn(0, 1, 2, 0x1234, { fine: true }).map((m) => p.push(m));
		expect(edits[2]).toEqual({ kind: 'nrpn', msb: 1, lsb: 2, value: 0x1234 >> 7, fine: false });
		expect(edits[3]).toEqual({ kind: 'nrpn', msb: 1, lsb: 2, value: 0x1234, fine: true });
		expect(p.selected(0)).toBeNull();
	});

	it('keeps RPN and NRPN selectors apart', () => {
		// MIDI Lab shared the registers: RPN MSB 0 then NRPN LSB 5 made a phantom NRPN 0,5.
		const p = new RpnParser();
		p.push(cc(CC.RpnMsb, 0));
		p.push(cc(CC.NrpnLsb, 5));
		expect(p.selected(0)).toEqual({ kind: 'nrpn', msb: 0x7f, lsb: 5 });
		p.push(cc(CC.NrpnMsb, 1));
		expect(p.selected(0)).toEqual({ kind: 'nrpn', msb: 1, lsb: 5 });
		p.push(cc(CC.RpnLsb, 2));
		expect(p.selected(0)).toEqual({ kind: 'rpn', msb: 0, lsb: 2 });
	});

	it('does not combine a Data Entry LSB with an MSB from before the selection', () => {
		const p = new RpnParser();
		p.push(cc(CC.RpnMsb, 0));
		p.push(cc(CC.RpnLsb, 1));
		p.push(cc(CC.DataEntryMsb, 64));
		p.push(cc(CC.RpnLsb, 2));
		expect(p.push(cc(CC.DataEntryLsb, 3))).toEqual({
			kind: 'rpn',
			msb: 0,
			lsb: 2,
			value: 3,
			fine: true
		});
	});

	it('tracks channels separately and ignores everything else', () => {
		const p = new RpnParser();
		p.push(cc(CC.RpnMsb, 0, 0));
		p.push(cc(CC.RpnLsb, 0, 0));
		expect(p.push(cc(CC.DataEntryMsb, 2, 1))).toBeNull();
		expect(p.push(cc(7, 100))).toBeNull();
		expect(p.push({ type: 'noteOn', channel: 0, note: 60, velocity: 1 })).toBeNull();
		expect(p.push(cc(CC.DataEntryLsb, 2, 1))).toBeNull();
		expect(p.selected(0)).toEqual({ kind: 'rpn', msb: 0, lsb: 0 });
	});

	it('forgets selections on reset and refuses channel 16', () => {
		const p = new RpnParser();
		p.push(cc(CC.RpnMsb, 0));
		p.push(cc(CC.RpnLsb, 0));
		p.reset();
		expect(p.selected(0)).toBeNull();
		expect(() => p.selected(16)).toThrow(MidiRangeError);
		expect(() => p.push(cc(CC.RpnMsb, 0, 16))).toThrow(MidiRangeError);
	});
});
