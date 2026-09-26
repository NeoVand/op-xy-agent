// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/constants.ts

/**
 * Lookup tables that turn MIDI numbers back into names.
 *
 * Almost none of this is guaranteed. The controller, program and drum tables are the **General MIDI
 * convention layer**: what a message means on a GM-compatible device, not on the OP-XY. On the
 * OP-XY CC 32 is filter cutoff, not Bank Select LSB, so nothing here should be read as OP-XY
 * semantics; the device's own map lives in `core/opxy` and is layered on top (see `DescribeProfile`
 * in messages.ts).
 *
 * The manufacturer IDs are facts, checked against the MIDI Association's SysEx ID table
 * (https://midi.org/sysexidtable, 2026-09-26). Teenage Engineering is `00 20 76`, which is also
 * what the owner's OP-XY sends in its Identity Reply (docs/research/90-device-probe.md). MIDI Lab
 * listed TE under `00 21 0F`, which belongs to Philips Electronics HK, and had several other IDs
 * attached to the wrong companies; those are corrected here.
 */

import { assertIntInRange } from './validate';

/* -------------------------------------------------------------------------- */
/* Control Change numbers (General MIDI convention)                            */
/* -------------------------------------------------------------------------- */

/** How a controller behaves, by convention. */
export type CcCategory =
	'continuous' | 'switch' | 'lsb' | 'sound' | 'effect' | 'data' | 'mode' | 'undefined';

/** What a controller number means under the General MIDI / MIDI 1.0 convention. */
export interface CcInfo {
	number: number;
	name: string;
	short: string;
	category: CcCategory;
	/** Companion LSB controller, for the 14-bit pairs (CC 0–31 ↔ 32–63). */
	lsb?: number;
	/** This controller is the LSB half of `msb`. */
	msb?: number;
	/** Assigned by the MIDI 1.0 specification, rather than left undefined. */
	standard: boolean;
	description?: string;
}

