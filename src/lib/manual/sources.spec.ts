import { describe, expect, it } from 'vitest';
import {
	CHANGELOG_URL,
	GUIDE_CHAPTERS,
	GUIDE_URL,
	changelogUrl,
	githubSlug,
	isOfficial,
	markdownHeadingSlugs,
	parseSource,
	shortSource,
	type ParsedSource
} from './sources';

const VERSIONS = new Set(['1.0.9', '1.0.29', '1.1.15', '1.1.21', '1.1.33']);

function ok(raw: string): ParsedSource {
	const result = parseSource(raw, VERSIONS);
	if (!result.ok) throw new Error(`${raw}: ${result.reason}`);
	return result.source;
}

function reason(raw: string): string {
	const result = parseSource(raw, VERSIONS);
	if (result.ok) throw new Error(`expected ${raw} to be rejected`);
	return result.reason;
}

describe('parseSource', () => {
	it('classifies guide chapters, the index page and encoded anchors', () => {
		expect(ok(`${GUIDE_URL}/sequencer#step-sequencing`)).toMatchObject({
			kind: 'guide',
			key: 'sequencer#step-sequencing',
			chapter: 7,
			slug: 'sequencer',
			anchor: 'step-sequencing'
		});
		expect(ok(`${GUIDE_URL}#whats-in-the-box`)).toMatchObject({
			key: '#whats-in-the-box',
			chapter: 0
		});
		expect(ok(`${GUIDE_URL}/step-components`)).toMatchObject({
			key: 'step-components#',
			anchor: null
		});
		expect(ok(`${GUIDE_URL}/step-components#step%20component%20reference`).key).toBe(
			'step-components#step component reference'
		);
	});

	it('maps changelog anchors to releases, including TE’s 1.0.29 typo', () => {
		expect(ok(`${CHANGELOG_URL}#1.1.21`)).toMatchObject({ kind: 'changelog', version: '1.1.21' });
		expect(ok(`${CHANGELOG_URL}#1.0.28`)).toMatchObject({
			version: '1.0.29',
			key: 'changelog#1.0.29'
		});
		expect(reason(`${CHANGELOG_URL}#1.0.29`)).toMatch(/#1\.0\.28/);
		expect(reason(`${CHANGELOG_URL}#1.2.0`)).toMatch(/unknown OS release/);
		expect(reason(`${CHANGELOG_URL}#latest`)).toMatch(/release versions/);
		expect(changelogUrl('1.0.29')).toBe(`${CHANGELOG_URL}#1.0.28`);
		expect(changelogUrl('1.1.33')).toBe(`${CHANGELOG_URL}#1.1.33`);
	});

	it('classifies other TE pages, research notes and community URLs', () => {
		expect(ok('https://teenage.engineering/products/op-xy').kind).toBe('te');
		expect(ok(CHANGELOG_URL).kind).toBe('te');
		expect(ok('docs/research/90-device-probe.md#session')).toMatchObject({
			kind: 'research',
			path: 'docs/research/90-device-probe.md',
			anchor: 'session'
		});
		expect(ok('docs/research/20-midi-control.md').anchor).toBeNull();
		expect(ok('https://github.com/someone/opxy-notes').kind).toBe('web');
	});

	it('rejects malformed sources with a helpful reason', () => {
		expect(reason(`${GUIDE_URL}/step-components#step component reference`)).toMatch(/%20/);
		expect(reason('http://teenage.engineering/guides/op-xy')).toMatch(/https/);
		expect(reason(`${GUIDE_URL}/sequencer?x=1`)).toMatch(/query/);
		expect(reason(`${GUIDE_URL}/sequenser#x`)).toMatch(/unknown guide chapter "sequenser"/);
		expect(reason(`${GUIDE_URL}/layout#`)).toMatch(/anchor is empty/);
		expect(reason('knowledge/midi/cc-map.json')).toMatch(/research notes/);
		expect(reason('the guide')).toMatch(/spaces/);
		expect(reason('guide:layout')).toMatch(/expected a TE guide/);
	});

	it('knows which kinds are official', () => {
		expect(['guide', 'changelog', 'te'].every((k) => isOfficial(k as ParsedSource['kind']))).toBe(
			true
		);
		expect(isOfficial('research') || isOfficial('web')).toBe(false);
	});

	it('lists the 24 chapters plus the index page (no chapter 13)', () => {
		expect(Object.keys(GUIDE_CHAPTERS)).toHaveLength(25);
		expect(Object.values(GUIDE_CHAPTERS)).not.toContain(13);
	});
});

describe('shortSource', () => {
	it('abbreviates guide, changelog and research sources for the prompt bundle', () => {
		expect(shortSource(`${GUIDE_URL}/layout#modules`)).toBe('guide:layout#modules');
		expect(shortSource(`${GUIDE_URL}#whats-in-the-box`)).toBe('guide:#whats-in-the-box');
		expect(shortSource(`${CHANGELOG_URL}#1.0.28`)).toBe('changelog:1.0.29');
		expect(shortSource('docs/research/90-device-probe.md#x')).toBe('note 90');
		expect(shortSource('https://github.com/a/b')).toBe('github.com/a/b');
		expect(shortSource('not a source')).toBe('not a source');
	});
});

describe('GitHub heading slugs', () => {
	it('matches GitHub’s anchors for our research headings', () => {
		expect(
			githubSlug('2026-09-26 — Session 1 results (owner present, scratch project, OS 1.1.33)')
		).toBe('2026-09-26--session-1-results-owner-present-scratch-project-os-1133');
		expect(githubSlug('3.4 Engine-resolved names for CC12–15 (P1–P4)')).toBe(
			'34-engine-resolved-names-for-cc1215-p1p4'
		);
		expect(githubSlug('Uses `code` and [a link](https://x.y)')).toBe('uses-code-and-a-link');
	});

	it('numbers duplicate headings and skips fenced code', () => {
		const slugs = markdownHeadingSlugs(
			['# Intro', '## Notes', '```', '# not a heading', '```', '## Notes', '### Notes ###'].join(
				'\n'
			)
		);
		expect([...slugs]).toEqual(['intro', 'notes', 'notes-1', 'notes-2']);
	});
});
