// The frozen system prefix: deterministic, free of anything per-request, and every key combo it
// (or a tool description) shows as an example is valid key grammar, so the model learns the right
// spelling and the chat can turn its combos into keycaps.
import { describe, expect, it } from 'vitest';
import { tryParseKeys } from '$lib/core/opxy';
import { CONDUCTOR_ROLE, deviceFacts, MANUAL_EXPERT_ROLE, systemBlocks } from './prompts';
import { describeDevice, deviceSnapshot } from './device-state';
import { CONDUCTOR_TOOLS } from './tools';

function examples(text: string): string[] {
	const backticked = [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
	const quoted = [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
	return [...backticked, ...quoted].filter((s) => /\+|→|^hold |^turn |^click /.test(s));
}

describe('prompts', () => {
	it('are byte-stable and carry no dates or device state', () => {
		expect(deviceFacts()).toBe(deviceFacts());
		const blocks = systemBlocks(CONDUCTOR_ROLE, 'MANUAL');
		expect(JSON.stringify(blocks)).toBe(JSON.stringify(systemBlocks(CONDUCTOR_ROLE, 'MANUAL')));
		expect(blocks.map((b) => b.cache_control ?? null)).toEqual([null, null, { type: 'ephemeral' }]);
		const all = CONDUCTOR_ROLE + deviceFacts();
		expect(all).not.toMatch(/20\d\d-\d\d-\d\d|connected,|measured/);
	});

	it('state the verified device facts', () => {
		const facts = deviceFacts();
		for (const fact of [
			'BPM = 2 × value, 40–220',
			'CC9',
			'CC102 on channel 1 (zero-based)',
			'CC106/107 do nothing',
			'53–76'
		]) {
			expect(facts).toContain(fact);
		}
		expect(facts).toContain('16 FX II (default reverb)');
	});

	it('only show key combos that parse', () => {
		const texts = [
			CONDUCTOR_ROLE,
			MANUAL_EXPERT_ROLE,
			deviceFacts(),
			...CONDUCTOR_TOOLS.map((t) => t.description)
		];
		// Grammar descriptions use variables ("a + b", "hold x"); skip those.
		const combos = texts.flatMap(examples).filter((c) => !/(^|\s)[abx](\s|$)/.test(c));
		expect(combos.length).toBeGreaterThan(5);
		for (const combo of combos) {
			expect(tryParseKeys(combo).ok, combo).toBe(true);
		}
	});
});

describe('device notes', () => {
	it('say plainly when nothing is connected', () => {
		expect(describeDevice(deviceSnapshot(null))).toMatch(/No OP-XY is connected/);
	});
});
