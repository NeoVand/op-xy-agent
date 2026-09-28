/**
 * The shape of our manual (docs/research/40-official-docs.md §8, docs/DECISIONS.md D2).
 *
 * Two schemas live here:
 * - {@link UnitFrontMatterSchema}: what an author writes in the YAML front-matter of
 *   `knowledge/manual/units/<area>/<slug>.md` (the Markdown body below it is the prose).
 * - {@link ManualFileSchema}: the validated, normalised `knowledge/manual/build/manual.json` the app
 *   loads — every optional field made explicit (`null`), key combos in canonical spelling, plus
 *   derived data (sources, control ids to highlight, CC confidence).
 *
 * Cross-field rules (key grammar, sources, firmware tags, status, related ids) need more context
 * than a zod schema has; they are checked in `validate.ts` and `build.ts`.
 */
import { z } from 'zod';
import { ConfidenceSchema, FirmwareVersionStringSchema } from '$lib/core/opxy/common.schema';
import { CONTROL_IDS } from '$lib/core/opxy/ids';

// ---------------------------------------------------------------------------------------------
// Vocabulary

/** Manual areas, in the order the prompt bundle presents them. A unit's folder is its area. */
export const AREA_IDS = [
	'basics',
	'hardware',
	'sequencer',
	'players',
	'instrument',
	'sampler',
	'auxiliary',
	'fx',
	'arrange',
	'mix',
	'project',
	'tempo',
	'com',
	'howto'
] as const;
/** One manual area. */
export type AreaId = (typeof AREA_IDS)[number];

/** What each area holds, and which chapters of TE's guide feed it (0 = the guide's index page). */
export const AREA_INFO: Readonly<
	Record<
		AreaId,
		{ readonly title: string; readonly description: string; readonly chapters: readonly number[] }
	>
> = {
	basics: {
		title: 'Basics',
		description:
			'How the OP-XY is organised: main modes and module pages, track keys, the pattern/scene/song model, key notation and firmware versions.',
		chapters: [3, 5, 6, 12]
	},
	hardware: {
		title: 'Hardware',
		description:
			'The physical unit: panel layout, power and battery, sockets, specifications, and the TE boot recovery menu.',
		chapters: [0, 1, 2, 24]
	},
	sequencer: {
		title: 'Sequencer',
		description:
			'Step and live recording, editing steps, parameter locks, the bar menu and the step components.',
		chapters: [7, 8]
	},
	players: {
		title: 'Players',
		description: 'Per-track note players: arpeggio, maestro chords and hold.',
		chapters: [9]
	},
	instrument: {
		title: 'Instrument',
		description:
			'Instrument tracks: engines (synths, samplers, MIDI), envelopes, filter, LFO, preset settings and presets.',
		chapters: [14, 20]
	},
	sampler: {
		title: 'Sampler',
		description:
			'Sampling audio, the synth, drum and multi samplers, slicing and the sample library.',
		chapters: [18]
	},
	auxiliary: {
		title: 'Auxiliary',
		description:
			'The eight auxiliary tracks: brain, punch-in FX, external MIDI, CV and audio, tape, and the FX I/II sends.',
		chapters: [15]
	},
	fx: {
		title: 'Effects',
		description: 'The send effects that can sit on FX I and FX II, and what each encoder does.',
		chapters: [21]
	},
	arrange: {
		title: 'Arrange',
		description: 'Patterns per track, sound link, scenes and song mode.',
		chapters: [16]
	},
	mix: {
		title: 'Mix',
		description: 'Levels, pans, sends, mute and solo, and the master EQ, saturator and compressor.',
		chapters: [17]
	},
	project: {
		title: 'Project',
		description: 'Creating, saving and organising projects, templates and project settings.',
		chapters: [10]
	},
	tempo: {
		title: 'Tempo',
		description: 'Tempo, tap tempo, grooves, swing and the metronome.',
		chapters: [11]
	},
	com: {
		title: 'Connectivity',
		description:
			'The com hub: system settings, MIDI settings and monitor, controller mode, devices, MTP, multi-out and the MIDI CC reference.',
		chapters: [19, 23]
	},
	howto: {
		title: 'How-to recipes',
		description:
			'Task-oriented walkthroughs: first project, syncing and controlling other gear, audio interfacing, backups and samples.',
		chapters: [4, 22]
	}
};

