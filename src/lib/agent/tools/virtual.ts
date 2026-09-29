/**
 * Programming tools for the virtual OP-XY (the replica on screen, `../virtual-opxy.ts`): write and
 * read a track's pattern, and set scenes and the song. They always act on the virtual machine,
 * connected device or not, because the real OP-XY cannot receive patterns over MIDI; its projects
 * come with native project files later (plan M6). Every change can be undone: each tool's inverse
 * writes back what was there before.
 */
import { z } from 'zod';
import { parseNoteName } from '$lib/core/midi/notes';
import type { ArrangementWrite, VirtualArrangement, VirtualPattern } from '../virtual-opxy';
import {
	defineTool,
	errorResult,
	jsonResult,
	type AgentEnvironment,
	type ToolResult
} from './define';

const NO_VIRTUAL = 'There is no replica in this session, so nothing was written.';

/** Track scales the OP-XY offers (bar + a black key). */
const SCALES = ['1', '2', '3', '4', '5', '6', '7', '8', '16', '1/2'] as const;
const scaleValue = (scale: (typeof SCALES)[number]) => (scale === '1/2' ? 0.5 : Number(scale));
const scaleName = (scale: number) => (scale === 0.5 ? '1/2' : String(scale));

const noteSchema = z
	.union([z.int().min(0).max(127), z.string().min(2).max(4)])
	.describe('A MIDI note number (60 = middle C) or a note name such as "C4" or "F#3" (C4 = 60)');

const patternNoteSchema = z.object({
	step: z.int().min(1).max(64).describe('Step 1–64; bar 2 starts at step 17'),
	note: noteSchema,
	velocity: z.int().min(1).max(127).optional().describe('How hard (default 100)'),
	length: z
		.number()
		.min(0.05)
		.max(64)
		.optional()
		.describe('How long, in steps (default 1; 4 = a quarter note at track scale 1)')
});

function virtualOf(env: AgentEnvironment) {
	return env.virtual ?? null;
}

/** A pattern as the model reads it: compact, notes grouped by step. */
function patternView(p: VirtualPattern) {
	const byStep = new Map<
		number,
		{ note: number; sound?: string; velocity: number; length: number }[]
	>();
	for (const n of p.notes) {
		const list = byStep.get(n.step) ?? [];
		list.push({
			note: n.note,
			...(n.sound ? { sound: n.sound } : {}),
			velocity: n.velocity,
			length: n.length
		});
		byStep.set(n.step, list);
	}
	const grid = drumGrid(p);
	return {
		track: p.track,
		pattern: p.pattern,
		patternsOnTrack: p.patterns,
		playing: p.playing,
		bars: p.bars,
		length: p.length,
		scale: scaleName(p.scale),
		noteCount: p.notes.length,
		...(grid ? { grid } : {}),
		steps: [...byStep.entries()].map(([step, notes]) => ({ step, notes }))
	};
}

/**
 * A drum pattern as a drummer's grid, one line per sound, a bar per group of sixteen steps (x a
 * hit, . a rest): "kick 1": "x...x...x...x...", so what plays where reads at a glance.
 */
function drumGrid(p: VirtualPattern): Record<string, string> | null {
	const sounds = new Map<string, { note: number; steps: Set<number> }>();
	for (const n of p.notes) {
		if (!n.sound) continue;
		const entry = sounds.get(n.sound) ?? { note: n.note, steps: new Set<number>() };
		entry.steps.add(n.step);
		sounds.set(n.sound, entry);
	}
	if (sounds.size === 0) return null;
	const grid: Record<string, string> = {};
	for (const [sound, { steps }] of [...sounds].sort((a, b) => a[1].note - b[1].note)) {
		const bars = Array.from({ length: p.bars }, (_, bar) =>
			Array.from({ length: 16 }, (_, i) => (steps.has(bar * 16 + i + 1) ? 'x' : '.')).join('')
		);
		grid[sound] = bars.join(' ');
	}
	return grid;
}

// ─── write_pattern ──────────────────────────────────────────────────────────────────────────────

