// Portions derived from kmorrill/xy-format (MIT, Copyright (c) 2026 Kevin Morrill): the enums of
// xy/project_config_inspection.py and xy/image_writer.py, the p-lock columns of
// ImageProject.PLOCK_PARAMS and the groove detents of xy/bar_menu_inspection.py.
//
// The decoded project model: what `readProject` returns and `writeProject` takes. It holds what we
// know how to read and write (docs/research/10-xy-format.md §3): the project settings, the 100 scene
// slots, each track's patterns with their notes, step components and parameter locks, and the 14
// songs. Values are the file's own (ticks, raw bytes, 0–32767 lock values) where the file is exact,
// so a project read and written again comes back byte for byte; `sound` is read-only for now.

/** A note record (§3.7). */
export interface XyNote {
	/**
	 * Start in ticks from the pattern's first step, 480 a step: step s (0-based) is s × 480 on the grid.
	 * Other values are micro-timing, and a negative one is a pickup before the first step.
	 */
	tick: number;
	/** Length in ticks: 240 (half a step) is the grid's default, 7680 sixteen steps. */
	gate: number;
	/** MIDI note, 0–127. */
	note: number;
	/** 1–127. */
	velocity: number;
	/**
	 * The record's last two bytes as a little-endian u16: 0 for programmed notes; the device wrote 2
	 * on some recorded drum notes, and 127 made it re-trigger (probe 07). Kept as read.
	 */
	flags: number;
}

/** Step components, in the order of their bit in a step's 16 bytes (the guide's white keys). */
export const XY_STEP_COMPONENTS = [
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
	'skip parameter lock',
	'skip step component',
	'skip trigger'
] as const;

/** A step component by its guide name. */
export type XyComponentKind = (typeof XY_STEP_COMPONENTS)[number];

/** A step component on a step (§3.8). */
export interface XyStepComponent {
	/** 0-based step, 0–63. */
	step: number;
	kind: XyComponentKind;
	/** The accidental digit, 1–9 or 0 (0 is the tenth variation, random for most). */
	value: number;
}

/** A parameter lock: one armed cell of the pattern's 64-step × 42-column table (§3.9). */
export interface XyLock {
	/** 0-based step, 0–63. */
	step: number;
	/** 0–41; {@link XY_LOCK_COLUMNS} names the known ones. */
	column: number;
	/** u16; knob lanes run 0–32767 (a CC value v is stored as round(v / 127 × 32767)). */
	value: number;
}

/** One column of the lock table. */
export interface XyLockColumn {
	readonly column: number;
	/** The bit of a step's lock mask that arms it: column c is bit c − 1, column 0 is bit 41. */
	readonly bit: number;
	/** Upstream's name (CC-neutral for the two LFO columns, note 10 A.11), or null while unmapped. */
	readonly name: string | null;
	/** The CC that records into it (hold-record captures u121–u126), or null. */
	readonly cc: number | null;
}

const COLUMN_NAMES: Readonly<Record<number, readonly [string, number]>> = {
	0: ['volume', 7],
	1: ['param1', 12],
	2: ['param2', 13],
	3: ['param3', 14],
	4: ['param4', 15],
	9: ['amp_attack', 20],
	10: ['amp_decay', 21],
	11: ['amp_sustain', 22],
	12: ['amp_release', 23],
	13: ['poly', 28],
	14: ['portamento', 29],
	15: ['pitch_bend', 30],
	16: ['engine_volume', 31],
	17: ['cutoff', 32],
	18: ['resonance', 33],
	19: ['filter_env_amount', 34],
	20: ['key_tracking', 35],
	21: ['send_ext', 36],
	22: ['send_tape', 37],
	23: ['send_fx1', 38],
	24: ['send_fx2', 39],
	25: ['lfo_cc40', 40],
	26: ['lfo_cc41', 41],
	33: ['filter_env_attack', 24],
	34: ['filter_env_decay', 25],
	35: ['filter_env_sustain', 26],
	36: ['filter_env_release', 27],
	41: ['pan', 10]
};

/** The 42 lock columns (`knowledge/midi/xy-format-cc-map.json` → `plock_columns`). */
export const XY_LOCK_COLUMNS: readonly XyLockColumn[] = Array.from({ length: 42 }, (_, column) => {
	const known = COLUMN_NAMES[column];
	return {
		column,
		bit: lockBit(column),
		name: known ? known[0] : null,
		cc: known ? known[1] : null
	};
});

/** The bit of a step's lock mask that arms `column`. */
export function lockBit(column: number): number {
	return column === 0 ? 41 : column - 1;
}

