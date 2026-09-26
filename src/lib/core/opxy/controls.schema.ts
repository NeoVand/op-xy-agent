import { z } from 'zod';
import {
	ConfidenceSchema,
	FirmwareVersionStringSchema,
	MidiValueSchema,
	SourceListSchema,
	SourceRefSchema,
	checkSourceKeys
} from './common.schema';
import { CONTROL_IDS, type ControlId } from './ids';

/** Physical kind of a control or panel feature. */
export const CONTROL_KINDS = [
	'key',
	'encoder',
	'knob',
	'pitchbend',
	'screen',
	'speaker',
	'mic',
	'meter',
	'led',
	'switch',
	'port',
	'marking'
] as const;

/** Functional group (mirrors the regions of TE's layout chapter). */
export const CONTROL_GROUPS = [
	'function',
	'mode',
	'module',
	'track',
	'step',
	'transport',
	'keyboard',
	'encoder',
	'volume',
	'pitchbend',
	'display',
	'audio',
	'indicator',
	'port',
	'power',
	'marking'
] as const;

/** How a control is operated. Indicators, ports and markings have none. */
export const CONTROL_INPUTS = ['press', 'turn', 'click', 'rotate', 'pressure', 'toggle'] as const;

/** LED states a key or indicator can show (blinking is a separate flag). */
export const LED_STATES = ['off', 'dim', 'white', 'red', 'green'] as const;

/** Auxiliary-track roles, as named in `knowledge/midi/cc-map.json` `channels.defaults[].role`. */
export const AUX_ROLES = [
	'brain',
	'punchIn',
	'externalMidi',
	'externalCv',
	'externalAudio',
	'tape',
	'fx1',
	'fx2'
] as const;

const PointSchema = z.strictObject({ x: z.number(), y: z.number() });

const RectSchema = z.strictObject({
	x: z.number(),
	y: z.number(),
	w: z.number().nonnegative(),
	h: z.number().nonnegative()
});

/** Tile cell on the 17 × 6 grid; `col`/`cols` may be fractional on the accidental row. */
const GridCellSchema = z.strictObject({
	col: z.number().min(0),
	row: z.int().min(0),
	cols: z.number().positive(),
	rows: z.int().positive()
});

const positive = z.number().positive();

const ShapeSchema = z.discriminatedUnion('type', [
	z.strictObject({ type: z.literal('keycap'), diameter: positive }),
	z.strictObject({
		type: z.literal('encoder'),
		dishDiameter: positive,
		bodyDiameter: positive,
		topDiameter: positive,
		capDiameter: positive
	}),
	z.strictObject({
		type: z.literal('knob'),
		outerDiameter: positive,
		topDiameter: positive,
		dimpleDiameter: positive
	}),
	z.strictObject({
		type: z.literal('screen'),
		activeWidth: positive,
		activeHeight: positive,
		resolution: z.strictObject({ width: z.int().positive(), height: z.int().positive() }),
		cornerRadiusPx: z.number().nonnegative()
	}),
	z.strictObject({
		type: z.literal('grille'),
		diameter: positive,
		holes: z.int().positive(),
		holeDiameter: positive,
		pitch: positive,
		rowCounts: z.array(z.int().positive())
	}),
	z.strictObject({ type: z.literal('hole'), diameter: positive }),
	z.strictObject({ type: z.literal('meter'), segments: z.int().positive().nullable() }),
	z.strictObject({ type: z.literal('pill'), width: positive, height: positive }),
	z.strictObject({ type: z.literal('connector'), standard: z.string().min(1) }),
	z.strictObject({ type: z.literal('slider'), length: positive, proud: positive }),
	z.strictObject({ type: z.literal('mark'), width: positive })
]);

const GeometrySchema = z.strictObject({
	face: z.enum(['top', 'front', 'right']),
	grid: GridCellSchema.optional(),
	rect: RectSchema,
	center: PointSchema,
	shape: ShapeSchema,
	confidence: ConfidenceSchema,
	source: SourceListSchema
});

const LegendSchema = z.strictObject({
	printed: z.string().min(1).nullable(),
	glyph: z.string().min(1).nullable(),
	shift: z.string().min(1).nullable()
});

const LedSchema = z.strictObject({
	states: z.array(z.enum(LED_STATES)).min(2),
	blinks: z.boolean(),
	confidence: ConfidenceSchema,
	source: SourceListSchema,
	notes: z.string().optional()
});

/** One message a control emits in COM → M2 controller mode. */
const EmitSchema = z.strictObject({
	input: z.enum(['press', 'turn', 'click']),
	message: z.enum(['cc', 'note']),
	number: MidiValueSchema,
	/** true when press and release arrive as separate messages (holds are observable). */
	reportsHold: z.boolean()
});

