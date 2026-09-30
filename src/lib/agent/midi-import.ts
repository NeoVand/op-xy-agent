/**
 * A MIDI file arranged for the OP-XY (`import_midi`): the file's tracks the agent picks (several may
 * share an OP-XY track, such as a melody split between a verse and a chorus track), from the first
 * bar they play to the last, cut into 4-bar blocks of sixteenths (the OP-XY's longest pattern);
 * identical blocks share a pattern (16 per track at most; when a part changes more often, the
 * patterns that stand best for the rest are kept, and each other block plays the closest one, by
 * its notes and, for pitched parts, its harmony bar by bar), each block's patterns are a scene (99
 * at most) and the blocks in order the song (96 entries at most). GM drums land on the layout TE's
 * kits share (keys 53–76). Deterministic: the model picks tracks and targets, the notes come from
 * the file.
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

/** A file track and where it goes (several file tracks may go to one OP-XY track). */
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
	/** The first and last bar to take (default: from the first bar the picked tracks play to their last). */
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

/** One file track of an OP-XY track. */
export interface PartReport {
	readonly midi: number;
	readonly name: string | null;
	readonly drums: boolean;
	/** Its notes in the range. */
	readonly notes: number;
	/** Drum notes with no place on the kit. */
	readonly unmapped: number;
}

/** What an OP-XY track became. */
export interface TrackReport {
	readonly to: number;
	readonly parts: readonly PartReport[];
	/** Every part is drums. */
	readonly drums: boolean;
	/** Notes in the range. */
	readonly notes: number;
	readonly patterns: number;
	/** Blocks played by the closest pattern because the track changes more often than 16 patterns hold. */
	readonly folded: number;
	/** The share of its notes that play at their step and pitch, 0–1 (quantized to the sixteenths). */
	readonly asWritten: number;
	/** Bars whose pitches differ from the file's (pitched tracks; the folded blocks). */
	readonly offBars: number;
	/** Notes over a pattern's 120, the quietest left out. */
	readonly overflow: number;
	/** Drum notes with no place on the kit. */
	readonly unmapped: number;
}

