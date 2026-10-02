/**
 * Programming tools for the virtual OP-XY (the replica on screen, `../virtual-opxy.ts`): write and
 * read a track's pattern, and set scenes and the song. They always act on the virtual machine,
 * connected device or not, because the real OP-XY cannot receive patterns over MIDI; its projects
 * come with native project files later (plan M6). Every change can be undone: each tool's inverse
 * writes back what was there before.
 */
import { z } from 'zod';
import { parseNoteName } from '$lib/core/midi/notes';
import { grooveReach } from '../groove-reach';
import { humanizeNotes, seedOf } from '../humanize';
import { slidesNote } from '../slides';
import { swellNote, tailNote } from '../swell';
import { gridKey } from '../grid-key';
import { voicesNote } from '../voices';
import { envelopeTimes } from '$lib/sound/times';
import { meterOf } from '$lib/sim/areas/arrange/model';
import { STEP_COMPONENTS, type StepComponentKind } from '$lib/sim/sequencer';
import { TIME_SIGNATURES, type TimeSignature } from '$lib/sim/areas/arrange/state';
import {
	chordSymbols,
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
	moveInKey,
	parseKey,
	readPattern,
	stepsInterval,
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
function partsAlongside(
	virtual: VirtualOpxy,
	track: number,
	pattern?: number,
	/** The drum tracks' parts instead (a bass checked against the kick). */
	drumParts = false
): VirtualPattern[] {
	const status = virtual.status();
	const pitched = status.tracks.filter(
		(t) => t.track <= 8 && t.track !== track && (t.engine === 'drum') === drumParts
	);
	// the parts that play with this pattern: those of a scene it plays in, the one on screen
	// first (a chord pattern read against a bass from another part once named the wrong chords)
	const a = virtual.readArrangement();
	const scenes =
		pattern === undefined ? [] : a.scenes.filter((s) => s.patterns[track - 1] === pattern);
	const scene = scenes.find((s) => s.scene === a.scene) ?? scenes[0];
	if (scene && a.scenes.length > 1) {
		return pitched
			.map((t) => virtual.readPattern(t.track, scene.patterns[t.track - 1]))
			.filter((p) => p.notes.length > 0);
	}
	// one scene, or a pattern in none: what plays now, if this one is what its track plays
	const current = status.tracks[track - 1]?.current;
	if (pattern !== undefined && current !== pattern) {
		// a pattern written for a part to come, before the scenes: the other tracks' patterns of
		// its number, as songs are written part by part (a chorus bass read as C major alone)
		return pitched
			.filter((t) => t.patterns >= pattern)
			.map((t) => virtual.readPattern(t.track, pattern))
			.filter((p) => p.notes.length > 0);
	}
	return pitched.filter((t) => t.notes > 0).map((t) => virtual.readPattern(t.track));
}

/**
 * The key each pattern was last written in, as the write named it (track:pattern → "A minor"), per
 * replica: a transpose carries it, where an estimate reads Am F C G as C major.
 */
const namedKeys = new WeakMap<object, Map<string, string>>();
const keysOf = (virtual: object) => {
	let map = namedKeys.get(virtual);
	if (!map) namedKeys.set(virtual, (map = new Map()));
	return map;
};

/** The keys a lab run's commits named (track:pattern → "A minor"; null: written with none). */
export function nameKeys(virtual: object, keys: Readonly<Record<string, string | null>>): void {
	const map = keysOf(virtual);
	for (const [slot, key] of Object.entries(keys)) {
		if (key === null) map.delete(slot);
		else map.set(slot, key);
	}
}

/** Key names by tonic pitch class, as the keys are usually written. */
const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

/**
 * The key a pattern's clear key reading ("A minor", not a guess) moves to by `semitones`, with
 * where it came from ("A minor moved up 2 semitones"), or null.
 */
function movedKey(
	reading: string | undefined,
	semitones: number
): { key: MeantKey; from: string } | null {
	const m = /^([A-G][#b]?) (major|minor)$/.exec(reading ?? '');
	if (!m) return null;
	const from = parseKey(`${m[1]} ${m[2]}`);
	if (!from) return null;
	const pc = (((from.pitchClass + semitones) % 12) + 12) % 12;
	const tonic = (m[2] === 'major' ? MAJOR_KEYS : MINOR_KEYS)[pc];
	const key = parseKey(`${tonic} ${m[2]}`);
	if (!key) return null;
	const n = Math.abs(semitones);
	return {
		key,
		from: `${m[1]} ${m[2]} moved ${semitones > 0 ? 'up' : 'down'} ${n} semitone${n === 1 ? '' : 's'}`
	};
}

/**
 * A pattern as the model reads it: a drum pattern as its grid, a pitched one as its reading with
 * its notes in write_pattern's own form. `drumSteps: false` leaves a drum pattern as its grid alone
 * (write_pattern's result: the steps again, note by note, made an agent's drum results twice as
 * long as they needed to be).
 */
function patternView(
	p: VirtualPattern,
	{
		drumSteps = true,
		alongside = [] as readonly VirtualPattern[],
		meter = FOUR_FOUR as BarMeter,
		meant = null as MeantKey | null,
		written = [] as readonly string[],
		plain = undefined as number | undefined,
		named = new Map() as ReadonlyMap<number, string>,
		bpm = undefined as number | undefined
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
	const grid = drumGrid(p, meter, plain);
	// a pitched pattern's notes in the write's own form, in place of the steps note by note
	const { notes, ...reading } = (grid
		? null
		: readPattern(p, alongside, meter, meant, written, named)) ?? {
		notes: null
	};
	return {
		track: p.track,
		pattern: p.pattern,
		patternsOnTrack: p.patterns,
		// the pattern the track is on now (not whether the transport runs)
		current: p.current,
		bars: p.bars,
		length: p.length,
		scale: scaleName(p.scale),
		// how long it plays, where the track scale makes that differ from its bars of steps (64
		// steps at 1/2 last two bars, which an agent read as four)
		// and in seconds at the tempo (an agent doubling the tempo and the scale worked out by hand
		// that the loop kept its length)
		...(p.scale !== 1
			? {
					lasts: `${barsText((p.length * p.scale) / meter.bar)} of time at track scale ${scaleName(p.scale)}${bpm ? `, ${Math.round((p.length * p.scale * 150) / bpm) / 10} s at ${bpm} bpm` : ''}`
				}
			: {}),
		noteCount: p.notes.length,
		...(p.components?.length
			? { components: p.components.map((c) => `step ${c.step}: ${c.kind} ${c.value}`) }
			: {}),
		...(p.locks?.length
			? { locks: p.locks.map((l) => `step ${l.step}: ${l.values.join(', ')}`) }
			: {}),
		// notes off the grid (a live take), which neither the grid nor the notes form shows
		...offGrid(p),
		...(p.quantise !== undefined ? { quantise: p.quantise } : {}),
		...(grid ? { grid, hits: drumHits(p) ?? '', beats: drumBeats(p, meter) ?? '' } : {}),
		...('bars' in reading ? { reading } : {}),
		...(notes
			? { notes }
			: grid && !drumSteps
				? {}
				: { steps: [...byStep.entries()].map(([step, notes]) => ({ step, notes })) })
	};
}

/** Each drum sound's velocities by step. */
function soundVelocities(p: VirtualPattern): Map<string, Map<number, number>> {
	const out = new Map<string, Map<number, number>>();
	for (const n of p.notes) {
		if (!n.sound) continue;
		const at = out.get(n.sound) ?? new Map<number, number>();
		at.set(n.step, n.velocity);
		out.set(n.sound, at);
	}
	return out;
}

/** Each drum sound's steps, by sound (the notes it holds), in step order. */
function soundSteps(p: VirtualPattern): Map<string, number[]> {
	const steps = new Map<string, Set<number>>();
	for (const n of p.notes) {
		if (!n.sound) continue;
		steps.set(n.sound, (steps.get(n.sound) ?? new Set<number>()).add(n.step));
	}
	return new Map([...steps].map(([sound, at]) => [sound, [...at].sort((a, b) => a - b)]));
}

/**
 * Each drum sound's steps by number beside the grid ("kick 1: 1 7 11 14"), to write other parts
 * against: an agent locking a bass to the kick converted the grid's marks to steps by hand. A long
 * regular line reads "every 2 from 1 (32)".
 */
function drumHits(p: VirtualPattern): string | null {
	const steps = soundSteps(p);
	if (steps.size === 0) return null;
	const listed = (sorted: number[]): string => {
		if (sorted.length <= 16) return sorted.join(' ');
		const gap = sorted[1] - sorted[0];
		const regular = sorted.every((s, i) => i === 0 || s - sorted[i - 1] === gap);
		return regular
			? `every ${gap} from ${sorted[0]} (${sorted.length})`
			: `${sorted.slice(0, 12).join(' ')} … (${sorted.length} in all)`;
	};
	// and how loud: one velocity for the line, or each hit's (an agent asked how loud each hat was
	// had to read the pattern again)
	const loud = soundVelocities(p);
	const how = (sound: string, at: number[]) => {
		const v = loud.get(sound);
		if (!v) return '';
		const all = [...new Set(at.map((step) => v.get(step)))];
		if (all.length === 1) return ` at ${all[0]}`;
		return at.length <= 16 ? ` (velocities ${at.map((step) => v.get(step)).join(' ')})` : '';
	};
	return [...steps].map(([sound, at]) => `${sound}: ${listed(at)}${how(sound, at)}`).join('; ');
}

/**
 * And where they fall by bar and beat ("kick 1: 1 2& 3& every bar"; "snare 1: bar 1: 2 4, bar 2:
 * 2 3a 4"), to describe them: agents describing a 7/8 beat and a breakbeat from the grid's marks
 * put hits on the wrong beats, one turning step 26 into the wrong beat by hand. Beats of four steps
 * name the sixteenths after each beat e, & and a; other meters give a bar's step numbers.
 */
function drumBeats(p: VirtualPattern, meter: BarMeter): string | null {
	const steps = soundSteps(p);
	if (steps.size === 0) return null;
	const fours = meter.beats.every((b) => b === 4);
	const name = (inBar: number) =>
		fours
			? `${Math.floor((inBar - 1) / 4) + 1}${['', 'e', '&', 'a'][(inBar - 1) % 4]}`
			: String(inBar);
	const bars = Math.max(1, Math.ceil(p.length / meter.bar));
	const lines = [...steps].map(([sound, at]) => {
		const byBar = Array.from({ length: bars }, () => [] as number[]);
		for (const step of at) {
			const bar = Math.min(Math.floor((step - 1) / meter.bar), bars - 1);
			byBar[bar].push(step - bar * meter.bar);
		}
		const said = byBar.map((list) => list.map(name).join(' '));
		if (bars === 1) return `${sound}: ${said[0]}`;
		if (said.every((line) => line === said[0])) return `${sound}: ${said[0]} every bar`;
		return `${sound}: ${said.flatMap((line, i) => (line ? [`bar ${i + 1}: ${line}`] : [])).join(', ')}`;
	});
	return `${lines.join('; ')}${fours ? ' (beats of each bar; e, & and a the sixteenths after a beat)' : ` (steps of each ${meter.bar}-step bar)`}`;
}

/** The notes that play off the grid, by how far: "3 notes off the grid (…): step 5 +0.10, …". */
function offGrid(p: VirtualPattern): { offGrid?: string } {
	const off = p.notes.filter((n) => n.offset);
	if (off.length === 0) return {};
	const sign = (x: number) => `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`;
	const shown = off.slice(0, 8).map((n) => `step ${n.step} ${sign(n.offset ?? 0)}`);
	// which sounds, on a drum track (an agent humanizing the hats alone could not confirm it)
	const sounds = [...new Set(off.flatMap((n) => (n.sound ? [n.sound] : [])))];
	return {
		offGrid: `${off.length} note${off.length === 1 ? '' : 's'}${sounds.length ? ` (${sounds.join(', ')})` : ''} off the grid by part of a step (a live take's timing or humanize's, kept by writes that start from this pattern; the notes on the grid stay there): ${shown.join(', ')}${off.length > 8 ? ', …' : ''}`
	};
}

/**
 * A drum pattern as a drummer's grid, one line per sound, four steps a beat and | between bars (x a
 * hit, X an accent (velocity 115 and over), 1–5 a soft hit by its loudness (75 and under), . a rest):
 * "closed hat 1": "X.x. X.x. X.x. X.x.", so what plays where, and how hard, reads at a glance.
 */
function drumGrid(
	p: VirtualPattern,
	meter: BarMeter = FOUR_FOUR,
	/** The velocity the write's plain hits took, read back as x whatever digit it equals. */
	plain?: number
): Record<string, string> | null {
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
			return velocity === undefined ? '.' : hitMark(velocity, plain);
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
	readonly voicing?: 'smooth' | 'root';
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
		...(input.chords ? compactChords(input.chords, { root: input.voicing === 'root' }) : [])
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
/** Bar `bar` of a pattern alone, as a pattern of one bar: its notes, locks and components. */
function barOf(p: VirtualPattern, bar: number): VirtualPattern {
	const from = (bar - 1) * 16;
	const inBar = (step: number) => step > from && step <= from + 16;
	const moved = <T extends { step: number }>(list: readonly T[] | undefined) =>
		(list ?? []).filter((x) => inBar(x.step)).map((x) => ({ ...x, step: x.step - from }));
	return {
		...p,
		bars: 1,
		length: Math.max(1, Math.min(16, p.length - from)),
		notes: moved(p.notes),
		components: moved(p.components),
		locks: moved(p.locks),
		stepLocks: moved(p.stepLocks)
	};
}

export const writePatternTool = defineTool({
	name: 'write_pattern',
	label: 'write pattern',
	kind: 'mutate',
	approval: 'auto',
	// a string or a list for notes, and a grid's lines: more than the API's strict grammar takes
	strict: false,
	description: `Program one pattern of one track on the replica (on screen, it plays in the browser): its notes step by step, bars, length and track scale. Replaces what the pattern held (a write that starts from it, as bar, transpose, merge, components or scale alone do, keeps its parameter locks, its step components and its notes' timing outside what it rewrites, so components need not be sent again); in a project with one scene it becomes the pattern the track plays (unless stay), and with an arrangement (more than one scene) the scenes stay as they are and the result says which play it. transpose alone shifts the pattern as it is (a bassline down an octave), scale_steps with key moves it along the key's scale (a harmony a third or sixth away, from copy_track), and scale or groove alone set the track scale or groove with the notes kept; bar writes one bar alone, keeping the others (every sound of that bar as given; with merge, only the sounds its grid names change there); copy starts from another of the track's patterns (with bar, a variation of it), copy_track from another track's, and copy_bar from one bar of it alone; components puts step components on steps (random, skip trigger, multiply…), alone onto the pattern as it is; key names the key you mean, for the reading (which lists notes outside it, and the mode they make). Up to ${MAX_NOTES} notes and 4 bars (64 steps) per pattern, 16 patterns per track; drum tracks (1 and 2 in a new project) have one sound per note, 53–76 (the keys F3–E5: 53 is F3, 61 C#4, 63 D#4), in the layout TE’s kits share: 53–54 kicks, 55–56 snares, 57 rim, 58 clap, 59 tambourine, 60 shaker, 61–62 closed hats, 63 open hat, 64 clave, 65 low tom, 66 ride, 67 mid tom, 68 crash, 69 high tom, 70 triangle, 71–72 congas, 73 cowbell, 74 guiro, 75 metal, 76 chi. Give notes short (a step is a sixteenth at track scale 1: an eighth note 2 steps, a beat 4): notes as one string, a word per note, step:note[:length[:velocity]] (a length in steps, 0.05–64) with a chord joined by + ("1:A2:4 5:C3+E3+G3:2:70 9:E2::90"), chords by name as chords ("1:Am7 17:Fmaj7", voiced smoothly for you, so most read back as inversions, F/A; voicing "root" keeps each on its root; a new project's T3 plays mono and T5 legato, one note at a time, so chords want another track or poly there), and drums as grid, a line per sound by its name on this track (as read_pattern, read_sound or make_kit list them; a new project's kits number them, "kick 1", "closed hat 2", and a name without its number finds the lowest) or its MIDI note, 53–76 ({"kick": "x... x... x... x...", "62": "..x. ..x. ..x. ..x."}: x a hit at the pattern's velocity, X an accent 25 above it (115 at least), o a soft hit about half of it, 1–9 a hit of that loudness (about 14 a digit: 1 = 14, 3 = 42, 5 = 71, 7 = 99, 9 = 127; ghost notes 3–4), . a rest, four steps a beat; spaces and | are only for reading; one hat a step: a closed hat where an open hat hits is left out, as a drummer plays one or the other, so write the closed hats around the open ones (the notes form stacks both); a line shorter than the pattern that divides it repeats, and every line loops with the pattern, so they line up alike on every pass (a part that drifts against the rest needs a track of its own with another pattern length); the result reads each digit back as itself (9 as X), an o at the default velocity as 4, the write's own velocity as x and other velocities as x (76–114) or X (115 and over)). velocity is every note's that gives none (default ${DEFAULT_VELOCITY}, loud: pads and quiet parts want 50–80). The real OP-XY cannot receive patterns over MIDI, so this always writes to the replica, even with a device connected. The result reads the pattern back: a drum track as a grid, any other as its bars ("–" the note held on, "·" a rest) and chords, spelled in the key its notes and the parts playing with it suggest, and its notes in the form notes takes; describe what you made from that. Use write_arrangement for scenes and the song, transport to hear it.`,
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
			.describe(
				'Steps that play, if the last bar is shorter (default: all; in another time signature, the whole bars of it that fit). A bar of another time signature is another count of steps (3/4 and 6/8: 12, 5/4: 20, 7/8: 14, 12/8: 24): four bars of 7/8 are bars 4, length 56 (the default there), four of 3/4 bars 3, length 48'
			),
		scale: z
			.enum(SCALES)
			.optional()
			.describe(
				'Track scale: how many sixteenths one step lasts (default: unchanged); alone it keeps the notes, so 1/2 plays the same pattern at double time and 2 at half time'
			),
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
				'The notes in any order: a string, a word per note, step:note[:length[:velocity]], a chord joined by + ("1:C3+E3+G3:4 5:A2::80"), or a list of objects; empty clears. A length is in steps (4 = a quarter at scale 1, default 1, 0.05–64) and sounds whole; on a legato track with portamento up, a note slides into the next only when it runs past that note\'s start'
			),
		chords: z
			.string()
			.max(2000)
			.optional()
			.describe(
				'Chords by name instead of their notes, a word per chord, step:symbol[:length[:velocity]] ("1:Am7 17:Fmaj7 33:C/E 49:G7:16:70"): voiced near middle C, each moving as little as it can from the one before (smooth voice leading, so most read back as inversions; voicing root keeps every chord on its root), a slash chord\'s bass below; with no length a chord lasts until the next, the last to its bar\'s end. Symbols: C, Cm, C7, Cmaj7 (CM7), Cm7, Cm7b5 (Cø), Cdim, Cdim7, Caug (C+), Csus2, Csus4, C7sus4, C6, Cm6, C6/9, Cadd9, Cm(add9), C9, Cm9, Cmaj9, C9sus4, C7b9, C7#9, C7#5, C7b5, C13, Cmaj7#11, Cm7(add11), Cm11, C5, on any root with # or b. With notes too, both are written'
			),
		repeat: z
			.boolean()
			.optional()
			.describe(
				'With notes or chords and bars: the notes given (a bar, two bars) repeat until the pattern is full, so a phrase is written once'
			),
		merge: z
			.boolean()
			.optional()
			.describe(
				'With grid: write only the lines given, the pattern\'s other sounds kept as they are (add a cowbell, or change the hats, without resending the beat); a line given replaces that sound\'s whole line, and a line of rests takes it out ({"closed hat": "."} removes the closed hats, the rest kept); its bars and length stay unless given. With bar too, only that bar of those sounds (a crash on bar 1 alone: bar 1, merge, {"crash": "x... .... .... ...."}, no 64-mark line); with copy, the copy\'s lines'
			),
		copy: z
			.int()
			.min(1)
			.max(16)
			.optional()
			.describe(
				'Start from a copy of this pattern of the track (its notes, bars, length, scale, components and groove): alone it copies the pattern whole; with bar, merge, transpose or components those change the copy, the source left as it is'
			),
		copy_track: z
			.int()
			.min(1)
			.max(16)
			.optional()
			.describe(
				"Copy from another track instead: its pattern copy (default the one it plays), as copy does. The notes come over as they are, so on drum tracks key for key, played by this track's own kit; both tracks drum tracks, or neither"
			),
		copy_bar: z
			.int()
			.min(1)
			.max(4)
			.optional()
			.describe(
				'With copy or copy_track: only this bar of the source, as a pattern of one bar (a section cut into one-bar patterns for a fade, a bar to vary as a fill)'
			),
		reverse: z
			.boolean()
			.optional()
			.describe(
				'Alone, or with copy: the notes backwards, each ending where its mirror began (a melody in retrograde); on a drum track the hits mirror about the downbeat, so the beat stays on the beat and a fill at the end opens the bar; its locks and components go with their steps. With bar, that bar alone (a fill reversed, the other bars kept)'
			),
		humanize: z
			.object({
				timing: z
					.number()
					.min(0)
					.max(0.4)
					.optional()
					.describe(
						"How far a note may drift off the grid, as part of a step (0.05 a touch, 0.1 loose, 0.2 sloppy); the pattern's quantise goes to 0 so the notes play where they sit"
					),
				velocity: z
					.int()
					.min(0)
					.max(40)
					.optional()
					.describe('How far each velocity may move up or down (8 subtle, 15 clear)'),
				late: z
					.number()
					.min(-0.3)
					.max(0.3)
					.optional()
					.describe(
						'A steady lean on top, as part of a step: positive plays behind the beat (a laid-back snare, 0.05–0.1), negative ahead of it (pushing hats)'
					),
				sounds: z
					.array(z.string())
					.optional()
					.describe(
						'On a drum track, the sounds to loosen, by name or note ("closed hat"); default every sound'
					)
			})
			.optional()
			.describe(
				'Alone: loosens the pattern as it is, as a player would (robotic hats, a stiff bass): each note a little off the grid and a little louder or softer, the beats drifting half as far so the groove holds; the same notes loosen the same way'
			),
		groove: z
			.int()
			.min(-99)
			.max(99)
			.optional()
			.describe(
				"This pattern's own groove amount, the bar menu's: −99 … 99 on the tempo page's groove type and on its amount's scale, in place of that amount for this pattern alone (one part of a song swings, the rest straight); 0 goes back to the tempo page's"
			),
		stay: z
			.boolean()
			.optional()
			.describe(
				'Leave the track playing the pattern it plays now: a pattern for a part to come (a breakdown, a chorus) while the project still has one scene, before write_arrangement puts it in a scene'
			),
		voicing: z
			.enum(['smooth', 'root'])
			.optional()
			.describe(
				'How chords by name are voiced: smooth (default, each led from the one before) or root (each on its root)'
			),
		grid: z
			.record(z.string().min(1).max(40), z.string().max(200))
			.optional()
			.describe(
				'Hits by sound, as an object of lines (not text), as read_pattern shows a drum track: its name, note name or number, then a mark a step (x hit, X accent, o soft, 1–9 loudness, . rest; spaces and | are skipped, so marks only, no code), written in groups of four marks, a beat each, with | between bars (x... ..x. x... .... | …), which keeps the count right; a line that divides the pattern repeats to fill it (one bar of hats for four bars); a closed hat on a step the open hat hits is left out, so give them different steps, e.g. {"kick": "x... ..x. x... ...."}'
			),
		transpose: z
			.int()
			.min(-48)
			.max(48)
			.optional()
			.describe(
				'Semitones to shift by: alone, it shifts the pattern as it is now (12 = up an octave), keeping everything else; with notes, it shifts those'
			),
		scale_steps: z
			.int()
			.min(-14)
			.max(14)
			.optional()
			.describe(
				'Steps of key\'s scale to move every note by, with key: 2 a third up, −2 a third down, −5 a sixth down, 7 an octave; alone or with copy or copy_track it moves the pattern as it is, a harmony in the key (T5\'s melody a sixth below on T6: track 6, copy_track 5, scale_steps −5, key "D major"); a note outside the key moves with the nearest one below it'
			),
		key: z
			.string()
			.max(24)
			.optional()
			.describe(
				'The key you mean ("A minor", "D dorian", "Eb major"): the reading spells notes and chords in it rather than guessing one; give it on every pitched pattern of a song (a bass written before its chords has nothing else to read its key by)'
			),
		components: z
			.array(
				z.object({
					step: z.int().min(1).max(64),
					kind: z.enum([...COMPONENT_KINDS, 'none'] as [
						StepComponentKind | 'none',
						...(StepComponentKind | 'none')[]
					]),
					value: z.int().min(0).max(9).optional()
				})
			)
			.max(64)
			.optional()
			.describe(
				"Step components, the per-step tricks that make a pattern vary as it plays (manual: sequencer.step-component-reference): random (a random note), skip trigger (plays one time in N), multiply (N quick hits), pulse, ramp up / ramp down, portamento, bend, tonality, jump…; value is its digit (default: the component's own; 0 is random for most). They play on steps with notes, so one on a step without is left out; none takes a step's components off"
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
				...(before.components?.length ? { components: before.components } : {}),
				// what the write changed besides the notes, back too: its groove, and which pattern plays
				...(input.groove !== undefined ? { groove: before.groove ?? 0 } : {}),
				...(input.stay ? { stay: true } : {})
			},
			label: `track ${input.track} pattern ${before.pattern} back as it was`
		};
	},
	async run(input, ctx): Promise<ToolResult> {
		const virtual = virtualOf(ctx.env);
		if (!virtual) return errorResult(NO_VIRTUAL, 'no virtual op-xy');
		const pattern = input.pattern ?? 1;
		const transpose = input.transpose ?? 0;
		const scaleSteps = input.scale_steps ?? 0;
		const inKey = input.key ? parseKey(input.key) : null;
		const drums = input.track <= 8 && virtual.status().tracks[input.track - 1]?.engine === 'drum';
		if (scaleSteps !== 0 && !inKey) {
			return errorResult(
				`Nothing was written: scale_steps moves notes along a key's scale, so give key too ("D major", "A minor"${input.key ? `; "${input.key}" is no key it reads` : ''}).`,
				'scale steps need a key'
			);
		}
		if ((transpose !== 0 || scaleSteps !== 0) && drums) {
			return errorResult(
				'Nothing was written: on a drum track a note is a sound, so transposing moves each hit onto another drum. Write the grid again instead.',
				'drums do not transpose'
			);
		}
		// transpose alone shifts the pattern as it is now (an agent rewrote a bassline from memory
		// to move it an octave, which would have undone anything the user changed since)
		const given = input.notes !== undefined || input.chords !== undefined;
		const shifting = (transpose !== 0 || scaleSteps !== 0) && !given && input.grid === undefined;
		// components alone go onto the pattern as it is, its notes kept
		const adding =
			input.components !== undefined &&
			!given &&
			input.grid === undefined &&
			transpose === 0 &&
			scaleSteps === 0;
		// a copy of another pattern is what the write starts from (an agent retyped 24 notes to
		// copy a bassline into pattern 2 and change its last bar), from another track too (one
		// rewrote a beat by hand to copy it from T1 to T2)
		const fromTrack = input.copy_track ?? input.track;
		const copied =
			input.copy ??
			(input.copy_track !== undefined
				? (virtual.status().tracks[fromTrack - 1]?.current ?? 1)
				: undefined);
		const source = copied ?? pattern;
		// the source as the write starts from it: one bar of it alone with copy_bar
		const sourceBars = copied !== undefined ? virtual.readPattern(fromTrack, source).bars : 0;
		if (input.copy_bar !== undefined && (copied === undefined || input.copy_bar > sourceBars)) {
			return errorResult(
				copied === undefined
					? 'Nothing was written: copy_bar picks a bar of the pattern copy or copy_track names; give one of them too.'
					: `Nothing was written: ${fromTrack !== input.track ? `T${fromTrack}'s ` : ''}pattern ${source} has ${sourceBars} bar${sourceBars === 1 ? '' : 's'}, so there is no bar ${input.copy_bar} to copy.`,
				'no such bar'
			);
		}
		const readSource = () => {
			const p = virtual.readPattern(fromTrack, source);
			return input.copy_bar !== undefined ? barOf(p, input.copy_bar) : p;
		};
		if (fromTrack !== input.track) {
			const drumTrack = (t: number) => t <= 8 && virtual.status().tracks[t - 1]?.engine === 'drum';
			if (drumTrack(fromTrack) !== drums) {
				return errorResult(
					`Nothing was written: T${fromTrack} is ${drumTrack(fromTrack) ? '' : 'not '}a drum track and T${input.track} is ${drums ? '' : 'not '}one, and a copy keeps its notes, which would play as other sounds. Write the part anew instead.`,
					'copy across kinds of track'
				);
			}
		}
		const copying =
			copied !== undefined &&
			!given &&
			input.grid === undefined &&
			input.bar === undefined &&
			!shifting &&
			!adding;
		// the track scale or the groove alone, onto the notes as they are (an agent rewrote two
		// patterns note by note to double their scale, unsure a scale alone would keep them)
		const restyling =
			(input.scale !== undefined || input.groove !== undefined) &&
			!given &&
			input.grid === undefined &&
			copied === undefined &&
			input.bar === undefined &&
			!shifting &&
			!adding;
		// reverse, alone or with copy: the notes backwards (an agent worked out a retrograde melody
		// by hand, new step = 34 − step − length)
		// with bar, that bar alone (an agent reversed a fill by working out its mirrored steps)
		const reversing = input.reverse === true && !given && input.grid === undefined;
		// humanize alone loosens the pattern as it is (an agent asked to humanize robotic hats could
		// only vary velocities by hand, and nothing moved a note off the grid)
		const humanizing =
			input.humanize !== undefined &&
			!given &&
			input.grid === undefined &&
			copied === undefined &&
			input.bar === undefined &&
			input.components === undefined &&
			!shifting;
		// one bar: written as its own steps 1–16, the pattern's other bars kept (an agent resent four
		// chords to change one, and risked a typo in the three it meant to keep)
		const current = input.bar !== undefined ? readSource() : null;
		const barFrom = input.bar !== undefined ? (input.bar - 1) * 16 : 0;
		const inBar = (step: number) => step > barFrom && step <= barFrom + 16;
		const whole =
			shifting || adding || copying || restyling || humanizing || reversing ? readSource() : null;
		const was =
			whole && current
				? {
						...whole,
						notes: whole.notes
							.filter((n) => inBar(n.step))
							.map((n) => ({ ...n, step: n.step - barFrom }))
					}
				: whole;
		if (
			!given &&
			input.grid === undefined &&
			!shifting &&
			!adding &&
			!copying &&
			!restyling &&
			!humanizing &&
			!reversing
		) {
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
			// a note kept from the pattern keeps its timing off the grid (a live take's feel)
			const offset = (n as { offset?: number }).offset;
			return {
				step: n.step,
				note:
					(inKey && scaleSteps ? moveInKey(note ?? 0, scaleSteps, inKey) : (note ?? 0)) + transpose,
				velocity: n.velocity ?? velocity,
				length: n.length ?? 1,
				...(offset ? { offset } : {})
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
		// merge: the grid's lines alone, the pattern's other sounds kept (an agent resent a whole
		// beat to add a cowbell, and risked a typo in every line it meant to keep)
		// with bar, that bar's notes (its other sounds once went, the kick and hats of a bar given a
		// snare fill with merge)
		const existing =
			input.merge === true && input.grid !== undefined
				? current
					? {
							...current,
							notes: current.notes
								.filter((n) => inBar(n.step))
								.map((n) => ({ ...n, step: n.step - barFrom }))
						}
					: readSource()
				: null;
		// a clear (no notes, no grid lines with hits) keeps the pattern's bars: clearing a track to
		// write on once shrank its four bars to one
		const clearing =
			notes.length === 0 && !written.steps && was === null && existing === null && !input.copy;
		const cleared = clearing ? virtual.readPattern(input.track, pattern) : null;
		const bars =
			input.bars ??
			(current && input.bar !== undefined
				? Math.max(current.bars, input.bar)
				: (was?.bars ??
					existing?.bars ??
					cleared?.bars ??
					Math.ceil(Math.max(lastNote, written.steps || 1) / 16)));
		const span = bars * 16;
		// in another time signature, by default the whole bars of it that fit: four bars of 16 steps
		// are four of 7/8 (56 steps), where all 64 spilled into a fifth and an agent rewrote nine
		// patterns
		const meter = meterNow(virtual);
		const wholeBars = Math.floor(span / meter.bar) * meter.bar;
		const metered =
			meter.bar !== 16 && wholeBars > 0 && lastNote <= wholeBars && wholeBars < span
				? wholeBars
				: undefined;
		// the steps that play: a shorter last bar (length 14 for a 7/8 groove) is what lines fill;
		// one bar's lines fill that bar
		const kept0 = was ?? existing;
		const fill = current
			? 16
			: Math.min(
					span,
					input.length ?? (input.bars === undefined && kept0 ? kept0.length : (metered ?? span))
				);
		// a line that neither fills the pattern nor divides it is a miscount (an agent wrote 14 marks
		// for 16 steps, and a note saying so went unread): nothing is written until it is fixed
		// a line of rests alone plays nothing however long it is (two agents' calls failed on an
		// empty open-hat line of 30 and 48 dots)
		const restsOnly = (key: string) => !/[xXo1-9]/.test(input.grid?.[key] ?? '');
		// and rests past the pattern's end lose nothing (a 7/8 bar's snare line ran two dots long)
		const restsPast = (key: string, n: number) =>
			n > fill && !/[xXo1-9]/.test((input.grid?.[key] ?? '').replace(/[\s|]/g, '').slice(fill));
		// whole bars and then rests, short of the pattern: its hits once, silent after (a crash on bar
		// 1 alone, "X... .... .... .... | ....", and open hats in bars 1 to 3 with "...." for bar 4
		// were refused as miscounts)
		const barThenRests = (key: string, n: number) => {
			const whole = Math.floor(n / meter.bar) * meter.bar;
			return (
				n < fill &&
				fill % n !== 0 &&
				whole >= meter.bar &&
				!/[xXo1-9]/.test((input.grid?.[key] ?? '').replace(/[\s|]/g, '').slice(whole))
			);
		};
		const once = Object.entries(lineSteps)
			.filter(([key, n]) => barThenRests(key, n))
			.map(([key]) => key);
		const uneven = Object.entries(lineSteps)
			.filter(
				([key, n]) =>
					n !== fill &&
					!(n < fill && fill % n === 0) &&
					!restsOnly(key) &&
					!restsPast(key, n) &&
					!barThenRests(key, n)
			)
			.map(([key, n]) => {
				const line = input.grid?.[key] ?? '';
				// a line run together hides where it goes wrong (31 marks for 32, somewhere)
				const where =
					gridMiscount(line, meterNow(virtual).bar) ??
					(/[\s|]/.test(line) || n < 12
						? null
						: 'run together: with a space after every four marks, a beat each, a miscount shows');
				const past = n > fill ? `, the last ${n - fill} past its end` : '';
				return `${key} has ${n}${where ? ` (${where})` : ''}${past}`;
			});
		if (uneven.length > 0) {
			return errorResult(
				`Nothing was written: grid lines that neither fill the pattern's ${fill} steps nor repeat into them: ${uneven.join(', ')}. Write each line as ${fill} marks, rests as dots (or a part of ${fill} that repeats into it, such as one bar of a longer pattern). A line that changes in one bar only is easier as its one-bar line, which repeats, and then that bar alone with bar and merge.`,
				'grid lines miscounted'
			);
		}
		// repeat: the notes given, played again until the pattern is full (an agent resent every
		// note with its offset to stretch two bars to four); a grid's short lines repeat already
		if (input.repeat && !current && notes.length > 0) {
			const bar = meterNow(virtual).bar;
			const last = notes.reduce((max, n) => Math.max(max, n.step), 1);
			const unit = Math.ceil(last / bar) * bar;
			const base = [...notes];
			for (let offset = unit; offset < fill; offset += unit) {
				for (const n of base) {
					if (n.step + offset <= fill) notes.push({ ...n, step: n.step + offset });
				}
			}
		}
		// closed hats a grid put under an open hat, left out (below)
		let underOpen: number[] = [];
		// a merge of rest lines alone takes those sounds out and keeps the rest (one wiped the whole
		// pattern, the other sounds with it, when the merge had no hits to write)
		if (written.hits.length > 0 || existing) {
			const kit = input.track <= 8 ? virtual.readSound(input.track).kit : undefined;
			// a merge's rest lines name sounds to take out, so they must be sounds of the kit
			const keys = new Map<string, number | null>(
				existing ? Object.keys(input.grid ?? {}).map((key) => [key, gridKey(key, kit)]) : []
			);
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
			// every line given, a line of rests too (it clears its sound)
			const named = new Set(
				Object.keys(input.grid ?? {})
					.map((key) => gridKey(key, kit))
					.filter((n): n is number => n !== null)
					.map((n) => n + transpose)
			);
			const open = new Set(fromGrid.filter((n) => hat(n, 'open')).map((n) => n.step));
			// an open hat a merge keeps counts too (a merged closed-hat line kept both on a step, where
			// a whole write leaves the closed one out)
			for (const n of existing?.notes ?? []) {
				if (!named.has(n.note) && hat(n, 'open')) open.add(n.step);
			}
			underOpen = [
				...new Set(fromGrid.filter((n) => hat(n, 'closed') && open.has(n.step)).map((n) => n.step))
			].sort((a, b) => a - b);
			notes.push(...fromGrid.filter((n) => !(hat(n, 'closed') && open.has(n.step))));
			if (existing) {
				// the sounds no line names stay as they were (a closed hat under a new open hat too
				// goes, as in a written grid)
				for (const n of existing.notes) {
					if (named.has(n.note) || (hat(n, 'closed') && open.has(n.step))) continue;
					notes.push({
						step: n.step,
						note: n.note,
						velocity: n.velocity,
						length: n.length,
						...(n.offset ? { offset: n.offset } : {})
					});
				}
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
		// a note of length L on step s, backwards, starts where its mirror ends: fill − s − L + 2;
		// a drum hit mirrors about the downbeat instead, so hits on the beat stay on beats (a beat
		// reversed note for note put every hat on the off-beat sixteenths)
		const mirror = (step: number, length = 1) =>
			drums
				? ((fill + 1 - step) % fill) + 1
				: Math.max(1, fill - step - Math.max(1, Math.round(length)) + 2);
		// steps where a note starts move with it; other steps mirror plainly
		const starts = new Map(notes.map((n) => [n.step, mirror(n.step, n.length)]));
		const mirrored = (step: number) => starts.get(step) ?? Math.max(1, fill - step + 1);
		if (reversing) {
			notes.splice(
				0,
				notes.length,
				...notes.map((n) => ({
					...n,
					step: mirror(n.step, n.length),
					...(n.offset ? { offset: -n.offset } : {})
				}))
			);
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
				.map((n) => ({
					step: n.step,
					note: n.note,
					velocity: n.velocity,
					length: n.length,
					...(n.offset ? { offset: n.offset } : {})
				}));
			notes.splice(
				0,
				notes.length,
				...kept,
				...notes.map((n) => ({ ...n, step: n.step + barFrom }))
			);
		}
		let loosened = 0;
		if (humanizing && input.humanize) {
			const kit = drums ? virtual.readSound(input.track).kit : undefined;
			const wanted = (input.humanize.sounds ?? []).map((name) => ({
				name,
				note: gridKey(name, kit)
			}));
			const unknown = wanted.filter((w) => w.note === null).map((w) => `"${w.name}"`);
			if (unknown.length > 0) {
				return errorResult(
					`Nothing was written: ${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} no sound of this track${kit ? ` (its sounds: ${[...new Set(Object.values(kit))].join(', ')})` : ''}.`,
					'unknown sounds'
				);
			}
			const notesOf = new Set(wanted.map((w) => w.note));
			const pick = (n: { note: number }) => notesOf.size === 0 || notesOf.has(n.note);
			loosened = notes.filter(pick).length;
			notes.splice(
				0,
				notes.length,
				...humanizeNotes(notes, input.humanize, pick, seedOf(notes) ^ input.track)
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
				? (current.components ?? []).filter((c) => reversing || !inBar(c.step))
				: adding || (was && input.components === undefined)
					? (whole?.components ?? [])
					: [];
			const defaulted = input.length === undefined && !(keep && keep.bars === bars);
			// the locks the write keeps: those of the pattern it starts from (a transpose, a bar
			// alone, a merge, a copy), but not on a bar written anew (one bar written alone once took
			// every lock of the pattern with it)
			const lockBase = current ?? existing ?? whole;
			const anew =
				current !== null &&
				(input.notes !== undefined || input.chords !== undefined || input.grid !== undefined);
			const locks = (lockBase?.stepLocks ?? [])
				.filter((l) => l.step <= span && !(anew && inBar(l.step)))
				.map((l) =>
					!reversing
						? l
						: current
							? inBar(l.step)
								? { ...l, step: barFrom + mirrored(l.step - barFrom) }
								: l
							: { ...l, step: mirrored(l.step) }
				);
			// the components as they land: none takes its step's off, a later one of a kind replaces
			// the earlier on its step, and one on a step with no notes is left out, as it does
			// nothing (an agent's rolls sat on rests, out of its reach to take off)
			const placed = reversing
				? [...kept, ...given].map((c) =>
						!current
							? { ...c, step: mirrored(c.step) }
							: inBar(c.step)
								? { ...c, step: barFrom + mirrored(c.step - barFrom) }
								: c
					)
				: [...kept, ...given];
			const laid: { step: number; kind: string; value: number }[] = [];
			for (const c of placed) {
				const others = laid.filter(
					(o) => o.step !== c.step || (c.kind !== 'none' && o.kind !== c.kind)
				);
				laid.splice(0, laid.length, ...others);
				if (c.kind !== 'none') laid.push({ step: c.step, kind: c.kind, value: c.value });
			}
			const playing = new Set(notes.map((n) => n.step));
			const landing = laid.filter((c) => playing.has(c.step));
			const bare = [...new Set(laid.filter((c) => !playing.has(c.step)).map((c) => c.step))].sort(
				(a, b) => a - b
			);
			const prior = virtual.readPattern(input.track, pattern);
			const result = virtual.writePattern(input.track, {
				pattern,
				...(input.stay ? { play: false } : {}),
				...(input.groove !== undefined
					? { groove: input.groove }
					: copied !== undefined
						? { groove: (whole ?? current ?? existing)?.groove ?? 0 }
						: {}),
				bars,
				length: input.length ?? (keep && keep.bars === bars ? keep.length : metered),
				scale: input.scale === undefined ? keep?.scale : scaleValue(input.scale),
				notes,
				components: landing,
				...(locks.length ? { locks } : {}),
				// notes moved off the grid play there only with quantise below 100
				...(humanizing && ((input.humanize?.timing ?? 0) > 0 || (input.humanize?.late ?? 0) !== 0)
					? { quantise: 0 }
					: {})
			});
			const notes2: string[] = [];
			if (once.length > 0) {
				notes2.push(
					`${once.join(', ')}: whole bars and then rests, short of the pattern, so ${once.length === 1 ? 'its hits play' : 'their hits play'} once as written and the rest of the pattern is silent for ${once.length === 1 ? 'it' : 'them'}.`
				);
			}
			if (scaleSteps !== 0 && inKey) {
				notes2.push(
					`Moved ${result.notes.length} note${result.notes.length === 1 ? '' : 's'} ${stepsInterval(scaleSteps)} along ${inKey.label}'s scale (${Math.abs(scaleSteps)} step${Math.abs(scaleSteps) === 1 ? '' : 's'}), so they stay in the key.`
				);
			}
			if (reversing) {
				notes2.push(
					drums
						? // the rule in numbers (an agent could not tell where its fill's hits would land)
							`Reversed ${input.bar !== undefined ? `bar ${input.bar} alone, the other bars kept, ` : ''}about the downbeat: ${input.bar !== undefined ? "the bar's " : ''}step 1 stays and step n goes to ${fill + 2} − n (${fill} → 2, 5 → ${fill - 3}), so the hits play last to first and those on a beat stay on beats.`
						: `Reversed${input.bar !== undefined ? ` bar ${input.bar} alone, the other bars kept` : ''}: the notes play backwards, last to first.`
				);
			}
			if (humanizing && input.humanize) {
				const t = input.humanize.timing ?? 0;
				const v = input.humanize.velocity ?? 0;
				const lean = input.humanize.late ?? 0;
				const quant = prior.quantise === undefined ? 100 : prior.quantise;
				notes2.push(
					`Loosened ${loosened} note${loosened === 1 ? '' : 's'}${t > 0 ? `: up to ${t} of a step off the grid (the beats half that)` : ''}${lean !== 0 ? `${t > 0 ? ',' : ':'} ${Math.abs(lean)} of a step ${lean > 0 ? 'behind' : 'ahead of'} the beat` : ''}${v > 0 ? `${t > 0 || lean !== 0 ? ',' : ':'} velocities up to ${v} either way` : ''}${(t > 0 || lean !== 0) && quant !== 0 ? `; the pattern's quantise ${quant} → 0, so they play where they sit` : ''}.`
				);
			}
			// the locks it took with the notes it replaced (an agent could not tell whether a
			// rewrite had cleared the locks it had set)
			const locked = new Set((result.locks ?? []).map((l) => l.step));
			const lost = (prior.locks ?? []).filter((l) => !locked.has(l.step));
			if (lost.length > 0 && copied === undefined) {
				notes2.push(
					`The locks on step${lost.length === 1 ? '' : 's'} ${lost.map((l) => `${l.step} (${l.values.join(', ')})`).join(', ')} went with the notes this write replaced; plan_steps with step sets a lock again.`
				);
			}
			if (copied !== undefined && (copied !== pattern || fromTrack !== input.track)) {
				const from =
					fromTrack !== input.track ? `T${fromTrack}'s pattern ${copied}` : `pattern ${copied}`;
				notes2.push(
					`Pattern ${pattern} started from a copy of ${input.copy_bar !== undefined ? `bar ${input.copy_bar} of ` : ''}${from}${input.bar !== undefined ? `, bar ${input.bar} written anew` : ''}; ${from} is as it was.${fromTrack !== input.track && drums ? ` Its hits keep their keys, so T${input.track}'s own kit plays them.` : ''}`
				);
			}
			if (defaulted && metered !== undefined) {
				notes2.push(
					`Length ${metered}: ${metered / meter.bar} whole bars of ${virtual.status().signature} (${meter.bar} steps each) in ${bars} bars of 16 steps; give length for another.`
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
			// a 9 reads back as X (its 127 is an accent's), which looked like a mark changed
			if (/9/.test(Object.values(input.grid ?? {}).join(''))) {
				notes2.push('Digit 9 (velocity 127) reads back as X: the hits play as written.');
			}
			// a line of rests alone plays nothing, and the grid above leaves it out (an agent could not
			// tell whether its empty open-hat line was read)
			const silent = Object.entries(input.grid ?? {})
				.filter(([, line]) => !/[xXo1-9]/.test(line))
				.map(([key]) => key);
			if (silent.length > 0) {
				notes2.push(
					input.merge
						? `${silent.join(', ')}: no hits, so the merge took ${silent.length === 1 ? 'that sound' : 'those sounds'} out and kept the others; the grid above lists the sounds that play.`
						: `${silent.join(', ')}: no hits, so ${silent.length === 1 ? 'it plays' : 'they play'} nothing here; the grid above lists the sounds that play.`
				);
			}
			// where in the bar, as a drummer counts it (an agent fixed the step next to the one meant),
			// in the bars of the project's meter
			const count = (step: number) => {
				const at = (step - 1) % meter.bar;
				const beat = `${Math.floor(at / 4) + 1}${['', 'e', '&', 'a'][at % 4]}`;
				return `${step} (${beat} of bar ${Math.ceil(step / meter.bar)})`;
			};
			if (underOpen.length > 0) {
				// every closed hat under an open one: the whole line is gone (an agent's closed-hat line
				// on the open hats' steps did nothing, and it read the note as a few steps)
				const gone = !result.notes.some((n) => /closed hat/.test(n.sound ?? ''));
				notes2.push(
					gone
						? `The closed hat line is left out entirely: every hit of it falls where the open hat hits (step${underOpen.length === 1 ? '' : 's'} ${underOpen.map((step) => count(step + barFrom)).join(', ')}), and the grid keeps one hat a step, as a drummer plays one or the other (the OP-XY plays both: the notes form stacks them). Give the closed hat steps of its own, or leave it out.`
						: // the grid's choice, said as one (agents told users a closed and an open hat "can't
							// share a step")
							`Closed hat left out on step${underOpen.length === 1 ? '' : 's'} ${underOpen.map((step) => count(step + barFrom)).join(', ')}, under the open hat: the grid keeps one hat a step, as a drummer plays them (not a limit of the OP-XY: the notes form stacks both). A normal hat line; mention it only if the user asked for closed hats there.`
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
			// a groove that moves none of the notes: said (an agent swung a beat whose every hit sat
			// on an odd step, and described a swing nobody would hear)
			const groove = virtual.status().groove;
			// a groove given here is confirmed, what it moves said either way
			const reach = groove
				? grooveReach(
						result,
						groove.type,
						result.groove || groove.amount || 0,
						input.groove !== undefined
					)?.replace(
						/^The groove \(([^)]*)\)/,
						result.groove ? `The groove ($1, this pattern's own)` : 'The groove ($1)'
					)
				: null;
			if (reach) notes2.push(reach);
			// with an arrangement the scenes stay as they are: say where this pattern plays
			const arrangement = virtual.readArrangement();
			const other = playedBefore !== undefined && playedBefore !== pattern;
			if (arrangement.scenes.length > 1) {
				const plays = arrangement.scenes
					.filter((sc) => sc.patterns[input.track - 1] === pattern)
					.map((sc) => sc.scene);
				notes2.push(
					plays.length > 0
						? `The scenes are as they were: this pattern plays in scene${plays.length === 1 ? '' : 's'} ${plays.join(', ')}.`
						: `The scenes are as they were, and none plays this pattern yet: write_arrangement puts it in one.`
				);
			} else if (other && input.stay) {
				notes2.push(
					`T${input.track} still plays pattern ${playedBefore}: pattern ${pattern} waits until write_arrangement puts it in a scene.`
				);
			} else if (other) {
				// with one scene, what plays follows the pattern written last (an agent saw tracks
				// "flip" between patterns and could not tell why; another told a user their first
				// beat was gone, though it was still pattern 1)
				notes2.push(
					`T${input.track} plays pattern ${pattern} now; pattern ${playedBefore}, which it played, is still on the track as it was. With one scene, the pattern written last plays, until write_arrangement sets which pattern each scene plays.`
				);
			}
			const sound = soundOf(virtual, input.track);
			// a transpose carries the key it moves from, named rather than guessed afresh (G D A Bm
			// transposed from A minor read as D major, and an agent named the key change wrong)
			const slot = `${input.track}:${pattern}`;
			const keyFrom = `${fromTrack}:${copied ?? pattern}`;
			const carried =
				!input.key && !drums && transpose !== 0 && scaleSteps === 0 && was
					? movedKey(
							keysOf(virtual).get(keyFrom) ??
								readPattern(was, partsAlongside(virtual, input.track, pattern))?.key,
							transpose
						)
					: null;
			// a write that starts from the pattern and moves no note (humanize, a merge, a scale)
			// keeps the key it was written in (an "E dorian" line humanized read back as E minor)
			const stayed =
				!input.key && !drums && transpose === 0 && scaleSteps === 0 && (was || existing)
					? keysOf(virtual).get(keyFrom)
					: undefined;
			// the key this pattern is in now, for the next write
			if (input.key && parseKey(input.key)) keysOf(virtual).set(slot, parseKey(input.key)!.label);
			else if (carried) keysOf(virtual).set(slot, carried.key.label);
			else if (stayed) keysOf(virtual).set(slot, stayed);
			else if (given || input.grid !== undefined) keysOf(virtual).delete(slot);
			const view = patternView(result, {
				drumSteps: false,
				alongside: partsAlongside(virtual, input.track, pattern),
				meter: meterNow(virtual),
				bpm: virtual.status().bpm,
				meant: input.key
					? parseKey(input.key)
					: (carried?.key ?? (stayed ? parseKey(stayed) : null)),
				written: writtenAccidentals(input.notes),
				plain: velocity,
				// the chords by the names given, where the notes are theirs
				named: input.chords
					? new Map(
							[...chordSymbols(input.chords)].map(([step, symbol]) => [step + barFrom, symbol])
						)
					: new Map()
			});
			if (carried && view.reading && 'key' in view.reading) {
				(view.reading as { key?: string }).key = `${carried.key.label} (${carried.from})`;
			}
			// a bass on the kick's steps (an agent moving a bass off the kick worked the overlaps out by
			// hand, from a grid and a list of steps)
			if (!drums && result.scale === 1 && result.notes.some((n) => n.note < 48)) {
				for (const kit of partsAlongside(virtual, input.track, pattern, true)) {
					if (kit.scale !== 1) continue;
					const kicks = new Set(
						kit.notes.filter((n) => /kick/.test(n.sound ?? '')).map((n) => n.step)
					);
					if (kicks.size === 0) continue;
					// the kick's pattern repeats under a longer bass
					const on = (step: number) => kicks.has(((step - 1) % kit.length) + 1);
					const shared = [...new Set(result.notes.filter((n) => on(n.step)).map((n) => n.step))];
					if (shared.length > 0) {
						// lengths that do not divide each other drift, so the steps hold for the first
						// pass alone (a one-bar kick under a two-bar bass lines up on every pass)
						const longer = Math.max(kit.length, result.length);
						const drifting = longer % kit.length !== 0 || longer % result.length !== 0;
						notes2.push(
							`It hits with T${kit.track}'s kick on step${shared.length === 1 ? '' : 's'} ${shared.slice(0, 12).join(', ')}${shared.length > 12 ? ', …' : ''} (${shared.length} of its ${new Set(result.notes.map((n) => n.step)).size} steps${drifting ? ', on the first pass: their lengths differ, so this moves as they drift' : ''}): together is a style choice, nothing to fix (most grooves lock the bass to the kick); for room between them, move the bass off those steps.`
						);
					}
				}
			}
			// patterns of other lengths in the scene drift against each other while it repeats, and a
			// scene the song moves to starts every track on step 1 (an agent writing a three-bar bass
			// under four-bar drums could not tell whether they drift or restart together)
			{
				const others = [
					...partsAlongside(virtual, input.track, pattern),
					...partsAlongside(virtual, input.track, pattern, true)
				].filter((q) => q.notes.length > 0);
				const own = result.length * result.scale;
				const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
				const all = [own, ...others.map((q) => q.length * q.scale)];
				const together = all.reduce((a, b) => (a * b) / gcd(a, b));
				// only lengths that do not divide one another drift (a one-bar kick under a two-bar bass
				// simply repeats)
				const unlike = others.filter((q) => q.length * q.scale !== own);
				if (result.notes.length > 0 && unlike.length > 0 && together > Math.max(...all)) {
					const lengths = unlike
						.map((q) => `T${q.track}'s ${q.length * q.scale}`)
						.slice(0, 4)
						.join(', ');
					notes2.push(
						`Its ${own} steps loop on their own against ${lengths}: while the scene loops on its own they drift and line up again every ${together} steps (${Math.round((together / 16) * 100) / 100} bars); in a song, every entry (the same scene again too) starts every track on its first step, so there the scene's length cuts the shorter loops off.`
					);
				}
			}
			// a line that moves with another part, read as their interval (an agent harmonizing a melody
			// a third above said which thirds were minor with no way to check)
			if (!drums && result.notes.length >= 4) {
				const mine = { track: input.track, length: result.length, notes: result.notes };
				const against = partsAlongside(virtual, input.track, pattern)
					.filter((q) => q.scale === result.scale)
					.map((q) => voicesNote(mine, { track: q.track, length: q.length, notes: q.notes }))
					.find((line) => line !== null);
				if (against) notes2.push(against);
			}
			// chords on a track that sounds one note at a time (an agent wrote chords on the mono bass
			// track, and only found out by reading its sound)
			const playMode = virtual.status().tracks[input.track - 1]?.playMode;
			const stacked = new Set<number>();
			const onStep = new Map<number, number>();
			for (const n of result.notes) {
				const count = (onStep.get(n.step) ?? 0) + 1;
				onStep.set(n.step, count);
				if (count > 1) stacked.add(n.step);
			}
			if (!drums && playMode && playMode !== 'poly' && stacked.size > 0) {
				notes2.push(
					`T${input.track} plays ${playMode} (its play mode, shift M2), so a chord sounds one note at a time: set its play mode to poly (plan_steps param "play mode", value poly) for the chords to sound.`
				);
			}
			// single notes that run into the next on a mono track: the next cuts them (an agent asked
			// for overlapping bass notes found out from the sound that mono cuts overlaps)
			if (!drums && playMode === 'mono' && stacked.size === 0) {
				const sorted = [...result.notes].sort((a, b) => a.step - b.step);
				const cut = sorted.filter(
					(n, i) => i + 1 < sorted.length && n.step + n.length > sorted[i + 1].step
				).length;
				if (cut > 0) {
					notes2.push(
						`T${input.track} plays mono, so where a note runs on into the next (${cut} time${cut === 1 ? '' : 's'} here), the next cuts it off with a new attack: legato joins them without one (a glide with portamento up), poly lets both ring (plan_steps param "play mode").`
					);
				}
			}
			// where the notes slide on a mono or legato track with portamento up (an agent's acid line
			// ended each note where the next began, and it said they slid), and a slow attack the
			// notes end before (a 3 s swell under notes of 2 s)
			if (!drums && result.notes.length > 0) {
				const pages = virtual.readSound(input.track).pages;
				if (playMode && playMode !== 'poly') {
					const slides = slidesNote(input.track, pages['shift M2 play mode'] ?? '', result.notes);
					if (slides) notes2.push(slides);
				}
				const swell = swellNote(
					input.track,
					pages['M2 amp envelope'] ?? '',
					result.notes,
					result.scale,
					virtual.status().bpm
				);
				if (swell) notes2.push(swell);
				// a long release under changing chords (a pad's 3.2 s tail read as sus chords at
				// every change, and the agent looked for the clash in the notes)
				const tail = tailNote(
					input.track,
					pages['M2 amp envelope'] ?? '',
					result.notes,
					result.scale,
					virtual.status().bpm
				);
				if (tail) notes2.push(tail);
			}
			// a component on a drum step reaches every sound there, as a lock does (a snare roll put
			// on steps 15 and 16 rolled the hat on 15 too, and the agent could not tell)
			if (drums && landing.length > 0) {
				const shared = [...new Set(landing.map((c) => c.step))]
					.sort((a, b) => a - b)
					.flatMap((step) => {
						const sounds = [
							...new Set(
								result.notes.filter((n) => n.step === step).map((n) => n.sound ?? String(n.note))
							)
						];
						return sounds.length > 1 ? [`step ${step}: ${sounds.join(', ')}`] : [];
					});
				if (shared.length > 0) {
					notes2.push(
						`A component is the whole step's on a drum track, so it reaches every sound there: ${shared.join('; ')}. For one sound alone (a snare roll without the hat), give it steps of its own, or put it on a track of its own (T2 is a second drum track, with a kit of its own).`
					);
				}
			}
			// step components on steps with no notes, left out (an agent's rolls sat on rests)
			if (bare.length > 0) {
				notes2.push(
					`Step${bare.length === 1 ? '' : 's'} ${bare.join(', ')} hold${bare.length === 1 ? 's' : ''} no notes, so ${bare.length === 1 ? 'its component was' : 'their components were'} left out: a component plays only on a step with notes.`
				);
			}
			// chords by name voiced smoothly read back as inversions, which three agents explained to
			// the user afterwards, unaware of voicing root
			if (
				input.chords &&
				input.voicing !== 'root' &&
				'reading' in view &&
				/inversion/.test(view.reading?.progression ?? '')
			) {
				notes2.push(
					'The chords are voiced to move as little as they can, hence the inversions; voicing "root" puts every chord on its root.'
				);
			}
			return jsonResult(
				{
					written: view,
					// the meter it was read in, outside 4/4 (an agent unsure whether a change of time
					// signature in the same answer had reached the write)
					// and the pattern in that meter's bars, which "bars" (of 16 steps) is not (a 12/8 shuffle
					// read "3 bars" here against the song's 2 bars of 12/8), and what the tempo counts
					...(meter.bar !== 16
						? {
								meter: `${virtual.status().signature}: bars of ${meter.bar} steps; this pattern is ${Math.round((result.length / meter.bar) * 100) / 100} of them (bars counts bars of 16 steps). The tempo counts quarter notes, four steps, in every meter, as the replica plays it.`
							}
						: {}),
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

/** The note names with a sharp or flat the notes give ("G#" from "9:G#2:3"), for the reading. */
function writtenAccidentals(notes: unknown): string[] {
	const text = typeof notes === 'string' ? notes : JSON.stringify(notes ?? null);
	return [...new Set([...text.matchAll(/(?<![A-Za-z])([A-G](?:#|b|♯|♭))-?\d/g)].map((m) => m[1]))];
}

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
		"Read one pattern of one track on the replica: bars, length, track scale and every note (a drum track as its grid, any other also as notes in the form write_pattern takes, to edit and write back), with its step locks (each step's own values, such as a cutoff locked on step 17) and step components. Default: the pattern the track plays now. Changes nothing; use it to check what landed.",
	input: z.object({
		track: z.int().min(1).max(16).describe('Track 1–16'),
		pattern: z.int().min(1).max(16).optional().describe('Pattern 1–16 (default: the one playing)')
	}),
	async run(input, ctx) {
		const virtual = virtualOf(ctx.env);
		if (!virtual) return errorResult(NO_VIRTUAL, 'no virtual op-xy');
		try {
			const p = virtual.readPattern(input.track, input.pattern);
			// the key its write named, as the write's own reading had it (a D dorian line read back
			// alone was guessed afresh as D minor)
			const named = keysOf(virtual).get(`${input.track}:${p.pattern}`);
			return jsonResult(
				patternView(p, {
					alongside: partsAlongside(virtual, input.track, p.pattern),
					meter: meterNow(virtual),
					bpm: virtual.status().bpm,
					...(named ? { meant: parseKey(named) } : {})
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
			// a closed filter that its envelope opens (an agent read a bass preset's cutoff 00 as all
			// but silent and doubted the reading)
			const filter = /filter on: cutoff (\d+),.*envelope amount (\d+)/.exec(
				sound.pages['M3 filter'] ?? ''
			);
			const opens =
				filter && Number(filter[1]) < 15 && Number(filter[2]) > 0
					? `The filter is nearly closed at cutoff ${filter[1]}, but its envelope opens it on every note: at the filter envelope's peak to about ${Math.min(99, Math.round(Number(filter[1]) + 0.85 * Number(filter[2])))} (envelope amount ${filter[2]}), then back toward its sustain, so the track sounds dark and plucked, not silent.`
					: null;
			// the envelopes in seconds (an agent set attack 75 for a slow swell: about 24 s)
			const times = (
				[
					['amp', sound.pages['M2 amp envelope']],
					['filter', sound.pages['M2 filter envelope']]
				] as const
			).flatMap(([name, page]) => {
				const t = page ? envelopeTimes(page) : null;
				return t ? [`${name} envelope ${t}`] : [];
			});
			// a filter switched off does nothing (an agent said a pad's filter envelope opened its tone
			// on a filter that read off)
			const off = / filter off:/.test(sound.pages['M3 filter'] ?? '')
				? 'The filter is off (M3 pressed again switches it on): its cutoff, resonance and the filter envelope do nothing until then.'
				: null;
			return jsonResult(
				{
					...sound,
					// what the numbers are on (an agent called 99 "a lot" unsure of the scale)
					reading: [
						'Values as the pages show them: most run 00–99; tune is in semitones, pan −100…100, an LFO amount −99…99. A send of 99 is full, and the tape send at 99 is the normal path to the output, not a sound taken away.',
						...(times.length
							? [
									`In time: ${times.join('; ')} (an attack to full level, a decay or release until nearly out; attack 50 is about 1.4 s, 60 about 4 s, 75 about 24 s).`
								]
							: []),
						...(off ? [off] : []),
						...(opens ? [opens] : [])
					].join(' ')
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
function arrangementBack(
	before: VirtualArrangement,
	touched: readonly { scene: number; mix?: readonly { track: number }[] }[]
): ArrangementWrite {
	return {
		scenes: touched.map(({ scene, mix }) => {
			const was = before.scenes.find((s) => s.scene === scene);
			// the tracks whose level or mute this changed, back as the scene had them
			const back =
				was && mix?.length
					? mix.map(({ track }) => ({
							track,
							...(was.levels?.[track - 1] !== undefined ? { level: was.levels[track - 1] } : {}),
							muted: was.muted?.includes(track) ?? false
						}))
					: undefined;
			return {
				scene,
				patterns: was ? was.patterns.map((pattern, i) => ({ track: i + 1, pattern })) : null,
				...(back ? { mix: back } : {})
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
		'Set scenes and the song on the replica. A scene says which pattern each track plays: tracks left out keep the pattern they have in that scene (pattern 1 in a new scene), so a scene changes track by track; pattern 0 makes a track rest, silent, in that scene (on an empty pattern the track has, else one added at its end, which the result lists; a mute in the scene’s mix rests it too and adds no pattern); patterns missing on a track are added empty; null clears a scene; mix sets a scene’s own levels and mutes (a louder chorus, the bass out of one part), which it keeps as the song moves through it. The song is the order scenes play in (up to 96 entries) and whether it loops. transport play then plays the song from its first scene when it has more than one entry. Write the patterns first with write_pattern.',
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
							'The tracks to set in this scene (the rest keep theirs, so [] with mix sets the scene\u2019s mix alone); null clears the scene'
						),
					mix: z
						.array(
							z.object({
								track: z.int().min(1).max(16).describe('Track 1–16'),
								level: z
									.int()
									.min(0)
									.max(99)
									.optional()
									.describe(
										'Its level, 0–99: a new project’s tracks sit at 74, the replica’s unity; 60 is about −4 dB, 50 −7 dB, 37 −12 dB, 99 +4 dB'
									),
								muted: z.boolean().optional().describe('Muted in this scene')
							})
						)
						.optional()
						.describe(
							'Levels and mutes this scene keeps (a scene stores its mix: a louder chorus, the bass muted in one part, a part quieter in one section with its notes left as they are); tracks left out keep theirs, and a new scene starts from the mix playing now'
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
		const back = arrangementBack(before, input.scenes ?? []);
		return {
			tool: 'write_arrangement',
			input: {
				scenes: (back.scenes ?? []).map((s) => ({
					scene: s.scene,
					patterns: s.patterns,
					...(s.mix ? { mix: s.mix } : {})
				})),
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
			const scenes = input.scenes?.map(({ scene, patterns, mix }) => {
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
				return { scene, patterns: all, ...(mix ? { mix } : {}) };
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
			// in a song every entry starts every track over, so a scene longer than a pattern and not
			// a whole number of its loops cuts its last loop off (an agent had to work out that two-
			// bar chords in a three-bar scene restart halfway through their second pass)
			const cut =
				result.song.order.length > 1
					? [...new Set(result.song.order)].flatMap((number) => {
							const scene = result.scenes.find((sc) => sc.scene === number);
							if (!scene) return [];
							return scene.patterns.slice(0, 8).flatMap((pattern, i) => {
								if (byPattern.get(i + 1)?.[pattern - 1] === 0) return [];
								const p = virtual.readPattern(i + 1, pattern);
								const bars = (p.length * p.scale) / (result.barSteps ?? 16);
								const passes = scene.bars / bars;
								if (bars <= 0 || Math.abs(passes - Math.round(passes)) < 1e-6) return [];
								return [
									`scene ${number} (${barsText(scene.bars)}): T${i + 1}'s ${barsText(bars)} play ${Math.round(passes * 100) / 100} times, the last pass cut off when the song moves on`
								];
							});
						})
					: [];
			return jsonResult(
				{
					arrangement: arrangementView(result, virtual.status().bpm, byPattern),
					...(added.length ? { addedEmpty: added } : {}),
					...(cut.length
						? {
								cutOff: `${cut.join('; ')}: each song entry, the same scene again too, starts every track on its first step. Patterns that divide the scene's length play whole.`
							}
						: {}),
					// while it plays (an agent could not tell whether a rewrite would restart or jump it)
					note: `On the replica.${resting.length ? ` In scene ${result.scene}, the one on screen, ${resting.join(', ')} rest${resting.length === 1 ? 's' : ''} on an empty pattern: selecting ${resting.length === 1 ? 'it' : 'one'} there shows that pattern, empty.` : ''}${virtual.status().playing ? ' Playback goes on where it was, the scene on screen with its new patterns; transport play starts the song again from its first scene.' : ''}`
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
	// a sixteenth lasts 15 / bpm seconds; a bar holds the meter's sixteenths (16 in 4/4, 14 in 7/8)
	const seconds = (n: number) => (n * (a.barSteps ?? 16) * 15) / bpm;
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
	// a track that plays in another scene, resting on its empty pattern 1 here, rests too (an
	// agent rested a lead in the verse and read "every track p1")
	const playsElsewhere = (i: number, scene: number) =>
		a.scenes.some((o) => o.scene !== scene && !empty(i + 1, o.patterns[i]));
	return {
		scene: a.scene,
		scenes: Object.fromEntries(
			a.scenes.map((s) => {
				const others = s.patterns.flatMap((p, i) =>
					p === 1 && !(empty(i + 1, 1) && playsElsewhere(i, s.scene))
						? []
						: empty(i + 1, p)
							? [`${name(i)} rests (p${p}, empty)`]
							: [`${name(i)} p${p}`]
				);
				const which = others.length > 0 ? `${others.join(', ')}; the rest p1` : 'every track p1';
				// its mix: mutes, and a track's level in every scene once the scenes differ on it (a verse
				// set under the tracks' 74 read as nothing when only the chorus's levels showed)
				const levels = (s.levels ?? []).flatMap((l, i) =>
					new Set(a.scenes.map((x) => x.levels?.[i])).size > 1 ? [`T${i + 1} ${l}`] : []
				);
				const mix = [
					s.muted?.length ? `muted ${s.muted.map((t) => name(t - 1)).join(', ')}` : '',
					levels.length ? `levels ${levels.join(', ')}` : ''
				].filter(Boolean);
				return [
					`scene ${s.scene}`,
					`${which} (${barsText(s.bars)})${mix.length ? `; ${mix.join('; ')}` : ''}`
				];
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
		// playback is the transport's: a take-back leaves it running or stopped as it is
		const transport = (l: string) => /^playback (started|stopped)/.test(l);
		const kept = (outcome.kept ?? []).filter((l) => !transport(l));
		return jsonResult(
			{
				takenBack: outcome.undone.filter((l) => !transport(l)),
				...(kept.length
					? {
							kept: kept,
							keptNote:
								'still unlike before that answer: what the user changed since (left as they made it)'
						}
					: {}),
				note: `The replica reads as it did before that answer, apart from what changed since${outcome.undone.some(transport) ? '; playback is left as it is (transport stops or plays it)' : ''}. The changes list after this call is the take-back itself, each change reversed ("up an octave" undoing "down an octave").`
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