/** What a pattern plays (read-only here: the writer keeps the template's sound). */
export interface XySound {
	/** Engine byte ({@link XY_ENGINES}); FX I and FX II keep their effect type here. */
	readonly engine: number;
	/** Preset path, `category/name`; "" for none, "/" after an engine change without a preset. */
	readonly preset: string;
	/** Track volume, Q31 (0x7FFFFFFF full; a new project 0x60000000). Kept per pattern (★ §3.6). */
	readonly volume: number;
	/** Track pan, Q31 (0x40000000 centre). */
	readonly pan: number;
}

/** One pattern: its sequence and the bar menu's settings (§3.4). */
export interface XyPattern {
	/** Steps that play, 1–64: (bars − 1) × 16 + the last bar's steps. */
	steps: number;
	/** The bar menu's note length for step entry, in ticks (240 = 50 on screen, 480 = 100). */
	noteLength: number;
	/** Track scale byte: {@link XY_SCALES} holds the four that are decoded. */
	scale: number;
	/** Quantisation byte: 255 = 100 % ({@link quantizePercent}). */
	quantize: number;
	/** This track's groove, signed: 3 per detent, ±127 at the ends ({@link trackGrooveValue}). */
	groove: number;
	/** Smoothing between locks (bar menu E4), 0–255: 0 stepped, 4 a detent. */
	smoothing: number;
	/**
	 * 8 until the pattern is edited, then 0 (1 and 2 were seen too). Written as given: the device
	 * clears it for edits made on its keys (notes, steps, the bar settings but smoothing, components,
	 * locks) but kept 8 on two drum tracks whose locks were hold-recorded (u121), so callers decide.
	 */
	pristine: number;
	/** In the order they are stored (ascending tick); the writer sorts what it writes by tick. */
	notes: XyNote[];
	components: XyStepComponent[];
	locks: XyLock[];
	/** The pitch-bend, mod-wheel and aftertouch lanes after the notes, as stored (3 bytes if empty). */
	lanes: Uint8Array;
	sound: XySound;
}

/** A track: its 1–16 patterns, pattern 1 first. */
export interface XyTrack {
	patterns: XyPattern[];
}

/** A scene slot (§3.3): scene n (1-based) is slot n − 1. */
export interface XyScene {
	/** The pattern each track plays, 0-based, T1–T16. */
	patterns: number[];
	/** Muted tracks (the device writes 2; any value but 0 mutes). */
	mutes: boolean[];
	/** The slot's flag: the scene exists (the device leaves unused slots at 0). */
	used: boolean;
}

/** A song slot of the footer (§3.10). */
export interface XySong {
	/** Scenes in play order, 0-based, up to 96. */
	scenes: number[];
	/** Starts over at the end (stored as 0; 1 stops). */
	loop: boolean;
}

/** The project settings in the global header (§3.2). */
export interface XySettings {
	/** BPM; the file keeps tenths. */
	tempo: number;
	/** The tempo page's groove amount, −127…127 (a detent is 2). */
	grooveAmount: number;
	/** 0–10, {@link XY_GROOVES}. */
	grooveType: number;
	/** Metronome click volume, 0–255; OS 1.1.4 also saves the metronome switched off as 0. */
	clickVolume: number;
	/** The scene playing, 0-based. */
	activeScene: number;
	/** The song chosen, 0-based (a project where none was ever chosen stores 0x10 and reads 0). */
	activeSong: number;
	/** 0 longest pattern, 1 shortest, 2 a bar of the time signature ({@link XY_SCENE_LENGTHS}). */
	sceneLength: number;
	/** Project transpose, semitones. */
	transpose: number;
	/**
	 * 0x10 3/4, 0x11 4/4 … 0x15 12/8: `0x10 + ` the index in {@link XY_TIME_SIGNATURES}, as OS 1.1.4
	 * new projects store it; the owner's OS 1.1.33 project stores the bare index (4/4 as 1). Read it
	 * with {@link timeSignatureOf}.
	 */
	timeSignature: number;
	/** Keyboard octave of T1–T16 (★ §3.2: a new project has T3 −1, T4 +1, T6 −1, T10 +4). */
	octaves: number[];
	/** Voices reserved for T1–T8: 0 automatic, 1–8 fixed. */
	voices: number[];
	/** MIDI channel of T1–T16, 1–16, or null when the track sends none (a new project's state). */
	midiChannels: (number | null)[];
}

/** A decoded project. */
export interface XyProject {
	/** The 8 header bytes (the writer keeps its template's). */
	header: Uint8Array;
	settings: XySettings;
	/** All 100 scene slots. */
	scenes: XyScene[];
	/** T1–T16. */
	tracks: XyTrack[];
	/** The 14 songs. */
	songs: XySong[];
}

