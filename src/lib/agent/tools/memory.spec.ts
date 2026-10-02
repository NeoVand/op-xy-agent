// The agent's memory: the API's memory tool over the app's store. Files under /memories only (no
// "..", no other roots), viewed with line numbers, created, edited where the text is unique,
// inserted into, renamed and deleted; never a secret, never past its limits; and what a
// conversation's first message brings from it.
import { describe, expect, it } from 'vitest';
import { createMemoryStore, MEMORY_LIMITS, memoryBriefing, memoryPath } from '../memory';
import type { AgentEnvironment, ToolResult } from './define';
import { memoryTool } from './memory';

function setup(seed: { path: string; text: string }[] = []) {
	const store = createMemoryStore(seed, () => 0);
	const env = { memory: store } as unknown as AgentEnvironment;
	const run = (input: unknown): Promise<ToolResult> =>
		memoryTool.run(memoryTool.input.parse(input), {
			toolCallId: 'toolu_m',
			agent: 'conductor',
			signal: new AbortController().signal,
			env
		});
	return { store, run };
}

describe('memory paths', () => {
	it('stay under /memories, normalised', () => {
		expect(memoryPath('/memories/./a//b.md')).toBe('/memories/a/b.md');
		expect(memoryPath('/memories/')).toBe('/memories');
		expect(() => memoryPath('/etc/passwd')).toThrow(/not under/);
		expect(() => memoryPath('/memories/../x')).toThrow(/\.\./);
	});
});

describe('the memory tool', () => {
	it('creates, views with line numbers, edits and inserts', async () => {
		const { run } = setup();
		expect(String((await run({ command: 'view', path: '/memories' })).content)).toBe(
			'Directory: /memories\n(empty)'
		);
		await run({
			command: 'create',
			path: '/memories/user.md',
			file_text: 'Level: beginner\nLikes: house'
		});
		expect(String((await run({ command: 'view', path: '/memories/user.md' })).content)).toBe(
			'     1\tLevel: beginner\n     2\tLikes: house'
		);
		await run({
			command: 'str_replace',
			path: '/memories/user.md',
			old_str: 'beginner',
			new_str: 'intermediate'
		});
		await run({
			command: 'insert',
			path: '/memories/user.md',
			insert_line: 1,
			insert_text: 'Gear: OP-XY, a Minilogue on channel 3'
		});
		const shown = String((await run({ command: 'view', path: '/memories/user.md' })).content);
		expect(shown).toBe(
			'     1\tLevel: intermediate\n     2\tGear: OP-XY, a Minilogue on channel 3\n     3\tLikes: house'
		);
		expect(String((await run({ command: 'view', path: '/memories' })).content)).toContain(
			'- /memories/user.md ('
		);
	});

	it('renames and deletes, files and folders', async () => {
		const { store, run } = setup([
			{ path: '/memories/lessons/midi.md', text: 'a' },
			{ path: '/memories/lessons/duck.md', text: 'b' }
		]);
		await run({ command: 'rename', old_path: '/memories/lessons', new_path: '/memories/learned' });
		expect((await store.list()).map((f) => f.path)).toEqual([
			'/memories/learned/duck.md',
			'/memories/learned/midi.md'
		]);
		await run({ command: 'delete', path: '/memories/learned' });
		expect(await store.list()).toEqual([]);
	});

	it('says what went wrong, and keeps no secrets', async () => {
		const { run } = setup([{ path: '/memories/user.md', text: 'likes house, likes techno' }]);
		const twice = await run({
			command: 'str_replace',
			path: '/memories/user.md',
			old_str: 'likes',
			new_str: 'loves'
		});
		expect(twice).toMatchObject({ isError: true });
		expect(String(twice.content)).toMatch(/appears 2 times/);
		expect(await run({ command: 'view', path: '/memories/none.md' })).toMatchObject({
			isError: true
		});
		expect(await run({ command: 'create', path: '/tmp/x', file_text: 'x' })).toMatchObject({
			isError: true
		});
		const key = 'sk-ant-' + 'api03-' + 'x'.repeat(40);
		const secret = await run({ command: 'create', path: '/memories/k.md', file_text: key });
		expect(String(secret.content)).toMatch(/never keeps secrets/);
		const huge = await run({
			command: 'create',
			path: '/memories/big.md',
			file_text: 'x'.repeat(MEMORY_LIMITS.fileChars + 1)
		});
		expect(huge).toMatchObject({ isError: true });
	});
});

describe('a conversation starts with what memory holds', () => {
	it('the profile in full and the other files by name', async () => {
		expect(await memoryBriefing(createMemoryStore())).toMatch(
			/^<memory>\nYou remember nothing from earlier conversations yet: there is no \/memories\/user\.md/
		);
		const briefing = await memoryBriefing(
			createMemoryStore([
				{ path: '/memories/user.md', text: 'Level: beginner' },
				{ path: '/memories/lessons/midi.md', text: 'split melodies' }
			])
		);
		expect(briefing).toMatch(/^<memory>\n/);
		expect(briefing).toContain('/memories/user.md:\nLevel: beginner');
		expect(briefing).toContain('Other files (view one when it matters): /memories/lessons/midi.md');
	});
});
