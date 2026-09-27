/**
 * Lexical search over manual units (MiniSearch BM25, docs/research/40-official-docs.md §6). The same
 * options index at build time (`search-index.json`) and query at runtime, so they live here once.
 * Queries are expanded with a small synonym table (ratchet → multiply, p-lock → parameter lock, …).
 */
import MiniSearch, { type Options, type Query } from 'minisearch';
import type { AreaId, ManualUnit, UnitStatus } from './schema';

/** What gets indexed per unit. */
export interface SearchDocument {
	readonly id: string;
	readonly title: string;
	readonly aliases: string;
	readonly summary: string;
	readonly goals: string;
	readonly facts: string;
}

/** Indexed fields, most important first. */
export const SEARCH_FIELDS = ['title', 'aliases', 'summary', 'goals', 'facts'] as const;

const BOOST: Record<(typeof SEARCH_FIELDS)[number], number> = {
	title: 4,
	aliases: 3,
	summary: 1.5,
	goals: 1.3,
	facts: 1
};

const STOP_WORDS = new Set(
	(
		'a an and are as at be by can do does for from how i in is it its me my of on or so that the ' +
		'then this to what when where which with you your'
	).split(' ')
);

/** Splits on whitespace and punctuation, keeping hyphenated words together (`p-lock`). */
const SPLIT = /[\s,.;:!?()[\]{}"“”‘’`/\\|<>=*_~#+…→]+/u;

/** Tokenizer shared by indexing and querying. */
export function tokenize(text: string): string[] {
	return text.split(SPLIT).filter(Boolean);
}

function stem(term: string): string {
	return term.length > 3 && term.endsWith('s') && !term.endsWith('ss') ? term.slice(0, -1) : term;
}

/**
 * Normalises a token: lower case, accents and apostrophes dropped, a plural `s` stripped, stop words
 * removed. Hyphenated words index as the joined word and each part (`p-lock` → plock, p, lock).
 */
export function processTerm(term: string): string | string[] | null {
	const t = term
		.toLowerCase()
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/['’]/g, '')
		.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
	if (t === '' || STOP_WORDS.has(t)) return null;
	if (/[-–]/.test(t)) {
		const parts = t.split(/[-–]+/).filter((p) => p !== '' && !STOP_WORDS.has(p));
		return [stem(t.replace(/[-–]+/g, '')), ...parts.map(stem)];
	}
	return stem(t);
}

/** MiniSearch options: identical at build and load time (a mismatch corrupts results). */
export const SEARCH_OPTIONS: Options<SearchDocument> = {
	idField: 'id',
	fields: [...SEARCH_FIELDS],
	storeFields: [],
	tokenize,
	processTerm,
	searchOptions: {
		boost: BOOST,
		combineWith: 'OR',
		prefix: (term) => term.length >= 4,
		fuzzy: (term) => (term.length >= 5 ? 0.2 : false)
	}
};

/**
 * Query expansions: a word (or two-word phrase) users say → the words the manual uses. Keys are
 * lower case; the expansion is searched as an extra OR branch.
 */
export const SYNONYMS: Readonly<Record<string, string>> = {
	plock: 'parameter lock',
	'p-lock': 'parameter lock',
	'p-locks': 'parameter lock',
	automation: 'parameter lock record',
	ratchet: 'multiply',
	ratchets: 'multiply',
	ratcheting: 'multiply',
	roll: 'multiply',
	trig: 'trigger',
	trigs: 'trigger',
	arp: 'arpeggio',
	arpeggiator: 'arpeggio',
	mixer: 'mix',
	bpm: 'tempo',
	swing: 'groove',
	shuffle: 'groove',
	sync: 'clock',
	'send fx': 'fx I II',
	sends: 'fx send',
	reverb: 'reverb fx',
	external: 'midi engine',
	'midi engine': 'external midi',
	chords: 'maestro chord',
	transpose: 'brain transpose',
	backup: 'mtp back up',
	'back up': 'mtp backup',
	'factory reset': 'te boot reset',
	firmware: 'firmware update te boot',
	sound: 'preset',
	patch: 'preset',
	snapshot: 'preset save',
	battery: 'battery charge',
	knob: 'encoder',
	knobs: 'encoder'
};

/** The query MiniSearch runs for user text: the text itself OR its synonym expansions. */
export function expandQuery(text: string): Query {
	const words = text
		.toLowerCase()
		.split(/\s+/)
		.map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
		.filter(Boolean);
	const expansions = new Set<string>();
	for (let i = 0; i < words.length; i++) {
		const one = SYNONYMS[words[i]];
		if (one) expansions.add(one);
		if (i + 1 < words.length) {
			const two = SYNONYMS[`${words[i]} ${words[i + 1]}`];
			if (two) expansions.add(two);
		}
	}
	if (expansions.size === 0) return text;
	return { combineWith: 'OR', queries: [text, ...expansions] };
}

/** The indexed form of a unit. */
export function toSearchDocument(unit: ManualUnit): SearchDocument {
	return {
		id: unit.id,
		title: unit.title,
		aliases: unit.aliases.join(' · '),
		summary: unit.summary,
		goals: unit.procedures.map((p) => p.goal).join(' · '),
		facts: unit.facts.map((f) => f.text).join(' · ')
	};
}

/** Builds the index for a set of units (in the given order: keep it deterministic). */
export function buildSearchIndex(units: readonly ManualUnit[]): MiniSearch<SearchDocument> {
	const index = new MiniSearch<SearchDocument>(SEARCH_OPTIONS);
	index.addAll(units.map(toSearchDocument));
	return index;
}

/** Loads a serialised index (`search-index.json` text). */
export function loadSearchIndex(json: string): MiniSearch<SearchDocument> {
	return MiniSearch.loadJSON<SearchDocument>(json, SEARCH_OPTIONS);
}

/** A ranked search hit. */
export interface ManualSearchResult {
	/** Unit id, e.g. `sequencer.parameter-locks`. */
	readonly id: string;
	readonly title: string;
	readonly area: AreaId;
	readonly status: UnitStatus;
	/** BM25 score (higher is better; only comparable within one query). */
	readonly score: number;
	/** The best-matching fact (or the summary), shortened. */
	readonly snippet: string;
	/** Id of the fact the snippet comes from (cite it as `<id>#<fact>`), or null for the summary. */
	readonly fact: string | null;
	/** Where to send the user in TE's documentation, or null. */
	readonly source: string | null;
}

/** Options for {@link searchUnits}. */
export interface SearchUnitsOptions {
	/** Maximum results (default 8). */
	readonly limit?: number;
	/** Only units of this area. */
	readonly area?: AreaId;
}

const SNIPPET_LENGTH = 220;

function termsOf(text: string): Set<string> {
	const out = new Set<string>();
	for (const token of tokenize(text)) {
		const processed = processTerm(token);
		if (processed === null) continue;
		for (const t of Array.isArray(processed) ? processed : [processed]) out.add(t);
	}
	return out;
}

/** Shortens `text` around its first occurrence of any of `terms`. */
function shorten(text: string, terms: readonly string[]): string {
	if (text.length <= SNIPPET_LENGTH) return text;
	const lower = text.toLowerCase();
	const hit = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
	const first = hit.length > 0 ? Math.min(...hit) : 0;
	const start = Math.max(0, Math.min(first - 60, text.length - SNIPPET_LENGTH));
	const end = Math.min(text.length, start + SNIPPET_LENGTH);
	return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/**
 * Searches units and picks, per hit, the fact that best matches the query as a snippet.
 * @param units every unit by id (hits without a unit are ignored)
 */
export function searchUnits(
	index: MiniSearch<SearchDocument>,
	units: ReadonlyMap<string, ManualUnit>,
	query: string,
	options: SearchUnitsOptions = {}
): ManualSearchResult[] {
	const limit = options.limit ?? 8;
	if (query.trim() === '' || limit <= 0) return [];
	const results: ManualSearchResult[] = [];
	for (const hit of index.search(expandQuery(query))) {
		const unit = units.get(String(hit.id));
		if (!unit || (options.area && unit.area !== options.area)) continue;
		const matched = new Set(hit.terms);
		let best: { text: string; fact: string | null; score: number } = {
			text: unit.summary,
			fact: null,
			score: 0
		};
		for (const fact of unit.facts) {
			let score = 0;
			for (const t of termsOf(fact.text)) if (matched.has(t)) score++;
			if (score > best.score) best = { text: fact.text, fact: fact.id, score };
		}
		results.push({
			id: unit.id,
			title: unit.title,
			area: unit.area,
			status: unit.status,
			score: Math.round(hit.score * 1000) / 1000,
			snippet: shorten(best.text, hit.terms),
			fact: best.fact,
			source: unit.official_url
		});
		if (results.length >= limit) break;
	}
	return results;
}
