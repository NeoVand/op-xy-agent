/**
 * Builds the manual from unit files: validates every unit (`validate.ts`), checks links between
 * units, runs the verbatim guard when TE's text is available, and renders the three committed
 * artefacts — manual.json (the app's data), manual.md (the agent's cached prompt bundle) and
 * search-index.json (MiniSearch) — plus coverage.json when the scrape is present.
 *
 * Pure: the caller reads files and writes outputs (`cli.ts`, tests). Deterministic: the same units
 * give byte-identical outputs.
 */
import { z } from 'zod';
import inventoryJson from '$knowledge/firmware/opxy-firmware-inventory.json';
import { GUIDE_FIRMWARE, REFERENCE_FIRMWARE } from '$lib/core/opxy/firmware';
import { computeCoverage, coverageFile, type CoverageResult } from './coverage';
import type { OfficialCorpus } from './official';
import { renderPromptBundle } from './prompt';
import {
	AREA_IDS,
	AREA_INFO,
	CoverageFileSchema,
	ManualFileSchema,
	type Manual,
	type ManualUnit
} from './schema';
import { buildSearchIndex } from './search';
import { markdownHeadingSlugs } from './sources';
import {
	checkUnit,
	countWords,
	parseUnitFile,
	proseFields,
	type ManualIssue,
	type UnitFile
} from './validate';
import { VerbatimIndex, VERBATIM_MIN_WORDS } from './verbatim';

/** Where the committed artefacts live, relative to the repo root. */
export const BUILD_DIR = 'knowledge/manual/build';

/** Artefact file names inside {@link BUILD_DIR}. */
export const BUILD_FILES = {
	manual: 'manual.json',
	bundle: 'manual.md',
	searchIndex: 'search-index.json',
	coverage: 'coverage.json'
} as const;

const InventorySchema = z.looseObject({
	builds: z.array(z.looseObject({ version: z.string() })).min(1)
});

/** Every public OS release, from the committed firmware inventory. */
export const KNOWN_RELEASES: readonly string[] = InventorySchema.parse(inventoryJson).builds.map(
	(b) => b.version
);

/** Inputs of a build. */
export interface BuildInput {
	readonly units: readonly UnitFile[];
	/** The local scrape, or null/absent (CI): anchors, verbatim guard and coverage are skipped. */
	readonly official?: OfficialCorpus | null;
	/** Research notes that sources may cite: repo path → Markdown. */
	readonly research?: Readonly<Record<string, string>>;
	/** Known OS releases (defaults to {@link KNOWN_RELEASES}). */
	readonly versions?: readonly string[];
	/** Report `related` ids of units that do not exist yet as warnings (during a fan-out). */
	readonly allowDangling?: boolean;
	/** Phrases the verbatim guard accepts (e.g. a list of names that cannot be reworded). */
	readonly verbatimAllow?: readonly string[];
}

/** The rendered artefacts. */
export interface BuildOutputs {
	readonly manualJson: string;
	readonly promptBundle: string;
	readonly searchIndexJson: string;
	/** Only when the scrape was available. */
	readonly coverageJson: string | null;
}

/** Outcome of a build. */
export interface BuildResult {
	readonly ok: boolean;
	readonly errors: readonly ManualIssue[];
	readonly warnings: readonly ManualIssue[];
	/** The manual, when there are no errors. */
	readonly manual: Manual | null;
	readonly outputs: BuildOutputs | null;
	readonly coverage: CoverageResult | null;
	/** Whether the verbatim guard ran (it needs the scrape). */
	readonly verbatimChecked: boolean;
}

/** FNV-1a (32-bit) of the UTF-8 bytes of `text`, as 8 hex digits. Change detection only. */
export function fnv1a(text: string): string {
	let hash = 0x811c9dc5;
	for (const byte of new TextEncoder().encode(text)) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}

/** Units in presentation order: area, then `order`, then id. */
export function sortUnits(units: readonly ManualUnit[]): ManualUnit[] {
	const areaRank = new Map<string, number>(AREA_IDS.map((a, i) => [a, i]));
	return [...units].sort(
		(a, b) =>
			(areaRank.get(a.area) ?? 99) - (areaRank.get(b.area) ?? 99) ||
			a.order - b.order ||
			a.id.localeCompare(b.id)
	);
}

