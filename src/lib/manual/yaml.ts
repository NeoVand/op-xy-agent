/**
 * A small, strict YAML subset for the front-matter of manual units (`knowledge/manual/units/**.md`).
 *
 * Why not a YAML library: the project adds no dependencies for this, and full YAML is a hazard in
 * hand-written knowledge files — implicit typing turns `1.10` into the number 1.1, `no` into false
 * and `0x1F` into 31. This parser accepts what our units need, including everything Prettier's YAML
 * printer produces for them, and rejects the rest with a `line:column` error naming the fix.
 *
 * Supported
 * - block mappings (`key: value`) and block sequences (`- item`), nested by indentation (spaces);
 *   a sequence may sit at its parent key's indentation; `- key: value` starts a mapping item
 * - scalars: plain, `'single-quoted'` (`''` is a quote), `"double-quoted"` (backslash escapes)
 * - flow collections `[a, 'b c']` and `{ k: v }`, nested, spanning lines as Prettier breaks them
 * - block scalars `|` and `>` with optional `-` / `+` chomping
 * - `#` comments on their own line, or after a quoted value or a flow collection
 *
 * Typing: a plain `null`, `~` or empty value is null, `true` / `false` are booleans, integers are
 * numbers; everything else — `1.1.33`, `1.10`, `yes`, `off`, `0x1F` — stays a string. Quoted values
 * are always strings.
 *
 * Rejected: tabs in indentation, anchors, aliases, tags, directives, `? ` keys, duplicate keys,
 * plain or quoted values spanning lines, plain values containing `: ` or ` #` (quote them),
 * document markers inside the front-matter.
 */
import { YamlError } from './errors';

/** A parsed YAML value. */
export type YamlValue = string | number | boolean | null | YamlValue[] | YamlMap;
/** A parsed YAML mapping. */
export interface YamlMap {
	[key: string]: YamlValue;
}

interface Row {
	/** 1-based line number in the file. */
	readonly line: number;
	readonly raw: string;
	/** Leading spaces; rewritten when `- key: value` opens a mapping inside a list item. */
	indent: number;
	/** The line after its indentation, trailing spaces removed. */
	body: string;
	/** Empty or a comment line. */
	readonly blank: boolean;
	/** A tab follows the leading spaces (an error unless the row is block-scalar content). */
	readonly tab: boolean;
}

const PLAIN_KEY = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const INTEGER = /^-?(?:0|[1-9][0-9]*)$/;
/** Characters that cannot start a plain value (they mean something else in YAML). */
const RESERVED_START = new Set(['&', '*', '!', '%', '@', '`', '|', '>']);

/** Resolves a plain (unquoted) scalar with the conservative typing described above. */
function resolvePlain(text: string): string | number | boolean | null {
	if (text === '' || text === '~' || text === 'null' || text === 'Null' || text === 'NULL') {
		return null;
	}
	if (text === 'true' || text === 'True' || text === 'TRUE') return true;
	if (text === 'false' || text === 'False' || text === 'FALSE') return false;
	if (INTEGER.test(text)) {
		const n = Number(text);
		if (Number.isSafeInteger(n)) return n;
	}
	return text;
}

const DOUBLE_ESCAPES: Record<string, string> = {
	'0': '\0',
	a: '\x07',
	b: '\b',
	t: '\t',
	n: '\n',
	v: '\v',
	f: '\f',
	r: '\r',
	e: '\x1b',
	' ': ' ',
	'"': '"',
	'/': '/',
	'\\': '\\',
	N: '\u0085',
	_: ' '
};

const HEX_ESCAPE_LENGTH: Record<string, number> = { x: 2, u: 4, U: 8 };

/**
 * Reads a quoted scalar starting at `text[start]` (a `'` or `"`).
 * @returns the value and the index just after the closing quote
 */
