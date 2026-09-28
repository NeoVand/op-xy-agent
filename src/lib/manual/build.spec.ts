import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	BUILD_DIR,
	BUILD_FILES,
	KNOWN_RELEASES,
	buildManual,
	fnv1a,
	formatIssue,
	type BuildInput
} from './build';
import {
	CHANGELOG_URL,
	GUIDE_URL,
	PROTECTED_SENTENCE,
	TEST_OFFICIAL_FILES,
	TEST_RESEARCH,
	baseUnit,
	unitFile
} from './fixtures';
import { loadOfficialCorpus } from './official';
import { ManualFileSchema } from './schema';
import { loadSearchIndex } from './search';
import type { UnitFile } from './validate';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OFFICIAL = loadOfficialCorpus(TEST_OFFICIAL_FILES);

function build(files: UnitFile[], extra: Partial<BuildInput> = {}) {
	return buildManual({ units: files, research: TEST_RESEARCH, ...extra });
}

/** Error lines of a build of one unit (`where: message`). */
function errorsOf(
	data: Record<string, unknown>,
	body?: string,
	extra: Partial<BuildInput> = {}
): string[] {
	return build([unitFile(data, body)], extra).errors.map((e) => `${e.where ?? ''}: ${e.message}`);
}

const changelogFact = (version: string, extra: Record<string, unknown> = {}) => ({
	id: `v${version.replace(/\./g, '-')}`,
	text: `Something changed in ${version}.`,
	source: `${CHANGELOG_URL}#${version}`,
	...extra
});

