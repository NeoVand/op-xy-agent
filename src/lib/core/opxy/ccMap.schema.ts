import { z } from 'zod';
import {
	ConfidenceSchema,
	MidiValueSchema,
	SourceListSchema,
	SourceRefSchema,
	checkSourceKeys
} from './common.schema';

/**
 * Schema of `knowledge/midi/cc-map.json` (research data, edited by hand). Objects are loose so
 * research annotations can be added freely; every field the code relies on is typed and required.
 */

/** What sending a CC changes on the device (`sideEffects` table of cc-map.json). */
export const SIDE_EFFECTS = [
	'none',
	'ui',
	'audible',
	'transport',
	'scene',
	'project',
	'destructive'
] as const;

/** Track types keyed as in `trackTypes` of cc-map.json. */
export const CC_TRACK_TYPES = [
	'instrument',
	'brain',
	'punchIn',
	'externalMidi',
	'externalCv',
	'externalAudio',
	'tape',
	'fx'
] as const;

/** Encoder-lane strings used by cc-map.json params: `M3.dark`, `M2+shift.white`, `M2alt.mid`, `mixer`. */
export const LANE_STRING = /^(?:M[1-4](?:\+shift)?|M2alt)\.(?:dark|mid|light|white)$|^mixer$/;

/** Channel scope: any channel, every track channel, or an explicit list (1-based). */
const ChannelSpecSchema = z.union([
	z.literal('any'),
	z.literal('1-16'),
	z.array(z.int().min(1).max(16)).min(1)
]);

const RangeSchema = z
	.tuple([MidiValueSchema, MidiValueSchema])
	.refine(([lo, hi]) => lo <= hi, 'range must be [low, high]');

/** One CC parameter (global, per-track or per-track-type). */
export const CcParamSchema = z.looseObject({
	cc: MidiValueSchema,
	id: z.string().regex(/^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+$/, 'expected a dotted camelCase id'),
	name: z.string().min(1),
	lane: z.string().regex(LANE_STRING, 'unknown lane').optional(),
	range: RangeSchema,
	semantics: z.string().optional(),
	confidence: ConfidenceSchema,
	existence: ConfidenceSchema.optional(),
	source: SourceListSchema.min(1),
	sideEffect: z.enum(SIDE_EFFECTS),
	channel: ChannelSpecSchema.optional(),
	values: z
		.union([z.array(z.string().min(1)).min(2), z.record(z.string(), MidiValueSchema), z.string()])
		.optional(),
	notes: z.string().optional(),
	caution: z.string().optional()
});

const GlobalCcSchema = CcParamSchema.extend({
	channel: ChannelSpecSchema,
	candidates: z
		.array(
			z.looseObject({
				id: z.string().min(1),
				formula: z.string(),
				inverse: z.string(),
				source: SourceListSchema
			})
		)
		.optional(),
	perChannel: z
		.record(
			z.string().regex(/^(?:[1-9]|1[0-6])$/),
			z.looseObject({ band: z.string().min(1), confidence: ConfidenceSchema })
		)
		.optional()
});

const ChannelDefaultSchema = z.looseObject({
	channel: z.int().min(1).max(16),
	track: z.int().min(1).max(16),
	kind: z.enum(['instrument', 'auxiliary']),
	role: z.string().min(1),
	defaultEngine: z.string().optional(),
	auxIndex: z.int().min(1).max(8).optional(),
	description: z.string().optional(),
	confidence: ConfidenceSchema,
	source: SourceListSchema
});

const LanePageSchema = z.looseObject({
	page: z.string().regex(/^(?:M[1-4](?:\+shift)?|M2 alt)(?: \(.*\))?$/, 'unknown lane page'),
	dark: MidiValueSchema,
	mid: MidiValueSchema,
	light: MidiValueSchema,
	white: MidiValueSchema,
	confidence: ConfidenceSchema
});

const TrackTypeSchema = z.looseObject({
	tracks: z.array(z.int().min(1).max(16)).min(1),
	channelDefault: z.union([z.int().min(1).max(16), z.array(z.int().min(1).max(16))]).optional(),
	params: z.array(CcParamSchema)
});

