/**
 * Where the agent's manual comes from, behind one small interface.
 *
 * 1. **Our manual** (`$lib/manual`, decision D2: reworded, agent-friendly, written for OS 1.1.33,
 *    committed and shipped) is the primary source in every build. Production uses only ours.
 * 2. **Dev-only supplement**: while our manual is still being written, development builds add the
 *    local verbatim scrape of TE's guide (`knowledge/official/guide/*.md`, git-ignored) behind it:
 *    appended to the prompt bundle as a clearly labelled supplement, and searched only when our
 *    manual has too few hits. It is loaded only inside an `import.meta.env.DEV` guard, which Vite
 *    replaces with `false` in production builds, so the module and the guide text are tree-shaken
 *    out (`pnpm build` + a grep for guide sentences verifies it; CI builds from a clean checkout
 *    without the scrape as a second net). TE's text must never ship (D2).
 * 3. Otherwise **no manual**: the agent says so and answers from the device facts only.
 */
import { createUnitSource, renderManualMap, type ManualUnitRecord } from './manual-index';

/** Which manual is active. */
export type ManualSourceKind = 'manual' | 'dev-guide' | 'combined' | 'none';

/** Where one unit or hit comes from. */
export type ManualOrigin = 'manual' | 'dev-guide';

/** A search hit: enough to cite, plus a snippet. */
export interface ManualHit {
	readonly id: string;
	readonly title: string;
	/** URL or unit path to cite. */
	readonly source: string;
	readonly snippet: string;
	readonly score: number;
	readonly origin: ManualOrigin;
}

/** A whole unit. */
export interface ManualUnit {
	readonly id: string;
	readonly title: string;
	readonly source: string;
	readonly text: string;
	readonly origin: ManualOrigin;
}

/** A unit in the catalogue: resolves citations and tells which source an answer drew on. */
export interface ManualEntry {
	readonly id: string;
	readonly title: string;
	/** URL to send the user to (TE's page for the topic), or the unit id when there is none. */
	readonly source: string;
	readonly origin: ManualOrigin;
}

/** The manual as the agent sees it. */
export interface ManualSource {
	readonly kind: ManualSourceKind;
	/** Short lowercase label for the UI. */
	readonly label: string;
	readonly unitCount: number;
	/** The whole manual as one deterministic string, for the cached system prompt. */
	promptBundle(): Promise<string>;
	/** Best-matching units for a query (BM25-style). */
	search(query: string, limit?: number): Promise<ManualHit[]>;
	/** A unit by id (or exact title); null when there is none. */
	unit(id: string): Promise<ManualUnit | null>;
	/** Every unit's id, title and origin. */
	catalog(): Promise<readonly ManualEntry[]>;
	/**
	 * The manual's map for the system prompt when units are retrieved per turn instead of sent
	 * whole (docs/AGENT-V2.md): every unit's id and title, grouped by area. Deterministic.
	 */
	map(): Promise<string>;
}

/** What a manual in record form looks like (a list of units; the adapter indexes them). */
export interface OurManual {
	readonly units: readonly ManualUnitRecord[];
	/** Optional header for the prompt bundle (version, coverage, firmware). */
	readonly header?: string;
}

/** The fields of a unit of our manual that the adapter needs. */
export interface ManualApiUnit {
	readonly id: string;
	readonly title: string;
	/** The TE page the unit derives from: where citations point. */
	readonly official_url?: string | null;
	/** The unit's sources (guide sections, changelog entries); the first one stands in for a missing official URL. */
	readonly sources?: readonly { readonly url: string }[];
}

/**
 * The part of `$lib/manual`'s public API the agent uses: the byte-stable prompt bundle, BM25 search
 * with TE source URLs, units by id and the whole manual.
 */
export interface ManualApi<U extends ManualApiUnit = ManualApiUnit> {
	manualPromptBundle(): string;
	searchManual(
		query: string,
		options?: { readonly limit?: number }
	): readonly {
		readonly id: string;
		readonly title: string;
		readonly snippet: string;
		readonly source: string | null;
		readonly score: number;
	}[];
	getUnit(id: string): U | undefined;
	loadManual(): { readonly units: readonly U[] };
}

/** Loads our manual as a source. */
export type OurManualLoader = () => Promise<ManualSource | null>;

/**
 * Our manual, loaded lazily in its own chunk (it grows to a few hundred KB with ~170 units). A
 * corrupt build artefact rejects, and the caller falls back.
 */
const OUR_MANUAL: OurManualLoader = async () => {
	const [api, { renderUnit }] = await Promise.all([
		import('$lib/manual'),
		import('$lib/manual/prompt')
	]);
	return adaptManualApi(api, renderUnit);
};

