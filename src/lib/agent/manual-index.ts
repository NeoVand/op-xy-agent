/**
 * A manual as the agent consumes it: units of text with an id, a title and a source link, rendered
 * into one deterministic prompt bundle (cached in the system prompt) and indexed with MiniSearch for
 * `search_manual`. Used by our own manual and by the dev-only guide fallback alike.
 */
import MiniSearch from 'minisearch';
import type {
	ManualHit,
	ManualOrigin,
	ManualSource,
	ManualSourceKind,
	ManualUnit
} from './manual-source';

/** One unit of manual text. */
export interface ManualUnitRecord {
	/** Stable id: `sequencer.parameter-locks` (our manual) or `7.1` (guide section). */
	readonly id: string;
	readonly title: string;
	/** Plain text or light markdown, in the manual's own words. */
	readonly text: string;
	/** Where it comes from: a URL (official section) or our unit path. */
	readonly source: string;
	/** Chapter or area, for grouping in the bundle. */
	readonly area?: string;
	/** Other names people use for the topic ("p-lock"). */
	readonly aliases?: readonly string[];
}

/** Options for {@link createUnitSource}. */
export interface UnitSourceOptions {
	readonly kind: Exclude<ManualSourceKind, 'combined' | 'none'>;
	/** Shown in the UI: "our manual", "TE guide (dev only)". */
	readonly label: string;
	readonly units: readonly ManualUnitRecord[];
	/** Opening lines of the prompt bundle: what this manual is and how far to trust it. */
	readonly header: string;
}

/** Longest snippet a search hit carries (the full unit is one `read_manual_unit` away). */
const SNIPPET_CHARS = 1400;

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Renders units as the prompt bundle: stable order, stable bytes. */
export function renderBundle(header: string, units: readonly ManualUnitRecord[]): string {
	const body = units
		.map(
			(u) =>
				`<unit id="${escapeAttribute(u.id)}" title="${escapeAttribute(u.title)}" source="${escapeAttribute(u.source)}">\n${u.text.trim()}\n</unit>`
		)
		.join('\n\n');
	return `${header.trim()}\n\n${body}`;
}

/** A passage of `text` around the first query term found, at most `max` characters. */
export function snippet(text: string, terms: readonly string[], max = SNIPPET_CHARS): string {
	const clean = text.trim();
	if (clean.length <= max) return clean;
	const lower = clean.toLowerCase();
	let at = -1;
	for (const term of terms) {
		const index = lower.indexOf(term.toLowerCase());
		if (index >= 0 && (at < 0 || index < at)) at = index;
	}
	const start = Math.max(0, Math.min(at < 0 ? 0 : at - Math.floor(max / 4), clean.length - max));
	const piece = clean.slice(start, start + max);
	return `${start > 0 ? '…' : ''}${piece.trim()}${start + max < clean.length ? '…' : ''}`;
}

/** Builds a {@link ManualSource} over a list of units. */
export function createUnitSource(options: UnitSourceOptions): ManualSource {
	const units = [...options.units];
	const byId = new Map(units.map((u) => [u.id.toLowerCase(), u]));
	let bundle: string | null = null;
	let index: MiniSearch<ManualUnitRecord> | null = null;

	const getIndex = () => {
		if (index) return index;
		index = new MiniSearch<ManualUnitRecord>({
			fields: ['title', 'text', 'aliasText'],
			storeFields: [],
			extractField: (doc, field) =>
				field === 'aliasText'
					? (doc.aliases ?? []).join(' ')
					: String((doc as unknown as Record<string, unknown>)[field] ?? ''),
			searchOptions: {
				boost: { title: 3, aliasText: 2 },
				prefix: true,
				fuzzy: 0.15,
				combineWith: 'OR'
			}
		});
		index.addAll(units);
		return index;
	};

	const origin: ManualOrigin = options.kind;
	const toUnit = (u: ManualUnitRecord): ManualUnit => ({
		id: u.id,
		title: u.title,
		source: u.source,
		text: u.text.trim(),
		origin
	});

	return {
		kind: options.kind,
		label: options.label,
		unitCount: units.length,
		async promptBundle() {
			bundle ??= renderBundle(options.header, units);
			return bundle;
		},
		async search(query, limit = 5) {
			const q = query.trim();
			if (!q) return [];
			const results = getIndex().search(q);
			return results.slice(0, Math.max(1, Math.min(limit, 10))).map((r): ManualHit => {
				const unit = byId.get(String(r.id).toLowerCase());
				const text = unit?.text ?? '';
				return {
					id: String(r.id),
					title: unit?.title ?? String(r.id),
					source: unit?.source ?? '',
					snippet: snippet(text, r.terms),
					score: r.score,
					origin
				};
			});
		},
		async unit(id) {
			const key = id.trim().toLowerCase();
			const exact = byId.get(key);
			if (exact) return toUnit(exact);
			const byTitle = units.find((u) => u.title.toLowerCase() === key);
			return byTitle ? toUnit(byTitle) : null;
		},
		async catalog() {
			return units.map((u) => ({ id: u.id, title: u.title, source: u.source, origin }));
		}
	};
}