function readQuoted(
	text: string,
	start: number,
	fail: (reason: string, offset: number) => never
): { value: string; end: number } {
	const quote = text[start];
	let value = '';
	let i = start + 1;
	while (i < text.length) {
		const ch = text[i];
		if (ch === '\n') fail('quoted values must stay on one line', i);
		if (quote === "'") {
			if (ch === "'") {
				if (text[i + 1] === "'") {
					value += "'";
					i += 2;
					continue;
				}
				return { value, end: i + 1 };
			}
			value += ch;
			i++;
			continue;
		}
		if (ch === '"') return { value, end: i + 1 };
		if (ch === '\\') {
			const code = text[i + 1];
			if (code === undefined || code === '\n') fail('unfinished escape in a quoted value', i);
			const hex = HEX_ESCAPE_LENGTH[code];
			if (hex !== undefined) {
				const digits = text.slice(i + 2, i + 2 + hex);
				if (!new RegExp(`^[0-9A-Fa-f]{${hex}}$`).test(digits)) {
					fail(`"\\${code}" needs ${hex} hex digits`, i);
				}
				value += String.fromCodePoint(parseInt(digits, 16));
				i += 2 + hex;
				continue;
			}
			const escaped = DOUBLE_ESCAPES[code];
			if (escaped === undefined) fail(`unknown escape "\\${code}"`, i);
			value += escaped;
			i += 2;
			continue;
		}
		value += ch;
		i++;
	}
	return fail(`missing closing ${quote}`, start);
}

/** Parses the text of one flow collection (`[…]` or `{…}`), which may contain newlines. */
class FlowParser {
	private pos = 0;

	constructor(
		private readonly text: string,
		private readonly fail: (reason: string, offset: number) => never
	) {}

	parse(): YamlValue {
		const value = this.value();
		this.skipSpace();
		if (this.pos < this.text.length) this.fail('unexpected text after the collection', this.pos);
		return value;
	}

	private skipSpace(): void {
		while (this.pos < this.text.length) {
			const ch = this.text[this.pos];
			if (ch === ' ' || ch === '\n' || ch === '\t') this.pos++;
			else if (ch === '#') this.fail('comments are not supported inside [ ] or { }', this.pos);
			else break;
		}
	}

	private value(): YamlValue {
		this.skipSpace();
		const ch = this.text[this.pos];
		if (ch === '[') return this.sequence();
		if (ch === '{') return this.mapping();
		if (ch === '"' || ch === "'") {
			const { value, end } = readQuoted(this.text, this.pos, this.fail);
			this.pos = end;
			return value;
		}
		return resolvePlain(this.plain(false));
	}

