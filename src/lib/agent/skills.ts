/**
 * Skills: what we have learned about a kind of work, loaded when a task calls for it rather than
 * carried in every request (docs/AGENT-V2.md). The Agent Skills format: `knowledge/skills/<name>/
 * SKILL.md` with `name` and `description` in its front matter and the procedure, judgment calls and
 * pitfalls in its body, plus optional reference files beside it. The index (names and descriptions)
 * sits in the system prompt; a body reaches the model through the `skill` tool, or when the harness
 * routes a request to it (`skill-router.ts`). Both wrap it in the same marker, so a thread knows
 * which skills it already holds.
 */

/** A skill as the agent sees it. */
export interface Skill {
	readonly name: string;
	/** When to use it: the routing text in the system prompt's index. */
	readonly description: string;
	/** The SKILL.md body, front matter removed. */
	readonly body: string;
	/** Reference files beside SKILL.md, by path relative to the skill's folder. */
	readonly files: ReadonlyMap<string, string>;
}

/** Why a skill file cannot be read. */
export class SkillFormatError extends Error {
	override name = 'SkillFormatError';
}

/** Splits `---` front matter (single-line `key: value` fields) from the body. */
export function parseSkillFile(
	text: string,
	where = 'SKILL.md'
): {
	fields: Record<string, string>;
	body: string;
} {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
	if (!match) throw new SkillFormatError(`${where}: no front matter`);
	const fields: Record<string, string> = {};
	for (const line of match[1].split(/\r?\n/)) {
		if (!line.trim()) continue;
		const field = /^([a-z][a-z0-9_-]*):\s*(.*)$/i.exec(line);
		if (!field) throw new SkillFormatError(`${where}: cannot read front matter line "${line}"`);
		fields[field[1]] = field[2].trim().replace(/^(["'])(.*)\1$/, '$2');
	}
	return { fields, body: match[2].trim() };
}

/** Builds the skills from their files (path → text), checking each one's front matter. */
export function buildSkills(sources: Readonly<Record<string, string>>): Skill[] {
	const byFolder = new Map<string, { skill?: string; files: Map<string, string> }>();
	for (const [path, text] of Object.entries(sources)) {
		const at = /skills\/([^/]+)\/(.+)$/.exec(path);
		if (!at) continue;
		const [, folder, rest] = at;
		const entry = byFolder.get(folder) ?? { files: new Map<string, string>() };
		if (rest === 'SKILL.md') entry.skill = text;
		else entry.files.set(rest, text);
		byFolder.set(folder, entry);
	}
	const skills: Skill[] = [];
	for (const [folder, entry] of [...byFolder].sort(([a], [b]) => a.localeCompare(b))) {
		if (entry.skill === undefined) continue;
		const { fields, body } = parseSkillFile(entry.skill, `${folder}/SKILL.md`);
		if (fields.name !== folder) {
			throw new SkillFormatError(`${folder}/SKILL.md: name "${fields.name}" is not its folder`);
		}
		if (!fields.description) throw new SkillFormatError(`${folder}/SKILL.md: no description`);
		if (!body) throw new SkillFormatError(`${folder}/SKILL.md: no body`);
		skills.push({ name: folder, description: fields.description, body, files: entry.files });
	}
	return skills;
}

const SOURCES = import.meta.glob('$knowledge/skills/**/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

/** Every skill we ship, by name order. */
export const SKILLS: readonly Skill[] = buildSkills(SOURCES);

/** A skill by name, or undefined. */
export function skillNamed(name: string, skills: readonly Skill[] = SKILLS): Skill | undefined {
	const wanted = name.trim().toLowerCase();
	return skills.find((s) => s.name === wanted);
}

/** The marker a loaded skill travels in, so a thread can tell which skills it holds. */
export function skillText(skill: Skill, file?: string): string {
	if (file === undefined) return `<skill name="${skill.name}">\n${skill.body}\n</skill>`;
	const text = skill.files.get(file) ?? '';
	return `<skill name="${skill.name}" file="${file}">\n${text.trim()}\n</skill>`;
}

/** A message's content as far as it is text: its text blocks and its tool results' text. */
type MessageLike = {
	readonly content:
		| string
		| readonly (
				| { readonly type: string; readonly text?: string; readonly content?: unknown }
				| Record<string, unknown>
		  )[];
};

/** Every piece of text in `messages` (text blocks, tool results), for markers. */
export function messageTexts(messages: readonly MessageLike[]): string[] {
	const out: string[] = [];
	const take = (value: unknown) => {
		if (typeof value === 'string') out.push(value);
		else if (Array.isArray(value)) {
			for (const block of value) {
				if (block && typeof block === 'object') {
					const b = block as { text?: unknown; content?: unknown };
					if (typeof b.text === 'string') out.push(b.text);
					if (b.content !== undefined) take(b.content);
				}
			}
		}
	};
	for (const m of messages) take(m.content);
	return out;
}

const LOADED = /<skill name="([a-z0-9-]+)">/g;

/** Skills whose body is already in the conversation (loaded by the tool or routed in). */
export function loadedSkills(texts: Iterable<string>): Set<string> {
	const names = new Set<string>();
	for (const text of texts) for (const m of text.matchAll(LOADED)) names.add(m[1]);
	return names;
}

/** The system prompt's index: what each skill is for, and how to load one. */
export function skillIndex(skills: readonly Skill[] = SKILLS): string {
	const lines = skills.map((s) => `- ${s.name}: ${s.description}`);
	return `# Skills\nEach skill holds what we have learned about one kind of work: how to do it well, the judgment calls, and the pitfalls. Load one with the skill tool before you start work it covers, unless it is already in the conversation (the app sometimes adds the ones a request clearly needs).\n${lines.join('\n')}`;
}
