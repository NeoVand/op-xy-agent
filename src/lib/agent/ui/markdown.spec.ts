// Markdown-lite for agent answers: blocks, inlines, key combos as keycaps, safe links only.
import { describe, expect, it } from 'vitest';
import { tryParseKeys } from '$lib/core/opxy';
import { comboForDisplay, inlineText, parseInline, parseMarkdown } from './markdown';

const isKeys = (code: string) => tryParseKeys(code).ok;

describe('parseMarkdown blocks', () => {
	it('splits paragraphs, headings, lists, code, quotes, rules and tables', () => {
		const blocks = parseMarkdown(
			[
				'# Title',
				'First line',
				'second line',
				'',
				'- one',
				'  - nested',
				'- two',
				'continued',
				'',
				'3. three',
				'4. four',
				'',
				'```ts',
				'const x = 1;',
				'```',
				'> quoted',
				'---',
				'| a | b |',
				'|---|---|',
				'| 1 | 2 |'
			].join('\n')
		);
		expect(blocks.map((b) => b.t)).toEqual([
			'h',
			'p',
			'list',
			'list',
			'code',
			'quote',
			'hr',
			'table'
		]);
		const [heading, paragraph, bullets, numbers, code, , , table] = blocks;
		expect(heading).toMatchObject({ t: 'h', level: 1 });
		expect(paragraph.t === 'p' && paragraph.c.map((n) => n.t)).toEqual(['text', 'br', 'text']);
		expect(bullets.t === 'list' && bullets.items.map((i) => [i.depth, inlineText(i.c)])).toEqual([
			[0, 'one'],
			[1, 'nested'],
			[0, 'two\ncontinued']
		]);
		expect(numbers).toMatchObject({ ordered: true, start: 3 });
		expect(code).toEqual({ t: 'code', lang: 'ts', v: 'const x = 1;' });
		expect(table.t === 'table' && table.rows.length).toBe(1);
	});

	it('handles an unterminated code fence while streaming', () => {
		expect(parseMarkdown('```\npartial')).toEqual([{ t: 'code', lang: '', v: 'partial' }]);
	});
});

describe('parseInline', () => {
	it('turns backticked combos into keys and other code into code', () => {
		const nodes = parseInline('Hold `shift + M1`, not `CC80`, then `record + play`.', { isKeys });
		expect(nodes.filter((n) => n.t === 'keys').map((n) => (n.t === 'keys' ? n.v : ''))).toEqual([
			'shift + M1',
			'record + play'
		]);
		expect(nodes.find((n) => n.t === 'code')).toEqual({ t: 'code', v: 'CC80' });
	});

	it('parses strong, emphasis and nesting', () => {
		expect(parseInline('**bold `M1`** and *soft* and snake_case_word', { isKeys })).toEqual([
			{
				t: 'strong',
				c: [
					{ t: 'text', v: 'bold ' },
					{ t: 'keys', v: 'M1' }
				]
			},
			{ t: 'text', v: ' and ' },
			{ t: 'em', c: [{ t: 'text', v: 'soft' }] },
			{ t: 'text', v: ' and snake_case_word' }
		]);
	});

	it('only links http(s) and mailto URLs', () => {
		expect(parseInline('[guide](https://teenage.engineering/guides/op-xy#x)')).toEqual([
			{
				t: 'link',
				href: 'https://teenage.engineering/guides/op-xy#x',
				c: [{ t: 'text', v: 'guide' }]
			}
		]);
		expect(parseInline('[bad](javascript:alert(1))')).toEqual([
			{ t: 'text', v: '[bad](javascript:alert(1))' }
		]);
		expect(parseInline('see https://example.test/a.b, then')).toEqual([
			{ t: 'text', v: 'see ' },
			{
				t: 'link',
				href: 'https://example.test/a.b',
				c: [{ t: 'text', v: 'https://example.test/a.b' }]
			},
			{ t: 'text', v: ', then' }
		]);
	});

	it('keeps raw HTML as text (nothing is ever rendered as markup)', () => {
		expect(inlineText(parseInline('<img src=x onerror=alert(1)>'))).toBe(
			'<img src=x onerror=alert(1)>'
		);
	});

	it('respects escapes and leaves unmatched markers alone', () => {
		expect(parseInline('\\*not em\\* and 2 * 3')).toEqual([{ t: 'text', v: '*not em* and 2 * 3' }]);
		expect(parseInline('a ` b')).toEqual([{ t: 'text', v: 'a ` b' }]);
	});

	it('turns citations of manual units into cite nodes', () => {
		expect(parseInline('Lock it [sequencer.parameter-locks#rotate].')).toEqual([
			{ t: 'text', v: 'Lock it ' },
			{ t: 'cite', ref: 'sequencer.parameter-locks#rotate' },
			{ t: 'text', v: '.' }
		]);
		expect(parseInline('[hardware.layout, com.midi-settings]')).toEqual([
			{ t: 'cite', ref: 'hardware.layout' },
			{ t: 'cite', ref: 'com.midi-settings' }
		]);
		expect(inlineText(parseInline('see [hardware.layout]'))).toBe('see [hardware.layout]');
	});

	it('leaves other brackets alone', () => {
		for (const text of ['press [+] or [-]', '[7.1 step sequencing]', '[optional]', '[a.b c]']) {
			expect(parseInline(text)).toEqual([{ t: 'text', v: text }]);
		}
		expect(parseInline('[hardware.layout](https://x.test)')).toEqual([
			{ t: 'link', href: 'https://x.test', c: [{ t: 'text', v: 'hardware.layout' }] }
		]);
	});
});

describe('comboForDisplay', () => {
	it('draws encoders as knobs and [-]/[+] as their glyph keys', () => {
		expect(comboForDisplay('step 5 + turn E2')).toBe('step 5 + turn encoder 2');
		expect(comboForDisplay('shift + [+]')).toBe('shift + plus');
	});
});
