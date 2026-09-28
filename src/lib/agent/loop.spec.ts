// Request building and transcript rendering for one loop step: model-specific features, system
// messages kept only where the API accepts them, and fallback-safe echoing of assistant content.
import type {
	BetaContentBlock,
	BetaMessageParam
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { describe, expect, it } from 'vitest';
import {
	buildRequest,
	createQuirks,
	renderMessages,
	runawayCut,
	sanitizeAssistantContent
} from './loop';
import { createConductorRegistry } from './tools';

const system = [
	{ type: 'text' as const, text: 'role' },
	{ type: 'text' as const, text: 'manual', cache_control: { type: 'ephemeral' as const } }
];
const user = (text: string): BetaMessageParam => ({
	role: 'user',
	content: [{ type: 'text', text }]
});
const note = (text: string): BetaMessageParam => ({ role: 'system', content: text });
const assistant = (text: string): BetaMessageParam => ({
	role: 'assistant',
	content: [{ type: 'text', text }]
});

describe('renderMessages', () => {
	it('keeps a system message that follows a user turn and precedes the answer', () => {
		const messages = [user('hi'), note('device'), assistant('hello'), user('next'), note('update')];
		expect(renderMessages(messages, true).map((m) => m.role)).toEqual([
			'user',
			'system',
			'assistant',
			'user',
			'system'
		]);
	});

	it('turns system messages into reminders where the API would refuse them', () => {
		const messages = [user('hi'), note('device'), user('again')];
		const rendered = renderMessages(messages, true);
		expect(rendered.map((m) => m.role)).toEqual(['user', 'user', 'user']);
		expect(JSON.stringify(rendered[1].content)).toContain(
			'<system-reminder>\\ndevice\\n</system-reminder>'
		);
		expect(renderMessages([user('hi'), note('device')], false)[1].role).toBe('user');
	});

	it('is deterministic (stable cache prefix)', () => {
		const messages = [user('a'), note('b'), assistant('c')];
		expect(JSON.stringify(renderMessages(messages, false))).toBe(
			JSON.stringify(renderMessages(messages, false))
		);
	});
});

describe('buildRequest', () => {
	const registry = createConductorRegistry();

	it('uses every Opus 5.5 feature and no forced tool choice', () => {
		const params = buildRequest(
			{ model: 'claude-opus-5-5', system, registry, effort: 'medium', maxTokens: 32_000 },
			[user('hi')]
		);
		expect(params).toMatchObject({
			model: 'claude-opus-5-5',
			max_tokens: 32_000,
			thinking: { type: 'adaptive', display: 'updates' },
			output_config: { effort: 'medium' },
			fallbacks: 'default',
			cache_control: { type: 'ephemeral' },
			betas: ['thinking-display-updates-2026-08-18', 'server-side-fallback-2026-07-01']
		});
		expect(params.tool_choice).toBeUndefined();
		expect(params.tools?.length).toBe(22);
	});

	it('omits what Haiku 4.5 does not accept and caps max_tokens', () => {
		const params = buildRequest(
			{ model: 'claude-haiku-4-5', system, registry, effort: 'low', maxTokens: 500_000 },
			[user('hi')]
		);
		expect(params.thinking).toBeUndefined();
		expect(params.output_config).toBeUndefined();
		expect(params.fallbacks).toBeUndefined();
		expect(params.betas).toBeUndefined();
		expect(params.max_tokens).toBe(64_000);
	});

	it('stops using features a model rejected at runtime', () => {
		const quirks = createQuirks();
		quirks.noFallbacks.add('claude-opus-5-5');
		quirks.noThinkingUpdates.add('claude-opus-5-5');
		const params = buildRequest(
			{ model: 'claude-opus-5-5', system, registry, effort: null, maxTokens: 1_000, quirks },
			[user('hi')]
		);
		expect(params.fallbacks).toBeUndefined();
		expect(params.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
		expect(params.betas).toBeUndefined();
		expect(params.output_config).toBeUndefined();
	});
});

describe('sanitizeAssistantContent', () => {
	it('drops model-internal blocks before the last fallback block only', () => {
		const content = [
			{ type: 'thinking', thinking: 'x', signature: 's' },
			{ type: 'text', text: 'partial', citations: null },
			{ type: 'tool_use', id: 't1', name: 'panic', input: {} },
			{ type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' } },
			{ type: 'thinking', thinking: 'y', signature: 's2' },
			{ type: 'text', text: 'rest', citations: null }
		] as unknown as BetaContentBlock[];
		expect(sanitizeAssistantContent(content).map((b) => b.type)).toEqual([
			'text',
			'fallback',
			'thinking',
			'text'
		]);
		const plain = content.filter((b) => b.type !== 'fallback');
		expect(sanitizeAssistantContent(plain)).toEqual(plain);
	});
});

describe('runawayCut', () => {
	it('cuts tool-call markup written as text at the start of its line', () => {
		const answer = 'Use the master page.\n\n';
		expect(runawayCut(`${answer}<invoke name="show_on_replica">\n<parameter name="keys">`)).toBe(
			answer.length
		);
		expect(runawayCut('Done. <function_calls>')).toBe('Done. '.length);
	});

	it('cuts a passage repeated over and over before its first repetition', () => {
		const intro = 'Here is how it works. '.repeat(3);
		const loop = 'Press mix, then M4, then turn E1 to set the percussion group level. '.repeat(3);
		const text = intro + loop.repeat(6);
		const cut = runawayCut(text);
		expect(cut).toBeGreaterThanOrEqual(intro.length);
		expect(cut).toBeLessThan(intro.length + loop.length);
	});

	it('leaves ordinary answers alone', () => {
		const answer = [
			'Press `tempo`, then `turn E1` to set the bpm (40 < bpm < 220).',
			'1. Hold `shift` and press `M1`.',
			'2. Turn E1 to pick an engine.',
			'Step 1 flashes, step 2 flashes, step 3 flashes: that is the count-in.'
		].join('\n');
		expect(runawayCut(answer)).toBe(-1);
		expect(runawayCut(answer.repeat(2))).toBe(-1);
	});
});
