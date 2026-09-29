/**
 * The replica's own drawing of each control, cut down to a glyph that sits in a line of text, so
 * the manual and the chat can draw `shift + M1` as the two real keys rather than as names the
 * device never prints: "M3" is the key printed 3 under the screen, "T5" the track key printed 5
 * beside a jack, "accidental 1" the key printed 1 on the num row. Legends, colours and LED windows
 * are the panel drawing's (`art.generated.ts`) and controls.json's, as on the replica. Pure data.
 */
import {
	getControl,
	keyControlIds,
	tryParseKeys,
	type ControlId,
	type KeyPlaceholder,
	type KeySequence,
	type KeyTarget
} from '$lib/core/opxy';
import type { ArtCircle, ArtPath } from '../art.types';
import { ENCODER_PARTS, KEY_PARTS, VOLUME_PART } from '../geometry';

/** Half the side of a key glyph, in millimetres: the cap and a thin rim of its tile. */
export const KEY_HALF = 6.1;
/** Half the side of an encoder glyph: the dish round the knob, with room for turn arrows. */
export const ENCODER_HALF = 6.6;

/** A key: its cap with TE's legend and LED window, on a square of its tile. */
export interface KeyGlyphArt {
	readonly kind: 'key';
	readonly capR: number;
	readonly colors: { readonly tile: string; readonly cap: string; readonly legend: string };
	/** A pale cap (the light step keys), which takes darker shading and a dark mark. */
	readonly light: boolean;
	/** The cap's printed artwork, cap-local millimetres. */
	readonly legend: readonly ArtPath[];
	readonly led: ArtCircle | null;
	/** Our text on a cap TE leaves blank: a step's number, a placeholder's letter. */
	readonly mark: string | null;
}

/** An encoder: its coloured cap on the black knob, in its dish. */
export interface EncoderGlyphArt {
	readonly kind: 'encoder';
	readonly colors: { readonly cap: string; readonly body: string; readonly dish: string };
	/** The cap's radius (the knob's is 5). */
	readonly top: number;
	/** 0 dark … 3 white: which way the cap's shading goes. */
	readonly tone: number;
}

/** The volume pot in its hole. */
export interface VolumeGlyphArt {
	readonly kind: 'volume';
	readonly colors: { readonly tile: string; readonly body: string };
	/** The pointer dimple's distance from the centre and its radius. */
	readonly dimple: { readonly reach: number; readonly r: number };
}

/** What a glyph draws. */
export type GlyphArt =
	| KeyGlyphArt
	| EncoderGlyphArt
	| VolumeGlyphArt
	| { readonly kind: 'pitchbend' }
	| { readonly kind: 'power' };

const KEYS = new Map(KEY_PARTS.map((part) => [part.id as ControlId, part]));
const ENCODERS = new Map(ENCODER_PARTS.map((part) => [part.id as ControlId, part]));

/** The glyph of one control, or null for one that is never pressed or turned (the screen). */
export function controlGlyph(id: ControlId): GlyphArt | null {
	const key = KEYS.get(id);
	if (key) {
		return {
			kind: 'key',
			capR: key.art.capRadius,
			colors: key.colors,
			light: key.light,
			legend: key.capLegend,
			led: key.art.led,
			// the step keys are blank on the device; the glyph says which one
			mark: key.control.group === 'step' ? String(key.control.index) : null
		};
	}
	const encoder = ENCODERS.get(id);
	if (encoder) {
		return {
			kind: 'encoder',
			colors: { cap: encoder.colors.cap, body: encoder.colors.body, dish: encoder.colors.tile },
			top: encoder.art.top,
			tone: encoder.tone
		};
	}
	const control = getControl(id);
	if (control.kind === 'knob') {
		const { dimple } = VOLUME_PART.art;
		return {
			kind: 'volume',
			colors: VOLUME_PART.colors,
			dimple: { reach: Math.hypot(dimple.x, dimple.y), r: dimple.r }
		};
	}
	if (control.kind === 'pitchbend') return { kind: 'pitchbend' };
	if (control.kind === 'switch') return { kind: 'power' };
	return null;
}

/** Which key a placeholder is drawn as, and the letter on its cap. */
const PLACEHOLDERS: Readonly<Record<KeyPlaceholder, { from: ControlId; mark: string }>> = {
	Tn: { from: 'track.1', mark: 'n' },
	Tm: { from: 'track.1', mark: 'm' },
	'step n': { from: 'step.8', mark: 'n' },
	'step m': { from: 'step.8', mark: 'm' },
	steps: { from: 'step.8', mark: 'n' },
	key: { from: 'keyboard.c4', mark: 'n' },
	keys: { from: 'keyboard.c4', mark: 'n' },
	natural: { from: 'keyboard.c4', mark: 'n' },
	naturals: { from: 'keyboard.c4', mark: 'n' },
	accidental: { from: 'keyboard.cs4', mark: 'n' },
	accidentals: { from: 'keyboard.cs4', mark: 'n' }
};

/** A placeholder ("any track key") as a key of its group with a letter where the legend was. */
export function placeholderGlyph(name: KeyPlaceholder): KeyGlyphArt {
	const { from, mark } = PLACEHOLDERS[name];
	const art = controlGlyph(from) as KeyGlyphArt;
	return { ...art, legend: [], mark };
}

