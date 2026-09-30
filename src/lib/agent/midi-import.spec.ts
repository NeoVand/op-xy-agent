// A MIDI file arranged for the OP-XY: made-up files (drums on channel 10, a bass with two phrases)
// fold repeated bars into one pattern each, a scene every 4 bars and the song through them, GM
// drums on the kit's layout, notes onto the sixteenths; a silent start is left out, two file
// tracks can share an OP-XY track, and a part that changes more often than 16 patterns hold plays
// the patterns that stand best for the rest, keeping the harmony where it can.
import { describe, expect, it } from 'vitest';
import { encodeMidiFile, tempoMeta, type FileInput } from '$lib/core/midi/smf';
import { midiFileNotes } from '$lib/core/music/midifile';
import { MidiImportError, planMidiImport } from './midi-import';

const PPQ = 96;

/** A note as two events, `beat` and `beats` in quarter notes. */
function note(beat: number, beats: number, n: number, velocity = 100, channel = 0) {
	const at = Math.round(beat * PPQ);
	return [
		{ tick: at, event: { type: 'noteOn' as const, channel, note: n, velocity } },
		{
			tick: at + Math.round(beats * PPQ),
			event: { type: 'noteOff' as const, channel, note: n, velocity: 0 }
		}
	];
}

/** A file: a tempo track, then one track per list of notes. */
function file(bpm: number, ...tracks: ReturnType<typeof note>[][]): Uint8Array {
	const input: FileInput = {
		format: 1,
		division: { kind: 'ppq', ticksPerQuarter: PPQ },
		tracks: [
			{ events: [{ tick: 0, event: tempoMeta(bpm) }] },
			...tracks.map((notes) => ({ events: notes.flat() }))
		]
	};
	return encodeMidiFile(input);
}

/** A kick-snare-hat bar, `bars` times, on channel 10. */
function drums(bars: number) {
	const out: ReturnType<typeof note>[] = [];
	for (let bar = 0; bar < bars; bar++) {
		const b = bar * 4;
		out.push(note(b, 0.25, 36, 110, 9), note(b + 2, 0.25, 36, 110, 9));
		out.push(note(b + 1, 0.25, 38, 100, 9), note(b + 3, 0.25, 38, 100, 9));
		for (let e = 0; e < 8; e++) out.push(note(b + e / 2, 0.25, 42, 80, 9));
	}
	return out;
}

/** A 4-bar bass phrase on `root`, at bar `from`. */
function phrase(from: number, root: number) {
	return [0, 1, 2, 3].flatMap((bar) =>
		[0, 1.5, 2.5].map((beat) => note((from + bar) * 4 + beat, 0.5, root + (bar % 2) * 7))
	);
}

