// Adapted from MIDI Lab (NeoVand/midilab) src/lib/music/melodies.ts

/**
 * Music everybody already knows.
 *
 * An abstract demonstration phrase makes its point and is forgotten. A tune the listener has known
 * since childhood does real teaching work: when the melody is fixed in your head, every parameter
 * that changes around it (a sound, a filter, a tempo) is audible by contrast. These double as demo
 * content for the agent and as fixtures for the notation parser.
 *
 * ## What is safe to put here
 *
 * Musical *works* by composers long dead are in the public domain worldwide;
 * what stays in copyright is a particular *recording* or a particular modern
 * *edition* of one. So none of these are files taken from anywhere. Each is
 * typed out here as note numbers and durations, from the score, and each names
 * its source. Where a reading was uncertain it was checked against the
 * LilyPond sources published by the Mutopia Project, which re-engraves
 * public-domain music from scratch and dedicates the engraving to the public
 * domain as well. Every melody carrying `verified` below is one where memory
 * was not good enough on its own and a published edition settled it.
 *
 * Nothing here is later than 1902.
 */

import { assertChannel, assertIntInRange, MidiRangeError } from '../midi/validate';
import { after, phrase, together } from './notation';
import type { NoteSpec } from './types';

/** A public-domain melody, with the provenance that claim needs. */
export interface Melody {
	id: string;
	title: string;
	/** "Traditional" where there is no known composer. */
	composer: string;
	/** Year of composition or first publication. */
	year: string;
	/**
	 * One line of why this one is worth hearing — a fact, not a description.
	 * Rendered under the title, so it has to earn its space.
	 */
	note: string;
	/** Tempo the phrase is written for. */
	bpm: number;
	/**
	 * Quarter-note beats in a bar — 4 for common time, 3 for a minuet, 1.5 for
	 * a piece in 3/8. Carried with the music because anything that draws a grid
	 * behind it needs to put the bar lines in the right places, and a piano roll
	 * ruling four-beat bars across a minuet is wrong in a way musicians see
	 * instantly.
	 */
	beatsPerBar?: number;
	/** A General MIDI program that suits it (GM convention, not an OP-XY sound). */
	program: number;
	notes: NoteSpec[];
	/** Set where the reading was checked against a published score. */
	verified?: string;
	/** Rough shape, for filtering: what this melody is good at demonstrating. */
	tags: readonly (
		| 'melody' // a single line you can hum
		| 'chords' // more than one note at a time
		| 'bass' // a low part meant to sit under something
		| 'fast' // rewards a tempo change
		| 'slow' // rewards a long release
		| 'round' // can be layered against itself
	)[];
}

/*
 * ── The melodies ─────────────────────────────────────────────────────────
 *
 * Durations are in beats and persist until changed, so a run of sixteenths
 * says `/0.25` once. Bar lines are ignored by the parser and are here for
 * whoever reads this next.
 */

/** Beethoven, Symphony No. 9, final movement, 1824. The Ode to Joy theme in C. */
const ODE = phrase(
	`E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4/1.5 D4/0.5 D4/2 |
	 E4/1 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/1.5 C4/0.5 C4/2`
);

/**
 * Beethoven, Bagatelle in A minor WoO 59, 1810 — the piece he never published
 * and everyone can play the first eight bars of.
 */
const FUR_ELISE = phrase(
	`E5/0.25 Eb5 E5 Eb5 E5 B4 D5 C5 | A4/0.75 _/0.25 C4/0.25 E4 A4 |
	 B4/0.75 _/0.25 E4/0.25 Ab4 B4 | C5/0.75 _/0.25 E4/0.25 |
	 E5 Eb5 E5 Eb5 E5 B4 D5 C5 | A4/0.75 _/0.25 C4/0.25 E4 A4 |
	 B4/0.75 _/0.25 E4/0.25 C5 B4 | A4/1.5`
);

/**
 * Bach, Prelude No. 1 in C major, BWV 846, from the Well-Tempered Clavier,
 * 1722. Four bars of pure arpeggio — no melody at all, and unmistakable.
 */
