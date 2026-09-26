import { describe, expect, it } from 'vitest';
import type { MidiMessage } from './messages';
import {
	assertValidTransform,
	DEFAULT_FILTERS,
	IDENTITY_TRANSFORM,
	passes,
	transform,
	type MessageFilters,
	type RouteTransform
} from './route';
import { MidiRangeError } from './validate';

const route = (patch: Partial<RouteTransform> = {}): RouteTransform => ({
	...IDENTITY_TRANSFORM,
	...patch
});
const on = (note: number, velocity = 100, channel = 0): MidiMessage => ({
	type: 'noteOn',
	channel,
	note,
	velocity
});

describe('transform', () => {
	it('changes nothing with the identity transform', () => {
		expect(transform(on(60), route())).toEqual(on(60));
		expect(transform({ type: 'pitchBend', channel: 3, value: 1 }, route())).toEqual({
			type: 'pitchBend',
			channel: 3,
			value: 1
		});
	});

	it('transposes, and drops a note transposed out of range instead of clamping it', () => {
		expect(transform(on(60), route({ transpose: 12 }))).toEqual(on(72));
		expect(transform(on(120), route({ transpose: 12 }))).toBeNull();
		expect(transform(on(5), route({ transpose: -12 }))).toBeNull();
		expect(
			transform({ type: 'noteOff', channel: 0, note: 60, velocity: 0 }, route({ transpose: 1 }))
		).toEqual({ type: 'noteOff', channel: 0, note: 61, velocity: 0 });
		expect(
			transform(
				{ type: 'polyAftertouch', channel: 0, note: 60, pressure: 9 },
				route({ transpose: 2 })
			)
		).toEqual({ type: 'polyAftertouch', channel: 0, note: 62, pressure: 9 });
	});

	it('remaps channels and filters by channel', () => {
		expect(transform(on(60, 100, 4), route({ remapTo: 9 }))).toEqual(on(60, 100, 9));
		expect(
			transform(
				{ type: 'controlChange', channel: 1, controller: 7, value: 3 },
				route({ remapTo: 0 })
			)
		).toEqual({ type: 'controlChange', channel: 0, controller: 7, value: 3 });
		expect(transform(on(60, 100, 2), route({ channels: [0, 1] }))).toBeNull();
		expect(transform(on(60, 100, 1), route({ channels: [0, 1] }))).toEqual(on(60, 100, 1));
	});

	it('splits a keyboard by key range, before transposition', () => {
		const lower = route({ noteRange: [0, 59], transpose: 12 });
		expect(transform(on(59), lower)).toEqual(on(71));
		expect(transform(on(60), lower)).toBeNull();
	});

	it('scales Note On velocity, saturating so an on never becomes an off', () => {
		expect(transform(on(60, 100), route({ velocityScale: 0.5 }))).toEqual(on(60, 50));
		expect(transform(on(60, 100), route({ velocityScale: 2 }))).toEqual(on(60, 127));
		expect(transform(on(60, 100), route({ velocityScale: 0 }))).toEqual(on(60, 1));
		expect(
			transform(
				{ type: 'noteOff', channel: 0, note: 60, velocity: 64 },
				route({ velocityScale: 2 })
			)
		).toEqual({ type: 'noteOff', channel: 0, note: 60, velocity: 64 });
	});

	it('passes system messages through unchanged when their filter allows', () => {
		const all: MessageFilters = { ...DEFAULT_FILTERS, clock: true, system: true };
		expect(transform({ type: 'clock' }, route({ pass: all }))).toEqual({ type: 'clock' });
		expect(transform({ type: 'clock' }, route())).toBeNull();
	});

	it('refuses an invalid route instead of producing invalid messages', () => {
		expect(() => transform(on(60), route({ remapTo: 16 }))).toThrow(MidiRangeError);
		expect(() => transform(on(60), route({ channels: [0, 16] }))).toThrow(/channels\[1\]/);
		expect(() => transform(on(60), route({ transpose: 0.5 }))).toThrow(MidiRangeError);
		expect(() => transform(on(60), route({ velocityScale: -1 }))).toThrow(MidiRangeError);
		expect(() => transform(on(60), route({ velocityScale: Number.NaN }))).toThrow(MidiRangeError);
		expect(() => transform(on(60), route({ noteRange: [60, 59] }))).toThrow(/noteRange\[1\]/);
		expect(() => transform(on(60), route({ noteRange: [-1, 59] }))).toThrow(/noteRange\[0\]/);
		expect(() => assertValidTransform(IDENTITY_TRANSFORM)).not.toThrow();
	});
});

describe('passes', () => {
	const none: MessageFilters = {
		notes: false,
		cc: false,
		pitchBend: false,
		aftertouch: false,
		program: false,
		clock: false,
		sysex: false,
		system: false
	};
	const cases: Array<[MidiMessage, keyof MessageFilters]> = [
		[on(60), 'notes'],
		[{ type: 'noteOff', channel: 0, note: 60, velocity: 0 }, 'notes'],
		[{ type: 'controlChange', channel: 0, controller: 1, value: 1 }, 'cc'],
		[{ type: 'pitchBend', channel: 0, value: 0 }, 'pitchBend'],
		[{ type: 'channelAftertouch', channel: 0, pressure: 1 }, 'aftertouch'],
		[{ type: 'polyAftertouch', channel: 0, note: 1, pressure: 1 }, 'aftertouch'],
		[{ type: 'programChange', channel: 0, program: 1 }, 'program'],
		[{ type: 'clock' }, 'clock'],
		[{ type: 'start' }, 'clock'],
		[{ type: 'stop' }, 'clock'],
		[{ type: 'continue' }, 'clock'],
		[{ type: 'songPosition', beats: 0 }, 'clock'],
		[{ type: 'mtcQuarterFrame', messageType: 0, value: 0 }, 'clock'],
		[{ type: 'sysex', data: [0x7d] }, 'sysex'],
		[{ type: 'songSelect', song: 0 }, 'system'],
		[{ type: 'tuneRequest' }, 'system'],
		[{ type: 'activeSensing' }, 'system'],
		[{ type: 'reset' }, 'system']
	];

	for (const [msg, filter] of cases) {
		it(`lets ${msg.type} through only when ${filter} is on`, () => {
			expect(passes(msg, none)).toBe(false);
			expect(passes(msg, { ...none, [filter]: true })).toBe(true);
		});
	}

	it('never lets unknown bytes through', () => {
		const all = Object.fromEntries(
			Object.keys(none).map((k) => [k, true])
		) as unknown as MessageFilters;
		expect(passes({ type: 'unknown', bytes: [0xf4] }, all)).toBe(false);
	});

	it('blocks clock, SysEx and System Reset by default', () => {
		expect(passes({ type: 'clock' }, DEFAULT_FILTERS)).toBe(false);
		expect(passes({ type: 'sysex', data: [0x7d] }, DEFAULT_FILTERS)).toBe(false);
		expect(passes({ type: 'reset' }, DEFAULT_FILTERS)).toBe(false);
		expect(passes(on(60), DEFAULT_FILTERS)).toBe(true);
	});
});