describe('a valid unit', () => {
	const data = baseUnit({
		aliases: ['tester'],
		context: { modes: ['instrument'], screens: ['M1'] },
		firmware: { min: '1.0.9', changed_in: ['1.1.21'], guide_version: '1.1.15', verified_on: null },
		facts: [
			{
				id: 'one',
				text: 'Hold `shift` and look at `E1`.',
				source: `${GUIDE_URL}/sequencer#step-sequencing`
			},
			changelogFact('1.1.21', { firmware_min: '1.1.21' }),
			{
				id: 'seen',
				text: 'Seen on a real unit.',
				source: 'docs/research/99-test.md#session-results',
				verified_on: '1.1.33'
			},
			{
				id: 'guess',
				text: 'A community claim.',
				source: 'https://example.com/notes',
				confidence: 'community'
			}
		],
		procedures: [
			{
				id: 'lock',
				goal: 'Lock a value',
				steps: [{ keys: 'step n + turn E1…E4', note: 'keep holding' }, { keys: 'bar + M2' }],
				source: `${GUIDE_URL}/sequencer#step-sequencing`
			}
		],
		parameters: [
			{
				screen: 'M1',
				encoder: 'E1',
				layer: 'base',
				name: 'shape',
				cc: 12,
				source: `${GUIDE_URL}/synth-engines#prism`
			},
			{
				screen: 'M1',
				encoder: 'E2',
				layer: 'shift',
				name: 'other',
				source: `${GUIDE_URL}/synth-engines#prism`
			}
		]
	});
	const result = build([unitFile(data, 'Prose that mentions `bar + turn E4`.')]);

	it('builds without issues', () => {
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
		expect(result.ok).toBe(true);
		expect(result.verbatimChecked).toBe(false);
		expect(result.coverage).toBeNull();
		expect(result.outputs?.coverageJson).toBeNull();
	});

	it('normalises the unit for manual.json', () => {
		const unit = result.manual?.units[0];
		expect(unit).toMatchObject({
			id: 'sequencer.test-unit',
			order: 100,
			path: 'knowledge/manual/units/sequencer/test-unit.md',
			body: 'Prose that mentions `bar + turn E4`.',
			official_url: `${GUIDE_URL}/sequencer#step-sequencing`,
			related: []
		});
		expect(unit?.facts.map((f) => [f.id, f.confidence, f.firmware_min, f.verified_on])).toEqual([
			['one', 'official', null, null],
			['v1-1-21', 'official', '1.1.21', null],
			['seen', 'verified', null, '1.1.33'],
			['guess', 'community', null, null]
		]);
		expect(unit?.sources.map((s) => s.kind)).toEqual([
			'guide',
			'changelog',
			'research',
			'web',
			'guide'
		]);
		expect(unit?.procedures[0].steps).toEqual([
			{ keys: 'step n + turn E1…E4', note: 'keep holding', set: null },
			{ keys: 'bar + M2', note: null, set: null }
		]);
		expect(unit?.controls).toContain('step.16');
		expect(unit?.controls).toContain('key.bar');
		expect(unit?.parameters.map((p) => [p.keys, p.cc, p.cc_confidence])).toEqual([
			['turn E1', 12, 'community-verified'],
			['shift + turn E2', null, null]
		]);
	});

	it('renders deterministic artefacts that validate and load', () => {
		const again = build([unitFile(data, 'Prose that mentions `bar + turn E4`.')]);
		expect(again.outputs).toEqual(result.outputs);
		const outputs = result.outputs;
		if (!outputs) throw new Error('no outputs');
		const manual = ManualFileSchema.parse(JSON.parse(outputs.manualJson));
		expect(manual.bundle_hash).toBe(fnv1a(outputs.promptBundle));
		expect(manual.stats).toMatchObject({
			units: 1,
			facts: 4,
			procedures: 1,
			parameters: 2,
			verified_items: 1
		});
		expect(manual.areas.find((a) => a.id === 'sequencer')?.units).toEqual(['sequencer.test-unit']);
		expect(outputs.promptBundle).toContain('### Test unit [sequencer.test-unit]');
		expect(outputs.promptBundle).toContain(
			'Something changed in 1.1.21. [#v1-1-21] (since 1.1.21) [s2]'
		);
		expect(outputs.promptBundle).toContain('Seen on a real unit. [#seen] (verified 1.1.33) [s3]');
		expect(outputs.promptBundle).toContain('(community) [s4]');
		expect(outputs.promptBundle).toContain(
			's1 guide:sequencer#step-sequencing · s2 changelog:1.1.21'
		);
		expect(outputs.promptBundle).toContain('| M1 | `turn E1` | shape | – | – | 12 | s5 |');
		expect(loadSearchIndex(outputs.searchIndexJson).documentCount).toBe(1);
	});

	it('sorts units by area, then order, then id', () => {
		const files = [
			unitFile(baseUnit({ id: 'sequencer.b', title: 'B' })),
			unitFile(baseUnit({ id: 'sequencer.a', title: 'A' })),
			unitFile(baseUnit({ id: 'sequencer.c', title: 'C', order: 5 })),
			unitFile(baseUnit({ id: 'hardware.z', area: 'hardware', title: 'Z' }))
		];
		expect(build(files).manual?.units.map((u) => u.id)).toEqual([
			'hardware.z',
			'sequencer.c',
			'sequencer.a',
			'sequencer.b'
		]);
	});
});

