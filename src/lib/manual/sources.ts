/**
 * Where a manual fact comes from. Every fact, procedure and parameter cites one source:
 *
 * | kind        | form                                                              |
 * | ----------- | ----------------------------------------------------------------- |
 * | `guide`     | `https://teenage.engineering/guides/op-xy/<chapter>#<anchor>`      |
 * | `changelog` | `https://teenage.engineering/downloads/op-xy#<version>`            |
 * | `te`        | any other teenage.engineering page (product page, field kit, …)   |
 * | `research`  | `docs/research/<note>.md#<heading-slug>` (e.g. the device probe log) |
 * | `web`       | any other https URL (community sources; needs a confidence)        |
 *
 * Guide anchors are TE's own box ids, written exactly as their site uses them (URL-encoded: some
 * contain spaces). They are checked against the local scrape when it is present (`official.ts`).
 */
import type { SourceKind } from './schema';

/** TE's online guide. The index page is the bare URL; chapters live below it. */
export const GUIDE_URL = 'https://teenage.engineering/guides/op-xy';

/** TE's downloads page, which carries the OS changelog (one anchor per release). */
export const CHANGELOG_URL = 'https://teenage.engineering/downloads/op-xy';

/** Guide chapter slugs and their numbers (the guide has no chapter 13; `''` is the index page). */
export const GUIDE_CHAPTERS: Readonly<Record<string, number>> = {
	'': 0,
	'hardware-overview': 1,
	layout: 2,
	'guide-conventions': 3,
	'get-started': 4,
	'main-modes': 5,
	'track-buttons': 6,
	sequencer: 7,
	'step-components': 8,
	players: 9,
	project: 10,
	tempo: 11,
	workflow: 12,
	instrument: 14,
	auxiliary: 15,
	arrange: 16,
	mix: 17,
	sample: 18,
	com: 19,
	'synth-engines': 20,
	fx: 21,
	'how-to': 22,
	'midi-references': 23,
	'te-boot': 24,
	credits: 25
};

/**
 * TE's downloads page anchors every release by its version, except 1.0.29, whose box id is
 * `1.0.28` (their typo; docs/research/40-official-docs.md §5.3). Keyed by release.
 */
export const CHANGELOG_ANCHOR_QUIRKS: Readonly<Record<string, string>> = { '1.0.29': '1.0.28' };

/** The URL of a release's changelog entry. */
export function changelogUrl(version: string): string {
	return `${CHANGELOG_URL}#${CHANGELOG_ANCHOR_QUIRKS[version] ?? version}`;
}

/** A classified source reference. */
export interface ParsedSource {
	readonly raw: string;
	readonly kind: SourceKind;
	/**
	 * Identity for matching: guide `<slug>#<anchor>` (anchor decoded, empty for the page itself,
	 * slug empty for the index page); changelog `changelog#<version>`; research `<path>#<slug>`;
	 * otherwise the URL without its fragment.
	 */
	readonly key: string;
	/** Decoded fragment, or null. */
	readonly anchor: string | null;
	/** Guide chapter number. */
	readonly chapter?: number;
	/** Guide chapter slug (`''` for the index page). */
	readonly slug?: string;
	/** The release a changelog anchor stands for. */
	readonly version?: string;
	/** Repo-relative path of a research note. */
	readonly path?: string;
}

/** Result of {@link parseSource}. */
export type SourceResult =
	| { readonly ok: true; readonly source: ParsedSource }
	| { readonly ok: false; readonly reason: string };

const VERSION = /^\d+\.\d+\.\d+$/;
const RESEARCH = /^docs\/research\/[A-Za-z0-9._-]+\.md$/;

function decodeAnchor(fragment: string): string | null {
	try {
		return decodeURIComponent(fragment);
	} catch {
		return null;
	}
}

/**
 * Classifies and checks the form of a source (not whether the anchor exists; that needs the scrape
 * or the research note, see `build.ts`).
 * @param versions known OS releases; changelog anchors must name one of them
 */
