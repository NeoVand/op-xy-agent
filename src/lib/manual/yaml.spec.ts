import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { YamlError } from './errors';
import { parseFrontMatter, parseYaml, splitFrontMatter, type YamlValue } from './yaml';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The error a document raises, for asserting message and position. */
function failure(text: string): YamlError {
	try {
		parseYaml(text);
	} catch (error) {
		if (error instanceof YamlError) return error;
		throw error;
	}
	throw new Error(`expected a YamlError for:\n${text}`);
}

describe('scalars', () => {
	it('types plain values conservatively: null, booleans and integers only', () => {
		expect(
			parseYaml(
				[
					'a: null',
					'b: ~',
					'c:',
					'd: true',
					'e: False',
					'f: 42',
					'g: -7',
					'h: 1.1.33',
					'i: 1.10',
					'j: off',
					'k: yes',
					'l: 0x1F',
					'm: 012',
					'n: 3.5'
				].join('\n')
			)
		).toEqual({
			a: null,
			b: null,
			c: null,
			d: true,
			e: false,
			f: 42,
			g: -7,
			h: '1.1.33',
			i: '1.10',
			j: 'off',
			k: 'yes',
			l: '0x1F',
			m: '012',
			n: '3.5'
		});
	});

	it('keeps quoted values as strings', () => {
		expect(parseYaml(`a: '42'\nb: "true"\nc: 'null'\nd: ''`)).toEqual({
			a: '42',
			b: 'true',
			c: 'null',
			d: ''
		});
	});

	it("reads single-quoted values ('' is a quote) and double-quoted escapes", () => {
		expect(parseYaml(`a: 'it''s here'\nb: "tab\\there \\"q\\" \\\\ \\u00e9 \\x41 \\/"`)).toEqual({
			a: "it's here",
			b: 'tab\there "q" \\ é A /'
		});
	});

	it('allows #, colons and brackets inside plain values where YAML does', () => {
		expect(parseYaml('a: key F#3\nb: https://example.com/x#y\nc: 12:30\nd: a [b] c')).toEqual({
			a: 'key F#3',
			b: 'https://example.com/x#y',
			c: '12:30',
			d: 'a [b] c'
		});
	});

	it('keeps unicode text intact', () => {
		expect(parseYaml('a: shift + steps → + natural … E1–E4')).toEqual({
			a: 'shift + steps → + natural … E1–E4'
		});
	});
});

describe('block collections', () => {
	it('nests mappings by indentation', () => {
		expect(parseYaml('firmware:\n  min: 1.0.9\n  deep:\n    x: 1\nnext: 2')).toEqual({
			firmware: { min: '1.0.9', deep: { x: 1 } },
			next: 2
		});
	});

	it('reads sequences of scalars, and sequences at the parent key indentation', () => {
		expect(parseYaml('a:\n  - one\n  - two\nb:\n- three\n- 4\nc: end')).toEqual({
			a: ['one', 'two'],
			b: ['three', 4],
			c: 'end'
		});
	});

	it('reads "- key: value" items as mappings, with nested lists inside', () => {
		const text = [
			'facts:',
			'  - id: record',
			'    text: Hold a step.',
			'    steps:',
			'      - keys: bar + M2',
			'      - keys: bar + turn E4',
			'        note: smoothing',
			'  - id: scope',
			'    text: Four pages.',
			'after: x'
		].join('\n');
		expect(parseYaml(text)).toEqual({
			facts: [
				{
					id: 'record',
					text: 'Hold a step.',
					steps: [{ keys: 'bar + M2' }, { keys: 'bar + turn E4', note: 'smoothing' }]
				},
				{ id: 'scope', text: 'Four pages.' }
			],
			after: 'x'
		});
	});

	it('reads nested sequences and empty items', () => {
		expect(parseYaml('a:\n  - - x\n    - y\n  -\n  - z')).toEqual({ a: [['x', 'y'], null, 'z'] });
	});

	it('returns null for an empty document and ignores comment lines', () => {
		expect(parseYaml('')).toBeNull();
		expect(parseYaml('# only a comment\n\n')).toBeNull();
		expect(parseYaml('# head\na:\n  # inside\n  b: 1\n\n# tail')).toEqual({ a: { b: 1 } });
	});

	it('allows a comment after a quoted value and after an empty value', () => {
		expect(parseYaml("a: 'x' # note\nb: # nested below\n  c: 1")).toEqual({ a: 'x', b: { c: 1 } });
	});
});

