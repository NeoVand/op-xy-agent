/**
 * The key-combo grammar used by our manual, the agent and the replica's teaching animations
 * (docs/research/40-official-docs.md §4 and §8). `parseKeys("shift + M1")` gives an AST of
 * control ids and gestures; `formatKeys` prints the canonical spelling back.
 *
 * ```text
 * sequence := chord ( " → " [ "+ " ] chord )*      "→" (or "->"): release, then the next chord;
 *                                                  "→ +": keep the previous chord's held keys down
 * chord    := term ( " + " term )*                 every term but the last is held down
 * term     := [ "hold " | "turn " | "click " ] target
 * target   := single ( "/" single )*               alternatives: "[-]/[+]"
 * single   := control [ "…" control ]              ranges: "E1…E4", "T1…T8", "step 1…16"
 *           | placeholder
 * ```
 *
 * Controls are spelled by their grammar `token` in controls.json (`shift`, `record`, `[-]`, `[+]`,
 * `M1`, `T1`, `step 5`, `key F#3`, `E1`, `volume`, `pitchbend`, `power`, …), or for keyboard keys
 * also `natural 1`–`natural 14` and `accidental 1`–`accidental 9`, `accidental 0` (the printed
 * digit). Labels and aliases are accepted on input ("minus", "dark gray knob") and printed back
 * canonically. Placeholders stand for "any key of a group": `Tn`, `Tm`, `step n`, `step m`, `key`,
 * `natural`, `accidental`, and the plurals `steps`, `keys`, `naturals`, `accidentals` (one or more).
 *
 * Gestures: a bare term is a press; `hold` is a long press (last term only); `turn` rotates an
 * encoder or the volume knob (last term only); `click` pushes an encoder (held, when not last).
 * Unknown controls and impossible gestures are rejected with a {@link KeyParseError}.
 */
import type { Control, ControlInput } from './controls.schema';
import { CONTROLS, getControl } from './controls';
import { KeyParseError } from './errors';
import type { ControlId } from './ids';
import { closestMatch } from './suggest';

/** What is done to a control. */
export type KeyGesture = 'press' | 'hold' | 'turn' | 'click';

/** How a concrete control was written: its token, or a keyboard key as natural/accidental n. */
export type KeySpelling = 'token' | 'natural' | 'accidental';

/** Placeholders for "any key of a group"; plurals mean one or more. */
export const KEY_PLACEHOLDERS = [
	'Tn',
	'Tm',
	'step n',
	'step m',
	'steps',
	'key',
	'keys',
	'natural',
	'naturals',
	'accidental',
	'accidentals'
] as const;
/** A placeholder name. */
export type KeyPlaceholder = (typeof KEY_PLACEHOLDERS)[number];

/** One concrete control. */
export interface ControlRef {
	readonly kind: 'control';
	readonly id: ControlId;
	readonly spelling: KeySpelling;
}

/** Any member of a group (e.g. `Tn` = any track key); `ids` lists the candidates. */
export interface PlaceholderTarget {
	readonly kind: 'placeholder';
	readonly name: KeyPlaceholder;
	readonly plural: boolean;
	readonly ids: readonly ControlId[];
}

/** Any one control of a contiguous run (`E1…E4`); `ids` lists them in order. */
export interface RangeTarget {
	readonly kind: 'range';
	readonly from: ControlRef;
	readonly to: ControlRef;
	readonly ids: readonly ControlId[];
}

/** One of several controls (`[-]/[+]`). */
export interface AlternativesTarget {
	readonly kind: 'alternatives';
	readonly options: readonly ControlRef[];
}

/** What a term acts on. */
export type KeyTarget = ControlRef | PlaceholderTarget | RangeTarget | AlternativesTarget;

/** One gesture on one target. */
export interface KeyTerm {
	readonly gesture: KeyGesture;
	readonly target: KeyTarget;
}

/** Keys pressed together: all terms but the last are held while the last one is actuated. */
export interface KeyChord {
	/** Keep the previous chord's held keys down (written `→ + …`). */
	readonly keepHeld: boolean;
	readonly terms: readonly KeyTerm[];
}