describe('validation errors', () => {
	const G = `${GUIDE_URL}/sequencer#step-sequencing`;
	const cases: [string, Record<string, unknown>, RegExp, string?][] = [
		['a missing field', baseUnit({ summary: undefined }), /^summary: /],
		['an unknown field', baseUnit({ summry: 'x' }), /Unrecognized key/],
		[
			'an area that does not match the folder',
			baseUnit({ area: 'mix' }),
			/does not match the folder "sequencer"/
		],
		[
			'an invalid key combo',
			baseUnit({
				procedures: [{ id: 'p', goal: 'g', steps: [{ keys: 'shift + nope' }], source: G }]
			}),
			/not a valid key combo: unknown control "nope"/
		],
		[
			'a key combo in non-canonical spelling',
			baseUnit({
				procedures: [{ id: 'p', goal: 'g', steps: [{ keys: 'Shift + m1' }], source: G }]
			}),
			/write the key combo "Shift \+ m1" canonically: "shift \+ M1"/
		],
		[
			'a code span that is not a key combo',
			baseUnit({ facts: [{ id: 'one', text: 'Open `workspace.xy`.', source: G }] }),
			/reserved for key combos/
		],
		[
			'a related unit that does not exist',
			baseUnit({ related: ['sequencer.missing'] }),
			/no unit "sequencer\.missing"/
		],
		[
			'a unit related to itself',
			baseUnit({ related: ['sequencer.test-unit'] }),
			/relate to itself/
		],
		[
			'an unknown release',
			baseUnit({
				firmware: { min: '1.0.10', changed_in: [], guide_version: '1.1.15', verified_on: null }
			}),
			/unknown OS release "1\.0\.10"/
		],
		[
			'firmware_min older than the unit',
			baseUnit({
				firmware: { min: '1.1.0', changed_in: [], guide_version: '1.1.15', verified_on: null },
				facts: [{ id: 'one', text: 'x', source: G, firmware_min: '1.0.9' }]
			}),
			/older than the unit's firmware\.min 1\.1\.0/
		],
		[
			'a changelog citation without firmware_min',
			baseUnit({ facts: [{ id: 'one', text: 'x', source: G }, changelogFact('1.1.21')] }),
			/set firmware_min: '1\.1\.21'/
		],
		[
			'a changelog citation older than the unit',
			baseUnit({
				firmware: { min: '1.1.21', changed_in: [], guide_version: '1.1.15', verified_on: null },
				facts: [{ id: 'one', text: 'x', source: G }, changelogFact('1.1.15')]
			}),
			/cites release 1\.1\.15, older than/
		],
		[
			'post-guide behaviour sourced from the guide',
			baseUnit({
				firmware: {
					min: '1.0.9',
					changed_in: ['1.1.21'],
					guide_version: '1.1.15',
					verified_on: null
				},
				facts: [{ id: 'one', text: 'x', source: G, firmware_min: '1.1.21' }]
			}),
			/needs a changelog or research source/
		],
		[
			'changed_in that misses a firmware_min',
			baseUnit({
				facts: [
					{ id: 'one', text: 'x', source: G },
					changelogFact('1.1.21', { firmware_min: '1.1.21' })
				]
			}),
			/must list the firmware_min values .*\['1\.1\.21'\]/
		],
		[
			'changed_in out of order',
			baseUnit({
				firmware: {
					min: '1.0.9',
					changed_in: ['1.1.33', '1.1.21'],
					guide_version: '1.1.15',
					verified_on: null
				},
				facts: [
					{ id: 'one', text: 'x', source: G },
					changelogFact('1.1.21', { firmware_min: '1.1.21' }),
					changelogFact('1.1.33', { firmware_min: '1.1.33' })
				]
			}),
			/oldest first/
		],
		[
			'outdated-in-guide without a later change',
			baseUnit({ status: 'outdated-in-guide' }),
			/needs a change after 1\.1\.15/
		],
		[
			'changelog-only without a changelog source',
			baseUnit({ status: 'changelog-only' }),
			/cites the changelog entry/
		],
		[
			'a current unit without a guide source',
			baseUnit({
				firmware: { min: '1.1.21', changed_in: [], guide_version: null, verified_on: null },
				facts: [changelogFact('1.1.21')]
			}),
			/cites at least one guide page/
		],
		[
			'guide_version null while citing the guide',
			baseUnit({
				firmware: { min: '1.0.9', changed_in: [], guide_version: null, verified_on: null }
			}),
			/set guide_version: '1\.1\.15'/
		],
		[
			'guide_version set without citing the guide',
			baseUnit({
				status: 'changelog-only',
				firmware: { min: '1.1.21', changed_in: [], guide_version: '1.1.15', verified_on: null },
				facts: [changelogFact('1.1.21')]
			}),
			/set guide_version: null/
		],
		[
			'a wrong guide version',
			baseUnit({
				firmware: { min: '1.0.9', changed_in: [], guide_version: '1.1.4', verified_on: null }
			}),
			/the guide version is 1\.1\.15, not 1\.1\.4/
		],
		[
			'a community source without confidence',
			baseUnit({
				facts: [
					{ id: 'one', text: 'x', source: G },
					{ id: 'two', text: 'y', source: 'https://example.com' }
				]
			}),
			/a web source needs a confidence/
		],
		[
			'confidence verified without verified_on',
			baseUnit({ facts: [{ id: 'one', text: 'x', source: G, confidence: 'verified' }] }),
			/needs verified_on/
		],
		[
			'verified_on with another confidence',
			baseUnit({
				facts: [{ id: 'one', text: 'x', source: G, verified_on: '1.1.33', confidence: 'official' }]
			}),
			/has confidence "verified"/
		],
		[
			'a research note that does not exist',
			baseUnit({
				facts: [
					{ id: 'one', text: 'x', source: G },
					{ id: 'two', text: 'y', source: 'docs/research/00-nope.md', verified_on: '1.1.33' }
				]
			}),
			/00-nope\.md does not exist/
		],
		[
			'a research heading that does not exist',
			baseUnit({
				facts: [
					{ id: 'one', text: 'x', source: G },
					{ id: 'two', text: 'y', source: 'docs/research/99-test.md#nope', verified_on: '1.1.33' }
				]
			}),
			/no heading with the slug "#nope"/
		],
		[
			'a malformed source',
			baseUnit({ facts: [{ id: 'one', text: 'x', source: 'the guide' }] }),
			/facts\[0\]\.source: a source cannot contain spaces/
		],
		[
			'duplicate fact ids',
			baseUnit({
				facts: [
					{ id: 'one', text: 'x', source: G },
					{ id: 'one', text: 'y', source: G }
				]
			}),
			/duplicate id "one"/
		],
		[
			'two parameters on one slot',
			baseUnit({
				parameters: [
					{ screen: 'M1', encoder: 'E1', layer: 'base', name: 'a', source: G },
					{ screen: 'M1', encoder: 'E1', layer: 'base', name: 'b', source: G }
				]
			}),
			/two parameters on M1 E1 base/
		],
		[
			'a CC that contradicts the lane model',
			baseUnit({
				context: { modes: ['instrument'] },
				parameters: [{ screen: 'M1', encoder: 'E1', layer: 'base', name: 'a', cc: 13, source: G }]
			}),
			/puts M1 base E1 on CC12, not CC13/
		],
		[
			'a CC on an encoder click',
			baseUnit({
				context: { modes: ['instrument'] },
				parameters: [{ screen: 'M1', encoder: 'E1', layer: 'click', name: 'a', cc: 5, source: G }]
			}),
			/click actions have no CC lane/
		],
		[
			'a CC on a page the lane model lacks',
			baseUnit({
				context: { modes: ['instrument'] },
				parameters: [{ screen: 'M4', encoder: 'E1', layer: 'shift', name: 'a', cc: 44, source: G }]
			}),
			/no page M4 shift/
		],
		['a duplicate alias', baseUnit({ aliases: ['a', 'A'] }), /duplicate alias "A"/],
		[
			'an unverified unit marked as verified',
			baseUnit({
				status: 'unverified',
				firmware: { min: '1.0.9', changed_in: [], guide_version: '1.1.15', verified_on: '1.1.33' }
			}),
			/not "unverified"/
		]
	];

	it.each(cases)('rejects %s', (_name, data, message) => {
		const errors = errorsOf(data);
		expect(
			errors.some((line) => message.test(line)),
			errors.join('\n')
		).toBe(true);
	});

	it('reports YAML problems with their position in the file', () => {
		const file = {
			path: 'knowledge/manual/units/sequencer/x.md',
			text: '---\nid: sequencer.x\n\ttitle: y\n---\nbody'
		};
		const [error] = build([file]).errors;
		expect(formatIssue(error)).toBe(
			'error knowledge/manual/units/sequencer/x.md 3:1: tabs cannot indent YAML — use spaces'
		);
	});

	it('rejects files outside an area folder and ids that do not match the file', () => {
		const outside = build([unitFile(baseUnit(), 'x', 'knowledge/manual/units/misc/test-unit.md')]);
		expect(outside.errors[0].message).toMatch(/unknown area folder "misc"/);
		const renamed = build([unitFile(baseUnit(), 'x', 'knowledge/manual/units/sequencer/other.md')]);
		expect(renamed.errors[0].message).toMatch(/expected "sequencer\.other"/);
	});

	it('accepts encoder names as code spans and an empty body is an error', () => {
		expect(
			errorsOf(
				baseUnit({
					facts: [
						{
							id: 'one',
							text: 'Turn `E1` or `E1…E4` or `volume`.',
							source: `${GUIDE_URL}/layout#encoders`
						}
					]
				})
			)
		).toEqual([]);
		expect(errorsOf(baseUnit(), '')).toEqual([
			'body: add a short prose explanation below the front-matter'
		]);
	});

	it('downgrades dangling related ids to warnings on request, and warns about long bodies', () => {
		const result = build([unitFile(baseUnit({ related: ['mix.eq'] }), 'word '.repeat(200))], {
			allowDangling: true
		});
		expect(result.ok).toBe(true);
		expect(result.warnings.map((w) => w.message)).toEqual([
			'200 words: keep bodies under 180 (split the unit?)',
			'no unit "mix.eq" (yet)'
		]);
	});

	it('returns no outputs when anything is wrong', () => {
		const result = build([unitFile(baseUnit({ related: ['x.y'] }))]);
		expect(result.ok).toBe(false);
		expect(result.manual).toBeNull();
		expect(result.outputs).toBeNull();
	});

	it('knows every public release from the firmware inventory', () => {
		expect(KNOWN_RELEASES[0]).toBe('1.0.9');
		expect(KNOWN_RELEASES).toContain('1.0.29');
		expect(KNOWN_RELEASES).toContain('1.1.33');
	});
});

