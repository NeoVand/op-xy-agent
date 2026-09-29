/**
 * Our OP-XY manual at runtime: the reworded, agent-oriented units built from
 * `knowledge/manual/units/` (see `knowledge/manual/README.md`). Browser-safe and pure; the data is
 * bundled from the committed build artefacts and parsed + validated on first use.
 *
 * The API is deliberately small and stable:
 *
 * | function                        | use                                                                 |
 * | ------------------------------- | ------------------------------------------------------------------- |
 * | {@link loadManual}              | every unit, area and stat (validated manual.json)                   |
 * | {@link getUnit}                 | one unit by id (`sequencer.parameter-locks`)                        |
 * | {@link resolveRef}              | a citation (`sequencer.parameter-locks#rotate`) → unit + fact/procedure |
 * | {@link searchManual}            | ranked units for a question, with a snippet and TE's source URL     |
 * | {@link manualPromptBundle}      | the whole manual as Markdown for the agent's cached system prompt   |
 * | {@link manualCoverage}          | counts, and how much of TE's guide the units cover                  |
 *
 * Bundle size: the manual ships as JSON + Markdown (grows to a few hundred KB with ~170 units);
 * import this module lazily (`await import('$lib/manual')`) from UI code that is not always shown.
 */
import manualText from '$knowledge/manual/build/manual.json?raw';
import bundleText from '$knowledge/manual/build/manual.md?raw';
import searchIndexText from '$knowledge/manual/build/search-index.json?raw';
import coverageText from '$knowledge/manual/build/coverage.json?raw';
import type MiniSearch from 'minisearch';
import { ManualDataError } from './errors';
import {
	CoverageFileSchema,
	ManualFileSchema,
	type AreaId,
	type Manual,
	type ManualFact,
	type ManualProcedure,
	type ManualUnit,
	type UnitStatus
} from './schema';
import {
	loadSearchIndex,
	searchUnits,
	type ManualSearchResult,
	type SearchDocument,
	type SearchUnitsOptions
} from './search';

export type {
	AreaId,
	Manual,
	ManualFact,
	ManualParameter,
	ManualProcedure,
	ManualSource,
	ManualUnit,
	UnitStatus
} from './schema';
export type { ManualSearchResult, SearchUnitsOptions } from './search';
export { AREA_IDS, AREA_INFO, UNIT_STATUSES } from './schema';
export { ManualDataError, ManualError } from './errors';
export { unitTitle } from './titles';

interface Loaded {
	readonly manual: Manual;
	readonly byId: ReadonlyMap<string, ManualUnit>;
}

let loaded: Loaded | undefined;
let searchIndex: MiniSearch<SearchDocument> | undefined;

function parseJson(text: string, file: string): unknown {
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new ManualDataError(`${file} is not valid JSON: ${(error as Error).message}`);
	}
}

function load(): Loaded {
	if (loaded) return loaded;
	const result = ManualFileSchema.safeParse(parseJson(manualText, 'manual.json'));
	if (!result.success) {
		const first = result.error.issues[0];
		throw new ManualDataError(
			`knowledge/manual/build/manual.json is invalid at ${first?.path.join('.') || '(root)'}: ${first?.message} — rebuild with node scripts/build-manual.mjs`
		);
	}
	const manual = result.data;
	loaded = { manual, byId: new Map(manual.units.map((u) => [u.id, u])) };
	return loaded;
}

/**
 * The whole manual: units in presentation order, areas, counts, the firmware it is written for
 * (`reference_firmware`) and the guide version it was checked against.
 * @throws {ManualDataError} if the bundled manual.json is corrupt (a build problem, not user input)
 */
export function loadManual(): Manual {
	return load().manual;
}

/** One unit by id, e.g. `sequencer.parameter-locks`; undefined for unknown ids. */
export function getUnit(id: string): ManualUnit | undefined {
	return load().byId.get(id);
}

/** What a citation points at. */
export interface ResolvedRef {
	readonly unit: ManualUnit;
	/** The fact named after `#`, if the ref names a fact. */
	readonly fact: ManualFact | null;
	/** The procedure named after `#`, if the ref names a procedure. */
	readonly procedure: ManualProcedure | null;
}

/**
 * Resolves a citation: `unit-id` or `unit-id#item-id` (a fact or procedure id).
 * @returns undefined when the unit or item does not exist
 */
export function resolveRef(ref: string): ResolvedRef | undefined {
	const hash = ref.indexOf('#');
	const unit = getUnit(hash < 0 ? ref : ref.slice(0, hash));
	if (!unit) return undefined;
	if (hash < 0) return { unit, fact: null, procedure: null };
	const item = ref.slice(hash + 1);
	const fact = unit.facts.find((f) => f.id === item) ?? null;
	const procedure = unit.procedures.find((p) => p.id === item) ?? null;
	if (!fact && !procedure) return undefined;
	return { unit, fact, procedure };
}

/**
 * Searches the manual (BM25 over titles, aliases, summaries, procedure goals and facts, with
 * synonyms such as ratchet → multiply). Results are ranked best first; each carries the unit id,
 * a snippet from its best-matching fact and the official TE URL to cite.
 * @param options `limit` (default 8), `area` to restrict to one area
 */
export function searchManual(query: string, options?: SearchUnitsOptions): ManualSearchResult[] {
	const { byId } = load();
	searchIndex ??= loadSearchIndex(searchIndexText);
	return searchUnits(searchIndex, byId, query, options);
}

/**
 * The manual as one deterministic Markdown document for the agent's system prompt. Byte-stable
 * between builds of the same units, so it can sit before a prompt-cache breakpoint.
 */
export function manualPromptBundle(): string {
	return bundleText;
}

/** Counts, and how much of TE's guide our units cover. */
export interface ManualCoverage {
	readonly units: number;
	readonly facts: number;
	readonly procedures: number;
	readonly parameters: number;
	/** Facts, procedures and parameters observed on a real unit. */
	readonly verifiedItems: number;
	readonly byArea: Readonly<Partial<Record<AreaId, number>>>;
	readonly byStatus: Readonly<Partial<Record<UnitStatus, number>>>;
	/** Share of TE's guide sections cited by at least one unit (as of the last build with the scrape). */
	readonly guide: {
		readonly version: string;
		readonly total: number;
		readonly covered: number;
		readonly percent: number;
		/** URLs of sections no unit covers yet: answer those from TE's page, not from memory. */
		readonly uncovered: readonly string[];
	};
}

let coverage: ManualCoverage | undefined;

/**
 * Counts of units, facts and procedures, and the guide coverage recorded by the last build.
 * @throws {ManualDataError} if a bundled artefact is corrupt
 */
export function manualCoverage(): ManualCoverage {
	if (coverage) return coverage;
	const { stats } = load().manual;
	const file = CoverageFileSchema.safeParse(parseJson(coverageText, 'coverage.json'));
	if (!file.success) throw new ManualDataError('knowledge/manual/build/coverage.json is invalid');
	coverage = {
		units: stats.units,
		facts: stats.facts,
		procedures: stats.procedures,
		parameters: stats.parameters,
		verifiedItems: stats.verified_items,
		byArea: stats.by_area,
		byStatus: stats.by_status,
		guide: {
			version: file.data.guide_version,
			total: file.data.total,
			covered: file.data.covered,
			percent: file.data.percent,
			uncovered: file.data.uncovered
		}
	};
	return coverage;
}
