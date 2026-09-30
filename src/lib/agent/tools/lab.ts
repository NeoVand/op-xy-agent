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

/** The result as the model reads it: what was printed and returned, what landed, what failed. */
function view(result: LabRunResult, landed: boolean) {
	const commits = result.commits.map((c) => ({ label: c.label, changes: c.changes }));
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
function chip(purpose: string, result: LabRunResult, landed: boolean): string {
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
		'Run a short JavaScript program in the lab: a sandbox where forks (copies) of the replica let you compute, try options, measure them and keep the best, in one call instead of many. code is the body of an async function (await works; return a value to read it back); in scope are only lab and console. console.log / lab.log print; what is printed and returned comes back, cut at about 10,000 characters, so print summaries. There is no network, no storage, no DOM, no timers for strings, no imports and no connected OP-XY; the program stops at timeout_s.',
		'lab.fork() copies the replica as it stands, lab.fork(other) another fork. A fork has the replica’s own calls: status(), readPattern(track, pattern?), writePattern(track, {pattern?, bars?, length?, scale?, notes: [{step, note, velocity?, length?}]}), readArrangement(), writeArrangement({scenes?: [{scene, patterns: [{track, pattern}] | null}], song?: {order, loop}}), readSound(track), setTempo(bpm), setMetronome(on), setMuted(track, muted), selectTrack(track); and set({param, value, track?, area?, page?, key?}) or set([...]) (a setting reached through the keys, as plan_steps takes it; throws when it cannot be reached), press(keys, clicks?) (the key grammar, a turn with its detents; returns the screen), screen(), diff(other?) (what changed, in words).',
		'lab.files.names() and lab.files.midi(name) read attached MIDI files (their notes[].track, tracks[].index and channels count from 0); lab.midi.shapes(file) says what each track plays, lab.midi.plan(file, {tracks: [{midi, to, transpose?, drums?}], fromBar?, toBar?}) plans an import as import_midi does (plan.tracks[i].asWritten is the share of notes that play as written) and lab.midi.write(fork, plan, {keepOthers?}) writes it. await lab.listen(fork, {seconds?, tracks?: "each", scene?}) renders a fork offline through the replica’s sound and hears it (the song does not move on while it renders: hear later parts by scene).',
		'Nothing reaches the replica until lab.commit(fork, label): when the program finishes without an error, what the committed forks changed lands on the replica as one change the user can undo; what they left alone stays. A program that throws or runs out of time changes nothing. Numbers are the device’s: tracks 1–16, patterns 1–16, scenes 1–99, steps 1–64. The lab skill has worked examples.'
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
		const summary = chip(input.purpose, result, landed !== null);
		const content = view(result, landed !== null);
		if (!result.ok) {
			return { content: JSON.stringify(content), summary, isError: true, applied: false };
		}
		return jsonResult(content, summary, {
			applied: landed !== null,
			...(landed ? { inverse: undoOf(input.purpose, landed.point) } : {})
		});
	}
});

/** The lab's tools. */
export const LAB_TOOLS = [runLabTool];