	/** A plain scalar inside a collection: it ends at `,`, a bracket, or a `: ` separator. */
	private plain(isKey: boolean): string {
		const start = this.pos;
		const first = this.text[start];
		if (first !== undefined && RESERVED_START.has(first)) {
			this.fail(`values starting with "${first}" must be quoted`, start);
		}
		while (this.pos < this.text.length) {
			const ch = this.text[this.pos];
			if (ch === ',' || ch === '[' || ch === ']' || ch === '{' || ch === '}') break;
			if (ch === ':' && /[\s,\]}]/.test(this.text[this.pos + 1] ?? ' ')) {
				if (isKey) break;
				this.fail('a plain value cannot contain ": " — quote it', this.pos);
			}
			if (ch === '\n') {
				const rest = this.text.slice(start, this.pos).trim();
				if (rest !== '') {
					// A line break right after the value is fine; more text before the separator is not.
					const next = /\S/.exec(this.text.slice(this.pos));
					const nextCh = next ? next[0] : '';
					if (nextCh !== ',' && nextCh !== ']' && nextCh !== '}' && nextCh !== ':') {
						this.fail('plain values cannot span lines — quote the value', this.pos);
					}
				}
				break;
			}
			if (ch === '#' && /\s/.test(this.text[this.pos - 1] ?? '')) {
				this.fail('comments are not supported inside [ ] or { }', this.pos);
			}
			this.pos++;
		}
		return this.text.slice(start, this.pos).trim();
	}

	private sequence(): YamlValue[] {
		const items: YamlValue[] = [];
		this.pos++; // [
		this.skipSpace();
		if (this.text[this.pos] === ']') {
			this.pos++;
			return items;
		}
		for (;;) {
			const at = this.pos;
			const ch = this.text[at];
			if (ch === ',' || ch === ']') this.fail('empty entry in a [ ] list', at);
			items.push(this.value());
			this.skipSpace();
			const next = this.text[this.pos];
			if (next === ',') {
				this.pos++;
				this.skipSpace();
				if (this.text[this.pos] === ']') this.fail('trailing comma in a [ ] list', this.pos);
				continue;
			}
			if (next === ']') {
				this.pos++;
				return items;
			}
			this.fail(next === undefined ? 'missing "]"' : 'expected "," or "]"', this.pos);
		}
	}

	private mapping(): YamlMap {
		const map: YamlMap = {};
		this.pos++; // {
		this.skipSpace();
		if (this.text[this.pos] === '}') {
			this.pos++;
			return map;
		}
		for (;;) {
			const at = this.pos;
			let key: string;
			const ch = this.text[at];
			if (ch === '"' || ch === "'") {
				const quoted = readQuoted(this.text, at, this.fail);
				key = quoted.value;
				this.pos = quoted.end;
			} else {
				key = this.plain(true);
				if (!PLAIN_KEY.test(key)) this.fail(`invalid key "${key}" — quote it`, at);
			}
			this.skipSpace();
			if (this.text[this.pos] !== ':') this.fail(`expected ":" after key "${key}"`, this.pos);
			this.pos++;
			if (FORBIDDEN_KEYS.has(key)) this.fail(`the key "${key}" is not allowed`, at);
			if (Object.hasOwn(map, key)) this.fail(`duplicate key "${key}"`, at);
			this.skipSpace();
			const next = this.text[this.pos];
			map[key] = next === ',' || next === '}' ? null : this.value();
			this.skipSpace();
			const sep = this.text[this.pos];
			if (sep === ',') {
				this.pos++;
				this.skipSpace();
				if (this.text[this.pos] === '}') this.fail('trailing comma in a { } mapping', this.pos);
				continue;
			}
			if (sep === '}') {
				this.pos++;
				return map;
			}
			this.fail(sep === undefined ? 'missing "}"' : 'expected "," or "}"', this.pos);
		}
	}
}

class BlockParser {
	private i = 0;

	constructor(private readonly rows: Row[]) {}

	private fail(reason: string, row: Row | undefined, column = (row?.indent ?? 0) + 1): never {
		const last = this.rows[this.rows.length - 1];
		throw new YamlError(reason, row?.line ?? (last ? last.line + 1 : 1), column);
	}

	private skipBlank(): void {
		while (this.i < this.rows.length && this.rows[this.i].blank) this.i++;
	}

	private current(): Row | undefined {
		this.skipBlank();
		const row = this.rows[this.i];
		if (row?.tab) this.fail('tabs cannot indent YAML — use spaces', row);
		return row;
	}

	document(): YamlValue {
		const first = this.current();
		if (!first) return null;
		if (first.indent !== 0) this.fail('the front-matter must start at the first column', first);
		const value = this.node(0);
		const rest = this.current();
		if (rest) this.fail('unexpected indentation', rest);
		return value;
	}

	private node(indent: number): YamlValue {
		const row = this.current();
		if (!row) return null;
		if (isSequenceItem(row.body)) return this.sequence(indent);
		if (splitKey(row.body)) return this.mapping(indent);
		if (row.body === '---' || row.body === '...') {
			this.fail('document markers are not allowed inside the front-matter', row);
		}
		// A value on its own line below "key:" — Prettier moves long [ … ] lists there.
		return this.value(row, row.indent, row.body, row.indent + 1);
	}

