/**
 * The command palette's state, one for the app (root layout): whether it is open, and the
 * commands it offers, from the site (its pages, the manual) and from the page shown (the home
 * page's replica and agent), which adds its own while it is mounted.
 */
import { createContext } from 'svelte';
import { rank, type PaletteCommand, type PaletteSource } from './palette';

export class PaletteState {
	open = $state(false);
	/** What is typed, and the row chosen; each opening starts empty, at the top. */
	query = $state('');
	active = $state(0);
	#sources = $state.raw<readonly PaletteSource[]>([]);
	#shown: readonly (() => void)[] = [];

	/** Adds commands (a page's first, the site's after); returns what takes them away. */
	add(source: PaletteSource, first = false): () => void {
		this.#sources = first ? [source, ...this.#sources] : [...this.#sources, source];
		return () => {
			this.#sources = this.#sources.filter((s) => s !== source);
		};
	}

	/** Calls `listener` each time the palette opens (to load what it lists lazily); returns remove. */
	onShow(listener: () => void): () => void {
		this.#shown = [...this.#shown, listener];
		return () => {
			this.#shown = this.#shown.filter((l) => l !== listener);
		};
	}

	/** The rows for what is typed. */
	commands(query: string): PaletteCommand[] {
		return rank(
			query,
			this.#sources.flatMap((source) => source(query))
		);
	}

	show(): void {
		if (this.open) return;
		this.open = true;
		for (const listener of this.#shown) listener();
	}

	hide(): void {
		this.open = false;
		this.query = '';
		this.active = 0;
	}

	toggle(): void {
		if (this.open) this.hide();
		else this.show();
	}
}

export const [getPaletteState, setPaletteState] = createContext<PaletteState>();
