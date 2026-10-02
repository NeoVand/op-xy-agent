/**
 * Programming tools for the virtual OP-XY (the replica on screen, `../virtual-opxy.ts`): write and
 * read a track's pattern, and set scenes and the song. They always act on the virtual machine,
 * connected device or not, because the real OP-XY cannot receive patterns over MIDI; its projects
 * come with native project files later (plan M6). Every change can be undone: each tool's inverse
 * writes back what was there before.
 */
import { z } from 'zod';
import { parseNoteName } from '$lib/core/midi/notes';
import { meterOf } from '$lib/sim/areas/arrange/model';
import { STEP_COMPONENTS, type StepComponentKind } from '$lib/sim/sequencer';
import { TIME_SIGNATURES, type TimeSignature } from '$lib/sim/areas/arrange/state';
import {
	compactChords,
	compactNotes,
	gridHits,
	gridMiscount,
	markVelocity,
	PatternNotesError,
	type WrittenNote
} from '../pattern-notes';
import {
	FOUR_FOUR,
	hitMark,
	meterBars,
	parseKey,
	readPattern,
	type BarMeter,
	type MeantKey
} from '../pattern-reading';
import type {
	ArrangementWrite,
	VirtualArrangement,
	VirtualOpxy,
	VirtualPattern
} from '../virtual-opxy';
import {
	defineTool,
	errorResult,
	jsonResult,
	type AgentEnvironment,
	type ToolResult
} from './define';

const NO_VIRTUAL = 'There is no replica in this session, so nothing was written.';

/** The step components by name, as the white keys hold them. */
const COMPONENT_KINDS = STEP_COMPONENTS.map((c) => c.kind) as [
	StepComponentKind,
	...StepComponentKind[]
];
const componentDefault = (kind: string) =>
	STEP_COMPONENTS.find((c) => c.kind === kind)?.defaultValue ?? 4;

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
		.describe(
			"How long, in steps (default 1; 4 = a quarter note at track scale 1): the note's own length; the bar menu's note length only shapes notes entered with the step keys"
		)
});

function virtualOf(env: AgentEnvironment) {
	return env.virtual ?? null;
}

/** The project's time signature as readings group bars (4/4 when it is none they know). */
function meterNow(virtual: VirtualOpxy): BarMeter {
	const signature = virtual.status().signature;
	return (TIME_SIGNATURES as readonly string[]).includes(signature)
		? meterOf(signature as TimeSignature)
		: FOUR_FOUR;
}

/** The pitched parts the other instrument tracks play now, for a pattern's key. */
function partsAlongside(virtual: VirtualOpxy, track: number): VirtualPattern[] {
	return virtual
		.status()
		.tracks.filter((t) => t.track <= 8 && t.track !== track && t.notes > 0 && t.engine !== 'drum')
		.map((t) => virtual.readPattern(t.track));
}

/**
 * A pattern as the model reads it: compact, notes grouped by step. `drumSteps: false` leaves a
 * drum pattern as its grid alone (write_pattern's result: the steps again, note by note, made an
 * agent's drum results twice as long as they needed to be).
 */
function patternView(
	p: VirtualPattern,
	{
		drumSteps = true,
		alongside = [] as readonly VirtualPattern[],
		meter = FOUR_FOUR as BarMeter,
		meant = null as MeantKey | null
	} = {}
) {
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
	const grid = drumGrid(p, meter);
	const reading = grid ? null : readPattern(p, alongside, meter, meant);
	return {
		track: p.track,
		pattern: p.pattern,
		patternsOnTrack: p.patterns,
		// the pattern the track is on now (not whether the transport runs)
		current: p.current,
		bars: p.bars,
		length: p.length,
		scale: scaleName(p.scale),
		noteCount: p.notes.length,
		...(p.components?.length
			? { components: p.components.map((c) => `step ${c.step}: ${c.kind} ${c.value}`) }
			: {}),
		...(grid ? { grid } : {}),
		...(reading ? { reading } : {}),
		...(grid && !drumSteps
			? {}
			: { steps: [...byStep.entries()].map(([step, notes]) => ({ step, notes })) })
	};
}

