/**
 * The keys page of the manual ("which key is which"): every control the manual and the agent name,
 * grouped the way the panel groups them, each with the name we use and a few words the device does
 * not print (a module key's page, a track key's auxiliary track, a keyboard key's note). Pure data
 * from controls.json; the page draws each one as the device's own key.
 */
import { CONTROLS, getControl, type Control, type ControlId } from '$lib/core/opxy';

/** What the manual's layout calls the keys page when it marks where the reader is. */
export const KEYS_PAGE = 'keys';

/** One key on the page. */
export interface KeyEntry {
	readonly id: ControlId;
	/** The manual's name for it: its token in the key grammar (`M3`, `T5`, `step 5`). */
	readonly name: string;
	/** What the device does not print: its page, track, note or job. */
	readonly note: string;
	/** What pressing its card plays on the replica. */
	readonly keys: string;
	/** The whole story, for the tooltip. */
	readonly tip: string;
	/** On the keyboard: the row (1 the num row, 2 the lower row) and the half-column from the left. */
	readonly place?: { readonly row: 1 | 2; readonly half: number };
}

/** A group of keys under one heading. */
export interface KeyGroup {
	readonly id: string;
	readonly title: string;
	/** A sentence in the manual's markdown (backticked keys draw as keys). */
	readonly about: string;
	readonly keys: readonly KeyEntry[];
	/** Draw the group as a row that wraps like the panel (steps, the keyboard) rather than cards. */
	readonly layout: 'cards' | 'row';
}

const MODULE_PAGES = ['engine', 'envelopes', 'filter', 'LFO'];

const FUNCTION_NOTES: Partial<Record<ControlId, string>> = {
	'key.instrument': 'the eight instrument tracks',
	'key.auxiliary': 'the eight auxiliary tracks',
	'key.arrange': 'patterns, scenes and songs',
	'key.mix': 'the mixer and the master',
	'key.project': 'projects',
	'key.tempo': 'tempo, groove and metronome',
	'key.sample': 'the sampler',
	'key.com': 'settings, MIDI and outputs',
	'key.player': 'arpeggio, maestro and hold',
	'key.bar': 'bars and quantise',
	'key.record': 'record into the sequence',
	'key.play': 'play the song',
	'key.stop': 'stop, and again to silence',
	'key.shift': 'second functions',
	'key.minus': 'octave down',
	'key.plus': 'octave up'
};

const ENCODER_NOTES = ['dark gray', 'mid gray', 'light gray', 'white'];

function entry(control: Control, note: string): KeyEntry {
	const name = control.token ?? control.label;
	const turnable = control.inputs.some((input) => input === 'turn' || input === 'rotate');
	return {
		id: control.id,
		name,
		note,
		keys: turnable ? `turn ${name}` : name,
		tip: note ? `${name} · ${note}` : name
	};
}

/** The keyboard's first natural, which the others are placed from (15.5 mm a column). */
const KEYBOARD = CONTROLS.filter((c) => c.keyboard).sort(
	(a, b) => (a.keyboard?.note ?? 0) - (b.keyboard?.note ?? 0)
);
const KEYBOARD_X = KEYBOARD[0].geometry.center.x;

function keyboardEntry(control: Control): KeyEntry {
	const {
		type,
		number,
		name: note,
		stepComponent
	} = control.keyboard ?? {
		type: 'natural',
		number: 0,
		name: '',
		stepComponent: undefined
	};
	const name = `${type} ${number}`;
	return {
		id: control.id,
		name,
		note,
		keys: control.token ?? name,
		tip: [`${name} · ${note}`, stepComponent ? `step component: ${stepComponent}` : null]
			.filter(Boolean)
			.join(' · '),
		place: {
			row: type === 'accidental' ? 1 : 2,
			half: Math.round(((control.geometry.center.x - KEYBOARD_X) / 15.5) * 2)
		}
	};
}

const byGroup = (group: string) => CONTROLS.filter((c) => c.group === group);

/** Every group, in the order the page shows them. */
export const KEY_GROUPS: readonly KeyGroup[] = [
	{
		id: 'modules',
		title: 'Under the screen',
		about:
			'`M1…M4` open the four pages of the selected track: on an instrument track its engine, envelopes, filter and LFO. With `shift` they open the page’s second layer.',
		layout: 'cards',
		keys: byGroup('module').map((c, i) => entry(c, `page ${i + 1} · ${MODULE_PAGES[i]}`))
	},
	{
		id: 'tracks',
		title: 'Tracks',
		about:
			'`T1…T8` select a track. After `auxiliary` they select the eight auxiliary tracks instead, the brain to FX II.',
		layout: 'cards',
		keys: byGroup('track').map((c) =>
			entry(c, `track ${c.track?.instrument} · ${c.track?.auxiliary.name}`)
		)
	},
	{
		id: 'modes',
		title: 'Modes and functions',
		about:
			'The keys round the screen: the four modes, then the pages and tools you open from anywhere.',
		layout: 'cards',
		keys: [...byGroup('mode'), ...byGroup('function')].map((c) =>
			entry(c, FUNCTION_NOTES[c.id] ?? c.label)
		)
	},
	{
		id: 'transport',
		title: 'Transport and shift',
		about: 'Recording, playing and stopping, the octave keys and `shift`, which every combo holds.',
		layout: 'cards',
		keys: byGroup('transport').map((c) => entry(c, FUNCTION_NOTES[c.id] ?? c.label))
	},
	{
		id: 'steps',
		title: 'Steps',
		about:
			'The sixteen step keys carry no print: the manual counts them from the left, `step 1…16`, dark to white.',
		layout: 'row',
		keys: byGroup('step').map((c) => entry(c, `step ${c.index}`))
	},
	{
		id: 'keyboard',
		title: 'Keyboard',
		about:
			'The lower row are the naturals, counted from the left: `natural 1` is F3, `natural 14` is E5. The num row above holds the accidentals, named by the digit printed on them, `accidental 1` to `accidental 9` and `accidental 0`. The manual also names a key by its note: `key F#3`.',
		layout: 'row',
		keys: KEYBOARD.map(keyboardEntry)
	},
	{
		id: 'encoders',
		title: 'Encoders',
		about:
			'`E1…E4`, left to right: their caps are the colours the screen marks their values with. Turn one, or click it.',
		layout: 'cards',
		keys: byGroup('encoder').map((c, i) => entry(c, ENCODER_NOTES[i]))
	},
	{
		id: 'others',
		title: 'Knob, pad and switch',
		about: 'The volume knob, the pitch-bend pad on the front edge and the power switch.',
		layout: 'cards',
		keys: (
			[
				['knob.volume', 'the output level'],
				['strip.pitchbend', 'bends the notes'],
				['switch.power', 'on and off']
			] as [ControlId, string][]
		).map(([id, note]) => entry(getControl(id), note))
	}
];

/** The notation, one example per rule, with what it means. */
export const NOTATION: readonly { keys: string; means: string }[] = [
	{ keys: 'shift + M1', means: 'hold shift and press M1: every key but the last is held' },
	{ keys: 'record + play → play', means: 'press the two together, let go, then press play' },
	{ keys: 'shift + player → + turn E1', means: '`→ +` keeps the keys before it held' },
	{ keys: 'hold com', means: 'a long press' },
	{ keys: 'turn E2', means: 'turn an encoder (`click E2` pushes it)' },
	{
		keys: 'step n + turn E1…E4',
		means: 'any step, any encoder: a letter or a range stands for a group'
	},
	{ keys: '[-]/[+]', means: 'either key' },
	{ keys: 'key F#3', means: 'a keyboard key by its note' }
];
