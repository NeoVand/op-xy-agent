// Adapted from MIDI Lab (NeoVand/midilab) src/lib/music/notation.ts

/**
 * A strict, readable notation for melodies, and a quantiser that puts them on a step grid such as
 * the OP-XY's 16 steps per bar.
 *
 * The alternative is arrays of `{ note: 76, start: 3.25, duration: 0.25 }`: a forty-note phrase
 * written that way is unreadable and unreviewable, and one mistyped start time silently shifts
 * everything after it. So melodies are written the way a musician dictates them, pitches in order
 * and durations only where they change, and the start times are computed. It is also the shape the
 * agent writes musical intent in, which is why every mistake is an error with a position rather
 * than a guess:
 *
 * ```
 * E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4/1.5 D4/.5 D4/2
 * ```
 *
 * A token is written in this order: pitch or pitches, `/duration`, `@velocity`, marks, `~`.
 *
 * | Token        | Means                                                              |
 * | ------------ | ------------------------------------------------------------------ |
 * | `C4`         | middle C (C4 = 60) for the current duration, one beat to start      |
 * | `F#5` `Eb3`  | accidentals, either spelling (`♯` and `♭` work too)                |
 * | `C4/0.5`     | half a beat. Durations are beats and persist until changed          |
 * | `_/2`        | two beats of silence                                                |
 * | `C4+E4+G4/2` | a chord: every note starts together and lasts as long               |
 * | `C4@96`      | velocity 96 (1–127), this token only                                |
 * | `C4>`        | accent: louder than its neighbours                                  |
 * | `C4-`        | ghost: much quieter than its neighbours                             |
 * | `C4.`        | staccato: sounds for a third of its written length                  |
 * | `C4/2~ C4/1` | a tie: one C4 that lasts three beats                                |
 * | `\|`         | bar line: checked when `beatsPerBar` is given, otherwise ignored    |
 *
 * Tuplets are not supported yet; durations are decimal beats.
 */

import { noteName, parseNoteName } from '../midi/notes';
import { assertChannel, assertIntInRange, MidiRangeError } from '../midi/validate';
import { DEFAULT_VELOCITY, type NoteSpec, type StepNote } from './types';

/** Thrown for notation that cannot be read. Carries the offending token and where it starts. */
export class NotationError extends Error {
	override name = 'NotationError';

	constructor(
		message: string,
		/** The token that failed, exactly as written. */
		readonly token: string,
		/** Character offset of the token in the source. */
		readonly offset: number
	) {
		super(`${message} (at "${token}", character ${offset})`);
	}
}

/** Options for `phrase`. */
export interface ParseOptions {
	/** Velocity of an unmarked note (default 88). */
	velocity?: number;
	/** Wire channel for every note in the phrase (default 0). */
	channel?: number;
	/**
	 * Fraction of its written length a note sounds (default 0.9): slightly under 1 so repeated
	 * pitches re-articulate instead of running together.
	 */
	gate?: number;
	/** Semitones to shift the whole phrase (default 0). */
	transpose?: number;
	/**
	 * Check every bar between `|` lines against this many beats. A bar that is too long or too short
	 * is an error; to carry a note across a bar line, tie it.
	 */
	beatsPerBar?: number;
	/**
	 * With `beatsPerBar`, let the first bar be short (an upbeat). The last bar may then be short by
	 * the same amount, completing it.
	 */
	pickup?: boolean;
}

const ACCENT = 18;
const GHOST = -34;
const STACCATO_GATE = 0.34;
const EPSILON = 1e-9;

interface Token {
	text: string;
	offset: number;
}

interface ParsedToken {
	/** null for a rest. */
	pitches: Array<{ name: string; note: number }> | null;
	duration?: number;
	velocity?: number;
	accents: number;
	ghosts: number;
	staccato: boolean;
	tie: boolean;
}

/** A note whose tie is waiting for its continuation. */
interface Held {
	spec: NoteSpec;
	/** Written beats of every segment before the last one; those sound in full. */
	beats: number;
	/** Written beats of the last segment, the only one the gate shortens. */
	last: number;
}

function tokenize(source: string): Token[] {
	return Array.from(source.matchAll(/\S+/g), (m) => ({ text: m[0], offset: m.index }));
}