function manualStats(units: readonly ManualUnit[]): Manual['stats'] {
	const byArea: Record<string, number> = {};
	const byStatus: Record<string, number> = {};
	let facts = 0;
	let procedures = 0;
	let parameters = 0;
	let verified = 0;
	let words = 0;
	for (const unit of units) {
		byArea[unit.area] = (byArea[unit.area] ?? 0) + 1;
		byStatus[unit.status] = (byStatus[unit.status] ?? 0) + 1;
		facts += unit.facts.length;
		procedures += unit.procedures.length;
		parameters += unit.parameters.length;
		for (const item of [...unit.facts, ...unit.procedures, ...unit.parameters]) {
			if (item.verified_on !== null) verified++;
		}
		for (const field of proseFields(unit)) words += countWords(field.text);
	}
	return {
		units: units.length,
		facts,
		procedures,
		parameters,
		verified_items: verified,
		words,
		by_area: byArea,
		by_status: byStatus
	};
}

/** Builds the manual. Never throws for authoring problems: they come back as issues. */
export function buildManual(input: BuildInput): BuildResult {
	const issues: ManualIssue[] = [];
	const versions = new Set(input.versions ?? KNOWN_RELEASES);
	const research = new Map(
		Object.entries(input.research ?? {}).map(([file, text]) => [file, markdownHeadingSlugs(text)])
	);
	const official = input.official ?? null;
	const ctx = { versions, guideVersion: GUIDE_FIRMWARE, official, research };

	const files = [...input.units].sort((a, b) => a.path.localeCompare(b.path));
	const units: ManualUnit[] = [];
	for (const file of files) {
		const parsed = parseUnitFile(file, issues);
		if (parsed) units.push(checkUnit(parsed, ctx, issues));
	}

	// Links between units.
	const ids = new Map<string, string>();
	for (const unit of units) {
		const other = ids.get(unit.id);
		if (other) {
			issues.push({
				severity: 'error',
				file: unit.path,
				unit: unit.id,
				message: `duplicate unit id (also ${other})`
			});
		}
		ids.set(unit.id, unit.path);
	}
	for (const unit of units) {
		for (const related of unit.related) {
			if (ids.has(related)) continue;
			issues.push({
				severity: input.allowDangling ? 'warning' : 'error',
				file: unit.path,
				unit: unit.id,
				where: 'related',
				message: `no unit "${related}"${input.allowDangling ? ' (yet)' : ''}`
			});
		}
	}

	// The verbatim guard: our words only.
	if (official) {
		const index = new VerbatimIndex(official.documents, VERBATIM_MIN_WORDS, input.verbatimAllow);
		for (const unit of units) {
			for (const field of proseFields(unit)) {
				for (const run of index.find(field.text)) {
					issues.push({
						severity: 'error',
						file: unit.path,
						unit: unit.id,
						where: field.where,
						message: `${run.words} words copied from TE's text (${run.match}): "${run.excerpt}" — reword it`
					});
				}
			}
		}
	}

	const errors = issues.filter((i) => i.severity === 'error');
	const warnings = issues.filter((i) => i.severity === 'warning');
	if (errors.length > 0) {
		return {
			ok: false,
			errors,
			warnings,
			manual: null,
			outputs: null,
			coverage: null,
			verbatimChecked: official !== null
		};
	}

	const sorted = sortUnits(units);
	const draft: Manual = {
		schema_version: 1,
		reference_firmware: REFERENCE_FIRMWARE,
		guide_version: GUIDE_FIRMWARE,
		bundle_hash: '00000000',
		stats: manualStats(sorted),
		areas: AREA_IDS.map((id) => ({
			id,
			title: AREA_INFO[id].title,
			description: AREA_INFO[id].description,
			units: sorted.filter((u) => u.area === id).map((u) => u.id)
		})),
		units: sorted
	};
	const promptBundle = renderPromptBundle(draft);
	const manual = ManualFileSchema.parse({ ...draft, bundle_hash: fnv1a(promptBundle) });
	const coverage = official ? computeCoverage(sorted, official) : null;
	return {
		ok: true,
		errors,
		warnings,
		manual,
		outputs: {
			manualJson: JSON.stringify(manual, null, '\t') + '\n',
			promptBundle,
			searchIndexJson: JSON.stringify(buildSearchIndex(sorted)) + '\n',
			coverageJson: coverage
				? JSON.stringify(CoverageFileSchema.parse(coverageFile(coverage)), null, '\t') + '\n'
				: null
		},
		coverage,
		verbatimChecked: official !== null
	};
}

/** One line per issue: `error file [unit] where: message`. */
export function formatIssue(issue: ManualIssue): string {
	const where = issue.where ? ` ${issue.where}:` : '';
	return `${issue.severity} ${issue.file}${where} ${issue.message}`;
}