/** What the reader is told a glyph is: the manual's name, and the unit's own where it differs. */
export function controlName(id: ControlId): string {
	const control = getControl(id);
	if (control.keyboard) {
		const { type, number, name } = control.keyboard;
		return `${type} ${number} · ${name}`;
	}
	if (control.track) return `${control.token} · track ${control.track.instrument}`;
	const token = control.token ?? control.label;
	// "player" is labelled "players": say more only when the label is another name
	return control.label.toLowerCase().startsWith(token.toLowerCase())
		? token
		: `${token} · ${control.label}`;
}

const PLACEHOLDER_NAMES: Readonly<Record<KeyPlaceholder, string>> = {
	Tn: 'Tn · any track key, T1–T8',
	Tm: 'Tm · another track key',
	'step n': 'step n · any step key, 1–16',
	'step m': 'step m · another step key',
	steps: 'steps · one or more step keys',
	key: 'key · any keyboard key',
	keys: 'keys · one or more keyboard keys',
	natural: 'natural · any key of the lower keyboard row',
	naturals: 'naturals · one or more keys of the lower keyboard row',
	accidental: 'accidental · any key of the num row',
	accidentals: 'accidentals · one or more keys of the num row'
};

/** What the reader is told a placeholder stands for. */
export function placeholderName(name: KeyPlaceholder): string {
	return PLACEHOLDER_NAMES[name];
}

/** One glyph of a combo: what it draws, what it is called, and the controls it can mean. */
export interface ComboGlyph {
	readonly kind: 'glyph';
	readonly art: GlyphArt | null;
	readonly name: string;
	readonly ids: readonly ControlId[];
	/** One or more of a group (`steps`): drawn as two keys, one behind the other. */
	readonly stacked: boolean;
	/** Drawn with arrows round it (an encoder or the volume knob being turned). */
	readonly turn: boolean;
}

/** A piece of a combo drawn as glyphs, joiners and small words. */
export type ComboPiece =
	| ComboGlyph
	/** `+` hold the keys before and press this one; `→` let go, then; `→ +` then, still holding. */
	| { readonly kind: 'join'; readonly op: '+' | '→' | '→ +' }
	/** A gesture word before its key: hold, turn, click. */
	| { readonly kind: 'word'; readonly text: string }
	/** Between the ends of a range (`…`) or alternatives (`/`). */
	| { readonly kind: 'sep'; readonly text: '…' | '/' };

/** Ranges this short are drawn in full (`E1…E4`: all four knobs); longer ones by their ends. */
const FULL_RANGE = 4;

function glyphOf(id: ControlId, turn: boolean): ComboGlyph {
	return {
		kind: 'glyph',
		art: controlGlyph(id),
		name: controlName(id),
		ids: [id],
		stacked: false,
		turn
	};
}

function targetPieces(target: KeyTarget, turn: boolean): ComboPiece[] {
	switch (target.kind) {
		case 'control':
			return [glyphOf(target.id, turn)];
		case 'placeholder':
			return [
				{
					kind: 'glyph',
					art: placeholderGlyph(target.name),
					name: placeholderName(target.name),
					ids: target.ids,
					stacked: target.plural,
					turn
				}
			];
		case 'range': {
			if (target.ids.length <= FULL_RANGE) return target.ids.map((id) => glyphOf(id, turn));
			return [
				glyphOf(target.from.id, turn),
				{ kind: 'sep', text: '…' },
				glyphOf(target.to.id, turn)
			];
		}
		case 'alternatives':
			return target.options.flatMap((option, i) => [
				...(i > 0 ? [{ kind: 'sep', text: '/' } as const] : []),
				glyphOf(option.id, turn)
			]);
	}
}

/**
 * A key combo, or an encoder or knob named in text (`E1`, `E1…E4`, `volume`: the manual's check lets
 * a bare turnable control stand for itself), parsed; null when it is neither. A mention reads as
 * `turn …` in the grammar but is drawn without the word or the arrows.
 */
export function parseCombo(keys: string): { sequence: KeySequence; mention: boolean } | null {
	const parsed = tryParseKeys(keys);
	if (parsed.ok) return { sequence: parsed.value, mention: false };
	if (/[+→]|->/.test(keys)) return null;
	const named = tryParseKeys(`turn ${keys}`);
	return named.ok ? { sequence: named.value, mention: true } : null;
}

/** Every control a combo or mention can touch (none when it does not parse): what pointing rings. */
export function comboIds(keys: string): ControlId[] {
	const parsed = parseCombo(keys);
	return parsed ? keyControlIds(parsed.sequence) : [];
}

/**
 * A parsed combo as the pieces the glyph row draws, in reading order; a `mention` (a control named,
 * not acted on) draws only the controls.
 */
export function comboPieces(sequence: KeySequence, mention = false): ComboPiece[] {
	const pieces: ComboPiece[] = [];
	sequence.chords.forEach((chord, c) => {
		if (c > 0) pieces.push({ kind: 'join', op: chord.keepHeld ? '→ +' : '→' });
		chord.terms.forEach((term, t) => {
			if (t > 0) pieces.push({ kind: 'join', op: '+' });
			if (term.gesture !== 'press' && !mention) pieces.push({ kind: 'word', text: term.gesture });
			pieces.push(...targetPieces(term.target, term.gesture === 'turn' && !mention));
		});
	});
	return pieces;
}
