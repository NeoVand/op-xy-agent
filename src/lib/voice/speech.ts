/**
 * Claude's answer, made fit to hand to the voice: plain sentences instead of markdown (the chat's
 * own parser, so it reads the answer the way the chat draws it), key combos spelled for the ear
 * ("shift plus M1"), citations, code and tables left to the screen, and cut at a sentence once it
 * is long enough for the voice to say the gist.
 */
import { tryParseKeys } from '$lib/core/opxy';
import { comboForDisplay, parseMarkdown, type Inline } from '$lib/agent/ui/markdown';

/** How much of an answer the voice gets (it says one or two sentences of it). */
export const SPOKEN_MAX_CHARS = 700;

/** Said after an answer that was cut, or that had parts only the screen can show. */
export const MORE_ON_SCREEN = 'More is on screen.';

const isKeys = (code: string) => code.length <= 80 && tryParseKeys(code).ok;

/** A key combo as it is said: `shift + M1` → "shift plus M1", `E2` → "encoder 2". */
export function spokenCombo(keys: string): string {
	return comboForDisplay(keys)
		.replace(/\s+\+\s+/g, ' plus ')
		.replace(/\s*(?:→|->)\s*/g, ', then ')
		.replace(/\s+then\s+/g, ', then ')
		.replace(/,\s*,/g, ',');
}

function spoken(nodes: readonly Inline[]): string {
	return nodes
		.map((node) => {
			switch (node.t) {
				case 'text':
					return node.v;
				case 'code':
					// An encoder on its own (`E2`) is not a combo, but it is said the same way.
					return /^E[1-4]$/.test(node.v.trim()) ? spokenCombo(node.v.trim()) : node.v;
				case 'keys':
					return spokenCombo(node.v);
				case 'br':
					return ' ';
				case 'cite':
					return '';
				default:
					return spoken(node.c);
			}
		})
		.join('');
}

/**
 * A phrase as a sentence: tidy spaces, a capital first letter (list items often start lowercase)
 * and a full stop unless it ends in punctuation already.
 */
function sentence(text: string): string {
	const line = text
		.replace(/\s+/g, ' ')
		.replace(/\s+([,.;:!?])/g, '$1')
		.trim();
	if (!line) return '';
	const capital = line.charAt(0).toUpperCase() + line.slice(1);
	return /[.!?…:]$/.test(capital) ? capital : `${capital}.`;
}

/**
 * The answer as plain spoken sentences, at most `maxChars` long (cut at a sentence end where
 * possible), ending with "More is on screen." when anything was left out.
 */
export function speakable(markdown: string, maxChars: number = SPOKEN_MAX_CHARS): string {
	const parts: string[] = [];
	let omitted = false;
	for (const block of parseMarkdown(markdown, { isKeys })) {
		switch (block.t) {
			case 'p':
			case 'quote':
			case 'h':
				parts.push(sentence(spoken(block.c)));
				break;
			case 'list':
				for (const item of block.items) parts.push(sentence(spoken(item.c)));
				break;
			case 'code':
			case 'table':
				omitted = true;
				break;
			case 'hr':
				break;
		}
	}
	let text = parts.filter(Boolean).join(' ');
	if (text.length > maxChars) {
		const cut = text.slice(0, maxChars);
		const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
		text = end > maxChars / 3 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
		omitted = true;
	}
	if (!text) return omitted ? MORE_ON_SCREEN : '';
	return omitted ? `${text} ${MORE_ON_SCREEN}` : text;
}
