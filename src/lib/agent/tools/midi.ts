/**
 * `import_midi`: a MIDI file the user attached, arranged onto the replica by deterministic code
 * (`../midi-import.ts`): the model picks which of the file's tracks go to which OP-XY tracks, and
 * the notes, patterns, scenes and song come from the file itself. So a whole song never has to be
 * retyped note by note (which also ran past the answer's length limit).
 */
import { z } from 'zod';
import { midiFileNotes, type MidiFileNotes } from '$lib/core/music/midifile';
import { MidiImportError, planMidiImport, type ImportPlan } from '../midi-import';
import type { VirtualOpxy } from '../virtual-opxy';
import { defineTool, errorResult, jsonResult } from './define';

/** A share as a percentage that never rounds a loss away (99.6 % is "over 99 %"). */
const percent = (share: number) =>
	share < 1 && Math.round(share * 100) === 100 ? 'over 99 %' : `${Math.round(share * 100)} %`;

/** The plan in the model's words: what each track became, the scenes and the song. */
function planView(plan: ImportPlan, read: MidiFileNotes) {
	const firstBars = new Map<number, string>();
	plan.song.forEach((scene, i) => {
		if (firstBars.has(scene)) return;
		const from = plan.fromBar + i * plan.barsPerBlock;
		firstBars.set(scene, `bars ${from}–${Math.min(plan.toBar, from + plan.barsPerBlock - 1)}`);
	});
	const bars = plan.toBar - plan.fromBar + 1;
	return {
		bpm: Math.round(plan.bpm * 10) / 10,
		bars: `${plan.fromBar}–${plan.toBar}${plan.silentStart ? ` (the file's first ${plan.silentStart === 1 ? 'bar is' : `${plan.silentStart} bars are`} silent, so the song starts where the music does)` : ''}`,
		tracks: plan.tracks.map((t) => ({
			to: t.to,
			file: t.parts.map((p) => `track ${p.midi}${p.name ? ` "${p.name.trim()}"` : ''}`).join(' + '),
			...(t.drums ? { drums: true } : {}),
			notes: t.notes,
			patterns: t.patterns,
			...(t.folded && t.asWritten === 1
				? {
						shared: `${t.folded} of ${plan.blocks} blocks share a pattern that differs from them only in loudness or note lengths: every note plays as written`
					}
				: t.folded
					? {
							approximated: `the part changes more often than 16 patterns hold, so ${t.folded} of ${plan.blocks} blocks play the closest of its patterns: ${percent(t.asWritten)} of its notes play as written${t.drums ? '' : `, and ${t.offBars ? `${t.offBars} of ${bars} bars differ from the file's chords or pitches` : 'every bar keeps the file’s chords'}`}`
						}
					: {}),
			...(t.overflow ? { leftOut: `${t.overflow} quiet notes over a pattern's 120` } : {}),
			...(t.unmapped
				? {
						unmapped: `${t.unmapped} drum note${t.unmapped === 1 ? '' : 's'} with no place on the kit`
					}
				: {})
		})),
		notImported: read.tracks
			.filter(
				(t) =>
					t.noteCount > 0 && !plan.tracks.some((p) => p.parts.some((q) => q.midi === t.index + 1))
			)
			.map(
				(t) => `track ${t.index + 1}${t.name ? ` "${t.name.trim()}"` : ''} (${t.noteCount} notes)`
			),
		scenes: plan.scenes.length,
		sceneLength: lastBlockNote(plan),
		song: plan.song,
		sceneStarts: Object.fromEntries(firstBars),
		...(plan.notes.length ? { notCarried: plan.notes } : {})
	};
}

/** How long the scenes are, the last one's said when it is shorter. */
function lastBlockNote(plan: ImportPlan): string {
	const bars = plan.toBar - plan.fromBar + 1;
	const last = bars - (plan.blocks - 1) * plan.barsPerBlock;
	const plural = (n: number) => `${n} bar${n === 1 ? '' : 's'}`;
	if (plan.blocks === 1) return plural(last);
	const each = `${plural(plan.barsPerBlock)} each`;
	return last < plan.barsPerBlock ? `${each}, the last ${plural(last)}` : each;
}

/**
 * Instrument tracks the import leaves out that would play their own pattern 1 in every scene: each
 * gets an empty pattern (one it has, else a new one) to rest on, so the song plays alone. A track
 * with 16 patterns and none empty keeps playing (the result says so).
 */
function restOthers(virtual: VirtualOpxy, imported: ReadonlySet<number>) {
	const rests: { track: number; pattern: number }[] = [];
	const playing: number[] = [];
	for (let track = 1; track <= 8; track++) {
		if (imported.has(track)) continue;
		const first = virtual.readPattern(track, 1);
		if (first.notes.length === 0) continue;
		let empty = 0;
		for (let p = 2; p <= first.patterns && !empty; p++) {
			if (virtual.readPattern(track, p).notes.length === 0) empty = p;
		}
		if (!empty && first.patterns >= 16) {
			playing.push(track);
			continue;
		}
		if (!empty) {
			empty = first.patterns + 1;
			virtual.writePattern(track, { pattern: empty, bars: 1, scale: 1, notes: [] });
		}
		rests.push({ track, pattern: empty });
	}
	return { rests, playing };
}

/** What writing an import plan did beyond the plan itself. */
export interface ImportWrite {
	/** Tracks the import left out, each resting on an empty pattern during the song. */
	readonly rests: readonly { readonly track: number; readonly pattern: number }[];
	/** Tracks left out that keep playing their pattern 1 (16 patterns, none empty). */
	readonly playing: readonly number[];
	/** The metronome was on and is off now. */
	readonly clickOff: boolean;
}

/**
 * Writes an import plan onto a virtual OP-XY (import_midi's, and the lab's on a fork): the tempo,
 * the patterns at track scale 1 (a step is a sixteenth, as the file's notes were placed), the
 * tracks left out resting unless `keepOthers`, the scenes and the song, and the metronome off, so
 * the song plays without the click (a new project has it on).
 * @throws {Error} what the virtual OP-XY refused, part way through
 */
export function writeImport(
	virtual: VirtualOpxy,
	plan: ImportPlan,
	options: { readonly keepOthers?: boolean } = {}
): ImportWrite {
	const clickOff = virtual.status().metronome === true;
	virtual.setTempo(Math.min(220, Math.max(40, plan.bpm)));
	if (clickOff) virtual.setMetronome(false);
	for (const p of plan.patterns) {
		virtual.writePattern(p.track, {
			pattern: p.pattern,
			bars: p.bars,
			length: p.length,
			scale: 1,
			notes: p.notes
		});
	}
	const others = options.keepOthers
		? { rests: [], playing: [] }
		: restOthers(virtual, new Set(plan.tracks.map((t) => t.to)));
	virtual.writeArrangement({
		scenes: plan.scenes.map((s) => ({
			scene: s.scene,
			patterns: [...s.patterns, ...others.rests]
		})),
		song: { order: plan.song, loop: true }
	});
	return { ...others, clickOff };
}

export const importMidiTool = defineTool({
	name: 'import_midi',
	label: 'import midi',
	kind: 'mutate',
	approval: 'auto',
	// optional fields per track would crowd the strict grammar; zod still checks every call
	strict: false,
	description:
		"Put a MIDI file the user attached onto the replica as the OP-XY plays a song: pick which of the file's tracks go to which OP-XY instrument tracks (drums on a drum track, 1 or 2; several file tracks can share one OP-XY track, such as a melody split between a verse track and a chorus track, or parts that take turns) and this writes, from the file itself, from the first bar they play to the last: each track's parts as 4-bar patterns (identical bars share one, 16 per track at most; a shorter loop or last block plays at its own length), a scene for every 4 bars, the song through them in order, and the tempo. GM drums land on the kit's layout. A part that changes more often than 16 patterns hold plays the closest of its patterns in some blocks (the result says how much plays as written), notes off the sixteenths move onto them, and one tempo plays throughout. Tracks left out rest during the song unless keep_others. Use preview first for a big file: it reports all that and writes nothing. Replaces the patterns on the tracks it writes, and the scenes and song. Never retype a MIDI file's notes with write_pattern; then transport play.",
	input: z.object({
		file: z.string().min(1).max(200).describe('The MIDI file, by the name the chat shows'),
		tracks: z
			.array(
				z.object({
					midi: z
						.int()
						.min(1)
						.max(64)
						.describe("The file's track number, as the attachment lists it"),
					to: z.int().min(1).max(8).describe('OP-XY instrument track 1–8'),
					transpose: z
						.int()
						.min(-48)
						.max(48)
						.optional()
						.describe('Semitones up or down (melodic tracks), to sit in a sound’s range'),
					drums: z
						.boolean()
						.optional()
						.describe('Put GM drum notes on the kit layout (default: a track on channel 10)')
				})
			)
			.min(1)
			.max(16)
			.describe('Which file tracks go where (several may share an OP-XY track)'),
		from_bar: z
			.int()
			.min(1)
			.optional()
			.describe('First bar to take (default: the first bar the tracks play)'),
		to_bar: z
			.int()
			.min(1)
			.optional()
			.describe('Last bar to take (default: the last bar the tracks play)'),
		keep_others: z
			.boolean()
			.optional()
			.describe(
				'true: OP-XY tracks not imported keep playing their own pattern under the song (default: they rest)'
			),
		preview: z
			.boolean()
			.optional()
			.describe('true: report what the import would make, write nothing')
	}),
	async run(input, ctx) {
		const bytes = ctx.env.files?.midi(input.file) ?? null;
		if (!bytes) {
			const names = ctx.env.files?.midiNames() ?? [];
			return errorResult(
				names.length
					? `No MIDI file named "${input.file}" in this conversation; attached: ${names.join(', ')}.`
					: 'No MIDI file is attached in this conversation (files do not survive a reload): ask the user to attach it again.',
				'no such file'
			);
		}
		let plan: ImportPlan;
		let read: MidiFileNotes;
		try {
			read = midiFileNotes(bytes);
			plan = planMidiImport(read, {
				tracks: input.tracks,
				fromBar: input.from_bar,
				toBar: input.to_bar
			});
		} catch (error) {
			if (error instanceof MidiImportError) return errorResult(error.message, 'cannot import');
			return errorResult(
				`The file could not be read: ${error instanceof Error ? error.message : String(error)}`,
				'not read'
			);
		}
		const view = planView(plan, read);
		const summary = `${plan.tracks.length} track${plan.tracks.length === 1 ? '' : 's'}, ${plan.scenes.length} scenes, a song of ${plan.song.length}`;
		if (input.preview) {
			return jsonResult(
				{
					preview: view,
					note: 'Nothing written yet. Import next (the same tracks, or a better mapping), with no words to the user before it.'
				},
				`preview: ${summary}`
			);
		}
		const virtual = ctx.env.virtual;
		if (!virtual) return errorResult('There is no replica in this session.', 'no replica');
		let written: ImportWrite;
		try {
			written = writeImport(virtual, plan, { keepOthers: input.keep_others });
		} catch (error) {
			return errorResult(
				`The import stopped part way: ${error instanceof Error ? error.message : String(error)}`,
				'not imported'
			);
		}
		return jsonResult(
			{
				imported: view,
				...(written.rests.length
					? {
							resting: `track${written.rests.length === 1 ? '' : 's'} ${written.rests.map((r) => r.track).join(', ')} rest during the song (their own patterns are kept)`
						}
					: {}),
				...(written.playing.length
					? {
							stillPlaying: `track${written.playing.length === 1 ? '' : 's'} ${written.playing.join(', ')} keep playing their pattern 1 in every scene (16 patterns, none empty): mute ${written.playing.length === 1 ? 'it' : 'them'} if the song should play alone`
						}
					: {}),
				...(written.clickOff
					? {
							metronome:
								'switched off, so the song plays without the click (the tempo page’s click E4 brings it back; a duck with the metronome as source still pumps on the beat)'
						}
					: {}),
				note: 'On the replica. transport play runs the song from its first scene.',
				answer:
					'Once it plays, answer in a few short paragraphs, no bullet lists: what plays (bars, tempo); where each part went, in one sentence, on the tracks’ own sounds, and what was left out and why; what is approximated, in a sentence; your touch; one next step that keeps the song’s feel (the file sets its own timing: no swing); how to move it to the OP-XY when the user means to. Nothing about listening unless you listened.'
			},
			summary,
			{ applied: true }
		);
	}
});

/** The MIDI tools. */
export const MIDI_TOOLS = [importMidiTool];