function parseToken(tok: Token): ParsedToken {
	const fail = (message: string) => new NotationError(message, tok.text, tok.offset);
	if (tok.text.includes('|')) throw fail('a bar line needs spaces around it');

	let body = tok.text;
	const tie = body.endsWith('~');
	if (tie) body = body.slice(0, -1);
	let accents = 0;
	let ghosts = 0;
	let staccato = false;
	for (let last = body.at(-1); ; last = body.at(-1)) {
		if (last === '>') accents++;
		else if (last === '-') ghosts++;
		else if (last === '.') staccato = true;
		else if (last === '~') throw fail('a tie (~) goes at the very end of the token');
		else break;
		body = body.slice(0, -1);
	}

	let velocity: number | undefined;
	const atSign = body.indexOf('@');
	if (atSign >= 0) {
		const digits = body.slice(atSign + 1);
		if (!/^\d+$/.test(digits)) {
			throw fail('a velocity is a whole number after @, written after the duration: C4/0.5@96');
		}
		velocity = Number(digits);
		if (velocity < 1 || velocity > 127) throw fail(`velocity ${velocity} is outside 1–127`);
		body = body.slice(0, atSign);
	}

	let duration: number | undefined;
	const slash = body.indexOf('/');
	if (slash >= 0) {
		const text = body.slice(slash + 1);
		if (!/^(\d+(\.\d+)?|\.\d+)$/.test(text)) {
			throw fail(`"${text}" is not a duration; write beats as a plain number, like /0.5 or /1.5`);
		}
		duration = Number(text);
		if (duration === 0) throw fail('a duration must be longer than zero');
		body = body.slice(0, slash);
	}

	if (body === '_') {
		if (velocity !== undefined || accents || ghosts || staccato || tie) {
			throw fail('a rest cannot carry a velocity, an articulation or a tie');
		}
		return { pitches: null, duration, accents, ghosts, staccato, tie };
	}
	if (body === '') throw fail('missing pitch');
	const pitches = body.split('+').map((name) => {
		const note = parseNoteName(name, 'c4');
		if (note === null) throw fail(`unparseable pitch "${name}"`);
		return { name, note };
	});
	if (new Set(pitches.map((p) => p.note)).size !== pitches.length) {
		throw fail('the same pitch appears twice in one chord');
	}
	if (staccato && tie) throw fail('a tied note cannot be staccato; the tie holds it');
	return { pitches, duration, velocity, accents, ghosts, staccato, tie };
}

const fmt = (n: number) => String(Number(n.toFixed(6)));

/**
 * Parse notation into timed notes, in beats. Throws `NotationError` (with the token and its
 * character offset) for anything it cannot read, and `MidiRangeError` for bad options.
 *
 * A tie joins a note to the same pitch in the next token (across a bar line if need be); the joined
 * note keeps the first segment's velocity, and only its last segment is shortened by the gate.
 * Accents and ghosts that push a velocity past 1–127 stop at the end of the range.
 */