const EngineParamsSchema = z.looseObject({
	p1: z.string().min(1),
	p2: z.string().min(1),
	p3: z.string().min(1),
	p4: z.string().min(1).nullable(),
	confidence: ConfidenceSchema,
	source: SourceListSchema,
	notes: z.string().optional()
});

const ControllerModeEntrySchema = z.looseObject({
	control: z.string().min(1),
	type: z.enum(['cc', 'note']).nullable(),
	numbers: z.array(MidiValueSchema),
	remoteKeyIndex: z.array(z.int().min(0).max(127)).optional()
});

/** Schema of `knowledge/midi/cc-map.json`. */
export const CcMapFileSchema = z
	.looseObject({
		schemaVersion: z.literal(1),
		generated: z.iso.date(),
		sources: z.record(z.string(), SourceRefSchema),
		sideEffects: z.record(z.enum(SIDE_EFFECTS), z.string()),
		channels: z.looseObject({
			defaults: z.array(ChannelDefaultSchema).length(16),
			activeTrackChannel: z.looseObject({ default: z.int().min(1).max(16) })
		}),
		laneModel: z.looseObject({
			confidence: ConfidenceSchema,
			source: SourceListSchema,
			pages: z.array(LanePageSchema).length(8),
			mixer: z.looseObject({ level: MidiValueSchema, pan: MidiValueSchema, mute: MidiValueSchema })
		}),
		global: z.array(GlobalCcSchema).min(1),
		perTrack: z.array(CcParamSchema.extend({ channel: z.literal('1-16') })).min(1),
		trackTypes: z.looseObject({
			instrument: TrackTypeSchema.extend({ appliesToEngines: z.array(z.string().min(1)).min(1) }),
			brain: TrackTypeSchema,
			punchIn: TrackTypeSchema,
			externalMidi: TrackTypeSchema,
			externalCv: TrackTypeSchema,
			externalAudio: TrackTypeSchema,
			tape: TrackTypeSchema,
			fx: TrackTypeSchema,
			_common: z.looseObject({ ccs: z.array(MidiValueSchema) })
		}),
		engines: z.record(z.string().regex(/^[a-z]+$/), EngineParamsSchema),
		fxEngines: z.record(z.string().regex(/^[a-z]+$/), EngineParamsSchema),
		fxTypeBytes: z.looseObject({
			delay: z.int(),
			reverb: z.int(),
			chorus: z.int(),
			phaser: z.int(),
			distortion: z.int(),
			lofi: z.int(),
			confidence: ConfidenceSchema,
			source: SourceListSchema
		}),
		controllerModeOut: z.looseObject({ map: z.array(ControllerModeEntrySchema).min(1) })
	})
	.superRefine((file, ctx) => {
		checkSourceKeys(file, new Set(Object.keys(file.sources)), ctx);

		const ids = new Map<string, string>();
		const tables: [string, { id: string }[]][] = [
			['global', file.global],
			['perTrack', file.perTrack],
			...CC_TRACK_TYPES.map((t): [string, { id: string }[]] => [
				`trackTypes.${t}`,
				file.trackTypes[t].params
			])
		];
		for (const [table, params] of tables) {
			params.forEach((param, i) => {
				const other = ids.get(param.id);
				if (other) {
					ctx.addIssue({
						code: 'custom',
						path: [...table.split('.'), 'params', i, 'id'],
						message: `duplicate parameter id "${param.id}" (also in ${other})`
					});
				}
				ids.set(param.id, table);
			});
		}

		file.channels.defaults.forEach((entry, i) => {
			if (entry.track !== i + 1 || entry.channel !== i + 1) {
				ctx.addIssue({
					code: 'custom',
					path: ['channels', 'defaults', i],
					message: 'defaults must list tracks 1-16 in order'
				});
			}
		});
	});

/** The validated cc-map.json. */
export type CcMapFile = z.infer<typeof CcMapFileSchema>;
/** One validated CC parameter entry. */
export type CcParamEntry = z.infer<typeof CcParamSchema>;
/** Side-effect class of a CC. */
export type SideEffect = (typeof SIDE_EFFECTS)[number];
/** Track type key of cc-map.json. */
export type CcTrackType = (typeof CC_TRACK_TYPES)[number];
