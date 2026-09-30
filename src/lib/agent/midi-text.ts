/**
 * A MIDI file as the agent reads it: plain text listing every note (bar, position in the bar,
 * pitch, length, velocity) under a short header with the tempo, meter, key and tracks. The model
 * cannot read binary MIDI, so the app reads the file with its own parser and the model works from
 * exact notes instead of guessing.
 */
import { gmProgramName, GM_DRUMS } from '$lib/core/midi/constants';
import { noteName } from '$lib/core/midi/notes';
import {
	barPosition,
	keySignatureName,
	midiFileNotes,
	type FileNote,
	type MidiFileNotes
} from '$lib/core/music/midifile';

/** The GM drum channel (channel 10). */
const DRUM_CHANNEL = 9;

/** Up to three decimals, no trailing zeros: 0.333, 1, 0.5. */
function num(value: number): string {
	return String(Math.round(value * 1000) / 1000);
}

/** 92 s → "1:32". */
export function clockTime(seconds: number): string {
	const whole = Math.round(seconds);
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function pitch(note: FileNote): string {
	if (note.channel === DRUM_CHANNEL) {
		const drum = GM_DRUMS[note.note];
		return drum ? `${note.note} (${drum})` : String(note.note);
	}
	return noteName(note.note, { ascii: true });
}

/** A track's range: "C2–G4", or drum note numbers ("notes 36–42"); '' without notes. */
export function pitchRange(lowest: number | null, highest: number | null, drums: boolean): string {
	if (lowest === null || highest === null) return '';
	if (drums) return lowest === highest ? `note ${lowest}` : `notes ${lowest}–${highest}`;
	const name = (n: number) => noteName(n, { ascii: true });
	return lowest === highest ? name(lowest) : `${name(lowest)}–${name(highest)}`;
}

function quote(name: string | null): string {
	return name ? ` “${name.trim()}”` : '';
}

/** "3–11, 23–51" for the bars a track plays in, a gap of one bar bridged; the first 10 runs. */
function barRuns(bars: readonly number[]): string {
	const sorted = [...new Set(bars)].sort((a, b) => a - b);
	const runs: [number, number][] = [];
	for (const bar of sorted) {
		const last = runs.at(-1);
		if (last && bar - last[1] <= 2) last[1] = bar;
		else runs.push([bar, bar]);
	}
	const shown = runs.slice(0, 10).map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`));
	return `${runs.length === 1 && runs[0][0] === runs[0][1] ? 'bar' : 'bars'} ${shown.join(', ')}${runs.length > 10 ? ` and ${runs.length - 10} more stretches` : ''}`;
}

/** The most notes that start together on a sixteenth (a chord); 1 for a single-note line. */
function chordSize(notes: readonly FileNote[]): number {
	const starts = new Map<number, number>();
	for (const n of notes) {
		const step = Math.round(n.start * 4);
		starts.set(step, (starts.get(step) ?? 0) + 1);
	}
	return Math.max(0, ...starts.values());
}

/** A note's place on the sixteenth grid and its pitch, for telling doubled parts. */
const gridKey = (n: FileNote, pitchClass: boolean) =>
	`${Math.round(n.start * 4)}:${pitchClass ? n.note % 12 : n.note}`;

/**
 * What each track plays, beyond its range: the bars, a melody line (one note at a time, over five
 * semitones or more, two notes a bar or more where it plays), other single notes or chords, a
 * track it doubles (nine in ten of its notes also in an earlier track, same grid step and pitch or
 * pitch class), and the melody lines it takes turns with (under a tenth of their bars shared), which
 * are often one melody split between a verse track and a chorus track. Keyed by the track's 0-based
 * index; tracks without notes are left out.
 */
export function trackShapes(read: MidiFileNotes): Map<number, string[]> {
	const byTrack = read.tracks.map((t) => read.notes.filter((n) => n.track === t.index));
	const barsOf = byTrack.map((notes) => notes.map((n) => barPosition(n.start, read.meters).bar));
	const drums = read.tracks.map(
		(t) => t.channels.length > 0 && t.channels.every((c) => c === DRUM_CHANNEL)
	);
	const voices = byTrack.map((notes) => (notes.length ? chordSize(notes) : 0));
	const melody = read.tracks.map((t, i) => {
		const bars = new Set(barsOf[i]).size;
		return (
			!drums[i] &&
			voices[i] === 1 &&
			t.lowest !== null &&
			t.highest !== null &&
			t.highest - t.lowest >= 5 &&
			byTrack[i].length >= 2 * bars
		);
	});
	const shapes = new Map<number, string[]>();
	byTrack.forEach((notes, i) => {
		if (notes.length === 0) return;
		const parts = [`plays in ${barRuns(barsOf[i])}`];
		if (!drums[i]) {
			parts.push(
				melody[i]
					? 'a melody line, one note at a time'
					: voices[i] <= 1
						? 'one note at a time'
						: `chords of up to ${voices[i]} notes`
			);
		}
		for (let j = 0; j < i && !drums[i]; j++) {
			if (drums[j] || byTrack[j].length === 0) continue;
			for (const pitchClass of [false, true]) {
				const theirs = new Set(byTrack[j].map((n) => gridKey(n, pitchClass)));
				const shared = notes.filter((n) => theirs.has(gridKey(n, pitchClass))).length;
				if (shared >= 0.9 * notes.length) {
					parts.push(
						`doubles track ${j + 1}${pitchClass ? ' in another octave' : ' note for note'}`
					);
					j = i;
					break;
				}
			}
		}
		if (melody[i]) {
			const mine = new Set(barsOf[i]);
			const turns = byTrack
				.map((_, j) => j)
				.filter((j) => {
					if (j === i || !melody[j]) return false;
					const theirs = new Set(barsOf[j]);
					let both = 0;
					for (const bar of mine) if (theirs.has(bar)) both++;
					return both < 0.1 * Math.min(mine.size, theirs.size);
				});
			if (turns.length) {
				parts.push(
					`takes turns with the melody line${turns.length === 1 ? '' : 's'} of track${turns.length === 1 ? '' : 's'} ${turns.map((j) => j + 1).join(', ')} (one melody between them, likely)`
				);
			}
		}
		shapes.set(i, parts);
	});
	return shapes;
}

/** What the file holds, for the header and the chat. */
function header(read: MidiFileNotes, name: string, bars: number): string[] {
	const lines: string[] = [];
	const timing =
		read.ticksPerQuarter !== null
			? `${read.ticksPerQuarter} ticks per quarter note`
			: 'SMPTE timing (positions assume 120 bpm)';
	lines.push(
		`MIDI file “${name}”, read note for note by the app. Format ${read.format}, ${timing}, ${read.tracks.length} track${read.tracks.length === 1 ? '' : 's'}, ${clockTime(read.seconds)} long (${bars} bar${bars === 1 ? '' : 's'}).`
	);
	const [first, ...changes] = read.tempos;
	const at = (beat: number) => {
		const { bar, offset } = barPosition(beat, read.meters);
		return offset === 0 ? `bar ${bar}` : `bar ${bar} +${num(offset)}`;
	};
	lines.push(
		`Tempo ${num(first.bpm)} bpm${changes.length > 0 ? `; changes: ${changes.map((t) => `${at(t.beat)} → ${num(t.bpm)} bpm`).join(', ')}` : ''}.`
	);
	const [meter, ...meterChanges] = read.meters;
	const key = read.keys[0];
	const keyName = key ? keySignatureName(key.sharps, key.minor) : null;
	lines.push(
		`Time signature ${meter.numerator}/${meter.denominator}${meterChanges.length > 0 ? `; changes: ${meterChanges.map((m) => `${at(m.beat)} → ${m.numerator}/${m.denominator}`).join(', ')}` : ''}.${keyName ? ` Key signature ${keyName}${read.keys.length > 1 ? ' (it changes later)' : ''}.` : ''}`
	);
	lines.push('Tracks:');
	const shapes = trackShapes(read);
	for (const track of read.tracks) {
		const parts: string[] = [];
		if (track.channels.length > 0) {
			parts.push(
				track.channels
					.map((c) => `channel ${c + 1}${c === DRUM_CHANNEL ? ' (GM drums)' : ''}`)
					.join(', ')
			);
		}
		for (const { channel, program } of track.programs) {
			if (channel === DRUM_CHANNEL) continue;
			parts.push(`GM program ${program + 1} ${gmProgramName(program)}`);
		}
		const drums = track.channels.length === 1 && track.channels[0] === DRUM_CHANNEL;
		parts.push(
			track.noteCount === 0
				? 'no notes'
				: `${track.noteCount} note${track.noteCount === 1 ? '' : 's'}, ${pitchRange(track.lowest, track.highest, drums)}`
		);
		parts.push(...(shapes.get(track.index) ?? []));
		lines.push(`- track ${track.index + 1}${quote(track.name)}: ${parts.join(', ')}`);
	}
	return lines;
}

/** The text for the model, and one line for the chat. */
export interface MidiText {
	readonly text: string;
	/** "3 tracks · 792 notes · 1:32". */
	readonly detail: string;
	readonly noteCount: number;
	/** Notes left out of the listing (over `maxNotes`). */
	readonly omitted: number;
}

/**
 * Describes a MIDI file for the model: a header, then every note grouped by track. Past
 * `maxNotes` notes, each track lists its first notes (the budget shared out evenly) and says how
 * many it left out.
 */
export function describeMidiFile(
	input: ArrayBuffer | ArrayBufferView,
	name: string,
	maxNotes = 4000
): MidiText {
	const read = midiFileNotes(input);
	const bars =
		read.notes.length === 0 ? 0 : barPosition(Math.max(0, read.beats - 1e-6), read.meters).bar;
	const lines = header(read, name, bars);
	const byTrack = read.tracks
		.filter((t) => t.noteCount > 0)
		.map((t) => ({ track: t, notes: read.notes.filter((n) => n.track === t.index) }));
	let budget = maxNotes;
	let omitted = 0;
	if (byTrack.length === 0) {
		lines.push('', 'The file has no notes.');
	} else {
		lines.push(
			'',
			'Notes, one per line: bar, position in the bar in beats (quarter notes; 0 is the downbeat), pitch (C4 = 60), length in beats, velocity. Notes that sound together share a bar and position.'
		);
		byTrack.forEach(({ track, notes }, i) => {
			const share = Math.floor(budget / (byTrack.length - i));
			const listed = notes.slice(0, share);
			budget -= listed.length;
			const channels = track.channels.map((c) => c + 1).join(', ');
			lines.push(
				'',
				`[track ${track.index + 1}${quote(track.name)}, channel${track.channels.length === 1 ? '' : 's'} ${channels}]`
			);
			for (const note of listed) {
				const { bar, offset } = barPosition(note.start, read.meters);
				lines.push(`${bar} ${num(offset)} ${pitch(note)} ${num(note.duration)} ${note.velocity}`);
			}
			if (listed.length < notes.length) {
				const left = notes.length - listed.length;
				omitted += left;
				const last = listed.at(-1);
				const until = last ? ` after bar ${barPosition(last.start, read.meters).bar}` : '';
				lines.push(`(${left} more notes in this track${until} are not listed)`);
			}
		});
	}
	const total = read.notes.length;
	return {
		text: lines.join('\n'),
		detail: [
			`${read.tracks.length} track${read.tracks.length === 1 ? '' : 's'}`,
			`${total} note${total === 1 ? '' : 's'}`,
			clockTime(read.seconds)
		].join(' · '),
		noteCount: total,
		omitted
	};
}
