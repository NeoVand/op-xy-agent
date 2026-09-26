/**
 * Parser for key-combo notation used across the app, the manual and the agent, following TE's guide
 * conventions: `+` means "hold the first, press the next" and `→` (or `->`, `then`) means "then".
 * Leading verbs such as `hold` or `turn` become small words before the key.
 *
 *   parseCombo('shift + M1')            → [shift] + [M1]
 *   parseCombo('hold record + play')    → hold [●] + [▶]
 *   parseCombo('shift → step 1')        → [shift] → [step 1]
 *   parseCombo('shift + turn dark encoder')
 */
import type { EncoderNumber } from './types';

/** Keys whose legend is a pictogram on the device. */
export type KeyGlyph = 'record' | 'play' | 'stop' | 'plus' | 'minus';

/** One part of a parsed combo. `id` is stable for a given input, for keyed rendering. */
export type ComboPart =
	| { kind: 'key'; id: string; legend: string; glyph?: KeyGlyph; encoder?: EncoderNumber }
	| { kind: 'join'; id: string; op: '+' | 'then' }
	| { kind: 'word'; id: string; text: string };

const VERBS = new Set(['hold', 'press', 'tap', 'turn', 'click', 'release']);

const GLYPHS: Record<string, KeyGlyph> = {
	record: 'record',
	rec: 'record',
	play: 'play',
	stop: 'stop',
	plus: 'plus',
	'+': 'plus',
	minus: 'minus',
	'-': 'minus',
	'−': 'minus'
};

const ENCODERS: Record<string, EncoderNumber> = {
	enc1: 1,
	enc2: 2,
	enc3: 3,
	enc4: 4,
	'encoder 1': 1,
	'encoder 2': 2,
	'encoder 3': 3,
	'encoder 4': 4,
	'dark encoder': 1,
	'dark grey encoder': 1,
	'mid encoder': 2,
	'mid grey encoder': 2,
	'light encoder': 3,
	'light grey encoder': 3,
	'white encoder': 4
};

const ENCODER_LEGENDS = [
	'dark grey encoder',
	'mid grey encoder',
	'light grey encoder',
	'white encoder'
];

/** Joiners need spaces around them so a bare `+` or `-` can still be a key. */
const JOINER = /\s+(\+|→|->|then)\s+/;

/**
 * Parse combo notation into keys, joiners and verbs.
 * @param input Notation such as `shift + M1`. Whitespace is trimmed; empty input yields `[]`.
 */
export function parseCombo(input: string): ComboPart[] {
	const text = input.trim();
	if (!text) return [];
	const pieces = text.split(JOINER);
	const parts: ComboPart[] = [];

	pieces.forEach((piece, index) => {
		if (index % 2 === 1) {
			parts.push({ kind: 'join', id: `${index}:join`, op: piece === '+' ? '+' : 'then' });
			return;
		}
		let rest = piece.trim();
		let word = 0;
		for (let m = /^(\S+)\s+(.+)$/.exec(rest); m && VERBS.has(m[1].toLowerCase());) {
			parts.push({ kind: 'word', id: `${index}:word:${word++}`, text: m[1].toLowerCase() });
			rest = m[2];
			m = /^(\S+)\s+(.+)$/.exec(rest);
		}
		if (rest) parts.push(toKey(rest, `${index}:key`));
	});

	return parts;
}

function toKey(legend: string, id: string): ComboPart {
	const lookup = legend.toLowerCase();
	const encoder = ENCODERS[lookup];
	if (encoder) return { kind: 'key', id, legend: ENCODER_LEGENDS[encoder - 1], encoder };
	const glyph = GLYPHS[lookup];
	if (glyph) return { kind: 'key', id, legend: glyph, glyph };
	return { kind: 'key', id, legend };
}