const PRELUDE_IN_C = phrase(
	`C4/0.25 E4 G4 C5 E5 G4 C5 E5 | C4 E4 G4 C5 E5 G4 C5 E5 |
	 C4 D4 A4 D5 F5 A4 D5 F5 | C4 D4 A4 D5 F5 A4 D5 F5 |
	 B3 D4 G4 D5 F5 G4 D5 F5 | B3 D4 G4 D5 F5 G4 D5 F5 |
	 C4 E4 G4 C5 E5 G4 C5 E5 | C4 E4 G4 C5 E5 G4 C5 E5`
);

/**
 * Petzold, Minuet in G major, BWV Anh. 114, c. 1725 — catalogued as Bach's
 * for two centuries, and printed in every beginner's piano book since.
 *
 * Eight bars, which is the first full phrase. Written from memory this had
 * F#4 and G4 in the third bar's rising run, dropping an octave in the middle
 * of the most recognisable gesture in the piece; the Anna Magdalena notebook
 * has it climbing to F#5 and G5, and that is what a listener expects.
 */
const MINUET = phrase(
	`D5/1 G4/0.5 A4 B4 C5 | D5/1 G4 G4 |
	 E5/1 C5/0.5 D5 E5 F#5 | G5/1 G4 G4 |
	 C5/1 D5/0.5 C5 B4 A4 | B4/1 C5/0.5 B4 A4 G4 |
	 F#4/1 G4/0.5 A4 B4 G4 | A4/3`
);

/** Traditional, first printed in Paris in 1761 as "Ah! vous dirai-je, maman". */
const TWINKLE = phrase(
	`C4 C4 G4 G4 | A4 A4 G4/2 | F4/1 F4 E4 E4 | D4 D4 C4/2 |
	 G4/1 G4 F4 F4 | E4 E4 D4/2 | G4/1 G4 F4 F4 | E4 E4 D4/2 |
	 C4/1 C4 G4 G4 | A4 A4 G4/2 | F4/1 F4 E4 E4 | D4 D4 C4/2`
);

/**
 * Traditional French round, printed 1780. Four voices entering two bars apart
 * — which is why it is here rather than any other nursery tune.
 */
const FRERE_JACQUES = phrase(
	`C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4/2 | E4 F4 G4/2 |
	 G4/0.5 A4 G4 F4 E4/1 C4 | G4/0.5 A4 G4 F4 E4/1 C4 |
	 C4/1 G3 C4/2 | C4/1 G3 C4/2`
);

/**
 * Pachelbel, Canon in D, c. 1680 — the ground bass only. Eight notes, two
 * bars, repeated twenty-eight times in the original and roughly forever since.
 */
const CANON_BASS = phrase(`D3/2 A2 B2 F#2 | G2 D2 G2 A2`, { velocity: 92 });

/**
 * The descant over that bass: one note per half note, eight of them, landing
 * exactly with the eight notes of the ground.
 */
const CANON_LINE = phrase(`D5/2 C#5 B4 A4 | G4 F#4 G4 B4`);

/**
 * Beethoven, Symphony No. 5, 1808. Four notes, and an eighth rest that most
 * people hum straight past — which is exactly why it is a good test of whether
 * your rig is actually in time.
 */
const FATE = phrase(`_/0.5 G4/0.5> G4> G4> Eb4/3> | _/0.5 F4/0.5> F4> F4> D4/4>`);

/**
 * Grieg, "In the Hall of the Mountain King", Peer Gynt suite, 1875. Written
 * to be played faster and faster until it falls over, so it is the phrase to
 * reach for whenever this course changes a tempo.
 */
const MOUNTAIN_KING = phrase(
	`B2/0.5 C#3 D3 E3 F#3> D3 F#3/1 |
	 E#3/0.5> C#3 E#3/1 E3/0.5> C3 E3/1 |
	 B2/0.5 C#3 D3 E3 F#3> D3 F#3 B3 |
	 A3 F#3 D3 F#3 A3/2>`,
	{ velocity: 84 }
);

/**
 * Joplin, "The Entertainer", 1902. The introduction, which states its figure
 * once high and then repeats it an octave down — a two-bar demonstration of
 * why transposition is addition.
 */
const ENTERTAINER = phrase(
	`D6/0.25 E6 C6 A5/0.5 B5/0.25 G5/0.5 |
	 D5/0.25 E5 C5 A4/0.5 B4/0.25 G4/0.5 |
	 D4/0.25 Eb4 | E4 C5/0.5 E4/0.25 C5/0.5 E4/0.25 C5/1.25`
);

