// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/rpn.ts

/**
 * Registered and Non-Registered Parameter Numbers.
 *
 * RPN and NRPN are not message types but a protocol built from ordinary Control Changes: select the
 * parameter (two CCs), send the value (one or two CCs), then ideally select the null parameter so a
 * stray Data Entry cannot move anything. RPNs are defined by the MIDI specification (bend range,
 * tuning, MPE configuration); NRPNs mean whatever a device's implementation chart says. The OP-XY
 * is reported to be CC-only, so this is here for completeness and for reading other gear.
 */

import { split14, type MidiMessage } from './messages';
import { assertChannel, assertData7, assertIntInRange, MidiRangeError } from './validate';

/** The controllers that carry parameter selection and data. */
export const CC = {
	DataEntryMsb: 6,
	DataEntryLsb: 38,
	DataIncrement: 96,
	DataDecrement: 97,
	NrpnLsb: 98,
	NrpnMsb: 99,
	RpnLsb: 100,
	RpnMsb: 101
} as const;

/** The null RPN, 7F 7F: selecting it deselects everything. */
export const RPN_NULL = { msb: 0x7f, lsb: 0x7f } as const;

/** Registered (MIDI-defined) or non-registered (device-defined). */
export type ParameterKind = 'rpn' | 'nrpn';

/** One reassembled parameter edit. */
export interface ParameterEdit {
	kind: ParameterKind;
	msb: number;
	lsb: number;
	/** 14-bit value when `fine`, otherwise the 7-bit Data Entry MSB. */
	value: number;
	fine: boolean;
}

/** Options for `parameterEdit`, `rpn` and `nrpn`. */
export interface ParameterEditOptions {
	/** Send a 14-bit value as Data Entry MSB + LSB (default false: 7-bit, MSB only). */
	fine?: boolean;
	/** Finish with the null RPN (default true). */
	nullAfter?: boolean;
}

function cc(channel: number, controller: number, value: number): MidiMessage {
	return { type: 'controlChange', channel, controller, value };
}

function nullRpn(channel: number): MidiMessage[] {
	return [cc(channel, CC.RpnMsb, RPN_NULL.msb), cc(channel, CC.RpnLsb, RPN_NULL.lsb)];
}

/**
 * The full message sequence for one parameter edit. `value` is 14-bit (0–16383) when `fine`,
 * otherwise 7-bit (0–127); anything else throws `MidiRangeError` (MIDI Lab masked it to 7 bits).
 * The trailing null is good hygiene: without it, any later Data Entry lands on this parameter.
 */
export function parameterEdit(
	kind: ParameterKind,
	channel: number,
	msb: number,
	lsb: number,
	value: number,
	opts: ParameterEditOptions = {}
): MidiMessage[] {
	const { fine = false, nullAfter = true } = opts;
	if (kind !== 'rpn' && kind !== 'nrpn') throw new MidiRangeError('kind', kind, "'rpn' or 'nrpn'");
	assertChannel(channel);
	assertData7(msb, 'msb');
	assertData7(lsb, 'lsb');
	const selMsb = kind === 'rpn' ? CC.RpnMsb : CC.NrpnMsb;
	const selLsb = kind === 'rpn' ? CC.RpnLsb : CC.NrpnLsb;
	const out = [cc(channel, selMsb, msb), cc(channel, selLsb, lsb)];
	if (fine) {
		const halves = split14(value);
		out.push(cc(channel, CC.DataEntryMsb, halves.msb), cc(channel, CC.DataEntryLsb, halves.lsb));
	} else {
		assertData7(value, 'value');
		out.push(cc(channel, CC.DataEntryMsb, value));
	}
	if (nullAfter) out.push(...nullRpn(channel));
	return out;
}

/** A registered parameter edit (see `parameterEdit`). */
export function rpn(
	channel: number,
	msb: number,
	lsb: number,
	value: number,
	opts?: ParameterEditOptions
): MidiMessage[] {
	return parameterEdit('rpn', channel, msb, lsb, value, opts);
}

/** A non-registered parameter edit (see `parameterEdit`). */
export function nrpn(
	channel: number,
	msb: number,
	lsb: number,
	value: number,
	opts?: ParameterEditOptions
): MidiMessage[] {
	return parameterEdit('nrpn', channel, msb, lsb, value, opts);
}

