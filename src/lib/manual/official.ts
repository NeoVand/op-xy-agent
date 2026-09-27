/**
 * Reads the local scrape of TE's documentation (`knowledge/official/`, git-ignored, produced by
 * `scripts/ingest-guide.mjs`) into what the build needs: the guide anchors a source may cite, the
 * sections coverage is measured against, the releases in the changelog, and the protected text for
 * the verbatim guard. Pure: the caller reads the files. The scrape is absent in CI, where these
 * checks are skipped. Only URLs and anchors from here ever reach a committed file.
 */
import { z } from 'zod';
import { GUIDE_CHAPTERS, GUIDE_URL } from './sources';
import type { CorpusDocument } from './verbatim';
import { parseFrontMatter } from './yaml';

/** The scrape files, as text. */
export interface OfficialFiles {
	/** `index.json`. */
	readonly index: string;
	/** `chunks.jsonl`. */
	readonly chunks: string;
	/** `changelog.json`. */
	readonly changelog: string;
	/** `guide/NN-slug.md` file name → text. */
	readonly guide: Readonly<Record<string, string>>;
	/** Other protected pages (`changelog.md`, `specs.md`, `fieldkit.md`, `sound-packs.md`) → text. */
	readonly extras: Readonly<Record<string, string>>;
}

/** A place in TE's guide that our units should cover. */
export interface OfficialSection {
	/** `<slug>#<anchor>` with the anchor decoded; `<slug>#` for content only the page URL reaches. */
	readonly key: string;
	/** URL as TE's site writes it. */
	readonly url: string;
	readonly chapter: number;
	readonly slug: string;
	/** TE's heading (for local reports; never committed). */
	readonly title: string;
	/** `section`: a heading-level part of a chapter; `card`: a feature anchor inside a section. */
	readonly kind: 'section' | 'card';
	/** Estimated size in tokens (0 for cards, which sit inside a section). */
	readonly tokens: number;
}

/** What the build knows about TE's documentation. */
export interface OfficialCorpus {
	readonly guideVersion: string;
	/** Every citable guide key: all anchors plus `<slug>#` for each page. */
	readonly anchors: ReadonlySet<string>;
	/** Anchors that mark the same place as another one (`alias key → canonical key`). */
	readonly aliases: ReadonlyMap<string, string>;
	readonly sections: readonly OfficialSection[];
	/** Changelog releases, newest first. */
	readonly releases: readonly { readonly version: string; readonly date: string }[];
	/** Protected text for the verbatim guard. */
	readonly documents: readonly CorpusDocument[];
}

const IndexSchema = z.looseObject({ guide_version: z.string() });

const ChunkSchema = z.looseObject({
	section: z.string(),
	url: z.string(),
	text: z.string(),
	tokens_est: z.number()
});

const ChangelogSchema = z.looseObject({
	versions: z.array(z.looseObject({ version: z.string(), date: z.string() }))
});

const GuideFrontMatterSchema = z.looseObject({
	slug: z.string(),
	chapter: z.int(),
	anchors: z.array(z.string()).optional()
});

/** Removes Markdown that is not TE's prose: images, anchor tags, link targets, table rules. */
export function cleanMarkdown(markdown: string): string {
	return markdown
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/<a id="[^"]*"><\/a>/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<br\s*\/?>/g, ' ')
		.replace(/^\|?[\s|:-]*-{3,}[\s|:-]*$/gm, ' ');
}

/** `<slug>#<decoded anchor>` of a guide URL. */
function keyOfUrl(url: string): { key: string; slug: string } {
	const hash = url.indexOf('#');
	const base = hash < 0 ? url : url.slice(0, hash);
	const anchor = hash < 0 ? '' : decodeURIComponent(url.slice(hash + 1));
	const slug = base === GUIDE_URL ? '' : base.slice(GUIDE_URL.length + 1);
	return { key: `${slug}#${anchor}`, slug };
}

interface AnchorGroup {
	/** Keys of anchors with nothing between them (they mark one place). */
	readonly keys: string[];
	readonly title: string;
	readonly slug: string;
	readonly chapter: number;
}