	private mapping(indent: number): YamlMap {
		const map: YamlMap = {};
		for (;;) {
			const row = this.current();
			if (!row || row.indent < indent) return map;
			if (row.indent > indent) {
				this.fail(
					'unexpected indentation (to continue a long value, keep it on one line or use a ">" block)',
					row
				);
			}
			if (isSequenceItem(row.body))
				this.fail('a "- " list item cannot follow "key: value" lines here', row);
			const entry = splitKey(row.body);
			if (!entry) {
				if (row.body.startsWith('? ')) this.fail('complex "? " keys are not supported', row);
				this.fail('expected "key: value"', row);
			}
			const { key, rest, restColumn } = entry;
			if (FORBIDDEN_KEYS.has(key)) this.fail(`the key "${key}" is not allowed`, row);
			if (Object.hasOwn(map, key)) this.fail(`duplicate key "${key}"`, row);
			map[key] = this.value(row, indent, rest, row.indent + restColumn);
		}
	}

	private sequence(indent: number): YamlValue[] {
		const items: YamlValue[] = [];
		for (;;) {
			const row = this.current();
			if (!row || row.indent < indent) return items;
			if (row.indent > indent) this.fail('unexpected indentation', row);
			if (!isSequenceItem(row.body)) return items;
			const after = row.body.slice(1).replace(/^ +/, '');
			const column = row.indent + (row.body.length - after.length);
			if (after !== '' && (isSequenceItem(after) || splitKey(after))) {
				// "- key: value" (or "- - item"): the item is a block node starting at `column`.
				row.indent = column;
				row.body = after;
				items.push(this.node(column));
				continue;
			}
			items.push(this.value(row, indent, after, column + 1));
		}
	}

	/**
	 * The value of a mapping entry or list item whose inline text is `rest` (may be empty: then
	 * the value is the nested block below, or null). Consumes `row` and any rows the value spans.
	 */
	private value(row: Row, indent: number, rest: string, restColumn: number): YamlValue {
		this.i = this.rows.indexOf(row) + 1;
		if (rest === '' || rest.startsWith('#')) {
			const next = this.current();
			if (next && next.indent > indent) return this.node(next.indent);
			// Lists may sit at their key's indentation ("key:" then "- item" at the same column).
			if (
				next &&
				next.indent === indent &&
				isSequenceItem(next.body) &&
				!isSequenceItem(row.body)
			) {
				return this.sequence(indent);
			}
			return null;
		}
		const first = rest[0];
		if (first === '|' || first === '>') return this.blockScalar(row, indent, rest, restColumn);
		if (first === '[' || first === '{') return this.flow(row, rest, restColumn);
		if (first === '"' || first === "'") {
			const fail = (reason: string, offset: number): never =>
				this.fail(reason, row, restColumn + offset);
			const { value, end } = readQuoted(rest, 0, fail);
			const tail = rest.slice(end);
			if (tail.trim() !== '' && !/^\s+#/.test(tail)) {
				this.fail('unexpected text after a quoted value', row, restColumn + end);
			}
			return value;
		}
		if (RESERVED_START.has(first)) {
			this.fail(`values starting with "${first}" must be quoted`, row, restColumn);
		}
		if ((first === '-' || first === '?' || first === ':') && /^[-?:](\s|$)/.test(rest)) {
			this.fail(`a value cannot start with "${first} " — quote it`, row, restColumn);
		}
		const comment = /[ \t]#/.exec(rest);
		if (comment) {
			this.fail(
				'a plain value cannot contain " #" (YAML would cut it off there) — quote it, or put the comment on its own line',
				row,
				restColumn + comment.index
			);
		}
		const colon = /:(\s|$)/.exec(rest);
		if (colon)
			this.fail('a plain value cannot contain ": " — quote it', row, restColumn + colon.index);
		return resolvePlain(rest.trim());
	}