/** Our manual (`$lib/manual`) as a {@link ManualSource}. */
export function adaptManualApi<U extends ManualApiUnit>(
	api: ManualApi<U>,
	renderUnit: (unit: U) => string,
	label = 'our manual'
): ManualSource {
	const units = api.loadManual().units;
	const cite = (unit: U | undefined) => unit?.official_url ?? unit?.sources?.[0]?.url ?? unit?.id;
	return {
		kind: 'manual',
		label,
		unitCount: units.length,
		async promptBundle() {
			return api.manualPromptBundle();
		},
		async search(query, limit = 5) {
			return api.searchManual(query, { limit }).map((hit) => ({
				id: hit.id,
				title: hit.title,
				source: hit.source ?? cite(api.getUnit(hit.id)) ?? hit.id,
				snippet: hit.snippet,
				score: hit.score,
				origin: 'manual' as const
			}));
		},
		async unit(id) {
			const unit = api.getUnit(id.trim());
			if (!unit) return null;
			return {
				id: unit.id,
				title: unit.title,
				source: cite(unit) ?? unit.id,
				text: renderUnit(unit),
				origin: 'manual'
			};
		},
		async catalog() {
			return units.map((u) => ({
				id: u.id,
				title: u.title,
				source: cite(u) ?? u.id,
				origin: 'manual' as const
			}));
		},
		async map() {
			return renderManualMap(units);
		}
	};
}

const RECORD_HEADER =
	'# The OP-XY manual (OP-XY Agent edition)\nOur own reworded manual, written for OS 1.1.33. Cite units by their source.';

/** Used when no manual is available: honest, tiny, and still cacheable with the rest. */
export const NO_MANUAL: ManualSource = {
	kind: 'none',
	label: 'no manual yet',
	unitCount: 0,
	async promptBundle() {
		return '# Manual\nNo manual is bundled in this build yet. Answer from the device facts above, say clearly when you are not sure, and point the user to the official guide at https://teenage.engineering/guides/op-xy for details.';
	},
	async search() {
		return [];
	},
	async unit() {
		return null;
	},
	async catalog() {
		return [];
	},
	async map() {
		return '# Manual\nNo manual is bundled in this build yet. Answer from the device facts above, say clearly when you are not sure, and point the user to the official guide at https://teenage.engineering/guides/op-xy for details.';
	}
};

/** Builds a source from a list of manual units (a manual in record form, or tests). */
export function ourManualSource(manual: OurManual): ManualSource {
	return createUnitSource({
		kind: 'manual',
		label: 'our manual',
		units: manual.units,
		header: manual.header ?? RECORD_HEADER
	});
}

/**
 * Our manual first, a supplement behind it: the supplement's bundle (whose own header ranks it
 * below the manual) is appended, its hits fill up searches where the manual has too few, and its
 * units answer ids the manual does not know.
 */
export function combineSources(primary: ManualSource, supplement: ManualSource): ManualSource {
	return {
		kind: 'combined',
		label: `${primary.label} + ${supplement.label}`,
		unitCount: primary.unitCount + supplement.unitCount,
		async promptBundle() {
			const [main, extra] = await Promise.all([primary.promptBundle(), supplement.promptBundle()]);
			return `${main.trim()}\n\n${extra.trim()}`;
		},
		async search(query, limit = 5) {
			const hits = await primary.search(query, limit);
			if (hits.length >= limit) return hits;
			return [...hits, ...(await supplement.search(query, limit - hits.length))];
		},
		async unit(id) {
			return (await primary.unit(id)) ?? (await supplement.unit(id));
		},
		async catalog() {
			return [...(await primary.catalog()), ...(await supplement.catalog())];
		},
		async map() {
			const [main, extra] = await Promise.all([primary.map(), supplement.map()]);
			return `${main.trim()}\n\n${extra.trim()}`;
		}
	};
}

/**
 * The dev-only guide supplement. The branch is dead code in production builds
 * (`import.meta.env.DEV` is the literal `false` there), so the dynamic import and the guide files
 * it globs never reach the bundle. Keep the import inside this `if`.
 */
async function loadDevGuide(role: DevGuideRole): Promise<ManualSource | null> {
	if (import.meta.env.DEV) {
		const { loadDevGuideSource } = await import('./manual-source.dev');
		return loadDevGuideSource(undefined, role);
	}
	return null;
}

/** How the dev guide is used: behind our manual (a supplement), or alone when ours is missing. */
export type DevGuideRole = 'supplement' | 'stand-in';

/** Options for {@link loadManualSource} (injectable for tests and evals). */
export interface LoadManualOptions {
	/** Our manual's loader (null: none); defaults to `$lib/manual`. */
	readonly ours?: OurManualLoader | null;
	/** Whether this is a development build; defaults to `import.meta.env.DEV`. */
	readonly dev?: boolean;
	/** Add the local guide in development (default true until our manual covers the guide). */
	readonly devGuide?: boolean;
	/** The dev guide's loader; defaults to the local guide scrape. */
	readonly loadDev?: (role: DevGuideRole) => Promise<ManualSource | null>;
}

/**
 * Picks the manual: ours (every build), with the local guide behind it in development, else
 * whichever of the two exists, else none.
 */
export async function loadManualSource(options: LoadManualOptions = {}): Promise<ManualSource> {
	const ours = options.ours === undefined ? OUR_MANUAL : options.ours;
	const loaded = ours ? await ours().catch(() => null) : null;
	const primary = loaded && loaded.unitCount > 0 ? loaded : null;
	const dev = options.dev ?? import.meta.env.DEV;
	// The guide is a best-effort supplement: when it cannot load (the dev server refuses files
	// outside its allow list, a chapter fails to parse), the agent still starts with our manual.
	const guide =
		dev && options.devGuide !== false
			? await (options.loadDev ?? loadDevGuide)(primary ? 'supplement' : 'stand-in').catch(
					() => null
				)
			: null;
	if (primary && guide) return combineSources(primary, guide);
	return primary ?? guide ?? NO_MANUAL;
}
