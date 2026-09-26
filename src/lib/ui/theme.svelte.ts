/**
 * App theme: `dark` ("anodised", the default) or `light` ("guide"). The theme is an attribute on
 * <html> (`data-theme`) that tokens.css keys off. A tiny inline script in src/app.html applies the
 * saved choice before first paint, so this class only has to follow and change it.
 */
import { createContext } from 'svelte';

/** Available themes. */
export type ThemeName = 'dark' | 'light';

/** localStorage key. src/app.html reads the same key before paint; keep them in sync. */
export const THEME_STORAGE_KEY = 'opxy:theme';

/** Browser chrome colour per theme (the page background). Mirrored in src/app.html. */
const THEME_COLOR: Record<ThemeName, string> = { dark: '#0f0e12', light: '#f7f5f5' };

/** Dependencies, injectable for tests. Defaults to the live document and localStorage. */
export interface ThemeEnvironment {
	root?: HTMLElement;
	storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

function isTheme(value: unknown): value is ThemeName {
	return value === 'dark' || value === 'light';
}

/** Reactive theme state. Create one in the root layout and share it with {@link setTheme}. */
export class Theme {
	/** The active theme. */
	current: ThemeName = $state('dark');

	#env: ThemeEnvironment;

	/**
	 * @param initial Theme to assume before {@link sync} runs (the server renders this one).
	 * @param env Where to read and write the theme; resolved lazily so construction is SSR-safe.
	 */
	constructor(initial: ThemeName = 'dark', env: ThemeEnvironment = {}) {
		this.current = initial;
		this.#env = env;
	}

	get #root(): HTMLElement {
		return this.#env.root ?? document.documentElement;
	}

	/** Adopt whatever the pre-paint script put on <html>. Call once in the browser (onMount). */
	sync(): void {
		const applied = this.#root.dataset.theme;
		if (isTheme(applied)) this.current = applied;
	}

	/** Switch theme, update <html> and remember the choice. */
	set(name: ThemeName): void {
		this.current = name;
		const root = this.#root;
		root.dataset.theme = name;
		root.ownerDocument
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', THEME_COLOR[name]);
		try {
			(this.#env.storage ?? localStorage).setItem(THEME_STORAGE_KEY, name);
		} catch {
			// Private mode or blocked storage: the theme still applies for this visit.
		}
	}

	/** Flip between dark and light. */
	toggle(): void {
		this.set(this.current === 'dark' ? 'light' : 'dark');
	}
}

/** Typed context for the app's {@link Theme}: `setTheme(theme)` in the layout, `getTheme()` below. */
export const [getTheme, setTheme] = createContext<Theme>();