const RAW_CC: Array<[number, string, string, CcCategory, string?]> = [
	[
		0,
		'Bank Select (MSB)',
		'Bank MSB',
		'continuous',
		'Coarse half of the bank number. Only takes effect when a Program Change follows.'
	],
	[
		1,
		'Modulation Wheel (MSB)',
		'Mod Wheel',
		'continuous',
		'The universal "add expression" control. Usually vibrato depth, but assignable on most synths.'
	],
	[
		2,
		'Breath Controller (MSB)',
		'Breath',
		'continuous',
		'Originally for Yamaha breath controllers; now a general expressive input.'
	],
	[3, 'Undefined', 'CC 3', 'undefined'],
	[
		4,
		'Foot Controller (MSB)',
		'Foot',
		'continuous',
		'Continuous foot pedal, distinct from the on/off sustain pedal on CC 64.'
	],
	[
		5,
		'Portamento Time (MSB)',
		'Porta Time',
		'continuous',
		'How long the glide between notes takes when portamento is on.'
	],
	[
		6,
		'Data Entry (MSB)',
		'Data MSB',
		'data',
		'Sets the coarse value of whichever RPN or NRPN is currently selected.'
	],
	[
		7,
		'Channel Volume (MSB)',
		'Volume',
		'continuous',
		'The channel fader. Mix level, set once and left alone.'
	],
	[8, 'Balance (MSB)', 'Balance', 'continuous', 'Left/right balance for a two-source sound.'],
	[9, 'Undefined', 'CC 9', 'undefined'],
	[10, 'Pan (MSB)', 'Pan', 'continuous', '0 = hard left, 64 = centre, 127 = hard right.'],
	[
		11,
		'Expression (MSB)',
		'Expression',
		'continuous',
		'A percentage of CC 7. Use this for swells and phrasing; leave CC 7 as the mix level.'
	],
	[12, 'Effect Control 1 (MSB)', 'FX Ctrl 1', 'effect'],
	[13, 'Effect Control 2 (MSB)', 'FX Ctrl 2', 'effect'],
	[14, 'Undefined', 'CC 14', 'undefined'],
	[15, 'Undefined', 'CC 15', 'undefined'],
	[16, 'General Purpose 1 (MSB)', 'GP 1', 'continuous'],
	[17, 'General Purpose 2 (MSB)', 'GP 2', 'continuous'],
	[18, 'General Purpose 3 (MSB)', 'GP 3', 'continuous'],
	[19, 'General Purpose 4 (MSB)', 'GP 4', 'continuous'],
	[
		64,
		'Damper Pedal (Sustain)',
		'Sustain',
		'switch',
		'Below 64 = off, 64 and above = on. Holds notes after their Note Off arrives.'
	],
	[65, 'Portamento On/Off', 'Portamento', 'switch'],
	[
		66,
		'Sostenuto',
		'Sostenuto',
		'switch',
		'Sustains only the notes already held when the pedal went down.'
	],
	[67, 'Soft Pedal', 'Soft', 'switch'],
	[68, 'Legato Footswitch', 'Legato', 'switch'],
	[69, 'Hold 2', 'Hold 2', 'switch'],
	[70, 'Sound Variation', 'Sound 1', 'sound'],
	[71, 'Timbre / Resonance', 'Resonance', 'sound', 'By GM2 convention the filter resonance.'],
	[72, 'Release Time', 'Release', 'sound'],
	[73, 'Attack Time', 'Attack', 'sound'],
	[
		74,
		'Brightness / Cutoff',
		'Cutoff',
		'sound',
		'By GM2 convention the filter cutoff, and MPE’s third dimension of touch ("slide").'
	],
	[75, 'Decay Time', 'Decay', 'sound'],
	[76, 'Vibrato Rate', 'Vib Rate', 'sound'],
	[77, 'Vibrato Depth', 'Vib Depth', 'sound'],
	[78, 'Vibrato Delay', 'Vib Delay', 'sound'],
	[79, 'Sound Controller 10', 'Sound 10', 'sound'],
	[80, 'General Purpose 5', 'GP 5', 'switch'],
	[81, 'General Purpose 6', 'GP 6', 'switch'],
	[82, 'General Purpose 7', 'GP 7', 'switch'],
	[83, 'General Purpose 8', 'GP 8', 'switch'],
	[
		84,
		'Portamento Control',
		'Porta Ctrl',
		'continuous',
		'Carries the source note number to glide from.'
	],
	[85, 'Undefined', 'CC 85', 'undefined'],
	[86, 'Undefined', 'CC 86', 'undefined'],
	[87, 'Undefined', 'CC 87', 'undefined'],
	[
		88,
		'High Resolution Velocity Prefix',
		'Hi-Res Vel',
		'continuous',
		'Adds fractional resolution to the next Note On velocity.'
	],
	[89, 'Undefined', 'CC 89', 'undefined'],
	[90, 'Undefined', 'CC 90', 'undefined'],
	[91, 'Reverb Send', 'Reverb', 'effect'],
	[92, 'Tremolo Depth', 'Tremolo', 'effect'],
	[93, 'Chorus Send', 'Chorus', 'effect'],
	[94, 'Detune / Celeste Depth', 'Detune', 'effect'],
	[95, 'Phaser Depth', 'Phaser', 'effect'],
	[96, 'Data Increment', 'Data +1', 'data', 'Nudges the selected RPN/NRPN up by one step.'],
	[97, 'Data Decrement', 'Data −1', 'data'],
	[98, 'NRPN LSB', 'NRPN LSB', 'data', 'Fine half of the non-registered parameter selector.'],
	[99, 'NRPN MSB', 'NRPN MSB', 'data', 'Coarse half of the non-registered parameter selector.'],
	[100, 'RPN LSB', 'RPN LSB', 'data'],
	[101, 'RPN MSB', 'RPN MSB', 'data'],
	[
		120,
		'All Sound Off',
		'All Sound Off',
		'mode',
		'Silences everything immediately, ignoring release tails and the sustain pedal.'
	],
	[
		121,
		'Reset All Controllers',
		'Reset Ctrls',
		'mode',
		'Returns bend, mod, expression and pedals to their defaults.'
	],
	[
		122,
		'Local Control On/Off',
		'Local',
		'mode',
		'Disconnects a keyboard from its own sound engine. Essential when a sequencer echoes MIDI back.'
	],
	[
		123,
		'All Notes Off',
		'All Notes Off',
		'mode',
		'Releases every held note; the sustain pedal still applies.'
	],
	[124, 'Omni Mode Off', 'Omni Off', 'mode'],
	[125, 'Omni Mode On', 'Omni On', 'mode'],
	[126, 'Mono Mode On', 'Mono On', 'mode'],
	[127, 'Poly Mode On', 'Poly On', 'mode']
];