export const writePatternTool = defineTool({
	name: 'write_pattern',
	label: 'write pattern',
	kind: 'mutate',
	approval: 'auto',
	description:
		'Program one pattern of one track on the replica (on screen, it plays in the browser): its notes step by step, bars, length and track scale. Replaces what the pattern held and makes it the pattern the track plays. Up to 120 notes and 4 bars (64 steps) per pattern, 16 patterns per track; drum tracks (1 and 2 in a new project) have one sound per note, 53–76, in the layout TE’s kits share: 53–54 kicks, 55–56 snares, 57 rim, 58 clap, 59 tambourine, 60 shaker, 61–62 closed hats, 63 open hat, 64 clave, 65 low tom, 66 ride, 67 mid tom, 68 crash, 69 high tom, 70 triangle, 71–72 congas, 73 cowbell, 74 guiro, 75 metal, 76 chi. The real OP-XY cannot receive patterns over MIDI, so this always writes to the replica, even with a device connected. Undo restores the previous pattern. Use write_arrangement for scenes and the song, transport to hear it.',
	input: z.object({
		track: z.int().min(1).max(16).describe('Track 1–16 (1–8 instrument, 9–16 auxiliary)'),
		pattern: z.int().min(1).max(16).optional().describe('Pattern 1–16 (default 1)'),
		bars: z
			.int()
			.min(1)
			.max(4)
			.optional()
			.describe('Bars of 16 steps (default: enough for the last step written)'),
		length: z
			.int()
			.min(1)
			.max(64)
			.optional()
			.describe('Steps that play, if the last bar is shorter (default: all)'),
		scale: z
			.enum(SCALES)
			.optional()
			.describe('Track scale: how many sixteenths one step lasts (default: unchanged)'),
		notes: z.array(patternNoteSchema).max(120).describe('The notes, in any order; empty clears')
	}),
	snapshot(input, env): VirtualPattern | null {
		const virtual = virtualOf(env);
		if (!virtual) return null;
		try {
			return virtual.readPattern(input.track, input.pattern ?? 1);
		} catch {
			return null;
		}
	},
	preview(input, before) {
		const count = input.notes.length;
		return {
			label: `track ${input.track} pattern ${input.pattern ?? 1}: ${count} note${count === 1 ? '' : 's'}`,
			before: before ? `${before.notes.length} notes` : 'empty',
			after: `${count} notes`
		};
	},
	inverse(input, before) {
		if (!before) return null;
		return {
			tool: 'write_pattern',
			input: {
				track: input.track,
				pattern: before.pattern,
				bars: before.bars,
				length: before.length,
				scale: scaleName(before.scale),
				notes: before.notes.map((n) => ({
					step: n.step,
					note: n.note,
					velocity: n.velocity,
					length: n.length
				}))
			},
			label: `track ${input.track} pattern ${before.pattern} back as it was`
		};
	},
	async run(input, ctx): Promise<ToolResult> {
		const virtual = virtualOf(ctx.env);
		if (!virtual) return errorResult(NO_VIRTUAL, 'no virtual op-xy');
		const invalid: string[] = [];
		const notes = input.notes.map((n) => {
			const note = typeof n.note === 'number' ? n.note : parseNoteName(n.note, 'c4');
			if (note === null) invalid.push(String(n.note));
			return { step: n.step, note: note ?? 0, velocity: n.velocity ?? 100, length: n.length ?? 1 };
		});
		if (invalid.length > 0) {
			return errorResult(
				`Unknown note names: ${invalid.join(', ')}. Use MIDI numbers (60 = middle C) or names like C4, F#3, Bb2.`,
				'bad note names'
			);
		}
		const lastStep = notes.reduce((max, n) => Math.max(max, n.step), 1);
		const bars = input.bars ?? Math.ceil(lastStep / 16);
		if (lastStep > bars * 16) {
			return errorResult(
				`Step ${lastStep} does not fit in ${bars} bar${bars === 1 ? '' : 's'} (${bars * 16} steps).`,
				'step outside the pattern'
			);
		}
		try {
			const written = virtual.writePattern(input.track, {
				pattern: input.pattern ?? 1,
				bars,
				length: input.length,
				scale: input.scale === undefined ? undefined : scaleValue(input.scale),
				notes
			});
			return jsonResult(
				{ written: patternView(written), note: 'On the replica.' },
				`track ${input.track} pattern ${written.pattern}: ${written.notes.length} notes`,
				{ applied: true, after: written.notes.length }
			);
		} catch (error) {
			return errorResult(error instanceof Error ? error.message : String(error), 'not written');
		}
	}
});

// ─── read_pattern ───────────────────────────────────────────────────────────────────────────────

export const readPatternTool = defineTool({
	name: 'read_pattern',
	label: 'read pattern',
	kind: 'read',
	description:
		'Read one pattern of one track on the replica: bars, length, track scale and every note by step. Default: the pattern the track plays now. Changes nothing.',
	input: z.object({
		track: z.int().min(1).max(16).describe('Track 1–16'),
		pattern: z.int().min(1).max(16).optional().describe('Pattern 1–16 (default: the one playing)')
	}),
	async run(input, ctx) {
		const virtual = virtualOf(ctx.env);
		if (!virtual) return errorResult(NO_VIRTUAL, 'no virtual op-xy');
		try {
			const p = virtual.readPattern(input.track, input.pattern);
			return jsonResult(
				patternView(p),
				`track ${p.track} pattern ${p.pattern}: ${p.notes.length} notes`
			);
		} catch (error) {
			return errorResult(error instanceof Error ? error.message : String(error), 'not read');
		}
	}
});

// ─── read_sound ─────────────────────────────────────────────────────────────────────────────────

