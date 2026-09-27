import { describe, expect, it } from 'vitest';
import { VERBATIM_MIN_WORDS, VerbatimIndex, words } from './verbatim';

// Synthetic "official" text in TE's lowercase style — no real guide text is used in tests.
const CORPUS = [
	{
		id: 'guide/99-widgets.md#frobnicate',
		text: 'to frobnicate a widget, hold the blue key and turn the round knob until the lamp glows. the lamp will then stay lit for as long as the widget is frobnicated.'
	},
	{
		id: 'changelog.md',
		text: 'fix: widgets could lose their colour when frobnicated twice in a row'
	}
];

const index = new VerbatimIndex(CORPUS);

describe('words', () => {
	it('lowercases, drops punctuation and apostrophes, and splits dashes', () => {
		expect(words("OP–XY's Punch-in FX™: don't stop!").map((w) => w.word)).toEqual([
			'op',
			'xys',
			'punch',
			'in',
			'fx',
			'dont',
			'stop'
		]);
	});

	it('records character spans in the NFC text', () => {
		const text = 'Café au lait';
		const ws = words(text);
		expect(ws.map((w) => w.word)).toEqual(['café', 'au', 'lait']);
		expect(text.normalize('NFC').slice(ws[0].start, ws[0].end)).toBe('Café');
	});
});

describe('VerbatimIndex', () => {
	it('uses 8-word runs by default', () => {
		expect(VERBATIM_MIN_WORDS).toBe(8);
		expect(index.minWords).toBe(8);
		expect(index.size).toBeGreaterThan(0);
	});

	it('flags a copied sentence even with different case and punctuation', () => {
		const runs = index.find(
			'Tip: To Frobnicate a Widget — hold the BLUE key, and turn the round knob.'
		);
		expect(runs).toEqual([
			{
				words: 13,
				excerpt: 'To Frobnicate a Widget — hold the BLUE key, and turn the round knob',
				match: 'guide/99-widgets.md#frobnicate'
			}
		]);
	});

	it('reports exactly eight matching words as a run', () => {
		const runs = index.find('We know that the lamp will then stay lit for as long, sadly.');
		expect(runs.map((r) => r.words)).toEqual([9]);
		expect(index.find('then stay lit for as long as the').map((r) => r.words)).toEqual([8]);
	});

	it('does not flag seven shared words', () => {
		expect(index.find('the lamp will then stay lit for a while')).toEqual([]);
	});

	it('does not flag a paraphrase or a reordering of the same words', () => {
		expect(
			index.find('Keep the blue key down and rotate the round knob; the lamp lights up.')
		).toEqual([]);
		expect(index.find('knob round the turn and key blue the hold widget a frobnicate to')).toEqual(
			[]
		);
	});

	it('finds several separate runs and matches changelog text too', () => {
		const text =
			'hold the blue key and turn the round knob until the lamp glows. Unrelated words in between here. Widgets could lose their colour when frobnicated twice.';
		const runs = index.find(text);
		expect(runs.map((r) => [r.words, r.match])).toEqual([
			[13, 'guide/99-widgets.md#frobnicate'],
			[8, 'changelog.md']
		]);
	});

	it('excuses a run inside an allowed phrase, but not a longer one', () => {
		const allowing = new VerbatimIndex(CORPUS, 8, ['Hold the blue key and turn the round knob']);
		expect(allowing.find('hold the blue key and turn the round knob')).toEqual([]);
		expect(allowing.find('hold the blue key and turn the round knob until the lamp')).toHaveLength(
			1
		);
	});

	it('supports other run lengths and rejects silly ones', () => {
		expect(new VerbatimIndex(CORPUS, 3).find('the round knob')).toHaveLength(1);
		expect(() => new VerbatimIndex(CORPUS, 1)).toThrow(RangeError);
		expect(() => new VerbatimIndex(CORPUS, 2.5)).toThrow(RangeError);
	});

	it('finds nothing with an empty corpus or a short text', () => {
		const empty = new VerbatimIndex([]);
		expect(empty.size).toBe(0);
		expect(empty.find(CORPUS[0].text)).toEqual([]);
		expect(index.find('')).toEqual([]);
		expect(index.find('hold the blue key')).toEqual([]);
	});
});
