/**
 * A MIDI file arranged for the OP-XY (`import_midi`): the file's tracks the agent picks, each cut
 * into 4-bar blocks of sixteenths (the OP-XY's longest pattern), identical blocks folded into one
 * pattern (16 per track at most; when a part changes more often, its rarest blocks fold into the
 * nearest kept one), each block's patterns a scene (99 at most) and the blocks in order the song
 * (96 entries at most). GM drums land on the layout TE's kits share (keys 53–76). Deterministic:
 * the model picks tracks and targets, the notes come from the file.
 */
import type { MidiFileNotes } from '$lib/core/music/midifile';

/** The OP-XY's limits for what an import writes. */
export const IMPORT_LIMITS = {
	patternsPerTrack: 16,
	notesPerPattern: 120,
	stepsPerPattern: 64,
	scenes: 99,
	songEntries: 96,
	/** The longest note, in steps. */
	noteSteps: 64
} as const;

/** GM drum notes on TE's kit layout (53–54 kicks, 55–56 snares, … 76 chi). */
export const GM_TO_KIT: Readonly<Record<number, number>> = {
	35: 54, // acoustic bass drum: kick 2
	36: 53, // bass drum: kick
	37: 57, // side stick: rim
	38: 55, // acoustic snare
	39: 58, // hand clap
	40: 56, // electric snare: snare 2
	41: 65, // low floor tom
	42: 61, // closed hat
	43: 65, // high floor tom
	44: 62, // pedal hat: closed hat 2
	45: 67, // low tom: mid tom
	46: 63, // open hat
	47: 67, // low-mid tom
	48: 69, // hi-mid tom: high tom
	49: 68, // crash
	50: 69, // high tom
	51: 66, // ride
	52: 68, // china: crash
	53: 66, // ride bell
	54: 59, // tambourine
	55: 68, // splash: crash
	56: 73, // cowbell
	57: 68, // crash 2
	59: 66, // ride 2
	60: 72, // hi bongo: high conga
	61: 71, // low bongo: low conga
	62: 72, // mute hi conga
	63: 72, // open hi conga
	64: 71, // low conga
	69: 60, // cabasa: shaker
	70: 60, // maracas: shaker
	73: 74, // short guiro
	74: 74, // long guiro
	75: 64, // claves
	76: 64, // hi wood block: clave
	77: 64, // low wood block: clave
	80: 70, // mute triangle
	81: 70 // open triangle
};

/** A file track and where it goes. */
export interface ImportTrack {
	/** The file's track, 1-based (as the attachment lists them). */
	readonly midi: number;
	/** OP-XY instrument track 1–8. */
	readonly to: number;
	/** Semitones up or down (melodic tracks). */
	readonly transpose?: number;
	/** Put GM drums on the kit's layout (default: when the track plays on channel 10). */
	readonly drums?: boolean;
}

export interface ImportOptions {
	readonly tracks: readonly ImportTrack[];
	/** The first and last bar to take (default: the whole file). */
	readonly fromBar?: number;
	readonly toBar?: number;
}

export interface PlannedNote {
	readonly step: number;
	readonly note: number;
	readonly velocity: number;
	readonly length: number;
}

export interface PlannedPattern {
	readonly track: number;
	readonly pattern: number;
	readonly bars: number;
	readonly length: number;
	readonly notes: readonly PlannedNote[];
}

/** What one file track became. */
export interface TrackReport {
	readonly midi: number;
	readonly name: string | null;
	readonly to: number;
	readonly drums: boolean;
	/** Notes in the range, and notes written. */
	readonly notes: number;
	readonly kept: number;
	readonly patterns: number;
	/** Blocks played by a near pattern because the track changes more often than 16 patterns hold. */
	readonly folded: number;
	/** How alike those blocks are to the patterns that play them, 0–1 on average (null: none). */
	readonly foldedAlike: number | null;
	/** Notes over a pattern's 120, the quietest left out. */
	readonly overflow: number;
	/** Drum notes with no place on the kit. */
	readonly unmapped: number;
}