const ControlMidiSchema = z.strictObject({
	/** CC106/107 value that presses (or, for encoders, clicks) this control; null = none. */
	remoteKey: z.int().min(0).max(127).nullable(),
	controllerMode: z.array(EmitSchema),
	/** MIDI note the key plays at the default octave (keyboard keys only). */
	note: MidiValueSchema.nullable(),
	confidence: ConfidenceSchema,
	source: SourceListSchema,
	notes: z.string().optional()
});

const TrackKeySchema = z.strictObject({
	instrument: z.int().min(1).max(8),
	auxiliary: z.strictObject({
		track: z.int().min(9).max(16),
		name: z.string().min(1),
		role: z.enum(AUX_ROLES),
		alias: z.string().min(1)
	}),
	confidence: ConfidenceSchema,
	source: SourceListSchema
});

const KeyboardKeySchema = z.strictObject({
	note: MidiValueSchema,
	name: z.string().regex(/^[A-G]#?\d$/),
	type: z.enum(['natural', 'accidental']),
	/** naturals: position 1–14; accidentals: the printed digit 1–9, 0 */
	number: z.int().min(0).max(14),
	stepComponent: z.string().min(1).optional()
});

/** One physical control or panel feature. */
export const ControlSchema = z.strictObject({
	id: z.enum(CONTROL_IDS),
	kind: z.enum(CONTROL_KINDS),
	group: z.enum(CONTROL_GROUPS),
	/** Name as TE's guide uses it. */
	label: z.string().min(1),
	aliases: z.array(z.string().min(1)),
	/** Spelling in the key-combo grammar (`keys.ts`); null when not addressable there. */
	token: z.string().min(1).nullable(),
	/** Position within an ordered group (track 1–8, step 1–16, keyboard 1–24, …). */
	index: z.int().positive().optional(),
	inputs: z.array(z.enum(CONTROL_INPUTS)),
	legend: LegendSchema,
	geometry: GeometrySchema,
	/** Part → colour token in the file's `colors` table. */
	colors: z.record(z.string(), z.string()),
	led: LedSchema.nullable(),
	midi: ControlMidiSchema.nullable(),
	track: TrackKeySchema.optional(),
	keyboard: KeyboardKeySchema.optional(),
	/** `<guide slug>#<anchor>` in https://teenage.engineering/guides/op-xy/. */
	guide: z
		.string()
		.regex(/^[a-z0-9-]+#[a-z0-9.-]+$/)
		.nullable(),
	confidence: ConfidenceSchema,
	source: SourceListSchema,
	notes: z.string().optional()
});

const ColorTokenSchema = z.strictObject({
	hex: z.string().regex(/^#[0-9a-f]{6}$/, 'expected a lower-case #rrggbb colour'),
	role: z.string().min(1),
	confidence: ConfidenceSchema,
	source: SourceListSchema,
	note: z.string().optional()
});

const measured = { confidence: ConfidenceSchema, source: SourceListSchema };

const PanelSchema = z.strictObject({
	body: z.strictObject({
		width: positive,
		height: positive,
		cornerRadius: positive,
		officialSize: z.string(),
		...measured
	}),
	grid: z.strictObject({
		pitch: positive,
		columns: z.int().positive(),
		rows: z.int().positive(),
		origin: PointSchema,
		tileSize: positive,
		tileCornerRadius: positive,
		margins: z.strictObject({ left: positive, top: positive, bottom: positive, right: positive }),
		...measured
	}),
	keycap: z.strictObject({ diameter: positive, heightAboveTile: positive, ...measured }),
	ledWindow: z.strictObject({ diameter: positive, offset: PointSchema, ...measured }),
	profile: z.strictObject({
		feet: positive,
		basePlate: positive,
		chassis: positive,
		tilesAboveRim: positive,
		keycapTopAboveRim: positive,
		encoderTopAboveRim: positive,
		volumeTopAboveRim: positive,
		totalHeight: positive,
		...measured
	})
});

/** Schema of `knowledge/opxy/controls.json`, including referential-integrity checks. */
export const ControlsFileSchema = z
	.strictObject({
		$comment: z.string(),
		schemaVersion: z.literal(1),
		generated: z.iso.date(),
		doc: z.string(),
		firmware: z.strictObject({
			reference: FirmwareVersionStringSchema,
			guide: FirmwareVersionStringSchema
		}),
		idScheme: z.strictObject({
			pattern: z.string(),
			groups: z.record(z.string(), z.string()),
			keyGrammarTokens: z.string()
		}),
		conventions: z.strictObject({
			units: z.literal('millimetres'),
			faces: z.strictObject({ top: z.string(), front: z.string(), right: z.string() }),
			rect: z.string(),
			center: z.string(),
			notes: z.string(),
			channels: z.string(),
			legend: z.string()
		}),
		sources: z.record(z.string(), SourceRefSchema),
		panel: PanelSchema,
		colors: z.record(z.string().regex(/^[a-z0-9-]+$/), ColorTokenSchema),
		controls: z.array(ControlSchema)
	})
	.superRefine((file, ctx) => {
		checkSourceKeys(file, new Set(Object.keys(file.sources)), ctx);

		const seen = new Set<ControlId>();
		const names = new Map<string, ControlId>();
		const remoteKeys = new Map<number, ControlId>();
		const notes = new Map<number, ControlId>();

		file.controls.forEach((control, i) => {
			const at = (...path: (string | number)[]) => ['controls', i, ...path];
			const issue = (message: string, ...path: (string | number)[]) =>
				ctx.addIssue({ code: 'custom', path: at(...path), message });

			if (seen.has(control.id)) issue(`duplicate id ${control.id}`, 'id');
			seen.add(control.id);

			// The id group must agree with the kind (the scheme is documented in ids.ts).
			const group = control.id.split('.')[0];
			const expectedKind: Record<string, string> = {
				key: 'key',
				track: 'key',
				step: 'key',
				keyboard: 'key',
				encoder: 'encoder',
				knob: 'knob',
				strip: 'pitchbend',
				screen: 'screen',
				speaker: 'speaker',
				mic: 'mic',
				meter: 'meter',
				led: 'led',
				switch: 'switch',
				port: 'port',
				marking: 'marking'
			};
			if (expectedKind[group] !== control.kind) {
				issue(`kind ${control.kind} does not match id group "${group}"`, 'kind');
			}

			// Every name a person or agent might use must identify exactly one control.
			const own = new Set(
				[control.id, control.label, control.token, ...control.aliases]
					.filter((name): name is string => name !== null)
					.map((name) => name.toLowerCase())
			);
			for (const name of own) {
				const other = names.get(name);
				if (other && other !== control.id) issue(`name "${name}" is also used by ${other}`);
				names.set(name, control.id);
			}

			for (const [part, token] of Object.entries(control.colors)) {
				if (!(token in file.colors)) issue(`unknown colour token "${token}"`, 'colors', part);
			}

			if (control.midi?.remoteKey != null) {
				const other = remoteKeys.get(control.midi.remoteKey);
				if (other) issue(`remote key ${control.midi.remoteKey} also on ${other}`, 'midi');
				remoteKeys.set(control.midi.remoteKey, control.id);
			}
			if (control.midi?.note != null) {
				const other = notes.get(control.midi.note);
				if (other) issue(`note ${control.midi.note} also on ${other}`, 'midi');
				notes.set(control.midi.note, control.id);
			}

			if (control.kind === 'key') {
				if (control.geometry.shape.type !== 'keycap') issue('keys need a keycap shape', 'geometry');
				if (!control.inputs.includes('press')) issue('keys must accept press', 'inputs');
				if (control.token === null) issue('keys need a grammar token', 'token');
				if (control.midi === null) issue('keys need MIDI facts', 'midi');
			}
			if ((group === 'track') !== (control.track !== undefined)) {
				issue('`track` belongs on track keys only (and is required there)', 'track');
			}
			if ((group === 'keyboard') !== (control.keyboard !== undefined)) {
				issue('`keyboard` belongs on keyboard keys only (and is required there)', 'keyboard');
			}
			if (control.keyboard && control.midi?.note !== control.keyboard.note) {
				issue('midi.note must equal keyboard.note', 'midi', 'note');
			}
			if (control.geometry.face === 'top' && control.geometry.grid === undefined) {
				const offGrid = ['mic', 'meter'];
				if (!offGrid.includes(control.kind)) issue('top-face controls sit on the grid', 'geometry');
			}
		});

		for (const id of CONTROL_IDS) {
			if (!seen.has(id))
				ctx.addIssue({ code: 'custom', path: ['controls'], message: `missing ${id}` });
		}
	});

/** A validated control entry. */
export type Control = z.infer<typeof ControlSchema>;
/** The validated `controls.json`. */
export type ControlsFile = z.infer<typeof ControlsFileSchema>;
/** Geometry of a control (face, grid cell, rect, centre, shape). */
export type ControlGeometry = Control['geometry'];
/** Shape of a control's actuator or feature. */
export type ControlShape = ControlGeometry['shape'];
/** LED capability of a control. */
export type ControlLed = NonNullable<Control['led']>;
/** MIDI facts of a control. */
export type ControlMidi = NonNullable<Control['midi']>;
/** Physical kind. */
export type ControlKind = (typeof CONTROL_KINDS)[number];
/** Functional group. */
export type ControlGroup = (typeof CONTROL_GROUPS)[number];
/** Input capability. */
export type ControlInput = (typeof CONTROL_INPUTS)[number];
/** LED state. */
export type LedState = (typeof LED_STATES)[number];
/** Auxiliary-track role. */
export type AuxRole = (typeof AUX_ROLES)[number];
