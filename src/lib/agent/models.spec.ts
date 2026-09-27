// The model matrix: profiles for dated ids, costs from usage (cache writes split by TTL), cache
// hit rates, and the picker built from the Models API.
import { describe, expect, it } from 'vitest';
import {
	cacheHitRate,
	canonicalModelId,
	DEFAULT_CONDUCTOR_MODEL,
	modelOptions,
	profileFor,
	usageCost
} from './models';

describe('profiles', () => {
	it('defaults the conductor to Opus 5.5 with updates, fallbacks and system messages', () => {
		expect(DEFAULT_CONDUCTOR_MODEL).toBe('claude-opus-5-5');
		expect(profileFor('claude-opus-5-5')).toMatchObject({
			thinking: 'adaptive',
			thinkingDisplay: 'updates',
			midConversationSystem: true,
			fallbacks: true
		});
		expect(profileFor('claude-sonnet-5')).toMatchObject({
			midConversationSystem: false,
			fallbacks: false
		});
	});

	it('matches dated ids and treats unknown models conservatively', () => {
		expect(canonicalModelId('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5');
		expect(profileFor('claude-haiku-4-5-20251001')).toMatchObject({
			label: 'haiku 4.5',
			thinking: 'off',
			effort: false
		});
		expect(profileFor('claude-future-9')).toMatchObject({
			pricing: null,
			thinking: 'off',
			midConversationSystem: false
		});
	});
});

describe('usageCost', () => {
	it('prices input, 5-minute and 1-hour cache writes, reads and output', () => {
		const usd = usageCost('claude-opus-5-5', {
			input_tokens: 1_000,
			output_tokens: 500,
			cache_creation_input_tokens: 3_000,
			cache_read_input_tokens: 50_000,
			cache_creation: { ephemeral_5m_input_tokens: 2_000, ephemeral_1h_input_tokens: 1_000 }
		});
		expect(usd).toBeCloseTo(
			(1_000 * 4 + 2_000 * 5 + 1_000 * 8 + 50_000 * 0.2 + 500 * 20) / 1e6,
			10
		);
	});

	it('returns null for models without a known price', () => {
		expect(usageCost('claude-future-9', { input_tokens: 1, output_tokens: 1 })).toBeNull();
	});

	it('computes the share of the prompt served from cache', () => {
		expect(cacheHitRate({ input: 10, cacheRead: 90, cacheWrite: 0 })).toBeCloseTo(0.9);
		expect(cacheHitRate({ input: 0, cacheRead: 0, cacheWrite: 0 })).toBeNull();
	});
});

describe('modelOptions', () => {
	it('orders known models first, keeps dated ids, drops non-Claude and duplicates', () => {
		const options = modelOptions([
			'gpt-x',
			'claude-zeta-1',
			'claude-sonnet-5',
			'claude-opus-5-5',
			'claude-haiku-4-5-20251001',
			'claude-sonnet-5'
		]);
		expect(options.map((o) => o.id)).toEqual([
			'claude-opus-5-5',
			'claude-sonnet-5',
			'claude-haiku-4-5-20251001',
			'claude-zeta-1'
		]);
		expect(options[0]).toMatchObject({ label: 'opus 5.5', price: '$4 / $20', known: true });
		expect(options[3]).toMatchObject({ known: false, price: null });
	});
});
