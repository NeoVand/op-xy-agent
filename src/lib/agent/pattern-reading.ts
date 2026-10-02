/**
 * A pitched pattern as a musician reads it, for the agent to describe from (docs/AGENT-V2.md,
 * grounding): the key its notes suggest, each bar with the notes or chords on its steps, and the
 * chords where they change, spelled as the key does. A description written from this says what
 * the pattern plays, not what the agent meant it to play, and a chord that came out wrong (G7 where
 * it meant Gm7) shows by its name.
 */
import { estimateKey, keySpelling, respellChord, spelledNote } from '$lib/core/listen/harmony';
import { chordFromSymbol, chordName } from '$lib/core/music/harmony';
import type { VirtualPattern } from './virtual-opxy';

/** What a pitched pattern plays. */
export interface PatternReading {
	/**
	 * The key the notes suggest with the parts that play alongside ("F minor"), marked "(a guess)"
	 * when two keys fit about as well.
	 */
	readonly key?: string;
	/**
	 * Each bar, four steps a group: a note ("F2"), a chord of three notes or more ("Dm7") or notes
	 * that make none ("C3+G3") where something starts, – while it still sounds, · for silence.
	 */
	readonly bars: readonly string[];
	/** The chords, each where it starts and with its notes: "step 17: G7 (G B D F)". */
	readonly chords?: readonly string[];
	/**
	 * The chords by their plain names and as degrees of the key, with the inversions apart: "C G Am
	 * F: I V vi IV in C major; G/B, Am/C, F/C are inversions, the same chords over another of their
	 * notes".
	 */
	readonly progression?: string;
	/**
	 * What the chords make over another track's bass as it plays now, when that differs from their
	 * own names: "with T3's bass as it plays now: Bm7/A G7/F D7/C A7/G". Apart from the chords' own
	 * names, which a part transposed before its bass read as, so the two did not contradict.
	 */
	readonly withBass?: string;
	/**
	 * A line of single notes against the chords another track plays under it: how many of its
	 * notes are tones of the chord sounding, and those on a beat that are not ("step 9: F# over Em
	 * (E G B)"), off-beat ones being passing notes. An agent asked to fix a melody's clashes with
	 * the chords had to work each note out by hand.
	 */
	readonly againstChords?: string;
	/**
	 * A line of single notes, bar by bar: the chord each bar's notes make, where they make one ("bar
	 * 1: Am (A C E)"), so the harmony a bassline or melody outlines can be checked.
	 */
	readonly outlines?: readonly string[];
	/**
	 * How the reading spells notes the writer named another way: "G# A# read as Ab Bb, as F minor
	 * spells them (the same notes)".
	 */
	readonly spelled?: string;
	/**
	 * Notes outside the key the writer named, and the mode they make when one note sets it apart:
	 * "B is outside D minor: with it the notes are D dorian". An agent labelled a dorian
	 * progression D minor and found out only when the user asked.
	 */
	readonly outside?: string;
	/**
	 * Every note in write_pattern's own form, step:note:length:velocity, the notes of a step with
	 * one length and velocity joined by + ("1:A1:2:95 17:G3+B3+E4:16:70"), spelled as the bars are.
	 */
	readonly notes: string;
}

const ascii = (name: string) => name.replace(/♯/g, '#').replace(/♭/g, 'b');

/** How readings group a bar: its steps, and each beat's (a 3/4 bar is three beats of four). */
export interface BarMeter {
	readonly bar: number;
	readonly beats: readonly number[];
}

/** A key as the writer means it: its spelling's tonic and mode (a mode spells as its parent). */
export interface MeantKey {
	readonly label: string;
	readonly pitchClass: number;
	readonly mode: 'major' | 'minor';
	/** The key's own tonic (D for D dorian, whose spelling is C major's). */
	readonly tonic: number;
	/**
	 * Sharps or flats as the name gives them: "D# minor" spells A# G# F#, not as Eb minor does (an
	 * agent's black-key melody in D# minor read back as Bb Ab Gb, "as D# minor spells them").
	 */
	readonly prefer?: 'sharps' | 'flats';
	/** The letter the spelling's tonic takes, 0 (C) … 6 (B): C for D dorian, F for F# major. */
	readonly letter?: number;
}

