// BYO keys: provider by prefix, validation, local storage under one named entry, hints instead of
// values, and no way to serialise a key by accident.
import { describe, expect, it } from 'vitest';
import {
	checkKey,
	detectProvider,
	KEY_STORAGE_ENTRY,
	keyHint,
	KeyStore,
	type KeyStorage
} from './keys.svelte';

// Fake keys are assembled at runtime so secret scanners never see a key-shaped literal.
const fake = (prefix: string) => prefix + 'x'.repeat(40);
const ANTHROPIC = fake('sk-ant-' + 'api03-');
const OPENAI = fake('sk-' + 'proj-');

function memoryStorage(): KeyStorage & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => void data.set(key, value),
		removeItem: (key) => void data.delete(key)
	};
}

describe('detectProvider', () => {
	it('tells providers apart by prefix, never by label', () => {
		expect(detectProvider(ANTHROPIC)).toBe('anthropic');
		expect(detectProvider(`  ${ANTHROPIC}\n`)).toBe('anthropic');
		expect(detectProvider(OPENAI)).toBe('openai');
		expect(detectProvider('sk-abcdefghijklmnopqrstuvwxyz')).toBe('openai');
		expect(detectProvider('hello')).toBeNull();
		expect(detectProvider('')).toBeNull();
	});
});

describe('checkKey', () => {
	it.each([
		['', 'empty'],
		['sk-ant-api03 abc def', 'whitespace'],
		['AIzaSyExampleGoogleKey000000000', 'unknown-provider'],
		[fake('sk-ant-' + 'admin01-'), 'admin-key'],
		['sk-ant-abc', 'too-short']
	])('refuses %j (%s)', (key, problem) => {
		const result = checkKey(key);
		expect(result.ok).toBe(false);
		expect(!result.ok && result.problem).toBe(problem);
	});

	it('accepts real-looking keys', () => {
		expect(checkKey(ANTHROPIC)).toEqual({ ok: true, provider: 'anthropic' });
		expect(checkKey(OPENAI)).toEqual({ ok: true, provider: 'openai' });
	});
});

describe('KeyStore', () => {
	it('saves, reloads and removes keys in one clearly named entry', () => {
		const storage = memoryStorage();
		const store = new KeyStore(() => storage);
		store.load();
		expect(store.loaded).toBe(true);
		expect(store.has('anthropic')).toBe(false);
		expect(store.save(` ${ANTHROPIC} `)).toEqual({ ok: true, provider: 'anthropic' });
		expect(store.save(OPENAI)).toEqual({ ok: true, provider: 'openai' });
		expect([...storage.data.keys()]).toEqual([KEY_STORAGE_ENTRY]);

		const again = new KeyStore(() => storage);
		again.load();
		expect(again.get('anthropic')).toBe(ANTHROPIC);
		expect(again.get('openai')).toBe(OPENAI);
		again.remove('anthropic');
		again.remove('openai');
		expect(storage.data.size).toBe(0);
	});

	it('ignores corrupt or mislabelled storage', () => {
		const storage = memoryStorage();
		storage.data.set(KEY_STORAGE_ENTRY, JSON.stringify({ anthropic: OPENAI, openai: 'nope' }));
		const store = new KeyStore(() => storage);
		store.load();
		expect(store.has('anthropic')).toBe(false);
		expect(store.has('openai')).toBe(false);
		storage.data.set(KEY_STORAGE_ENTRY, '{not json');
		store.load();
		expect(store.loaded).toBe(true);
	});

	it('works without storage (the key lasts for the page)', () => {
		const store = new KeyStore(() => null);
		store.load();
		expect(store.save(ANTHROPIC).ok).toBe(true);
		expect(store.get('anthropic')).toBe(ANTHROPIC);
	});

	it('never shows or serialises the key itself', () => {
		const store = new KeyStore(() => memoryStorage());
		store.load();
		store.save(ANTHROPIC);
		expect(store.hint('anthropic')).toBe('sk-ant-…xxxx');
		expect(keyHint(OPENAI)).toBe('sk-proj-…xxxx');
		expect(JSON.stringify(store)).toBe('{"anthropic":true,"openai":false}');
		expect(String(store)).not.toContain(ANTHROPIC);
		expect(`${store}`).not.toContain('xxxxxxxxxx');
	});
});