function undefinedCc(n: number): CcInfo {
	return {
		number: n,
		name: `Undefined (CC ${n})`,
		short: `CC ${n}`,
		category: 'undefined',
		standard: false
	};
}

function buildCcTable(): CcInfo[] {
	const table: CcInfo[] = Array.from({ length: 128 }, (_, n) => undefinedCc(n));
	for (const [n, name, short, category, description] of RAW_CC) {
		table[n] = { number: n, name, short, category, standard: category !== 'undefined' };
		if (description) table[n].description = description;
	}
	// CC 32–63 are the fine halves of CC 0–31, but only where the coarse half is assigned: 20–31
	// are undefined, so 52–63 stay undefined too.
	for (let n = 32; n <= 63; n++) {
		const partner = table[n - 32];
		if (!partner.standard) continue;
		table[n] = {
			number: n,
			name: `${partner.name.replace(' (MSB)', '')} (LSB)`,
			short: `${partner.short.replace(/ MSB$/, '')} LSB`,
			category: 'lsb',
			msb: n - 32,
			standard: true,
			description: `Fine half of ${partner.short}. Combined with CC ${n - 32} it gives 14-bit resolution — 16,384 steps instead of 128.`
		};
		table[n - 32] = { ...partner, lsb: n };
	}
	return table;
}

/**
 * All 128 controllers under the **General MIDI convention**. A device in its native mode (the OP-XY
 * included) is free to use any of these numbers for something else.
 */
export const GM_CC_TABLE: readonly CcInfo[] = buildCcTable();

/** General MIDI meaning of a controller number (0–127). */
export function gmCcInfo(controller: number): CcInfo {
	assertIntInRange(controller, 0, 127, 'controller');
	return GM_CC_TABLE[controller];
}

/** Short General MIDI name of a controller, e.g. `Mod Wheel`, or `CC 3` when undefined. */
export function gmCcName(controller: number): string {
	return gmCcInfo(controller).short;
}

/* -------------------------------------------------------------------------- */
/* Registered parameters                                                       */
/* -------------------------------------------------------------------------- */

/** One Registered Parameter Number, as defined by the MIDI specification. */
export interface RpnInfo {
	msb: number;
	lsb: number;
	name: string;
	description: string;
}

/** The registered parameters worth naming. */
export const RPN_TABLE: readonly RpnInfo[] = [
	{
		msb: 0,
		lsb: 0,
		name: 'Pitch Bend Sensitivity',
		description: 'How many semitones a full bend covers. Data Entry MSB = semitones, LSB = cents.'
	},
	{
		msb: 0,
		lsb: 1,
		name: 'Channel Fine Tuning',
		description: 'Detune in cents, 14-bit, centred at 8192.'
	},
	{
		msb: 0,
		lsb: 2,
		name: 'Channel Coarse Tuning',
		description: 'Detune in semitones, centred at 64.'
	},
	{
		msb: 0,
		lsb: 3,
		name: 'Tuning Program Select',
		description: 'Chooses an alternate tuning table.'
	},
	{ msb: 0, lsb: 4, name: 'Tuning Bank Select', description: 'Chooses a bank of tuning tables.' },
	{
		msb: 0,
		lsb: 5,
		name: 'Modulation Depth Range',
		description: 'How far the mod wheel can push vibrato.'
	},
	{
		msb: 0,
		lsb: 6,
		name: 'MPE Configuration (MCM)',
		description:
			'Declares an MPE zone: Data Entry = how many member channels to reserve. Zero tears the zone down.'
	},
	{
		// MIDI Lab had 0x3F here; the null parameter is 7F 7F, as rpn.ts has always sent it.
		msb: 0x7f,
		lsb: 0x7f,
		name: 'RPN Null',
		description:
			'Deselects the current parameter so a stray Data Entry cannot change something by accident. Always send this after an edit.'
	}
];

