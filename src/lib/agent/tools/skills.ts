/**
 * `skill`: loads one of our skills (`../skills.ts`) into the conversation, its body or one of its
 * reference files. Read-only; the text comes back wrapped in the skill marker so the thread knows it
 * holds it, and the router does not add it again.
 */
import { z } from 'zod';
import { SKILLS, skillNamed, skillText } from '../skills';
import { defineTool, errorResult } from './define';

export const skillTool = defineTool({
	name: 'skill',
	label: 'skill',
	kind: 'read',
	// a free-text name and an optional file: validated here, kept out of the strict grammar
	strict: false,
	description:
		"Load one of the skills listed in the system prompt: what we have learned about a kind of work (teaching on the replica, shaping a sound, arranging a MIDI file, making music, the lab …), with its procedure, the judgment calls and the pitfalls. Load a skill before you start work it covers; once loaded it stays in the conversation, so do not load it twice. file reads one of the skill's reference files, when its body names one. Returns the text; changes nothing.",
	input: z.object({
		name: z.string().min(1).max(60).describe('The skill, as the list names it'),
		file: z
			.string()
			.min(1)
			.max(120)
			.optional()
			.describe("A reference file the skill's body names, e.g. reference/limits.md")
	}),
	async run(input) {
		const skill = skillNamed(input.name);
		if (!skill) {
			return errorResult(
				`No skill named "${input.name}". The skills are: ${SKILLS.map((s) => s.name).join(', ')}.`,
				'no such skill'
			);
		}
		if (input.file !== undefined && !skill.files.has(input.file)) {
			const files = [...skill.files.keys()];
			return errorResult(
				files.length
					? `The ${skill.name} skill has no file "${input.file}"; it has ${files.join(', ')}.`
					: `The ${skill.name} skill has no reference files.`,
				'no such file'
			);
		}
		return {
			content: skillText(skill, input.file),
			summary: input.file ? `${skill.name}: ${input.file}` : skill.name
		};
	}
});

/** The skill tools. */
export const SKILL_TOOLS = [skillTool];