/** Walks one chapter body: groups adjacent anchors, names them by the next heading, splits text. */
function walkChapter(
	file: string,
	slug: string,
	chapter: number,
	body: string,
	groups: AnchorGroup[],
	documents: CorpusDocument[]
): void {
	let pending: string[] = [];
	let segmentId = `guide/${file}`;
	let segment: string[] = [];
	const flush = () => {
		const text = cleanMarkdown(segment.join('\n')).trim();
		if (text) documents.push({ id: segmentId, text });
		segment = [];
	};
	for (const line of body.split('\n')) {
		const anchor = /^<a id="([^"]*)"><\/a>$/.exec(line.trim());
		if (anchor) {
			if (pending.length === 0) {
				flush();
				segmentId = `guide/${file}#${anchor[1]}`;
			}
			pending.push(anchor[1]);
			continue;
		}
		if (pending.length > 0 && line.trim() !== '') {
			const heading = /^#{1,6}\s+(.*)$/.exec(line);
			groups.push({
				keys: pending.map((id) => `${slug}#${id}`),
				title: heading ? heading[1].trim() : pending[0],
				slug,
				chapter
			});
			pending = [];
		}
		segment.push(line);
	}
	flush();
}

/**
 * Parses the scrape.
 * @throws {Error} when a file does not have the shape `ingest-guide.mjs` writes
 */
export function loadOfficialCorpus(files: OfficialFiles): OfficialCorpus {
	const index = IndexSchema.parse(JSON.parse(files.index));
	const anchors = new Set<string>();
	const groups: AnchorGroup[] = [];
	const documents: CorpusDocument[] = [];

	for (const [file, text] of Object.entries(files.guide).sort(([a], [b]) => a.localeCompare(b))) {
		const { data, body } = parseFrontMatter(text);
		const fm = GuideFrontMatterSchema.parse(data);
		const slug = fm.slug === 'index' ? '' : fm.slug;
		if (GUIDE_CHAPTERS[slug] === undefined) {
			throw new Error(`${file}: unknown chapter slug "${fm.slug}"`);
		}
		anchors.add(`${slug}#`);
		for (const anchor of fm.anchors ?? []) anchors.add(`${slug}#${anchor}`);
		walkChapter(file, slug, fm.chapter, body, groups, documents);
	}

	// Sections: the URLs TE's site links to (one per chunk URL), merged across split chunks.
	const merged = new Map<string, OfficialSection & { largest: number; hasText: boolean }>();
	for (const line of files.chunks.split('\n')) {
		if (line.trim() === '') continue;
		const chunk = ChunkSchema.parse(JSON.parse(line));
		const { key, slug } = keyOfUrl(chunk.url);
		const chapter = GUIDE_CHAPTERS[slug];
		if (chapter === undefined) throw new Error(`chunks.jsonl: unknown chapter in ${chunk.url}`);
		anchors.add(key);
		const seen = merged.get(key);
		merged.set(key, {
			key,
			url: chunk.url,
			chapter,
			slug,
			kind: 'section',
			// The largest chunk names a merged section (not a bare chapter-title chunk).
			title: seen && seen.largest >= chunk.tokens_est ? seen.title : chunk.section,
			tokens: (seen?.tokens ?? 0) + chunk.tokens_est,
			largest: Math.max(seen?.largest ?? 0, chunk.tokens_est),
			hasText: (seen?.hasText ?? false) || chunk.text.trim() !== ''
		});
	}

	const aliases = new Map<string, string>();
	// Chunks with no text hold only a chapter title or a diagram: nothing to cover.
	const sections: OfficialSection[] = [...merged.values()]
		.filter((s) => s.hasText)
		.map((s) => ({
			key: s.key,
			url: s.url,
			chapter: s.chapter,
			slug: s.slug,
			title: s.title,
			kind: s.kind,
			tokens: s.tokens
		}));
	for (const group of groups) {
		const canonical = group.keys.find((k) => merged.has(k)) ?? group.keys[0];
		for (const k of group.keys) if (k !== canonical) aliases.set(k, canonical);
		if (merged.has(canonical)) continue;
		// A feature anchor inside a section (e.g. sequencer#rotate-trigs-functionality).
		const anchor = canonical.slice(canonical.indexOf('#') + 1);
		const base = group.slug === '' ? GUIDE_URL : `${GUIDE_URL}/${group.slug}`;
		sections.push({
			key: canonical,
			url: `${base}#${encodeURI(anchor)}`,
			chapter: group.chapter,
			slug: group.slug,
			title: group.title,
			kind: 'card',
			tokens: 0
		});
	}
	sections.sort((a, b) => a.chapter - b.chapter || a.url.localeCompare(b.url));

	const changelog = ChangelogSchema.parse(JSON.parse(files.changelog));
	for (const [file, text] of Object.entries(files.extras).sort(([a], [b]) => a.localeCompare(b))) {
		documents.push({ id: file, text: cleanMarkdown(text.replace(/^---\n[\s\S]*?\n---\n/, '')) });
	}

	return {
		guideVersion: index.guide_version,
		anchors,
		aliases,
		sections,
		releases: changelog.versions.map((v) => ({ version: v.version, date: v.date })),
		documents
	};
}
