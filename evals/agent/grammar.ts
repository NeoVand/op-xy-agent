/**
 * The API compiles the strict tool schemas into one grammar and refuses every request once it grows
 * too large ("The compiled grammar is too large"), and it takes at most 20 strict tools; no unit
 * test can see either. This probe sends the conductor's tools with an 8-token request, then adds
 * small strict tools one by one to measure the room left. Run it whenever a tool is added or its
 * schema grows; keep at least 2 of room.
 *
 *   node evals/agent/grammar.mjs
 */
import Anthropic from '@anthropic-ai/sdk';
import { createConductorRegistry } from '$lib/agent/tools';
import { anthropicKey } from './key';

/** A small strict tool, like a typical new one: a number and an optional choice. */
const probe = (n: number) => ({
	name: `probe_${n}`,
	description: 'probe',
	strict: true,
	input_schema: {
		type: 'object' as const,
		properties: {
			seconds: { type: 'number' },
			focus: { type: 'string', enum: ['mix', 'drums', 'tempo', 'bass', 'melody'] }
		},
		required: ['seconds'],
		additionalProperties: false
	}
});

export async function main(): Promise<void> {
	const client = new Anthropic({ apiKey: anthropicKey() });
	let limit = '';
	const tools = createConductorRegistry().apiTools();
	const fits = async (extra: number) => {
		try {
			await client.beta.messages.create({
				model: 'claude-opus-5-5',
				max_tokens: 8,
				tools: [...tools, ...Array.from({ length: extra }, (_, i) => probe(i))] as typeof tools,
				messages: [{ role: 'user', content: 'hi' }]
			});
			return true;
		} catch (e) {
			const message = (e as Error).message;
			if (/grammar is too large/.test(message)) limit = 'the grammar size';
			else if (/Too many strict tools/.test(message)) limit = '20 strict tools';
			else throw e;
			return false;
		}
	};
	const strict = tools.filter((t) => t.strict).map((t) => t.name);
	console.log(`${strict.length} strict tools, ${tools.length - strict.length} loose`);
	if (!(await fits(0))) {
		console.log(`FAIL: the API refuses the tool set (${limit})`);
		process.exitCode = 1;
		return;
	}
	let room = 0;
	while (room < 6 && (await fits(room + 1))) room++;
	console.log(
		`ok: room for ${room}${room === 6 ? '+' : ''} more small strict tools${limit ? ` (then ${limit})` : ''}`
	);
	if (room < 2) process.exitCode = 1;
}
