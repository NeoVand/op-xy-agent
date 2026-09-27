/**
 * The verbatim guard (docs/DECISIONS.md D2): our manual must be written in our own words, so the
 * build flags any run of {@link VERBATIM_MIN_WORDS} or more consecutive words that also appears in
 * TE's text. Comparison ignores case, punctuation and apostrophes ("OP–XY's" = "op xys"), so light
 * re-punctuation of a copied sentence is still caught. Pure: the corpus is passed in.
 */

/** A copied run must be at least this many words long to be flagged. */
export const VERBATIM_MIN_WORDS = 8;

/** One word of a text with its character span in the (NFC-normalised) text. */
export interface Word {
	readonly word: string;
	readonly start: number;
	readonly end: number;
}

const WORD = /[\p{L}\p{N}]+(?:['’ʼ][\p{L}\p{N}]+)*/gu;

/**
 * Splits text into comparison words: letters and digits only, lower case, apostrophes dropped.
 * Offsets refer to `text.normalize('NFC')`.
 */
export function words(text: string): Word[] {
	const normalized = text.normalize('NFC');
	const out: Word[] = [];
	for (const m of normalized.matchAll(WORD)) {
		out.push({
			word: m[0].toLowerCase().replace(/['’ʼ]/g, ''),
			start: m.index,
			end: m.index + m[0].length
		});
	}
	return out;
}

/** A passage of the protected corpus, e.g. one section of a guide chapter. */
export interface CorpusDocument {
	/** Where the passage lives, shown in reports (`guide/07-sequencer.md#step-sequencing`). */
	readonly id: string;
	readonly text: string;
}

/** A run of our text that also appears in the corpus. */
export interface VerbatimRun {
	/** Length in words. */
	readonly words: number;
	/** The run as written in our text. */
	readonly excerpt: string;
	/** Corpus passage where the run's first window occurs. */
	readonly match: string;
}

/** An n-gram index over the protected corpus. Build once, query every field of every unit. */
export class VerbatimIndex {
	private readonly grams = new Map<string, string>();
	private readonly allowed: readonly string[];

	/**
	 * @param corpus the protected text (TE's guide, changelog and pages)
	 * @param minWords run length that counts as copying
	 * @param allow phrases that may match anyway (e.g. a list of engine names); a run is excused
	 *   when all of its words fall inside one allowed phrase
	 */
	constructor(
		corpus: readonly CorpusDocument[],
		readonly minWords = VERBATIM_MIN_WORDS,
		allow: readonly string[] = []
	) {
		if (!Number.isInteger(minWords) || minWords < 2) {
			throw new RangeError(`minWords must be an integer >= 2, got ${minWords}`);
		}
		for (const doc of corpus) {
			const ws = words(doc.text).map((w) => w.word);
			for (let i = 0; i + minWords <= ws.length; i++) {
				const gram = ws.slice(i, i + minWords).join(' ');
				if (!this.grams.has(gram)) this.grams.set(gram, doc.id);
			}
		}
		this.allowed = allow.map(
			(phrase) =>
				` ${words(phrase)
					.map((w) => w.word)
					.join(' ')} `
		);
	}

	/** Number of distinct windows indexed (0 for an empty corpus). */
	get size(): number {
		return this.grams.size;
	}

	/** Every maximal run in `text` that the corpus also contains, in order. */
	find(text: string): VerbatimRun[] {
		const normalized = text.normalize('NFC');
		const ws = words(normalized);
		const runs: VerbatimRun[] = [];
		const n = this.minWords;
		let i = 0;
		while (i + n <= ws.length) {
			const first = this.grams.get(key(ws, i, n));
			if (first === undefined) {
				i++;
				continue;
			}
			// Extend while the next window also matches: the run covers words i … j + n - 1.
			let j = i;
			while (j + 1 + n <= ws.length && this.grams.has(key(ws, j + 1, n))) j++;
			const runWords = ws.slice(i, j + n);
			const phrase = ` ${runWords.map((w) => w.word).join(' ')} `;
			if (!this.allowed.some((allowed) => allowed.includes(phrase))) {
				runs.push({
					words: runWords.length,
					excerpt: normalized.slice(runWords[0].start, runWords[runWords.length - 1].end),
					match: first
				});
			}
			i = j + n;
		}
		return runs;
	}
}

function key(ws: readonly Word[], start: number, n: number): string {
	let out = ws[start].word;
	for (let k = start + 1; k < start + n; k++) out += ' ' + ws[k].word;
	return out;
}
