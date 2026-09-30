/**
 * `memory`: the agent's memory tool over the app's memory store (`../memory.ts`), with the commands
 * of the API's memory tool (view a directory or a file with line numbers, create, str_replace,
 * insert, delete, rename) on files under /memories. It is our own tool rather than the API's
 * `memory_20250818` type: that one comes with a protocol to view memory before anything else, a
 * round trip on every conversation's first message, while the conductor already hands the model
 * what it remembers with that message.
 */
import { z } from 'zod';
import {
	checkMemoryText,
	MEMORY_LIMITS,
	MEMORY_ROOT,
	MemoryError,
	memoryPath,
	type MemoryStore
} from '../memory';
import { defineTool, errorResult, type ToolResult } from './define';

/** What each command needs besides its name. */
const NEEDS: Record<string, readonly string[]> = {
	view: ['path'],
	create: ['path', 'file_text'],
	str_replace: ['path', 'old_str', 'new_str'],
	insert: ['path', 'insert_line', 'insert_text'],
	delete: ['path'],
	rename: ['old_path', 'new_path']
};

// one flat object, as the API's own memory tool takes it (a tool's schema must be an object)
const command = z
	.object({
		command: z.enum(['view', 'create', 'str_replace', 'insert', 'delete', 'rename']),
		path: z.string().optional().describe('A file or directory under /memories'),
		view_range: z
			.array(z.int())
			.length(2)
			.optional()
			.describe('view: first and last line to show (-1: to the end)'),
		file_text: z.string().optional().describe("create: the file's text"),
		old_str: z.string().optional().describe('str_replace: text that appears exactly once'),
		new_str: z.string().optional().describe('str_replace: what replaces it'),
		insert_line: z.int().min(0).optional().describe('insert: the line to insert after (0: top)'),
		insert_text: z.string().optional().describe('insert: the text'),
		old_path: z.string().optional().describe('rename: from'),
		new_path: z.string().optional().describe('rename: to')
	})
	.superRefine((input, ctx) => {
		for (const field of NEEDS[input.command]) {
			if ((input as Record<string, unknown>)[field] === undefined) {
				ctx.addIssue({ code: 'custom', path: [field], message: `${input.command} needs ${field}` });
			}
		}
	});

type Command = z.infer<typeof command>;

/** A field the command's refinement guaranteed. */
const need = <T>(value: T | undefined): T => value as T;

const ok = (content: string, summary: string): ToolResult => ({ content, summary });

/** A file's lines, numbered as the memory tool's reference does. */
function numbered(text: string, range?: readonly number[]): string {
	const lines = text.split('\n');
	const [from, to] = range
		? [Math.max(1, range[0]), range[1] < 0 ? lines.length : range[1]]
		: [1, lines.length];
	return lines
		.slice(from - 1, to)
		.map((line, i) => `${String(from + i).padStart(6)}\t${line}`)
		.join('\n');
}

