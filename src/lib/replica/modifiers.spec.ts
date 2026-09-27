import { describe, expect, it } from 'vitest';
import { ComputerShift, isTyping } from './modifiers';
import { ReplicaState, type ReplicaEvent } from './state.svelte';

function setup() {
	const replica = new ReplicaState();
	const events: ReplicaEvent[] = [];
	replica.subscribe((event) => events.push(event));
	return { replica, events, shift: new ComputerShift(() => replica) };
}

const key = (code = 'ShiftLeft', typing = false, repeat = false) => ({
	key: 'Shift',
	code,
	repeat,
	typing
});

describe('the computer’s Shift as the OP-XY’s shift', () => {
	it('holds the replica’s shift while Shift is down, so a click is shift + key', () => {
		const { replica, events, shift } = setup();
		shift.keydown(key());
		shift.keydown(key('ShiftLeft', false, true)); // auto-repeat changes nothing
		expect(replica.isPressed('key.shift')).toBe(true);
		replica.press('key.m1', 'pointer');
		expect(replica.isPressed('key.shift')).toBe(true);
		shift.keyup(key());
		expect(replica.isPressed('key.shift')).toBe(false);
		expect(events.map((e) => `${e.type} ${'id' in e ? e.id : ''}`)).toEqual([
			'press key.shift',
			'press key.m1',
			'release key.shift'
		]);
	});

	it('keeps shift down until both Shift keys are up', () => {
		const { replica, shift } = setup();
		shift.keydown(key('ShiftLeft'));
		shift.keydown(key('ShiftRight'));
		shift.keyup(key('ShiftLeft'));
		expect(replica.isPressed('key.shift')).toBe(true);
		shift.keyup(key('ShiftRight'));
		expect(replica.isPressed('key.shift')).toBe(false);
	});

	it('leaves Shift to the text while typing, then catches it on a click', () => {
		const { replica, shift } = setup();
		shift.keydown(key('ShiftLeft', true));
		expect(replica.isPressed('key.shift')).toBe(false);
		// the pointer goes down on the replica with Shift still held
		shift.pointerdown(true);
		expect(replica.isPressed('key.shift')).toBe(true);
		shift.keyup(key('ShiftLeft'));
		expect(replica.isPressed('key.shift')).toBe(false);
		shift.pointerdown(false);
		expect(replica.isPressed('key.shift')).toBe(false);
	});

	it('does not let a Shift released after typing lift the other Shift', () => {
		const { replica, shift } = setup();
		shift.keydown(key('ShiftLeft', true));
		shift.keydown(key('ShiftRight'));
		shift.keyup(key('ShiftLeft'));
		expect(replica.isPressed('key.shift')).toBe(true);
	});

	it('lets go when the window loses focus', () => {
		const { replica, shift } = setup();
		shift.keydown(key());
		shift.releaseAll();
		expect(replica.isPressed('key.shift')).toBe(false);
		expect(shift.holding).toBe(false);
	});

	it('ignores other keys and a replica shift it did not press', () => {
		const { replica, shift } = setup();
		shift.keydown({ key: 'a', code: 'KeyA', repeat: false, typing: false });
		expect(replica.isPressed('key.shift')).toBe(false);
		replica.press('key.shift', 'pointer');
		shift.keyup(key());
		expect(replica.isPressed('key.shift')).toBe(true);
	});

	it('treats anything but a DOM text field as not typing (no DOM here)', () => {
		expect(isTyping(null)).toBe(false);
		expect(isTyping({} as EventTarget)).toBe(false);
	});
});