export interface ImportPlan {
	readonly bpm: number;
	readonly fromBar: number;
	readonly toBar: number;
	/** Blocks (4 bars in 4/4, as many as fit 64 steps otherwise), one song entry each. */
	readonly blocks: number;
	readonly barsPerBlock: number;
	readonly patterns: readonly PlannedPattern[];
	readonly scenes: readonly {
		readonly scene: number;
		readonly patterns: readonly { readonly track: number; readonly pattern: number }[];
	}[];
	/** Scene numbers in order. */
	readonly song: readonly number[];
	readonly tracks: readonly TrackReport[];
	/** What the OP-XY cannot carry, in words. */
	readonly notes: readonly string[];
}

/** Why a request cannot be planned. */
export class MidiImportError extends Error {
	override name = 'MidiImportError';
}

const DRUM_CHANNEL = 9;

interface Hit {
	step: number;
	note: number;
	velocity: number;
	length: number;
}

/** A block's content, for telling identical blocks apart (velocity in steps of 8). */
const blockKey = (hits: readonly Hit[]) =>
	hits
		.map((h) => `${h.step}:${h.note}:${h.length}:${Math.round(h.velocity / 8)}`)
		.sort()
		.join(' ');

/** How alike two blocks are: shared (step, note) pairs over all of them. */
function likeness(a: readonly Hit[], b: readonly Hit[]): number {
	const as = new Set(a.map((h) => `${h.step}:${h.note}`));
	const bs = new Set(b.map((h) => `${h.step}:${h.note}`));
	let shared = 0;
	for (const x of as) if (bs.has(x)) shared++;
	const all = as.size + bs.size - shared;
	return all === 0 ? 1 : shared / all;
}

/**
 * The blocks to keep as patterns: all of them when they fit, else the `room` that best stand for
 * the rest (greedy facility location over how alike blocks are, weighted by how often each plays).
 */
function representatives(
	uniques: readonly string[],
	counts: ReadonlyMap<string, number>,
	examples: ReadonlyMap<string, readonly Hit[]>,
	room: number
): string[] {
	if (uniques.length <= room) return [...uniques];
	const n = uniques.length;
	const alike = uniques.map((a) =>
		uniques.map((b) => likeness(examples.get(a) ?? [], examples.get(b) ?? []))
	);
	const weight = uniques.map((k) => counts.get(k) ?? 1);
	const best = new Array<number>(n).fill(0);
	const kept: number[] = [];
	while (kept.length < room) {
		let pick = -1;
		let gain = -1;
		for (let c = 0; c < n; c++) {
			if (kept.includes(c)) continue;
			let g = 0;
			for (let b = 0; b < n; b++) g += weight[b] * Math.max(0, alike[b][c] - best[b]);
			if (g > gain) {
				gain = g;
				pick = c;
			}
		}
		kept.push(pick);
		for (let b = 0; b < n; b++) best[b] = Math.max(best[b], alike[b][pick]);
	}
	return kept.map((i) => uniques[i]);
}

