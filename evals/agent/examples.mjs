#!/usr/bin/env node
/**
 * Writes the chat's examples (`src/lib/agent/examples/recorded.json`, and `list.json` with what the
 * panel shows of them) from saved eval runs: real
 * conversations of the agent, kept as what the model said and called, turn by turn (its thinking
 * notes, its text and its tool calls, and the manual expert's), so the app can replay them on the
 * replica without a key, the tools running for real. Pick runs by file and case id below; each must
 * have passed. No API calls.
 *
 *   node evals/agent/examples.mjs && npx prettier --write src/lib/agent/examples
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(root, 'src/lib/agent/examples/recorded.json');
/** What the panel lists before any is played (small: the recordings load on the first play). */
const LIST = resolve(root, 'src/lib/agent/examples/list.json');

/** The examples, in the order the panel shows them. */
const PICKS = [
	{
		id: 'shift-m1',
		file: 'd1-demo.json',
		run: 'demo-shift-m1',
		title: 'what shift + M1 does',
		about: 'an answer from the manual, shown on the replica'
	},
	{
		id: 'walkthrough',
		file: 'd4-demo.json',
		run: 'demo-walkthrough',
		title: 'walk me to the cutoff',
		about: 'lit steps to follow on the replica'
	},
	{
		id: 'kit',
		file: 'd16-demo.json',
		run: 'demo-kit',
		title: 'a 909 kit and a beat',
		about: 'a kit made, a beat written, playing'
	},
	{
		id: 'dark',
		file: 'd16-demo.json',
		run: 'demo-dark',
		title: 'why track 3 is dark',
		about: 'the sound read, the cause and the fix'
	},
	{
		id: 'pump',
		file: 'd1-demo.json',
		run: 'demo-pump',
		title: 'make the bass pump',
		about: 'a duck set up on the replica'
	},
	{
		id: 'lofi',
		file: 'v24-music.json',
		run: 'lofi-loop',
		title: 'a lo-fi loop at 80',
		about: 'drums, bass and jazzy chords, playing'
	},
	{
		id: 'song',
		file: 'v22-noroute.json',
		run: 'song-3',
		title: 'a song in three scenes',
		about: 'patterns, scenes and the song, playing'
	},
	{
		id: 'chord',
		file: 'd1-demo.json',
		run: 'demo-chord',
		title: 'chords from one key',
		about: 'the maestro player, from the manual'
	}
];

/** A saved run's passing result for a case. */
function findRun(file, id) {
	const data = JSON.parse(readFileSync(resolve(root, 'evals/agent/out', file), 'utf8'));
	const run = data.results.find((r) => r.id === id && r.pass);
	if (!run) throw new Error(`${file} has no passing ${id}`);
	return run;
}

/** An agent's entries as responses: a response is its thinking and text, then the tools it called. */
function responses(entries) {
	const out = [];
	let current = null;
	const next = () => ((current = { tools: [] }), out.push(current), current);
	for (const e of entries) {
		if (e.kind === 'progress' || e.kind === 'text') {
			if (!current || current.tools.length > 0) next();
			if (e.kind === 'progress')
				current.thinking = [current.thinking, e.text].filter(Boolean).join(' ');
			else current.text = [current.text, e.text].filter(Boolean).join('\n\n');
		} else if (e.kind === 'tool' && String(e.id).startsWith('toolu')) {
			(current ?? next()).tools.push({ id: e.id, name: e.name, input: e.input });
		}
	}
	return out;
}

/** A run's conversation, turn by turn. */
function turnsOf(run) {
	const turns = [];
	let entries = null;
	for (const e of run.entries) {
		if (e.kind === 'user') {
			entries = [];
			turns.push({ user: e.text, entries });
		} else entries?.push(e);
	}
	return turns.map(({ user, entries }) => ({
		user,
		conductor: responses(entries.filter((e) => !('parent' in e) || e.parent === null)),
		subagent: responses(entries.filter((e) => 'parent' in e && e.parent !== null))
	}));
}

const examples = PICKS.map((pick) => {
	const run = findRun(pick.file, pick.run);
	return {
		id: pick.id,
		title: pick.title,
		about: pick.about,
		model: 'recorded',
		turns: turnsOf(run)
	};
});
writeFileSync(OUT, `${JSON.stringify(examples, null, '\t')}\n`);
const list = examples.map(({ id, title, about, turns }) => ({
	id,
	title,
	about,
	ask: turns[0].user
}));
writeFileSync(LIST, `${JSON.stringify(list, null, '\t')}\n`);
for (const e of examples) {
	const calls = e.turns.flatMap((t) => t.conductor.flatMap((r) => r.tools.map((c) => c.name)));
	console.log(`${e.id}: ${e.turns.length} turn(s), ${calls.join(', ') || 'no tools'}`);
}
