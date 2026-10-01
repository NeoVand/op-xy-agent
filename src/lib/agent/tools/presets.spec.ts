// make_kit: a kit from a style and typed voices, rendered by our code and left in the preset
// maker's inbox; the model only describes sounds.
import { describe, expect, it } from 'vitest';
import type { SampleInput } from '$lib/core/presets';
import { createConductorRegistry } from './index';
import type { PresetInboxHost, ToolContext, ToolResult } from './define';
import { makeKitTool } from './presets';
import { createVirtualOpxy } from '$lib/app/virtual';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';

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
		// each sound carries its voice, for the preset maker's knobs
		expect(draft.samples[0].voice).toMatchObject({ type: 'kick', pitch: 42, decay: 1.2 });
		expect(draft.samples[1].voice?.type).toBe('kick');
	});

	it('makes a kit of the given voices alone', async () => {
		const { host, drafts } = inbox();
		await run({ name: 'two', voices: [voice(61, 'closed hat'), voice(53, 'kick')] }, host);
		expect(drafts[0].samples.map((s) => [s.key, s.name])).toEqual([
			[53, 'kick'],
			[61, 'closed hat']
		]);
	});

	it('also puts the kit on a track of the replica, which then plays its sounds', async () => {
		const { host, drafts } = inbox();
		const sim = new OpxySim();
		const files = new Map<string, number>();
		const virtual = createVirtualOpxy({
			sim,
			sound: {
				available: true,
				enabled: true,
				preview: () => true,
				samples: { setFile: (id, audio) => void files.set(id, audio.channels[0].length) }
			}
		});
		const result = await makeKitTool.run(
			makeKitTool.input.parse({ name: 'punch', style: '909', voices: [], track: 3 }),
			{
				toolCallId: 'toolu_k',
				agent: 'conductor',
				env: { presets: host, virtual }
			} as unknown as ToolContext
		);
		expect(result.isError).toBeFalsy();
		expect(JSON.parse(String(result.content))).toMatchObject({
			kit: 'punch',
			on_replica: { track: 3, keys: 24, engine_changed: true, audible: true }
		});
		// each key's sound by the name write_pattern's grid takes
		const sounds = JSON.parse(String(result.content)).on_replica.sounds;
		expect(sounds.F3).toBe('909 kick');
		expect(Object.keys(sounds)).toHaveLength(24);
		// track 3 (prism in a new project) is a drum sampler now, its keys holding the kit
		expect(sim.state.tracks[2].engine).toBe('drum');
		const keys = sim.state.areas.sample.tracks[2].keys;
		expect(keys.every((k) => k?.id.startsWith('kits/punch/'))).toBe(true);
		expect(keys[0]?.name).toBe('53 909 kick.wav');
		// a beat on it reads back as the kit's sounds
		virtual.writePattern(3, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 1, note: 53, velocity: 100, length: 1 }]
		});
		expect(virtual.readPattern(3).notes[0].sound).toBe('909 kick');
		// and the browser has every sound's audio under its file's id
		expect(files.size).toBe(24);
		expect(files.get(keys[0]!.id)).toBe(drafts[0].samples[0].audio.channels[0].length);
		// a drum track keeps its own key settings: only the sounds change
		sim.state.tracks[0].drumKeys[0].tune = 5;
		await makeKitTool.run(
			makeKitTool.input.parse({ name: 'dust', style: 'lo-fi', voices: [], track: 1 }),
			{
				toolCallId: 'toolu_l',
				agent: 'conductor',
				env: { presets: host, virtual }
			} as unknown as ToolContext
		);
		expect(sim.state.tracks[0].drumKeys[0].tune).toBe(5);
		expect(sim.state.areas.sample.tracks[0].keys[0]?.id).toContain('kits/dust/');
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
			.find((t) => t.name === 'make_kit');
		expect(tool && 'input_schema' in tool && JSON.stringify(tool.input_schema)).not.toContain(
			'"required":[]'
		);
	});
});
