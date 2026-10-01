/**
 * Programming tools for the virtual OP-XY (the replica on screen, `../virtual-opxy.ts`): write and
 * read a track's pattern, and set scenes and the song. They always act on the virtual machine,
 * connected device or not, because the real OP-XY cannot receive patterns over MIDI; its projects
 * come with native project files later (plan M6). Every change can be undone: each tool's inverse
 * writes back what was there before.
 */
import { z } from 'zod';
import { parseNoteName } from '$lib/core/midi/notes';
import {
	compactNotes,
	gridHits,
	markVelocity,
	PatternNotesError,
	type WrittenNote
} from '../pattern-notes';
import { hitMark, readPattern } from '../pattern-reading';
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

/**
 * A pattern as the model reads it: compact, notes grouped by step. `drumSteps: false` leaves a
 * drum pattern as its grid alone (write_pattern's result: the steps again, note by note, made an
 * agent's drum results twice as long as they needed to be).
 */
function patternView(p: VirtualPattern, { drumSteps = true } = {}) {
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
	const reading = grid ? null : readPattern(p);
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
		...(reading ? { reading } : {}),
		...(grid && !drumSteps
			? {}
			: { steps: [...byStep.entries()].map(([step, notes]) => ({ step, notes })) })
	};
}

/**
 * A drum pattern as a drummer's grid, one line per sound, four steps a beat and | between bars (x a
 * hit, X an accent and o a soft hit next to the sound's other hits, . a rest):
 * "closed hat 1": "X.x. X.x. X.x. X.x.", so what plays where, and how hard, reads at a glance.
 */
function drumGrid(p: VirtualPattern): Record<string, string> | null {
	const sounds = new Map<string, { note: number; steps: Map<number, number> }>();
	for (const n of p.notes) {
		if (!n.sound) continue;
		const entry = sounds.get(n.sound) ?? { note: n.note, steps: new Map<number, number>() };
		entry.steps.set(n.step, n.velocity);
		sounds.set(n.sound, entry);
	}
	if (sounds.size === 0) return null;
	const grid: Record<string, string> = {};
	for (const [sound, { steps }] of [...sounds].sort((a, b) => a[1].note - b[1].note)) {
		const low = Math.min(...steps.values());
		const high = Math.max(...steps.values());
		const mark = (step: number) => {
			const velocity = steps.get(step);
			return velocity === undefined ? '.' : hitMark(velocity, low, high);
		};
		// four steps a beat, so where a hit falls in the bar reads without counting
		const bars = Array.from({ length: p.bars }, (_, bar) =>
			Array.from({ length: 4 }, (_, beat) =>
				Array.from({ length: 4 }, (_, i) => mark(bar * 16 + beat * 4 + i + 1)).join('')
			).join(' ')
		);
		grid[sound] = bars.join(' | ');
	}
	return grid;
}

// ─── write_pattern ──────────────────────────────────────────────────────────────────────────────

/** Notes a pattern holds at most. */
const MAX_NOTES = 120;
/** A hit's velocity when nothing says (loud: pads and soft parts want less). */
const DEFAULT_VELOCITY = 100;

interface PatternInput {
	readonly track: number;
	readonly velocity?: number;
	readonly notes?: string | readonly WrittenNote[];
	readonly grid?: Readonly<Record<string, string>>;
}

/** Everything write_pattern was given as written notes, a grid's lines still keyed as written. */
function writtenNotes(input: PatternInput): {
	notes: WrittenNote[];
	hits: ReturnType<typeof gridHits>['hits'];
	steps: number;
} {
	const notes =
		typeof input.notes === 'string' ? compactNotes(input.notes) : [...(input.notes ?? [])];
	const { hits, steps } = input.grid ? gridHits(input.grid) : { hits: [], steps: 0 };
	return { notes, hits, steps };
}

/** How many notes write_pattern was given, or null where they cannot be read. */
function noteCount(input: PatternInput): number | null {
	try {
		const { notes, hits } = writtenNotes(input);
		return notes.length + hits.length;
	} catch {
		return null;
	}
}

/**
 * A grid line's key as a MIDI note: a number, a note name, or (on a drum track) the name of the
 * sound on a key as read_pattern and read_sound show it ("kick 1"), or null.
 */
