// Which manual the agent uses: ours (`$lib/manual`) in every build, with the local guide scrape
// behind it only in development, else whichever exists, else none. Plus the unit index (bundle
// determinism, search, lookup), the guide splitter, the adapter for $lib/manual, and a static check
// that the dev supplement is imported only behind the import.meta.env.DEV guard (the production
// build drops it; `pnpm build` + grep verifies that).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createUnitSource, renderBundle, snippet } from './manual-index';
import {
	adaptManualApi,
	combineSources,
	loadManualSource,
	NO_MANUAL,
	ourManualSource
} from './manual-source';
import { loadDevGuideSource, splitGuideChapter } from './manual-source.dev';

const units = [
	{
		id: 'b',
		title: 'Tempo page',
		text: 'Press tempo to open the tempo page.\n\nTurn E1 to change the bpm.',
		source: 'https://x.test/tempo'
	},
	{
		id: 'a',
		title: 'Parameter locks',
		text: 'Hold a step and turn an encoder to lock a value.',
		source: 'https://x.test/plock',
		aliases: ['p-lock']
	}
];

const guideUnits = [
	{
		id: '7.2',
		title: '7.2 live recording',
		text: 'Hold record and press play to record live.',
		source: 'https://guide.test/sequencer#live-recording'
	},
	{
		id: '9.1',
		title: '9.1 tempo',
		text: 'The tempo page also sets the groove and metronome.',
		source: 'https://guide.test/tempo'
	}
];

const ours = ourManualSource({ units, header: '# Ours' });
const guide = createUnitSource({
	kind: 'dev-guide',
	label: 'TE guide (dev only)',
	units: guideUnits,
	header: '# Guide'
});

