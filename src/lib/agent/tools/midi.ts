/**
 * `import_midi`: a MIDI file the user attached, arranged onto the replica by deterministic code
 * (`../midi-import.ts`): the model picks which of the file's tracks go to which OP-XY tracks, and
 * the notes, patterns, scenes and song come from the file itself. So a whole song never has to be
 * retyped note by note (which also ran past the answer's length limit).
 */
import { z } from 'zod';
import { midiFileNotes } from '$lib/core/music/midifile';
import { MidiImportError, planMidiImport, type ImportPlan } from '../midi-import';
import { defineTool, errorResult, jsonResult } from './define';

/** The plan in the model's words: what each track became, the scenes and the song. */
function planView(plan: ImportPlan, names: ReadonlyMap<number, string>) {
	const firstBars = new Map<number, string>();
	plan.song.forEach((scene, i) => {
		if (firstBars.has(scene)) return;
		const from = plan.fromBar + i * plan.barsPerBlock;
		firstBars.set(scene, `bars ${from}–${Math.min(plan.toBar, from + plan.barsPerBlock - 1)}`);
	});
	return {
		bpm: Math.round(plan.bpm * 10) / 10,
		bars: `${plan.fromBar}–${plan.toBar}`,
		tracks: plan.tracks.map((t) => ({
			file: `track ${t.midi}${names.get(t.midi) ? ` "${names.get(t.midi)}"` : ''}`,
			to: t.to,
			...(t.drums ? { drums: true } : {}),
			notes: t.notes,
			patterns: t.patterns,
			...(t.folded
				? {
						approximated: `${t.folded} of ${plan.blocks} blocks play a near pattern, about ${Math.round((t.foldedAlike ?? 0) * 100)} % alike (the part changes more often than 16 patterns hold)`
					}
				: {}),
			...(t.overflow ? { leftOut: `${t.overflow} quiet notes over a pattern's 120` } : {}),
			...(t.unmapped ? { unmapped: `${t.unmapped} drum notes with no place on the kit` } : {})
		})),
		scenes: plan.scenes.length,
		song: plan.song,
		sceneStarts: Object.fromEntries(firstBars),
		...(plan.notes.length ? { notCarried: plan.notes } : {})
	};
}

export const importMidiTool = defineTool({
	name: 'import_midi',
	label: 'import midi',
	kind: 'mutate',
	approval: 'auto',
	// optional fields per track would crowd the strict grammar; zod still checks every call
	strict: false,
	description:
		"Put a MIDI file the user attached onto the replica as the OP-XY plays a song: pick which of the file's tracks go to which OP-XY instrument tracks (8 at most; drums on a drum track, 1 or 2) and this writes, from the file itself, each track's parts as 4-bar patterns (identical bars share one, 16 per track at most), a scene for every 4 bars, the song through them in order, and the tempo. GM drums land on the kit's layout. Parts that change more often than 16 patterns hold are approximated (the result says how closely), notes off the sixteenths move onto them, and one tempo plays throughout. Use preview first for a big file: it reports all that and writes nothing. Replaces the patterns on the tracks it writes, and the scenes and song. Never retype a MIDI file's notes with write_pattern; then transport play.",
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
			.max(8)
			.describe('Which file tracks go where'),
		from_bar: z.int().min(1).optional().describe('First bar to take (default: the start)'),
		to_bar: z.int().min(1).optional().describe('Last bar to take (default: the end)'),
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
		let names: Map<number, string>;
		try {
			const read = midiFileNotes(bytes);
			names = new Map(
				read.tracks.flatMap((t) => (t.name ? [[t.index + 1, t.name.trim()] as const] : []))
			);
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
		const view = planView(plan, names);
		const summary = `${plan.tracks.length} track${plan.tracks.length === 1 ? '' : 's'}, ${plan.scenes.length} scenes, a song of ${plan.song.length}`;
		if (input.preview) {
			return jsonResult({ preview: view, note: 'Nothing written yet.' }, `preview: ${summary}`);
		}
		const virtual = ctx.env.virtual;
		if (!virtual) return errorResult('There is no replica in this session.', 'no replica');
		try {
			virtual.setTempo(Math.min(220, Math.max(40, plan.bpm)));
			for (const p of plan.patterns) {
				virtual.writePattern(p.track, {
					pattern: p.pattern,
					bars: p.bars,
					length: p.length,
					notes: p.notes
				});
			}
			virtual.writeArrangement({
				scenes: plan.scenes.map((s) => ({ scene: s.scene, patterns: s.patterns })),
				song: { order: plan.song, loop: true }
			});
		} catch (error) {
			return errorResult(
				`The import stopped part way: ${error instanceof Error ? error.message : String(error)}`,
				'not imported'
			);
		}
		return jsonResult(
			{
				imported: view,
				note: 'On the replica. transport play runs the song from its first scene. Tracks you did not import keep their patterns and play pattern 1 in every scene.'
			},
			summary,
			{ applied: true }
		);
	}
});

/** The MIDI tools. */
export const MIDI_TOOLS = [importMidiTool];