/** The registered parameter at `msb`/`lsb`, if it is one worth naming. */
export function rpnInfo(msb: number, lsb: number): RpnInfo | undefined {
	return RPN_TABLE.find((r) => r.msb === msb && r.lsb === lsb);
}

/* -------------------------------------------------------------------------- */
/* General MIDI programs and percussion                                        */
/* -------------------------------------------------------------------------- */

/** The sixteen General MIDI instrument families, eight programs each. */
export const GM_FAMILIES = [
	'Piano',
	'Chromatic Percussion',
	'Organ',
	'Guitar',
	'Bass',
	'Strings',
	'Ensemble',
	'Brass',
	'Reed',
	'Pipe',
	'Synth Lead',
	'Synth Pad',
	'Synth Effects',
	'Ethnic',
	'Percussive',
	'Sound Effects'
] as const;

/** General MIDI Level 1 program names, indexed by the wire program number 0–127. */
export const GM_PROGRAMS = [
	'Acoustic Grand Piano',
	'Bright Acoustic Piano',
	'Electric Grand Piano',
	'Honky-tonk Piano',
	'Electric Piano 1',
	'Electric Piano 2',
	'Harpsichord',
	'Clavi',
	'Celesta',
	'Glockenspiel',
	'Music Box',
	'Vibraphone',
	'Marimba',
	'Xylophone',
	'Tubular Bells',
	'Dulcimer',
	'Drawbar Organ',
	'Percussive Organ',
	'Rock Organ',
	'Church Organ',
	'Reed Organ',
	'Accordion',
	'Harmonica',
	'Tango Accordion',
	'Acoustic Guitar (nylon)',
	'Acoustic Guitar (steel)',
	'Electric Guitar (jazz)',
	'Electric Guitar (clean)',
	'Electric Guitar (muted)',
	'Overdriven Guitar',
	'Distortion Guitar',
	'Guitar Harmonics',
	'Acoustic Bass',
	'Electric Bass (finger)',
	'Electric Bass (pick)',
	'Fretless Bass',
	'Slap Bass 1',
	'Slap Bass 2',
	'Synth Bass 1',
	'Synth Bass 2',
	'Violin',
	'Viola',
	'Cello',
	'Contrabass',
	'Tremolo Strings',
	'Pizzicato Strings',
	'Orchestral Harp',
	'Timpani',
	'String Ensemble 1',
	'String Ensemble 2',
	'SynthStrings 1',
	'SynthStrings 2',
	'Choir Aahs',
	'Voice Oohs',
	'Synth Voice',
	'Orchestra Hit',
	'Trumpet',
	'Trombone',
	'Tuba',
	'Muted Trumpet',
	'French Horn',
	'Brass Section',
	'SynthBrass 1',
	'SynthBrass 2',
	'Soprano Sax',
	'Alto Sax',
	'Tenor Sax',
	'Baritone Sax',
	'Oboe',
	'English Horn',
	'Bassoon',
	'Clarinet',
	'Piccolo',
	'Flute',
	'Recorder',
	'Pan Flute',
	'Blown Bottle',
	'Shakuhachi',
	'Whistle',
	'Ocarina',
	'Lead 1 (square)',
	'Lead 2 (sawtooth)',
	'Lead 3 (calliope)',
	'Lead 4 (chiff)',
	'Lead 5 (charang)',
	'Lead 6 (voice)',
	'Lead 7 (fifths)',
	'Lead 8 (bass + lead)',
	'Pad 1 (new age)',
	'Pad 2 (warm)',
	'Pad 3 (polysynth)',
	'Pad 4 (choir)',
	'Pad 5 (bowed)',
	'Pad 6 (metallic)',
	'Pad 7 (halo)',
	'Pad 8 (sweep)',
	'FX 1 (rain)',
	'FX 2 (soundtrack)',
	'FX 3 (crystal)',
	'FX 4 (atmosphere)',
	'FX 5 (brightness)',
	'FX 6 (goblins)',
	'FX 7 (echoes)',
	'FX 8 (sci-fi)',
	'Sitar',
	'Banjo',
	'Shamisen',
	'Koto',
	'Kalimba',
	'Bag pipe',
	'Fiddle',
	'Shanai',
	'Tinkle Bell',
	'Agogo',
	'Steel Drums',
	'Woodblock',
	'Taiko Drum',
	'Melodic Tom',
	'Synth Drum',
	'Reverse Cymbal',
	'Guitar Fret Noise',
	'Breath Noise',
	'Seashore',
	'Bird Tweet',
	'Telephone Ring',
	'Helicopter',
	'Applause',
	'Gunshot'
] as const;

