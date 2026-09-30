/**
 * `memory`: the API's memory tool (`memory_20250818`), which the model is trained to use, over the
 * app's memory store (`../memory.ts`). The request declares it by type; its commands are validated
 * here and run on files under /memories: view (a directory or a file with line numbers), create,
 * str_replace, insert, delete, rename.
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

const command = z.discriminatedUnion('command', [
	z.object({
		command: z.literal('view'),
		path: z.string(),
		view_range: z.array(z.int()).length(2).optional()
	}),
	z.object({ command: z.literal('create'), path: z.string(), file_text: z.string() }),
	z.object({
		command: z.literal('str_replace'),
		path: z.string(),
		old_str: z.string(),
		new_str: z.string()
	}),
	z.object({
		command: z.literal('insert'),
		path: z.string(),
		insert_line: z.int().min(0),
		insert_text: z.string()
	}),
	z.object({ command: z.literal('delete'), path: z.string() }),
	z.object({ command: z.literal('rename'), old_path: z.string(), new_path: z.string() })
]);

type Command = z.infer<typeof command>;

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
			const path = memoryPath(input.path);
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
			const path = memoryPath(input.path);
			checkMemoryText(input.file_text);
			const others = files.filter((f) => f.path !== path);
			if (others.length >= MEMORY_LIMITS.files) {
				throw new MemoryError(
					`Memory holds at most ${MEMORY_LIMITS.files} files; merge or delete some.`
				);
			}
			const total = others.reduce((sum, f) => sum + f.text.length, 0) + input.file_text.length;
			if (total > MEMORY_LIMITS.totalChars) {
				throw new MemoryError(
					`Memory holds at most ${MEMORY_LIMITS.totalChars} characters in all; shorten it.`
				);
			}
			await store.write(path, input.file_text);
			return ok(`File created successfully at ${path}`, `noted ${path}`);
		}
		case 'str_replace': {
			const path = memoryPath(input.path);
			const file = files.find((f) => f.path === path);
			if (!file) throw new MemoryError(`The file ${path} does not exist.`);
			const count = file.text.split(input.old_str).length - 1;
			if (count === 0) throw new MemoryError(`The text to replace is not in ${path}.`);
			if (count > 1) {
				throw new MemoryError(
					`The text to replace appears ${count} times in ${path}; give more context.`
				);
			}
			const text = file.text.replace(input.old_str, () => input.new_str);
			checkMemoryText(text);
			await store.write(path, text);
			return ok(`The file ${path} has been edited.`, `updated ${path}`);
		}
		case 'insert': {
			const path = memoryPath(input.path);
			const file = files.find((f) => f.path === path);
			if (!file) throw new MemoryError(`The file ${path} does not exist.`);
			const lines = file.text.split('\n');
			if (input.insert_line > lines.length) {
				throw new MemoryError(
					`${path} has ${lines.length} lines; insert_line ${input.insert_line} is past its end.`
				);
			}
			lines.splice(input.insert_line, 0, ...input.insert_text.replace(/\n$/, '').split('\n'));
			const text = lines.join('\n');
			checkMemoryText(text);
			await store.write(path, text);
			return ok(`The text was inserted into ${path}.`, `updated ${path}`);
		}
		case 'delete': {
			const path = memoryPath(input.path);
			if (path === MEMORY_ROOT)
				throw new MemoryError('The memory directory itself cannot be deleted.');
			const gone = files.filter((f) => f.path === path || f.path.startsWith(`${path}/`));
			if (gone.length === 0) throw new MemoryError(`The path ${path} does not exist.`);
			for (const f of gone) await store.remove(f.path);
			return ok(`Deleted ${path}.`, `forgot ${path}`);
		}
		case 'rename': {
			const from = memoryPath(input.old_path);
			const to = memoryPath(input.new_path);
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
	native: { type: 'memory_20250818' },
	description:
		'Your memory across conversations: files under /memories in this browser (the user profile in /memories/user.md, lessons, notes about their projects).',
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