describe('planMidiImport', () => {
	it('folds repeated bars into patterns, a scene every 4 bars and the song through them', () => {
		// 16 bars: the bass plays A A B A, the drums one bar throughout
		const bass = [...phrase(0, 33), ...phrase(4, 33), ...phrase(8, 36), ...phrase(12, 33)];
		const read = midiFileNotes(file(107, drums(16), bass));
		const plan = planMidiImport(read, {
			tracks: [
				{ midi: 2, to: 1 },
				{ midi: 3, to: 3 }
			]
		});
		expect(plan).toMatchObject({ bpm: 107, fromBar: 1, toBar: 16, blocks: 4, barsPerBlock: 4 });
		const drumPatterns = plan.patterns.filter((p) => p.track === 1);
		const bassPatterns = plan.patterns.filter((p) => p.track === 3);
		expect(drumPatterns).toHaveLength(1);
		expect(bassPatterns.map((p) => p.pattern)).toEqual([1, 2]);
		expect(drumPatterns[0]).toMatchObject({ bars: 4, length: 64 });
		// GM kick 36 → 53, snare 38 → 55, closed hat 42 → 61, on the sixteenths of each bar
		const kit = drumPatterns[0].notes;
		expect(kit.filter((n) => n.note === 53).map((n) => n.step)).toEqual([
			1, 9, 17, 25, 33, 41, 49, 57
		]);
		expect(
			kit
				.filter((n) => n.note === 55)
				.map((n) => n.step)
				.slice(0, 2)
		).toEqual([5, 13]);
		expect(kit.filter((n) => n.note === 61)).toHaveLength(32);
		// two scenes, since the drums never change; the song plays A A B A
		expect(plan.scenes.map((s) => s.patterns)).toEqual([
			[
				{ track: 1, pattern: 1 },
				{ track: 3, pattern: 1 }
			],
			[
				{ track: 1, pattern: 1 },
				{ track: 3, pattern: 2 }
			]
		]);
		expect(plan.song).toEqual([1, 1, 2, 1]);
		expect(plan.tracks.map((t) => [t.to, t.drums, t.patterns, t.folded])).toEqual([
			[1, true, 1, 0],
			[3, false, 2, 0]
		]);
		expect(plan.notes).toEqual([]);
	});

	it('gives an empty stretch an empty pattern, transposes, and takes a range of bars', () => {
		const bass = [...phrase(0, 33), ...phrase(8, 33)];
		const read = midiFileNotes(file(120, bass));
		const plan = planMidiImport(read, { tracks: [{ midi: 2, to: 3, transpose: 12 }] });
		expect(plan.song).toEqual([1, 2, 1]);
		const [played, empty] = plan.patterns;
		expect(played.notes[0].note).toBe(45);
		expect(empty).toMatchObject({ pattern: 2, notes: [] });
		const part = planMidiImport(read, { tracks: [{ midi: 2, to: 3 }], fromBar: 9, toBar: 12 });
		expect(part).toMatchObject({ fromBar: 9, toBar: 12, blocks: 1, song: [1] });
		expect(part.patterns[0].notes[0]).toMatchObject({ step: 1, note: 33 });
	});

	it('keeps the 16 patterns that stand best for a part that changes all the time', () => {
		// 20 different 4-bar blocks: a rising root each time, 30 to 49
		const bass = Array.from({ length: 20 }, (_, i) => phrase(i * 4, 30 + i)).flat();
		const read = midiFileNotes(file(100, bass));
		const plan = planMidiImport(read, { tracks: [{ midi: 2, to: 3 }] });
		expect(plan.patterns).toHaveLength(16);
		expect(plan.song).toHaveLength(20);
		// the 4 left over play the kept phrase an octave away: no note as written, the harmony kept
		expect(plan.tracks[0]).toMatchObject({ patterns: 16, folded: 4, asWritten: 0.8, offBars: 0 });
		const rootOf = (block: number) => {
			const scene = plan.scenes[plan.song[block] - 1];
			const pattern = plan.patterns.find((p) => p.pattern === scene.patterns[0].pattern);
			return pattern?.notes[0].note;
		};
		expect([16, 17, 18, 19].map(rootOf)).toEqual([34, 35, 36, 37]);
	});

	it('starts where the music does, unless told a bar', () => {
		// two silent bars, then the phrase
		const read = midiFileNotes(file(120, phrase(2, 33)));
		const plan = planMidiImport(read, { tracks: [{ midi: 2, to: 3 }] });
		expect(plan).toMatchObject({ fromBar: 3, toBar: 6, silentStart: 2, blocks: 1, song: [1] });
		expect(plan.patterns[0].notes[0]).toMatchObject({ step: 1, note: 33 });
		const asked = planMidiImport(read, { tracks: [{ midi: 2, to: 3 }], fromBar: 1 });
		expect(asked).toMatchObject({ fromBar: 1, toBar: 6, silentStart: 0, blocks: 2 });
	});

	it('puts two file tracks that take turns on one OP-XY track', () => {
		// a verse melody in bars 1–4, a chorus melody in bars 5–8, on their own file tracks
		const read = midiFileNotes(file(120, phrase(0, 60), phrase(4, 67)));
		const plan = planMidiImport(read, {
			tracks: [
				{ midi: 2, to: 5 },
				{ midi: 3, to: 5 }
			]
		});
		expect(plan.tracks).toHaveLength(1);
		expect(plan.tracks[0]).toMatchObject({ to: 5, notes: 24, patterns: 2, folded: 0 });
		expect(plan.tracks[0].parts.map((p) => p.midi)).toEqual([2, 3]);
		expect(plan.patterns.map((p) => [p.track, p.pattern, p.notes[0].note])).toEqual([
			[5, 1, 60],
			[5, 2, 67]
		]);
		expect(plan.song).toEqual([1, 2]);
	});

	it('moves notes off the grid onto the sixteenths, and says so', () => {
		const read = midiFileNotes(file(90, [note(0.33, 0.25, 40), note(1, 0.25, 40)]));
		const plan = planMidiImport(read, { tracks: [{ midi: 2, to: 3 }] });
		expect(plan.patterns[0].notes.map((n) => n.step)).toEqual([2, 5]);
		expect(plan.notes.join(' ')).toMatch(/1 note between the sixteenths/);
	});

	it('refuses a track the file does not have, a track past 8, and a file track picked twice', () => {
		const read = midiFileNotes(file(120, drums(1)));
		expect(() => planMidiImport(read, { tracks: [{ midi: 5, to: 1 }] })).toThrow(MidiImportError);
		expect(() => planMidiImport(read, { tracks: [{ midi: 2, to: 9 }] })).toThrow(/1–8/);
		expect(() =>
			planMidiImport(read, {
				tracks: [
					{ midi: 2, to: 1 },
					{ midi: 2, to: 2 }
				]
			})
		).toThrow(/picked twice/);
	});
});
