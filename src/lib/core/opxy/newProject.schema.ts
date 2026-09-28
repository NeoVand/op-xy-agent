import { z } from 'zod';
import {
	checkSourceKeys,
	ConfidenceSchema,
	SourceListSchema,
	SourceRefSchema
} from './common.schema';
import { ENGINE_IDS } from './tracks';

/**
 * Schema of `knowledge/presets/new-project.json`: a new project's sounds as the device stores them
 * (q15 lanes), per instrument track, plus each engine's values when picked with no preset.
 */

/** A q15 lane: 0…32767. */
const Q15 = z.int().min(0).max(32767);
const Q15x4 = z.tuple([Q15, Q15, Q15, Q15]);

/** Filter models, as the device's filter type byte names them. */
export const NEW_PROJECT_FILTERS = ['svf', 'ladder', 'z lowpass', 'z hipass'] as const;
/** LFO types. */
export const NEW_PROJECT_LFOS = ['tremolo', 'value', 'random', 'element', 'duck'] as const;
/** Play modes. */
export const NEW_PROJECT_PLAY_MODES = ['poly', 'mono', 'legato'] as const;

const ModulationSchema = z.tuple([Q15, Q15]);

const TrackSoundSchema = z.looseObject({
	track: z.int().min(1).max(8),
	preset: z.string().regex(/^[a-z]+\/[a-z0-9 ]+$/),
	engine: z.enum(ENGINE_IDS),
	octave: z.int().min(-4).max(4),
	params: Q15x4,
	amp: Q15x4,
	filterEnv: Q15x4,
	playMode: z.enum(NEW_PROJECT_PLAY_MODES),
	portamento: z.looseObject({ amount: Q15, type: Q15 }),
	bend: Q15,
	volume: Q15,
	filter: z.looseObject({
		type: z.enum(NEW_PROJECT_FILTERS),
		on: z.boolean(),
		params: Q15x4
	}),
	sends: Q15x4,
	lfo: z.looseObject({
		type: z.enum(NEW_PROJECT_LFOS),
		on: z.boolean(),
		params: z.array(Q15).length(8)
	}),
	velocity: z.looseObject({ sensitivity: Q15, target: Q15, amount: Q15 }),
	width: Q15,
	highpass: Q15,
	tuning: z.looseObject({ scale: Q15, root: Q15 }),
	modulation: z.looseObject({
		modwheel: ModulationSchema,
		aftertouch: ModulationSchema,
		pitchbend: ModulationSchema
	}),
	mix: z.looseObject({ level: Q15, pan: Q15 }),
	note: z.string().optional()
});

const EffectSchema = z.looseObject({ type: z.string().min(1), params: Q15x4 });

export const NewProjectFileSchema = z
	.looseObject({
		schemaVersion: z.literal(1),
		firmware: z.string().regex(/^\d+\.\d+\.\d+$/),
		sources: z.record(z.string(), SourceRefSchema),
		confidence: ConfidenceSchema,
		source: SourceListSchema.min(1),
		tracks: z
			.array(TrackSoundSchema)
			.length(8)
			.refine((tracks) => tracks.every((t, i) => t.track === i + 1), 'tracks 1–8 in order'),
		effects: z.looseObject({
			confidence: ConfidenceSchema,
			source: SourceListSchema.min(1),
			fx1: EffectSchema,
			fx2: EffectSchema
		}),
		engineInit: z.looseObject({
			confidence: ConfidenceSchema,
			source: SourceListSchema.min(1),
			params: z.partialRecord(z.enum(ENGINE_IDS), Q15x4)
		})
	})
	.superRefine((file, ctx) => checkSourceKeys(file, new Set(Object.keys(file.sources)), ctx));

/** `knowledge/presets/new-project.json`, parsed. */
export type NewProjectFile = z.infer<typeof NewProjectFileSchema>;
/** One instrument track's stored sound. */
export type NewProjectTrack = NewProjectFile['tracks'][number];