describe('flow collections', () => {
	it('reads nested [ ] and { } with quoted and plain values', () => {
		expect(
			parseYaml(`context: { modes: [instrument, auxiliary], screens: ['M1', "M2"], n: 3, x: }`)
		).toEqual({
			context: { modes: ['instrument', 'auxiliary'], screens: ['M1', 'M2'], n: 3, x: null }
		});
	});

	it('reads collections broken over lines the way Prettier prints them', () => {
		const text = [
			'related:',
			'  [',
			'    sequencer.live-recording,',
			'    sequencer.bar,',
			"    'step-components.skip'",
			'  ]',
			'steps: [{ keys: step 5 + turn E2, note: "any step, any encoder" }]',
			'empty: []'
		].join('\n');
		expect(parseYaml(text)).toEqual({
			related: ['sequencer.live-recording', 'sequencer.bar', 'step-components.skip'],
			steps: [{ keys: 'step 5 + turn E2', note: 'any step, any encoder' }],
			empty: []
		});
	});

	it('reads a scalar on its own line below its key, but not a continuation line', () => {
		expect(parseYaml("a:\n  'quoted'\nb:\n  plain text")).toEqual({ a: 'quoted', b: 'plain text' });
		expect(failure('a:\n  two\n  lines').reason).toMatch(/unexpected indentation/);
	});

	it('treats an apostrophe inside a plain value as text', () => {
		expect(parseYaml("aliases: [what's in the box, it's fine]")).toEqual({
			aliases: ["what's in the box", "it's fine"]
		});
	});

	it('accepts JSON as flow values (tests build units this way)', () => {
		const value = { id: 'a', text: 'say "hi" → ok\n', n: [1, null, true] };
		expect(parseYaml(`x: ${JSON.stringify(value)}`)).toEqual({ x: value });
	});

	it('allows a comment after a collection', () => {
		expect(parseYaml('a: [x, y] # two values')).toEqual({ a: ['x', 'y'] });
	});
});

describe('block scalars', () => {
	it('supports literal and folded styles with chomping', () => {
		const text = [
			'lit: |',
			'  line one',
			'  line two',
			'strip: |-',
			'  kept',
			'folded: >',
			'  one',
			'  two',
			'',
			'  three',
			'keep: >+',
			'  end',
			'',
			'last: x'
		].join('\n');
		expect(parseYaml(text)).toEqual({
			lit: 'line one\nline two\n',
			strip: 'kept',
			folded: 'one two\nthree\n',
			keep: 'end\n\n',
			last: 'x'
		});
	});

	it('keeps comment-like lines inside a block scalar as content', () => {
		expect(parseYaml('a: |-\n  # not a comment\n  * nor a bullet\nb: 1')).toEqual({
			a: '# not a comment\n* nor a bullet',
			b: 1
		});
	});

	it('works as a list item', () => {
		expect(parseYaml('a:\n  - >-\n    folded\n    text\n  - plain')).toEqual({
			a: ['folded text', 'plain']
		});
	});
});

