// device_map: pages and controls looked up in the committed map by the words the agent gives, in
// compact lines (encoders that do the same share one), and a plain error when nothing matches.
import { describe, expect, it } from 'vitest';
import type { MapControl } from '$lib/sim/device-map';
import type { ToolContext, ToolResult } from './define';
import { controlLines, deviceMapTool, loadDeviceMap, lookUp } from './device-map';

const ctx = { toolCallId: 'toolu_m', agent: 'conductor' } as unknown as ToolContext;
const run = (input: unknown): Promise<ToolResult> =>
	deviceMapTool.run(deviceMapTool.input.parse(input), ctx);
const json = (result: ToolResult) => JSON.parse(String(result.content));

describe('device_map', () => {
	it('lists the pages when given neither a page nor a parameter', async () => {
		const result = await run({});
		const map = await loadDeviceMap();
		expect(result.isError).toBeFalsy();
		expect(json(result).pages).toHaveLength(map.pages.length);
		expect(json(result).pages).toContain('instrument.m4.duck: duck LFO (M4)');
		expect(result.summary).toBe(`${map.pages.length} pages`);
	});

	it('shows a page whole: the keys from a new project, the screen and every encoder', async () => {
		const result = json(await run({ page: 'duck lfo' }));
		expect(result.pages).toHaveLength(1);
		const [duck] = result.pages;
		expect(duck).toMatchObject({
			id: 'instrument.m4.duck',
			track: 3,
			keys: 'T3, M4, shift + M4, turn E1 ×3 counter-clockwise, click E1',
			screen: 'duck lfo: source 1 (audio), amount 0',
			manual: ['instrument.lfo-duck', 'instrument.lfo']
		});
		expect(duck.controls[0]).toBe(
			'turn E1: source [plan_steps: lfo.source]; 1…metronome over 16 detents (3, 6, 8, 10, 12, 15); now 1; CC40: works over MIDI on OS 1.1.33; track 1–16 or the metronome'
		);
		expect(duck.controls).toContain('click E1: source type: source 1 (audio) → (notes)');
	});

	it('names the other matching pages rather than showing them all', async () => {
		const result = json(await run({ page: 'filter' }));
		expect(result.pages[0].id).toBe('instrument.m3');
		expect(result.pages).toHaveLength(4);
		expect(result.more.length).toBeGreaterThan(0);
		expect(result.pages[0].controls[0]).toMatch(
			/^turn E1: cutoff \[plan_steps: filter\.cutoff\]; 00…99 by 1; now \d\d; CC32: works over MIDI/
		);
	});

	it('narrows a page to the controls a parameter names', async () => {
		const result = await run({ page: 'tape', param: 'speed' });
		const pages = json(result).pages;
		expect(pages.map((p: { id: string }) => p.id)).toEqual([
			'auxiliary.tape.m1',
			'auxiliary.tape.m4'
		]);
		expect(pages[0].controls).toEqual([
			'turn E2: speed [plan_steps: speed]; 50…200 by 1; now 100; CC13: works over MIDI on OS 1.1.33; finer and gentler than pitch'
		]);
		expect(result.summary).toBe('speed: 2 controls on 2 pages');
	});

	it('finds a parameter on every page, with what the screen writes for it', async () => {
		const prism = json(await run({ page: 'prism', param: 'ratio' })).pages[0];
		expect(prism.controls[0]).toContain('the screen writes 00–09 as 2:1, 10–19 as 1:1');
		const fx = json(await run({ param: 'fx ii send' })).pages.map((p: { id: string }) => p.id);
		expect(fx[0]).toBe('instrument.m3');
		const cc = json(await run({ page: 'mix m2', param: 'blend' })).pages[0];
		expect(cc.controls[0]).toContain('CC90 on channel 4: ignored on OS 1.1.33');
	});

	it('puts encoders that do the same on one line, in the key grammar’s range', async () => {
		const envelopes = json(await run({ page: 'envelopes' })).pages[0];
		expect(envelopes.controls).toContain('click E1…E4: amp envelope → filter envelope');
		expect(envelopes.other).toMatch(/^filter envelope: /);
		const lines = controlLines([
			{ keys: 'click E1', layer: 'click', encoder: 1, does: 'x' },
			{ keys: 'click E3', layer: 'click', encoder: 3, does: 'x' }
		] satisfies MapControl[]);
		// not neighbours: each keeps its own line
		expect(lines).toEqual(['click E1: x', 'click E3: x']);
	});

	it('says plainly what it cannot find', async () => {
		const page = await run({ page: 'flux capacitor' });
		expect(page.isError).toBe(true);
		expect(String(page.content)).toMatch(/^No page matches "flux capacitor"\. Pages: /);
		const param = await run({ page: 'tape', param: 'warp' });
		expect(param).toMatchObject({ isError: true, summary: 'no such control' });
	});

	it('keeps every page’s answer compact', async () => {
		const map = await loadDeviceMap();
		for (const page of map.pages) {
			const answer = lookUp(map, { page: page.id });
			expect(JSON.stringify(answer.content).length, page.id).toBeLessThan(12_000);
		}
	});
});
