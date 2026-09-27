import { describe, expect, it } from 'vitest';
import {
	getUnit,
	loadManual,
	manualCoverage,
	manualPromptBundle,
	resolveRef,
	searchManual
} from './index';
import { fnv1a } from './build';
import { expandQuery, processTerm, SYNONYMS, tokenize } from './search';

describe('loadManual / getUnit / resolveRef', () => {
	it('loads the validated committed manual', () => {
		const manual = loadManual();
		expect(manual.reference_firmware).toBe('1.1.33');
		expect(manual.guide_version).toBe('1.1.15');
		expect(manual.units.length).toBe(manual.stats.units);
		expect(manual.units.length).toBeGreaterThanOrEqual(6);
		expect(loadManual()).toBe(manual);
	});

	it('finds units by id', () => {
		expect(getUnit('sequencer.parameter-locks')?.title).toBe('Parameter locks');
		expect(getUnit('nope.nope')).toBeUndefined();
	});

	it('resolves citations to units, facts and procedures', () => {
		const unitOnly = resolveRef('com.midi-settings');
		expect(unitOnly?.unit.id).toBe('com.midi-settings');
		expect(unitOnly?.fact).toBeNull();
		expect(resolveRef('com.midi-settings#stock-values')?.fact?.verified_on).toBe('1.1.33');
		expect(resolveRef('sequencer.parameter-locks#smooth')?.procedure?.steps[0].keys).toBe(
			'bar + turn E4'
		);
		expect(resolveRef('com.midi-settings#nope')).toBeUndefined();
		expect(resolveRef('nope#x')).toBeUndefined();
	});
});

describe('searchManual', () => {
	const top = (query: string) => searchManual(query, { limit: 3 }).map((r) => r.id);

	it('ranks the unit a question is about first', () => {
		expect(top('how do I p-lock a step')[0]).toBe('sequencer.parameter-locks');
		expect(top('parameter lock on an empty step')[0]).toBe('sequencer.parameter-locks');
		expect(top('prism engine stereo')[0]).toBe('instrument.engine-prism');
		expect(top('send midi clock to my DAW')[0]).toBe('com.midi-settings');
		expect(top('overwrite a preset snapshot')[0]).toBe('instrument.save-to-same-snapshot');
		expect(top('where is the volume knob')[0]).toBe('hardware.layout');
	});

	it('expands synonyms (ratchet → multiply, arp, bpm …)', () => {
		expect(top('ratchet hi-hats')[0]).toBe('sequencer.step-components');
	});

	it('returns a snippet from the best-matching fact, a citation and TE’s URL', () => {
		const [hit] = searchManual('midi echo off', { limit: 1 });
		expect(hit.id).toBe('com.midi-settings');
		expect(hit.fact).not.toBeNull();
		expect(hit.snippet.length).toBeLessThanOrEqual(222);
		expect(hit.snippet.toLowerCase()).toContain('echo');
		expect(hit.source).toBe('https://teenage.engineering/guides/op-xy/com#system-settings');
		expect(hit.score).toBeGreaterThan(0);
		expect(resolveRef(`${hit.id}#${hit.fact}`)?.fact?.text).toContain('echo');
	});

	it('honours limit and area, and ignores empty queries', () => {
		expect(searchManual('step', { limit: 2 }).length).toBeLessThanOrEqual(2);
		expect(searchManual('step', { area: 'com' }).every((r) => r.area === 'com')).toBe(true);
		expect(searchManual('   ')).toEqual([]);
		expect(searchManual('step', { limit: 0 })).toEqual([]);
		expect(searchManual('zzqxj')).toEqual([]);
	});
});

describe('search text processing', () => {
	it('tokenizes on punctuation but keeps hyphenated words', () => {
		expect(tokenize('shift + M1 → p-lock, (E1)')).toEqual(['shift', 'M1', 'p-lock', 'E1']);
	});

	it('lowercases, strips accents, plurals and stop words, and splits hyphens', () => {
		expect(processTerm('Locks')).toBe('lock');
		expect(processTerm('Préset')).toBe('preset');
		expect(processTerm('the')).toBeNull();
		expect(processTerm('bass')).toBe('bass');
		expect(processTerm('p-lock')).toEqual(['plock', 'p', 'lock']);
		expect(processTerm('...')).toBeNull();
	});

	it('adds synonym branches for known words and phrases only', () => {
		expect(expandQuery('filter cutoff')).toBe('filter cutoff');
		expect(expandQuery('Ratchet!')).toEqual({
			combineWith: 'OR',
			queries: ['Ratchet!', 'multiply']
		});
		expect(expandQuery('back up my projects')).toEqual({
			combineWith: 'OR',
			queries: ['back up my projects', SYNONYMS['back up']]
		});
	});
});

describe('manualPromptBundle / manualCoverage', () => {
	it('returns the byte-stable bundle whose hash manual.json records', () => {
		const bundle = manualPromptBundle();
		expect(bundle.startsWith('# OP-XY manual\n')).toBe(true);
		expect(fnv1a(bundle)).toBe(loadManual().bundle_hash);
		for (const unit of loadManual().units) expect(bundle).toContain(`[${unit.id}]`);
	});

	it('reports counts and guide coverage', () => {
		const coverage = manualCoverage();
		expect(coverage.units).toBe(loadManual().units.length);
		expect(coverage.facts).toBeGreaterThan(50);
		expect(coverage.verifiedItems).toBeGreaterThan(0);
		expect(coverage.byStatus['changelog-only']).toBeGreaterThanOrEqual(1);
		expect(coverage.guide.version).toBe('1.1.15');
		expect(coverage.guide.covered).toBeLessThanOrEqual(coverage.guide.total);
		expect(coverage.guide.percent).toBeCloseTo(
			(coverage.guide.covered / coverage.guide.total) * 100,
			0
		);
		expect(coverage.guide.uncovered.length).toBe(coverage.guide.total - coverage.guide.covered);
		expect(manualCoverage()).toBe(coverage);
	});
});