/** Chords performed one after the other. */
export interface KeySequence {
	readonly chords: readonly KeyChord[];
}

// ---------------------------------------------------------------------------------------------
// Vocabulary (built from controls.json)

const isTrack = (c: Control) => c.group === 'track';
const isStep = (c: Control) => c.group === 'step';
const isKeyboard = (c: Control) => c.keyboard !== undefined;
const isNatural = (c: Control) => c.keyboard?.type === 'natural';
const isAccidental = (c: Control) => c.keyboard?.type === 'accidental';

const PLACEHOLDER_GROUPS: Record<KeyPlaceholder, (c: Control) => boolean> = {
	Tn: isTrack,
	Tm: isTrack,
	'step n': isStep,
	'step m': isStep,
	steps: isStep,
	key: isKeyboard,
	keys: isKeyboard,
	natural: isNatural,
	naturals: isNatural,
	accidental: isAccidental,
	accidentals: isAccidental
};
const PLURALS: ReadonlySet<KeyPlaceholder> = new Set(['steps', 'keys', 'naturals', 'accidentals']);

const PLACEHOLDER_BY_NAME = new Map<string, PlaceholderTarget>(
	KEY_PLACEHOLDERS.map((name) => [
		name.toLowerCase(),
		{
			kind: 'placeholder',
			name,
			plural: PLURALS.has(name),
			ids: CONTROLS.filter(PLACEHOLDER_GROUPS[name]).map((c) => c.id)
		}
	])
);

/** Canonical spellings, lower case. */
const SPELLINGS = new Map<string, ControlRef>();
/** Labels and aliases accepted on input, lower case; printed back as the token. */
const LOOSE_NAMES = new Map<string, ControlRef>();
/** Canonical spellings as written, offered as "did you mean …?" suggestions. */
const SUGGESTIONS: string[] = [...KEY_PLACEHOLDERS];
for (const control of CONTROLS) {
	if (control.token === null) continue;
	const ref: ControlRef = { kind: 'control', id: control.id, spelling: 'token' };
	SPELLINGS.set(control.token.toLowerCase(), ref);
	SUGGESTIONS.push(control.token);
	if (control.keyboard) {
		const spelling = control.keyboard.type;
		const name = `${spelling} ${control.keyboard.number}`;
		SPELLINGS.set(name, { kind: 'control', id: control.id, spelling });
		SUGGESTIONS.push(name);
	}
	for (const name of [control.label, ...control.aliases]) {
		LOOSE_NAMES.set(name.toLowerCase().replace(/\s+/g, ' '), ref);
	}
}

