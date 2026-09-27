/**
 * The computer's Shift key as the OP-XY's `shift`: held down on the keyboard, it holds the
 * replica's shift key, so a mouse click on M1 is `shift + M1` and a drag on an encoder is
 * `shift + turn`, the way two hands work the device. Typing in a text field (the chat, a key
 * field) keeps Shift for capitals.
 *
 * `Replica.svelte` feeds it window key events, a capturing pointer-down and focus loss. Plain
 * logic on a {@link ReplicaState}, so it is tested without a DOM.
 */
import type { ReplicaState } from './state.svelte';

/** Input types where Shift is for typing rather than for the replica. */
const TEXT_INPUTS = new Set([
	'text',
	'search',
	'email',
	'url',
	'tel',
	'password',
	'number',
	'date',
	'datetime-local',
	'month',
	'time',
	'week'
]);

/** Whether key events aimed at `target` are typing (a text field, a select, editable content). */
export function isTyping(target: EventTarget | null): boolean {
	if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
	return target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type);
}

/** The key facts {@link ComputerShift} needs from a keyboard event. */
export interface ShiftKeyEvent {
	readonly key: string;
	/** `ShiftLeft` or `ShiftRight`: both can be down at once. */
	readonly code: string;
	readonly repeat: boolean;
	/** True when the event is typing (see {@link isTyping}). */
	readonly typing: boolean;
}

/** Follows the computer's Shift keys onto a replica's `key.shift`. */
export class ComputerShift {
	readonly #replica: () => ReplicaState;
	/** The Shift keys down that this follower answered (by `code`). */
	readonly #down = new Set<string>();

	constructor(replica: () => ReplicaState) {
		this.#replica = replica;
	}

	/** True while the computer's Shift holds the replica's shift. */
	get holding(): boolean {
		return this.#down.size > 0;
	}

	keydown(event: ShiftKeyEvent): void {
		if (event.key !== 'Shift' || event.repeat || event.typing) return;
		this.#hold(event.code || 'Shift');
	}

	keyup(event: Pick<ShiftKeyEvent, 'key' | 'code'>): void {
		if (event.key !== 'Shift' || !this.holding) return;
		this.#down.delete(event.code || 'Shift');
		// a Shift that went down while typing was taken up by a click as plain 'Shift'
		this.#down.delete('Shift');
		if (this.#down.size === 0) this.#replica().release('key.shift', 'keyboard');
	}

	/**
	 * A pointer going down on the replica with Shift held: catches a Shift pressed while typing,
	 * whose key-down was left alone, before the control underneath reacts.
	 */
	pointerdown(shiftKey: boolean): void {
		if (shiftKey && !this.holding) this.#hold('Shift');
	}

	/** The window lost focus: a Shift released elsewhere would never come up here. */
	releaseAll(): void {
		if (!this.holding) return;
		this.#down.clear();
		this.#replica().release('key.shift', 'keyboard');
	}

	#hold(code: string): void {
		const first = this.#down.size === 0;
		this.#down.add(code);
		if (first) this.#replica().press('key.shift', 'keyboard');
	}
}
