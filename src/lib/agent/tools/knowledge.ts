/**
 * Knowledge and teaching tools: search and read the manual (answers carry search-result
 * citations), animate a key combo on the replica, keep the plan, and delegate to a subagent.
 */
import type { BetaSearchResultBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import { formatKeys, tryParseKeys } from '$lib/core/opxy';
import type { Todo } from '../types';
import {
	defineTool,
	errorResult,
	jsonResult,
	sleep,
	type ToolContext,
	type ToolResult,
	type ToolResultBlock
} from './define';

/** Splits text into citable paragraphs (the text block is the smallest unit a citation points at). */
export function citableBlocks(text: string, maxBlocks = 12): { type: 'text'; text: string }[] {
	const paragraphs = text
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean);
	if (paragraphs.length <= maxBlocks) return paragraphs.map((p) => ({ type: 'text', text: p }));
	// Too many paragraphs: merge neighbours so the block count stays bounded.
	const size = Math.ceil(paragraphs.length / maxBlocks);
	const merged: { type: 'text'; text: string }[] = [];
	for (let i = 0; i < paragraphs.length; i += size) {
		merged.push({ type: 'text', text: paragraphs.slice(i, i + size).join('\n\n') });
	}
	return merged;
}

function searchResult(title: string, source: string, text: string): BetaSearchResultBlockParam {
	const content = citableBlocks(text);
	return {
		type: 'search_result',
		source,
		title,
		content: content.length > 0 ? content : [{ type: 'text', text: '(this section has no text)' }],
		citations: { enabled: true }
	};
}

/** Longest unit text returned by read_manual_unit. */
const MAX_UNIT_CHARS = 12_000;

export const searchManualTool = defineTool({
	name: 'search_manual',
	label: 'search manual',
	kind: 'read',
	description:
		'Search the OP-XY manual for the units that best match a query (keywords work best: "parameter lock", "shift M1", "tape length"). Returns the best passages as citable search results, each titled with the unit id in brackets that read_manual_unit takes for the full text.',
	input: z.object({
		query: z.string().min(2).max(200).describe('What to look for'),
		limit: z.int().min(1).max(8).optional().describe('How many sections (default 4)')
	}),
	async run(input, ctx) {
		const hits = await ctx.env.manual.search(input.query, input.limit ?? 4);
		if (hits.length === 0) {
			return {
				content: `No manual section matched "${input.query}". Try other words, or answer from the manual in your instructions and say what you could not find.`,
				summary: 'no matches'
			};
		}
		// A tool result that carries search results may contain nothing else, so each result's title
		// carries the id read_manual_unit takes.
		const blocks: ToolResultBlock[] = hits.map((h) =>
			searchResult(
				`${h.title} [${h.id}]${h.origin === 'dev-guide' ? ' (development supplement)' : ''}`,
				h.source || h.id,
				h.snippet
			)
		);
		return {
			content: blocks,
			summary: `${hits.length} match${hits.length === 1 ? '' : 'es'}: ${hits
				.slice(0, 3)
				.map((h) => h.title)
				.join(', ')}`
		};
	}
});

export const readManualUnitTool = defineTool({
	name: 'read_manual_unit',
	label: 'read manual',
	kind: 'read',
	description:
		'Read one manual unit in full, by the id that search_manual returned (or its exact title). Returns it as a citable search result.',
	input: z.object({
		id: z.string().min(1).max(120).describe('Unit id, e.g. "sequencer.parameter-locks"')
	}),
	async run(input, ctx) {
		const unit = await ctx.env.manual.unit(input.id);
		if (!unit) {
			return errorResult(
				`There is no manual unit "${input.id}". Use search_manual to find the right id.`,
				'unit not found'
			);
		}
		const text =
			unit.text.length > MAX_UNIT_CHARS
				? `${unit.text.slice(0, MAX_UNIT_CHARS)}\n\n[truncated]`
				: unit.text;
		return {
			content: [searchResult(unit.title, unit.source || unit.id, text)],
			summary: unit.title
		};
	}
});

/** How long a demonstration's result stays on the replica before it goes back, ms. */
export const DEMO_HOLD_MS = 700;

/**
 * show_on_replica with `guide`: the sequence rehearsed on a copy of the replica, then lit one
 * combo at a time for the user to press (a beginner asked to be walked through a beat key by
 * key, and the walkthrough knew only the way to a page or a value).
 */
