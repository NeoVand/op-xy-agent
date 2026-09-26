import { z } from 'zod';
import { ConfidenceSchema, MidiValueSchema, SourceListSchema } from './common.schema';

/**
 * Schema of `knowledge/midi/remote-keys.json` (the CC106/107 remote key map). Its source keys cite
 * cc-map.json's `sources` table; that cross-file check lives in `data.ts`.
 */

/** Risk classes of remote keys, from the file's `riskClasses` table. */
export const REMOTE_KEY_RISKS = [
	'ui',
	'ui-caution',
	'audible',
	'state-change',
	'writes-project',
	'modifier',
	'destructive-in-context'
] as const;

/** Groups used by remote-keys.json entries. */
export const REMOTE_KEY_GROUPS = [
	'mode',
	'module',
	'encoder-click',
	'track',
	'function',
	'keyboard',
	'transport',
	'modifier',
	'step'
] as const;

const RemoteKeyEntrySchema = z
	.looseObject({
		value: z.int().min(0).max(127),
		hex: z.string().regex(/^[0-9A-F]{2}$/),
		id: z.string().regex(/^[a-z][A-Za-z0-9]*$/),
		label: z.string().min(1),
		group: z.enum(REMOTE_KEY_GROUPS),
		ctrlModeCc: MidiValueSchema.optional(),
		ctrlModeNote: MidiValueSchema.optional(),
		behavior: z.string().min(1),
		risk: z.enum(REMOTE_KEY_RISKS),
		confidence: ConfidenceSchema,
		source: SourceListSchema.min(1)
	})
	.refine((key) => parseInt(key.hex, 16) === key.value, 'hex must encode value')
	.refine(
		(key) => (key.ctrlModeCc === undefined) !== (key.ctrlModeNote === undefined),
		'exactly one of ctrlModeCc / ctrlModeNote'
	);

const RecipeSchema = z.looseObject({
	id: z.string().min(1),
	steps: z.array(z.tuple([z.enum(['tap', 'down', 'up']), z.string().min(1)])).min(1),
	effect: z.string(),
	risk: z.enum(REMOTE_KEY_RISKS),
	confidence: ConfidenceSchema,
	source: SourceListSchema
});

/** Schema of `knowledge/midi/remote-keys.json`. */
export const RemoteKeysFileSchema = z
	.looseObject({
		schemaVersion: z.literal(1),
		generated: z.iso.date(),
		protocol: z.looseObject({
			down: z.looseObject({ status: z.literal('B0'), cc: z.literal(106) }),
			up: z.looseObject({ status: z.literal('B0'), cc: z.literal(107) }),
			channelObserved: z.int().min(1).max(16),
			confidence: ConfidenceSchema,
			source: SourceListSchema
		}),
		firmwareStatus: z
			.array(
				z.looseObject({
					firmware: z.string().min(1),
					status: z.string().min(1),
					source: SourceListSchema
				})
			)
			.min(1),
		riskClasses: z.record(z.enum(REMOTE_KEY_RISKS), z.string()),
		keys: z.array(RemoteKeyEntrySchema).min(1),
		unmapped: z.looseObject({ range: z.tuple([z.int(), z.int()]) }),
		recipes: z.array(RecipeSchema),
		agentRules: z.array(z.string())
	})
	.superRefine((file, ctx) => {
		const ids = new Set<string>();
		file.keys.forEach((key, i) => {
			if (key.value !== i) {
				ctx.addIssue({
					code: 'custom',
					path: ['keys', i, 'value'],
					message: `keys must be listed by value without gaps (expected ${i})`
				});
			}
			if (ids.has(key.id)) {
				ctx.addIssue({
					code: 'custom',
					path: ['keys', i, 'id'],
					message: `duplicate id ${key.id}`
				});
			}
			ids.add(key.id);
		});
		const [lo, hi] = file.unmapped.range;
		if (lo !== file.keys.length || hi !== 127) {
			ctx.addIssue({
				code: 'custom',
				path: ['unmapped', 'range'],
				message: `unmapped range must be [${file.keys.length}, 127]`
			});
		}
		file.recipes.forEach((recipe, r) => {
			recipe.steps.forEach(([, keyId], s) => {
				if (!ids.has(keyId)) {
					ctx.addIssue({
						code: 'custom',
						path: ['recipes', r, 'steps', s],
						message: `unknown key id "${keyId}"`
					});
				}
			});
		});
	});

/** The validated remote-keys.json. */
export type RemoteKeysFile = z.infer<typeof RemoteKeysFileSchema>;
/** Risk class of a remote key. */
export type RemoteKeyRisk = (typeof REMOTE_KEY_RISKS)[number];
/** Group of a remote key. */
export type RemoteKeyGroup = (typeof REMOTE_KEY_GROUPS)[number];
