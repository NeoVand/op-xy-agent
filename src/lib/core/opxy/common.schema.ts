import { z } from 'zod';
import { KnowledgeValidationError } from './errors';

/**
 * How sure we are of a fact. Shared by every knowledge file:
 * - `verified` observed on the owner's OP-XY (OS 1.1.33) — add `verifiedOn` where recorded
 * - `official` stated by teenage engineering (guide, product page, changelog)
 * - `measured` derived by us from TE's own drawings or orthographic renders
 * - `community-verified` two or more independent community sources, or tooling run on hardware
 * - `community` one community source
 * - `derived` inferred by us from structure across sources (a testable prediction)
 * - `speculative` an educated guess; treat as unknown
 * - `conflicting` sources disagree
 */
export const CONFIDENCE_LEVELS = [
	'verified',
	'official',
	'measured',
	'community-verified',
	'community',
	'derived',
	'speculative',
	'conflicting'
] as const;

/** zod schema for {@link Confidence}. */
export const ConfidenceSchema = z.enum(CONFIDENCE_LEVELS);
/** See {@link CONFIDENCE_LEVELS}. */
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** A 7-bit MIDI data value (0–127). */
export const MidiValueSchema = z.int().min(0).max(127);

/** Source keys citing the file's `sources` table. */
export const SourceListSchema = z.array(z.string().min(1));

/** A `major.minor.patch` firmware version, e.g. `1.1.33`. */
export const FirmwareVersionStringSchema = z
	.string()
	.regex(/^\d+\.\d+\.\d+$/, 'expected a major.minor.patch version');

/** An entry of a `sources` table: where a fact comes from. */
export const SourceRefSchema = z.looseObject({
	url: z.url().optional(),
	path: z.string().optional(),
	snapshot: z.string().optional(),
	note: z.string().optional()
});

/**
 * Walks any JSON value and returns every `source` array (with its JSON path), so a file-level
 * refinement can check that each key exists in the `sources` table.
 */
export function collectSourceLists(
	value: unknown,
	path: (string | number)[] = []
): { path: (string | number)[]; keys: string[] }[] {
	const found: { path: (string | number)[]; keys: string[] }[] = [];
	if (Array.isArray(value)) {
		value.forEach((item, i) => found.push(...collectSourceLists(item, [...path, i])));
	} else if (value !== null && typeof value === 'object') {
		for (const [key, child] of Object.entries(value)) {
			if (
				(key === 'source' || key === 'mapSource' || key === 'noKnownCcSource') &&
				Array.isArray(child)
			) {
				found.push({ path: [...path, key], keys: child.filter((k) => typeof k === 'string') });
			} else if (key !== 'sources') {
				found.push(...collectSourceLists(child, [...path, key]));
			}
		}
	}
	return found;
}

/** Adds one zod issue per source key that is missing from `known`. */
export function checkSourceKeys(
	value: unknown,
	known: ReadonlySet<string>,
	ctx: z.RefinementCtx
): void {
	for (const { path, keys } of collectSourceLists(value)) {
		for (const key of keys) {
			if (!known.has(key)) {
				ctx.addIssue({ code: 'custom', path, message: `unknown source key "${key}"` });
			}
		}
	}
}

/** Formats zod issues as `path: message` lines. */
export function formatIssues(error: z.ZodError): string[] {
	return error.issues.map((issue) => {
		const path = issue.path.map(String).join('.') || '(root)';
		return `${path}: ${issue.message}`;
	});
}

/**
 * Validates committed knowledge JSON. Throws {@link KnowledgeValidationError} listing every issue,
 * so a broken file fails loudly at import (and in the test suite) rather than deep in a tool call.
 */
export function parseKnowledge<S extends z.ZodType>(
	schema: S,
	data: unknown,
	file: string
): z.output<S> {
	const result = schema.safeParse(data);
	if (!result.success) throw new KnowledgeValidationError(file, formatIssues(result.error));
	return result.data;
}