export interface ImportPlan {
	readonly bpm: number;
	readonly fromBar: number;
	readonly toBar: number;
	/** Silent bars before the first one the picked tracks play, left out (0 when fromBar was given). */
	readonly silentStart: number;
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

/** Shared members over all of them (1 when both are empty). */
function jaccard(a: ReadonlySet<string | number>, b: ReadonlySet<string | number>): number {
	let shared = 0;
	for (const x of a) if (b.has(x)) shared++;
	const all = a.size + b.size - shared;
	return all === 0 ? 1 : shared / all;
}

/** A block as the likeness measures see it: its (step, note) pairs and each bar's pitch classes. */
interface Profile {
	readonly exact: ReadonlySet<string>;
	readonly bars: readonly ReadonlySet<number>[];
}

function profileOf(hits: readonly Hit[], bars: number, stepsPerBar: number): Profile {
	const pitches = Array.from({ length: bars }, () => new Set<number>());
	for (const h of hits)
		pitches[Math.min(bars - 1, Math.floor((h.step - 1) / stepsPerBar))].add(h.note % 12);
	return { exact: new Set(hits.map((h) => `${h.step}:${h.note}`)), bars: pitches };
}

/** Bars of `b` whose pitch classes differ from `a`'s (under half shared). */
function barsDiffering(a: Profile, b: Profile): number {
	let differ = 0;
	a.bars.forEach((bar, i) => {
		if (jaccard(bar, b.bars[i]) < 0.5) differ++;
	});
	return differ;
}

/**
 * How alike two blocks are, 0–1: their shared (step, note) pairs; for a pitched part, half of it is
 * the harmony bar by bar (shared pitch classes), so a stand-in keeps the chords where it can.
 */
function likeness(a: Profile, b: Profile, pitched: boolean): number {
	const exact = jaccard(a.exact, b.exact);
	if (!pitched) return exact;
	let harmony = 0;
	a.bars.forEach((bar, i) => (harmony += jaccard(bar, b.bars[i])));
	return 0.5 * exact + (0.5 * harmony) / Math.max(1, a.bars.length);
}

/**
 * The blocks to keep as patterns: all of them when they fit, else the `room` that best stand for
 * the rest (greedy facility location over how alike blocks are, weighted by how often each plays).
 */
function representatives(
	uniques: readonly string[],
	counts: ReadonlyMap<string, number>,
	alikeness: (a: string, b: string) => number,
	room: number
): string[] {
	if (uniques.length <= room) return [...uniques];
	const n = uniques.length;
	const alike = uniques.map((a) => uniques.map((b) => alikeness(a, b)));
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
	const picked = new Set<number>();
	for (const t of options.tracks) {
		if (!read.tracks[t.midi - 1]) {
			throw new MidiImportError(`the file has no track ${t.midi} (it has ${read.tracks.length})`);
		}
		if (!Number.isInteger(t.to) || t.to < 1 || t.to > 8) {
			throw new MidiImportError(`OP-XY instrument tracks are 1–8, not ${t.to}`);
		}
		if (picked.has(t.midi)) throw new MidiImportError(`file track ${t.midi} is picked twice`);
		picked.add(t.midi);
	}
	/** The OP-XY tracks, in the order first given. */
	const targets = [...new Set(options.tracks.map((t) => t.to))];
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
	// the bars the picked tracks play, on the grid: a silent start or end is left out
	let firstPlayed = Infinity;
	let lastPlayed = 1;
	for (const n of read.notes) {
		if (!picked.has(n.track + 1)) continue;
		const bar = Math.floor(Math.round(n.start * 4) / stepsPerBar) + 1;
		firstPlayed = Math.min(firstPlayed, bar);
		lastPlayed = Math.max(lastPlayed, bar);
	}
	if (firstPlayed === Infinity) firstPlayed = 1;
	const fromBar = Math.max(1, Math.floor(options.fromBar ?? firstPlayed));
	const toBar = Math.min(lastBar, Math.floor(options.toBar ?? Math.max(fromBar, lastPlayed)));
	if (toBar < fromBar) throw new MidiImportError(`bars ${fromBar}–${toBar} hold nothing`);
	const silentStart = options.fromBar === undefined ? fromBar - 1 : 0;
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
	const lastStep = Math.min(totalSteps, songBlocks * blockSteps);
	/** Steps a block plays: a whole block, or the music left for the last one (a 2-bar loop, 2). */
	const blockLength = (b: number) => Math.min(blockSteps, lastStep - b * blockSteps);

	for (const to of targets) {
		const hitsByBlock: Hit[][] = Array.from({ length: songBlocks }, () => []);
		const parts: PartReport[] = [];
		for (const t of options.tracks) {
			if (t.to !== to) continue;
			const digest = read.tracks[t.midi - 1];
			const drums =
				t.drums ?? (digest.channels.length > 0 && digest.channels.every((c) => c === DRUM_CHANNEL));
			let inRange = 0;
			let unmapped = 0;
			for (const n of read.notes) {
				if (n.track !== t.midi - 1) continue;
				const exact = (n.start - startBeat) * 4;
				const step = Math.round(exact);
				if (step < 0 || step >= lastStep) continue;
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
			parts.push({ midi: t.midi, name: digest.name, drums, notes: inRange, unmapped });
		}
		const drums = parts.every((p) => p.drums);

		// identical blocks share a pattern; an empty block plays an empty one; a short last block
		// plays a pattern of its own length, a rest too, since a scene lasts as long as its longest
		const keys = hitsByBlock.map((hits, b) => {
			const length = blockLength(b);
			const k = blockKey(hits);
			return length === blockSteps ? k : `${length}|${k || 'rest'}`;
		});
		const lengthOf = new Map<string, number>();
		keys.forEach((k, b) => {
			if (k && !lengthOf.has(k)) lengthOf.set(k, blockLength(b));
		});
		const counts = new Map<string, number>();
		for (const k of keys) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
		const needsEmpty = keys.some((k) => !k);
		const room = IMPORT_LIMITS.patternsPerTrack - (needsEmpty ? 1 : 0);
		const example = new Map<string, Hit[]>();
		keys.forEach((k, i) => {
			if (k && !example.has(k)) example.set(k, hitsByBlock[i]);
		});
		const profiles = new Map<string, Profile>();
		for (const [k, hits] of example) profiles.set(k, profileOf(hits, barsPerBlock, stepsPerBar));
		const profile = (k: string) => profiles.get(k) ?? profileOf([], barsPerBlock, stepsPerBar);
		const alike = (a: string, b: string) => likeness(profile(a), profile(b), !drums);
		const kept = representatives([...counts.keys()], counts, alike, room);
		// patterns numbered in the order the song first plays them
		const order = kept.slice().sort((a, b) => keys.indexOf(a) - keys.indexOf(b));
		const numberOf = new Map(order.map((k, i) => [k, i + 1]));
		const emptyPattern = needsEmpty ? order.length + 1 : 0;

		// each kept block's notes as its pattern plays them: the 120 loudest
		let overflow = 0;
		const plays = new Map<string, Hit[]>();
		for (const k of order) {
			const hits = [...(example.get(k) ?? [])];
			let chosen = hits;
			if (hits.length > IMPORT_LIMITS.notesPerPattern) {
				chosen = hits
					.slice()
					.sort((a, b) => b.velocity - a.velocity || a.step - b.step)
					.slice(0, IMPORT_LIMITS.notesPerPattern);
				overflow += (hits.length - chosen.length) * (counts.get(k) ?? 0);
			}
			chosen.sort((a, b) => a.step - b.step || a.note - b.note);
			plays.set(k, chosen);
			const length = lengthOf.get(k) ?? blockSteps;
			patterns.push({
				track: to,
				pattern: numberOf.get(k) ?? 1,
				bars: Math.ceil(length / 16),
				length,
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
				track: to,
				pattern: emptyPattern,
				bars: Math.ceil(blockSteps / 16),
				length: blockSteps,
				notes: []
			});
		}

		// each block's pattern: its own, or the closest kept one; and how much plays as written
		let folded = 0;
		let total = 0;
		let written = 0;
		let offBars = 0;
		const blockPatterns = keys.map((k, i) => {
			const hits = hitsByBlock[i];
			total += hits.length;
			if (!k) return emptyPattern;
			let stand = k;
			if (!numberOf.has(k)) {
				folded++;
				let score = -1;
				for (const candidate of order) {
					const s = alike(k, candidate);
					if (s > score) {
						score = s;
						stand = candidate;
					}
				}
				if (!drums) offBars += barsDiffering(profile(k), profile(stand));
			}
			const played = new Set((plays.get(stand) ?? []).map((h) => `${h.step}:${h.note}`));
			for (const h of hits) if (played.has(`${h.step}:${h.note}`)) written++;
			return numberOf.get(stand) ?? 1;
		});
		byBlock.set(to, blockPatterns);

		reports.push({
			to,
			parts,
			drums,
			notes: parts.reduce((sum, p) => sum + p.notes, 0),
			patterns: order.length + (needsEmpty ? 1 : 0),
			folded,
			asWritten: total === 0 ? 1 : written / total,
			offBars,
			overflow,
			unmapped: parts.reduce((sum, p) => sum + p.unmapped, 0)
		});
	}

	// a scene for each different set of patterns, the song the blocks in order
	const sceneOf = new Map<string, number>();
	const scenes: ImportPlan['scenes'][number][] = [];
	const song: number[] = [];
	for (let b = 0; b < songBlocks; b++) {
		const set = targets.map((to) => ({ track: to, pattern: byBlock.get(to)?.[b] ?? 1 }));
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
		silentStart,
		blocks: songBlocks,
		barsPerBlock,
		patterns,
		scenes,
		song,
		tracks: reports,
		notes
	};
}
