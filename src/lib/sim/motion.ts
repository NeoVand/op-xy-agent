/**
 * What moves the synth engines' pictures, kept by the core and advanced with the clock (like the
 * areas' timers): which notes sound on the track the screen shows, when they began and when they
 * stopped, a clock that runs only while they sound, and where organ's drawbars are on their way to
 * their values. The device's pictures move with the sound (camera, research 59 §2.5: dissolve's
 * mosaic stirs and hardsync's blocks blow only while notes play, prism's rays flash on every note,
 * organ's drawbars slide), so the frame builder hands this to the page (`frames.ts`, the synth
 * frame's `notes`, `onset`, `release`, `travel`, `shown` and `time`).
 */
import { heldKeys, playingStep } from './areas/sequencer/model';
import { playerNotes } from './areas/sequencer/players';
import type { SimState } from './params';
import { currentPattern } from './sequencer';

/** The motion slice of the simulator state. */
export interface MotionState {
	/** Milliseconds the simulator has advanced. */
	clock: number;
	/** Notes sounding on the shown track at the last advance. */
	notes: number;
	/** Clock of the latest note-on and of the moment the last note stopped (null: none yet). */
	onset: number | null;
	release: number | null;
	/**
	 * A clock that runs only while notes sound, fastest just after each note-on (ours: hardsync's
	 * blocks slow from about 890 px/s as the note goes on, research 59 §2.5).
	 */
	travel: number;
	/** The shown track's M1 values (0–1) as the page draws them: organ's drawbars slide to them. */
	shown: number[] | null;
	/** Which track and engine `shown` belongs to (another one snaps into place). */
	track: number;
	engine: string;
}

/** A new simulator's motion. */
export function initialMotion(): MotionState {
	return {
		clock: 0,
		notes: 0,
		onset: null,
		release: null,
		travel: 0,
		shown: null,
		track: -1,
		engine: ''
	};
}

/** How long a drawbar takes to settle on a new value (ours: one camera frame blurred the slide). */
export const SLIDE_MS = 60;
/** After the last note, how long anything lit by it may still be fading. */
export const FADE_MS = 2000;

/**
 * The notes sounding on instrument track `index` now: the keys held (or its player's notes) when it
 * is the track they play, and while the transport runs, its pattern's notes under the playhead (a
 * muted track sounds nothing). Also how long ago (ms) the latest pattern note began, if one does.
 */
export function soundingOn(s: SimState, index: number): { notes: number; since: number | null } {
	const t = s.tracks[index];
	if (!t || t.mix.muted) return { notes: 0, since: null };
	let notes = 0;
	let since: number | null = null;
	if (s.track === index && s.active === 'instrument') {
		const player = playerNotes(s);
		notes += player ? player.length : heldKeys(s).length;
	}
	const tr = s.transport;
	if (tr.playing && tr.position >= 0) {
		const pattern = currentPattern(t.sequence);
		const stepMs = (60000 / s.tempo.bpm / 4) * pattern.scale;
		const at = tr.position / pattern.scale;
		const now = s.track === index ? playingStep(s, pattern) : Math.floor(at) % pattern.length;
		const phase = at - Math.floor(at);
		// a note sounds from its step (and micro-timing) for its length; look back one pattern
		for (let back = 0; back < pattern.length; back++) {
			const step =
				pattern.steps[(((now - back) % pattern.length) + pattern.length) % pattern.length];
			for (const n of step.notes) {
				const age = back + phase - n.offset;
				if (age >= 0 && age < n.length) {
					notes++;
					const ms = age * stepMs;
					if (since === null || ms < since) since = ms;
				}
			}
		}
	}
	return { notes, since };
}

/** Moves the motion on by `ms`: notes starting and stopping, the sound clock, sliding drawbars. */
export function advanceMotion(s: SimState, ms: number): void {
	s.motion ??= initialMotion();
	const m = s.motion;
	m.clock += ms;
	const { notes, since } = soundingOn(s, s.track);
	if (notes > m.notes) m.onset = m.clock;
	// long after the last note nothing is left to fade (and the page stops redrawing)
	if (m.release !== null && m.clock - m.release > FADE_MS) m.release = null;
	// a pattern note that follows another straight away is a new onset too
	if (since !== null && (m.onset === null || m.clock - m.onset > since)) m.onset = m.clock - since;
	if (notes === 0 && m.notes > 0) m.release = m.clock;
	if (notes > 0) {
		const age = m.onset === null ? Infinity : m.clock - m.onset;
		m.travel += ms * (0.25 + 0.75 * Math.exp(-age / 250));
	}
	m.notes = notes;
	const t = s.tracks[s.track];
	const values = t.m1.map((v) => v / 99);
	if (!m.shown || m.track !== s.track || m.engine !== t.engine) {
		m.shown = values;
		m.track = s.track;
		m.engine = t.engine;
		return;
	}
	const k = 1 - Math.exp(-ms / SLIDE_MS);
	for (let i = 0; i < 4; i++) {
		const d = values[i] - m.shown[i];
		if (d !== 0) m.shown[i] = Math.abs(d) < 1e-3 ? values[i] : m.shown[i] + d * k;
	}
}

/** Whether a drawbar is still on its way (the page then redraws with the clock). */
export const sliding = (m: MotionState, values: readonly number[]) =>
	!!m.shown && m.shown.some((v, i) => Math.abs(v - values[i]) >= 1e-3);

/** The synth frame's motion fields for the shown track (`screen/frame.ts`, SynthFrame). */
export interface SynthMotion {
	notes?: number;
	onset?: number;
	release?: number;
	travel?: number;
	shown?: number[];
	time?: number;
}

/**
 * What each engine's picture moves with: the notes (their onset and release: prism's rays,
 * dissolve's stir) and the sound clock (dissolve's deals, hardsync's blocks). Organ's drawbars and
 * wavetable's drift are handled on their own; the other pictures stand still whatever sounds.
 */
const MOVES: Readonly<Record<string, { readonly notes?: true; readonly travel?: true }>> = {
	prism: { notes: true },
	dissolve: { notes: true, travel: true },
	hardsync: { travel: true }
};

/**
 * What the shown engine's picture needs to move, read so that the frame changes only while its
 * picture moves: the clock while notes sound or fade (for the pictures that show them), while
 * organ's drawbars slide and while wavetable's drift runs; the sound clock otherwise.
 */
export function synthMotion(s: SimState, engine: string, params: readonly number[]): SynthMotion {
	const m = s.motion;
	if (!m) return {};
	const moves = MOVES[engine] ?? {};
	const out: SynthMotion = {};
	if (moves.notes) {
		out.notes = m.notes;
		if (m.notes > 0 && m.onset !== null) out.onset = m.clock - m.onset;
		else if (m.notes === 0 && m.release !== null) out.release = m.clock - m.release;
	}
	if (moves.travel) out.travel = m.travel;
	if (
		engine === 'organ' &&
		m.shown &&
		m.track === s.track &&
		m.engine === engine &&
		sliding(m, params)
	) {
		out.shown = [...m.shown];
	}
	// drift turns warp's bend: with no bend nothing turns
	if (engine === 'wavetable' && (params[2] ?? 0) > 0 && (params[3] ?? 0) > 0) out.time = m.clock;
	return out;
}