/**
 * Bach, Toccata and Fugue in D minor, BWV 565 — the opening flourish, and
 * possibly the most recognisable fourteen notes written before 1800.
 */
const TOCCATA = phrase(
	`A5/0.25 G5 A5/1.75> _/0.25 |
	 G5/0.25 F5 E5 D5 C#5/0.5 D5/2>`,
	{ velocity: 100 }
);

/**
 * Bach, "Jesu, Joy of Man's Desiring", from Cantata BWV 147, 1723 — the
 * running triplet line, not the chorale underneath it.
 */
const JESU = phrase(
	`G4/0.5 A4 B4 | D5 C5 C5 | E5 D5 D5 | G5 F#5 G5 |
	 D5 B4 G4 | B4 A4 F#4 | G4/1.5`
);

/** The library, in no particular order. */
export const MELODIES: Melody[] = [
	{
		id: 'ode-to-joy',
		title: 'Ode to Joy',
		composer: 'Ludwig van Beethoven',
		year: '1824',
		note: 'Written for a choir, by a composer who by then could not hear it. Sixteen bars long and built almost entirely from steps to the next note.',
		bpm: 116,
		program: 48,
		notes: ODE,
		tags: ['melody']
	},
	{
		id: 'fur-elise',
		title: 'Für Elise',
		composer: 'Ludwig van Beethoven',
		year: '1810',
		note: 'Never published in his lifetime; found in a drawer forty years after he died. Nobody is sure who Elise was.',
		bpm: 76,
		beatsPerBar: 1.5, // 3/8
		program: 0,
		notes: FUR_ELISE,
		tags: ['melody', 'fast']
	},
	{
		id: 'prelude-in-c',
		title: 'Prelude in C, BWV 846',
		composer: 'Johann Sebastian Bach',
		year: '1722',
		note: 'Four bars with no tune in them at all — just a chord broken the same way each bar. The harmony does every bit of the work.',
		bpm: 72,
		program: 0,
		notes: PRELUDE_IN_C,
		tags: ['chords', 'slow']
	},
	{
		id: 'minuet-in-g',
		title: 'Minuet in G',
		composer: 'Christian Petzold',
		year: 'c. 1725',
		note: 'Catalogued as Bach’s for two hundred years and printed in every beginner’s piano book. It is Petzold’s.',
		bpm: 120,
		beatsPerBar: 3, // 3/4
		program: 6,
		notes: MINUET,
		verified: 'Mutopia Project, from the Notebook for Anna Magdalena Bach',
		tags: ['melody']
	},
	{
		id: 'twinkle',
		title: 'Twinkle, Twinkle, Little Star',
		composer: 'Traditional',
		year: '1761',
		note: 'A French tune printed as "Ah! vous dirai-je, maman" — the same melody carries the alphabet song and Mozart wrote twelve variations on it.',
		bpm: 108,
		program: 10,
		notes: TWINKLE,
		tags: ['melody']
	},
	{
		id: 'frere-jacques',
		title: 'Frère Jacques',
		composer: 'Traditional',
		year: 'c. 1780',
		note: 'A round: start a second voice two bars late and it harmonises with itself. Four voices on four channels is one cable doing the work of a choir.',
		bpm: 112,
		program: 52,
		notes: FRERE_JACQUES,
		tags: ['melody', 'round']
	},
	{
		id: 'canon-bass',
		title: 'Canon in D — the ground bass',
		composer: 'Johann Pachelbel',
		year: 'c. 1680',
		note: 'Eight notes, two bars, then again. Pachelbel repeats it twenty-eight times without changing a thing, and everything else is built on top.',
		bpm: 64,
		program: 42,
		notes: CANON_BASS,
		tags: ['bass', 'slow']
	},
	{
		id: 'canon-line',
		title: 'Canon in D — the line above it',
		composer: 'Johann Pachelbel',
		year: 'c. 1680',
		note: 'Eight notes over the eight of the ground, one each. Play them on two channels and you have the whole idea of the piece in four bars.',
		bpm: 64,
		program: 40,
		notes: CANON_LINE,
		verified: 'Mutopia Project, from Jim Paterson’s edition',
		tags: ['melody', 'slow']
	},
	{
		id: 'fate',
		title: 'Symphony No. 5 — the opening',
		composer: 'Ludwig van Beethoven',
		year: '1808',
		note: 'Four notes, and it starts on a rest. Almost everybody hums it beginning on the wrong beat.',
		bpm: 108,
		beatsPerBar: 2, // 2/4
		program: 48,
		notes: FATE,
		tags: ['melody']
	},
	{
		id: 'mountain-king',
		title: 'In the Hall of the Mountain King',
		composer: 'Edvard Grieg',
		year: '1875',
		note: 'Written to accelerate until it collapses. Grieg thought it "reeks of cow pats" and did not want it published.',
		bpm: 100,
		program: 70,
		notes: MOUNTAIN_KING,
		verified: 'Mutopia Project, from The University Society edition of 1918',
		tags: ['melody', 'fast']
	},
	{
		id: 'entertainer',
		title: 'The Entertainer',
		composer: 'Scott Joplin',
		year: '1902',
		note: 'A rag: a march with the melody deliberately pushed off the beat. The introduction says its figure once high, then the same figure twelve semitones lower.',
		bpm: 96,
		beatsPerBar: 2, // 2/4
		program: 0,
		notes: ENTERTAINER,
		verified: 'Mutopia Project, from the 1902 John Stark & Son edition',
		tags: ['melody', 'fast']
	},
	{
		id: 'toccata',
		title: 'Toccata in D minor — the opening',
		composer: 'Johann Sebastian Bach',
		year: 'c. 1704',
		note: 'Possibly the most recognisable fourteen notes written before 1800, and possibly not by Bach — the only source is a copy made after his death.',
		bpm: 84,
		program: 19,
		notes: TOCCATA,
		verified: 'Mutopia Project, from the Bach-Gesellschaft edition',
		tags: ['melody']
	},
	{
		id: 'jesu',
		title: 'Jesu, Joy of Man’s Desiring',
		composer: 'Johann Sebastian Bach',
		year: '1723',
		note: 'The running line, not the hymn underneath it. Threes against a chorale in fours — the reason it feels like it is floating.',
		bpm: 72,
		beatsPerBar: 4.5, // 9/8
		program: 73,
		notes: JESU,
		tags: ['melody', 'slow']
	}
];