describe('with the official corpus', () => {
	it('checks guide anchors against the scrape', () => {
		const errors = errorsOf(
			baseUnit({ facts: [{ id: 'one', text: 'x', source: `${GUIDE_URL}/sequencer#nope` }] }),
			undefined,
			{ official: OFFICIAL }
		);
		expect(errors).toEqual([
			'facts[0].source: anchor "#nope" does not exist in the scraped guide chapter "sequencer" (anchors: step-sequencing, rotate-trigs-functionality, live-recording)'
		]);
	});

	it('fails the build on 8+ words copied from TE’s text, in any prose field', () => {
		const copied = `Tip: ${PROTECTED_SENTENCE.slice(0, 60)}.`;
		const result = build([unitFile(baseUnit({ summary: copied }), 'Fine words.')], {
			official: OFFICIAL
		});
		expect(result.ok).toBe(false);
		expect(result.verbatimChecked).toBe(true);
		expect(result.errors.map((e) => `${e.where}: ${e.message}`)).toEqual([
			'summary: 12 words copied from TE\'s text (guide/07-sequencer.md#step-sequencing): "to frobnicate a widget hold the blue key and turn the round" — reword it'
		]);
		const body = build(
			[unitFile(baseUnit(), 'widgets could lose their colour when frobnicated twice!')],
			{
				official: OFFICIAL
			}
		);
		expect(body.errors[0]).toMatchObject({
			where: 'body',
			message: expect.stringMatching(/8 words copied .*changelog\.md/)
		});
	});

	it('lets allowed phrases through', () => {
		const result = build(
			[unitFile(baseUnit(), 'widgets could lose their colour when frobnicated twice')],
			{
				official: OFFICIAL,
				verbatimAllow: ['widgets could lose their colour when frobnicated twice']
			}
		);
		expect(result.errors).toEqual([]);
	});

	it('computes coverage, following alias anchors and skipping excluded sections', () => {
		const data = baseUnit({
			firmware: {
				min: '1.0.9',
				changed_in: ['1.1.21'],
				guide_version: '1.1.15',
				verified_on: null
			},
			facts: [
				{ id: 'one', text: 'x', source: `${GUIDE_URL}/sequencer#step-sequencing` },
				{ id: 'two', text: 'y', source: `${GUIDE_URL}/step-components#step-components-ref-table` },
				changelogFact('1.1.21', { firmware_min: '1.1.21' })
			]
		});
		const result = build([unitFile(data)], { official: OFFICIAL });
		expect(result.errors).toEqual([]);
		const coverage = result.coverage;
		expect(coverage).toMatchObject({ guideVersion: '1.1.15', total: 5, covered: 2, percent: 40 });
		expect(coverage?.uncovered.map((s) => s.key)).toEqual([
			'sequencer#live-recording',
			'sequencer#rotate-trigs-functionality',
			'step-components#'
		]);
		expect(coverage?.excluded.map((e) => e.section.key)).toEqual(['credits#credits']);
		expect(coverage?.releasesAfterGuide).toEqual([
			{ version: '1.1.21', cited: true },
			{ version: '1.1.33', cited: false }
		]);
		expect(JSON.parse(result.outputs?.coverageJson ?? 'null')).toMatchObject({
			total: 5,
			covered: 2,
			percent: 40,
			by_area: { sequencer: { total: 5, covered: 2 } },
			uncovered: [
				`${GUIDE_URL}/sequencer#live-recording`,
				`${GUIDE_URL}/sequencer#rotate-trigs-functionality`,
				`${GUIDE_URL}/step-components`
			]
		});
	});
});