/** Plans the import of `read` (see the module note). */
export function planMidiImport(read: MidiFileNotes, options: ImportOptions): ImportPlan {
	if (options.tracks.length === 0) throw new MidiImportError('pick at least one track to import');
	const targets = new Set<number>();
	for (const t of options.tracks) {
		if (!read.tracks[t.midi - 1]) {
			throw new MidiImportError(`the file has no track ${t.midi} (it has ${read.tracks.length})`);
		}
		if (!Number.isInteger(t.to) || t.to < 1 || t.to > 8) {
			throw new MidiImportError(`OP-XY instrument tracks are 1–8, not ${t.to}`);
		}
		if (targets.has(t.to)) throw new MidiImportError(`two file tracks go to track ${t.to}`);
		targets.add(t.to);
	}
	const notes: string[] = [];
	const meter = read.meters[0];
	const beatsPerBar = (meter.numerator * 4) / meter.denominator;
	if (read.meters.length > 1) {
		notes.push(
			`the meter changes; bars are counted in ${meter.numerator}/${meter.denominator} throughout`
		);
	}
	const stepsPerBar = Math.max(1, Math.round(beatsPerBar * 4));
	const barsPerBlock = Math.max(1, Math.floor(IMPORT_LIMITS.stepsPerPattern / stepsPerBar));
	const blockSteps = barsPerBlock * stepsPerBar;
	const lastBar = Math.max(1, Math.ceil(read.beats / beatsPerBar - 1e-6));
	const fromBar = Math.max(1, Math.floor(options.fromBar ?? 1));
	const toBar = Math.min(lastBar, Math.floor(options.toBar ?? lastBar));
	if (toBar < fromBar) throw new MidiImportError(`bars ${fromBar}–${toBar} hold nothing`);
	const startBeat = (fromBar - 1) * beatsPerBar;
	const totalSteps = (toBar - fromBar + 1) * stepsPerBar;
	const blocks = Math.ceil(totalSteps / blockSteps);
	let songBlocks = blocks;
	if (blocks > IMPORT_LIMITS.songEntries) {
		songBlocks = IMPORT_LIMITS.songEntries;
		notes.push(
			`the song holds ${IMPORT_LIMITS.songEntries} scenes in order: the file's last ${blocks - songBlocks} blocks of ${barsPerBlock} bars are left out`
		);
	}
	const bpm = read.tempos[0].bpm;
	if (read.tempos.length > 1) {
		notes.push(
			`the tempo changes ${read.tempos.length - 1} time${read.tempos.length === 2 ? '' : 's'}; the OP-XY plays one tempo, ${Math.round(bpm * 10) / 10} bpm`
		);
	}

	const patterns: PlannedPattern[] = [];
	const reports: TrackReport[] = [];
	/** Each OP-XY track's pattern for each block. */
	const byBlock = new Map<number, number[]>();
	let offGrid = 0;

	for (const t of options.tracks) {
		const digest = read.tracks[t.midi - 1];
		const drums =
			t.drums ?? (digest.channels.length > 0 && digest.channels.every((c) => c === DRUM_CHANNEL));
		const hitsByBlock: Hit[][] = Array.from({ length: songBlocks }, () => []);
		let inRange = 0;
		let unmapped = 0;
		for (const n of read.notes) {
			if (n.track !== t.midi - 1) continue;
			const exact = (n.start - startBeat) * 4;
			const step = Math.round(exact);
			if (step < 0 || step >= Math.min(totalSteps, songBlocks * blockSteps)) continue;
			inRange++;
			if (Math.abs(exact - step) > 0.2) offGrid++;
			let note = n.note;
			if (drums) {
				const key = GM_TO_KIT[n.note];
				if (key === undefined) {
					unmapped++;
					continue;
				}
				note = key;
			} else {
				note += Math.round(t.transpose ?? 0);
				while (note < 0) note += 12;
				while (note > 127) note -= 12;
			}
			const block = Math.floor(step / blockSteps);
			const length = drums
				? 1
				: Math.max(1, Math.min(IMPORT_LIMITS.noteSteps, Math.round(n.duration * 4)));
			const hits = hitsByBlock[block];
			const inBlock = (step % blockSteps) + 1;
			const same = hits.find((h) => h.step === inBlock && h.note === note);
			const velocity = Math.max(1, Math.min(127, Math.round(n.velocity)));
			if (same) {
				same.velocity = Math.max(same.velocity, velocity);
				same.length = Math.max(same.length, length);
			} else hits.push({ step: inBlock, note, velocity, length });
		}

		// identical blocks share a pattern; an empty block plays an empty one
		const keys = hitsByBlock.map(blockKey);
		const counts = new Map<string, number>();
		for (const k of keys) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
		const needsEmpty = keys.some((k) => !k);
		const room = IMPORT_LIMITS.patternsPerTrack - (needsEmpty ? 1 : 0);
		const example = new Map<string, Hit[]>();
		keys.forEach((k, i) => {
			if (k && !example.has(k)) example.set(k, hitsByBlock[i]);
		});
		const kept = representatives([...counts.keys()], counts, example, room);
		// patterns numbered in the order the song first plays them
		const order = kept.slice().sort((a, b) => keys.indexOf(a) - keys.indexOf(b));
		const numberOf = new Map(order.map((k, i) => [k, i + 1]));
		const emptyPattern = needsEmpty ? order.length + 1 : 0;
		let folded = 0;
		let closeness = 0;
		const blockPatterns = keys.map((k, i) => {
			if (!k) return emptyPattern;
			const n = numberOf.get(k);
			if (n !== undefined) return n;
			folded++;
			let best = order[0];
			let score = -1;
			for (const candidate of order) {
				const s = likeness(hitsByBlock[i], example.get(candidate) ?? []);
				if (s > score) {
					score = s;
					best = candidate;
				}
			}
			closeness += Math.max(0, score);
			return numberOf.get(best) ?? 1;
		});
		byBlock.set(t.to, blockPatterns);

		let overflow = 0;
		let written = 0;
		for (const k of order) {
			const hits = [...(example.get(k) ?? [])];
			let chosen = hits;
			if (hits.length > IMPORT_LIMITS.notesPerPattern) {
				chosen = hits
					.slice()
					.sort((a, b) => b.velocity - a.velocity || a.step - b.step)
					.slice(0, IMPORT_LIMITS.notesPerPattern);
				overflow += hits.length - chosen.length;
			}
			chosen.sort((a, b) => a.step - b.step || a.note - b.note);
			written += chosen.length * (counts.get(k) ?? 0);
			patterns.push({
				track: t.to,
				pattern: numberOf.get(k) ?? 1,
				bars: Math.ceil(blockSteps / 16),
				length: blockSteps,
				notes: chosen.map((h) => ({
					step: h.step,
					note: h.note,
					velocity: h.velocity,
					length: h.length
				}))
			});
		}
		if (needsEmpty) {
			patterns.push({
				track: t.to,
				pattern: emptyPattern,
				bars: Math.ceil(blockSteps / 16),
				length: blockSteps,
				notes: []
			});
		}
		reports.push({
			midi: t.midi,
			name: digest.name,
			to: t.to,
			drums,
			notes: inRange,
			kept: written,
			patterns: order.length + (needsEmpty ? 1 : 0),
			folded,
			foldedAlike: folded > 0 ? Math.round((closeness / folded) * 100) / 100 : null,
			overflow,
			unmapped
		});
	}

	// a scene for each different set of patterns, the song the blocks in order
	const sceneOf = new Map<string, number>();
	const scenes: ImportPlan['scenes'][number][] = [];
	const song: number[] = [];
	for (let b = 0; b < songBlocks; b++) {
		const set = options.tracks.map((t) => ({ track: t.to, pattern: byBlock.get(t.to)?.[b] ?? 1 }));
		const key = set.map((p) => `${p.track}:${p.pattern}`).join(' ');
		let scene = sceneOf.get(key);
		if (scene === undefined) {
			if (scenes.length >= IMPORT_LIMITS.scenes) {
				scene = song.at(-1) ?? 1;
			} else {
				scene = scenes.length + 1;
				sceneOf.set(key, scene);
				scenes.push({ scene, patterns: set });
			}
		}
		song.push(scene);
	}
	if (offGrid > 0) {
		notes.push(
			`${offGrid} note${offGrid === 1 ? '' : 's'} between the sixteenths (triplets, swing, loose playing) moved onto the nearest step`
		);
	}
	return {
		bpm,
		fromBar,
		toBar,
		blocks: songBlocks,
		barsPerBlock,
		patterns,
		scenes,
		song,
		tracks: reports,
		notes
	};
}
