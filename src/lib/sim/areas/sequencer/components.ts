/**
 * Step components (manual: sequencer/step-components, step-component-reference): with `shift` held
 * the step keys select steps, a white key adds (or removes) its component on them and a black key
 * sets that component's digit. The screen names each component and what its digit does, in our
 * words.
 */
import type { SimState } from '../../params';
import {
	STEP_COMPONENTS,
	getComponent,
	setComponentValue,
	toggleComponent,
	type StepComponentKind
} from '../../sequencer';
import { BEND_SHAPES, COMPONENT_VELOCITIES, TONALITIES, rampSpan } from '../../sequencer-playback';
import type { ComponentsFrame, Presence } from './frames';
import { activePattern, barDown, remember, seq } from './model';

/** Keyboard keys (0 = F3 … 23 = E5) of the 14 naturals, `natural 1` first. */
export const NATURALS = [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23] as const;
/** Keyboard keys of the 10 accidentals, `accidental 1` … `accidental 9`, then `accidental 0`. */
export const ACCIDENTALS = [1, 3, 5, 8, 10, 13, 15, 17, 20, 22] as const;

/** The digit (1–9, 0) of an accidental keyboard key, or null for a natural. */
export function accidentalDigit(key: number): number | null {
	const at = (ACCIDENTALS as readonly number[]).indexOf(key);
	return at < 0 ? null : (at + 1) % 10;
}

/** The natural number (0 = `natural 1` … 13) of a keyboard key, or null for an accidental. */
export function naturalIndex(key: number): number | null {
	const at = (NATURALS as readonly number[]).indexOf(key);
	return at < 0 ? null : at;
}

/** The keyboard key of an accidental digit (1–9, 0). */
export const accidentalKey = (digit: number) => ACCIDENTALS[(digit + 9) % 10];

/** Screen names of the components (the skips shortened to fit). */
export const COMPONENT_NAMES = [
	'pulse',
	'pulse hold',
	'multiply',
	'velocity',
	'ramp up',
	'ramp down',
	'random',
	'portamento',
	'bend',
	'tonality',
	'jump',
	'skip lock',
	'skip component',
	'skip trigger'
] as const;

/** The pictogram of each component (TE's key icons, traced into sequencer.json). */
export const COMPONENT_ICONS = [
	'sequencer.pulse',
	'sequencer.pulse-hold',
	'sequencer.multiply',
	'sequencer.velocity',
	'sequencer.ramp-up',
	'sequencer.ramp-down',
	'sequencer.random',
	'sequencer.portamento',
	'sequencer.bend',
	'sequencer.tonality',
	'sequencer.jump',
	'sequencer.skip-lock',
	'sequencer.skip-component',
	'sequencer.skip-trigger'
] as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ordinal = (n: number) => `${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** What a component's digit does, in our words (the device spells it out on screen). */
export function describeComponent(kind: StepComponentKind, digit: number): string {
	switch (kind) {
		case 'pulse':
			return digit === 0 ? 'random repeats' : plural(digit, 'repeat');
		case 'pulse hold':
			return digit === 0 ? 'random hold' : `hold ${plural(digit, 'step')}`;
		case 'multiply':
			return digit === 0 ? 'random hits' : plural(digit, 'hit');
		case 'velocity':
			return digit === 0 ? 'random velocity' : `velocity ${COMPONENT_VELOCITIES[digit - 1]}`;
		case 'ramp up':
		case 'ramp down':
		case 'random': {
			const { stages, octaves } = rampSpan(digit);
			return `${stages} steps ${plural(octaves, 'octave')}`;
		}
		case 'portamento':
			return digit === 0 ? 'random glide' : `glide ${digit * 10}%`;
		case 'bend':
			return BEND_SHAPES[(digit + 9) % 10];
		case 'tonality': {
			const t = TONALITIES[(digit + 9) % 10];
			return t.startsWith('quantise') ? `${t}%` : t;
		}
		case 'jump':
			if (digit >= 1 && digit <= 4) return `to step ${(digit - 1) * 4 + 1}`;
			return (
				['skip ahead', 'step back', 'ahead or back', 'stay', 'realign'][digit - 5] ?? 'random step'
			);
		default:
			if (digit === 1) return 'every pass';
			return digit === 0 ? 'random passes' : `every ${ordinal(digit)} pass`;
	}
}

/** Whether the step component gesture owns the keys: shift held with steps selected. */
export function componentsActive(s: SimState): boolean {
	const st = seq(s);
	return (
		s.shift &&
		(s.mode === 'instrument' || s.mode === 'auxiliary') &&
		!barDown(s) &&
		s.sub === null &&
		s.picker === null &&
		(st.selection.length > 0 || st.component !== null)
	);
}

/** Shift + a step key: selects the step, or lets it go again. */
export function selectStep(s: SimState, index: number): void {
	const st = seq(s);
	if (index >= activePattern(s).length) return;
	const at = st.selection.indexOf(index);
	if (at >= 0) st.selection.splice(at, 1);
	else st.selection.push(index);
}

/**
 * A keyboard key while steps are selected: a natural toggles its component on them and becomes the
 * chosen one; an accidental sets the chosen component's digit.
 */
export function componentKey(s: SimState, key: number): void {
	const st = seq(s);
	const pattern = activePattern(s);
	const natural = naturalIndex(key);
	if (natural !== null) {
		if (st.selection.length === 0) return;
		remember(s);
		toggleComponent(pattern, st.selection, STEP_COMPONENTS[natural].kind);
		st.component = natural;
		return;
	}
	const digit = accidentalDigit(key);
	if (digit === null || st.component === null || st.selection.length === 0) return;
	remember(s);
	setComponentValue(pattern, st.selection, STEP_COMPONENTS[st.component].kind, digit);
}

/** Shift came up: the gesture ends. */
export function endComponents(s: SimState): void {
	const st = seq(s);
	st.selection = [];
	st.component = null;
}

/** What each component is on the selected steps. */
export function presence(s: SimState): Presence[] {
	const st = seq(s);
	const pattern = activePattern(s);
	const steps = st.selection.map((i) => pattern.steps[i]);
	return STEP_COMPONENTS.map(({ kind }) => {
		const n = steps.filter((step) => step && getComponent(step, kind)).length;
		return n === 0 ? 'none' : n === steps.length ? 'all' : 'some';
	});
}

/** The step component page. */
export function componentsFrame(s: SimState): ComponentsFrame {
	const st = seq(s);
	const pattern = activePattern(s);
	let chosen: ComponentsFrame['chosen'] = null;
	if (st.component !== null) {
		const { kind, defaultValue } = STEP_COMPONENTS[st.component];
		const digits = [
			...new Set(
				st.selection.flatMap((i) => {
					const c = getComponent(pattern.steps[i], kind);
					return c ? [c.value] : [];
				})
			)
		];
		const digit = digits.length === 1 ? digits[0] : null;
		chosen = {
			index: st.component,
			name: COMPONENT_NAMES[st.component],
			digit,
			value: digits.length === 0 ? 'off' : describeComponent(kind, digit ?? defaultValue)
		};
		if (digits.length > 1) chosen = { ...chosen, value: 'mixed' };
	}
	return {
		page: 'components',
		steps: [...st.selection].sort((a, b) => a - b).map((i) => i + 1),
		present: presence(s),
		chosen
	};
}