describe('loadManualSource', () => {
	it('uses only our manual in production and never touches the dev guide', async () => {
		const loadDev = vi.fn(async () => guide);
		const source = await loadManualSource({ ours: async () => ours, dev: false, loadDev });
		expect(source).toBe(ours);
		expect(loadDev).not.toHaveBeenCalled();
	});

	it('puts the dev guide behind our manual in development', async () => {
		const loadDev = vi.fn(async () => guide);
		const source = await loadManualSource({ ours: async () => ours, dev: true, loadDev });
		expect(loadDev).toHaveBeenCalledWith('supplement');
		expect(source.kind).toBe('combined');
		expect(source.label).toBe('our manual + TE guide (dev only)');
		expect(source.unitCount).toBe(4);
	});

	it('can leave the dev guide out in development', async () => {
		const loadDev = vi.fn(async () => guide);
		const source = await loadManualSource({
			ours: async () => ours,
			dev: true,
			devGuide: false,
			loadDev
		});
		expect(source).toBe(ours);
		expect(loadDev).not.toHaveBeenCalled();
	});

	it('uses the dev guide alone in development when our manual is missing or empty', async () => {
		const loadDev = vi.fn(async () => guide);
		const failing = await loadManualSource({
			ours: async () => {
				throw new Error('missing build artefacts');
			},
			dev: true,
			loadDev
		});
		expect(failing).toBe(guide);
		expect(loadDev).toHaveBeenCalledWith('stand-in');
		const empty = await loadManualSource({
			ours: async () => ourManualSource({ units: [] }),
			dev: true,
			loadDev: async () => guide
		});
		expect(empty).toBe(guide);
	});

	it('says there is no manual when neither exists', async () => {
		expect(await loadManualSource({ ours: null, dev: true, loadDev: async () => null })).toBe(
			NO_MANUAL
		);
		const loadDev = vi.fn(async () => guide);
		const source = await loadManualSource({
			ours: async () => {
				throw new Error('corrupt manual.json');
			},
			dev: false,
			loadDev
		});
		expect(source).toBe(NO_MANUAL);
		expect(loadDev).not.toHaveBeenCalled();
	});

	it('loads the committed manual through $lib/manual by default', async () => {
		const source = await loadManualSource({ dev: false });
		expect(source.kind).toBe('manual');
		expect(source.unitCount).toBeGreaterThanOrEqual(6);
		const [hit] = await source.search('parameter lock');
		expect(hit).toMatchObject({ id: 'sequencer.parameter-locks', origin: 'manual' });
		expect(hit.source).toMatch(/^https:\/\/teenage\.engineering\/guides\/op-xy/);
		const unit = await source.unit('sequencer.parameter-locks');
		expect(unit?.text).toContain('[sequencer.parameter-locks]');
		expect(await source.promptBundle()).toContain('Cite a unit as [unit-id]');
		const catalog = await source.catalog();
		expect(catalog.map((u) => u.id)).toContain('hardware.layout');
	});

	it('keeps the dev import inside the import.meta.env.DEV branch', () => {
		const code = readFileSync(new URL('./manual-source.ts', import.meta.url), 'utf8');
		const imports = [...code.matchAll(/import\(['"]\.\/manual-source\.dev['"]\)/g)];
		expect(imports).toHaveLength(1);
		const guard = code.indexOf('if (import.meta.env.DEV) {');
		expect(guard).toBeGreaterThan(0);
		// The guarded block: from its opening brace to the matching closing one.
		const open = code.indexOf('{', guard);
		let depth = 0;
		let close = open;
		for (let i = open; i < code.length; i++) {
			if (code[i] === '{') depth++;
			else if (code[i] === '}' && --depth === 0) {
				close = i;
				break;
			}
		}
		expect(imports[0].index).toBeGreaterThan(open);
		expect(imports[0].index).toBeLessThan(close);
		expect(code).not.toMatch(/^import .*manual-source\.dev/m);
	});
});

describe('createUnitSource', () => {
	const source = createUnitSource({ kind: 'manual', label: 'test', units, header: '# Manual' });

	it('renders a deterministic bundle in the given order', async () => {
		const bundle = await source.promptBundle();
		expect(bundle).toBe(renderBundle('# Manual', units));
		expect(
			bundle.startsWith(
				'# Manual\n\n<unit id="b" title="Tempo page" source="https://x.test/tempo">'
			)
		).toBe(true);
		expect(await source.promptBundle()).toBe(bundle);
	});

	it('searches titles, text and aliases', async () => {
		expect((await source.search('p-lock'))[0]?.id).toBe('a');
		expect((await source.search('tempo'))[0]).toMatchObject({
			id: 'b',
			source: 'https://x.test/tempo'
		});
		expect(await source.search('   ')).toEqual([]);
	});

	it('finds units by id or exact title', async () => {
		expect((await source.unit('A'))?.title).toBe('Parameter locks');
		expect((await source.unit('tempo page'))?.id).toBe('b');
		expect(await source.unit('nope')).toBeNull();
	});

	it('cuts snippets around the match', () => {
		const long = `${'intro '.repeat(400)}the tape looper sits here ${'outro '.repeat(400)}`;
		const piece = snippet(long, ['tape'], 200);
		expect(piece).toContain('tape looper');
		expect(piece.length).toBeLessThanOrEqual(202);
		expect(piece.startsWith('…')).toBe(true);
	});
});

describe('combineSources', () => {
	const combined = combineSources(ours, guide);

	it('appends the supplement’s bundle to ours', async () => {
		const bundle = await combined.promptBundle();
		expect(bundle).toBe(`${await ours.promptBundle()}\n\n${await guide.promptBundle()}`);
		expect(await combined.promptBundle()).toBe(bundle);
	});

	it('searches our manual first and fills up with guide hits', async () => {
		const hits = await combined.search('tempo', 3);
		expect(hits.map((h) => [h.id, h.origin])).toEqual([
			['b', 'manual'],
			['9.1', 'dev-guide']
		]);
		const one = await combined.search('tempo', 1);
		expect(one.map((h) => h.id)).toEqual(['b']);
		expect((await combined.search('live recording'))[0]).toMatchObject({
			id: '7.2',
			origin: 'dev-guide'
		});
	});

	it('looks units up in our manual first, then in the guide', async () => {
		expect(await combined.unit('a')).toMatchObject({ id: 'a', origin: 'manual' });
		expect(await combined.unit('7.2')).toMatchObject({ id: '7.2', origin: 'dev-guide' });
		expect(await combined.unit('nope')).toBeNull();
	});

	it('lists both catalogues with their origin', async () => {
		expect((await combined.catalog()).map((u) => `${u.origin}:${u.id}`)).toEqual([
			'manual:b',
			'manual:a',
			'dev-guide:7.2',
			'dev-guide:9.1'
		]);
	});
});

describe('adaptManualApi', () => {
	it('maps $lib/manual’s API onto a source', async () => {
		const unitA = {
			id: 'seq.plock',
			title: 'Parameter locks',
			body: 'Hold a step.',
			official_url: 'https://te.test/sequencer#plock'
		};
		const unitB = { id: 'hw.layout', title: 'Layout', body: 'Keys.', official_url: null };
		const unitC = {
			id: 'fw.new',
			title: 'New in 1.1',
			body: 'New.',
			official_url: null,
			sources: [{ url: 'https://te.test/changelog#1.1' }]
		};
		const api = {
			manualPromptBundle: () => '# Our manual',
			searchManual: () => [
				{
					id: 'seq.plock',
					title: 'Parameter locks',
					snippet: 'Hold a step…',
					source: null,
					score: 3
				}
			],
			getUnit: (id: string) => [unitA, unitB, unitC].find((u) => u.id === id),
			loadManual: () => ({ units: [unitA, unitB, unitC] })
		};
		const source = adaptManualApi(api, (unit) => unit.body);
		expect(source.kind).toBe('manual');
		expect(source.unitCount).toBe(3);
		expect(await source.promptBundle()).toBe('# Our manual');
		expect(await source.search('plock')).toEqual([
			{
				id: 'seq.plock',
				title: 'Parameter locks',
				source: 'https://te.test/sequencer#plock',
				snippet: 'Hold a step…',
				score: 3,
				origin: 'manual'
			}
		]);
		expect(await source.unit(' seq.plock ')).toEqual({
			id: 'seq.plock',
			title: 'Parameter locks',
			source: 'https://te.test/sequencer#plock',
			text: 'Hold a step.',
			origin: 'manual'
		});
		expect((await source.unit('hw.layout'))?.source).toBe('hw.layout');
		expect((await source.unit('fw.new'))?.source).toBe('https://te.test/changelog#1.1');
		expect(await source.unit('nope')).toBeNull();
		expect(await source.catalog()).toEqual([
			{
				id: 'seq.plock',
				title: 'Parameter locks',
				source: 'https://te.test/sequencer#plock',
				origin: 'manual'
			},
			{ id: 'hw.layout', title: 'Layout', source: 'hw.layout', origin: 'manual' },
			{
				id: 'fw.new',
				title: 'New in 1.1',
				source: 'https://te.test/changelog#1.1',
				origin: 'manual'
			}
		]);
	});
});

describe('dev guide fallback', () => {
	const chapter = [
		'---',
		'title: "7. sequencer"',
		'chapter: 7',
		'source_url: "https://teenage.engineering/guides/op-xy/sequencer"',
		'---',
		'# 7. sequencer',
		'',
		'![7. sequencer](../images/x.svg)',
		'',
		'intro about [steps](https://example.test) here',
		'',
		'<a id="step-sequencing"></a>',
		'## 7.1 step sequencing',
		'',
		'### select note',
		'press a step.',
		'',
		'<a id="live-recording"></a>',
		'## 7.2. live recording',
		'hold record.'
	].join('\n');

	it('splits a chapter into an intro and one unit per section, with anchor URLs', () => {
		const parts = splitGuideChapter('07-sequencer.md', chapter);
		expect(parts.map((u) => [u.id, u.title, u.source])).toEqual([
			['7.0', '7. sequencer', 'https://teenage.engineering/guides/op-xy/sequencer'],
			[
				'7.1',
				'7.1 step sequencing',
				'https://teenage.engineering/guides/op-xy/sequencer#step-sequencing'
			],
			[
				'7.2',
				'7.2. live recording',
				'https://teenage.engineering/guides/op-xy/sequencer#live-recording'
			]
		]);
		expect(parts[0].text).toBe('intro about steps here');
		expect(parts[1].text).toBe('### select note\npress a step.');
		expect(parts.some((u) => u.text.includes('images/'))).toBe(false);
	});

	it('skips front-matter chapters and returns null without files', async () => {
		expect(await loadDevGuideSource({})).toBeNull();
		const source = await loadDevGuideSource({
			'/knowledge/official/guide/00-index.md': async () => chapter,
			'/knowledge/official/guide/07-sequencer.md': async () => chapter
		});
		expect(source?.kind).toBe('dev-guide');
		expect(source?.unitCount).toBe(3);
		expect((await source!.search('live recording'))[0]?.id).toBe('7.2');
		expect(await source!.promptBundle()).toMatch(/^# OP-XY guide: development stand-in/);
	});

	it('introduces itself as a supplement when it sits behind our manual', async () => {
		const source = await loadDevGuideSource(
			{ '/knowledge/official/guide/07-sequencer.md': async () => chapter },
			'supplement'
		);
		const bundle = await source!.promptBundle();
		expect(bundle).toMatch(/^# Development supplement/);
		expect(bundle).toContain("the app's manual (written for OS 1.1.33) wins");
	});
});
