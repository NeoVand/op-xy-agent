import { describe, expect, it } from 'vitest';
import { parseCombo } from './kbd';

const shape = (input: string) =>
	parseCombo(input).map((p) =>
		p.kind === 'key'
			? `[${p.glyph ?? (p.encoder ? `enc${p.encoder}` : p.legend)}]`
			: p.kind === 'join'
				? p.op
				: p.text
	);

describe('parseCombo', () => {
	it('parses a hold-and-press combo', () => {
		expect(shape('shift + M1')).toEqual(['[shift]', '+', '[M1]']);
	});

	it('parses sequences written with an arrow, -> or then', () => {
		expect(shape('shift → step 1 -> natural F then 3')).toEqual([
			'[shift]',
			'then',
			'[step 1]',
			'then',
			'[natural F]',
			'then',
			'[3]'
		]);
	});

	it('turns leading verbs into words and pictogram keys into glyphs', () => {
		expect(shape('hold record + play')).toEqual(['hold', '[record]', '+', '[play]']);
		expect(shape('hold stop')).toEqual(['hold', '[stop]']);
	});

	it('keeps a bare plus or minus as a key', () => {
		expect(shape('shift + +')).toEqual(['[shift]', '+', '[plus]']);
		expect(shape('bar + -')).toEqual(['[bar]', '+', '[minus]']);
	});

	it('recognises encoders by number or colour', () => {
		expect(shape('shift + turn mid encoder')).toEqual(['[shift]', '+', 'turn', '[enc2]']);
		expect(shape('click enc4')).toEqual(['click', '[enc4]']);
		const [key] = parseCombo('white encoder');
		expect(key).toMatchObject({ kind: 'key', encoder: 4, legend: 'white encoder' });
	});

	it('returns nothing for empty input and gives every part a unique id', () => {
		expect(parseCombo('   ')).toEqual([]);
		const ids = parseCombo('hold shift + turn dark encoder → M1').map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
