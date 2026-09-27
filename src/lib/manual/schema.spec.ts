import { describe, expect, it } from 'vitest';
import { baseUnit } from './fixtures';
import { AREA_IDS, AREA_INFO, SCREENS, UnitFrontMatterSchema, UNIT_STATUSES } from './schema';
import { GUIDE_CHAPTERS } from './sources';

describe('UnitFrontMatterSchema', () => {
	it('accepts a minimal unit and fills in defaults', () => {
		const unit = UnitFrontMatterSchema.parse(baseUnit());
		expect(unit).toMatchObject({
			aliases: [],
			context: { modes: [], screens: [] },
			procedures: [],
			parameters: [],
			related: []
		});
		expect(unit.order).toBeUndefined();
	});

	it('trims prose', () => {
		const unit = UnitFrontMatterSchema.parse(baseUnit({ summary: '  padded  \n' }));
		expect(unit.summary).toBe('padded');
	});

	const invalid: [string, Record<string, unknown>][] = [
		['an unknown key', { note: 'typo' }],
		['an id without an area', { id: 'parameter-locks' }],
		['an upper-case id', { id: 'Sequencer.Locks' }],
		['an unknown area', { area: 'drums' }],
		['an unknown status', { status: 'draft' }],
		['a long title', { title: 'x'.repeat(81) }],
		['a long summary', { summary: 'x'.repeat(301) }],
		['an empty fact list', { facts: [] }],
		['a fact without a source', { facts: [{ id: 'a', text: 'x' }] }],
		['an empty fact text', { facts: [{ id: 'a', text: '   ', source: 'docs/research/x.md' }] }],
		['a fact id with spaces', { facts: [{ id: 'a b', text: 'x', source: 's' }] }],
		[
			'a version that is not major.minor.patch',
			{ firmware: { min: '1.1', changed_in: [], guide_version: null, verified_on: null } }
		],
		[
			'a numeric version',
			{ firmware: { min: 1.1, changed_in: [], guide_version: null, verified_on: null } }
		],
		['an unknown mode', { context: { modes: ['drum'] } }],
		['an unknown screen', { context: { screens: ['M5'] } }],
		['a procedure without steps', { procedures: [{ id: 'p', goal: 'g', steps: [], source: 's' }] }],
		[
			'a CC above 127',
			{
				parameters: [
					{ screen: 'M1', encoder: 'E1', layer: 'base', name: 'n', cc: 128, source: 's' }
				]
			}
		],
		[
			'an unknown encoder',
			{ parameters: [{ screen: 'M1', encoder: 'E5', layer: 'base', name: 'n', source: 's' }] }
		],
		[
			'an unknown layer',
			{ parameters: [{ screen: 'M1', encoder: 'E1', layer: 'hold', name: 'n', source: 's' }] }
		],
		['an unknown confidence', { facts: [{ id: 'a', text: 'x', source: 's', confidence: 'sure' }] }],
		['a related id that is not a unit id', { related: ['nope'] }]
	];
	it.each(invalid)('rejects %s', (_name, overrides) => {
		expect(UnitFrontMatterSchema.safeParse(baseUnit(overrides)).success).toBe(false);
	});
});

describe('vocabulary', () => {
	it('describes every area and maps each guide chapter to at most one area', () => {
		expect(Object.keys(AREA_INFO)).toEqual([...AREA_IDS]);
		const chapters = AREA_IDS.flatMap((area) => AREA_INFO[area].chapters);
		expect(new Set(chapters).size).toBe(chapters.length);
		const guideChapters = new Set(Object.values(GUIDE_CHAPTERS));
		for (const chapter of chapters)
			expect(guideChapters.has(chapter), `chapter ${chapter}`).toBe(true);
		// Every chapter except the credits belongs to an area.
		expect(chapters.length).toBe(guideChapters.size - 1);
	});

	it('keeps the status legend and screen list stable', () => {
		expect(UNIT_STATUSES).toEqual(['current', 'outdated-in-guide', 'changelog-only', 'unverified']);
		expect(SCREENS.slice(0, 4)).toEqual(['M1', 'M2', 'M3', 'M4']);
	});
});