const NOTE_RE = /^key ([a-g])(#|♯|s|b|♭)?(\d)$/;
const PITCH_CLASS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** `key <note>` in any spelling (F#3, Gb3, fs3) → the keyboard key at the default octave. */
function keyForNoteName(name: string): ControlRef | 'out-of-range' | undefined {
	const m = NOTE_RE.exec(name);
	if (!m) return undefined;
	const shift = m[2] === undefined ? 0 : m[2] === 'b' || m[2] === '♭' ? -1 : 1;
	const note = 12 * (Number(m[3]) + 1) + PITCH_CLASS[m[1]] + shift;
	const control = CONTROLS.find((c) => c.keyboard?.note === note);
	return control ? { kind: 'control', id: control.id, spelling: 'token' } : 'out-of-range';
}

const RANGE_GROUPS: ReadonlySet<string> = new Set([
	'encoder',
	'module',
	'track',
	'step',
	'keyboard'
]);

const GESTURE_WORDS: ReadonlySet<string> = new Set(['hold', 'turn', 'click']);

const ACCEPTS: Record<KeyGesture, readonly ControlInput[]> = {
	press: ['press', 'pressure', 'toggle'],
	hold: ['press', 'pressure', 'toggle'],
	turn: ['turn', 'rotate'],
	click: ['click']
};

// ---------------------------------------------------------------------------------------------
// Lexer

type TokenKind = 'word' | 'plus' | 'arrow' | 'slash' | 'ellipsis' | 'bracket';

interface Token {
	readonly kind: TokenKind;
	readonly text: string;
	readonly start: number;
}

const WORD_CHAR = /[A-Za-z0-9#♯♭]/;

function lex(input: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < input.length) {
		const ch = input[i];
		const push = (kind: TokenKind, text: string, length: number) => {
			tokens.push({ kind, text, start: i });
			i += length;
		};
		if (/\s/.test(ch)) i++;
		else if (/^\[[-−+]\]/.test(input.slice(i, i + 3)))
			push('bracket', ch === '[' && input[i + 1] === '+' ? '[+]' : '[-]', 3);
		else if (ch === '→') push('arrow', '→', 1);
		else if (input.startsWith('->', i)) push('arrow', '→', 2);
		else if (ch === '+') push('plus', '+', 1);
		else if (ch === '/') push('slash', '/', 1);
		else if (ch === '…') push('ellipsis', '…', 1);
		else if (input.startsWith('...', i)) push('ellipsis', '…', 3);
		else if (WORD_CHAR.test(ch)) {
			let end = i;
			while (end < input.length && WORD_CHAR.test(input[end])) end++;
			push('word', input.slice(i, end), end - i);
		} else if (ch === '-' || ch === '−') {
			throw new KeyParseError('write the minus key as "[-]"', input, i);
		} else {
			throw new KeyParseError(`unexpected character "${ch}"`, input, i);
		}
	}
	return tokens;
}

// ---------------------------------------------------------------------------------------------
// Parser

class Parser {
	private pos = 0;

	constructor(
		private readonly input: string,
		private readonly tokens: readonly Token[]
	) {}

	private peek(offset = 0): Token | undefined {
		return this.tokens[this.pos + offset];
	}

	private fail(message: string, at = this.peek()?.start ?? this.input.length): never {
		throw new KeyParseError(message, this.input, at);
	}

	sequence(): KeySequence {
		if (this.tokens.length === 0) this.fail('empty key combo', 0);
		const chords = [this.chord(false)];
		// Keys still held when a chord ends: its own leading terms plus any it kept from before.
		let held = chords[0].terms.length - 1;
		while (this.peek()?.kind === 'arrow') {
			this.pos++;
			let keepHeld = false;
			if (this.peek()?.kind === 'plus') {
				if (held === 0) {
					this.fail('"→ +" keeps the previous chord\'s held keys down, but that chord holds none');
				}
				keepHeld = true;
				this.pos++;
			}
			const chord = this.chord(keepHeld);
			held = (keepHeld ? held : 0) + chord.terms.length - 1;
			chords.push(chord);
		}
		const rest = this.peek();
		if (rest) this.fail(`unexpected "${rest.text}"`);
		return { chords };
	}

	private chord(keepHeld: boolean): KeyChord {
		const terms: KeyTerm[] = [];
		const starts: number[] = [];
		const seen = new Set<string>();
		for (;;) {
			const start = this.peek()?.start ?? this.input.length;
			const term = this.term();
			// Pressing a key twice in one chord is impossible; clicking and turning one encoder is not.
			const action = term.gesture === 'turn' || term.gesture === 'click' ? term.gesture : 'press';
			const key = `${action} ${formatTarget(term.target).toLowerCase()}`;
			if (seen.has(key))
				this.fail(`"${formatTarget(term.target)}" appears twice in one chord`, start);
			seen.add(key);
			terms.push(term);
			starts.push(start);
			if (this.peek()?.kind !== 'plus') break;
			this.pos++;
		}
		terms.forEach((term, i) => {
			const last = i === terms.length - 1;
			if (!last && term.gesture === 'hold') {
				this.fail(
					'"hold" only goes on the last key of a chord; the keys before it are held anyway',
					starts[i]
				);
			}
			if (!last && term.gesture === 'turn') {
				this.fail('"turn" must be the last action of a chord', starts[i]);
			}
			this.checkGesture(term, starts[i]);
		});
		return { keepHeld, terms };
	}

	private checkGesture(term: KeyTerm, at: number): void {
		for (const id of targetIds(term.target)) {
			const control = getControl(id);
			if (control.inputs.some((input) => ACCEPTS[term.gesture].includes(input))) continue;
			const spelled = formatTarget(term.target);
			if (control.kind === 'encoder') {
				this.fail(`${spelled} is an encoder: write "turn ${spelled}" or "click ${spelled}"`, at);
			}
			this.fail(
				`cannot ${term.gesture} ${spelled}: ${control.label} is operated by ${control.inputs.join(' / ') || 'nothing'}`,
				at
			);
		}
	}

	private term(): KeyTerm {
		const first = this.peek();
		const next = this.peek(1);
		let gesture: KeyGesture = 'press';
		if (
			first?.kind === 'word' &&
			GESTURE_WORDS.has(first.text.toLowerCase()) &&
			(next?.kind === 'word' || next?.kind === 'bracket')
		) {
			gesture = first.text.toLowerCase() as KeyGesture;
			this.pos++;
		}
		return { gesture, target: this.target() };
	}

	private target(): KeyTarget {
		const start = this.peek()?.start ?? this.input.length;
		const first = this.single();
		if (this.peek()?.kind !== 'slash') return first;
		const options = [first];
		while (this.peek()?.kind === 'slash') {
			this.pos++;
			options.push(this.single());
		}
		const refs = options.filter((o): o is ControlRef => o.kind === 'control');
		if (refs.length !== options.length) {
			this.fail('alternatives ("a/b") must name single controls', start);
		}
		return { kind: 'alternatives', options: refs };
	}

	private single(): ControlRef | PlaceholderTarget | RangeTarget {
		const from = this.name();
		const resolved = this.resolve(from.text, from.start);
		if (this.peek()?.kind !== 'ellipsis') return resolved;
		this.pos++;
		const to = this.name();
		if (resolved.kind !== 'control' || resolved.spelling !== 'token') {
			this.fail(
				`a range must start at a control written by its name, not "${from.text}"`,
				from.start
			);
		}
		const fromToken = getControl(resolved.id).token ?? '';
		const prefix = fromToken.includes(' ') ? fromToken.slice(0, fromToken.indexOf(' ') + 1) : '';
		const end = this.lookup(to.text) ?? (prefix ? this.lookup(prefix + to.text) : undefined);
		if (end?.kind !== 'control' || end.spelling !== 'token') {
			this.fail(`cannot end a range at "${to.text}"`, to.start);
		}
		return this.range(resolved, end, from.start);
	}

	private range(from: ControlRef, to: ControlRef, at: number): RangeTarget {
		const a = getControl(from.id);
		const b = getControl(to.id);
		if (
			a.group !== b.group ||
			!RANGE_GROUPS.has(a.group) ||
			a.index === undefined ||
			b.index === undefined
		) {
			this.fail(
				`"${a.token}…${b.token}" is not a range of one group (encoders, M-keys, tracks, steps or keyboard)`,
				at
			);
		}
		const [lo, hi] = [a.index, b.index];
		if (lo >= hi) this.fail(`a range runs left to right: "${a.token}…${b.token}"`, at);
		const ids = CONTROLS.filter(
			(c) => c.group === a.group && c.index !== undefined && c.index >= lo && c.index <= hi
		)
			.sort((x, y) => (x.index ?? 0) - (y.index ?? 0))
			.map((c) => c.id);
		return { kind: 'range', from, to, ids };
	}

	private name(): { text: string; start: number } {
		const token = this.peek();
		if (!token) this.fail('expected a control at the end');
		if (token.kind === 'bracket') {
			this.pos++;
			return { text: token.text, start: token.start };
		}
		if (token.kind !== 'word') {
			this.fail(
				token.kind === 'plus'
					? 'expected a control before "+" (the plus key is written "[+]")'
					: `expected a control before "${token.text}"`
			);
		}
		const words: string[] = [];
		for (let t = this.peek(); t?.kind === 'word'; t = this.peek()) {
			words.push(t.text);
			this.pos++;
		}
		return { text: words.join(' '), start: token.start };
	}

	private lookup(text: string): ControlRef | PlaceholderTarget | undefined {
		const key = text.toLowerCase();
		const note = keyForNoteName(key);
		if (note === 'out-of-range') return undefined;
		return PLACEHOLDER_BY_NAME.get(key) ?? SPELLINGS.get(key) ?? note ?? LOOSE_NAMES.get(key);
	}

	private resolve(text: string, at: number): ControlRef | PlaceholderTarget {
		const found = this.lookup(text);
		if (found) return found;
		if (keyForNoteName(text.toLowerCase()) === 'out-of-range') {
			this.fail(`"${text}" is outside the keyboard (key F3 … key E5 at the default octave)`, at);
		}
		if (GESTURE_WORDS.has(text.toLowerCase())) {
			this.fail(`"${text}" must be followed by one control, e.g. "${text.toLowerCase()} E1"`, at);
		}
		const hint = closestMatch(text, SUGGESTIONS);
		this.fail(`unknown control "${text}"${hint ? ` — did you mean "${hint}"?` : ''}`, at);
	}
}

// ---------------------------------------------------------------------------------------------
// Public API

/**
 * Parses a key combo such as `shift + M1`, `step 5 + turn E2` or `record + play → play`.
 * @throws {KeyParseError} with the offset of the first problem
 */
export function parseKeys(input: string): KeySequence {
	return new Parser(input, lex(input)).sequence();
}

/** {@link parseKeys} without throwing: for validating agent output or manual units. */
export function tryParseKeys(
	input: string
): { ok: true; value: KeySequence } | { ok: false; error: KeyParseError } {
	try {
		return { ok: true, value: parseKeys(input) };
	} catch (error) {
		if (error instanceof KeyParseError) return { ok: false, error };
		throw error;
	}
}

function spell(ref: ControlRef): string {
	const control = getControl(ref.id);
	if (ref.spelling !== 'token' && control.keyboard)
		return `${ref.spelling} ${control.keyboard.number}`;
	return control.token ?? control.id;
}

function formatTarget(target: KeyTarget): string {
	switch (target.kind) {
		case 'control':
			return spell(target);
		case 'placeholder':
			return target.name;
		case 'range': {
			const from = spell(target.from);
			const to = spell(target.to);
			const prefix = from.includes(' ') ? from.slice(0, from.indexOf(' ') + 1) : '';
			return `${from}…${prefix && to.startsWith(prefix) ? to.slice(prefix.length) : to}`;
		}
		case 'alternatives':
			return target.options.map(spell).join('/');
	}
}

function formatTerm(term: KeyTerm): string {
	return (term.gesture === 'press' ? '' : `${term.gesture} `) + formatTarget(term.target);
}

/** Prints a sequence in canonical form (`formatKeys(parseKeys(s))` normalises `s`). */
export function formatKeys(sequence: KeySequence): string {
	return sequence.chords
		.map((chord, i) => {
			const joiner = i === 0 ? '' : chord.keepHeld ? ' → + ' : ' → ';
			return joiner + chord.terms.map(formatTerm).join(' + ');
		})
		.join('');
}

/** Parses and prints back: the canonical spelling of a combo. */
export function normalizeKeys(input: string): string {
	return formatKeys(parseKeys(input));
}

/** Every control a target may refer to (all candidates of placeholders, ranges, alternatives). */
export function targetIds(target: KeyTarget): readonly ControlId[] {
	switch (target.kind) {
		case 'control':
			return [target.id];
		case 'placeholder':
		case 'range':
			return target.ids;
		case 'alternatives':
			return target.options.map((o) => o.id);
	}
}

/** Every control a sequence touches, in order of first appearance (for highlighting). */
export function keyControlIds(sequence: KeySequence): ControlId[] {
	const ids = new Set<ControlId>();
	for (const chord of sequence.chords) {
		for (const term of chord.terms) for (const id of targetIds(term.target)) ids.add(id);
	}
	return [...ids];
}