/** Unit status: how the unit relates to TE's guide (v1.1.15) and our reference firmware (1.1.33). */
export const UNIT_STATUSES = [
	/** The guide describes it and still matches current firmware (we may add detail). */
	'current',
	/** The guide describes it, but later firmware changed it in a way the guide misses. */
	'outdated-in-guide',
	/** The guide is silent about the feature; the OS changelog documents it (the guide may be cited for context). */
	'changelog-only',
	/** From community sources or our own inference, not yet confirmed. */
	'unverified'
] as const;
/** See {@link UNIT_STATUSES}. */
export type UnitStatus = (typeof UNIT_STATUSES)[number];

/** The four main modes a unit can apply to (none = mode-independent). */
export const MODES = ['instrument', 'auxiliary', 'arrange', 'mix'] as const;
/** A main mode. */
export type Mode = (typeof MODES)[number];

/**
 * Screens and pages a unit or parameter lives on. `M1`–`M4` are the module pages of the current
 * mode; the rest are named views. Extend this list when a new screen is documented.
 */
export const SCREENS = [
	'M1',
	'M2',
	'M3',
	'M4',
	'bar',
	'player',
	'engine list',
	'preset browser',
	'preset settings',
	'project',
	'projects folder',
	'tempo',
	'sample',
	'sample library',
	'song',
	'com',
	'system settings',
	'controller',
	'devices',
	'mtp',
	'te boot'
] as const;
/** A screen name. */
export type Screen = (typeof SCREENS)[number];

/** Encoders by colour, dark gray → white. */
export const ENCODERS = ['E1', 'E2', 'E3', 'E4'] as const;
/** An encoder. */
export type Encoder = (typeof ENCODERS)[number];

/**
 * How a parameter is reached with its encoder: `base` turn it; `shift` hold shift and turn;
 * `alt` turn it on the page an encoder click switches to (e.g. the filter envelope on M2);
 * `click` push it; `shift-click` hold shift and push it.
 */
export const PARAMETER_LAYERS = ['base', 'shift', 'alt', 'click', 'shift-click'] as const;
/** See {@link PARAMETER_LAYERS}. */
export type ParameterLayer = (typeof PARAMETER_LAYERS)[number];

/** How a source is classified (see `sources.ts`). */
export const SOURCE_KINDS = ['guide', 'changelog', 'te', 'research', 'web'] as const;
/** See {@link SOURCE_KINDS}. */
export type SourceKind = (typeof SOURCE_KINDS)[number];

// ---------------------------------------------------------------------------------------------
// Building blocks

const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A local id (fact, procedure): lower-case kebab-case, unique within its unit. */
export const LocalIdSchema = z
	.string()
	.regex(kebab, 'use lower-case kebab-case, e.g. "empty-steps"');