/**
 * A drum pattern as a drummer's grid, one line per sound, four steps a beat and | between bars (x a
 * hit, X an accent (velocity 115 and over), 1–5 a soft hit by its loudness (75 and under), . a rest):
 * "closed hat 1": "X.x. X.x. X.x. X.x.", so what plays where, and how hard, reads at a glance.
 */
function drumGrid(p: VirtualPattern, meter: BarMeter = FOUR_FOUR): Record<string, string> | null {
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
		const mark = (step: number) => {
			const velocity = steps.get(step);
			return velocity === undefined ? '.' : hitMark(velocity);
		};
		// a beat a group, bars as the time signature counts them, so where a hit falls reads without
		// counting; only the steps that play (a 14-step pattern read as 16 once)
		grid[sound] = meterBars(p.length, meter, mark, '', ' ').join(' | ');
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
	readonly chords?: string;
	readonly grid?: Readonly<Record<string, string>>;
}

/** Everything write_pattern was given as written notes, a grid's lines still keyed as written. */
function writtenNotes(input: PatternInput): {
	notes: WrittenNote[];
	hits: ReturnType<typeof gridHits>['hits'];
	steps: number;
} {
	const notes = [
		...(typeof input.notes === 'string' ? compactNotes(input.notes) : (input.notes ?? [])),
		...(input.chords ? compactChords(input.chords) : [])
	];
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
	description: `Program one pattern of one track on the replica (on screen, it plays in the browser): its notes step by step, bars, length and track scale. Replaces what the pattern held; in a project with one scene it becomes the pattern the track plays, and with an arrangement (more than one scene) the scenes stay as they are and the result says which play it. transpose alone shifts the pattern as it is (a bassline down an octave); bar writes one bar alone, keeping the others; components puts step components on steps (random, skip trigger, multiply…), alone onto the pattern as it is; key names the key you mean, for the reading. Up to ${MAX_NOTES} notes and 4 bars (64 steps) per pattern, 16 patterns per track; drum tracks (1 and 2 in a new project) have one sound per note, 53–76, in the layout TE’s kits share: 53–54 kicks, 55–56 snares, 57 rim, 58 clap, 59 tambourine, 60 shaker, 61–62 closed hats, 63 open hat, 64 clave, 65 low tom, 66 ride, 67 mid tom, 68 crash, 69 high tom, 70 triangle, 71–72 congas, 73 cowbell, 74 guiro, 75 metal, 76 chi. Give notes short: notes as one string, a word per note, step:note[:length[:velocity]] with a chord joined by + ("1:A2:4 5:C3+E3+G3:2:70 9:E2::90"), chords by name as chords ("1:Am7 17:Fmaj7", voiced smoothly for you), and drums as grid, a line per sound by its name on this track (as read_pattern, read_sound or make_kit list them; a new project's kits number them, "kick 1", "closed hat 2", and a name without its number finds the lowest) or its MIDI note, 53–76 ({"kick": "x... x... x... x...", "62": "..x. ..x. ..x. ..x."}: x a hit, X an accent, o a soft hit, 1–9 a hit of that loudness (about 14 a digit: 1 = 14, 3 = 42, 5 = 71, 7 = 99, 9 = 127; ghost notes 3–4), . a rest, four steps a beat; spaces and | are only for reading; the result reads soft hits back as their digit, an o at the default velocity as 4, harder ones as x (76–114) and X (115 and over), so 6–8 read x and 9 reads X). velocity is every note's that gives none (default ${DEFAULT_VELOCITY}, loud: pads and quiet parts want 50–80). The real OP-XY cannot receive patterns over MIDI, so this always writes to the replica, even with a device connected. The result reads the pattern back: a drum track as a grid, any other as its bars and chords, spelled in the key its notes and the parts playing with it suggest; describe what you made from that. Use write_arrangement for scenes and the song, transport to hear it.`,
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
				'The notes in any order: a string, a word per note, step:note[:length[:velocity]], a chord joined by + ("1:C3+E3+G3:4 5:A2::80"), or a list of objects; empty clears. A length is in steps (4 = a quarter at scale 1, default 1) and sounds whole, legato when it reaches the next note'
			),
		chords: z
			.string()
			.max(2000)
			.optional()
			.describe(
				'Chords by name instead of their notes, a word per chord, step:symbol[:length[:velocity]] ("1:Am7 17:Fmaj7 33:C/E 49:G7:16:70"): voiced near middle C, each moving as little as it can from the one before (smooth voice leading, so most read back as inversions), a slash chord\'s bass below; with no length a chord lasts until the next, the last to its bar\'s end. With notes too, both are written'
			),
		grid: z
			.record(z.string().min(1).max(40), z.string().max(200))
			.optional()
			.describe(
				'Hits by sound, as read_pattern shows a drum track: its name, note name or number, then a mark a step (x hit, X accent, o soft, . rest; spaces and | ignored); a line that divides the pattern repeats to fill it (one bar of hats for four bars), e.g. {"kick": "x... ..x. x... ...."}'
			),
		transpose: z
			.int()
			.min(-48)
			.max(48)
			.optional()
			.describe(
				'Semitones to shift by: alone, it shifts the pattern as it is now (12 = up an octave), keeping everything else; with notes, it shifts those'
			),
		key: z
			.string()
			.max(24)
			.optional()
			.describe(
				'The key you mean ("A minor", "D dorian", "Eb major"): the reading spells notes and chords in it rather than guessing one'
			),
		components: z
			.array(
				z.object({
					step: z.int().min(1).max(64),
					kind: z.enum(COMPONENT_KINDS),
					value: z.int().min(0).max(9).optional()
				})
			)
			.max(64)
			.optional()
			.describe(
				"Step components, the per-step tricks that make a pattern vary as it plays (manual: sequencer.step-component-reference): random (a random note), skip trigger (plays one time in N), multiply (N quick hits), pulse, ramp up / ramp down, portamento, bend, tonality, jump…; value is its digit (default: the component's own; 0 is random for most)"
			),
		bar: z
			.int()
			.min(1)
			.max(4)
			.optional()
			.describe(
				'Write one bar only: the notes or grid count steps 1–16 from its first step and replace that bar alone, the other bars staying as they are (change one chord without resending the rest); with transpose alone, shifts that bar'
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
				})),
				...(before.components?.length ? { components: before.components } : {})
			},
			label: `track ${input.track} pattern ${before.pattern} back as it was`
		};
	},
	async run(input, ctx): Promise<ToolResult> {
		const virtual = virtualOf(ctx.env);
		if (!virtual) return errorResult(NO_VIRTUAL, 'no virtual op-xy');
		const pattern = input.pattern ?? 1;
		const transpose = input.transpose ?? 0;
		const drums = input.track <= 8 && virtual.status().tracks[input.track - 1]?.engine === 'drum';
		if (transpose !== 0 && drums) {
			return errorResult(
				'Nothing was written: on a drum track a note is a sound, so transposing moves each hit onto another drum. Write the grid again instead.',
				'drums do not transpose'
			);
		}
		// transpose alone shifts the pattern as it is now (an agent rewrote a bassline from memory
		// to move it an octave, which would have undone anything the user changed since)
		const given = input.notes !== undefined || input.chords !== undefined;
		const shifting = transpose !== 0 && !given && input.grid === undefined;
		// components alone go onto the pattern as it is, its notes kept
		const adding =
			input.components !== undefined && !given && input.grid === undefined && transpose === 0;
		// one bar: written as its own steps 1–16, the pattern's other bars kept (an agent resent four
		// chords to change one, and risked a typo in the three it meant to keep)
		const current = input.bar !== undefined ? virtual.readPattern(input.track, pattern) : null;
		const barFrom = input.bar !== undefined ? (input.bar - 1) * 16 : 0;
		const inBar = (step: number) => step > barFrom && step <= barFrom + 16;
		const whole = shifting || adding ? virtual.readPattern(input.track, pattern) : null;
		const was =
			whole && current
				? {
						...whole,
						notes: whole.notes
							.filter((n) => inBar(n.step))
							.map((n) => ({ ...n, step: n.step - barFrom }))
					}
				: whole;
		if (!given && input.grid === undefined && !shifting && !adding) {
			return errorResult(
				'Nothing to write: give notes (a string or a list; an empty one clears the pattern), grid, or transpose to shift the pattern as it is.',
				'no notes given'
			);
		}
		let written: ReturnType<typeof writtenNotes>;
		try {
			written = was
				? { notes: was.notes.map((n) => ({ ...n })), hits: [], steps: 0 }
				: writtenNotes(input);
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
				note: (note ?? 0) + transpose,
				velocity: n.velocity ?? velocity,
				length: n.length ?? 1
			};
		});
		if (invalid.length > 0) {
			return errorResult(
				`Unknown note names: ${invalid.join(', ')}. Use MIDI numbers (60 = middle C) or names like C4, F#3, Bb2.`,
				'bad note names'
			);
		}
		const outOfRange = notes.filter((n) => n.note < 0 || n.note > 127);
		if (outOfRange.length > 0) {
			return errorResult(
				`Nothing was written: ${outOfRange.length} note${outOfRange.length === 1 ? '' : 's'} would fall outside 0–127 (MIDI's range) after transposing by ${transpose}.`,
				'notes out of range'
			);
		}
		// how long the pattern is: as asked, as it was (a transpose), else as far as the notes and
		// the grid's longest line reach
		const lineSteps = Object.fromEntries(
			Object.entries(input.grid ?? {}).map(([key, line]) => [
				key,
				line.replace(/[\s|]/g, '').length
			])
		);
		const lastNote = notes.reduce((max, n) => Math.max(max, n.step), 1);
		const bars =
			input.bars ??
			(current && input.bar !== undefined
				? Math.max(current.bars, input.bar)
				: (was?.bars ?? Math.ceil(Math.max(lastNote, written.steps || 1) / 16)));
		const span = bars * 16;
		// the steps that play: a shorter last bar (length 14 for a 7/8 groove) is what lines fill;
		// one bar's lines fill that bar
		const fill = current
			? 16
			: Math.min(span, input.length ?? (input.bars === undefined && was ? was.length : span));
		// closed hats a grid put under an open hat, left out (below)
		let underOpen: number[] = [];
		if (written.hits.length > 0) {
			const kit = input.track <= 8 ? virtual.readSound(input.track).kit : undefined;
			const keys = new Map<string, number | null>();
			const fromGrid: typeof notes = [];
			for (const hit of written.hits) {
				if (!keys.has(hit.key)) keys.set(hit.key, gridKey(hit.key, kit));
				const note = keys.get(hit.key);
				if (note === null || note === undefined) continue;
				// a line that divides the pattern repeats to fill it (a bar of hats for four bars)
				const n = lineSteps[hit.key] ?? fill;
				const times = n < fill && fill % n === 0 ? fill / n : 1;
				for (let k = 0; k < times; k++) {
					fromGrid.push({
						step: hit.step + k * n,
						note: note + transpose,
						velocity: markVelocity(hit.mark, velocity),
						length: 1
					});
				}
			}
			// a closed hat where the open hat hits: a drummer plays the open one there, so the grid
			// leaves the closed one out (agents wrote both on the off-beats and rewrote the pattern
			// each time the result said so); the notes form still stacks them
			const sounds = new Map(
				Object.entries(kit ?? {}).map(([key, name]) => [parseNoteName(key, 'c4'), name])
			);
			const hat = (n: { note: number }, kind: 'open' | 'closed') =>
				new RegExp(`${kind} hat`).test(sounds.get(n.note - transpose) ?? '');
			const open = new Set(fromGrid.filter((n) => hat(n, 'open')).map((n) => n.step));
			underOpen = [
				...new Set(fromGrid.filter((n) => hat(n, 'closed') && open.has(n.step)).map((n) => n.step))
			].sort((a, b) => a - b);
			notes.push(...fromGrid.filter((n) => !(hat(n, 'closed') && open.has(n.step))));
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
		if (current) {
			const past = notes.find((n) => n.step > 16);
			if (past) {
				return errorResult(
					`Nothing was written: with bar, steps count 1–16 inside that bar, and step ${past.step} is past it.`,
					'step outside the bar'
				);
			}
			const kept = current.notes
				.filter((n) => !inBar(n.step))
				.map((n) => ({ step: n.step, note: n.note, velocity: n.velocity, length: n.length }));
			notes.splice(
				0,
				notes.length,
				...kept,
				...notes.map((n) => ({ ...n, step: n.step + barFrom }))
			);
		}
		if (notes.length > MAX_NOTES) {
			return errorResult(
				`Nothing was written: ${notes.length} notes, and a pattern holds ${MAX_NOTES}. Spread them over more patterns (and scenes), or fewer bars.`,
				'too many notes'
			);
		}
		const lastStep = notes.reduce((max, n) => Math.max(max, n.step), 1);
		if (lastStep > span) {
			return errorResult(
				`Step ${lastStep} does not fit in ${bars} bar${bars === 1 ? '' : 's'} (${span} steps).`,
				'step outside the pattern'
			);
		}
		try {
			// a transpose or one bar keeps the pattern's own length and scale
			const keep = was ?? current;
			const playedBefore = virtual.status().tracks[input.track - 1]?.current;
			// components: as given (one bar's from its first step), the rest kept where a transpose or
			// one bar keeps the pattern
			const given = (input.components ?? []).map((c) => ({
				step: c.step + barFrom,
				kind: c.kind,
				value: c.value ?? componentDefault(c.kind)
			}));
			const kept = current
				? (current.components ?? []).filter((c) => !inBar(c.step))
				: adding || (was && input.components === undefined)
					? (whole?.components ?? [])
					: [];
			const result = virtual.writePattern(input.track, {
				pattern,
				bars,
				length: input.length ?? (keep && keep.bars === bars ? keep.length : undefined),
				scale: input.scale === undefined ? keep?.scale : scaleValue(input.scale),
				notes,
				components: [...kept, ...given]
			});
			const notes2: string[] = [];
			// a line that neither fills the pattern nor divides it is often a miscount (an agent wrote
			// 30 marks for 32 steps): the rest of it plays as rests
			const uneven = Object.entries(lineSteps)
				.filter(([, n]) => n !== fill && !(n < fill && fill % n === 0))
				.map(([key, n]) => {
					const where = gridMiscount(input.grid?.[key] ?? '', meterNow(virtual).bar);
					const past = n > fill ? `, the last ${n - fill} past its end and silent` : '';
					return `${key} has ${n}${where ? ` (${where})` : ''}${past}`;
				});
			if (uneven.length > 0) {
				notes2.push(
					`Grid lines that neither fill the pattern's ${fill} steps nor repeat into them: ${uneven.join(', ')}; what a line leaves is rests. Check them against the grid above.`
				);
			}
			// a line shorter than a bar repeats to fill the pattern, a single crash too (an agent wrote
			// "x..." for one crash and got one on every beat)
			const bar = meterNow(virtual).bar;
			const repeated = Object.entries(lineSteps)
				.filter(
					([key, n]) =>
						n < bar && n < fill && fill % n === 0 && /[xXo1-9]/.test(input.grid?.[key] ?? '')
				)
				.map(([key, n]) => `${key} (${n} steps, ${fill / n} times)`);
			if (repeated.length > 0) {
				notes2.push(
					`Lines shorter than a bar repeat to fill the pattern: ${repeated.join(', ')}. For a hit that plays once, write its line out in full, rests to the end.`
				);
			}
			// a line of rests alone plays nothing, and the grid above leaves it out (an agent could not
			// tell whether its empty open-hat line was read)
			const silent = Object.entries(input.grid ?? {})
				.filter(([, line]) => !/[xXo1-9]/.test(line))
				.map(([key]) => key);
			if (silent.length > 0) {
				notes2.push(
					`${silent.join(', ')}: no hits, so ${silent.length === 1 ? 'it plays' : 'they play'} nothing here; the grid above lists the sounds that play.`
				);
			}
			// where in the bar, as a drummer counts it (an agent fixed the step next to the one meant)
			const count = (step: number) => {
				const at = (step - 1) % 16;
				const beat = `${Math.floor(at / 4) + 1}${['', 'e', '&', 'a'][at % 4]}`;
				return `${step} (${beat} of bar ${Math.ceil(step / 16)})`;
			};
			if (underOpen.length > 0) {
				notes2.push(
					`The closed hat is left out on step${underOpen.length === 1 ? '' : 's'} ${underOpen.map((step) => count(step + barFrom)).join(', ')}, where the open hat hits: a drummer plays one or the other. (To stack them, write those notes in the notes form.)`
				);
			}
			// a closed and an open hat on one step: a drummer plays one or the other (an agent wrote
			// both on every off-beat and only noticed afterwards)
			const both = [
				...new Set(
					result.notes
						.filter((n) => /closed hat/.test(n.sound ?? ''))
						.filter((n) =>
							result.notes.some((m) => m.step === n.step && /open hat/.test(m.sound ?? ''))
						)
						.map((n) => n.step)
				)
			];
			if (both.length > 0) {
				notes2.push(
					`A closed and an open hat both hit on step${both.length === 1 ? '' : 's'} ${both.map(count).join(', ')}: a drummer plays one or the other there, so keep one unless the stack is the sound you want.`
				);
			}
			// with an arrangement the scenes stay as they are: say where this pattern plays
			const arrangement = virtual.readArrangement();
			if (
				arrangement.scenes.length <= 1 &&
				playedBefore !== undefined &&
				playedBefore !== pattern
			) {
				// with one scene, what plays follows the pattern written last (an agent saw tracks
				// "flip" between patterns and could not tell why)
				notes2.push(
					`T${input.track} plays pattern ${pattern} now (it played ${playedBefore}): with one scene, the pattern written last plays. write_arrangement sets which pattern each scene plays.`
				);
			}
			if (arrangement.scenes.length > 1) {
				const plays = arrangement.scenes
					.filter((sc) => sc.patterns[input.track - 1] === pattern)
					.map((sc) => sc.scene);
				notes2.push(
					plays.length > 0
						? `The scenes are as they were: this pattern plays in scene${plays.length === 1 ? '' : 's'} ${plays.join(', ')}.`
						: `The scenes are as they were, and none plays this pattern yet: write_arrangement puts it in one.`
				);
			}
			const sound = soundOf(virtual, input.track);
			return jsonResult(
				{
					written: patternView(result, {
						drumSteps: false,
						alongside: partsAlongside(virtual, input.track),
						meter: meterNow(virtual),
						meant: input.key ? parseKey(input.key) : null
					}),
					...(sound ? { sound } : {}),
					note: ['On the replica.', ...notes2].join(' ')
				},
				`track ${input.track} pattern ${result.pattern}: ${result.notes.length} notes`,
				{ applied: true, after: result.notes.length }
			);
		} catch (error) {
			return errorResult(error instanceof Error ? error.message : String(error), 'not written');
		}
	}
});