/** General MIDI name of a program number (0–127). */
export function gmProgramName(program: number): string {
	assertIntInRange(program, 0, 127, 'program');
	return GM_PROGRAMS[program];
}

/** General MIDI family of a program number (0–127). */
export function gmFamily(program: number): string {
	assertIntInRange(program, 0, 127, 'program');
	return GM_FAMILIES[Math.floor(program / 8)];
}

/** GM percussion key map, the sounds on channel 10 (wire channel 9). Keyed by note number. */
export const GM_DRUMS: Readonly<Record<number, string>> = {
	35: 'Acoustic Bass Drum',
	36: 'Bass Drum 1',
	37: 'Side Stick',
	38: 'Acoustic Snare',
	39: 'Hand Clap',
	40: 'Electric Snare',
	41: 'Low Floor Tom',
	42: 'Closed Hi-Hat',
	43: 'High Floor Tom',
	44: 'Pedal Hi-Hat',
	45: 'Low Tom',
	46: 'Open Hi-Hat',
	47: 'Low-Mid Tom',
	48: 'Hi-Mid Tom',
	49: 'Crash Cymbal 1',
	50: 'High Tom',
	51: 'Ride Cymbal 1',
	52: 'Chinese Cymbal',
	53: 'Ride Bell',
	54: 'Tambourine',
	55: 'Splash Cymbal',
	56: 'Cowbell',
	57: 'Crash Cymbal 2',
	58: 'Vibraslap',
	59: 'Ride Cymbal 2',
	60: 'Hi Bongo',
	61: 'Low Bongo',
	62: 'Mute Hi Conga',
	63: 'Open Hi Conga',
	64: 'Low Conga',
	65: 'High Timbale',
	66: 'Low Timbale',
	67: 'High Agogo',
	68: 'Low Agogo',
	69: 'Cabasa',
	70: 'Maracas',
	71: 'Short Whistle',
	72: 'Long Whistle',
	73: 'Short Guiro',
	74: 'Long Guiro',
	75: 'Claves',
	76: 'Hi Wood Block',
	77: 'Low Wood Block',
	78: 'Mute Cuica',
	79: 'Open Cuica',
	80: 'Mute Triangle',
	81: 'Open Triangle'
};

/* -------------------------------------------------------------------------- */
/* SysEx manufacturer IDs                                                      */
/* -------------------------------------------------------------------------- */

/** Teenage Engineering's three-byte SysEx manufacturer ID, as the OP-XY reports it. */
export const TEENAGE_ENGINEERING_ID: readonly [number, number, number] = [0x00, 0x20, 0x76];

/**
 * One-byte IDs (names as the MIDI Association lists them), plus the three special IDs the MIDI 1.0
 * specification reserves: 7D non-commercial, 7E and 7F universal. Three-byte IDs start with 00.
 */
