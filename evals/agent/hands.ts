/**
 * The simulated user's hands, eyes and ears on the replica, for the episodes eval (`episodes.ts`).
 *
 * Hands: a key combo in the app's grammar (`$lib/core/opxy` keys.ts) with a count after each turn
 * ("turn E1 +5", "step 5 + turn E2 -3"), played on the `ReplicaState` as pointer input, the way a
 * person's clicks and drags reach it in the browser. As the navigator plays a step on the simulator
 * (`playStep`), every key of a chord but the last is held while the last is tapped, held, turned or
 * clicked, and the held keys come up after the chord unless the next one keeps them (`→ +`). A turn
 * goes one detent at a time, an encoder click is its push, release and click (what `Encoder.svelte`
 * reports for a tap), and a `hold` stays down as long as the replica's own demonstration holds it.
 * Between events the hands wait a task, so whatever observes the replica (the simulator, then the
 * walkthrough checking the screen) hears each event on its own, as it does in the app.
 *
 * Eyes: what a person at the replica can see, in words: the screen (the simulator's description of
 * what it draws, which is also what `read_screen` gives the agent), the key lights, whether it
 * plays, the walkthrough card and the controls it marks. Never the simulator's state itself.
 *
 * Ears: what a person hears in a few seconds of the replica, in their words (how loud, how bright,
 * the beat, its tempo and swing, how busy, the key and whether the chords move), from the same
 * analysis the agent's `listen` reads but without its engineering readout.
 */