export function phrase(source: string, opts: ParseOptions = {}): NoteSpec[] {
	const {
		velocity = 88,
		channel = 0,
		gate = 0.9,
		transpose = 0,
		beatsPerBar,
		pickup = false
	} = opts;
	assertIntInRange(velocity, 1, 127, 'velocity');
	assertChannel(channel);
	if (!(gate > 0 && gate <= 1)) {
		throw new MidiRangeError('gate', gate, 'a fraction above 0, at most 1');
	}
	assertIntInRange(transpose, -127, 127, 'transpose');
	if (beatsPerBar !== undefined && !(Number.isFinite(beatsPerBar) && beatsPerBar > 0)) {
		throw new MidiRangeError('beatsPerBar', beatsPerBar, 'a positive number of beats');
	}

	const out: NoteSpec[] = [];
	const bars: Array<{ length: number; token: Token }> = [];
	let at = 0;
	let duration = 1;
	let barStart = 0;
	let open = new Map<number, Held>();
	let lastToken: Token | undefined;

	for (const tok of tokenize(source)) {
		if (tok.text === '|') {
			if (beatsPerBar !== undefined) {
				const length = at - barStart;
				if (length > EPSILON) bars.push({ length, token: tok });
				else if (at > 0) throw new NotationError('empty bar', tok.text, tok.offset);
			}
			barStart = at;
			continue;
		}

		const t = parseToken(tok);
		lastToken = tok;
		if (t.duration !== undefined) duration = t.duration;
		if (t.pitches === null) {
			if (open.size > 0) {
				throw new NotationError(
					`${heldNames(open)} is tied, so the next token has to continue it, not rest`,
					tok.text,
					tok.offset
				);
			}
			at += duration;
			continue;
		}

		const noteGate = t.staccato ? STACCATO_GATE : gate;
		const vel = Math.max(
			1,
			Math.min(127, Math.round((t.velocity ?? velocity) + ACCENT * t.accents + GHOST * t.ghosts))
		);
		const next = new Map<number, Held>();
		for (const { name, note: written } of t.pitches) {
			const note = written + transpose;
			if (note < 0 || note > 127) {
				throw new NotationError(
					`${name} transposed by ${transpose} lands outside 0–127`,
					tok.text,
					tok.offset
				);
			}
			let held = open.get(note);
			if (held) {
				open.delete(note);
				held.beats += held.last;
				held.last = duration;
				held.spec.duration = held.beats + duration * noteGate;
			} else {
				const spec: NoteSpec = {
					note,
					start: at,
					duration: duration * noteGate,
					velocity: vel,
					channel
				};
				out.push(spec);
				held = { spec, beats: 0, last: duration };
			}
			if (t.tie) next.set(note, held);
		}
		if (open.size > 0) {
			throw new NotationError(
				`${heldNames(open)} is tied, but this token does not continue it`,
				tok.text,
				tok.offset
			);
		}
		open = next;
		at += duration;
	}

	if (open.size > 0 && lastToken) {
		throw new NotationError(
			`the phrase ends inside a tie (${heldNames(open)})`,
			lastToken.text,
			lastToken.offset
		);
	}
	if (beatsPerBar !== undefined && lastToken) {
		if (at - barStart > EPSILON) bars.push({ length: at - barStart, token: lastToken });
		checkBars(bars, beatsPerBar, pickup);
	}
	return out;
}

function heldNames(open: Map<number, Held>): string {
	return [...open.keys()].map((n) => noteName(n, { ascii: true, convention: 'c4' })).join(' and ');
}

function checkBars(
	bars: Array<{ length: number; token: Token }>,
	beatsPerBar: number,
	pickup: boolean
): void {
	bars.forEach((bar, i) => {
		if (Math.abs(bar.length - beatsPerBar) < EPSILON) return;
		if (bar.length < beatsPerBar && pickup) {
			if (i === 0) return;
			const completesUpbeat = Math.abs(bar.length + bars[0].length - beatsPerBar) < EPSILON;
			if (i === bars.length - 1 && completesUpbeat) return;
		}
		throw new NotationError(
			`bar ${i + 1} lasts ${fmt(bar.length)} beats, but a bar here is ${fmt(beatsPerBar)}`,
			bar.token.text,
			bar.token.offset
		);
	});
}

/** Total length of a phrase in beats, including the tail of the last note. */
export function phraseBeats(notes: readonly NoteSpec[]): number {
	return notes.reduce((max, n) => Math.max(max, n.start + n.duration), 0);
}

/** Shift every note by a number of beats, for stacking phrases end to end. */
export function after(beats: number, notes: readonly NoteSpec[]): NoteSpec[] {
	if (!Number.isFinite(beats)) throw new MidiRangeError('beats', beats, 'a finite number of beats');
	return notes.map((n) => ({ ...n, start: n.start + beats }));
}

/**
 * Layer phrases on top of each other, sorted by start (notes that start together keep their order).
 */
export function together(...parts: ReadonlyArray<readonly NoteSpec[]>): NoteSpec[] {
	return parts.flat().sort((a, b) => a.start - b.start);
}

/* -------------------------------------------------------------------------- */
/* Quantising to a step grid                                                   */
/* -------------------------------------------------------------------------- */

/** Thrown when notes cannot be placed on the requested step grid without losing something. */
export class QuantiseError extends Error {
	override name = 'QuantiseError';
}

