/**
 * The command palette's commands and how they match what is typed (CommandPalette.svelte): every
 * word of the query must start one of the words of a command's label (or its extra words), and a
 * label that starts with the whole query comes first; a command made for the query itself (ask the
 * agent this, set the tempo to it) brings its own score. With nothing typed the palette suggests.
 */

/** Something the palette can do. */
export interface PaletteCommand {
	/** The same id twice is one row, at the better score. */
	readonly id: string;
	/** What the row says: "play", "Filter (M3)". */
	readonly label: string;
	/** More about it, quieter, after the label: "T1 pattern 1, tempo 120 → 124". */
	readonly detail?: string;
	/** Where it belongs, at the row's end: "replica", "agent", "manual", "go to". */
	readonly group: string;
	/** More words it answers to. */
	readonly keywords?: string;
	/** A key that does it too ("space"). */
	readonly hint?: string;
	/** Listed while nothing is typed. */
	readonly suggest?: boolean;
	/** A command made for this query rates itself (0–1); others are matched. */
	readonly score?: number;
	run(): void;
}

/** Commands for what is typed: a page's own, or the site's. */
export type PaletteSource = (query: string) => readonly PaletteCommand[];

/** The most rows the palette shows. */
export const MAX_ROWS = 8;

/** The words of a text, lowercased, sharps and decimals kept ("c#", "98.5"). */
export const words = (text: string): string[] =>
	text
		.toLowerCase()
		.split(/[^a-z0-9#.]+/)
		.filter(Boolean);

/** How well `query` names a command, 0 (not at all) to 1. */
export function matchScore(query: string, command: PaletteCommand): number {
	const q = words(query);
	if (q.length === 0) return 1;
	if (command.label.toLowerCase().startsWith(query.trim().toLowerCase())) return 1;
	const own = words(`${command.label} ${command.keywords ?? ''}`);
	return q.every((w) => own.some((o) => o.startsWith(w))) ? 0.8 : 0;
}

/**
 * The rows for `query`: the commands that match, best first (in their order where they tie), or
 * the suggested ones while nothing is typed.
 */
export function rank(query: string, commands: readonly PaletteCommand[]): PaletteCommand[] {
	if (words(query).length === 0) return commands.filter((c) => c.suggest).slice(0, MAX_ROWS);
	const best = new Map<string, { command: PaletteCommand; i: number; score: number }>();
	commands.forEach((command, i) => {
		const score = command.score ?? matchScore(query, command);
		const seen = best.get(command.id);
		if (score > 0 && (!seen || score > seen.score)) best.set(command.id, { command, i, score });
	});
	return [...best.values()]
		.sort((a, b) => b.score - a.score || a.i - b.i)
		.slice(0, MAX_ROWS)
		.map((row) => row.command);
}

/** Whether a query reads as something to ask rather than a command: a question, or a sentence. */
export function readsAsAsk(query: string): boolean {
	return query.trim().endsWith('?') || words(query).length >= 3;
}