/** A track's sound in a few words ("dissolve (lead/gaussian)"), or null for an auxiliary track. */
function soundOf(virtual: NonNullable<ReturnType<typeof virtualOf>>, track: number): string | null {
	if (track > 8) return null;
	try {
		const sound = virtual.readSound(track);
		return sound.preset ? `${sound.engine} (${sound.preset})` : sound.engine;
	} catch {
		return null;
	}
}

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
				patternView(p, {
					alongside: partsAlongside(virtual, input.track),
					meter: meterNow(virtual)
				}),
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
			return jsonResult(
				{
					...sound,
					// what the numbers are on (an agent called 99 "a lot" unsure of the scale)
					reading:
						'Values as the pages show them: most run 00–99; tune is in semitones, pan −100…100, an LFO amount −99…99. A send of 99 is full, and the tape send at 99 is the normal path to the output, not a sound taken away.'
				},
				`track ${sound.track}: ${sound.preset ?? sound.engine}`
			);
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
		'Set scenes and the song on the replica. A scene says which pattern each track plays: tracks left out keep the pattern they have in that scene (pattern 1 in a new scene), so a scene changes track by track; pattern 0 makes a track rest, silent, in that scene; patterns missing on a track are added empty; null clears a scene. The song is the order scenes play in (up to 96 entries) and whether it loops. transport play then plays the song from its first scene when it has more than one entry. Write the patterns first with write_pattern.',
	input: z.object({
		scenes: z
			.array(
				z.object({
					scene: z.int().min(1).max(99).describe('Scene 1–99'),
					patterns: z
						.array(
							z.object({
								track: z.int().min(1).max(16).describe('Track 1–16'),
								pattern: z
									.int()
									.min(0)
									.max(16)
									.describe('Pattern 1–16; 0: the track rests in this scene (on an empty pattern)')
							})
						)
						.nullable()
						.describe(
							'The tracks to set in this scene (the rest keep theirs); null clears the scene'
						)
				})
			)
			.max(99)
			.optional()
			.describe('Scenes to set'),
		song: z
			.object({
				scenes: z
					.array(z.int().min(1).max(99))
					.max(96)
					.describe('Scene numbers in order; [] keeps the order as it is (to change only loop)'),
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
			input.song
				? input.song.scenes.length > 0
					? `a song of ${input.song.scenes.length}`
					: `the song ${input.song.loop ? 'looping' : 'once through'}`
				: null
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
			// tracks a scene leaves out keep what that scene had (pattern 1 in a new scene), so one
			// track changes alone: an agent restated every track to change one, wary of the rest
			const had = new Map(virtual.readArrangement().scenes.map((s) => [s.scene, s.patterns]));
			const scenes = input.scenes?.map(({ scene, patterns }) => {
				const old = had.get(scene);
				if (patterns === null) {
					// cleared: what follows for it in this call starts from pattern 1
					had.delete(scene);
					return { scene, patterns };
				}
				const named = new Set(patterns.map((p) => p.track));
				const kept = (old ?? []).flatMap((pattern, i) =>
					named.has(i + 1) || pattern === 1 ? [] : [{ track: i + 1, pattern }]
				);
				const all = [...patterns, ...kept];
				had.set(
					scene,
					Array.from({ length: 16 }, (_, i) => all.find((p) => p.track === i + 1)?.pattern ?? 1)
				);
				return { scene, patterns: all };
			});
			const result = virtual.writeArrangement({
				scenes,
				song: input.song
					? {
							order:
								input.song.scenes.length > 0
									? input.song.scenes
									: virtual.readArrangement().song.order,
							loop: input.song.loop
						}
					: undefined
			});
			// patterns a scene named that the track did not have yet: added empty
			const added = virtual.status().tracks.flatMap((t) => {
				const had = before.get(t.track) ?? t.patterns;
				if (t.patterns <= had) return [];
				const numbers = Array.from({ length: t.patterns - had }, (_, i) => had + i + 1);
				return [`track ${t.track}: pattern ${numbers.join(', ')} (empty)`];
			});
			// the scene on screen rests tracks on empty patterns: selecting one shows it (an agent
			// worried the user would land on an empty pattern unwarned)
			const byPattern = new Map(virtual.status().tracks.map((t) => [t.track, t.byPattern]));
			const shown = result.scenes.find((sc) => sc.scene === result.scene);
			const resting = (shown?.patterns ?? []).flatMap((p, i) =>
				p !== 1 && byPattern.get(i + 1)?.[p - 1] === 0 ? [`T${i + 1}`] : []
			);
			return jsonResult(
				{
					arrangement: arrangementView(result, virtual.status().bpm, byPattern),
					...(added.length ? { addedEmpty: added } : {}),
					note: `On the replica.${resting.length ? ` In scene ${result.scene}, the one on screen, ${resting.join(', ')} rest${resting.length === 1 ? 's' : ''} on an empty pattern: selecting ${resting.length === 1 ? 'it' : 'one'} there shows that pattern, empty.` : ''}`
				},
				`${result.scenes.length} scene${result.scenes.length === 1 ? '' : 's'}, song of ${result.song.order.length}`,
				{ applied: true }
			);
		} catch (error) {
			return errorResult(error instanceof Error ? error.message : String(error), 'not written');
		}
	}
});