	private flow(row: Row, rest: string, restColumn: number): YamlValue {
		// Gather lines until the brackets balance (quotes respected), then parse the text as one.
		let text = rest;
		let depth = 0;
		let quote: string | null = null;
		let end = -1;
		const starts: { offset: number; row: Row; column: number }[] = [
			{ offset: 0, row, column: restColumn }
		];
		let lineIndex = this.rows.indexOf(row);
		let scan = 0;
		// A quote opens a quoted value only where a value starts (`it's` in a plain value is text).
		let valueStart = true;
		for (;;) {
			for (; scan < text.length; scan++) {
				const ch = text[scan];
				if (quote) {
					if (quote === '"' && ch === '\\') scan++;
					else if (ch === quote) {
						if (quote === "'" && text[scan + 1] === "'") scan++;
						else quote = null;
					}
					continue;
				}
				if ((ch === '"' || ch === "'") && valueStart) quote = ch;
				else if (ch === '[' || ch === '{') depth++;
				else if (ch === ']' || ch === '}') {
					depth--;
					if (depth === 0) {
						end = scan + 1;
						break;
					}
				}
				if (ch === '[' || ch === '{' || ch === ',' || ch === ':') valueStart = true;
				else if (ch !== ' ' && ch !== '\n' && ch !== '\t') valueStart = false;
			}
			if (end >= 0) break;
			lineIndex++;
			const next = this.rows[lineIndex];
			if (!next) this.fail('missing closing bracket', row, restColumn);
			starts.push({ offset: text.length + 1, row: next, column: 1 });
			text += '\n' + next.raw;
		}
		this.i = lineIndex + 1;
		const tail = text.slice(end);
		if (tail.trim() !== '' && !/^\s+#/.test(tail)) {
			const at = locate(starts, end);
			this.fail(
				'unexpected text after a [ ] or { } collection (quote values that start with "[" or "{", e.g. key combos like \'[-] + E1\')',
				at.row,
				at.column
			);
		}
		const fail = (reason: string, offset: number): never => {
			const at = locate(starts, offset);
			return this.fail(reason, at.row, at.column);
		};
		return new FlowParser(text.slice(0, end), fail).parse();
	}

