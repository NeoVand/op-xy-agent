/**
 * The bridge's bookkeeping, in plain TypeScript so the reactive `bridge.svelte.ts` keeps it out of
 * its state (the same split as `device/emitter.ts`): which notes the replica keyboard holds on the
 * device, which notes a sender is sounding on which channels, and which controls someone holds.
 * None of it is rendered; the bridge turns changes into replica LEDs and key presses.
 */
import type { KeyboardKeyId } from '$lib/core/opxy';
import type { PressableId } from '$lib/replica';

/** A note the replica keyboard started: what to turn off, whatever the channel setting is by then. */
export interface HeldNote {
	/** Wire channel 0–15. */
	readonly channel: number;
	readonly note: number;
}

/** The replica keyboard's notes on the device, by key. */
export class KeyNotes {
	readonly #notes = new Map<KeyboardKeyId, HeldNote>();

	/** How many notes are held. */
	get size(): number {
		return this.#notes.size;
	}

	/** Records that `key` started `note`. */
	set(key: KeyboardKeyId, note: HeldNote): void {
		this.#notes.set(key, note);
	}

	/** Removes and returns the note `key` started, if any. */
	take(key: KeyboardKeyId): HeldNote | undefined {
		const note = this.#notes.get(key);
		this.#notes.delete(key);
		return note;
	}

	/** The keys holding notes, in the order they started. */
	keys(): KeyboardKeyId[] {
		return [...this.#notes.keys()];
	}

	/** Forgets every note (the device went away, so nothing can be released). */
	clear(): void {
		this.#notes.clear();
	}
}

/**
 * Notes one sender (the device, or the app's other senders) is sounding, per channel, plus which of
 * those notes the bridge put on the replica (`mark`), so it only ever undoes its own changes.
 */
export class SoundingNotes {
	/** `channel * 128 + note`. */
	readonly #codes = new Set<number>();
	readonly #marked = new Set<number>();

	/**
	 * A note went on or off on a channel. Returns true when that changed whether the note sounds on
	 * any channel (it just started, or just stopped everywhere).
	 */
	set(channel: number, note: number, on: boolean): boolean {
		const before = this.sounds(note);
		const code = channel * 128 + note;
		if (on) this.#codes.add(code);
		else this.#codes.delete(code);
		return this.sounds(note) !== before;
	}

	/** True when any channel sounds `note`. */
	sounds(note: number): boolean {
		for (const code of this.#codes) if ((code & 0x7f) === note) return true;
		return false;
	}

	/** Forgets every note of a channel (All Notes Off); returns the notes that stopped everywhere. */
	silence(channel: number): number[] {
		const stopped: number[] = [];
		for (const code of [...this.#codes]) {
			if (code >> 7 !== channel) continue;
			this.#codes.delete(code);
			if (!this.sounds(code & 0x7f)) stopped.push(code & 0x7f);
		}
		return stopped;
	}

	/** Remembers that the bridge showed `note` on the replica. */
	mark(note: number): void {
		this.#marked.add(note);
	}

	/** Forgets the mark; returns whether there was one (so the bridge knows to undo it). */
	unmark(note: number): boolean {
		return this.#marked.delete(note);
	}

	/** Forgets every note; returns the marked notes, whose display the bridge must undo. */
	clear(): number[] {
		const marked = [...this.#marked];
		this.#codes.clear();
		this.#marked.clear();
		return marked;
	}
}

/** Controls someone holds on the replica, as its press and release events report them. */
export class HeldControls {
	readonly #held = new Set<PressableId>();

	press(id: PressableId): void {
		this.#held.add(id);
	}

	release(id: PressableId): void {
		this.#held.delete(id);
	}

	/**
	 * The held controls other than `id`, in the order they went down. `isDown` drops any that came
	 * up without an event (released by a teaching animation, say).
	 */
	others(id: PressableId, isDown: (id: PressableId) => boolean): PressableId[] {
		return [...this.#held].filter((other) => other !== id && isDown(other));
	}

	clear(): void {
		this.#held.clear();
	}
}
