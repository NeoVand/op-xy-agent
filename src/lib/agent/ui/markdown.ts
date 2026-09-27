/**
 * Markdown-lite for agent answers: paragraphs, line breaks, headings, lists, quotes, fenced code,
 * simple pipe tables, strong/emphasis, inline code and links. It produces a small AST that Svelte
 * renders with components; model text is never turned into HTML (no `{@html}`), so nothing the model
 * writes can inject markup or script.
 *
 * Inline code that parses as a key combo in the manual's key grammar (`shift + M1`) becomes a
 * `keys` node, which the chat draws as keycaps that animate the replica when clicked. Citations of
 * our manual's units (`[sequencer.parameter-locks]`, `[sequencer.parameter-locks#rotate]`, several
 * separated by commas) become `cite` nodes, which the chat links to the unit's source.
 */

/** Inline content. */
export type Inline =
	| { readonly t: 'text'; readonly v: string }
	| { readonly t: 'strong'; readonly c: readonly Inline[] }
	| { readonly t: 'em'; readonly c: readonly Inline[] }
	| { readonly t: 'code'; readonly v: string }
	| { readonly t: 'keys'; readonly v: string }
	| { readonly t: 'link'; readonly href: string; readonly c: readonly Inline[] }
	| { readonly t: 'cite'; readonly ref: string }
	| { readonly t: 'br' };

/** One list item; `depth` 1 for indented items. */
export interface ListItem {
	readonly depth: number;
	readonly c: readonly Inline[];
}

/** Block content. */
export type Block =
	| { readonly t: 'p'; readonly c: readonly Inline[] }
	| { readonly t: 'h'; readonly level: 1 | 2 | 3; readonly c: readonly Inline[] }
	| {
			readonly t: 'list';
			readonly ordered: boolean;
			readonly start: number;
			readonly items: readonly ListItem[];
	  }
	| { readonly t: 'code'; readonly lang: string; readonly v: string }
	| { readonly t: 'quote'; readonly c: readonly Inline[] }
	| {
			readonly t: 'table';
			readonly head: readonly (readonly Inline[])[];
			readonly rows: readonly (readonly (readonly Inline[])[])[];
	  }
	| { readonly t: 'hr' };

/** Parser options. */
export interface MarkdownOptions {
	/** Decides whether an inline code span is a key combo. */
	readonly isKeys?: (code: string) => boolean;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const LIST_ITEM = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function isBlockStart(line: string, next: string | undefined): boolean {
	return (
		FENCE.test(line) ||
		HEADING.test(line) ||
		RULE.test(line) ||
		LIST_ITEM.test(line) ||
		QUOTE.test(line) ||
		(line.includes('|') && next !== undefined && TABLE_SEPARATOR.test(next))
	);
}

function splitRow(line: string): string[] {
	let row = line.trim();
	if (row.startsWith('|')) row = row.slice(1);
	if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
	const cells: string[] = [];
	let current = '';
	for (let i = 0; i < row.length; i++) {
		if (row[i] === '\\' && row[i + 1] === '|') {
			current += '|';
			i++;
		} else if (row[i] === '|') {
			cells.push(current.trim());
			current = '';
		} else {
			current += row[i];
		}
	}
	cells.push(current.trim());
	return cells;
}

/** Parses markdown-lite into blocks. */
export function parseMarkdown(source: string, options: MarkdownOptions = {}): Block[] {
	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	const inline = (text: string) => parseInline(text, options);
	const blocks: Block[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (line.trim() === '') {
			i++;
			continue;
		}
		const fence = FENCE.exec(line);
		if (fence) {
			const marker = fence[1];
			const body: string[] = [];
			i++;
			while (i < lines.length && !lines[i].trim().startsWith(marker)) body.push(lines[i++]);
			i++; // closing fence (or end of text while streaming)
			blocks.push({ t: 'code', lang: fence[2], v: body.join('\n') });
			continue;
		}
		const heading = HEADING.exec(line);
		if (heading) {
			blocks.push({
				t: 'h',
				level: Math.min(3, heading[1].length) as 1 | 2 | 3,
				c: inline(heading[2])
			});
			i++;
			continue;
		}
		if (RULE.test(line)) {
			blocks.push({ t: 'hr' });
			i++;
			continue;
		}
		if (line.includes('|') && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
			const head = splitRow(line).map(inline);
			const rows: Inline[][][] = [];
			i += 2;
			while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
				rows.push(splitRow(lines[i]).map(inline));
				i++;
			}
			blocks.push({ t: 'table', head, rows });
			continue;
		}
		const item = LIST_ITEM.exec(line);
		if (item) {
			const ordered = /\d/.test(item[2]);
			const start = ordered ? Number.parseInt(item[2], 10) : 1;
			const baseIndent = item[1].length;
			const items: { depth: number; text: string }[] = [];
			while (i < lines.length) {
				const current = lines[i];
				const match = LIST_ITEM.exec(current);
				if (match) {
					const matchOrdered = /\d/.test(match[2]);
					const indent = match[1].length;
					if (indent <= baseIndent && matchOrdered !== ordered) break;
					items.push({ depth: indent > baseIndent ? 1 : 0, text: match[3] });
					i++;
				} else if (
					current.trim() !== '' &&
					items.length > 0 &&
					!isBlockStart(current, lines[i + 1])
				) {
					// An indented line, or a lazy continuation of the item's paragraph.
					items[items.length - 1].text += `\n${current.trim()}`;
					i++;
				} else {
					break;
				}
			}
			blocks.push({
				t: 'list',
				ordered,
				start,
				items: items.map((it) => ({ depth: it.depth, c: inline(it.text) }))
			});
			continue;
		}
		if (QUOTE.test(line)) {
			const body: string[] = [];
			while (i < lines.length && QUOTE.test(lines[i])) {
				body.push((QUOTE.exec(lines[i]) as RegExpExecArray)[1]);
				i++;
			}
			blocks.push({ t: 'quote', c: inline(body.join('\n')) });
			continue;
		}
		const paragraph: string[] = [line];
		i++;
		while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i], lines[i + 1])) {
			paragraph.push(lines[i]);
			i++;
		}
		blocks.push({ t: 'p', c: inline(paragraph.join('\n')) });
	}
	return blocks;
}