/** A unit id: `<area>.<slug>`, lower-case kebab-case, e.g. `sequencer.parameter-locks`. */
export const UnitIdSchema = z
	.string()
	.regex(
		/^[a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*$/,
		'expected "<area>.<slug>" in lower-case kebab-case, e.g. "sequencer.parameter-locks"'
	);

/** Prose in our own words: trimmed, never empty. */
const Text = z.string().trim().min(1, 'must not be empty');

/** A firmware version string (`1.1.33`). */
const Version = FirmwareVersionStringSchema;

/** A source reference: a TE page URL with anchor, a changelog version URL, or `docs/research/…`. */
const Source = z.string().trim().min(1, 'every fact, procedure and parameter needs a source');

/** Provenance fields shared by facts, procedures and parameters. */
const provenance = {
	source: Source,
	/** First OS version where this holds, when later than the unit's `firmware.min`. */
	firmware_min: Version.optional(),
	/** OS version on which the owner's unit showed this (e.g. `1.1.33`). */
	verified_on: Version.optional(),
	/** Needed when the source is not TE's and the item is not verified on a unit. */
	confidence: ConfidenceSchema.optional()
};

// ---------------------------------------------------------------------------------------------
// Authoring schema (front-matter)

/** One atomic fact. */
export const FactSchema = z.strictObject({
	id: LocalIdSchema,
	text: Text,
	...provenance
});

/**
 * What a recipe step sets, as the agent's `plan_steps` names it (`amp decay` to 25, `lfo type` to
 * duck), so the agent can run the recipe on the replica and a test can check that it works.
 */
export const StepSetSchema = z.strictObject({
	param: z.string().trim().min(1).max(60),
	value: z.union([z.number(), z.string().trim().min(1).max(30)])
});

/** One step of a procedure: a key combo in the grammar of `core/opxy/keys.ts`. */
export const StepSchema = z.strictObject({
	keys: z.string().min(1, 'a step needs a key combo'),
	note: Text.optional(),
	set: StepSetSchema.optional()
});

/** A how-to: a goal reached by pressing keys in order. */
export const ProcedureSchema = z.strictObject({
	id: LocalIdSchema,
	goal: Text,
	preconditions: z.array(Text).optional(),
	steps: z.array(StepSchema).min(1, 'a procedure needs at least one step'),
	result: Text.optional(),
	...provenance
});

/** One encoder assignment on one screen. */
export const ParameterSchema = z.strictObject({
	screen: z.enum(SCREENS),
	encoder: z.enum(ENCODERS),
	layer: z.enum(PARAMETER_LAYERS),
	name: Text,
	/** In display units, e.g. `0–100`, `off / on`, `40–220 BPM`. */
	range: Text.optional(),
	default: Text.optional(),
	/** MIDI CC on the track's channel; `null` = known to have none. */
	cc: z.int().min(0).max(127).nullable().optional(),
	note: Text.optional(),
	...provenance
});

/** Where a unit applies. */
export const ContextSchema = z.strictObject({
	modes: z.array(z.enum(MODES)).default([]),
	screens: z.array(z.enum(SCREENS)).default([])
});

/** Firmware tags of a unit. */
export const UnitFirmwareSchema = z.strictObject({
	/** First OS version with the feature (`1.0.9` for launch features). */
	min: Version,
	/** Later versions that changed it; must equal the `firmware_min` values used in the unit. */
	changed_in: z.array(Version),
	/** Guide version its guide-derived facts were checked against; null when it cites no guide page. */
	guide_version: Version.nullable(),
	/** Version on which the owner's unit confirmed the whole unit, or null. */
	verified_on: Version.nullable()
});

/** The YAML front-matter of a unit file. Unknown keys are errors (they are usually typos). */
export const UnitFrontMatterSchema = z.strictObject({
	id: UnitIdSchema,
	title: Text.max(80),
	aliases: z.array(Text).default([]),
	area: z.enum(AREA_IDS),
	/** Position within the area (lower first; default 100). Overviews use 0–10. */
	order: z.int().min(0).max(999).optional(),
	context: ContextSchema.default({ modes: [], screens: [] }),
	summary: Text.max(300),
	status: z.enum(UNIT_STATUSES),
	firmware: UnitFirmwareSchema,
	facts: z.array(FactSchema).min(1, 'a unit needs at least one fact'),
	procedures: z.array(ProcedureSchema).default([]),
	parameters: z.array(ParameterSchema).default([]),
	related: z.array(UnitIdSchema).default([])
});

/** A unit's front-matter as written (defaults applied). */
export type UnitFrontMatter = z.output<typeof UnitFrontMatterSchema>;

// ---------------------------------------------------------------------------------------------
// Built schema (manual.json)

const ControlIdSchema = z.enum(CONTROL_IDS);

const builtProvenance = {
	source: z.string(),
	firmware_min: Version.nullable(),
	verified_on: Version.nullable(),
	/** Explicit, or `verified` (verified_on set) / `official` (TE source) by default. */
	confidence: ConfidenceSchema
};

/** A fact in manual.json. */
export const ManualFactSchema = z.strictObject({
	id: z.string(),
	text: z.string(),
	...builtProvenance
});

/** A procedure step in manual.json: keys in canonical spelling (parse them with `parseKeys`). */
export const ManualStepSchema = z.strictObject({
	keys: z.string(),
	note: z.string().nullable(),
	/** What the step sets, for the agent's plan_steps (recipes). */
	set: StepSetSchema.nullable()
});

/** A procedure in manual.json. */
export const ManualProcedureSchema = z.strictObject({
	id: z.string(),
	goal: z.string(),
	preconditions: z.array(z.string()),
	steps: z.array(ManualStepSchema),
	result: z.string().nullable(),
	...builtProvenance
});

/** A parameter in manual.json; `keys` is the gesture that reaches it (`shift + turn E2`). */
export const ManualParameterSchema = z.strictObject({
	screen: z.enum(SCREENS),
	encoder: z.enum(ENCODERS),
	layer: z.enum(PARAMETER_LAYERS),
	keys: z.string(),
	name: z.string(),
	range: z.string().nullable(),
	default: z.string().nullable(),
	cc: z.int().nullable(),
	/** Confidence of the CC number (from the lane model in knowledge/midi/cc-map.json). */
	cc_confidence: ConfidenceSchema.nullable(),
	note: z.string().nullable(),
	...builtProvenance
});

/** A source cited by a unit, in order of first appearance. */
export const ManualSourceSchema = z.strictObject({
	url: z.string(),
	kind: z.enum(SOURCE_KINDS)
});

/** A unit in manual.json. */
export const ManualUnitSchema = z.strictObject({
	id: UnitIdSchema,
	title: z.string(),
	aliases: z.array(z.string()),
	area: z.enum(AREA_IDS),
	order: z.int(),
	/** Repo-relative path of the source file. */
	path: z.string(),
	context: z.strictObject({ modes: z.array(z.enum(MODES)), screens: z.array(z.enum(SCREENS)) }),
	summary: z.string(),
	status: z.enum(UNIT_STATUSES),
	firmware: UnitFirmwareSchema,
	facts: z.array(ManualFactSchema),
	procedures: z.array(ManualProcedureSchema),
	parameters: z.array(ManualParameterSchema),
	related: z.array(UnitIdSchema),
	/** The prose body (Markdown). */
	body: z.string(),
	sources: z.array(ManualSourceSchema),
	/** The first TE page (guide, changelog, other) the unit cites: where to send users. */
	official_url: z.string().nullable(),
	/** Every control the unit's procedures and parameters touch (for highlighting the replica). */
	controls: z.array(ControlIdSchema)
});

/** One area in manual.json, with its unit ids in presentation order. */
export const ManualAreaSchema = z.strictObject({
	id: z.enum(AREA_IDS),
	title: z.string(),
	description: z.string(),
	units: z.array(UnitIdSchema)
});

/** Counts over the whole manual. */
export const ManualStatsSchema = z.strictObject({
	units: z.int(),
	facts: z.int(),
	procedures: z.int(),
	parameters: z.int(),
	verified_items: z.int(),
	words: z.int(),
	by_area: z.record(z.string(), z.int()),
	by_status: z.record(z.string(), z.int())
});

/** `knowledge/manual/build/manual.json`. */
export const ManualFileSchema = z.strictObject({
	schema_version: z.literal(1),
	reference_firmware: Version,
	guide_version: Version,
	/** FNV-1a hash of manual.md: changes whenever the prompt bundle changes. */
	bundle_hash: z.string().regex(/^[0-9a-f]{8}$/),
	stats: ManualStatsSchema,
	areas: z.array(ManualAreaSchema),
	units: z.array(ManualUnitSchema)
});

/** A validated manual.json. */
export type Manual = z.output<typeof ManualFileSchema>;
/** A unit as the app sees it. */
export type ManualUnit = z.output<typeof ManualUnitSchema>;
/** A fact as the app sees it. */
export type ManualFact = z.output<typeof ManualFactSchema>;
/** A procedure as the app sees it. */
export type ManualProcedure = z.output<typeof ManualProcedureSchema>;
/** A parameter as the app sees it. */
export type ManualParameter = z.output<typeof ManualParameterSchema>;
/** A cited source. */
export type ManualSource = z.output<typeof ManualSourceSchema>;

/** Coverage of TE's guide sections by our units (`knowledge/manual/build/coverage.json`). */
export const CoverageFileSchema = z.strictObject({
	guide_version: Version,
	/** Sections that count (excluded ones are listed separately). */
	total: z.int(),
	covered: z.int(),
	percent: z.number(),
	by_area: z.record(z.string(), z.strictObject({ total: z.int(), covered: z.int() })),
	/** Post-guide OS releases and whether any unit cites them. */
	releases_after_guide: z.array(z.strictObject({ version: Version, cited: z.boolean() })),
	uncovered: z.array(z.string()),
	excluded: z.array(z.strictObject({ url: z.string(), reason: z.string() }))
});

/** A validated coverage.json. */
export type CoverageFile = z.output<typeof CoverageFileSchema>;
