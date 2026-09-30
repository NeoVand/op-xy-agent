/**
 * A scale lit on the replica's keyboard: pick a root and a scale, and the keys that play its notes
 * show dim under their LEDs, the root with a faint ring, so anyone can play over a loop without a
 * wrong note. Only while a melodic track is selected (a drum track's keys are sounds, not notes);
 * the device's own lights always win (`ReplicaState.setGuide`). The choice is remembered in this
 * browser.
 */
import { KEYBOARD_NOTE_NAMES, type KeyId } from '$lib/core/opxy';
import { keySpelling } from '$lib/core/listen/harmony';
import type { GuideMark, ReplicaState } from '$lib/replica';
import { SCALES as MODES } from '$lib/sim/areas/auxiliary/state';
import { fixedKeys, KEYBOARD_BASE } from '$lib/sim/areas/sequencer/model';
import type { SimState } from '$lib/sim/params';

/** A scale the guide can light. */
export interface GuideScale {
	readonly name: string;
	/** Semitones above the root. */
	readonly steps: readonly number[];
	/** Semitones from the root up to the major key whose signature spells it (D dorian: C). */
	readonly parent: number;
}

const mode = (name: string) => MODES.find((m) => m.name === name)!.steps;

/** The brain's modes, most used first, then the scales people improvise with. */
export const GUIDE_SCALES: readonly GuideScale[] = [
	{ name: 'major', steps: mode('major'), parent: 0 },
	{ name: 'minor', steps: mode('minor'), parent: 3 },
	{ name: 'dorian', steps: mode('dorian'), parent: 10 },
	{ name: 'mixolydian', steps: mode('mixolydian'), parent: 5 },
	{ name: 'phrygian', steps: mode('phrygian'), parent: 8 },
	{ name: 'lydian', steps: mode('lydian'), parent: 7 },
	{ name: 'locrian', steps: mode('locrian'), parent: 1 },
	{ name: 'minor pentatonic', steps: [0, 3, 5, 7, 10], parent: 3 },
	{ name: 'major pentatonic', steps: [0, 2, 4, 7, 9], parent: 0 },
	{ name: 'blues', steps: [0, 3, 5, 6, 7, 10], parent: 3 }
];

/** The roots as a picker names them, C first. */
export const ROOT_NAMES = [
	'C',
	'C#',
	'D',
	'Eb',
	'E',
	'F',
	'F#',
	'G',
	'Ab',
	'A',
	'Bb',
	'B'
] as const;

const STORE = 'opxy.scale-guide';

/** The keyboard key (0–23) → its pitch class: the keys are fixed notes, F3 first. */
const pitchOf = (index: number) => (KEYBOARD_BASE + index) % 12;

/** Which keyboard keys a scale lights, and how (the root with a ring). */
export function scaleMarks(root: number, scale: GuideScale): Partial<Record<KeyId, GuideMark>> {
	const marks: Partial<Record<KeyId, GuideMark>> = {};
	KEYBOARD_NOTE_NAMES.forEach((name, index) => {
		const degree = (pitchOf(index) - root + 12) % 12;
		if (!scale.steps.includes(degree)) return;
		marks[`keyboard.${name}` as KeyId] = degree === 0 ? 'root' : 'note';
	});
	return marks;
}

export interface ScaleGuideOptions {
	readonly replica: ReplicaState;
	/** The replica's simulator state, read reactively (which track is selected). */
	readonly sim: () => SimState;
	/** Where the choice is kept; `localStorage` by default. */
	readonly storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

export class ScaleGuide {
	/** The root's pitch class, 0–11 (C … B). */
	root = $state(9);
	/** The scale lit, or null for none. */
	scale = $state.raw<GuideScale | null>(null);

	readonly #replica: ReplicaState;
	readonly #sim: () => SimState;
	readonly #storage: Pick<Storage, 'getItem' | 'setItem'> | null;

	constructor(options: ScaleGuideOptions) {
		this.#replica = options.replica;
		this.#sim = options.sim;
		this.#storage = options.storage === undefined ? browserStorage() : options.storage;
		this.#restore();
	}

	/** "A minor", or null while nothing is lit. */
	get label(): string | null {
		if (!this.scale) return null;
		return `${this.names[this.root]} ${this.scale.name}`;
	}

	/** The twelve pitch classes as this key's signature spells them (F minor: Db, Ab, not C#, G#). */
	get names(): readonly string[] {
		if (!this.scale) return ROOT_NAMES;
		return keySpelling((this.root + this.scale.parent) % 12, 'major');
	}

	/** Whether the lit key spells its black keys as flats (for naming what is played in it). */
	get flats(): boolean {
		return this.names[10] === 'Bb' && this.names[1] !== 'C#';
	}

	/** Lights `scale` from `root` (or turns the guide off with a null scale). */
	set(root: number, scale: GuideScale | null): void {
		this.root = ((Math.round(root) % 12) + 12) % 12;
		this.scale = scale;
		try {
			this.#storage?.setItem(
				STORE,
				JSON.stringify({ root: this.root, scale: scale?.name ?? null })
			);
		} catch {
			// private windows and blocked storage: the choice lasts until the page closes
		}
	}

	/** Keeps the keyboard lit while a melodic track is selected. Returns `stop`. */
	start(): () => void {
		const stop = $effect.root(() => {
			$effect(() => {
				const scale = this.scale;
				const lit = scale !== null && !fixedKeys(this.#sim());
				this.#replica.setGuide(lit ? scaleMarks(this.root, scale) : {});
			});
		});
		return () => {
			stop();
			this.#replica.setGuide({});
		};
	}

	#restore(): void {
		try {
			const saved = JSON.parse(this.#storage?.getItem(STORE) ?? 'null') as {
				root?: number;
				scale?: string | null;
			} | null;
			if (!saved) return;
			if (typeof saved.root === 'number') this.root = ((saved.root % 12) + 12) % 12;
			this.scale = GUIDE_SCALES.find((s) => s.name === saved.scale) ?? null;
		} catch {
			// a choice from an older version, or no storage: start with nothing lit
		}
	}
}

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}