export function parseSource(raw: string, versions?: ReadonlySet<string>): SourceResult {
	const fail = (reason: string): SourceResult => ({ ok: false, reason });
	if (/\s/.test(raw)) {
		return fail('a source cannot contain spaces (TE anchors with spaces are written %20)');
	}
	const hash = raw.indexOf('#');
	const base = hash < 0 ? raw : raw.slice(0, hash);
	const fragment = hash < 0 ? null : raw.slice(hash + 1);
	const anchor = fragment === null ? null : decodeAnchor(fragment);
	if (fragment !== null && (fragment === '' || anchor === null)) {
		return fail('the #anchor is empty or not valid URL encoding');
	}

	if (RESEARCH.test(base)) {
		return {
			ok: true,
			source: { raw, kind: 'research', key: `${base}#${anchor ?? ''}`, anchor, path: base }
		};
	}
	if (base.startsWith('docs/') || base.startsWith('knowledge/')) {
		return fail('repo sources must be research notes: docs/research/<note>.md#<heading-slug>');
	}
	if (base.startsWith('http://')) return fail('use https:// URLs');
	if (!base.startsWith('https://')) {
		return fail('expected a TE guide or changelog URL, a docs/research/… note, or an https URL');
	}
	if (base.includes('?')) return fail('drop the ?query from source URLs');

	if (base === GUIDE_URL || base.startsWith(`${GUIDE_URL}/`)) {
		const slug = base === GUIDE_URL ? '' : base.slice(GUIDE_URL.length + 1);
		const chapter = GUIDE_CHAPTERS[slug];
		if (chapter === undefined) {
			return fail(
				`unknown guide chapter "${slug}" (expected one of: ${Object.keys(GUIDE_CHAPTERS).filter(Boolean).join(', ')})`
			);
		}
		return {
			ok: true,
			source: { raw, kind: 'guide', key: `${slug}#${anchor ?? ''}`, anchor, chapter, slug }
		};
	}

	if (base === CHANGELOG_URL && anchor !== null) {
		const quirk = Object.entries(CHANGELOG_ANCHOR_QUIRKS).find(([, box]) => box === anchor);
		const version = quirk ? quirk[0] : anchor;
		if (!quirk && CHANGELOG_ANCHOR_QUIRKS[anchor] !== undefined) {
			return fail(
				`TE's page anchors release ${anchor} as #${CHANGELOG_ANCHOR_QUIRKS[anchor]}: cite ${changelogUrl(anchor)}`
			);
		}
		if (!VERSION.test(version)) return fail('changelog anchors are release versions, e.g. #1.1.21');
		if (versions && !versions.has(version)) return fail(`unknown OS release "${version}"`);
		return {
			ok: true,
			source: { raw, kind: 'changelog', key: `changelog#${version}`, anchor, version }
		};
	}

	if (base.startsWith('https://teenage.engineering/')) {
		return { ok: true, source: { raw, kind: 'te', key: base, anchor } };
	}
	return { ok: true, source: { raw, kind: 'web', key: base, anchor } };
}

/**
 * A compact spelling for the prompt bundle: `guide:layout#modules`, `changelog:1.1.21`,
 * `research:90-device-probe#…`; other URLs lose their `https://`. {@link BUNDLE_SOURCE_LEGEND}
 * tells the agent how to expand them.
 */
export function shortSource(url: string): string {
	const parsed = parseSource(url);
	if (!parsed.ok) return url;
	const { source } = parsed;
	const hash = url.indexOf('#');
	const fragment = hash < 0 ? '' : url.slice(hash);
	switch (source.kind) {
		case 'guide':
			return `guide:${source.slug ?? ''}${fragment}`;
		case 'changelog':
			return `changelog:${source.version}`;
		case 'research':
			return `research:${(source.path ?? '').replace(/^docs\/research\//, '').replace(/\.md$/, '')}${fragment}`;
		default:
			return url.replace(/^https:\/\//, '');
	}
}

/** How to expand {@link shortSource} spellings (part of the prompt bundle's legend). */
export const BUNDLE_SOURCE_LEGEND = `Sources: guide:X = ${GUIDE_URL}/X (guide:#Y = ${GUIDE_URL}#Y); changelog:V = the OS V entry at ${CHANGELOG_URL}; research:N = docs/research/N.md in the op-xy-agent repository (our own notes, e.g. the device probe log).`;

/** True for sources published by teenage engineering. */
export function isOfficial(kind: SourceKind): boolean {
	return kind === 'guide' || kind === 'changelog' || kind === 'te';
}

/**
 * GitHub's anchor for a Markdown heading: lower case, punctuation dropped, spaces to hyphens
 * (`## 2026-09-26 — Session 1 results` → `2026-09-26--session-1-results`).
 */
export function githubSlug(heading: string): string {
	return heading
		.trim()
		.toLowerCase()
		.replace(/<[^>]+>/g, '')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
		.replace(/ /g, '-');
}

/** Every heading anchor GitHub renders for a Markdown document (duplicates get `-1`, `-2`, …). */
export function markdownHeadingSlugs(markdown: string): Set<string> {
	const slugs = new Set<string>();
	const counts = new Map<string, number>();
	let fenced = false;
	for (const line of markdown.split('\n')) {
		if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
		if (fenced) continue;
		const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
		if (!m) continue;
		const slug = githubSlug(m[1]);
		const seen = counts.get(slug) ?? 0;
		counts.set(slug, seen + 1);
		slugs.add(seen === 0 ? slug : `${slug}-${seen}`);
	}
	return slugs;
}
