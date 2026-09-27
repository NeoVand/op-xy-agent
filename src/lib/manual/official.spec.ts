import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { areaOfChapter, EXCLUDED_SECTIONS } from './coverage';
import { GUIDE_URL, PROTECTED_SENTENCE, TEST_OFFICIAL_FILES } from './fixtures';
import { cleanMarkdown, loadOfficialCorpus } from './official';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('loadOfficialCorpus (synthetic scrape)', () => {
	const corpus = loadOfficialCorpus(TEST_OFFICIAL_FILES);

	it('collects every citable anchor, including bare pages and anchors without headings', () => {
		for (const key of [
			'sequencer#',
			'sequencer#step-sequencing',
			'sequencer#rotate-trigs-functionality',
			'step-components#',
			'step-components#step component reference',
			'step-components#step-components-ref-table',
			'credits#credits'
		]) {
			expect(corpus.anchors.has(key), key).toBe(true);
		}
		expect(corpus.anchors.has('sequencer#nope')).toBe(false);
	});

	it('treats adjacent anchors as aliases of the section the chunks use', () => {
		expect([...corpus.aliases]).toEqual([
			['step-components#step-components-ref-table', 'step-components#step component reference']
		]);
	});

	it('derives sections from chunks, merging split chunks and dropping title-only ones', () => {
		expect(corpus.sections.map((s) => [s.key, s.kind, s.tokens, s.title])).toEqual([
			['sequencer#live-recording', 'section', 200, '7.2 live recording'],
			['sequencer#rotate-trigs-functionality', 'card', 0, 'sequence shift'],
			['sequencer#step-sequencing', 'section', 300, '7.1 step sequencing'],
			['step-components#', 'section', 112, '8.3 the list'],
			['step-components#step component reference', 'section', 90, '8.4 table'],
			['credits#credits', 'section', 50, '25. credits']
		]);
		expect(corpus.sections[1].url).toBe(`${GUIDE_URL}/sequencer#rotate-trigs-functionality`);
		expect(corpus.guideVersion).toBe('1.1.15');
		expect(corpus.releases.map((r) => r.version)).toEqual(['1.1.33', '1.1.21', '1.1.15']);
	});

	it('keeps protected text per anchor, without images, link targets or table rules', () => {
		const byId = new Map(corpus.documents.map((d) => [d.id, d.text]));
		expect(byId.get('guide/07-sequencer.md#step-sequencing')).toContain(PROTECTED_SENTENCE);
		expect(byId.get('guide/07-sequencer.md#step-sequencing')).not.toContain('images');
		expect(byId.get('guide/07-sequencer.md#live-recording')).toContain('a link text');
		expect(byId.get('guide/07-sequencer.md#live-recording')).not.toContain('example.com');
		expect(byId.get('changelog.md')).toContain('frobnicated twice');
		expect(byId.get('changelog.md')).not.toContain('title:');
	});

	it('rejects a chapter it does not know', () => {
		const files = {
			...TEST_OFFICIAL_FILES,
			guide: { 'xx.md': '---\nchapter: 99\nslug: "nope"\n---\n' }
		};
		expect(() => loadOfficialCorpus(files)).toThrow(/unknown chapter slug "nope"/);
	});
});

describe('cleanMarkdown', () => {
	it('drops images, anchor tags, link targets, <br> and table separator rows', () => {
		expect(
			cleanMarkdown(
				'![x](a.svg)\n<a id="y"></a>\n[text](http://u)<br>more\n| --- | :-: |\n| a | b |'
			)
				.split(/\s+/)
				.filter(Boolean)
		).toEqual(['text', 'more', '|', 'a', '|', 'b', '|']);
	});
});

describe('coverage policy', () => {
	it('maps every guide chapter with content to exactly one area', () => {
		for (const chapter of [
			0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24
		]) {
			expect(areaOfChapter(chapter), `chapter ${chapter}`).toBeDefined();
		}
		expect(areaOfChapter(25)).toBeUndefined();
		expect(Object.keys(EXCLUDED_SECTIONS)).toContain('credits#credits');
	});
});

const OFFICIAL = `${ROOT}knowledge/official`;
describe.runIf(existsSync(`${OFFICIAL}/index.json`))('the real scrape (local only)', () => {
	it('loads, with the sections and anchors the units rely on', () => {
		const guide = Object.fromEntries(
			readdirSync(`${OFFICIAL}/guide`).map((f) => [
				f,
				readFileSync(`${OFFICIAL}/guide/${f}`, 'utf8')
			])
		);
		const extras = Object.fromEntries(
			['changelog.md', 'specs.md', 'fieldkit.md', 'sound-packs.md'].map((f) => [
				f,
				readFileSync(`${OFFICIAL}/${f}`, 'utf8')
			])
		);
		const corpus = loadOfficialCorpus({
			index: readFileSync(`${OFFICIAL}/index.json`, 'utf8'),
			chunks: readFileSync(`${OFFICIAL}/chunks.jsonl`, 'utf8'),
			changelog: readFileSync(`${OFFICIAL}/changelog.json`, 'utf8'),
			guide,
			extras
		});
		expect(corpus.guideVersion).toBe('1.1.15');
		expect(corpus.sections.length).toBeGreaterThan(130);
		expect(corpus.anchors.has('sequencer#rotate-trigs-functionality')).toBe(true);
		expect(corpus.anchors.has('step-components#step component reference')).toBe(true);
		expect(corpus.aliases.get('step-components#step-components-ref-table')).toBe(
			'step-components#step component reference'
		);
		expect(corpus.releases[0].version).toBe('1.1.33');
		for (const key of Object.keys(EXCLUDED_SECTIONS)) {
			expect(
				corpus.sections.some((s) => s.key === key),
				key
			).toBe(true);
		}
	});
});