/** "1:28" from seconds. */
const clock = (seconds: number) => {
	const s = Math.round(seconds);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** "4 bars", "1 bar", "0.75 bar". */
const barsText = (bars: number) => `${Math.round(bars * 100) / 100} bar${bars === 1 ? '' : 's'}`;

/**
 * The arrangement in words: each scene's tracks that play another pattern than 1 ("T1 p3, T3 p2"),
 * the rest playing their pattern 1, and how long it lasts; the song, and how long it plays (an agent
 * found sixteen numbers a scene hard to read, could not tell the auxiliary tracks among them, and
 * worked a song's length out by hand).
 */
/** How long the song plays at `bpm` ("20 bars, 0:46 at 104 bpm, then it stops"), or its loop. */
export function songLength(a: VirtualArrangement, bpm: number): string {
	const bars = new Map(a.scenes.map((s) => [s.scene, s.bars]));
	const order = a.song.order;
	// a bar of sixteen steps at track scale 1 lasts 240 / bpm seconds
	const seconds = (n: number) => (n * 240) / bpm;
	if (order.length > 1) {
		const total = order.reduce((sum, scene) => sum + (bars.get(scene) ?? 1), 0);
		return `${barsText(total)}, ${clock(seconds(total))} at ${bpm} bpm${a.song.loop ? ', then it starts over' : ', then it stops'}`;
	}
	const loop = bars.get(a.scene) ?? 1;
	return `no song: scene ${a.scene} loops, ${barsText(loop)} (${clock(seconds(loop))}) each time round`;
}

export function arrangementView(
	a: VirtualArrangement,
	bpm: number,
	byPattern: ReadonlyMap<number, readonly number[]> = new Map()
) {
	const name = (index: number) => (index < 8 ? `T${index + 1}` : `aux T${index - 7}`);
	const length = songLength(a, bpm);
	// a track on an empty pattern rests there (pattern 0 picks one): said so, not as "T1 p3"
	const empty = (track: number, pattern: number) => byPattern.get(track)?.[pattern - 1] === 0;
	return {
		scene: a.scene,
		scenes: Object.fromEntries(
			a.scenes.map((s) => {
				const others = s.patterns.flatMap((p, i) =>
					p === 1
						? []
						: empty(i + 1, p)
							? [`${name(i)} rests (p${p}, empty)`]
							: [`${name(i)} p${p}`]
				);
				const which = others.length > 0 ? `${others.join(', ')}; the rest p1` : 'every track p1';
				return [`scene ${s.scene}`, `${which} (${barsText(s.bars)})`];
			})
		),
		song: { ...a.song, length }
	};
}

export const takeBackTool = defineTool({
	name: 'take_back',
	label: 'take back',
	kind: 'mutate',
	approval: 'auto',
	// one optional number: kept out of the strict grammar's budget
	strict: false,
	description:
		'Take back on the replica what one of your earlier answers changed, as the undo on that answer’s changes note does: answer 1 (the default) is your last answer whose changes still stand, 2 the one before it; answers taken back, and the take-backs themselves, are skipped, so "undo again" is answer 1 again. Only what still reads as that answer left it goes back, so what the user changed since stays, and the note then offers the user to put it back. Use it for "undo that" rather than writing old values back from memory. It cannot take back what you changed earlier in this same answer (write that again), and a connected OP-XY keeps what was sent to it.',
	input: z.object({
		answer: z
			.int()
			.min(1)
			.max(20)
			.optional()
			.describe('Which answer, counting back: 1 = your last whose changes still stand (default)')
	}),
	async run(input, ctx): Promise<ToolResult> {
		const answers = ctx.env.answers;
		if (!answers || !virtualOf(ctx.env)) return errorResult(NO_VIRTUAL, 'no virtual op-xy');
		const outcome = answers.takeBack(input.answer ?? 1);
		if ('error' in outcome) return errorResult(outcome.error, 'nothing taken back');
		const n = outcome.undone.length;
		return jsonResult(
			{
				takenBack: outcome.undone,
				note: 'The replica reads as it did before that answer, apart from what changed since. The changes list after this call is the take-back itself, each change reversed ("up an octave" undoing "down an octave").'
			},
			`took back ${n} change${n === 1 ? '' : 's'}`,
			{ applied: true }
		);
	}
});

export const VIRTUAL_TOOLS = [
	writePatternTool,
	readPatternTool,
	readSoundTool,
	writeArrangementTool,
	takeBackTool
];