function guideKeys(keys: string, caption: string | undefined, ctx: ToolContext): ToolResult {
	const { guide, virtual } = ctx.env;
	if (!guide || !virtual) {
		return jsonResult(
			{ guided: false, keys, reason: 'No replica walkthrough in this view.' },
			`${keys} (no walkthrough here)`
		);
	}
	let steps: ReturnType<typeof virtual.rehearse>;
	try {
		steps = virtual.rehearse(keys);
	} catch (error) {
		return errorResult(
			`Not a walkthrough: ${error instanceof Error ? error.message : String(error)}.`,
			'cannot guide this'
		);
	}
	guide.start(caption ?? keys, steps);
	// a step key pressed alone where a note is takes it off (a lesson on a step's own cutoff lit
	// "step 7" last, and the user's press deleted the note there): said, from the rehearsal
	const noted = (music: string | undefined) => {
		try {
			const notes = (JSON.parse(music ?? '{}') as { notes?: unknown[][] }).notes ?? [];
			return notes.flatMap((t) => t.slice(1)).filter((x) => /^\d+:\d/.test(String(x))).length;
		} catch {
			return 0;
		}
	};
	const lone = steps
		.filter(
			(s, i) => i > 0 && /^step \d+$/.test(s.keys) && noted(s.music) < noted(steps[i - 1].music)
		)
		.map((s) => s.keys);
	// a lesson that ends armed to record: how the take is played here (an agent taught the arming
	// and never said how the user plays notes on the replica, and the take stayed empty)
	const armed = (() => {
		try {
			const { recording } = JSON.parse(steps.at(-1)?.music ?? '{}') as { recording?: string };
			return recording !== undefined && recording !== 'off';
		} catch {
			return false;
		}
	})();
	return jsonResult(
		{
			guided: true,
			steps: steps.map((s) => s.keys),
			note: 'The replica now lights each step in turn and waits for the user: tell them to follow the lit keys. It moves on by itself once a press has done what the step does, and says when the last one is done.',
			...(lone.length
				? {
						caution: `${lone.join(', ')} pressed alone takes off the note there. For a step's own value (a parameter lock: the step held while an encoder turns), stop this and use the key planner with step and guide instead.`
					}
				: {}),
			...(armed
				? {
						take: 'The last step arms recording. Then the user plays the take on the replica’s keys, with the mouse or the computer keyboard (the Z row the lower twelve, the Q row the upper), and stop ends it: say so with the steps.'
					}
				: {})
		},
		`guiding ${keys}`
	);
}

