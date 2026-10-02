/**
 * `run_lab`: the model's own program, run in the lab (`../lab`) against forks of the replica, so it
 * can compute, try options, measure them and keep the best in one call instead of forty. The
 * replica changes only through the program's commits, which land when it finishes, as one change
 * the user can undo: the result carries its inverse, a revert that only the app's undo runs.
 */
import { z } from 'zod';
import type { LabOutcome } from '../lab/host';
import type { LabRunResult } from '../lab/run';
import { UNDO_CALL_PREFIX } from './device';
import { defineTool, errorResult, jsonResult, type ToolResult } from './define';
import { arrangementView } from './virtual';

/** Seconds a program may run when the model does not say. */
export const LAB_SECONDS = 20;

/** The undo's program: taking a landed run back (see `revertPoint`). */
const revertCode = (point: string) => `lab.revert(${JSON.stringify(point)})`;
/** The call that takes a landed run back. */
const undoOf = (purpose: string, point: string) => ({
	tool: 'run_lab',
	input: { purpose: `undo: ${purpose}`, code: revertCode(point) },
	label: `the replica back as it was before “${purpose}”`
});

/** The undo point a revert names, when `code` is one and the call is the app's undo. */
function revertPoint(code: string, toolCallId: string): string | null {
	if (!toolCallId.startsWith(UNDO_CALL_PREFIX)) return null;
	return /^lab\.revert\("([\w-]+)"\)$/.exec(code.trim())?.[1] ?? null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A run's purpose without the undo's or redo's mark ("undo: try two mappings"). */
const purposeOf = (purpose: string) => purpose.replace(/^(undo|redo): /, '');

/** Commit lines the result lists in all, before the rest are counted. */
const CHANGE_LINES = 90;

/** Each commit's changes, the later ones counted once the list is long. */
function commitsOf(result: LabRunResult) {
	let room = CHANGE_LINES;
	return result.commits.map((c) => {
		const shown = c.changes.slice(0, Math.max(0, room));
		room -= shown.length;
		const more = c.changes.length - shown.length;
		return { label: c.label, changes: more ? [...shown, `and ${more} more changes`] : shown };
	});
}

/** The result as the model reads it: what was printed and returned, what landed, what failed. */
function view(result: LabRunResult, landed: boolean, offered: boolean) {
	const commits = commitsOf(result);
	const takes = offered
		? (result.takes ?? []).map(({ label, changes }) => ({ label, changes }))
		: [];
	return {
		ok: result.ok,
		...(result.logs ? { logs: result.logs } : {}),
		...(result.value !== undefined ? { value: result.value } : {}),
		...(result.error
			? {
					error: result.error.message,
					...(result.error.line !== undefined ? { line: result.error.line } : {}),
					...(result.error.code !== undefined ? { code: result.error.code } : {})
				}
			: {}),
		...(commits.length ? { commits } : {}),
		...(takes.length
			? {
					takes,
					offered:
						'the takes wait in the chat under this run: the user hears each on the replica with the loop and keeps one, or none; none is on the replica until they do, and their next message says which they kept'
				}
			: {}),
		replica: landed
			? 'changed: the commits are on the replica now, as one change the user can undo'
			: result.ok
				? commits.length
					? 'unchanged: the commits change nothing on the replica as it stands'
					: 'unchanged: nothing was committed'
				: 'unchanged: a program that fails or is stopped changes nothing',
		ms: result.ms
	};
}

/** One lowercase line for the chip. */
function chip(purpose: string, result: LabRunResult, landed: boolean, takes = 0): string {
	const label = purpose.trim().toLowerCase();
	if (!result.ok) {
		const why =
			result.error?.kind === 'timeout'
				? 'ran out of time'
				: result.error?.kind === 'stopped'
					? 'stopped'
					: `failed${result.error?.line ? ` on line ${result.error.line}` : ''}`;
		return `${label}: ${why}`;
	}
	const parts = [plural(result.forks, 'fork')];
	if (result.listens) parts.push(plural(result.listens, 'listen'));
	if (landed) parts.push('committed');
	if (takes) parts.push(`${takes} takes to hear`);
	return `${label}: ${parts.join(', ')}`;
}

export const runLabTool = defineTool({
	name: 'run_lab',
	label: 'run lab',
	kind: 'mutate',
	approval: 'auto',
	// one long code string and an optional limit: kept out of the strict grammar, checked by zod
	strict: false,
	description: [
		'Run a short JavaScript program in the lab: a sandbox where forks (copies) of the replica let you compute, try options, measure them and keep the best, in one call instead of many. code is the body of an async function (await works; return a value to read it back); in scope are only lab and console. console.log / lab.log print; what is printed and returned comes back, cut at about 10,000 characters, so print summaries. There is no network, no storage, no DOM, no imports and no connected OP-XY, and the program stops at timeout_s.',
		'lab.fork() copies the replica as it stands, lab.fork(other) another fork. A fork has the replica’s own calls: status(), readPattern(track, pattern?) ({track, pattern, patterns, current, bars, length, scale, notes: [{step, note, velocity, length, sound?}]}), writePattern(track, {pattern?, bars?, length?, scale?, stay?, groove?, notes: [{step, note, velocity?, length?}] or "1:A2:4 5:C3+E3:2"}), readArrangement(), writeArrangement({scenes?: [{scene, patterns: [{track, pattern}] | null, mix?: [{track, level?, muted?}]}], song?: {order, loop}}), readSound(track), setTempo(bpm), setMetronome(on), setMuted(track, muted), selectTrack(track); and set({param, value, track?, area?, page?, key?, step?}) or set([...]) (a setting reached through the keys, as plan_steps takes it, step for one step’s lock; throws when it cannot be reached), plan(setting) (the steps set would play, without playing them), press(keys, clicks?) (the key grammar, a turn with its detents; returns the screen), screen(), diff(other?) (what changed, in words).',
		'lab.files.names() and lab.files.midi(name) read attached MIDI files (their notes[].track, tracks[].index and channels count from 0); lab.midi.shapes(file) says what each track plays, lab.midi.plan(file, {tracks: [{midi, to, transpose?, drums?}], fromBar?, toBar?}) plans an import as import_midi does (plan.tracks[i].asWritten is the share of notes that play as written) and lab.midi.write(fork, plan, {keepOthers?}) writes it. await lab.listen(fork, {seconds?, tracks?: "each" or [1, 3], scene?, song?: {entry?, bar?}}) renders a fork offline through the replica’s sound and hears it (those options only, no focus): scene loops one scene; song hears the song from an entry (and a bar of it) on across the parts that follow, each part’s loudness listed, to check a change of part (16 s by default, 30 at most). A fork lives for its run alone: listen and commit or offer in the same program.',
		'Nothing reaches the replica until lab.commit(fork, label): when the program finishes without an error, what the committed forks changed lands on the replica as one change the user can undo; what they left alone stays. Where the user should choose by ear (basslines, kits, a sound two ways), lab.offer(fork, label) offers forks as takes instead, two or three a run: the chat shows them under the run, the user hears each on the replica with the loop and keeps one; nothing lands until they do. A program that throws or runs out of time changes nothing. Numbers are the device’s: tracks 1–16, patterns 1–16, scenes 1–99, steps 1–64. The lab skill has worked examples.'
	].join(' '),
	input: z.object({
		purpose: z
			.string()
			.min(1)
			.max(80)
			.describe('What the program does, in a few words, for the chat ("try two mappings")'),
		code: z
			.string()
			.min(1)
			.max(20_000)
			.describe('The body of an async function, with lab and console in scope'),
		timeout_s: z
			.number()
			.min(1)
			.max(60)
			.optional()
			.describe(`Seconds it may run (default ${LAB_SECONDS})`)
	}),
	preview(input) {
		return { label: `lab: ${input.purpose.trim().toLowerCase()}` };
	},
	async run(input, ctx): Promise<ToolResult> {
		const host = ctx.env.lab;
		if (!host) {
			return errorResult(
				'The lab is not available here (no replica to fork). Use the other tools directly.',
				'no lab here'
			);
		}
		const point = revertPoint(input.code, ctx.toolCallId);
		if (point) {
			// the app's undo (or its redo): the replica back as it was before the run
			const landed = host.revert(point);
			if (!landed) {
				return errorResult(
					'That lab change can no longer be undone here (it is too old, or from before a reload).',
					'too old to undo'
				);
			}
			const purpose = purposeOf(input.purpose);
			const redo = input.purpose.startsWith('redo: ');
			return jsonResult({ reverted: true }, redo ? 'redone' : 'undone', {
				applied: true,
				inverse: redo
					? undoOf(purpose, landed.point)
					: {
							tool: 'run_lab',
							input: { purpose: `redo: ${purpose}`, code: revertCode(landed.point) },
							label: `“${purpose}” again`
						}
			});
		}
		let outcome: LabOutcome;
		try {
			outcome = await host.run(input.code, {
				files: ctx.env.files ?? null,
				signal: ctx.signal,
				timeoutMs: Math.round((input.timeout_s ?? LAB_SECONDS) * 1000)
			});
		} catch (error) {
			if (ctx.signal.aborted) throw error;
			return errorResult(
				`The lab failed: ${error instanceof Error ? error.message : String(error)}`,
				'lab failed'
			);
		}
		if (ctx.signal.aborted && !outcome.landed) {
			throw new Error('stopped');
		}
		const { result, landed } = outcome;
		const takes = outcome.offer ? (result.takes ?? []) : [];
		const summary = chip(input.purpose, result, landed !== null, takes.length);
		// scenes or the song changed: the arrangement as it landed, scene by scene (an agent that
		// built a whole song in one program had only the change lines to describe it from)
		const virtual = ctx.env.virtual;
		const reshaped =
			landed !== null &&
			result.commits.some((c) => c.changes.some((l) => /^(scene \d+|song):/.test(l)));
		const status = reshaped && virtual ? virtual.status() : null;
		const arrangement =
			status && virtual
				? arrangementView(
						virtual.readArrangement(),
						status.bpm,
						new Map(status.tracks.map((t) => [t.track, t.byPattern]))
					)
				: null;
		// playback through a commit (an agent could not tell whether a commit restarted the song)
		const playing = landed !== null && virtual ? virtual.status().playing : false;
		const content = {
			...view(result, landed !== null, takes.length > 0),
			...(arrangement ? { arrangement } : {}),
			...(playing
				? {
						playback:
							'goes on where it was, with the commits in it; transport play starts it again from the top'
					}
				: {})
		};
		if (!result.ok) {
			return { content: JSON.stringify(content), summary, isError: true, applied: false };
		}
		return jsonResult(content, summary, {
			applied: landed !== null,
			...(landed ? { inverse: undoOf(input.purpose, landed.point) } : {}),
			...(outcome.offer && takes.length > 0
				? {
						display: {
							kind: 'takes' as const,
							offer: outcome.offer,
							takes: takes.map(({ label, changes }) => ({ label, changes }))
						}
					}
				: {})
		});
	}
});

/** The lab's tools. */
export const keepTakeTool = defineTool({
	name: 'keep_take',
	label: 'keep take',
	kind: 'mutate',
	approval: 'auto',
	// one string: kept out of the strict grammar's budget
	strict: false,
	description:
		'Keep one of the takes your last lab run offered when the user names it in words ("the second one", "B", "the walking one") instead of tapping it: it goes on the replica and stays, as their tap would do, and the rest are dropped. The next message says whether takes are waiting; once one is kept, write further changes as usual.',
	input: z.object({
		take: z
			.string()
			.min(1)
			.max(60)
			.describe('The take: its letter (A, B, …), its number from 1, or its label')
	}),
	async run(input, ctx) {
		const takes = ctx.env.takes;
		if (!takes) return errorResult('There are no takes in this session.', 'no takes');
		const outcome = takes.keep(input.take);
		if ('error' in outcome) return errorResult(outcome.error, 'not kept');
		return jsonResult(
			{
				kept: outcome.kept,
				changes: outcome.changes,
				note: 'On the replica now, as one change the user can undo; the other takes are gone.'
			},
			`kept “${outcome.kept}”`,
			{ applied: true }
		);
	}
});

export const LAB_TOOLS = [runLabTool, keepTakeTool];