export const readSoundTool = defineTool({
	name: 'read_sound',
	label: 'read sound',
	kind: 'read',
	description:
		'Read an instrument track\'s whole sound on the replica, each page as its screen shows it: the engine and the preset it came from, the engine\'s four M1 values by name (a drum track: its selected key, plus the sound on every key), the amp and filter envelopes, the play mode, the filter (type, cutoff, resonance, envelope amount, key tracking), the sends, the LFO, the player, and the mix level and pan. Use it before you explain, judge or change a sound ("why does my pad sound dull?", "what makes this bass pluck?"), so you speak from its real values. With an OP-XY connected, the replica holds the device\'s sounds only after its project was loaded (the project key); otherwise these are the replica\'s own. Changes nothing.',
	input: z.object({
		track: z.int().min(1).max(8).describe('Instrument track 1–8')
	}),
	async run(input, ctx) {
		const virtual = virtualOf(ctx.env);
		if (!virtual) return errorResult(NO_VIRTUAL, 'no virtual op-xy');
		try {
			const sound = virtual.readSound(input.track);
			return jsonResult(sound, `track ${sound.track}: ${sound.preset ?? sound.engine}`);
		} catch (error) {
			return errorResult(error instanceof Error ? error.message : String(error), 'not read');
		}
	}
});

// ─── write_arrangement ──────────────────────────────────────────────────────────────────────────

/** The input that writes `before` back over the scenes `touched` and the song. */
function arrangementBack(before: VirtualArrangement, touched: readonly number[]): ArrangementWrite {
	return {
		scenes: touched.map((scene) => {
			const was = before.scenes.find((s) => s.scene === scene);
			return {
				scene,
				patterns: was ? was.patterns.map((pattern, i) => ({ track: i + 1, pattern })) : null
			};
		}),
		song: { order: [...before.song.order], loop: before.song.loop }
	};
}

export const writeArrangementTool = defineTool({
	name: 'write_arrangement',
	label: 'write arrangement',
	kind: 'mutate',
	approval: 'auto',
	description:
		'Set scenes and the song on the replica. A scene says which pattern each track plays (tracks left out play pattern 1; patterns missing on a track are added empty); the song is the order scenes play in (up to 96 entries) and whether it loops. transport play then plays the song from its first scene when it has more than one entry. Write the patterns first with write_pattern. Undo restores the previous scenes and song.',
	input: z.object({
		scenes: z
			.array(
				z.object({
					scene: z.int().min(1).max(99).describe('Scene 1–99'),
					patterns: z
						.array(
							z.object({
								track: z.int().min(1).max(16).describe('Track 1–16'),
								pattern: z.int().min(1).max(16).describe('Pattern 1–16')
							})
						)
						.nullable()
						.describe('The pattern each track plays in this scene; null clears the scene')
				})
			)
			.max(99)
			.optional()
			.describe('Scenes to set'),
		song: z
			.object({
				scenes: z.array(z.int().min(1).max(99)).min(1).max(96).describe('Scene numbers in order'),
				loop: z.boolean().describe('Whether the song starts over at its end')
			})
			.optional()
			.describe('The song')
	}),
	snapshot(_input, env): VirtualArrangement | null {
		return virtualOf(env)?.readArrangement() ?? null;
	},
	preview(input) {
		const scenes = input.scenes?.length ?? 0;
		const parts = [
			scenes > 0 ? `${scenes} scene${scenes === 1 ? '' : 's'}` : null,
			input.song ? `a song of ${input.song.scenes.length}` : null
		].filter(Boolean);
		return { label: parts.join(' and ') || 'arrangement', before: null, after: null };
	},
	inverse(input, before) {
		if (!before) return null;
		const back = arrangementBack(
			before,
			(input.scenes ?? []).map((s) => s.scene)
		);
		return {
			tool: 'write_arrangement',
			input: {
				scenes: (back.scenes ?? []).map((s) => ({ scene: s.scene, patterns: s.patterns })),
				song: {
					scenes: back.song?.order.length ? [...back.song.order] : [1],
					loop: back.song?.loop ?? true
				}
			},
			label: 'scenes and song back as they were'
		};
	},
	async run(input, ctx): Promise<ToolResult> {
		const virtual = virtualOf(ctx.env);
		if (!virtual) return errorResult(NO_VIRTUAL, 'no virtual op-xy');
		try {
			const before = new Map(virtual.status().tracks.map((t) => [t.track, t.patterns]));
			const result = virtual.writeArrangement({
				scenes: input.scenes?.map((s) => ({ scene: s.scene, patterns: s.patterns })),
				song: input.song ? { order: input.song.scenes, loop: input.song.loop } : undefined
			});
			// patterns a scene named that the track did not have yet: added empty
			const added = virtual.status().tracks.flatMap((t) => {
				const had = before.get(t.track) ?? t.patterns;
				if (t.patterns <= had) return [];
				const numbers = Array.from({ length: t.patterns - had }, (_, i) => had + i + 1);
				return [`track ${t.track}: pattern ${numbers.join(', ')} (empty)`];
			});
			return jsonResult(
				{
					arrangement: result,
					...(added.length ? { addedEmpty: added } : {}),
					note: 'On the replica.'
				},
				`${result.scenes.length} scene${result.scenes.length === 1 ? '' : 's'}, song of ${result.song.order.length}`,
				{ applied: true }
			);
		} catch (error) {
			return errorResult(error instanceof Error ? error.message : String(error), 'not written');
		}
	}
});

export const VIRTUAL_TOOLS = [
	writePatternTool,
	readPatternTool,
	readSoundTool,
	writeArrangementTool
];