describe('the committed manual', () => {
	const unitsDir = `${ROOT}knowledge/manual/units`;
	const researchDir = `${ROOT}docs/research`;
	const units = readdirSync(unitsDir, { recursive: true, encoding: 'utf8' })
		.filter((file) => file.endsWith('.md'))
		.map((file) => ({
			path: `knowledge/manual/units/${file.split('\\').join('/')}`,
			text: readFileSync(`${unitsDir}/${file}`, 'utf8')
		}));
	const research = Object.fromEntries(
		readdirSync(researchDir)
			.filter((file) => file.endsWith('.md'))
			.map((file) => [`docs/research/${file}`, readFileSync(`${researchDir}/${file}`, 'utf8')])
	);
	const result = buildManual({ units, research });

	it('builds without errors or warnings', () => {
		expect(result.errors.map(formatIssue)).toEqual([]);
		expect(result.warnings.map(formatIssue)).toEqual([]);
	});

	it('matches the committed build artefacts (run node scripts/build-manual.mjs after editing units)', () => {
		const read = (file: string) => readFileSync(`${ROOT}${BUILD_DIR}/${file}`, 'utf8');
		expect(result.outputs?.manualJson).toBe(read(BUILD_FILES.manual));
		expect(result.outputs?.promptBundle).toBe(read(BUILD_FILES.bundle));
		expect(result.outputs?.searchIndexJson).toBe(read(BUILD_FILES.searchIndex));
	});
});

describe('fnv1a', () => {
	it('matches the reference 32-bit FNV-1a values', () => {
		expect(fnv1a('')).toBe('811c9dc5');
		expect(fnv1a('a')).toBe('e40c292c');
		expect(fnv1a('foobar')).toBe('bf9cf968');
	});
});
