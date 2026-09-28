// The tool registry: name-sorted, byte-stable strict schemas for the API, zod re-validation of
// every call, default approval policy per kind, and nothing dangerous exposed.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
	asksForApproval,
	defineTool,
	MAX_OPTIONAL_PARAMETERS,
	optionalParameters,
	strictJsonSchema,
	ToolDefinitionError,
	ToolRegistry,
	type AnyTool
} from './define';
import { CONDUCTOR_TOOLS, createConductorRegistry, MANUAL_EXPERT_TOOL_NAMES } from './index';

const noop = async () => ({ content: 'ok', summary: 'ok' });

function tool(name: string, extra: Partial<AnyTool> = {}): AnyTool {
	return defineTool({
		name,
		label: name,
		kind: 'read',
		description: name,
		input: z.object({}),
		run: noop,
		...extra
	} as AnyTool);
}

type Schema = Record<string, unknown> & { properties?: Record<string, Schema>; items?: Schema };

describe('strictJsonSchema', () => {
	const schema = z.object({
		bpm: z.number().min(40).max(220).describe('Tempo'),
		track: z.int().min(1).max(16),
		mode: z.enum(['play', 'stop']),
		note: z.string().max(10).optional(),
		steps: z
			.array(z.object({ notes: z.array(z.union([z.int().min(0).max(127), z.string()])).max(8) }))
			.min(1)
			.max(64),
		count: z.int()
	});
	const json = strictJsonSchema(schema) as Schema;

	it('closes every object and keeps required fields', () => {
		expect(json.type).toBe('object');
		expect(json.additionalProperties).toBe(false);
		expect(json.required).toEqual(['bpm', 'track', 'mode', 'steps', 'count']);
		const step = (json.properties!.steps as Schema).items as Schema;
		expect(step.additionalProperties).toBe(false);
	});

	it('moves ranges and counts into descriptions and drops what strict mode rejects', () => {
		const props = json.properties!;
		expect(props.bpm).toEqual({ type: 'number', description: 'Tempo; range 40–220' });
		expect(props.track).toEqual({ type: 'integer', description: 'range 1–16' });
		expect(props.note).toEqual({ type: 'string', description: 'at most 10 characters' });
		expect(props.steps).toMatchObject({
			type: 'array',
			minItems: 1,
			description: 'at most 64 items'
		});
		// Unbounded integers carry zod's safe-integer limits, which say nothing: no description.
		expect(props.count).toEqual({ type: 'integer' });
		const text = JSON.stringify(json);
		for (const keyword of [
			'minimum',
			'maximum',
			'maxItems',
			'maxLength',
			'$schema',
			'$ref',
			'$defs'
		]) {
			expect(text).not.toContain(`"${keyword}"`);
		}
	});

	it('keeps enums and unions', () => {
		expect(json.properties!.mode).toEqual({ type: 'string', enum: ['play', 'stop'] });
		const notes = ((json.properties!.steps as Schema).items as Schema).properties!.notes as Schema;
		expect(notes.items).toEqual({
			anyOf: [{ type: 'integer', description: 'range 0–127' }, { type: 'string' }]
		});
	});

	it('refuses non-object schemas', () => {
		expect(() => strictJsonSchema(z.string(), 'bad')).toThrow(ToolDefinitionError);
	});
});

describe('ToolRegistry', () => {
	it('sorts tools by name and serialises them identically every time', () => {
		const registry = new ToolRegistry([tool('zeta'), tool('alpha'), tool('mid')]);
		expect(registry.names).toEqual(['alpha', 'mid', 'zeta']);
		const first = JSON.stringify(registry.apiTools());
		const again = JSON.stringify(
			new ToolRegistry([tool('mid'), tool('zeta'), tool('alpha')]).apiTools()
		);
		expect(again).toBe(first);
		expect(registry.apiTools().every((t) => t.strict === true)).toBe(true);
	});

	it('rejects duplicate and badly named tools', () => {
		expect(() => new ToolRegistry([tool('same'), tool('same')])).toThrow(/defined twice/);
		expect(() => new ToolRegistry([tool('Bad-Name')])).toThrow(/not a valid tool name/);
		expect(() => new ToolRegistry([tool('fast', { priority: true })])).toThrow(/priority/);
	});

	it('re-validates input with zod, including ranges strict schemas cannot express', () => {
		const registry = createConductorRegistry();
		expect(registry.parse('set_tempo', { bpm: 96 })).toMatchObject({
			ok: true,
			input: { bpm: 96 }
		});
		const tooFast = registry.parse('set_tempo', { bpm: 500 });
		expect(tooFast.ok).toBe(false);
		expect(!tooFast.ok && tooFast.error).toMatch(/Invalid input for set_tempo/);
		expect(registry.parse('set_tempo', { bpm: 96, extra: 1 }).ok).toBe(true); // zod strips unknown keys
		expect(registry.parse('nope', {})).toMatchObject({ ok: false, tool: null });
	});

	it('builds subsets for subagents', () => {
		const registry = createConductorRegistry().subset(MANUAL_EXPERT_TOOL_NAMES);
		expect(registry.names).toEqual(['read_manual_unit', 'search_manual']);
		expect(() => createConductorRegistry().subset(['missing'])).toThrow(/unknown tool/);
	});
});

describe('the conductor tool set', () => {
	it('stays within the API’s budget of optional parameters (it refuses more than 24)', () => {
		const tools = createConductorRegistry().apiTools();
		const optional = tools.reduce(
			(n, t) => n + optionalParameters(t.input_schema as Record<string, unknown>),
			0
		);
		expect(optional).toBeLessThanOrEqual(MAX_OPTIONAL_PARAMETERS);
	});

	it('has every planned tool with the right kind', () => {
		const kinds = Object.fromEntries(CONDUCTOR_TOOLS.map((t) => [t.name, t.kind]));
		expect(kinds).toEqual({
			device_status: 'read',
			transport: 'mutate',
			set_tempo: 'mutate',
			select_track: 'ui',
			mute_track: 'mutate',
			set_sound: 'mutate',
			play_notes: 'mutate',
			panic: 'mutate',
			search_manual: 'read',
			read_manual_unit: 'read',
			show_on_replica: 'ui',
			read_screen: 'read',
			write_todos: 'ui',
			task: 'read',
			plan_steps: 'ui',
			write_pattern: 'mutate',
			read_pattern: 'read',
			write_arrangement: 'mutate'
		});
	});

	it('asks for approval only for project changes; transport, previews and panic are always allowed', () => {
		const asks = CONDUCTOR_TOOLS.filter(asksForApproval)
			.map((t) => t.name)
			.sort();
		expect(asks).toEqual(['mute_track', 'set_sound', 'set_tempo']);
	});

	it('runs everything that sends MIDI on the device queue; only panic skips it', () => {
		const device = CONDUCTOR_TOOLS.filter((t) => t.device)
			.map((t) => t.name)
			.sort();
		expect(device).toEqual([
			'mute_track',
			'panic',
			'play_notes',
			'select_track',
			'set_sound',
			'set_tempo',
			'transport'
		]);
		expect(CONDUCTOR_TOOLS.filter((t) => t.priority).map((t) => t.name)).toEqual(['panic']);
	});

	it('exposes nothing dangerous', () => {
		const text = JSON.stringify(createConductorRegistry().apiTools()).toLowerCase();
		for (const word of ['firmware', 'dfu', 'cc86', 'sysex', 'remote key', 'delete']) {
			expect(CONDUCTOR_TOOLS.some((t) => t.name.includes(word.replace(/\s/g, '_')))).toBe(false);
		}
		expect(text).not.toContain('"load_project"');
	});
});