describe('rejections (with line:column)', () => {
	const cases: [string, string, RegExp, number, number][] = [
		['tabs', 'a:\n\tb: 1', /tabs/, 2, 1],
		['duplicate keys', 'a: 1\nb: 2\na: 3', /duplicate key "a"/, 3, 1],
		['unexpected indentation', 'a: 1\n   b: 2', /unexpected indentation/, 2, 4],
		['": " in a plain value', 'text: Hold a step: then turn', /cannot contain ": "/, 1, 18],
		['" #" in a plain value', 'text: press shift #1', /cannot contain " #"/, 1, 18],
		['a trailing colon', 'text: ends with:', /cannot contain ": "/, 1, 16],
		['unterminated quotes', "a: 'open", /missing closing '/, 1, 4],
		['text after a quoted value', 'a: "x" y', /after a quoted value/, 1, 7],
		['an unclosed collection', 'a: [x, y', /missing closing bracket/, 1, 4],
		['text after a collection', 'a: [-] + turn E1', /quote values that start with "\["/, 1, 7],
		['a trailing comma', 'a: [x, y, ]', /trailing comma/, 1, 11],
		['an empty list entry', 'a: [x, , y]', /empty entry/, 1, 8],
		['anchors', 'a: &anchor x', /starting with "&" must be quoted/, 1, 4],
		['aliases', 'a: *ref', /starting with "\*" must be quoted/, 1, 4],
		['tags', 'a: !tag x', /starting with "!" must be quoted/, 1, 4],
		['backticks', 'a: `shift` key', /starting with "`" must be quoted/, 1, 4],
		['a value that looks like a list item', 'a: - x', /cannot start with "- "/, 1, 4],
		['complex keys', '? a\n: b', /cannot start with "\? "/, 1, 1],
		['__proto__ keys', '__proto__: 1', /not allowed/, 1, 1],
		['list items after mapping entries', 'a: 1\n- b', /list item cannot follow/, 2, 1],
		['document markers', '---', /document markers/, 1, 1],
		['multi-line quoted values in a collection', 'a: ["x\ny"]', /stay on one line/, 1, 7],
		['multi-line plain values in a collection', 'a: [two\n words here]', /cannot span lines/, 1, 8],
		['comments inside collections', 'a: [x, # no\n y]', /comments are not supported/, 1, 8],
		['unknown escapes', 'a: "\\q"', /unknown escape/, 1, 5],
		['short hex escapes', 'a: "\\u12"', /needs 4 hex digits/, 1, 5],
		['indicator digits on block scalars', 'a: |2\n  x', /block scalars are written/, 1, 4],
		['a document not at column 1', '  a: 1', /first column/, 1, 3]
	];
	it.each(cases)('rejects %s', (_name, text, message, line, column) => {
		const error = failure(text);
		expect(error.reason).toMatch(message);
		expect([error.line, error.column]).toEqual([line, column]);
	});

	it('reports lines relative to the file when given an offset', () => {
		const error = (() => {
			try {
				parseYaml('a: 1\na: 2', 10);
			} catch (e) {
				return e as YamlError;
			}
			throw new Error('expected an error');
		})();
		expect(error.line).toBe(11);
		expect(error.message).toBe('11:1: duplicate key "a"');
	});
});

describe('front-matter', () => {
	it('splits front-matter and body, tolerating a BOM and CRLF line ends', () => {
		const split = splitFrontMatter('\uFEFF---\r\nid: x\r\n---\r\n\r\nBody text.\r\n');
		expect(split).toEqual({ yaml: 'id: x', yamlLine: 2, body: 'Body text.\n', bodyLine: 4 });
	});

	it('rejects files without front-matter or with an unclosed block', () => {
		expect(() => splitFrontMatter('id: x')).toThrow(/must start with a "---" line/);
		expect(() => splitFrontMatter('---\nid: x\n')).toThrow(/not closed/);
	});

	it('requires the front-matter to be a mapping', () => {
		expect(() => parseFrontMatter('---\n- a\n---\n')).toThrow(/must be a "key: value" mapping/);
		expect(() => parseFrontMatter('---\n---\n')).toThrow(/must be a "key: value" mapping/);
		expect(parseFrontMatter('---\na: 1\n---\nhi')).toEqual({
			data: { a: 1 },
			body: 'hi',
			bodyLine: 4
		});
	});

	it('parses the output of Prettier for a unit (single quotes, broken flow lists, comments)', () => {
		const text = [
			'---',
			'id: sequencer.parameter-locks',
			"aliases: [p-lock, plock, 'step automation', 'locked parameter']",
			'context: { modes: [instrument, auxiliary], screens: [M1, M2, M3, M4] } # where it applies',
			'firmware:',
			"  min: '1.0.9'",
			"  changed_in: ['1.1.21', '1.1.33']",
			'  guide_version: 1.1.15',
			'  verified_on: null',
			'facts:',
			'  - id: record',
			"    text: 'Hold a step and turn any encoder to lock that parameter on the step.'",
			'    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing',
			'related:',
			'  [',
			'    sequencer.live-recording,',
			'    and.another-one-here',
			'  ]',
			'---',
			'',
			'Some _body_ text with `shift + M1`.'
		].join('\n');
		const { data, body } = parseFrontMatter(text);
		expect(data).toEqual({
			id: 'sequencer.parameter-locks',
			aliases: ['p-lock', 'plock', 'step automation', 'locked parameter'],
			context: { modes: ['instrument', 'auxiliary'], screens: ['M1', 'M2', 'M3', 'M4'] },
			firmware: {
				min: '1.0.9',
				changed_in: ['1.1.21', '1.1.33'],
				guide_version: '1.1.15',
				verified_on: null
			},
			facts: [
				{
					id: 'record',
					text: 'Hold a step and turn any encoder to lock that parameter on the step.',
					source: 'https://teenage.engineering/guides/op-xy/sequencer#step-sequencing'
				}
			],
			related: ['sequencer.live-recording', 'and.another-one-here']
		} satisfies Record<string, YamlValue>);
		expect(body).toBe('Some _body_ text with `shift + M1`.');
	});

	it('parses the front-matter of every committed unit', () => {
		const dir = `${ROOT}knowledge/manual/units`;
		const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) =>
			f.endsWith('.md')
		);
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			expect(() => parseFrontMatter(readFileSync(`${dir}/${file}`, 'utf8')), file).not.toThrow();
		}
	});

	const guideDir = `${ROOT}knowledge/official/guide`;
	it.runIf(existsSync(guideDir))(
		'parses the front-matter the guide scraper writes (local scrape only)',
		() => {
			const files = readdirSync(guideDir).filter((f) => f.endsWith('.md'));
			expect(files.length).toBe(25);
			for (const file of files) {
				const { data } = parseFrontMatter(readFileSync(`${guideDir}/${file}`, 'utf8'));
				expect(typeof data.slug, file).toBe('string');
			}
		}
	);
});