/** Options for `quantiseToSteps`. */
export interface QuantiseOptions {
	/** Steps in one bar (default 16, the OP-XY's grid at 1× track scale). */
	stepsPerBar?: number;
	/** Quarter-note beats in one bar (default 4, so a step is a sixteenth note). */
	beatsPerBar?: number;
	/**
	 * `strict` (default) refuses a note that starts between steps, or that is still sounding when the
	 * same pitch starts again. `nearest` rounds starts to the closest step and shortens a note that
	 * rounding made overlap the next one of the same pitch.
	 */
	mode?: 'strict' | 'nearest';
	/** Refuse notes that start at or after this step, e.g. 64 for one OP-XY pattern. */
	maxSteps?: number;
}

const GRID_TOLERANCE = 1e-6;

/**
 * Place notes (in beats) on a step grid. Starts become whole steps; lengths stay exact, in steps,
 * because a gate need not fill whole steps. The same pitch on the same channel never lands on one
 * step twice (`QuantiseError`), since two identical notes on one step are the shape of a stuck
 * note. Returns the notes sorted by step, then pitch.
 */
export function quantiseToSteps(
	notes: readonly NoteSpec[],
	opts: QuantiseOptions = {}
): StepNote[] {
	const { stepsPerBar = 16, beatsPerBar = 4, mode = 'strict', maxSteps } = opts;
	assertIntInRange(stepsPerBar, 1, 4096, 'stepsPerBar');
	if (!(Number.isFinite(beatsPerBar) && beatsPerBar > 0)) {
		throw new MidiRangeError('beatsPerBar', beatsPerBar, 'a positive number of beats');
	}
	if (mode !== 'strict' && mode !== 'nearest') {
		throw new MidiRangeError('mode', mode, "'strict' or 'nearest'");
	}
	if (maxSteps !== undefined) assertIntInRange(maxSteps, 1, Number.MAX_SAFE_INTEGER, 'maxSteps');
	const stepsPerBeat = stepsPerBar / beatsPerBar;

	const placed = notes.map((n, i): StepNote => {
		const field = `notes[${i}]`;
		assertIntInRange(n.note, 0, 127, `${field}.note`);
		if (!(Number.isFinite(n.start) && n.start >= 0)) {
			throw new MidiRangeError(`${field}.start`, n.start, 'a finite number of beats ≥ 0');
		}
		if (!(Number.isFinite(n.duration) && n.duration > 0)) {
			throw new MidiRangeError(`${field}.duration`, n.duration, 'a finite number of beats > 0');
		}
		const velocity = n.velocity ?? DEFAULT_VELOCITY;
		assertIntInRange(velocity, 1, 127, `${field}.velocity`);
		const channel = n.channel ?? 0;
		assertChannel(channel, `${field}.channel`);

		const exact = n.start * stepsPerBeat;
		const step = Math.round(exact);
		const name = noteName(n.note, { ascii: true, convention: 'c4' });
		if (mode === 'strict' && Math.abs(exact - step) > GRID_TOLERANCE) {
			throw new QuantiseError(
				`${name} at beat ${fmt(n.start)} falls between steps (step ${fmt(exact)} on a ${stepsPerBar}-step bar); round it with mode 'nearest' or use a finer grid`
			);
		}
		if (maxSteps !== undefined && step >= maxSteps) {
			throw new QuantiseError(`${name} starts at step ${step}, past the ${maxSteps}-step limit`);
		}
		return { step, length: n.duration * stepsPerBeat, note: n.note, velocity, channel };
	});
	placed.sort((a, b) => a.step - b.step || a.note - b.note);

	const previous = new Map<string, StepNote>();
	for (const n of placed) {
		const key = `${n.channel}:${n.note}`;
		const prev = previous.get(key);
		previous.set(key, n);
		if (!prev) continue;
		const name = `${noteName(n.note, { ascii: true, convention: 'c4' })} on channel ${n.channel + 1}`;
		if (prev.step === n.step) throw new QuantiseError(`${name} lands on step ${n.step} twice`);
		if (prev.step + prev.length > n.step + GRID_TOLERANCE) {
			if (mode === 'strict') {
				throw new QuantiseError(
					`${name} from step ${prev.step} is still sounding when it starts again at step ${n.step}`
				);
			}
			prev.length = n.step - prev.step;
		}
	}
	return placed;
}
