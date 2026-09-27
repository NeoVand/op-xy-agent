/**
 * The notes of a Standard MIDI File in musical time: every note-on paired with its note-off, start
 * and length in beats (a beat is a quarter note, as everywhere in `core/music`), plus the tempo,
 * meter and key maps and a digest of each track.
 *
 * The agent reads MIDI files the user attaches through this (a model cannot read binary MIDI, and
 * must never guess notes that are in the file), and the composer will import files with it.
 */
import {
	readMidiFile,
	tempoMap,
	tickToMs,
	type MetaEvent,
	type MidiFile,
	type SmfFormat,
	type TempoMap
} from '../midi/smf';
import type { NoteSpec } from './types';

/** A note from the file. */
export interface FileNote extends NoteSpec {
	velocity: number;
	/** Wire channel 0–15. */
	channel: number;
	/** 0-based index of the track it came from. */
	track: number;
}

/** One track at a glance. */
export interface TrackDigest {
	/** 0-based. */
	readonly index: number;
	readonly name: string | null;
	/** Wire channels its notes use, in order. */
	readonly channels: readonly number[];
	/** The first program change on each channel (programs 0–127). */
	readonly programs: readonly { readonly channel: number; readonly program: number }[];
	readonly noteCount: number;
	readonly lowest: number | null;
	readonly highest: number | null;
}

/** A tempo from `beat` on. */
export interface TempoChange {
	readonly beat: number;
	readonly bpm: number;
}

/** A time signature from `beat` on. */
export interface MeterChange {
	readonly beat: number;
	readonly numerator: number;
	readonly denominator: number;
}

/** A key signature from `beat` on (`sharps` < 0 counts flats). */
export interface KeyChange {
	readonly beat: number;
	readonly sharps: number;
	readonly minor: boolean;
}

/** Everything `midiFileNotes` reads. */
export interface MidiFileNotes {
	readonly format: SmfFormat;
	/** Ticks per quarter note; null for SMPTE-timed files, whose beats assume 120 bpm. */
	readonly ticksPerQuarter: number | null;
	/** Sorted by start, then track, then pitch. */
	readonly notes: readonly FileNote[];
	/** Never empty: 120 bpm at beat 0 when the file does not say. */
	readonly tempos: readonly TempoChange[];
	/** Never empty: 4/4 at beat 0 when the file does not say. */
	readonly meters: readonly MeterChange[];
	readonly keys: readonly KeyChange[];
	readonly tracks: readonly TrackDigest[];
	/** From beat 0 to the end of the last note. */
	readonly beats: number;
	/** The same, in seconds, following every tempo change. */
	readonly seconds: number;
}

/** Milliseconds per beat in SMPTE files, which have no beats of their own (120 bpm). */
const SMPTE_BEAT_MS = 500;

function round6(value: number): number {
	return Math.round(value * 1e6) / 1e6;
}

/** Meta events of every track with their ticks, sorted by tick (file order within a tick). */
function metaEvents(file: MidiFile): { tick: number; event: MetaEvent }[] {
	const out: { tick: number; event: MetaEvent }[] = [];
	for (const track of file.tracks) {
		for (const { tick, event } of track.events) {
			if (event.type === 'meta') out.push({ tick, event });
		}
	}
	return out.sort((a, b) => a.tick - b.tick);
}

/** Keeps the last change at each beat, and drops changes that change nothing. */
function settle<T extends { beat: number }>(changes: T[], same: (a: T, b: T) => boolean): T[] {
	const out: T[] = [];
	for (const change of changes) {
		const last = out.at(-1);
		if (last && last.beat === change.beat) out[out.length - 1] = change;
		else if (!last || !same(last, change)) out.push(change);
	}
	return out;
}