const ESCAPABLE = /[\\`*_[\]()#>!|~+-]/;
/** A citation of a unit of our manual: `area.slug` or `area.slug#fact-id`. */
const CITE_REF = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:#[a-z0-9-]+)?$/;
const SAFE_URL = /^(https?:\/\/|mailto:)/i;
const BARE_URL = /^https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?'"*_]/;

function findClosing(text: string, marker: string, from: number): number {
	let index = text.indexOf(marker, from);
	while (index >= 0) {
		if (text[index - 1] !== '\\') return index;
		index = text.indexOf(marker, index + marker.length);
	}
	return -1;
}

/** Parses inline markdown. */
export function parseInline(text: string, options: MarkdownOptions = {}): Inline[] {
	const out: Inline[] = [];
	let buffer = '';
	const flush = () => {
		if (buffer) out.push({ t: 'text', v: buffer });
		buffer = '';
	};
	let i = 0;
	while (i < text.length) {
		const ch = text[i];
		if (ch === '\\' && i + 1 < text.length && ESCAPABLE.test(text[i + 1])) {
			buffer += text[i + 1];
			i += 2;
			continue;
		}
		if (ch === '`') {
			let run = 1;
			while (text[i + run] === '`') run++;
			const marker = '`'.repeat(run);
			const close = text.indexOf(marker, i + run);
			if (close > i + run) {
				flush();
				let code = text.slice(i + run, close);
				if (code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
				out.push(
					options.isKeys?.(code.trim()) ? { t: 'keys', v: code.trim() } : { t: 'code', v: code }
				);
				i = close + run;
				continue;
			}
			buffer += marker;
			i += run;
			continue;
		}
		if (ch === '[') {
			const closeText = findClosing(text, ']', i + 1);
			if (closeText > i && text[closeText + 1] !== '(') {
				const refs = text
					.slice(i + 1, closeText)
					.split(/\s*[,;]\s*/)
					.map((r) => r.trim());
				if (refs.length <= 6 && refs.every((r) => CITE_REF.test(r))) {
					flush();
					for (const ref of refs) out.push({ t: 'cite', ref });
					i = closeText + 1;
					continue;
				}
			}
			if (closeText > i && text[closeText + 1] === '(') {
				const closeUrl = text.indexOf(')', closeText + 2);
				const url = closeUrl > 0 ? text.slice(closeText + 2, closeUrl).trim() : '';
				if (closeUrl > 0 && SAFE_URL.test(url) && !/\s/.test(url)) {
					flush();
					out.push({ t: 'link', href: url, c: parseInline(text.slice(i + 1, closeText), options) });
					i = closeUrl + 1;
					continue;
				}
			}
		}
		if ((ch === '*' || ch === '_') && text[i + 1] === ch) {
			const marker = ch + ch;
			const close = findClosing(text, marker, i + 2);
			if (close > i + 2) {
				flush();
				out.push({ t: 'strong', c: parseInline(text.slice(i + 2, close), options) });
				i = close + 2;
				continue;
			}
		}
		if (ch === '*' || ch === '_') {
			const before = text[i - 1] ?? ' ';
			const after = text[i + 1] ?? ' ';
			const opens = after !== ' ' && after !== ch && (ch === '*' || !/[\p{L}\p{N}]/u.test(before));
			if (opens) {
				let close = findClosing(text, ch, i + 1);
				while (close > 0 && text[close + 1] === ch) close = findClosing(text, ch, close + 2);
				const valid =
					close > i + 1 &&
					text[close - 1] !== ' ' &&
					(ch === '*' || !/[\p{L}\p{N}]/u.test(text[close + 1] ?? ' '));
				if (valid) {
					flush();
					out.push({ t: 'em', c: parseInline(text.slice(i + 1, close), options) });
					i = close + 1;
					continue;
				}
			}
		}
		if ((ch === 'h' || ch === 'H') && /[\s(]|^$/.test(text[i - 1] ?? '')) {
			const match = BARE_URL.exec(text.slice(i));
			if (match) {
				flush();
				out.push({ t: 'link', href: match[0], c: [{ t: 'text', v: match[0] }] });
				i += match[0].length;
				continue;
			}
		}
		if (ch === '\n') {
			flush();
			out.push({ t: 'br' });
			i++;
			continue;
		}
		buffer += ch;
		i++;
	}
	flush();
	return out;
}

/** Plain text of inline nodes (for accessible names and copying). */
export function inlineText(nodes: readonly Inline[]): string {
	return nodes
		.map((node) => {
			switch (node.t) {
				case 'text':
				case 'code':
				case 'keys':
					return node.v;
				case 'br':
					return '\n';
				case 'cite':
					return `[${node.ref}]`;
				default:
					return inlineText(node.c);
			}
		})
		.join('');
}

/**
 * The spelling the `Kbd` component draws best: encoders as knobs (`E2` → `encoder 2`), the minus
 * and plus keys as their glyphs.
 */
export function comboForDisplay(keys: string): string {
	return keys
		.replace(/\bE([1-4])\b/g, 'encoder $1')
		.replace(/\[\+\]/g, 'plus')
		.replace(/\[-\]/g, 'minus');
}
