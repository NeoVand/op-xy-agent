/**
 * What the keys being played make, for the caption line under the replica: a chord's name ("Dm7")
 * with what it is and its notes, two notes and their interval, one note, or on a drum track the
 * sounds on the keys ("kick 1 + closed hat 2"). It follows the replica's keyboard keys whoever
 * presses them (a pointer, the computer keyboard, a demonstration, the connected OP-XY), names notes the way
 * the lit scale spells them, and stays a moment after the keys are let go.
 */
import { chordName } from '$lib/core/music/harmony';
import { intervalName, noteName } from '$lib/core/midi/notes';
import type { ReplicaState } from '$lib/replica';
import { isDrumTrack, keyboardIndex, keyNote } from '$lib/sim/areas/sequencer/model';
import type { SimState } from '$lib/sim/params';
import { soundName } from './virtual';

/** What the caption says about the keys being played. */
export interface PlayReading {
	/** "Dm7", "C4 G4", "F#3", "kick 1 + closed hat 2". */
	readonly name: string;
	/** "minor seventh · D F A C", "perfect fifth", or empty. */
	readonly detail: string;
}

export interface PlayReadoutOptions {
	readonly replica: ReplicaState;
	/** The replica's simulator state (the track, its octave, a drum track's kit). */
	readonly sim: () => SimState;
	readonly timers: {
		setTimeout(fn: () => void, ms: number): unknown;
		clearTimeout(handle: unknown): void;
	};
	/** Whether to spell black keys as flats (the lit scale's key); sharps otherwise. */
	readonly flats?: () => boolean;
	/** How long the last reading stays after the keys are let go, ms. */
	readonly linger?: number;
}

/** How long after a key comes up the readout waits for the rest of a chord's keys, ms. */
const SETTLE_MS = 200;

const ascii = (text: string) => text.replace(/♯/g, '#').replace(/♭/g, 'b');
/** The items once each, in their first order. */
const unique = <T>(items: readonly T[]) => items.filter((item, i) => items.indexOf(item) === i);

/** The reading of keyboard keys `held` (0–23, in the order pressed), or null for none. */
export function readKeys(s: SimState, held: readonly number[], flats = false): PlayReading | null {
	if (held.length === 0) return null;
	// with shift or bar held the keys are functions (octave, track scale…), not notes
	if (s.held.includes('key.shift') || s.held.includes('key.bar')) return null;
	if (isDrumTrack(s)) {
		const kit = s.areas.sample.tracks[s.track]?.keys ?? [];
		const sounds = unique(held.map((i) => kit[i]?.name).filter((n): n is string => !!n));
		return sounds.length ? { name: sounds.map(soundName).join(' + '), detail: '' } : null;
	}
	const notes = unique(held.map((i) => keyNote(s, i))).sort((a, b) => a - b);
	const name = (note: number, octave = true) => noteName(note, { flats, ascii: true, octave });
	if (notes.length === 1) return { name: name(notes[0]), detail: '' };
	if (notes.length === 2) {
		return {
			name: `${name(notes[0])} ${name(notes[1])}`,
			detail: intervalName(notes[1] - notes[0])
		};
	}
	const tones = unique(notes.map((n) => name(n, false))).join(' ');
	const chord = chordName(notes, flats);
	if (!chord) return { name: tones, detail: '' };
	return { name: ascii(chord.name), detail: `${chord.spoken} · ${tones}` };
}

export class PlayReadout {
	/** What the keys make, while they are held and a moment after. */
	reading = $state.raw<PlayReading | null>(null);

	readonly #replica: ReplicaState;
	readonly #sim: () => SimState;
	readonly #timers: PlayReadoutOptions['timers'];
	readonly #flats: () => boolean;
	readonly #linger: number;
	/** Keyboard keys held, in the order pressed. */
	#held: number[] = [];
	/** The pending settle after a release, or the linger before the reading goes. */
	#timer: unknown = null;

	constructor(options: PlayReadoutOptions) {
		this.#replica = options.replica;
		this.#sim = options.sim;
		this.#timers = options.timers;
		this.#flats = options.flats ?? (() => false);
		this.#linger = options.linger ?? 1500;
	}

	/** Follows the replica's keyboard. Returns `stop`. */
	start(): () => void {
		// every source: a pointer, the computer keyboard, a demonstration, the OP-XY mirrored
		const off = this.#replica.observe((event) => {
			if (!event.id.startsWith('keyboard.')) return;
			const index = keyboardIndex(event.id.slice('keyboard.'.length));
			if (index < 0) return;
			if (event.type === 'press') {
				this.#held = [...this.#held.filter((i) => i !== index), index];
				this.#clearTimer();
				const next = readKeys(this.#sim(), this.#held, this.#flats());
				if (next) this.reading = next;
			} else if (event.type === 'release') {
				this.#held = this.#held.filter((i) => i !== index);
				// a chord's keys come up one after another: read what stays once they have
				this.#clearTimer();
				this.#timer = this.#timers.setTimeout(() => this.#settle(), SETTLE_MS);
			}
		});
		return () => {
			off();
			this.#clearTimer();
			this.#held = [];
			this.reading = null;
		};
	}

	/** After the keys stopped coming up: the keys still held, or the last reading for a moment. */
	#settle(): void {
		this.#timer = null;
		if (this.#held.length > 0) {
			const next = readKeys(this.#sim(), this.#held, this.#flats());
			if (next) this.reading = next;
			return;
		}
		this.#timer = this.#timers.setTimeout(() => {
			this.#timer = null;
			this.reading = null;
		}, this.#linger);
	}

	#clearTimer(): void {
		if (this.#timer === null) return;
		this.#timers.clearTimeout(this.#timer);
		this.#timer = null;
	}
}