/** Reads the notes and maps of a MIDI file (or of its bytes). */
export function midiFileNotes(input: MidiFile | ArrayBuffer | ArrayBufferView): MidiFileNotes {
	const file =
		input instanceof ArrayBuffer || ArrayBuffer.isView(input) ? readMidiFile(input) : input;
	const ppq = file.division.kind === 'ppq' ? file.division.ticksPerQuarter : null;
	const maps: TempoMap[] =
		file.format === 2 ? file.tracks.map((_, i) => tempoMap(file, i)) : [tempoMap(file)];
	const mapFor = (track: number) => maps[file.format === 2 ? track : 0];
	const toBeat = (tick: number, track: number) =>
		ppq !== null ? tick / ppq : tickToMs(mapFor(track), tick) / SMPTE_BEAT_MS;

	const notes: FileNote[] = [];
	const tracks: TrackDigest[] = [];
	let endSeconds = 0;
	file.tracks.forEach((track, index) => {
		const open = new Map<number, { tick: number; velocity: number }[]>();
		const channels = new Set<number>();
		const programs: { channel: number; program: number }[] = [];
		let noteCount = 0;
		let lowest: number | null = null;
		let highest: number | null = null;
		let lastTick = 0;
		const close = (channel: number, note: number, tick: number) => {
			const starts = open.get(channel * 128 + note);
			const start = starts?.shift();
			if (!start) return;
			const startBeat = toBeat(start.tick, index);
			// A note-off at its own note-on still sounded: give it the shortest real length.
			const endBeat = Math.max(toBeat(tick, index), startBeat + 1 / 64);
			notes.push({
				note,
				start: round6(startBeat),
				duration: round6(endBeat - startBeat),
				velocity: start.velocity,
				channel,
				track: index
			});
			endSeconds = Math.max(endSeconds, tickToMs(mapFor(index), Math.max(tick, start.tick)) / 1000);
			noteCount++;
			lowest = lowest === null ? note : Math.min(lowest, note);
			highest = highest === null ? note : Math.max(highest, note);
			channels.add(channel);
		};
		for (const { tick, event } of track.events) {
			lastTick = Math.max(lastTick, tick);
			if (event.type === 'noteOn' && event.velocity > 0) {
				const key = event.channel * 128 + event.note;
				const starts = open.get(key) ?? [];
				starts.push({ tick, velocity: event.velocity });
				open.set(key, starts);
			} else if (event.type === 'noteOff' || event.type === 'noteOn') {
				close(event.channel, event.note, tick);
			} else if (
				event.type === 'programChange' &&
				!programs.some((p) => p.channel === event.channel)
			) {
				programs.push({ channel: event.channel, program: event.program });
			}
		}
		// Notes still held when the track ends last until its last event.
		for (const [key, starts] of open) {
			for (let i = starts.length; i > 0; i--) close(key >> 7, key & 0x7f, lastTick);
		}
		tracks.push({
			index,
			name: track.name ?? null,
			channels: [...channels].sort((a, b) => a - b),
			programs,
			noteCount,
			lowest,
			highest
		});
	});
	notes.sort((a, b) => a.start - b.start || a.track - b.track || a.note - b.note);

	const metas = metaEvents(file);
	const tempos = settle<TempoChange>(
		mapFor(0).points.map((p) => ({
			beat: round6(toBeat(p.tick, 0)),
			bpm: Math.round((60_000_000 / p.usPerQuarter) * 1000) / 1000
		})),
		(a, b) => a.bpm === b.bpm
	);
	const meters = settle<MeterChange>(
		[
			{ beat: 0, numerator: 4, denominator: 4 },
			...metas.flatMap(({ tick, event }) =>
				event.timeSignature
					? [
							{
								beat: round6(toBeat(tick, 0)),
								numerator: event.timeSignature.numerator,
								denominator: event.timeSignature.denominator
							}
						]
					: []
			)
		],
		(a, b) => a.numerator === b.numerator && a.denominator === b.denominator
	);
	const keys = settle<KeyChange>(
		metas.flatMap(({ tick, event }) =>
			event.keySignature ? [{ beat: round6(toBeat(tick, 0)), ...event.keySignature }] : []
		),
		(a, b) => a.sharps === b.sharps && a.minor === b.minor
	);
	const beats = notes.reduce((end, n) => Math.max(end, n.start + n.duration), 0);
	return {
		format: file.format,
		ticksPerQuarter: ppq,
		notes,
		tempos,
		meters,
		keys,
		tracks,
		beats: round6(beats),
		seconds: Math.round(endSeconds * 1000) / 1000
	};
}

/**
 * Where a beat falls: the 1-based bar and the offset from that bar's downbeat, in beats. Meter
 * changes are taken to fall on bar lines; one that does not starts a new bar.
 */
export function barPosition(
	beat: number,
	meters: readonly MeterChange[]
): { bar: number; offset: number } {
	const list: readonly MeterChange[] =
		meters.length > 0 && meters[0].beat <= 0
			? meters
			: [{ beat: 0, numerator: 4, denominator: 4 }, ...meters];
	let bar = 1;
	for (let i = 0; i < list.length; i++) {
		const meter = list[i];
		const length = (meter.numerator * 4) / meter.denominator;
		const end = list[i + 1]?.beat ?? Infinity;
		if (beat < end) {
			const bars = Math.max(0, Math.floor((beat - meter.beat) / length + 1e-9));
			return { bar: bar + bars, offset: round6(Math.max(0, beat - meter.beat - bars * length)) };
		}
		bar += Math.max(1, Math.ceil((end - meter.beat) / length - 1e-9));
	}
	return { bar, offset: 0 };
}

const MAJOR_KEYS = [
	'Cb',
	'Gb',
	'Db',
	'Ab',
	'Eb',
	'Bb',
	'F',
	'C',
	'G',
	'D',
	'A',
	'E',
	'B',
	'F#',
	'C#'
];
const MINOR_KEYS = [
	'Ab',
	'Eb',
	'Bb',
	'F',
	'C',
	'G',
	'D',
	'A',
	'E',
	'B',
	'F#',
	'C#',
	'G#',
	'D#',
	'A#'
];

/** "C# minor", "Eb major"; null for a signature outside -7…7. */
export function keySignatureName(sharps: number, minor: boolean): string | null {
	const name = (minor ? MINOR_KEYS : MAJOR_KEYS)[sharps + 7];
	return name ? `${name} ${minor ? 'minor' : 'major'}` : null;
}
