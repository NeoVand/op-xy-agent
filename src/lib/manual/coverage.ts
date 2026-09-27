/**
 * How much of TE's guide our units cover: a section counts as covered when at least one unit cites
 * it (any fact, procedure or parameter source). Drives the authoring fan-out; needs the local scrape.
 */
import { compareFirmware } from '$lib/core/opxy/firmware';
import type { OfficialCorpus, OfficialSection } from './official';
import { AREA_IDS, AREA_INFO, type AreaId, type CoverageFile, type ManualUnit } from './schema';
import { parseSource } from './sources';

/**
 * Guide places deliberately left out of the manual, keyed like {@link OfficialSection.key}.
 * The agent links users to TE's page for these.
 */
export const EXCLUDED_SECTIONS: Readonly<Record<string, string>> = {
	'#index': "the guide's table of contents",
	'#v.1.1.0': 'download box for the printable PDF',
	'#regulatory-statements': 'regulatory and legal boilerplate (link to TE)',
	'credits#credits': 'credits for testers and contributors',
	'how-to#how-to': 'a one-line chapter introduction',
	'fx#step-sequencing': 'a stray anchor TE reused on the reverb "size" card (cite fx#reverb)'
};

/** The area that owns a guide chapter (from {@link AREA_INFO}). */
export function areaOfChapter(chapter: number): AreaId | undefined {
	return AREA_IDS.find((area) => AREA_INFO[area].chapters.includes(chapter));
}

/** Coverage of the guide by the units. */
export interface CoverageResult {
	readonly guideVersion: string;
	readonly total: number;
	readonly covered: number;
	/** Rounded to one decimal. */
	readonly percent: number;
	readonly byArea: Readonly<Record<string, { total: number; covered: number }>>;
	/** Section key → ids of the units citing it. */
	readonly coveredBy: ReadonlyMap<string, readonly string[]>;
	readonly uncovered: readonly OfficialSection[];
	readonly excluded: readonly { section: OfficialSection; reason: string }[];
	/** Releases newer than the guide, and whether any unit cites their changelog entry. */
	readonly releasesAfterGuide: readonly { version: string; cited: boolean }[];
}

/** Computes coverage of `corpus` by `units`. */
export function computeCoverage(
	units: readonly ManualUnit[],
	corpus: OfficialCorpus
): CoverageResult {
	const citations = new Map<string, Set<string>>();
	const releases = new Set<string>();
	for (const unit of units) {
		const cite = (url: string) => {
			const parsed = parseSource(url);
			if (!parsed.ok) return;
			const { source } = parsed;
			if (source.kind === 'changelog' && source.version) releases.add(source.version);
			if (source.kind !== 'guide') return;
			const key = corpus.aliases.get(source.key) ?? source.key;
			const set = citations.get(key) ?? new Set<string>();
			set.add(unit.id);
			citations.set(key, set);
		};
		unit.facts.forEach((f) => cite(f.source));
		unit.procedures.forEach((p) => cite(p.source));
		unit.parameters.forEach((p) => cite(p.source));
	}

	const byArea: Record<string, { total: number; covered: number }> = {};
	const coveredBy = new Map<string, readonly string[]>();
	const uncovered: OfficialSection[] = [];
	const excluded: { section: OfficialSection; reason: string }[] = [];
	let covered = 0;
	let total = 0;
	for (const section of corpus.sections) {
		const reason = EXCLUDED_SECTIONS[section.key];
		if (reason !== undefined) {
			excluded.push({ section, reason });
			continue;
		}
		total++;
		const area = areaOfChapter(section.chapter) ?? 'other';
		const tally = (byArea[area] ??= { total: 0, covered: 0 });
		tally.total++;
		const cited = citations.get(section.key);
		if (cited && cited.size > 0) {
			covered++;
			tally.covered++;
			coveredBy.set(section.key, [...cited].sort());
		} else uncovered.push(section);
	}

	const releasesAfterGuide = corpus.releases
		.filter((r) => compareFirmware(r.version, corpus.guideVersion) > 0)
		.map((r) => ({ version: r.version, cited: releases.has(r.version) }))
		.sort((a, b) => compareFirmware(a.version, b.version));

	return {
		guideVersion: corpus.guideVersion,
		total,
		covered,
		percent: total === 0 ? 0 : Math.round((covered / total) * 1000) / 10,
		byArea,
		coveredBy,
		uncovered,
		excluded,
		releasesAfterGuide
	};
}

/** The committed coverage.json: counts and URLs only (no TE text). */
export function coverageFile(result: CoverageResult): CoverageFile {
	const byArea: Record<string, { total: number; covered: number }> = {};
	for (const area of [...AREA_IDS, 'other']) {
		const tally = result.byArea[area];
		if (tally) byArea[area] = { total: tally.total, covered: tally.covered };
	}
	return {
		guide_version: result.guideVersion,
		total: result.total,
		covered: result.covered,
		percent: result.percent,
		by_area: byArea,
		releases_after_guide: result.releasesAfterGuide.map((r) => ({
			version: r.version,
			cited: r.cited
		})),
		uncovered: result.uncovered.map((s) => s.url),
		excluded: result.excluded.map((e) => ({ url: e.section.url, reason: e.reason }))
	};
}

/**
 * A human-readable report. Short form: totals per area. Verbose: every uncovered section with its
 * TE title and size, grouped by area — the work list for authoring.
 */
export function formatCoverageReport(result: CoverageResult, verbose = false): string {
	const lines: string[] = [];
	lines.push(
		`coverage of guide v${result.guideVersion}: ${result.covered}/${result.total} sections (${result.percent}%)`
	);
	for (const area of [...AREA_IDS, 'other']) {
		const tally = result.byArea[area];
		if (!tally) continue;
		lines.push(
			`  ${area.padEnd(11)} ${String(tally.covered).padStart(3)}/${String(tally.total).padEnd(3)}`
		);
	}
	const releases = result.releasesAfterGuide
		.map((r) => `${r.version}${r.cited ? ' ✓' : ' ✗'}`)
		.join('  ');
	lines.push(`releases after the guide (cited ✓ / not ✗): ${releases || 'none'}`);
	if (verbose) {
		lines.push('', `uncovered (${result.uncovered.length}):`);
		for (const area of [...AREA_IDS, 'other']) {
			const inArea = result.uncovered.filter((s) => (areaOfChapter(s.chapter) ?? 'other') === area);
			if (inArea.length === 0) continue;
			const tokens = inArea.reduce((sum, s) => sum + s.tokens, 0);
			lines.push(`  ${area} — ${inArea.length} sections, ~${tokens} tokens of source`);
			for (const s of inArea) {
				const size = s.kind === 'card' ? 'card' : `~${s.tokens} tok`;
				lines.push(`    ${s.url}  (${s.title}; ${size})`);
			}
		}
		lines.push('', 'excluded:');
		for (const e of result.excluded) lines.push(`  ${e.section.url} — ${e.reason}`);
	}
	return lines.join('\n');
}
