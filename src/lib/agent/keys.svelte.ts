/**
 * Bring-your-own API keys (docs/research/70-agent-harness.md §9).
 *
 * - The provider is told apart by the key's prefix: `sk-ant-` is Anthropic; `sk-proj-` or another
 *   `sk-` is OpenAI (kept for realtime voice, which comes later). The owner's own `.env` once had
 *   the two labels swapped, which is why nothing here trusts a label.
 * - Keys are stored only in this browser, in `localStorage` under one clearly named entry
 *   (`opxy:agent-keys`), and are sent only to their provider, by the provider's client.
 * - Keys are never logged or rendered: the UI shows a hint (`sk-ant-…a1b2`), and `toJSON` /
 *   `toString` hide them so an accidental serialisation cannot leak one.
 */

/** Which provider a key belongs to. */
export type KeyProvider = 'anthropic' | 'openai';

/** The localStorage entry holding the keys. */
export const KEY_STORAGE_ENTRY = 'opxy:agent-keys';

/** What `localStorage` offers (injectable for tests). */
export interface KeyStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/** Why a pasted key was not saved. */
export type KeyProblem = 'empty' | 'whitespace' | 'unknown-provider' | 'admin-key' | 'too-short';

/** Outcome of {@link KeyStore.save}. */
export type KeySaveResult =
	| { readonly ok: true; readonly provider: KeyProvider }
	| { readonly ok: false; readonly problem: KeyProblem; readonly message: string };

const MESSAGES: Record<KeyProblem, string> = {
	empty: 'Paste a key first.',
	whitespace: 'That key contains spaces or line breaks; copy it again.',
	'unknown-provider': 'That does not look like an Anthropic (sk-ant-…) or OpenAI (sk-…) key.',
	'admin-key': 'That is an Anthropic Admin key; the agent needs a regular API key (sk-ant-api…).',
	'too-short': 'That key looks cut off; copy it again.'
};

/**
 * The provider a key belongs to, by prefix; null for anything else. Anthropic keys win over the
 * generic OpenAI `sk-` prefix.
 */
export function detectProvider(key: string): KeyProvider | null {
	const k = key.trim();
	if (k.startsWith('sk-ant-')) return 'anthropic';
	if (k.startsWith('sk-')) return 'openai';
	return null;
}

/** Checks a pasted key and names its provider. */
export function checkKey(raw: string): KeySaveResult {
	const key = raw.trim();
	if (!key) return { ok: false, problem: 'empty', message: MESSAGES.empty };
	if (/\s/.test(key)) return { ok: false, problem: 'whitespace', message: MESSAGES.whitespace };
	const provider = detectProvider(key);
	if (!provider)
		return { ok: false, problem: 'unknown-provider', message: MESSAGES['unknown-provider'] };
	if (key.startsWith('sk-ant-admin'))
		return { ok: false, problem: 'admin-key', message: MESSAGES['admin-key'] };
	if (key.length < 24) return { ok: false, problem: 'too-short', message: MESSAGES['too-short'] };
	return { ok: true, provider };
}

/** A key reduced to something safe to show: its prefix and last four characters. */
export function keyHint(key: string): string {
	const prefix = key.startsWith('sk-ant-')
		? 'sk-ant-'
		: key.startsWith('sk-proj-')
			? 'sk-proj-'
			: 'sk-';
	return `${prefix}…${key.slice(-4)}`;
}

type StoredKeys = Partial<Record<KeyProvider, string>>;

/** `localStorage`, when the browser offers it and allows access. */
export function browserKeyStorage(): KeyStorage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

/** The user's keys, as reactive state. Call `load()` in `onMount`. */
export class KeyStore {
	#keys: StoredKeys = $state({});
	#loaded = $state(false);
	readonly #storage: () => KeyStorage | null;

	constructor(storage: () => KeyStorage | null = browserKeyStorage) {
		this.#storage = storage;
	}

	/** True once `load()` ran (so "no key" is known, not just not yet read). */
	get loaded(): boolean {
		return this.#loaded;
	}

	/** Reads the keys saved in this browser. */
	load(): void {
		const storage = this.#storage();
		let keys: StoredKeys = {};
		try {
			const raw = storage?.getItem(KEY_STORAGE_ENTRY);
			if (raw) {
				const parsed = JSON.parse(raw) as Record<string, unknown>;
				for (const provider of ['anthropic', 'openai'] as const) {
					const value = parsed[provider];
					if (typeof value === 'string' && detectProvider(value) === provider)
						keys[provider] = value;
				}
			}
		} catch {
			keys = {};
		}
		this.#keys = keys;
		this.#loaded = true;
	}

	/** Validates a pasted key, detects its provider and saves it in this browser. */
	save(raw: string): KeySaveResult {
		const result = checkKey(raw);
		if (!result.ok) return result;
		this.#keys = { ...this.#keys, [result.provider]: raw.trim() };
		this.#persist();
		return result;
	}

	/** Removes a provider's key from this browser. */
	remove(provider: KeyProvider): void {
		const next = { ...this.#keys };
		delete next[provider];
		this.#keys = next;
		this.#persist();
	}

	/** The key, for handing to that provider's client only. */
	get(provider: KeyProvider): string | null {
		return this.#keys[provider] ?? null;
	}

	has(provider: KeyProvider): boolean {
		return this.#keys[provider] !== undefined;
	}

	/** `sk-ant-…a1b2`, or null. */
	hint(provider: KeyProvider): string | null {
		const key = this.#keys[provider];
		return key ? keyHint(key) : null;
	}

	/** Never serialises the keys themselves. */
	toJSON(): Record<KeyProvider, boolean> {
		return { anthropic: this.has('anthropic'), openai: this.has('openai') };
	}

	toString(): string {
		return `KeyStore(${JSON.stringify(this.toJSON())})`;
	}

	#persist(): void {
		const storage = this.#storage();
		if (!storage) return;
		try {
			if (Object.keys(this.#keys).length === 0) storage.removeItem(KEY_STORAGE_ENTRY);
			else storage.setItem(KEY_STORAGE_ENTRY, JSON.stringify(this.#keys));
		} catch {
			// Storage blocked or full: the key still works for this page session.
		}
	}
}