const BY_ID = new Map(MELODIES.map((m) => [m.id, m]));

/** Thrown when a melody id is not in the library. */
export class UnknownMelodyError extends Error {
	override name = 'UnknownMelodyError';

	constructor(readonly id: string) {
		super(`Unknown melody "${id}". Known: ${[...BY_ID.keys()].join(', ')}`);
	}
}

/** Look a melody up by id; throws `UnknownMelodyError` rather than returning nothing. */
export function melody(id: string): Melody {
	const m = BY_ID.get(id);
	if (!m) throw new UnknownMelodyError(id);
	return m;
}

/**
 * The notes of a melody, optionally moved to another channel, transposed or given one velocity.
 * A transposition that pushes any note outside 0–127 throws `MidiRangeError` (MIDI Lab let it
 * through as an invalid note number).
 */
export function melodyNotes(
	id: string,
	opts: { channel?: number; transpose?: number; velocity?: number } = {}
): NoteSpec[] {
	const { channel, transpose = 0, velocity } = opts;
	if (channel !== undefined) assertChannel(channel);
	if (velocity !== undefined) assertIntInRange(velocity, 1, 127, 'velocity');
	assertIntInRange(transpose, -127, 127, 'transpose');
	return melody(id).notes.map((n) => {
		const note = n.note + transpose;
		if (note < 0 || note > 127) {
			throw new MidiRangeError(
				'transpose',
				transpose,
				`a shift that keeps "${id}" inside notes 0–127`
			);
		}
		return {
			...n,
			note,
			channel: channel ?? n.channel,
			velocity: velocity ?? n.velocity
		};
	});
}

/**
 * A round: the same melody entering on several channels, `delay` beats apart.
 *
 * Frère Jacques is the reason this exists. Four entries two bars apart is the cheapest possible
 * demonstration that sixteen channels is not an abstraction: one phrase, one cable, four parts
 * that fit together.
 */
export function round(
	id: string,
	entries: { channel: number; delay: number; transpose?: number }[]
): NoteSpec[] {
	return together(
		...entries.map((e) =>
			after(e.delay, melodyNotes(id, { channel: e.channel, transpose: e.transpose }))
		)
	);
}