/**
 * RPN 0,0: how many semitones (0–127) and cents (0–99) a full pitch bend covers. Out-of-range
 * values throw (MIDI Lab clamped them).
 */
export function setBendRange(channel: number, semitones: number, cents = 0): MidiMessage[] {
	assertChannel(channel);
	assertData7(semitones, 'semitones');
	assertIntInRange(cents, 0, 99, 'cents');
	return [
		cc(channel, CC.RpnMsb, 0),
		cc(channel, CC.RpnLsb, 0),
		cc(channel, CC.DataEntryMsb, semitones),
		cc(channel, CC.DataEntryLsb, cents),
		...nullRpn(channel)
	];
}

interface ChannelState {
	/** Whichever selector arrived last decides what Data Entry edits. */
	active: ParameterKind | null;
	rpnMsb: number;
	rpnLsb: number;
	nrpnMsb: number;
	nrpnLsb: number;
	/** Data Entry MSB since the last selection, for combining with a following LSB. */
	valueMsb: number | null;
}

function freshState(): ChannelState {
	// Registers start at 7F (the null value) so a half-sent selection is not mistaken for 0,0.
	return { active: null, rpnMsb: 0x7f, rpnLsb: 0x7f, nrpnMsb: 0x7f, nrpnLsb: 0x7f, valueMsb: null };
}

/**
 * Reassembles parameter edits from a stream of Control Changes, per channel, so a monitor can say
 * "those five CCs were one edit". RPN and NRPN selectors are kept in separate registers, as in a
 * real receiver (MIDI Lab shared them, so an RPN MSB followed by an NRPN LSB produced a phantom
 * NRPN). An LSB with no MSB since the selection is reported with an MSB of 0, since the parser
 * cannot know the device's current value.
 */
export class RpnParser {
	#state: ChannelState[] = Array.from({ length: 16 }, freshState);

	/** Returns a completed edit when a Data Entry lands on a selected parameter, otherwise null. */
	push(msg: MidiMessage): ParameterEdit | null {
		if (msg.type !== 'controlChange') return null;
		assertChannel(msg.channel, 'controlChange.channel');
		const s = this.#state[msg.channel];
		switch (msg.controller) {
			case CC.RpnMsb:
				s.rpnMsb = msg.value;
				return select(s, 'rpn');
			case CC.RpnLsb:
				s.rpnLsb = msg.value;
				return select(s, 'rpn');
			case CC.NrpnMsb:
				s.nrpnMsb = msg.value;
				return select(s, 'nrpn');
			case CC.NrpnLsb:
				s.nrpnLsb = msg.value;
				return select(s, 'nrpn');
			case CC.DataEntryMsb: {
				const sel = selection(s);
				if (!sel) return null;
				s.valueMsb = msg.value;
				return { ...sel, value: msg.value, fine: false };
			}
			case CC.DataEntryLsb: {
				const sel = selection(s);
				if (!sel) return null;
				return { ...sel, value: ((s.valueMsb ?? 0) << 7) | msg.value, fine: true };
			}
			default:
				return null;
		}
	}

	/** The parameter currently selected on a wire channel, or null. */
	selected(channel: number): { kind: ParameterKind; msb: number; lsb: number } | null {
		assertChannel(channel);
		return selection(this.#state[channel]);
	}

	/** Forget every selection on every channel. */
	reset(): void {
		this.#state = Array.from({ length: 16 }, freshState);
	}
}

/** A selector arrived: it decides what Data Entry edits, and any earlier MSB no longer applies. */
function select(s: ChannelState, kind: ParameterKind): null {
	s.active = kind;
	s.valueMsb = null;
	return null;
}

function selection(s: ChannelState): { kind: ParameterKind; msb: number; lsb: number } | null {
	if (s.active === 'rpn') {
		const isNull = s.rpnMsb === RPN_NULL.msb && s.rpnLsb === RPN_NULL.lsb;
		return isNull ? null : { kind: 'rpn', msb: s.rpnMsb, lsb: s.rpnLsb };
	}
	if (s.active === 'nrpn') return { kind: 'nrpn', msb: s.nrpnMsb, lsb: s.nrpnLsb };
	return null;
}
