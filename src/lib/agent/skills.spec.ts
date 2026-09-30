// Our skills as the agent gets them: every shipped skill reads (front matter, name = folder, a
// description that routes, a body a model reads in one go), the key combinations it shows parse, the
// index lists them all, and a thread can tell which ones it already holds. The router picks the skill
// a message clearly needs, at most two, and never one the thread holds.
import { describe, expect, it } from 'vitest';
import { tryParseKeys } from '$lib/core/opxy';
import { routeSkills } from './skill-router';
import {
	buildSkills,
	loadedSkills,
	messageTexts,
	parseSkillFile,
	SkillFormatError,
	SKILLS,
	skillIndex,
	skillNamed,
	skillText
} from './skills';
import { skillTool } from './tools/skills';

describe('the shipped skills', () => {
	it('read, with a description that says when and a body a model reads in one go', () => {
		expect(SKILLS.length).toBeGreaterThanOrEqual(9);
		for (const skill of SKILLS) {
			expect(skill.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
			expect(skill.description, skill.name).toMatch(/^Use when /);
			expect(skill.description.length, skill.name).toBeLessThanOrEqual(300);
			expect(skill.body.length, skill.name).toBeGreaterThan(400);
			expect(skill.body.length, skill.name).toBeLessThanOrEqual(9_000);
		}
	});

	it('only show key combinations that parse', () => {
		const combos = SKILLS.flatMap((s) =>
			[...s.body.matchAll(/`([^`]+)`/g)].map((m) => m[1])
		).filter((c) => /\+|→|^hold |^turn |^click /.test(c));
		expect(combos.length).toBeGreaterThan(5);
		for (const combo of combos) expect(tryParseKeys(combo).ok, combo).toBe(true);
	});

	it('are all in the index, which says how to load one', () => {
		const index = skillIndex();
		expect(index).toMatch(/^# Skills\n/);
		for (const skill of SKILLS) expect(index).toContain(`- ${skill.name}: ${skill.description}`);
	});
});

describe('skill files', () => {
	it('split front matter from the body, quotes and all', () => {
		const { fields, body } = parseSkillFile(
			'---\nname: demo\ndescription: "Use when testing: quoted"\n---\n\n# Demo\nBody.'
		);
		expect(fields).toEqual({ name: 'demo', description: 'Use when testing: quoted' });
		expect(body).toBe('# Demo\nBody.');
	});

	it('refuse a skill whose name is not its folder, or with no description', () => {
		expect(() =>
			buildSkills({ '/knowledge/skills/a/SKILL.md': '---\nname: b\ndescription: x\n---\nbody' })
		).toThrow(SkillFormatError);
		expect(() =>
			buildSkills({ '/knowledge/skills/a/SKILL.md': '---\nname: a\n---\nbody' })
		).toThrow(/no description/);
		expect(() => parseSkillFile('no front matter')).toThrow(SkillFormatError);
	});

	it('keep reference files beside SKILL.md', () => {
		const [skill] = buildSkills({
			'/knowledge/skills/a/SKILL.md': '---\nname: a\ndescription: Use when a.\n---\nbody',
			'/knowledge/skills/a/reference/limits.md': '# Limits\n'
		});
		expect([...skill.files.keys()]).toEqual(['reference/limits.md']);
		expect(skillText(skill, 'reference/limits.md')).toBe(
			'<skill name="a" file="reference/limits.md">\n# Limits\n</skill>'
		);
	});
});

describe('a thread knows its skills', () => {
	it('by the marker, in text, tool results and system notes', () => {
		const skill = skillNamed('midi-to-opxy');
		expect(skill).toBeDefined();
		const texts = messageTexts([
			{ content: 'hello' },
			{
				content: [
					{ type: 'tool_result', content: [{ type: 'text', text: skillText(skill!) }] },
					{ type: 'text', text: 'and <skill name="listening">…</skill>' }
				]
			}
		]);
		expect(loadedSkills(texts)).toEqual(new Set(['midi-to-opxy', 'listening']));
		// a reference file is not the skill itself
		expect(loadedSkills(['<skill name="lab" file="reference/x.md">'])).toEqual(new Set());
	});
});

describe('routing', () => {
	it('picks the skill a message clearly needs', () => {
		const route = (text: string, attachments: string[] = []) => routeSkills({ text, attachments });
		expect(route('why does track 3 sound so dark?')).toEqual(['shape-a-sound']);
		expect(route('walk me through opening it up')).toEqual(['teach-on-the-replica']);
		expect(route('what does shift + M1 do?')).toEqual(['teach-on-the-replica']);
		expect(route('build a little house loop and play it')).toEqual(['make-music']);
		expect(route('make a punchy 909 kit and play a house beat with it')).toEqual([
			'make-music',
			'kits-and-samples'
		]);
		expect(route('make the bass pump with the kick')).toEqual(['shape-a-sound']);
		expect(route('love it. put it on my op-xy')).toEqual(['projects-and-the-device']);
		expect(route('here is a song I like', ['midi'])[0]).toBe('midi-to-opxy');
		expect(route('can you play this', ['image'])).toEqual(['sheet-music-and-images']);
		expect(route('thanks!')).toEqual([]);
	});

	it('never adds more than two, nor one the thread holds', () => {
		const text = 'make a warm pad sound, put it on my op-xy, and how does it sound';
		expect(routeSkills({ text })).toHaveLength(2);
		expect(
			routeSkills({ text: 'why is my bass so dull?', loaded: new Set(['shape-a-sound']) })
		).toEqual([]);
	});
});

describe('the skill tool', () => {
	const run = (input: unknown) =>
		skillTool.run(skillTool.input.parse(input), {
			toolCallId: 'toolu_s',
			agent: 'conductor',
			signal: new AbortController().signal,
			env: {} as never
		});

	it('loads a skill in its marker', async () => {
		const result = await run({ name: 'listening' });
		expect(result.isError).toBeFalsy();
		expect(String(result.content)).toMatch(/^<skill name="listening">\n# Listening/);
		expect(result.summary).toBe('listening');
	});

	it('names the skills there are when asked for one that is not', async () => {
		const result = await run({ name: 'jazz' });
		expect(result).toMatchObject({ isError: true, summary: 'no such skill' });
		expect(String(result.content)).toContain('midi-to-opxy');
		expect(await run({ name: 'listening', file: 'reference/none.md' })).toMatchObject({
			isError: true
		});
	});
});