export const showOnReplicaTool = defineTool({
	name: 'show_on_replica',
	label: 'show on replica',
	kind: 'ui',
	description:
		'Animate a key combo on the replica next to the chat, so the user sees which keys to press and in what order. Takes one combo in the key grammar ("shift + M1", "record + play", "step 5 + turn E2", "shift → step 1", "hold com"); → chains several ("T3 → shift + M3"); the keys before a + stay held, and + at the start of the next combo keeps them held ("key G3 + record → + step 5 → + step 13": the snare held while its steps are pressed; "hold" goes only on a last key). Keyboard keys are key F3 … key E5, named by the note they play at the default octave (for a lower note, [-] first: still key F3 to key E5). The keys play from wherever the replica stands, as presses would (start with the track key when the user names a track, and write the same steps in your answer as you showed); once the result has been seen the replica goes back to where it was, so the user can try it from there, and the call returns then. Nothing stays changed: to leave the replica changed, use the key planner with show. Sends nothing to the device. When the user asks how to do something on the device, play the main combination once, before you write the answer, and do not mention that you did (unless they asked to see it shown). When they want to do it themselves key by key ("walk me through it", "light the keys"), guide instead: the replica lights each combo and waits for their press.',
	input: z.object({
		keys: z.string().min(1).max(120).describe('One key combo in the key grammar'),
		caption: z.string().max(160).optional().describe('What the combo does, in a few words'),
		guide: z
			.boolean()
			.optional()
			.describe(
				'true: instead of playing it, light the keys one combo at a time and wait for the user to press each (a walkthrough to follow by hand: presses, not turns; for turns and a step held while turning, a parameter lock, the key planner with guide)'
			)
	}),
	async run(input, ctx) {
		const parsed = tryParseKeys(input.keys);
		if (!parsed.ok) {
			return errorResult(
				`"${input.keys}" is not in the key grammar: ${parsed.error.message}. Controls are written like shift, record, M1, T3, step 5, E2, key C4.`,
				'not a key combo'
			);
		}
		const keys = formatKeys(parsed.value);
		if (input.guide) return guideKeys(keys, input.caption, ctx);
		const replica = ctx.env.replica;
		if (!replica) {
			return jsonResult(
				{ shown: false, keys, reason: 'No replica is on screen.' },
				`${keys} (no replica)`
			);
		}
		ctx.env.guide?.stop();
		// where the keys started from, in mode and screen: a song-mode demo of shift + arrange from
		// instrument mode ended on arrange, and the agent described the song page it never reached
		const start = ctx.env.screen?.read() ?? null;
		const startedFrom = start
			? `${start.mode ? `${start.mode} mode, ` : ''}the screen on ${start.shows}`
			: null;
		// a chain's screen after each combo, from a rehearsal on a copy: which key landed where (an
		// agent could check only the screen the demo ended on)
		let screens: { keys: string; screen: string; transport?: string }[] = [];
		try {
			const rehearsed = ctx.env.virtual?.rehearse(keys) ?? [];
			// with the transport where a step starts it (a count-in's second press reads the same screen)
			if (rehearsed.length > 1)
				screens = rehearsed.map((s) => ({
					keys: s.keys,
					screen: s.screen,
					...(s.transport ? { transport: s.transport } : {})
				}));
		} catch {
			screens = [];
		}
		// A demonstration leaves nothing behind (docs/research episodes: a demo that muted track 2
		// or entered a kick left the user's own try starting from somewhere else). Unless the user
		// takes over while it plays: then what they did stays.
		const virtual = ctx.env.virtual;
		const before = virtual?.checkpoint() ?? null;
		const wasPlaying = virtual?.status().playing ?? false;
		let tookOver = false;
		const stop = replica.subscribe((event) => {
			if (event.source === 'pointer' || event.source === 'keyboard') tookOver = true;
		});
		const handle = replica.animate(parsed.value);
		const onAbort = () => handle.cancel();
		ctx.signal.addEventListener('abort', onAbort, { once: true });
		let outcome: 'finished' | 'cancelled';
		// what the demo leads to, read before the replica goes back (an agent described it blind)
		let ended: string | null = null;
		// and what it did, before it is put back (a mute shown left an agent unsure it muted)
		let did: readonly string[] = [];
		// the transport at its end, which the screen does not show (record + play shown read as the
		// sound page alone, and an agent could not tell the replica had armed)
		let state: string | null = null;
		try {
			outcome = await handle.done;
			if (outcome === 'finished') {
				// a list in full: its items and the highlighted one, not that item alone
				const reading = ctx.env.screen?.read();
				ended = reading ? (reading.list ?? reading.shows) : null;
				try {
					did = before ? (virtual?.changesSince(before) ?? []) : [];
					const status = virtual?.status();
					const track = status ? `T${status.selectedTrack}` : '';
					state =
						status?.recording === 'armed'
							? `recording armed on ${track}: the first note played starts playback and the take`
							: status?.recording === 'count-in'
								? `${track} counting in to record`
								: status?.recording === 'on'
									? `recording on ${track}: what is played on the keys lands in its pattern`
									: status?.playing
										? 'playing'
										: null;
				} catch {
					did = [];
				}
				await sleep(DEMO_HOLD_MS, ctx.env.timers, ctx.signal);
			}
		} catch {
			outcome = 'cancelled';
		} finally {
			ctx.signal.removeEventListener('abort', onAbort);
			stop();
		}
		// a demo cut short by another one is the other's to put back
		const putBack =
			before !== null &&
			!tookOver &&
			(outcome === 'finished' || ctx.signal.aborted) &&
			virtual!.revert(before);
		// playback the demo started is stopped again: a take-back leaves the transport to the player,
		// and after a count-in shown, "back where it was" played on, read as the user's own playback
		const stopped =
			!!virtual &&
			!tookOver &&
			(outcome === 'finished' || ctx.signal.aborted) &&
			!wasPlaying &&
			virtual.status().playing;
		if (stopped && virtual) virtual.transport('stop');
		// the record page hears a stand-in input, so whether a held key keeps a take turns on where
		// the stand-in is: a step read "take 1.wav", the end "kick 1.wav", and an agent could not
		// tell whether anything had been recorded
		const recordPage = [...screens.map((s) => s.screen), ended ?? ''].some((t) =>
			/\brecord\b[^:]*:/.test(t)
		);
		const takeIn = (t: string | null | undefined) => /\btake \d+\.wav\b/.exec(t ?? '')?.[0] ?? null;
		const kept =
			did.some((l) => /\btake \d+\b/.test(l)) ||
			(takeIn(ended) !== null && takeIn(ended) !== takeIn(start?.shows));
		const recorder =
			recordPage && /\bhold\b/.test(keys)
				? `The replica has no microphone: its record page hears a stand-in input, so a take on it is pretend (${kept ? 'this time it kept one' : 'this time it kept none: the stand-in stayed under the threshold while the key was held'}), and the steps, rehearsed on a copy, can disagree. On the unit, the hold arms the recorder and the take begins once the real input passes the threshold.`
				: null;
		const caption = input.caption ? `${keys}: ${input.caption}` : `showed ${keys}`;
		return jsonResult(
			{
				shown: outcome === 'finished',
				keys,
				seconds: Math.round(handle.plan.duration / 100) / 10,
				...(startedFrom ? { startedFrom } : {}),
				...(screens.length ? { steps: screens } : {}),
				...(ended ? { screenAtEnd: ended } : {}),
				...(state ? { transportAtEnd: state } : {}),
				...(recorder ? { recorder } : {}),
				...(did.length ? { whileShown: did } : {}),
				// a step entry shown on a step that already held the notes takes them off (a chord
				// "entered" for a beginner was the chord removed, for a moment)
				...(did.some((l) => /\bremoved\b/.test(l))
					? {
							caution:
								'As shown, the keys took notes off: a key pressed with a step that holds its note removes it. To show notes going on, show it on an empty step or pattern.'
						}
					: {}),
				replica: stopped
					? 'back where it was, the playback the demo started stopped again (nothing records): the user can try it from there'
					: putBack
						? 'back where it was: the user can try it from there'
						: tookOver
							? 'the user took over while it played; what they did stays'
							: 'unchanged'
			},
			caption
		);
	}
});