export const MANUFACTURERS_1BYTE: Readonly<Record<number, string>> = {
	0x01: 'Sequential Circuits',
	0x02: 'IDP',
	0x04: 'Moog Music',
	0x05: 'Passport Designs',
	0x06: 'Lexicon Inc.',
	0x07: 'Kurzweil / Young Chang',
	0x08: 'Fender',
	0x0a: 'AKG Acoustics',
	0x0f: 'Ensoniq',
	0x10: 'Oberheim',
	0x11: 'Apple',
	0x12: 'Grey Matter Response',
	0x15: 'JLCooper Electronics',
	0x16: 'Lowrey Organ Company',
	0x18: 'E-mu',
	0x1a: 'ART',
	0x1c: 'Eventide',
	0x20: 'Passac',
	0x21: 'Proel Labs (SIEL)',
	0x24: 'Hohner',
	0x26: 'Ketron s.r.l.',
	0x27: 'Jellinghaus MS',
	0x29: 'PPG (Germany)',
	0x2b: 'Solid State Logic Organ Systems',
	0x2f: 'Elka',
	0x33: 'Clavia Digital Instruments',
	0x36: 'Generalmusic Corp SpA',
	0x3e: 'Waldorf Electronics GmbH',
	0x40: 'Kawai Musical Instruments MFG. CO. Ltd',
	0x41: 'Roland Corporation',
	0x42: 'Korg Inc.',
	0x43: 'Yamaha Corporation',
	0x44: 'Casio Computer Co. Ltd',
	0x47: 'Akai Electric Co. Ltd.',
	0x48: 'Victor Company of Japan, Ltd.',
	0x4c: 'Sony Corporation',
	0x51: 'Fostex Corporation',
	0x52: 'Zoom Corporation',
	0x54: 'Matsushita Communication Industrial Co., Ltd.',
	0x55: 'Suzuki Musical Instruments MFG. Co., Ltd.',
	0x57: 'Acoustic Technical Laboratory, Inc.',
	0x7d: 'Non-Commercial (educational and development use)',
	0x7e: 'Universal Non-Real Time',
	0x7f: 'Universal Real Time'
};

/** Three-byte IDs, keyed by the two bytes after the leading 00 in lowercase hex, e.g. `20:76`. */
export const MANUFACTURERS_3BYTE: Readonly<Record<string, string>> = {
	'00:01': 'Time/Warner Interactive',
	'00:0e': 'Alesis Studio Electronics',
	'00:1a': 'Allen & Heath Brenell',
	'00:3b': 'Mark Of The Unicorn',
	'00:41': 'Microsoft',
	'00:66': 'Loud Technologies / Mackie',
	'01:05': 'M-Audio (Midiman)',
	'01:72': 'Kilpatrick Audio',
	'20:29': 'Focusrite/Novation',
	'20:32': 'Behringer GmbH',
	'20:33': 'Access Music Electronics',
	'20:3c': 'Elektron ESI AB',
	'20:6b': 'Arturia',
	'20:76': 'Teenage Engineering',
	'21:09': 'Native Instruments',
	'21:0f': 'Philips Electronics HK Ltd',
	'21:10': 'ROLI Ltd',
	'21:1d': 'Ableton',
	'21:32': 'Bome Software'
};

const hex2 = (b: number) => b.toString(16).padStart(2, '0');

/**
 * Name the manufacturer whose ID starts `bytes` (the SysEx payload after F0, or just the ID).
 * Unknown IDs come back as `unknown (00 20 76)`-style text, never as a guess.
 */
export function manufacturerName(bytes: ArrayLike<number>): string {
	if (bytes.length === 0) return 'unknown';
	const first = bytes[0];
	if (!isIdByte(first)) return 'unknown';
	if (first !== 0x00) {
		return MANUFACTURERS_1BYTE[first] ?? `unknown (${hex2(first).toUpperCase()})`;
	}
	if (bytes.length < 3 || !isIdByte(bytes[1]) || !isIdByte(bytes[2])) {
		return 'unknown (incomplete three-byte ID)';
	}
	const key = `${hex2(bytes[1])}:${hex2(bytes[2])}`;
	return MANUFACTURERS_3BYTE[key] ?? `unknown (00 ${key.replace(':', ' ').toUpperCase()})`;
}

function isIdByte(value: number): boolean {
	return Number.isInteger(value) && value >= 0 && value <= 0x7f;
}
