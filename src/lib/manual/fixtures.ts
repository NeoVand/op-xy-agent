/**
 * Test helpers: synthetic unit files and a synthetic "official" corpus. No TE text is used — the
 * corpus sentences are invented. Imported by specs only.
 */
import type { OfficialFiles } from './official';
import { CHANGELOG_URL, GUIDE_URL } from './sources';
import type { UnitFile } from './validate';

export { CHANGELOG_URL, GUIDE_URL };

/** A minimal valid unit front-matter; override fields per test. */
export function baseUnit(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 'sequencer.test-unit',
		title: 'Test unit',
		area: 'sequencer',
		summary: 'A unit that exists for tests.',
		status: 'current',
		firmware: { min: '1.0.9', changed_in: [], guide_version: '1.1.15', verified_on: null },
		facts: [
			{
				id: 'one',
				text: 'A fact in our own words.',
				source: `${GUIDE_URL}/sequencer#step-sequencing`
			}
		],
		...overrides
	};
}

/**
 * A unit file whose front-matter is written as `key: <JSON>` lines (JSON is valid flow YAML).
 * Fields set to undefined are left out.
 */
export function unitFile(
	data: Record<string, unknown>,
	body = 'A short prose body.',
	path?: string
): UnitFile {
	const [area, slug] = String(data.id).split('.');
	const yaml = Object.entries(data)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
		.join('\n');
	return {
		path: path ?? `knowledge/manual/units/${area}/${slug}.md`,
		text: `---\n${yaml}\n---\n\n${body}\n`
	};
}

/** Research notes the synthetic units may cite. */
export const TEST_RESEARCH: Readonly<Record<string, string>> = {
	'docs/research/99-test.md': '# Test note\n\n## Session results\n\nObserved things.\n'
};

/** An invented sentence that stands in for TE's text in verbatim tests. */
export const PROTECTED_SENTENCE =
	'to frobnicate a widget hold the blue key and turn the round knob until the lamp glows';

/** A small scrape in the shape `scripts/ingest-guide.mjs` writes. */
export const TEST_OFFICIAL_FILES: OfficialFiles = {
	index: JSON.stringify({ guide_version: '1.1.15', chapters: [] }),
	chunks: [
		{ section: '7. sequencer', url: `${GUIDE_URL}/sequencer`, text: '', tokens_est: 8 },
		{
			section: '7.1 step sequencing',
			url: `${GUIDE_URL}/sequencer#step-sequencing`,
			text: PROTECTED_SENTENCE,
			tokens_est: 300
		},
		{
			section: '7.2 live recording',
			url: `${GUIDE_URL}/sequencer#live-recording`,
			text: 'x',
			tokens_est: 200
		},
		{
			section: '8. step components',
			url: `${GUIDE_URL}/step-components`,
			text: '',
			tokens_est: 12
		},
		{ section: '8.3 the list', url: `${GUIDE_URL}/step-components`, text: 'list', tokens_est: 100 },
		{
			section: '8.4 table',
			url: `${GUIDE_URL}/step-components#step%20component%20reference`,
			text: 'a b',
			tokens_est: 90
		},
		{ section: '25. credits', url: `${GUIDE_URL}/credits#credits`, text: 'names', tokens_est: 50 }
	]
		.map((chunk) => JSON.stringify(chunk))
		.join('\n'),
	changelog: JSON.stringify({
		versions: [
			{ version: '1.1.33', date: '2026-09-02' },
			{ version: '1.1.21', date: '2026-07-11' },
			{ version: '1.1.15', date: '2026-07-01' }
		]
	}),
	guide: {
		'07-sequencer.md': [
			'---',
			'title: "7. sequencer"',
			'chapter: 7',
			'slug: "sequencer"',
			'anchors:',
			'  - "step-sequencing"',
			'  - "rotate-trigs-functionality"',
			'  - "live-recording"',
			'---',
			'<a id="step-sequencing"></a>',
			'## 7.1 step sequencing',
			'',
			'![a drawing](../images/a_original.svg)',
			'',
			`${PROTECTED_SENTENCE}.`,
			'',
			'<a id="rotate-trigs-functionality"></a>',
			'### sequence shift',
			'',
			'things move around.',
			'',
			'<a id="live-recording"></a>',
			'## 7.2 live recording',
			'',
			'[a link text](https://example.com/page) and more words.'
		].join('\n'),
		'08-step-components.md': [
			'---',
			'chapter: 8',
			'slug: "step-components"',
			'anchors:',
			'  - "step-components-ref-table"',
			'  - "step component reference"',
			'---',
			'## 8.3 the list',
			'',
			'list',
			'',
			'<a id="step-components-ref-table"></a>',
			'<a id="step component reference"></a>',
			'## 8.4 table',
			'',
			'| a | b |',
			'| --- | --- |',
			'| 1 | 2 |'
		].join('\n'),
		'25-credits.md': [
			'---',
			'chapter: 25',
			'slug: "credits"',
			'anchors:',
			'  - "credits"',
			'---',
			'<a id="credits"></a>',
			'# credits',
			'',
			'names'
		].join('\n')
	},
	extras: {
		'changelog.md':
			'---\ntitle: "changelog"\n---\nfix: widgets could lose their colour when frobnicated twice in a row\n'
	}
};
