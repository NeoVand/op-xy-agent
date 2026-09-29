import { describe, expect, it } from 'vitest';
import { KEYBOARD_NOTE_NAMES } from '$lib/core/opxy';
import { COMPUTER_KEYS, ComputerKeys, NOTE_CODES, type ComputerKeyEvent } from './keyboard';
import { ReplicaState, type ReplicaEvent } from './state.svelte';

function setup(playing = false) {
	const replica = new ReplicaState();
	const events: string[] = [];
	replica.subscribe((event: ReplicaEvent) => events.push(`${event.type} ${event.id}`));
	const transport = { playing };
	const keys = new ComputerKeys(() => replica, { playing: () => transport.playing });
	return { replica, events, keys, transport };
}

const down = (code: string, extra: Partial<ComputerKeyEvent> = {}): ComputerKeyEvent => ({
	code,
	repeat: false,
	typing: false,
	command: false,
	free: true,
	...extra
});

describe('the computer keyboard as the OP-XY’s keys', () => {
	it('lays all 24 keys over two rows in piano geometry, each key once', () => {
		expect(Object.values(NOTE_CODES).sort()).toEqual([...KEYBOARD_NOTE_NAMES].sort());
		// the lower row runs F3…E4 with its black keys above, the upper F4…E5
		const row = (codes: string[]) => codes.map((code) => NOTE_CODES[code]);
		expect(row(['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM'])).toEqual([
			'f3',
			'g3',
			'a3',
			'b3',
			'c4',
			'd4',
			'e4'
		]);
		expect(row(['KeyS', 'KeyD', 'KeyF', 'KeyH', 'KeyJ'])).toEqual([
			'fs3',
			'gs3',
			'as3',
			'cs4',
			'ds4'
		]);
		expect(row(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU'])).toEqual([
			'f4',
			'g4',
			'a4',
			'b4',
			'c5',
			'd5',
			'e5'
		]);
		expect(row(['Digit2', 'Digit3', 'Digit4', 'Digit6', 'Digit7'])).toEqual([
			'fs4',
			'gs4',
			'as4',
			'cs5',
			'ds5'
		]);
	});

	it('holds a key for as long as the computer key is down, chords included', () => {
		const { replica, events, keys } = setup();
		expect(keys.keydown(down('KeyB'))).toBe(true);
		expect(keys.keydown(down('KeyM'))).toBe(true);
		expect(keys.keydown(down('KeyB', { repeat: true }))).toBe(true); // auto-repeat: still held
		expect(replica.isPressed('keyboard.c4')).toBe(true);
		expect(replica.isPressed('keyboard.e4')).toBe(true);
		expect(keys.keyup({ code: 'KeyB' })).toBe(true);
		expect(keys.keyup({ code: 'KeyB' })).toBe(false);
		keys.releaseAll();
		expect(replica.pressed).toEqual([]);
		expect(events).toEqual([
			'press keyboard.c4',
			'press keyboard.e4',
			'release keyboard.c4',
			'release keyboard.e4'
		]);
	});

	it('leaves typing and shortcuts alone', () => {
		const { replica, keys } = setup();
		expect(keys.keydown(down('KeyZ', { typing: true }))).toBe(false);
		expect(keys.keydown(down('KeyC', { command: true }))).toBe(false);
		expect(keys.keydown(down('KeyA'))).toBe(false);
		expect(keys.keydown(down('Digit5'))).toBe(false);
		expect(replica.pressed).toEqual([]);
	});

	it('plays with Space, stops with it while the transport runs, and leaves a focused control its Space', () => {
		const { events, keys, transport } = setup();
		keys.keydown(down('Space'));
		keys.keyup({ code: 'Space' });
		transport.playing = true;
		keys.keydown(down('Space'));
		keys.keyup({ code: 'Space' });
		expect(keys.keydown(down('Space', { free: false }))).toBe(false);
		expect(events).toEqual([
			'press key.play',
			'release key.play',
			'press key.stop',
			'release key.stop'
		]);
	});

	it('makes - and = the octave keys', () => {
		const { events, keys } = setup();
		keys.keydown(down('Minus'));
		keys.keyup({ code: 'Minus' });
		keys.keydown(down('Equal'));
		keys.keyup({ code: 'Equal' });
		expect(events).toEqual([
			'press key.minus',
			'release key.minus',
			'press key.plus',
			'release key.plus'
		]);
	});

	it('turns the digits into the numbered black keys while shift is held, for scenes', () => {
		const { replica, events, keys } = setup();
		replica.press('key.shift', 'keyboard');
		keys.keydown(down('Digit3')); // black key 3: A♯3
		keys.keydown(down('Digit0')); // black key 0: D♯5
		keys.keydown(down('KeyZ')); // letters stay where they are
		replica.release('key.shift', 'keyboard');
		// the key that went down comes up, whatever shift does meanwhile
		keys.keyup({ code: 'Digit3' });
		expect(events.slice(1)).toEqual([
			'press keyboard.as3',
			'press keyboard.ds5',
			'press keyboard.f3',
			'release key.shift',
			'release keyboard.as3'
		]);
		// without shift, 2 is the upper row's F♯
		keys.keydown(down('Digit2'));
		expect(replica.isPressed('keyboard.fs4')).toBe(true);
	});

	it('lets a key typed into a field go to the field, shift or not', () => {
		const { replica, keys } = setup();
		replica.press('key.shift', 'keyboard');
		expect(keys.keydown(down('Digit3', { typing: true }))).toBe(false);
		expect(keys.keydown(down('KeyB', { typing: true }))).toBe(false);
		expect(keys.keyup({ code: 'Digit3' })).toBe(false);
		expect(replica.pressed).toEqual(['key.shift']);
	});

	it('names each key’s computer keys for aria-keyshortcuts and hints', () => {
		expect(COMPUTER_KEYS['keyboard.f3']).toBe('Z');
		expect(COMPUTER_KEYS['keyboard.fs3']).toBe('S Shift+1');
		expect(COMPUTER_KEYS['keyboard.fs4']).toBe('2 Shift+6');
		expect(COMPUTER_KEYS['keyboard.ds5']).toBe('7 Shift+0');
		expect(COMPUTER_KEYS['key.minus']).toBe('-');
		expect(COMPUTER_KEYS['key.play']).toBe('Space');
		expect(COMPUTER_KEYS['key.m1']).toBeUndefined();
	});
});