	private blockScalar(row: Row, indent: number, rest: string, restColumn: number): string {
		const header = /^([|>])([-+])?(\s+#.*)?$/.exec(rest);
		if (!header) {
			this.fail('block scalars are written "|", "|-", "|+", ">", ">-" or ">+"', row, restColumn);
		}
		const [, style, chomp] = header;
		const lines: string[] = [];
		let blockIndent: number | undefined;
		let j = this.rows.indexOf(row) + 1;
		for (; j < this.rows.length; j++) {
			const { raw } = this.rows[j];
			if (raw.trim() === '') {
				lines.push('');
				continue;
			}
			const lead = /^ */.exec(raw)?.[0].length ?? 0;
			if (raw[lead] === '\t' && (blockIndent === undefined || lead < blockIndent)) {
				this.fail('tabs cannot indent YAML — use spaces', this.rows[j], lead + 1);
			}
			if (blockIndent === undefined) {
				if (lead <= indent) break;
				blockIndent = lead;
			}
			if (lead < blockIndent) break;
			lines.push(raw.slice(blockIndent));
		}
		this.i = j;
		let trailing = 0;
		while (lines.length > 0 && lines[lines.length - 1] === '') {
			lines.pop();
			trailing++;
		}
		// Blank lines after the block belong to the document, not the value.
		this.i = j - trailing;
		let content: string;
		if (style === '|') content = lines.join('\n');
		else {
			content = '';
			for (let k = 0; k < lines.length; k++) {
				const line = lines[k];
				if (line === '') content += '\n';
				else if (k > 0 && lines[k - 1] !== '') content += ' ' + line;
				else content += line;
			}
		}
		if (content === '') return '';
		if (chomp === '-') return content;
		if (chomp === '+') return content + '\n'.repeat(trailing + 1);
		return content + '\n';
	}
}

/** Maps an offset in concatenated flow text back to a row and column. */
function locate(
	starts: readonly { offset: number; row: Row; column: number }[],
	offset: number
): { row: Row; column: number } {
	let at = starts[0];
	for (const s of starts) if (s.offset <= offset) at = s;
	return { row: at.row, column: at.column + (offset - at.offset) };
}

function isSequenceItem(body: string): boolean {
	return body === '-' || body.startsWith('- ');
}

/** Splits `key: rest` (plain or quoted key); undefined when the line is not a mapping entry. */
function splitKey(body: string): { key: string; rest: string; restColumn: number } | undefined {
	let key: string;
	let after: number;
	if (body[0] === '"' || body[0] === "'") {
		let quoted: { value: string; end: number };
		try {
			quoted = readQuoted(body, 0, (reason) => {
				throw new Error(reason);
			});
		} catch {
			return undefined;
		}
		key = quoted.value;
		after = quoted.end;
	} else {
		const m = /^([^\s:#][^:]*?):(?=\s|$)/.exec(body);
		if (!m || !PLAIN_KEY.test(m[1])) return undefined;
		key = m[1];
		after = m[1].length;
	}
	if (body[after] !== ':' || (body[after + 1] !== undefined && body[after + 1] !== ' ')) {
		return undefined;
	}
	const restRaw = body.slice(after + 1);
	const rest = restRaw.replace(/^ +/, '');
	return { key, rest, restColumn: after + 2 + (restRaw.length - rest.length) };
}

/**
 * Parses YAML text in the supported subset.
 * @param text the YAML (no `---` markers)
 * @param firstLine line number of the first line of `text` in its file, for error messages
 * @throws {YamlError}
 */
export function parseYaml(text: string, firstLine = 1): YamlValue {
	const rows: Row[] = text
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((raw, index) => {
			const indent = /^ */.exec(raw)?.[0].length ?? 0;
			const body = raw.slice(indent).replace(/[ \t]+$/, '');
			const blank = body === '' || body.startsWith('#');
			return { line: firstLine + index, raw, indent, body, blank, tab: raw[indent] === '\t' };
		});
	return new BlockParser(rows).document();
}

/** A unit file split into its front-matter and body. */
export interface FrontMatterSplit {
	readonly yaml: string;
	/** Line number of the first YAML line (2). */
	readonly yamlLine: number;
	readonly body: string;
	/** Line number where the body starts. */
	readonly bodyLine: number;
}

/**
 * Splits a Markdown file that starts with `---` front-matter.
 * @throws {YamlError} when the file has no front-matter or it is not closed
 */
export function splitFrontMatter(text: string): FrontMatterSplit {
	const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	const lines = normalized.split('\n');
	if (lines[0] !== '---') throw new YamlError('the file must start with a "---" line', 1, 1);
	const close = lines.indexOf('---', 1);
	if (close < 0) throw new YamlError('the front-matter is not closed with a "---" line', 1, 1);
	return {
		yaml: lines.slice(1, close).join('\n'),
		yamlLine: 2,
		body: lines
			.slice(close + 1)
			.join('\n')
			.replace(/^\n+/, ''),
		bodyLine: close + 2
	};
}

/**
 * Parses the front-matter of a Markdown file into a mapping and returns the body.
 * @throws {YamlError}
 */
export function parseFrontMatter(text: string): { data: YamlMap; body: string; bodyLine: number } {
	const split = splitFrontMatter(text);
	const data = parseYaml(split.yaml, split.yamlLine);
	if (data === null || typeof data !== 'object' || Array.isArray(data)) {
		throw new YamlError('the front-matter must be a "key: value" mapping', split.yamlLine, 1);
	}
	return { data, body: split.body, bodyLine: split.bodyLine };
}
