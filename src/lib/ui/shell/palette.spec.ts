// The palette's matching: each word the start of one of a label's (or its extra words'), a label
// that starts with the query first, a command made for the query keeping its own place, and the
// suggested ones while nothing is typed.
import { describe, expect, it } from 'vitest';
import { rank, type PaletteCommand } from './palette';

const command = (label: string, extra: Partial<PaletteCommand> = {}): PaletteCommand => ({
	id: label,
	label,
	group: 'replica',
	run: () => {},
	...extra
});

describe('rank', () => {
	it('matches the words of a label, and its extra words', () => {
		const all = [
			command('play', { suggest: true }),
			command('show the display large', { keywords: 'screen big' }),
			command('open the manual: Filter (M3)')
		];
		expect(rank('pla', all).map((c) => c.id)).toEqual(['play']);
		expect(rank('big screen', all).map((c) => c.id)).toEqual(['show the display large']);
		expect(rank('filter', all).map((c) => c.id)).toEqual(['open the manual: Filter (M3)']);
		expect(rank('', all).map((c) => c.id)).toEqual(['play']);
		expect(rank('zzz', all)).toEqual([]);
	});

	it('keeps a command made for the query where its score puts it, once', () => {
		const ask = command('ask: “play something”', { score: 0.5 });
		const ranked = rank('play', [command('stop'), ask, command('play')]);
		expect(ranked.map((c) => c.id)).toEqual(['play', 'ask: “play something”']);
		const made = command('light C minor', { id: 'scale:0:minor', score: 1 });
		const listed = command('light C minor on the keyboard', { id: 'scale:0:minor' });
		expect(rank('c minor', [listed, made])).toEqual([made]);
	});
});
