/**
 * The user's own presses on the replica since the agent last answered, by the keys' names, for the
 * next message: an agent asked "I pressed some buttons and the screen looks different, where am
 * I?" could say where, not what had been pressed. A key pressed while others are held reads as the
 * device's combo ("shift + M1", "step 5 + turn E1"), a key held a while as "hold M1", turns of one
 * encoder in a row as one entry with their detents ("turn E2 +5"); the last {@link PRESS_LOG_LIMIT}.
 */
import { getControl, type ControlId } from '$lib/core/opxy';
import type { ReplicaEvent } from '$lib/replica';

/** Entries kept. */
export const PRESS_LOG_LIMIT = 12;

/** How long a press lasts before it reads as a hold (the device's long press, about 0.8 s). */
const HOLD_MS = 800;

interface Entry {
	/** The keys, as the key grammar writes them. */
	text: string;
	/** For a turn: its detents so far, signed. */
	detents?: number;
}

/** A control's name in the key grammar ("T3", "step 5", "E1"), or null. */
function nameOf(id: string): string | null {
	try {
		const control = getControl(id as ControlId);
		return control.token ?? control.label;
	} catch {
		return null;
	}
}

export class PressLog {
	#entries: Entry[] = [];
	/** The keys held now, in the order they went down, with when. */
	#held: { name: string; at: number }[] = [];

	/** Takes an event the replica reports; only the user's own (pointer, computer keyboard). */
	add(event: ReplicaEvent, now: number): void {
		if (event.source !== 'pointer' && event.source !== 'keyboard') return;
		const name = nameOf(event.id);
		if (!name) return;
		const held = this.#held.filter((h) => h.name !== name).map((h) => h.name);
		const withHeld = (text: string) => (held.length ? `${held.join(' + ')} + ${text}` : text);
		// the keys held, logged alone a moment ago, are where a combo starts: the entry becomes it
		const combo = (entry: Entry) => {
			const last = this.#entries.at(-1);
			if (held.length > 0 && last?.text === held.join(' + ') && last.detents === undefined) {
				this.#entries[this.#entries.length - 1] = entry;
			} else this.#push(entry);
		};
		switch (event.type) {
			case 'press': {
				combo({ text: withHeld(name) });
				this.#held = [...this.#held.filter((h) => h.name !== name), { name, at: now }];
				return;
			}
			case 'release': {
				const down = this.#held.find((h) => h.name === name);
				this.#held = this.#held.filter((h) => h.name !== name);
				const last = this.#entries.at(-1);
				if (down && now - down.at >= HOLD_MS && last?.text === name) last.text = `hold ${name}`;
				return;
			}
			case 'turn': {
				const text = withHeld(`turn ${name}`);
				const last = this.#entries.at(-1);
				if (last && last.text === text && last.detents !== undefined) last.detents += event.delta;
				else combo({ text, detents: event.delta });
				return;
			}
			case 'click':
				combo({ text: withHeld(`click ${name}`) });
				return;
			default:
				return;
		}
	}

	/** The presses so far, oldest first ("arrange", "T3", "turn E2 +5"). */
	list(): string[] {
		return this.#entries.map((e) =>
			e.detents === undefined ? e.text : `${e.text} ${e.detents > 0 ? '+' : ''}${e.detents}`
		);
	}

	/** Starts over (the agent has answered: what comes next is new). Keys still held stay held. */
	clear(): void {
		this.#entries = [];
	}

	#push(entry: Entry): void {
		this.#entries.push(entry);
		if (this.#entries.length > PRESS_LOG_LIMIT) this.#entries.shift();
	}
}
