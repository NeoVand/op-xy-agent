import { describe, expect, it } from 'vitest';
import { HeldControls, KeyNotes, SoundingNotes } from './ledger';

describe('SoundingNotes', () => {
	it('tracks a note across channels and says when it starts and stops everywhere', () => {
		const notes = new SoundingNotes();
		expect(notes.set(0, 60, true)).toBe(true);
		expect(notes.set(2, 60, true)).toBe(false);
		expect(notes.sounds(60)).toBe(true);
		expect(notes.set(0, 60, false)).toBe(false);
		expect(notes.set(2, 60, false)).toBe(true);
		expect(notes.sounds(60)).toBe(false);
		expect(notes.set(5, 61, false)).toBe(false);
	});

	it('silences one channel and reports only the notes that stopped everywhere', () => {
		const notes = new SoundingNotes();
		notes.set(3, 60, true);
		notes.set(3, 64, true);
		notes.set(4, 64, true);
		expect(notes.silence(3)).toEqual([60]);
		expect(notes.sounds(64)).toBe(true);
		expect(notes.silence(9)).toEqual([]);
	});

	it('remembers what the bridge marked until it is undone or cleared', () => {
		const notes = new SoundingNotes();
		notes.set(0, 60, true);
		notes.mark(60);
		notes.mark(62);
		expect(notes.unmark(60)).toBe(true);
		expect(notes.unmark(60)).toBe(false);
		expect(notes.clear()).toEqual([62]);
		expect(notes.sounds(60)).toBe(false);
		expect(notes.clear()).toEqual([]);
	});
});

describe('KeyNotes and HeldControls', () => {
	it('hands each held note back once', () => {
		const notes = new KeyNotes();
		notes.set('keyboard.c4', { channel: 0, note: 60 });
		notes.set('keyboard.e4', { channel: 4, note: 64 });
		expect(notes.keys()).toEqual(['keyboard.c4', 'keyboard.e4']);
		expect(notes.take('keyboard.e4')).toEqual({ channel: 4, note: 64 });
		expect(notes.take('keyboard.e4')).toBeUndefined();
		expect(notes.size).toBe(1);
		notes.clear();
		expect(notes.size).toBe(0);
	});

	it('lists the other controls still down, in order', () => {
		const held = new HeldControls();
		held.press('key.shift');
		held.press('step.3');
		held.press('keyboard.c4');
		expect(held.others('keyboard.c4', () => true)).toEqual(['key.shift', 'step.3']);
		expect(held.others('keyboard.c4', (id) => id !== 'step.3')).toEqual(['key.shift']);
		held.release('key.shift');
		held.clear();
		expect(held.others('keyboard.c4', () => true)).toEqual([]);
	});
});