/** Modes by name: the major or minor key they spell as, and how far below its tonic theirs is. */
const MODES: Readonly<Record<string, { mode: 'major' | 'minor'; down: number; letters: number }>> =
	{
		major: { mode: 'major', down: 0, letters: 0 },
		ionian: { mode: 'major', down: 0, letters: 0 },
		minor: { mode: 'minor', down: 0, letters: 0 },
		aeolian: { mode: 'minor', down: 0, letters: 0 },
		dorian: { mode: 'major', down: 2, letters: 1 },
		phrygian: { mode: 'major', down: 4, letters: 2 },
		lydian: { mode: 'major', down: 5, letters: 3 },
		mixolydian: { mode: 'major', down: 7, letters: 4 },
		locrian: { mode: 'major', down: 11, letters: 6 }
	};

/** "A minor", "F# major", "D dorian", "Bb" (major) as a key to spell in; null for anything else. */
export function parseKey(text: string): MeantKey | null {
	const m = /^\s*([A-Ga-g])([#b♯♭]?)\s*([a-z]*)\s*$/i.exec(text);
	if (!m) return null;
	const letter = m[1].toUpperCase();
	const natural = [0, 2, 4, 5, 7, 9, 11]['CDEFGAB'.indexOf(letter)];
	const accidental = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
	const word = (m[3] || 'major').toLowerCase();
	const kind = MODES[word];
	if (!kind) return null;
	const tonic = (natural + accidental + 12) % 12;
	return {
		label: `${letter}${m[2] ? (accidental > 0 ? '#' : 'b') : ''} ${word}`,
		pitchClass: (tonic - kind.down + 12) % 12,
		mode: kind.mode,
		tonic,
		...(accidental !== 0
			? { prefer: accidental > 0 ? ('sharps' as const) : ('flats' as const) }
			: {}),
		letter: ('CDEFGAB'.indexOf(letter) - kind.letters + 7) % 7
	};
}

/**
 * A note moved `steps` steps along the scale of `key` (2 a third up, −5 a sixth down), as a harmony
 * in the key is written: an agent harmonizing a melody a sixth below worked each note out by hand.
 * A note outside the key moves with the nearest scale note below it, keeping its distance.
 */
export function moveInKey(note: number, steps: number, key: MeantKey): number {
	if (steps === 0) return note;
	const scale = (key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]).map(
		(i) => (key.pitchClass + i) % 12
	);
	const inKey: number[] = [];
	for (let n = 0; n <= 127; n++) if (scale.includes(n % 12)) inKey.push(n);
	let below = note;
	while (below > 0 && !scale.includes(below % 12)) below--;
	const at = inKey.indexOf(below);
	const to = inKey[Math.max(0, Math.min(inKey.length - 1, at + steps))];
	return to + (note - below);
}

/** Scale steps as an interval said: "a third up", "a sixth down", "an octave up". */
export function stepsInterval(steps: number): string {
	const size = Math.abs(steps);
	const names = ['an octave', 'a second', 'a third', 'a fourth', 'a fifth', 'a sixth', 'a seventh'];
	const octaves = Math.floor(size / 7);
	const name =
		size % 7 === 0
			? octaves === 1
				? 'an octave'
				: `${octaves} octaves`
			: `${names[size % 7]}${octaves ? ` and ${octaves === 1 ? 'an octave' : `${octaves} octaves`}` : ''}`;
	return `${name} ${steps > 0 ? 'up' : 'down'}`;
}

/** Degrees as a major scale counts them, the pop convention: a minor key's VI reads ♭VI. */
const DEGREES = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];

/** A chord as a degree of the key on `tonic`: "vi", "V7", "♭VII", "iiø7". */
export function numeral(root: number, suffix: string, tonic: number): string {
	const degree = DEGREES[(root - tonic + 12) % 12];
	const minor = /^m(?!aj)/.test(suffix) || suffix.includes('°');
	const rest = /^m7(♭|b)5$/.test(suffix)
		? 'ø7'
		: minor && suffix.startsWith('m')
			? suffix.slice(1)
			: suffix;
	return (minor ? degree.toLowerCase() : degree) + rest;
}

/** Four beats of four steps. */
export const FOUR_FOUR: BarMeter = { bar: 16, beats: [4, 4, 4, 4] };

/**
 * A pattern's steps that play (1…`length`) laid out bar by bar in `meter`: each beat's cells joined
 * by `cell`, the beats by `beat`. A waltz read in bars of sixteen once looked broken; and steps past
 * the length do not play, so they are not shown.
 */