async function run(store: MemoryStore, input: Command): Promise<ToolResult> {
	const files = await store.list();
	const under = (dir: string) => files.filter((f) => f.path.startsWith(`${dir}/`));
	switch (input.command) {
		case 'view': {
			const path = memoryPath(need(input.path));
			const file = files.find((f) => f.path === path);
			if (file) return ok(numbered(file.text, input.view_range), `read ${path}`);
			const inside = path === MEMORY_ROOT ? files : under(path);
			if (inside.length === 0 && path !== MEMORY_ROOT) {
				throw new MemoryError(`The path ${path} does not exist.`);
			}
			const listing = inside.map((f) => `- ${f.path} (${f.text.length} characters)`);
			return ok(
				`Directory: ${path}\n${listing.length ? listing.join('\n') : '(empty)'}`,
				`looked in ${path}`
			);
		}
		case 'create': {
			const path = memoryPath(need(input.path));
			checkMemoryText(need(input.file_text));
			const others = files.filter((f) => f.path !== path);
			if (others.length >= MEMORY_LIMITS.files) {
				throw new MemoryError(
					`Memory holds at most ${MEMORY_LIMITS.files} files; merge or delete some.`
				);
			}
			const total =
				others.reduce((sum, f) => sum + f.text.length, 0) + need(input.file_text).length;
			if (total > MEMORY_LIMITS.totalChars) {
				throw new MemoryError(
					`Memory holds at most ${MEMORY_LIMITS.totalChars} characters in all; shorten it.`
				);
			}
			await store.write(path, need(input.file_text));
			return ok(`File created successfully at ${path}`, `noted ${path}`);
		}
		case 'str_replace': {
			const path = memoryPath(need(input.path));
			const file = files.find((f) => f.path === path);
			if (!file) throw new MemoryError(`The file ${path} does not exist.`);
			const count = file.text.split(need(input.old_str)).length - 1;
			if (count === 0) throw new MemoryError(`The text to replace is not in ${path}.`);
			if (count > 1) {
				throw new MemoryError(
					`The text to replace appears ${count} times in ${path}; give more context.`
				);
			}
			const text = file.text.replace(need(input.old_str), () => need(input.new_str));
			checkMemoryText(text);
			await store.write(path, text);
			return ok(`The file ${path} has been edited.`, `updated ${path}`);
		}
		case 'insert': {
			const path = memoryPath(need(input.path));
			const file = files.find((f) => f.path === path);
			if (!file) throw new MemoryError(`The file ${path} does not exist.`);
			const lines = file.text.split('\n');
			const at = need(input.insert_line);
			if (at > lines.length) {
				throw new MemoryError(
					`${path} has ${lines.length} lines; insert_line ${at} is past its end.`
				);
			}
			lines.splice(at, 0, ...need(input.insert_text).replace(/\n$/, '').split('\n'));
			const text = lines.join('\n');
			checkMemoryText(text);
			await store.write(path, text);
			return ok(`The text was inserted into ${path}.`, `updated ${path}`);
		}
		case 'delete': {
			const path = memoryPath(need(input.path));
			if (path === MEMORY_ROOT)
				throw new MemoryError('The memory directory itself cannot be deleted.');
			const gone = files.filter((f) => f.path === path || f.path.startsWith(`${path}/`));
			if (gone.length === 0) throw new MemoryError(`The path ${path} does not exist.`);
			for (const f of gone) await store.remove(f.path);
			return ok(`Deleted ${path}.`, `forgot ${path}`);
		}
		case 'rename': {
			const from = memoryPath(need(input.old_path));
			const to = memoryPath(need(input.new_path));
			const moving = files.filter((f) => f.path === from || f.path.startsWith(`${from}/`));
			if (moving.length === 0) throw new MemoryError(`The path ${from} does not exist.`);
			if (files.some((f) => f.path === to || f.path.startsWith(`${to}/`))) {
				throw new MemoryError(`The path ${to} already exists.`);
			}
			for (const f of moving) {
				await store.write(to + f.path.slice(from.length), f.text);
				await store.remove(f.path);
			}
			return ok(`Renamed ${from} to ${to}.`, `moved ${from}`);
		}
	}
}

export const memoryTool = defineTool({
	name: 'memory',
	label: 'memory',
	kind: 'mutate',
	// notes in this browser, about the conversation: nothing on the device to approve or undo
	approval: 'auto',
	strict: false,
	description:
		'Your memory across conversations: small text files under /memories, kept in this browser. /memories/user.md is the user profile (their level, gear, OS, styles they like, how they like to learn), which comes with the first message of every conversation; /memories/lessons/ holds what you learned from being corrected; other notes as you need them. Commands: view (a directory, or a file with line numbers), create (a new file, or replacing one), str_replace (edit text that appears exactly once), insert (after a line number, 0 for the top), delete, rename. Keep notes short and factual; never store keys, passwords or anything the user would not expect you to keep.',
	input: command,
	async run(input, ctx) {
		const store = ctx.env.memory;
		if (!store) return errorResult('Memory is not available in this session.', 'no memory');
		try {
			return await run(store, input);
		} catch (error) {
			if (error instanceof MemoryError)
				return errorResult(`Error: ${error.message}`, 'memory error');
			throw error;
		}
	}
});

/** The memory tools. */
export const MEMORY_TOOLS = [memoryTool];