function gridKey(key: string, kit: Readonly<Record<string, string>> | undefined): number | null {
	const k = key.trim();
	if (/^\d{1,3}$/.test(k)) return Number(k) <= 127 ? Number(k) : null;
	const named = parseNoteName(k, 'c4');
	if (named !== null) return named;
	// by the sound's name; then without a number ("kick 1" where a made kit says "kick", "kick"
	// where the new project's kit says "kick 1" and "kick 2": the lowest), as an agent once wrote
	const sounds = Object.entries(kit ?? {})
		.map(([note, name]) => ({ note: parseNoteName(note, 'c4'), name: name.toLowerCase() }))
		.filter((x): x is { note: number; name: string } => x.note !== null)
		.sort((a, b) => a.note - b.note);
	const lower = k.toLowerCase();
	const bare = (name: string) => name.replace(/\s+\d+$/, '');
	return (
		sounds.find((x) => x.name === lower)?.note ??
		sounds.find((x) => x.name === bare(lower))?.note ??
		sounds.find((x) => bare(x.name) === lower)?.note ??
		null
	);
}

export const writePatternTool = defineTool({
	name: 'write_pattern',
	label: 'write pattern',
	kind: 'mutate',
	approval: 'auto',
	// a string or a list for notes, and a grid's lines: more than the API's strict grammar takes
	strict: false,
	description: `Program one pattern of one track on the replica (on screen, it plays in the browser): its notes step by step, bars, length and track scale. Replaces what the pattern held and makes it the pattern the track plays. Up to ${MAX_NOTES} notes and 4 bars (64 steps) per pattern, 16 patterns per track; drum tracks (1 and 2 in a new project) have one sound per note, 53–76, in the layout TE’s kits share: 53–54 kicks, 55–56 snares, 57 rim, 58 clap, 59 tambourine, 60 shaker, 61–62 closed hats, 63 open hat, 64 clave, 65 low tom, 66 ride, 67 mid tom, 68 crash, 69 high tom, 70 triangle, 71–72 congas, 73 cowbell, 74 guiro, 75 metal, 76 chi. Give notes short: notes as one string, a word per note, step:note[:length[:velocity]] with a chord joined by + ("1:A2:4 5:C3+E3+G3:2:70 9:E2::90"), and drums as grid, a line per sound by its name on this track (as read_pattern, read_sound or make_kit list them), its note or its number ({"kick": "x... x... x... x...", "62": "..x. ..x. ..x. ..x."}: x a hit, X an accent, o a soft hit, . a rest, four steps a beat). velocity is every note's that gives none (default ${DEFAULT_VELOCITY}, loud: pads and quiet parts want 50–80). The real OP-XY cannot receive patterns over MIDI, so this always writes to the replica, even with a device connected. Undo restores the previous pattern. The result reads the pattern back: a drum track as a grid, any other as its bars and chords, spelled in the key its notes suggest; describe what you made from that. Use write_arrangement for scenes and the song, transport to hear it.`,
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
		velocity: z
			.int()
			.min(1)
			.max(127)
			.optional()
			.describe(
				`Velocity of every note that gives none, and of a grid's x (default ${DEFAULT_VELOCITY})`
			),
		notes: z
			.union([z.string().max(6000), z.array(patternNoteSchema).max(MAX_NOTES)])
			.optional()
			.describe(
				'The notes in any order: a string, a word per note, step:note[:length[:velocity]], a chord joined by + ("1:C3+E3+G3:4 5:A2::80"), or a list of objects; empty clears'
			),
		grid: z
			.record(z.string().min(1).max(40), z.string().max(200))
			.optional()
			.describe(
				'Hits by sound, as read_pattern shows a drum track: its name, note name or number, then a mark a step (x hit, X accent, o soft, . rest; spaces and | ignored), e.g. {"kick 1": "x... ..x. x... ...."}'
			)
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
		const count = noteCount(input);
		const notes = count === null ? 'notes' : `${count} note${count === 1 ? '' : 's'}`;
		return {
			label: `track ${input.track} pattern ${input.pattern ?? 1}: ${notes}`,
			before: before ? `${before.notes.length} notes` : 'empty',
			after: notes
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
		if (input.notes === undefined && input.grid === undefined) {
			return errorResult(
				'Nothing to write: give notes (a string or a list; an empty one clears the pattern) or grid.',
				'no notes given'
			);
		}
		let written: ReturnType<typeof writtenNotes>;
		try {
			written = writtenNotes(input);
		} catch (error) {
			if (!(error instanceof PatternNotesError)) throw error;
			return errorResult(`Nothing was written: ${error.message}.`, 'notes not read');
		}
		const velocity = input.velocity ?? DEFAULT_VELOCITY;
		const invalid: string[] = [];
		const notes = written.notes.map((n) => {
			const note = typeof n.note === 'number' ? n.note : parseNoteName(n.note, 'c4');
			if (note === null) invalid.push(String(n.note));
			return {
				step: n.step,
				note: note ?? 0,
				velocity: n.velocity ?? velocity,
				length: n.length ?? 1
			};
		});
		if (written.hits.length > 0) {
			const kit = input.track <= 8 ? virtual.readSound(input.track).kit : undefined;
			const keys = new Map<string, number | null>();
			for (const hit of written.hits) {
				if (!keys.has(hit.key)) keys.set(hit.key, gridKey(hit.key, kit));
				const note = keys.get(hit.key);
				if (note === null || note === undefined) continue;
				notes.push({ step: hit.step, note, velocity: markVelocity(hit.mark, velocity), length: 1 });
			}
			const unknown = [...keys].filter(([, note]) => note === null).map(([key]) => `"${key}"`);
			if (unknown.length > 0) {
				const sounds = kit
					? ` (this track's sounds: ${[...new Set(Object.values(kit))].join(', ')})`
					: '';
				return errorResult(
					`Nothing was written: grid ${unknown.join(', ')} is no sound, note name or number${sounds}.`,
					'unknown grid sounds'
				);
			}
		}
		if (invalid.length > 0) {
			return errorResult(
				`Unknown note names: ${invalid.join(', ')}. Use MIDI numbers (60 = middle C) or names like C4, F#3, Bb2.`,
				'bad note names'
			);
		}
		if (notes.length > MAX_NOTES) {
			return errorResult(
				`Nothing was written: ${notes.length} notes, and a pattern holds ${MAX_NOTES}. Spread them over more patterns (and scenes), or fewer bars.`,
				'too many notes'
			);
		}
		const lastStep = notes.reduce((max, n) => Math.max(max, n.step), written.steps || 1);
		const bars = input.bars ?? Math.ceil(lastStep / 16);
		if (lastStep > bars * 16) {
			return errorResult(
				`Step ${lastStep} does not fit in ${bars} bar${bars === 1 ? '' : 's'} (${bars * 16} steps).`,
				'step outside the pattern'
			);
		}
		try {
			const result = virtual.writePattern(input.track, {
				pattern: input.pattern ?? 1,
				bars,
				length: input.length,
				scale: input.scale === undefined ? undefined : scaleValue(input.scale),
				notes
			});
			// a grid line shorter or longer than the pattern is often a miscount (an agent wrote 30
			// marks for 32 steps): say so, the rest of a short line plays as rests
			const span = bars * 16;
			const uneven = Object.entries(input.grid ?? {})
				.map(([key, line]) => [key, line.replace(/[\s|]/g, '').length] as const)
				.filter(([, n]) => n !== span)
				.map(([key, n]) => `${key} has ${n}`);
			const note =
				uneven.length > 0
					? `On the replica. Grid lines not ${span} steps long (the pattern's): ${uneven.join(', ')}; check them against the grid above.`
					: 'On the replica.';
			return jsonResult(
				{ written: patternView(result, { drumSteps: false }), note },
				`track ${input.track} pattern ${result.pattern}: ${result.notes.length} notes`,
				{ applied: true, after: result.notes.length }
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
		'Read an instrument track\'s whole sound on the replica, each page as its screen shows it: the engine and the preset it came from, the engine\'s four M1 values by name (a drum track: its selected key, plus the sound on every key), the amp and filter envelopes, the play mode, the filter (type, cutoff, resonance, envelope amount, key tracking), the sends and what FX I and FX II hold (where the sends go), the LFO, the player, and the mix level and pan. Use it before you explain, judge or change a sound ("why does my pad sound dull?", "what makes this bass pluck?"), so you speak from its real values. With an OP-XY connected, the replica holds the device\'s sounds only after its project was loaded (the project key); otherwise these are the replica\'s own. Changes nothing.',
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
					arrangement: arrangementView(result),
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

/**
 * The arrangement in words: each scene's tracks that play another pattern than 1 ("T1 p3, T3 p2"),
 * the rest playing their pattern 1, and the song (an agent found sixteen numbers a scene hard to
 * read, and could not tell the auxiliary tracks among them).
 */
function arrangementView(a: VirtualArrangement) {
	const name = (index: number) => (index < 8 ? `T${index + 1}` : `aux T${index - 7}`);
	return {
		scene: a.scene,
		scenes: Object.fromEntries(
			a.scenes.map((s) => {
				const others = s.patterns.flatMap((p, i) => (p !== 1 ? [`${name(i)} p${p}`] : []));
				return [
					`scene ${s.scene}`,
					others.length > 0 ? `${others.join(', ')}; the rest p1` : 'every track p1'
				];
			})
		),
		song: a.song
	};
}

export const VIRTUAL_TOOLS = [
	writePatternTool,
	readPatternTool,
	readSoundTool,
	writeArrangementTool
];