/** Groove types by their byte (`xy/project_config_inspection.py` GROOVE_TYPE_NAMES). */
export const XY_GROOVES = [
	'shuffle',
	'half shuffle',
	'danish',
	'bombora',
	'wobbly',
	'gaussian',
	'accents',
	'island nod',
	'disfunk',
	'roll over',
	'prophetic'
] as const;

/** Time signatures; the byte is 0x10 + the index, or the bare index ({@link timeSignatureOf}). */
export const XY_TIME_SIGNATURES = ['3/4', '4/4', '5/4', '6/8', '7/8', '12/8'] as const;

/**
 * The time signature a byte means, in either form a device writes: `0x10 +` the index or the bare
 * index; undefined for any other byte.
 */
export function timeSignatureOf(raw: number): (typeof XY_TIME_SIGNATURES)[number] | undefined {
	if ((raw & ~0x1f) !== 0 || (raw & 0x0f) >= XY_TIME_SIGNATURES.length) return undefined;
	return XY_TIME_SIGNATURES[raw & 0x0f];
}

/** Scene length modes by their byte. */
export const XY_SCENE_LENGTHS = ['longest', 'shortest', 'time signature'] as const;

/**
 * Engines by their byte (§3.12), named as `core/opxy` names them; 0x1D is the external MIDI engine.
 * FX I and FX II use the same byte for their effect: delay 0x00, reverb 0x05, chorus 0x0C, phaser
 * 0x0D, distortion 0x0E, lofi 0x0F.
 */
export const XY_ENGINES: Readonly<Record<number, string>> = {
	0x02: 'sampler',
	0x03: 'drum',
	0x06: 'organ',
	0x07: 'epiano',
	0x12: 'prism',
	0x13: 'hardsync',
	0x14: 'dissolve',
	0x16: 'axis',
	0x1d: 'midi',
	0x1e: 'multisampler',
	0x1f: 'wavetable',
	0x20: 'simple'
};

/**
 * The track scale bytes decoded so far (u20–u22), as sixteenths per step. The odd scales OS 1.1.25
 * added (3, 5, 6, 7) and 4 and 8 still need a capture (§8 Q15).
 */
export const XY_SCALES: Readonly<Record<number, number>> = {
	0x01: 0.5,
	0x03: 1,
	0x05: 2,
	0x0e: 16
};

/** The byte of a track scale, or null for one not decoded yet. */
export function scaleByte(scale: number): number | null {
	for (const [byte, value] of Object.entries(XY_SCALES)) if (value === scale) return Number(byte);
	return null;
}

/** The screen's quantisation percent of a quantisation byte (`floor(raw × 100 / 255)`). */
export const quantizePercent = (raw: number): number => Math.floor((raw * 100) / 255);

/**
 * The smallest byte that shows a quantisation percent 0–100 (upstream's encoder); the device's own
 * byte can sit higher in the same bucket (bar-q-050 stores 0x81 for 50).
 */
export const quantizeByte = (percent: number): number =>
	percent === 0 ? 0 : Math.ceil((percent * 255) / 100);

/**
 * The values the bar menu's groove (E3) steps through on one side of 0, one per detent
 * (`xy/bar_menu_inspection.py` TRACK_GROOVE_UI_SEQUENCE).
 */
export const TRACK_GROOVE_DETENTS: readonly number[] = [
	2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25, 28, 30, 32, 35, 37, 39, 42, 44, 46, 49, 51, 53, 56, 58,
	60, 63, 65, 67, 70, 72, 75, 77, 79, 82, 84, 86, 89, 91, 93, 96, 98, 99
];

/** The groove byte of a groove value the bar menu shows (−99…99 on its detents), or null. */
export function trackGrooveByte(value: number): number | null {
	if (value === 0) return 0;
	const index = TRACK_GROOVE_DETENTS.indexOf(Math.abs(value));
	if (index < 0) return null;
	return Math.sign(value) * Math.min(127, 3 * (index + 1));
}

/** The groove value the bar menu shows for a groove byte (signed), or null off the detents. */
export function trackGrooveValue(raw: number): number | null {
	if (raw === 0) return 0;
	const index = Math.abs(raw) === 127 ? TRACK_GROOVE_DETENTS.length : Math.abs(raw) / 3;
	if (!Number.isInteger(index) || index > TRACK_GROOVE_DETENTS.length) return null;
	return Math.sign(raw) * TRACK_GROOVE_DETENTS[index - 1];
}

/**
 * A new, empty pattern shaped like `like`: its bar settings and sound, no notes, components, locks
 * or lane data (what a new pattern made from that one's struct holds, as upstream's
 * `build_arrangement` makes clones).
 */
export function blankPattern(like: XyPattern): XyPattern {
	return {
		...like,
		notes: [],
		components: [],
		locks: [],
		lanes: new Uint8Array(3),
		sound: { ...like.sound }
	};
}
