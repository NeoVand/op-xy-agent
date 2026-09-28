// make_kit: a kit from a style and typed voices, rendered by our code and left in the preset
// maker's inbox; the model only describes sounds.
import { describe, expect, it } from 'vitest';
import type { SampleInput } from '$lib/core/presets';
import { createConductorRegistry } from './index';
import type { PresetInboxHost, ToolContext, ToolResult } from './define';
import { makeKitTool } from './presets';

function inbox() {
	const drafts: { name: string; samples: readonly SampleInput[] }[] = [];
	const host: PresetInboxHost = { put: (draft) => drafts.push(draft), href: '/presets' };
	return { host, drafts };
}

const context = (presets: PresetInboxHost | null) =>
	({ toolCallId: 'toolu_k', agent: 'conductor', env: { presets } }) as unknown as ToolContext;
const run = (input: unknown, presets: PresetInboxHost | null): Promise<ToolResult> =>
	makeKitTool.run(makeKitTool.input.parse(input), context(presets));
const voice = (key: number, type: string, extra: Record<string, number> = {}) => ({
	key,
	type,
	...extra
});

describe('make_kit', () => {
	it('starts from a style and puts each voice on its key, leaving the kit in the preset maker', async () => {
		const { host, drafts } = inbox();
		const result = await run(
			{ name: 'deep 909', style: '909', voices: [voice(53, 'kick', { pitch: 42, decay: 1.2 })] },
			host
		);
		expect(result.isError).toBeFalsy();
		expect(JSON.parse(String(result.content))).toMatchObject({
			kit: 'deep 909',
			keys: 24,
			preset_maker: '/presets'
		});
		const [draft] = drafts;
		expect(draft.samples.map((s) => s.key)).toEqual(Array.from({ length: 24 }, (_, i) => 53 + i));
		// the voice replaced the style's kick: 1.2 s long instead of the 909's short one
		expect(draft.samples[0].name).toBe('kick');
		expect(draft.samples[0].audio.channels[0].length).toBe(Math.ceil(1.21 * 44100));
		expect(draft.samples[1].name).toBe('909 kick');
	});

	it('makes a kit of the given voices alone', async () => {
		const { host, drafts } = inbox();
		await run({ name: 'two', voices: [voice(61, 'closed hat'), voice(53, 'kick')] }, host);
		expect(drafts[0].samples.map((s) => [s.key, s.name])).toEqual([
			[53, 'kick'],
			[61, 'closed hat']
		]);
	});

	it('says so when there is nothing to make or nowhere to leave it', async () => {
		expect((await run({ name: 'x', voices: [] }, inbox().host)).isError).toBe(true);
		expect((await run({ name: 'x', style: '808', voices: [] }, null)).isError).toBe(true);
	});

	it('refuses keys and values outside the kit, and costs no optional parameters', () => {
		expect(() => makeKitTool.input.parse({ name: 'x', voices: [voice(52, 'kick')] })).toThrow();
		expect(() =>
			makeKitTool.input.parse({ name: 'x', voices: [voice(53, 'kick', { tone: 2 })] })
		).toThrow();
		const tool = createConductorRegistry()
			.apiTools()
			.find((t) => t.name === 'make_kit')!;
		expect(JSON.stringify(tool.input_schema)).not.toContain('"required":[]');
	});
});