import {
	CONTROLS,
	formatKeys,
	getControl,
	parseKeys,
	KeyParseError,
	type ControlId,
	type EncoderId,
	type KeyId,
	type KeySequence,
	type KeyTerm
} from '$lib/core/opxy';
import {
	DEFAULT_TIMING,
	type KeyLedState,
	type PressableId,
	type ReplicaState,
	type TurnableId
} from '$lib/replica';
import type { ListenSummary } from '$lib/core/listen';
import { buildFrame, buildLeds } from '$lib/sim/frames';
import type { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { describeFrame } from '$lib/sim/screen/render';

// ─── the grammar, with counts ───────────────────────────────────────────────────────────────────

/** A combo the user presses: the key grammar's sequence and how far each chord's turn goes. */
export interface UserKeys {
	readonly sequence: KeySequence;
	/** Per chord: the detents its turn goes (+ clockwise, − counter-clockwise), or null. */
	readonly clicks: readonly (number | null)[];
	/** Turns written without a count, which go one detent. */
	readonly uncounted: number;
	/** The combo in the grammar's own spelling, each turn's count after it ("T3 → turn E1 +5"). */
	readonly text: string;
}

/** A parsed combo, or what is wrong with it in words the user can act on. */
export type UserKeysResult =
	{ readonly ok: true; readonly value: UserKeys } | { readonly ok: false; readonly error: string };

/** The most detents one turn may go: past every encoder's range, short of a runaway count. */
export const MAX_CLICKS = 200;

/** Where a chord's turn starts: the last `turn` and its control (an encoder or the volume knob). */
const TURN = /\bturn\s+(\S+)/gi;
/** Filler a person writes around a count ("by 5", "5 clicks", "x5"). */
const FILLER = /^(?:by|x|×|clicks?|detents?|notches?|times|steps?)$/i;
const CLOCKWISE = /^(?:clockwise|cw|right|up)$/i;
const COUNTER = /^(?:counter-?clockwise|anti-?clockwise|ccw|left|down)$/i;
const COUNT = /^(?:x|×)?([+\-−])?(\d{1,3})(?:x|×)?$/i;

/** A turn's count as written after its control ("+5", "-3", "5 clicks", "counter-clockwise 2"). */
function readCount(tail: string): { clicks: number; counted: boolean } | { error: string } {
	let written: 1 | -1 | null = null;
	let worded: 1 | -1 | null = null;
	let count: number | null = null;
	for (const raw of tail.trim().split(/\s+/)) {
		const word = raw.replace(/^\(|\)$/g, '');
		if (!word || FILLER.test(word)) continue;
		if (CLOCKWISE.test(word)) worded = 1;
		else if (COUNTER.test(word)) worded = -1;
		else if (word === '+') written = 1;
		else if (word === '-' || word === '−') written = -1;
		else {
			const m = COUNT.exec(word);
			if (!m || count !== null) {
				return {
					error: `"${raw}" after the turn: write the clicks as a signed number, e.g. "turn E1 +5" (clockwise) or "turn E1 -3" (counter-clockwise)`
				};
			}
			if (m[1]) written = m[1] === '+' ? 1 : -1;
			count = Number(m[2]);
		}
	}
	if (written !== null && worded !== null && written !== worded) {
		return { error: `"${tail.trim()}": the sign and the direction disagree` };
	}
	if (count === 0) return { error: 'a turn goes at least one click' };
	if (count !== null && count > MAX_CLICKS) {
		return { error: `${count} clicks is more than any encoder needs (at most ${MAX_CLICKS})` };
	}
	return { clicks: (worded ?? written ?? 1) * (count ?? 1), counted: count !== null };
}

/** The first control a term names, when it names exactly one. */
function concrete(term: KeyTerm): ControlId | null {
	return term.target.kind === 'control' ? term.target.id : null;
}

/** The combo as the grammar spells it, each turn's count after it. */
function spell(sequence: KeySequence, clicks: readonly (number | null)[]): string {
	return sequence.chords
		.map((chord, i) => {
			const joiner = i === 0 ? '' : chord.keepHeld ? ' → + ' : ' → ';
			const n = clicks[i];
			const count = n === null ? '' : ` ${n > 0 ? '+' : '-'}${Math.abs(n)}`;
			return joiner + formatKeys({ chords: [{ ...chord, keepHeld: false }] }) + count;
		})
		.join('');
}

/**
 * Reads a combo a person presses: the key grammar with a count after a turn ("turn E1 +5", "turn
 * E2 -3", "step 5 + turn E2 -3"; a turn without one goes a single detent). Only single keys can be
 * pressed: a placeholder, range or choice ("Tn", "E1…E4", "[-]/[+]") is refused with the reason.
 */
export function parseUserKeys(input: string): UserKeysResult {
	const text = input.trim().replace(/^`|`$/g, '');
	if (!text) return { ok: false, error: 'no keys given' };
	// chords are what the arrows separate; each keeps its turn's count until the grammar has parsed
	const parts = text.split(/(\s*(?:→|->)\s*)/);
	const chunks: string[] = [];
	const clicks: (number | null)[] = [];
	let uncounted = 0;
	for (let i = 0; i < parts.length; i += 2) {
		const chunk = parts[i];
		const turns = [...chunk.matchAll(TURN)];
		const turn = turns.at(-1);
		if (!turn || turn.index === undefined) {
			chunks.push(chunk);
			clicks.push(null);
			continue;
		}
		const end = turn.index + turn[0].length;
		const count = readCount(chunk.slice(end));
		if ('error' in count) return { ok: false, error: count.error };
		if (!count.counted) uncounted++;
		chunks.push(chunk.slice(0, end));
		clicks.push(count.clicks);
	}
	let sequence: KeySequence;
	try {
		sequence = parseKeys(chunks.join(' → '));
	} catch (error) {
		if (error instanceof KeyParseError) return { ok: false, error: error.message };
		throw error;
	}
	for (const chord of sequence.chords) {
		for (const term of chord.terms) {
			const id = concrete(term);
			if (id === null) {
				const spelled = formatKeys({ chords: [{ keepHeld: false, terms: [term] }] });
				return {
					ok: false,
					error: `"${spelled}" stands for more than one key: press one of them by its name`
				};
			}
			if (id === 'switch.power') return { ok: false, error: 'the power switch stays on' };
		}
	}
	return { ok: true, value: { sequence, clicks, uncounted, text: spell(sequence, clicks) } };
}

// ─── playing it on the replica ──────────────────────────────────────────────────────────────────

/** How the hands play a combo. */
export interface PlayOptions {
	/** How long a `hold …` key stays down (ms; default: as the replica's demonstration holds it). */
	readonly holdMs?: number;
	/** Resolves once whatever observes the replica has taken the last event (default: a task). */
	readonly settle?: () => Promise<void>;
	/** Waits `ms` (holds; default: a timer). */
	readonly wait?: (ms: number) => Promise<void>;
	/**
	 * Called while a `hold …` key is down, once the replica has taken it: a person sees the replica
	 * while holding a key (shift held in mix shows the mutes on the track keys), not only after.
	 */
	readonly whileHeld?: () => void;
}

/** Lets the replica's observers (the walkthrough checks the screen in a microtask) catch up. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** How far the pitch-bend pad goes while pressed (as the replica's demonstration bends it). */
const BEND = 0.7;
/** How much one click of the volume knob moves it (as the replica's demonstration turns it). */
const VOLUME_STEP = 0.06;

/**
 * Plays a combo on the replica as a person's pointer would, one event at a time (see the module's
 * doc). Events come from the `pointer`, so the replica reports them as a user's.
 */
export async function playUserKeys(
	replica: ReplicaState,
	keys: UserKeys,
	options: PlayOptions = {}
): Promise<void> {
	const settle = options.settle ?? nextTask;
	const wait = options.wait ?? sleep;
	const holdMs = options.holdMs ?? DEFAULT_TIMING.holdMs;
	const down = async (id: ControlId) => {
		if (id === 'strip.pitchbend') replica.setBend(BEND, 'pointer');
		else replica.press(id as PressableId, 'pointer');
		await settle();
	};
	const up = async (id: ControlId) => {
		if (id === 'strip.pitchbend') replica.setBend(0, 'pointer');
		else replica.release(id as PressableId, 'pointer');
		await settle();
	};
	let held: ControlId[] = [];
	const letGo = async () => {
		for (const id of held.reverse()) await up(id);
		held = [];
	};
	const { chords } = keys.sequence;
	for (const [c, chord] of chords.entries()) {
		if (!chord.keepHeld) await letGo();
		for (const [t, term] of chord.terms.entries()) {
			const id = concrete(term) as ControlId;
			if (t < chord.terms.length - 1) {
				await down(id);
				held.push(id);
				continue;
			}
			if (term.gesture === 'turn') {
				const clicks = keys.clicks[c] ?? 1;
				const direction = Math.sign(clicks) as 1 | -1;
				for (let n = 0; n < Math.abs(clicks); n++) {
					if (id === 'knob.volume') {
						const next = Math.min(1, Math.max(0, replica.volume + direction * VOLUME_STEP));
						replica.setVolume(next, 'pointer');
					} else replica.turn(id as EncoderId, direction, { source: 'pointer' });
					await settle();
				}
			} else if (term.gesture === 'click') {
				// a tap on an encoder: its push goes down and up, then the click
				const encoder = id as EncoderId;
				replica.press(encoder, 'pointer');
				replica.release(encoder, 'pointer');
				replica.click(encoder, 'pointer');
				await settle();
			} else {
				await down(id);
				if (term.gesture === 'hold') {
					options.whileHeld?.();
					await wait(holdMs);
				}
				await up(id);
			}
		}
		if (!chords[c + 1]?.keepHeld) await letGo();
	}
}

// ─── what the user sees ─────────────────────────────────────────────────────────────────────────

/** A control as the key grammar names it ("T3", "step 5", "key F3", "E1"). */
function nameOf(id: ControlId): string {
	return getControl(id).token ?? getControl(id).label;
}

/** The keys whose lights are on ("T1, step 1, step 5, key F3 (dim)"), or null when none is. */
export function litKeys(leds: Partial<Record<KeyId, KeyLedState>>): string | null {
	const lit = (Object.entries(leds) as [KeyId, KeyLedState][])
		.filter(([, state]) => state !== 'off')
		.map(([id, state]) => `${nameOf(id)}${state === 'white' ? '' : ` (${state})`}`);
	return lit.length > 0 ? lit.join(', ') : null;
}

/** The controls the replica marks for the user (a walkthrough's step), as a person reads them. */
export function markedControls(replica: ReplicaState): string[] {
	const marked: string[] = [];
	for (const control of CONTROLS) {
		const kind = replica.highlight(control.id);
		if (!kind) continue;
		const hint =
			control.id.startsWith('encoder.') || control.id === 'knob.volume'
				? replica.turnHint(control.id as TurnableId)
				: undefined;
		const how =
			kind === 'turn'
				? `turn ${hint === -1 ? 'counter-clockwise' : 'clockwise'}`
				: kind === 'candidate'
					? 'one of these'
					: kind;
		marked.push(`${nameOf(control.id)} (${how})`);
	}
	return marked;
}

/** What the eyes are given besides the replica: the walkthrough card, when one shows. */
export interface Eyes {
	readonly sim: OpxySim;
	readonly replica: ReplicaState;
	/** The walkthrough card under the replica, in words, or null. */
	readonly card?: string | null;
}

/**
 * What a person at the replica sees now, in words: the screen, whether it plays, the lit keys, the
 * walkthrough card and the controls it marks.
 */
export function userView({ sim, replica, card }: Eyes): string {
	const s = sim.state;
	const lines = [`screen: ${describeFrame(buildFrame(s))}`];
	lines.push(
		`sound: ${s.transport.playing ? 'playing' : 'stopped'}${s.transport.recording ? ', recording' : ''}`
	);
	const lit = litKeys(buildLeds(s));
	lines.push(`lit keys: ${lit ?? 'none'}`);
	if (card) lines.push(card);
	const marked = markedControls(replica);
	if (marked.length > 0) lines.push(`marked on the replica: ${marked.join(', ')}`);
	return lines.join('\n');
}

// ─── what the user hears ────────────────────────────────────────────────────────────────────────

/** How loud a take sounds, from its integrated loudness (LUFS). */
function loudness(lufs: number | null): string {
	if (lufs === null || lufs < -35) return 'very quiet';
	if (lufs < -24) return 'quiet';
	if (lufs < -14) return 'at a comfortable level';
	return lufs < -9 ? 'loud' : 'very loud';
}

/** How bright a take sounds, from its spectral centroid (Hz). */
function brightness(centroidHz: number): string {
	if (centroidHz < 700) return 'dark and muffled';
	if (centroidHz < 1500) return 'warm, a little dark';
	if (centroidHz < 3000) return 'balanced';
	return centroidHz < 6000 ? 'bright' : 'very bright and crisp';
}

/**
 * What a person hears in a take, in their words: how loud and how bright, the beat (its tempo,
 * straight or swung, busy or sparse), the key and whether the chords move. A person does not count
 * onsets per band; a model that reads such counts hears a kick's click as a clap on every beat.
 */
export function heardInWords({ data, flags }: Pick<ListenSummary, 'data' | 'flags'>): string {
	if (flags.includes('silent')) return 'You hear silence: nothing plays.';
	const sound = [loudness(data.level.lufs)];
	if (data.tone) sound.push(brightness(data.tone.centroidHz));
	if (flags.includes('clipping')) sound.push('and it distorts');
	if (flags.includes('mostly-silent')) sound.push('mostly silence');
	else if (flags.includes('dropouts')) sound.push('with gaps of silence');
	const parts = [`You hear it ${sound.join(', ')}`];
	const r = data.rhythm;
	if (r && r.bpm !== null && (r.confidence ?? 0) >= 0.25) {
		const swing = Math.max(r.swing ?? 50, r.swingEighth ?? 50);
		const feel = swing >= 56 ? 'swung' : (r.swing ?? 50) <= 44 ? 'pushed' : 'straight';
		const pace = r.perSecond > 7 ? ', busy' : r.perSecond < 2 ? ', sparse' : '';
		// the pulse finder may lock onto twice or half the beat (eighth-note hats read as double
		// time); a person taps along with the music's own beat, the one it is set to
		const relation = r.relation ?? 'same';
		const setBpm = r.setBpm ?? null;
		const multiple = relation !== 'same' && relation !== 'different';
		const bpm = multiple && setBpm !== null ? setBpm : r.bpm;
		parts.push(`a steady beat at about ${Math.round(bpm)} BPM, ${feel}${pace}`);
	} else if (r && r.onsets > 0) parts.push('notes, but no clear beat');
	else parts.push('no beat, only held sound');
	// harmony only where the music has a clear key: the chord finder names chords in drum noise too
	const h = data.harmony;
	if (h?.clear && h.key) {
		const chords = new Set(h.chords.map(([, chord]) => chord));
		const moves =
			chords.size > 1 ? ', the chords move' : chords.size === 1 ? ', one chord all along' : '';
		parts.push(`it sounds in ${h.key}${moves}`);
	}
	return `${parts.join('; ')}.`;
}
