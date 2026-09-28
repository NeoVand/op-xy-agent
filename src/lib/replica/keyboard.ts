/**
 * The computer keyboard as the OP-XY's: its 24 keys laid over two rows in piano geometry, so a
 * tune or a chord is played with both hands instead of the mouse.
 *
 * - The Z row plays the lower twelve keys, F3 to E4, with their black keys on the row above in the
 *   gaps (S D F, H J); the Q row plays the upper twelve, F4 to E5, black keys on the digits (2 3 4,
 *   6 7).
 * - `-` and `=` are [-] and [+] (the keyboard's octave); Space is play, or stop while the
 *   transport runs.
 * - With shift held (the computer's Shift is the OP-XY's, see `modifiers.ts`), the digits 1–9 and 0
 *   are the black keys printed with those numbers, for choosing scenes as on the device.
 *
 * Keys are found by position (`KeyboardEvent.code`), so the geometry holds on any layout. Typing in
 * a text field and ⌘, Ctrl or Alt shortcuts pass through untouched. Plain logic on a
 * {@link ReplicaState}, fed by `Replica.svelte`, so it is tested without a DOM.
 */
import { KEYBOARD_NOTE_NAMES, type KeyId, type KeyboardNoteName } from '$lib/core/opxy';
import type { ReplicaState } from './state.svelte';

/** The key under each note position: the Z row and its gaps, then the Q row and the digits. */
export const NOTE_CODES: Readonly<Record<string, KeyboardNoteName>> = {
	KeyZ: 'f3',
	KeyS: 'fs3',
	KeyX: 'g3',
	KeyD: 'gs3',
	KeyC: 'a3',
	KeyF: 'as3',
	KeyV: 'b3',
	KeyB: 'c4',
	KeyH: 'cs4',
	KeyN: 'd4',
	KeyJ: 'ds4',
	KeyM: 'e4',
	KeyQ: 'f4',
	Digit2: 'fs4',
	KeyW: 'g4',
	Digit3: 'gs4',
	KeyE: 'a4',
	Digit4: 'as4',
	KeyR: 'b4',
	KeyT: 'c5',
	Digit6: 'cs5',
	KeyY: 'd5',
	Digit7: 'ds5',
	KeyU: 'e5'
};

/** The black keys in the order the device numbers them, 1–9 then 0. */
const NUMBERED = KEYBOARD_NOTE_NAMES.filter((name) => name.includes('s'));

/** With shift, digit `n` is the black key printed `n`. */
const DIGIT_CODES: Readonly<Record<string, KeyboardNoteName>> = Object.fromEntries(
	NUMBERED.map((note, i) => [`Digit${(i + 1) % 10}`, note])
);

/** Keys that are not notes. */
const OTHER_CODES: Readonly<Record<string, KeyId>> = {
	Minus: 'key.minus',
	Equal: 'key.plus'
};

/** How each code is written for people. */
const LABELS: Readonly<Record<string, string>> = { Minus: '-', Equal: '=', Space: 'Space' };
const labelOf = (code: string) => LABELS[code] ?? code.replace(/^(Key|Digit)/, '');

/**
 * The computer keys that press each replica key, in the form of `aria-keyshortcuts` ("Z",
 * "S Shift+1"), for the keys and for hints.
 */
export const COMPUTER_KEYS: Readonly<Partial<Record<KeyId, string>>> = (() => {
	const keys: Partial<Record<KeyId, string[]>> = {};
	const add = (id: KeyId, shortcut: string) => (keys[id] ??= []).push(shortcut);
	for (const [code, note] of Object.entries(NOTE_CODES)) add(`keyboard.${note}`, labelOf(code));
	for (const [code, note] of Object.entries(DIGIT_CODES)) {
		add(`keyboard.${note}`, `Shift+${labelOf(code)}`);
	}
	for (const [code, id] of Object.entries(OTHER_CODES)) add(id, labelOf(code));
	add('key.play', 'Space');
	add('key.stop', 'Space');
	return Object.fromEntries(
		Object.entries(keys).map(([id, shortcuts]) => [id, shortcuts.join(' ')])
	) as Partial<Record<KeyId, string>>;
})();

/** The key facts {@link ComputerKeys} needs from a keyboard event. */
export interface ComputerKeyEvent {
	/** The key's position (`KeyZ`, `Digit2`, `Space`, …). */
	readonly code: string;
	readonly repeat: boolean;
	/** True when the event is typing (see `isTyping`). */
	readonly typing: boolean;
	/** ⌘, Ctrl or Alt is held: a shortcut for the browser or the system. */
	readonly command: boolean;
	/**
	 * Nothing that takes Space itself has focus (a focused key, button or encoder presses itself on
	 * Space), so Space may be play and stop.
	 */
	readonly free: boolean;
}

/** What {@link ComputerKeys} needs from its host. */
export interface ComputerKeysOptions {
	/** Whether the transport runs, so Space knows whether to play or stop. */
	readonly playing?: () => boolean;
}

/** Follows the computer's keys onto a replica's keys. */
export class ComputerKeys {
	readonly #replica: () => ReplicaState;
	readonly #playing: () => boolean;
	/** The replica key each held computer key pressed, by code. */
	readonly #down = new Map<string, KeyId>();

	constructor(replica: () => ReplicaState, options: ComputerKeysOptions = {}) {
		this.#replica = replica;
		this.#playing = options.playing ?? (() => false);
	}

	/** The replica keys held from the computer's keyboard. */
	get held(): KeyId[] {
		return [...this.#down.values()];
	}

	/**
	 * A key went down: presses the replica key it stands for. True when the event was taken (the
	 * caller then prevents the browser's default, such as Space scrolling the page).
	 */
	keydown(event: ComputerKeyEvent): boolean {
		if (event.typing || event.command) return false;
		if (this.#down.has(event.code)) return true;
		const id = this.#target(event);
		if (!id) return false;
		// a key held before the page had focus still starts nothing on its auto-repeat
		if (event.repeat) return true;
		this.#down.set(event.code, id);
		this.#replica().press(id, 'keyboard');
		return true;
	}

	/** A key came up: lets go of the replica key it pressed. True when it had pressed one. */
	keyup(event: Pick<ComputerKeyEvent, 'code'>): boolean {
		const id = this.#down.get(event.code);
		if (!id) return false;
		this.#down.delete(event.code);
		this.#replica().release(id, 'keyboard');
		return true;
	}

	/** Lets go of every key (the window lost focus: their key-ups would never come here). */
	releaseAll(): void {
		for (const code of [...this.#down.keys()]) this.keyup({ code });
	}

	#target(event: ComputerKeyEvent): KeyId | null {
		const { code } = event;
		if (code === 'Space') {
			if (!event.free) return null;
			return this.#playing() ? 'key.stop' : 'key.play';
		}
		const numbered = this.#replica().shift ? DIGIT_CODES[code] : undefined;
		const note = numbered ?? NOTE_CODES[code];
		if (note) return `keyboard.${note}`;
		return OTHER_CODES[code] ?? null;
	}
}
