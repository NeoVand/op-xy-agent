/**
 * The control id scheme: `<group>.<name>`, lower case, stable forever (a rename adds an alias in
 * `knowledge/opxy/controls.json`, never a new id).
 *
 * | group      | ids                                                                        |
 * | ---------- | -------------------------------------------------------------------------- |
 * | `key`      | the 20 function keys: `key.project` … `key.shift` ({@link FUNCTION_KEY_NAMES}) |
 * | `track`    | track keys `track.1` … `track.8` (instrument 1–8 or auxiliary 9–16 by mode)  |
 * | `step`     | sequencer steps `step.1` … `step.16`                                        |
 * | `keyboard` | the 24 keys by note, C4 = 60: `keyboard.f3`, `keyboard.fs3` … `keyboard.e5`  |
 * | `encoder`  | `encoder.1` … `encoder.4` = dark gray, mid gray, light gray, white           |
 * | others     | `knob.volume`, `strip.pitchbend`, `screen.main`, `port.usb`, … ({@link OTHER_CONTROL_IDS}) |
 *
 * The TypeScript union below is the contract; the loader rejects a `controls.json` whose ids differ.
 */

/** Names of the 20 function keys, in panel reading order (row by row, left to right). */
export const FUNCTION_KEY_NAMES = [
	'sample',
	'project',
	'tempo',
	'com',
	'instrument',
	'auxiliary',
	'arrange',
	'mix',
	'm1',
	'm2',
	'm3',
	'm4',
	'player',
	'bar',
	'record',
	'play',
	'stop',
	'minus',
	'plus',
	'shift'
] as const;

/**
 * The 24 keyboard keys from low F to high E at the default octave (C4 = 60, so `f3` = MIDI 53).
 * `s` marks a sharp: `fs3` is F♯3.
 */
export const KEYBOARD_NOTE_NAMES = [
	'f3',
	'fs3',
	'g3',
	'gs3',
	'a3',
	'as3',
	'b3',
	'c4',
	'cs4',
	'd4',
	'ds4',
	'e4',
	'f4',
	'fs4',
	'g4',
	'gs4',
	'a4',
	'as4',
	'b4',
	'c5',
	'cs5',
	'd5',
	'ds5',
	'e5'
] as const;

/** MIDI note of the leftmost keyboard key (F3 with C4 = 60) at the default octave. */
export const KEYBOARD_FIRST_NOTE = 53;

/** Controls that are not keys or encoders: knob, strip, screen, indicators, ports, markings. */
export const OTHER_CONTROL_IDS = [
	'knob.volume',
	'strip.pitchbend',
	'screen.main',
	'speaker.internal',
	'mic.internal',
	'meter.level',
	'led.charge',
	'switch.power',
	'port.lineOut',
	'port.multiOut',
	'port.midiIn',
	'port.lineIn',
	'port.usb',
	'marking.tick'
] as const;

/** A function-key name, e.g. `shift`. */
export type FunctionKeyName = (typeof FUNCTION_KEY_NAMES)[number];
/** A keyboard note name, e.g. `fs3`. */
export type KeyboardNoteName = (typeof KEYBOARD_NOTE_NAMES)[number];
/** Track key number 1–8. */
export type TrackKeyNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
/** Sequencer step number 1–16. */
export type StepNumber = TrackKeyNumber | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
/** Encoder number 1–4 (dark gray, mid gray, light gray, white). */
export type EncoderNumber = 1 | 2 | 3 | 4;

/** `key.shift`, `key.m1`, … */
export type FunctionKeyId = `key.${FunctionKeyName}`;
/** `track.1` … `track.8` */
export type TrackKeyId = `track.${TrackKeyNumber}`;
/** `step.1` … `step.16` */
export type StepKeyId = `step.${StepNumber}`;
/** `keyboard.f3` … `keyboard.e5` */
export type KeyboardKeyId = `keyboard.${KeyboardNoteName}`;
/** `encoder.1` … `encoder.4` */
export type EncoderId = `encoder.${EncoderNumber}`;
/** Any of the 68 keys. */
export type KeyId = FunctionKeyId | TrackKeyId | StepKeyId | KeyboardKeyId;
/** Any physical control or feature in the inventory. */
export type ControlId = KeyId | EncoderId | (typeof OTHER_CONTROL_IDS)[number];

function numbered<P extends string>(prefix: P, count: number): `${P}.${number}`[] {
	return Array.from({ length: count }, (_, i) => `${prefix}.${i + 1}` as const);
}

/** Every key id (68), grouped: function keys, tracks, steps, keyboard. */
export const KEY_IDS = [
	...FUNCTION_KEY_NAMES.map((name) => `key.${name}` as const),
	...(numbered('track', 8) as TrackKeyId[]),
	...(numbered('step', 16) as StepKeyId[]),
	...KEYBOARD_NOTE_NAMES.map((note) => `keyboard.${note}` as const)
] as const satisfies readonly KeyId[];

/** Every control id in the inventory (86). */
export const CONTROL_IDS = [
	...KEY_IDS,
	...(numbered('encoder', 4) as EncoderId[]),
	...OTHER_CONTROL_IDS
] as const satisfies readonly ControlId[];

const CONTROL_ID_SET: ReadonlySet<string> = new Set(CONTROL_IDS);

/** Type guard for runtime strings (tool input, URL params, stored state). */
export function isControlId(value: unknown): value is ControlId {
	return typeof value === 'string' && CONTROL_ID_SET.has(value);
}