export const readScreenTool = defineTool({
	name: 'read_screen',
	label: 'read screen',
	kind: 'read',
	description:
		"What the replica's screen shows right now: the app's simulation of the OP-XY's interface (it follows the user's presses on the replica and your show_on_replica animations; it cannot see the real device's screen). Gives the page and its values, the mode, the selected track and engine, shift, tempo and the simulated transport. Use it first whenever the user mentions what their screen shows, asks where they are or seems lost, and to check where a combo landed; answer from what it shows.",
	input: z.object({}),
	async run(_input, ctx) {
		const screen = ctx.env.screen;
		if (!screen) {
			return jsonResult(
				{ available: false, reason: 'No replica screen in this view.' },
				'no screen'
			);
		}
		const reading = screen.read();
		return jsonResult(
			reading,
			reading.shows.length > 60 ? `${reading.shows.slice(0, 57)}…` : reading.shows
		);
	}
});

const todoSchema = z.object({
	content: z.string().min(1).max(200).describe('The step, in a few words'),
	status: z.enum(['pending', 'in_progress', 'completed'])
});

export const writeTodosTool = defineTool({
	name: 'write_todos',
	label: 'plan',
	kind: 'ui',
	description:
		'Write the plan for a multi-step job as a checklist the user sees next to the chat. Send the whole list every time (it replaces the previous one) and keep exactly one step in_progress while working. Skip it for simple questions.',
	input: z.object({ todos: z.array(todoSchema).max(20).describe('The whole plan, in order') }),
	async run(input, ctx) {
		const todos: Todo[] = input.todos.map((t) => ({ content: t.content, status: t.status }));
		ctx.env.plan.set(todos);
		const done = todos.filter((t) => t.status === 'completed').length;
		return {
			content: `Plan saved (${done} of ${todos.length} done).`,
			summary: `plan: ${done} of ${todos.length} done`
		};
	}
});

/** Subagents the `task` tool can start. */
export const SUBAGENT_TYPES = ['manual-expert'] as const;

export const taskTool = defineTool({
	name: 'task',
	label: 'ask the manual expert',
	kind: 'read',
	description:
		'Delegate a research question to a subagent with a fresh context. manual-expert: reads the manual carefully and returns a compact, cited answer with key combos; use it for comparisons, questions spanning several sections, or when exact citations matter. Give it the complete question and any context it needs: it cannot see this conversation.',
	input: z.object({
		subagent_type: z.enum(SUBAGENT_TYPES).describe('Which subagent'),
		description: z.string().min(10).max(4000).describe('The complete task, self-contained')
	}),
	async run(input, ctx) {
		if (!ctx.env.runSubagent)
			return errorResult('Subagents are not available here.', 'no subagents');
		const result = await ctx.env.runSubagent(input.subagent_type, input.description, ctx);
		const sources =
			result.sources.length > 0
				? `\n\nSources the ${input.subagent_type} cited:\n${result.sources.map((s) => `- ${s.title}: ${s.source}`).join('\n')}`
				: '';
		const text = (result.text.trim() || '(the subagent returned no text)') + sources;
		return {
			content: text,
			summary: `${input.subagent_type.replace(/-/g, ' ')} answered${result.sources.length ? ` (${result.sources.length} sources)` : ''}`,
			isError: result.stopReason === 'error'
		};
	}
});

/** Knowledge and teaching tools. */
export const KNOWLEDGE_TOOLS = [
	searchManualTool,
	readManualUnitTool,
	showOnReplicaTool,
	readScreenTool,
	writeTodosTool,
	taskTool
];
