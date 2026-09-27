/**
 * DEVELOPMENT ONLY. Never imported by production code paths: `manual-source.ts` loads this module
 * from inside an `import.meta.env.DEV` branch, which production builds drop.
 *
 * Turns the local verbatim scrape of Teenage Engineering's OP-XY guide
 * (`knowledge/official/guide/*.md`, git-ignored, produced by `scripts/ingest-guide.mjs`) into manual
 * units so the agent's Q&A can be developed and tested before our own reworded manual exists.
 * TE's text is source material only and must never ship (docs/DECISIONS.md D2). On a clean
 * checkout (CI) the glob finds nothing and the agent runs without a manual.
 */
import { createUnitSource, type ManualUnitRecord } from './manual-index';
import type { DevGuideRole, ManualSource } from './manual-source';

/** Chapters that are front matter rather than manual (table of contents, regulatory, credits). */
const SKIPPED_FILES = new Set(['00-index.md', '25-credits.md']);

const HEADERS: Record<DevGuideRole, string> = {
	supplement: `# Development supplement (not part of the app's manual)
The app's own manual above is still being written. Until it covers everything, development builds add a local copy of Teenage Engineering's official OP-XY guide (guide version 1.1.15) below. Prefer the app's manual; use the guide only for topics the manual does not cover yet. Where the two differ, the app's manual (written for OS 1.1.33) wins, and the device facts above win over both. Each unit below is one guide section; cite it as a markdown link to its source URL.`,
	'stand-in': `# OP-XY guide: development stand-in
This is a local development copy of Teenage Engineering's official OP-XY guide (guide version 1.1.15), used only on developer machines until the app's own manual ships. The guide predates OS 1.1.33: where it disagrees with the device facts above, the device facts win. Each unit is one guide section; cite units by their source URL.`
};

function frontMatterValue(frontMatter: string, key: string): string | null {
	const match = new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, 'm').exec(frontMatter);
	return match ? match[1] : null;
}

/** Plain text of a markdown line: images dropped, links reduced to their text, HTML removed. */
function cleanLine(line: string): string {
	return line
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, '')
		.replace(/[ \t]+$/g, '');
}

/**
 * Splits one guide chapter into units: the chapter introduction (before its first `##`) and one
 * unit per `##` section, with the section's anchor URL as the source.
 */
export function splitGuideChapter(fileName: string, markdown: string): ManualUnitRecord[] {
	const fm = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
	const frontMatter = fm ? fm[1] : '';
	const body = fm ? markdown.slice(fm[0].length) : markdown;
	const chapter = frontMatterValue(frontMatter, 'chapter') ?? fileName.replace(/\D.*$/, '');
	const baseUrl =
		frontMatterValue(frontMatter, 'source_url') ?? 'https://teenage.engineering/guides/op-xy';
	const chapterTitle = frontMatterValue(frontMatter, 'title') ?? fileName;

	const units: ManualUnitRecord[] = [];
	let current: { id: string; title: string; source: string; lines: string[] } = {
		id: `${chapter}.0`,
		title: chapterTitle,
		source: baseUrl,
		lines: []
	};
	let anchor: string | null = null;
	let sectionCount = 0;

	const flush = () => {
		const text = current.lines
			.join('\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim();
		if (text) {
			units.push({
				id: current.id,
				title: current.title,
				text,
				source: current.source,
				area: chapterTitle
			});
		}
	};

	for (const raw of body.split('\n')) {
		const anchorMatch = /^<a id="([^"]+)"><\/a>\s*$/.exec(raw.trim());
		if (anchorMatch) {
			anchor = anchorMatch[1];
			continue;
		}
		if (/^#\s/.test(raw)) continue; // the chapter title, already known
		const heading = /^##\s+(.+?)\s*$/.exec(raw);
		if (heading) {
			flush();
			sectionCount++;
			const title = cleanLine(heading[1]).trim();
			const numbered = /^(\d+(?:\.\d+)+)\.?\s+/.exec(title);
			current = {
				id: numbered ? numbered[1] : `${chapter}.${sectionCount}`,
				title,
				source: anchor ? `${baseUrl}#${encodeURIComponent(anchor)}` : baseUrl,
				lines: []
			};
			anchor = null;
			continue;
		}
		const line = cleanLine(raw);
		if (line.trim() === '' && current.lines.at(-1)?.trim() === '') continue;
		current.lines.push(line);
	}
	flush();
	return units;
}

/** The files the glob finds: path → lazy loader of the raw markdown. */
export type GuideFiles = Record<string, () => Promise<unknown>>;

/** Every guide chapter on disk (empty on a clean checkout). */
function guideFiles(): GuideFiles {
	return import.meta.glob('/knowledge/official/guide/*.md', { query: '?raw', import: 'default' });
}

/**
 * Loads the local guide as a manual source, or null when the scrape is not on this machine.
 * @param role `supplement` when it sits behind our manual (its bundle header says so), `stand-in`
 *   when it is the only manual
 */
export async function loadDevGuideSource(
	files: GuideFiles = guideFiles(),
	role: DevGuideRole = 'stand-in'
): Promise<ManualSource | null> {
	const entries = Object.entries(files)
		.filter(([path]) => !SKIPPED_FILES.has(path.slice(path.lastIndexOf('/') + 1)))
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	if (entries.length === 0) return null;
	const chapters = await Promise.all(
		entries.map(async ([path, load]) => {
			const text = await load();
			return splitGuideChapter(path.slice(path.lastIndexOf('/') + 1), String(text));
		})
	);
	const units = chapters.flat();
	if (units.length === 0) return null;
	return createUnitSource({
		kind: 'dev-guide',
		label: 'TE guide (dev only)',
		units,
		header: HEADERS[role]
	});
}