export function meterBars(
	length: number,
	meter: BarMeter,
	mark: (step: number) => string,
	cell: string,
	beat: string
): string[] {
	const count = Math.max(1, Math.ceil(length / meter.bar));
	return Array.from({ length: count }, (_, b) => {
		let at = b * meter.bar;
		return meter.beats
			.map((size) => {
				const cells = Array.from({ length: size }, (_, i) => at + i + 1)
					.filter((step) => step <= length)
					.map(mark);
				at += size;
				return cells.join(cell);
			})
			.filter(Boolean)
			.join(beat);
	});
}

/** Where a part shorter than this one is at `step`, on the first pass: it loops under it. */
const loopedStep = (q: VirtualPattern, step: number): number =>
	q.length > 0 && step > q.length ? ((step - 1) % q.length) + 1 : step;

/**
 * The reading of a pitched pattern, or null for an empty one. The key counts the pitched parts that
 * play `alongside` it too (the scene's other tracks): a melody's first bars alone once read as E
 * minor in C major, chords of C and G as G major.
 */
export function readPattern(
	p: VirtualPattern,
	alongside: readonly VirtualPattern[] = [],
	meter: BarMeter = FOUR_FOUR,
	/** The key the writer means: spelled in, and named, instead of guessed. */
	meant: MeantKey | null = null,
	/** Note names with a sharp or flat as the writer gave them ("G#"), to say how they read. */
	written: readonly string[] = [],
	/** Chords given by name, by step ("Em7" on 17): read by that name when the notes are its. */
	named: ReadonlyMap<number, string> = new Map()
): PatternReading | null {
	if (p.notes.length === 0) return null;
	// the key from how long each pitch class sounds, in this part and those with it
	const chroma = new Array<number>(12).fill(0);
	const all = [p, ...alongside].flatMap((q) => q.notes);
	for (const n of all) chroma[n.note % 12] += Math.max(0.25, n.length);
	const found = meant
		? null
		: new Set(all.map((n) => n.note % 12)).size >= 3
			? estimateKey(chroma, { written: true })
			: null;
	const names = meant
		? keySpelling(meant.pitchClass, meant.mode, meant.prefer, meant.letter)
		: found
			? keySpelling(found.pitchClass, found.mode)
			: keySpelling(0, 'major');
	const noteName = (note: number) => spelledNote(names, note);

	const slots = p.bars * 16;
	const starting = new Map<number, number[]>();
	const sounding = new Array<boolean>(slots + 1).fill(false);
	for (const n of p.notes) {
		starting.set(n.step, [...(starting.get(n.step) ?? []), n.note]);
		for (let s = n.step + 1; s < n.step + n.length && s <= slots; s++) sounding[s] = true;
	}
	const chords: string[] = [];
	// each chord where it changes, for the progression: its plain name, root and whether inverted,
	// and what it makes over another track's bass
	const heard: {
		plain: string;
		name: string;
		root: number;
		suffix: string;
		together?: string;
	}[] = [];
	const bassTracks = new Set<number>();
	let lastChord = '';
	// the lowest note another part sounds under a step, below this one's: a bass the chord is over
	// (a shorter part loops under it: a one-bar bass under four-bar chords was heard under the
	// first bar alone)
	const under = (step: number, below: number): { note: number; track: number } | null => {
		let best: { note: number; track: number } | null = null;
		for (const q of alongside) {
			const at = loopedStep(q, step);
			for (const n of q.notes) {
				if (n.step > at || n.step + Math.max(1, n.length) <= at || n.note >= below) continue;
				if (!best || n.note < best.note) best = { note: n.note, track: q.track };
			}
		}
		return best;
	};
	const slot = (step: number): string => {
		const notes = (starting.get(step) ?? []).sort((a, b) => a - b);
		if (notes.length === 0) return sounding[step] ? '–' : '·';
		if (notes.length === 1) return noteName(notes[0]);
		const tones = [...new Set(notes.map((n) => names[n % 12]))];
		// a chord given by its name reads by that name when its notes are the name's (an Em7 voiced
		// over its G read G6, and an agent passed the other name on)
		const symbol = named.get(step);
		const meantChord = symbol && tones.length >= 3 ? chordFromSymbol(symbol) : null;
		if (symbol && meantChord) {
			const pcs = new Set(notes.map((n) => n % 12));
			const want = new Set([
				...meantChord.tones.map((t) => (meantChord.root + t) % 12),
				...(meantChord.bass !== null ? [meantChord.bass] : [])
			]);
			if (pcs.size === want.size && [...pcs].every((pc) => want.has(pc))) {
				const lowest = notes[0] % 12;
				const plain = respellChord(ascii(symbol.split('/')[0]), names);
				const shown = lowest === meantChord.root ? plain : `${plain}/${names[lowest]}`;
				const bass = under(step, notes[0]);
				const with_ = bass ? ` over T${bass.track}'s ${names[bass.note % 12]}` : '';
				if (shown !== lastChord) {
					chords.push(`step ${step}: ${shown} (${tones.join(' ')}${with_})`);
					heard.push({
						plain,
						name: shown,
						root: meantChord.root,
						suffix: plain.slice(names[meantChord.root].length)
					});
				}
				lastChord = shown;
				return shown;
			}
		}
		// two notes are an interval, not a chord ("C5" would read as a note)
		const alone = tones.length >= 3 ? chordName(notes) : null;
		// and over the bass another track plays under it, as a musician hears the two (a rootless
		// Am9 over the bass's A reads Cmaj7 alone): said beside the part's own chord, not for it,
		// since a strings part transposed before its bass read Bm7/A for plain B D F#
		const bass = tones.length >= 3 ? under(step, notes[0]) : null;
		const over = bass ? chordName([bass.note, ...notes]) : null;
		const chord = alone ?? over;
		if (!chord) {
			// three notes or more that make no chord this names: in the progression as their notes,
			// so it does not drop out unseen (an agent could not tell an A7♭9 was unnamed)
			const unnamed = `[${tones.join(' ')}]`;
			if (tones.length >= 3 && unnamed !== lastChord) {
				heard.push({ plain: unnamed, name: unnamed, root: -1, suffix: '' });
				lastChord = unnamed;
			}
			return notes.map(noteName).join('+');
		}
		// the root as the key spells it ("Db", not "C#", in F minor)
		const name = respellChord(ascii(chord.name), names);
		const together = over ? respellChord(ascii(over.name), names) : null;
		const with_ =
			over && bass
				? `; over T${bass.track}'s ${names[bass.note % 12]}${together !== name ? ` it sounds as ${together}` : ''}`
				: '';
		if (name !== lastChord) {
			chords.push(`step ${step}: ${name} (${tones.join(' ')}${with_})`);
			const plain = name.split('/')[0];
			heard.push({
				plain,
				name,
				root: chord.root,
				suffix: plain.slice(names[chord.root].length),
				...(together ? { together } : {})
			});
			if (bass && over) bassTracks.add(bass.track);
		}
		lastChord = name;
		return name;
	};
	const bars = meterBars(p.length, meter, (step) => slot(step), ' ', ' | ');
	// the progression as a musician names it: an agent once could not say "C G Am F" for chords
	// that read C, G/B, Am/C and F/C
	const tonic = meant ? meant.tonic : found?.pitchClass;
	const keyName = meant ? meant.label : found?.key;
	const inverted = heard.filter((h) => h.name !== h.plain).map((h) => h.name);
	const unnamed = heard.filter((h) => h.root < 0).map((h) => h.plain);
	const degree = (h: (typeof heard)[number]) =>
		h.root < 0 || tonic === undefined ? '?' : numeral(h.root, h.suffix, tonic);
	const progression =
		heard.length >= 2 && tonic !== undefined && keyName
			? `${heard.map((h) => h.plain).join(' ')}: ${heard.map(degree).join(' ')} in ${keyName}${inverted.length ? `; ${inverted.join(', ')} ${inverted.length === 1 ? 'is an inversion' : 'are inversions'}, the same chord${inverted.length === 1 ? '' : 's'} over another of ${inverted.length === 1 ? 'its' : 'their'} notes` : ''}${unnamed.length ? `; ${unnamed.join(', ')} ${unnamed.length === 1 ? 'is' : 'are'} no chord the reading names` : ''}`
			: null;
	// a single-note line against the chords sounding under it on another track
	let againstChords: string | null = null;
	if ([...starting.values()].every((notes) => notes.length === 1)) {
		const beatStarts = new Set<number>();
		meter.beats.reduce((at, beat) => (beatStarts.add(at), at + beat), 0);
		const chordAt = (step: number) => {
			let best: { track: number; notes: number[] } | null = null;
			for (const q of alongside) {
				const at = loopedStep(q, step);
				const notes = q.notes
					.filter((n) => n.step <= at && at < n.step + Math.max(1, n.length))
					.map((n) => n.note);
				if (
					new Set(notes.map((n) => n % 12)).size >= 3 &&
					(!best || notes.length > best.notes.length)
				)
					best = { track: q.track, notes };
			}
			return best;
		};
		let under = 0;
		let tones = 0;
		const outside: string[] = [];
		let passing = 0;
		const chordTracks = new Set<number>();
		for (const n of [...p.notes].sort((a, b) => a.step - b.step)) {
			const chord = chordAt(n.step);
			if (!chord) continue;
			under++;
			chordTracks.add(chord.track);
			const pcs = new Set(chord.notes.map((x) => x % 12));
			if (pcs.has(n.note % 12)) {
				tones++;
				continue;
			}
			if (beatStarts.has((n.step - 1) % meter.bar)) {
				const named = chordName(chord.notes);
				const sorted = [...pcs].sort((a, b) => a - b).map((pc) => names[pc]);
				outside.push(
					`step ${n.step}: ${noteName(n.note)} over ${named ? respellChord(ascii(named.name), names) : sorted.join(' ')} (${sorted.join(' ')})`
				);
			} else passing++;
		}
		if (under >= 2) {
			const by = [...chordTracks].map((t) => `T${t}`).join(' and ');
			againstChords = `${tones} of the ${under} notes over ${by}'s chords are chord tones${outside.length ? `; on a beat and outside the chord: ${outside.slice(0, 8).join(', ')}${outside.length > 8 ? ', …' : ''}` : '; none on a beat is outside its chord'}${passing ? `; ${passing} off the beat ${passing === 1 ? 'is a passing note' : 'are passing notes'}` : ''}`;
		}
	}
	// what the chords make over the other part's bass, apart, when any differs from its own name
	const withBass =
		heard.length >= 2 && heard.some((h) => h.together !== undefined && h.together !== h.name)
			? `with ${[...bassTracks].map((t) => `T${t}'s`).join(' and ')} bass as it plays now: ${heard.map((h) => h.together ?? h.name).join(' ')}`
			: null;
	// a line of single notes: the chord each bar's notes make (an agent named a bass's chords from
	// what it meant to write, with nothing to check them by)
	const outlines: string[] = [];
	if (heard.length === 0 && [...starting.values()].every((notes) => notes.length === 1)) {
		for (let b = 0; b * meter.bar < p.length; b++) {
			const from = b * meter.bar + 1;
			const to = Math.min(p.length, (b + 1) * meter.bar);
			const notes = p.notes
				.filter((n) => n.step >= from && n.step <= to)
				.map((n) => n.note)
				.sort((x, y) => x - y);
			const tones = [...new Set(notes.map((n) => names[n % 12]))];
			// three or four notes outline a chord; more are a run (a melody read Am7(add11), no help),
			// and a triad or a seventh is what a line outlines (a melody's C D E G read Cadd9/G)
			const named = tones.length >= 3 && tones.length <= 4 ? chordName(notes) : null;
			const chord = named && !/add|sus|9|11|13/.test(named.name) ? named : null;
			if (chord) {
				outlines.push(
					`bar ${b + 1}: ${respellChord(ascii(chord.name), names)} (${tones.join(' ')})`
				);
			}
		}
	}
	// sharps the writer gave that the key spells as flats, or the other way (an agent thought the
	// reading had changed the user's G# to Ab)
	const PITCH: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
	const respelled = [...new Set(written.map(ascii))].flatMap((name) => {
		const m = /^([A-G])([#b]?)$/.exec(name);
		if (!m) return [];
		const pc = (PITCH[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
		const as = ascii(names[pc]);
		return as === name ? [] : [{ name, as }];
	});
	const spelled = respelled.length
		? `${respelled.map((r) => r.name).join(' ')} read as ${respelled.map((r) => r.as).join(' ')}, as ${keyName ?? 'the reading'} spells ${respelled.length === 1 ? 'it' : 'them'} (the same note${respelled.length === 1 ? '' : 's'})`
		: null;
	// notes outside the key named (harmonic minor's leading note allowed), and the mode one such
	// note makes of a plain major or minor
	let outside: string | null = null;
	if (meant) {
		const diatonic = meant.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
		const allowed = new Set(diatonic.map((i) => (meant.pitchClass + i) % 12));
		if (meant.mode === 'minor') allowed.add((meant.pitchClass + 11) % 12);
		const out = [...new Set(p.notes.map((n) => n.note % 12))]
			.filter((pc) => !allowed.has(pc))
			.sort((a, b) => ((a - meant.tonic + 12) % 12) - ((b - meant.tonic + 12) % 12));
		if (out.length > 0) {
			const plain = meant.tonic === meant.pitchClass;
			const step = out.length === 1 ? (out[0] - meant.tonic + 12) % 12 : -1;
			const mode = !plain
				? null
				: meant.mode === 'minor'
					? step === 9
						? 'dorian'
						: step === 1
							? 'phrygian'
							: null
					: step === 10
						? 'mixolydian'
						: step === 6
							? 'lydian'
							: null;
			const list = out.map((pc) => ascii(names[pc])).join(' ');
			outside = `${list} ${out.length === 1 ? 'is' : 'are'} outside ${meant.label}${mode ? `: with ${out.length === 1 ? 'it' : 'them'} the notes are ${ascii(names[meant.tonic])} ${mode} (key "${ascii(names[meant.tonic])} ${mode}" reads them so)` : ''}`;
		}
	}
	// the notes as a write gives them: a 64-note bassline read back as an object a note was five
	// times its write, and an agent changing it bar by bar read all of it after every bar
	const atStep = new Map<number, Map<string, number[]>>();
	for (const n of p.notes) {
		const groups = atStep.get(n.step) ?? new Map<string, number[]>();
		const at = `${n.length}:${n.velocity}`;
		groups.set(at, [...(groups.get(at) ?? []), n.note]);
		atStep.set(n.step, groups);
	}
	const notes = [...atStep.entries()]
		.sort(([a], [b]) => a - b)
		.flatMap(([step, groups]) =>
			[...groups].map(
				([at, pitches]) =>
					`${step}:${pitches
						.sort((a, b) => a - b)
						.map(noteName)
						.join('+')}:${at}`
			)
		)
		.join(' ');
	return {
		...(meant
			? { key: `${meant.label} (as written)` }
			: found
				? { key: found.clear ? found.key : `${found.key} (a guess)` }
				: {}),
		bars,
		...(chords.length ? { chords } : {}),
		...(progression ? { progression } : {}),
		...(withBass ? { withBass } : {}),
		...(againstChords ? { againstChords } : {}),
		...(outlines.length ? { outlines } : {}),
		...(spelled ? { spelled } : {}),
		...(outside ? { outside } : {}),
		notes
	};
}

/** At or over this velocity a hit reads as an accent, X. */
export const ACCENT_VELOCITY = 115;
/** At or under this, a soft hit, read as its digit. */
export const SOFT_VELOCITY = 75;

/**
 * A drum hit on the grid by how hard it is, by fixed lines: X an accent, x a hit, and a soft hit as
 * its loudness digit, 1–5 (velocity about 14 a digit), so a grid reads back as written (marked
 * against each other, a line of soft hats came back as x, and an agent thought they played at full
 * velocity; an o for every soft hit hid ghost notes made softer).
 */
export function hitMark(
	velocity: number,
	/** The velocity a plain x was written at (a write's own), which reads back as x. */
	plain?: number
): string {
	if (velocity === plain && velocity < ACCENT_VELOCITY && velocity > SOFT_VELOCITY) return 'x';
	if (velocity >= ACCENT_VELOCITY) return 'X';
	if (velocity <= SOFT_VELOCITY) {
		return String(Math.min(5, Math.max(1, Math.round((velocity * 9) / 127))));
	}
	// a loud digit's own velocity (6 = 85, 7 = 99, 8 = 113) reads back as that digit: a graded
	// build written "3456" came back "345x" and read as a flat hit, twice
	const digit = LOUD_DIGITS.indexOf(velocity);
	return digit >= 0 ? String(digit + 6) : 'x';
}

/** The velocities the loud digits 6, 7 and 8 write. */
const LOUD_DIGITS = [6, 7, 8].map((d) => Math.round((d * 127) / 9));
