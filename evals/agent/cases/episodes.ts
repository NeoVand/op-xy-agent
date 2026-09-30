/**
 * The episodes (`../episodes.ts`): OP-XY owners across the range, each with a persona, a goal in
 * their own words, a private picture of success for the simulated user, the replica as they left
 * it, and what must hold on the replica when they are done. Success is read from the replica's
 * state and from who changed what (the user's own presses, or the agent), never from the simulated
 * user's word; `forbidden` names what the agent must not have done (setting a value a user wanted
 * to learn to set).
 */
import type { VirtualNote, VirtualOpxy } from '$lib/agent/virtual-opxy';
import { encodeMidiFile, tempoMeta, type EventAtTick } from '$lib/core/midi/smf';
import { playStep } from '$lib/sim/navigator';
import type { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { DUCK_METRONOME, shown, type SimState } from '$lib/sim/params';
import { currentPattern } from '$lib/sim/sequencer';
import { captureScene } from '$lib/sim/areas/arrange/model';
import { diffSummaries, type Change, type ReplicaSummary } from '../changes';
import type { Persona } from '../user-sim';

/** What an episode's checks can look at once it is over. */
export interface EpisodeOutcome {
	readonly state: SimState;
	readonly virtual: VirtualOpxy;
	/** The replica after the setup, before the first message, and at the end. */
	readonly start: ReplicaSummary;
	readonly end: ReplicaSummary;
	/** Every change the user's own presses made, in order. */
	readonly byUser: readonly Change[];
	/** Every change made while the agent had the turn, in order. */
	readonly byAgent: readonly Change[];
	/** The agent's own tool calls (not its subagents'). */
	readonly trace: readonly {
		readonly turn: number;
		readonly name: string;
		readonly input: unknown;
		readonly status: string;
	}[];
	/** The user's verdict: true or false when they stopped, null when the turns ran out first. */
	readonly satisfied: boolean | null;
	/** Messages the user sent, the first included. */
	readonly turns: number;
}

/** Where the replica stands before the user writes. */
export interface EpisodeSetup {
	readonly sim: OpxySim;
	readonly virtual: VirtualOpxy;
}

/** A file the user attaches to the first message (made here, so the eval needs nothing on disk). */
export interface EpisodeFile {
	readonly name: string;
	readonly bytes: Uint8Array;
}

export interface Episode {
	readonly id: string;
	readonly persona: Persona;
	/** What the person wants, in their words (the simulated user's goal). */
	readonly goal: string;
	/** When they would be happy: the simulated user's private picture of success. */
	readonly wants: string;
	/** The first message, as the person types it. */
	readonly opening: string;
	/** Where the replica stands first (a new project otherwise). */
	readonly setup?: (replica: EpisodeSetup) => void;
	/** A file attached to the first message. */
	readonly attach?: () => EpisodeFile;
	/** Messages the user sends at most, the first included. */
	readonly maxTurns: number;
	/** What must hold at the end, in words (empty: success). */
	readonly success: (o: EpisodeOutcome) => string[];
	/** What the agent must not have done, in words (empty: nothing of the sort). */
	readonly forbidden?: (o: EpisodeOutcome) => string[];
}

// ─── helpers ────────────────────────────────────────────────────────────────────────────────────

/** The default kit's keys by sound (a new project's drum tracks: F3 kick 1 … E5 chi 1). */
export const KICKS = [53, 54];
/** Snares, the rim and the clap. */
export const SNARES = [55, 56, 57, 58];
/** Tambourine, shaker, the closed hats and the open hat. */
export const HATS = [59, 60, 61, 62, 63];

const FOUR = [1, 5, 9, 13];
const OFFBEATS = [3, 7, 11, 15];

/** A note of `length` steps. */
const note = (step: number, n: number, velocity = 100, length = 1): VirtualNote => ({
	step,
	note: n,
	velocity,
	length
});

/** The notes of the pattern a track plays. */
export function notesOf(o: Pick<EpisodeOutcome, 'virtual'>, track: number): readonly VirtualNote[] {
	return o.virtual.readPattern(track).notes;
}

/** Whether the pattern a track plays sounds one of `keys` on `step`. */
export function hitsOn(
	o: Pick<EpisodeOutcome, 'virtual'>,
	track: number,
	step: number,
	keys: readonly number[]
): boolean {
	return notesOf(o, track).some((n) => n.step === step && keys.includes(n.note));
}

/** The bars (from 1) of the pattern a track plays in which no note starts. */
export function silentBars(o: Pick<EpisodeOutcome, 'virtual'>, track: number): number[] {
	const p = o.virtual.readPattern(track);
	return Array.from({ length: Math.ceil(p.length / 16) }, (_, b) => b + 1).filter(
		(bar) => !p.notes.some((n) => n.step > (bar - 1) * 16 && n.step <= bar * 16)
	);
}

/** Tracks 1–16 whose playing pattern has notes. */
export function busyTracks(o: Pick<EpisodeOutcome, 'virtual'>): number[] {
	return Array.from({ length: 16 }, (_, i) => i + 1).filter((t) => notesOf(o, t).length > 0);
}

/** The instrument tracks (1–8) that are drum tracks. */
function drumTracks(o: Pick<EpisodeOutcome, 'state'>): number[] {
	return o.state.tracks.flatMap((t, i) => (t.engine === 'drum' ? [i + 1] : []));
}

function playing(o: Pick<EpisodeOutcome, 'state'>): string[] {
	return o.state.transport.playing ? [] : ['nothing plays at the end'];
}

function bpm(o: Pick<EpisodeOutcome, 'state'>, want: number, within = 0.5): string[] {
	const got = o.state.tempo.bpm;
	return Math.abs(got - want) <= within ? [] : [`tempo ${got}, not ${want}`];
}

/** Whether a change of `key` came from the agent, or from the user's own presses. */
export const agentChanged = (o: Pick<EpisodeOutcome, 'byAgent'>, key: string) =>
	o.byAgent.some((c) => c.key === key);
export const userChanged = (o: Pick<EpisodeOutcome, 'byUser'>, key: string) =>
	o.byUser.some((c) => c.key === key);

/** How far the user's own presses moved a number (the sum of every press's change). */
export function userMoved(o: Pick<EpisodeOutcome, 'byUser'>, key: string): number {
	return o.byUser
		.filter((c) => c.key === key && typeof c.from === 'number' && typeof c.to === 'number')
		.reduce((sum, c) => sum + (Number(c.to) - Number(c.from)), 0);
}

/** A number from a summary (0 when it is missing). */
const num = (summary: ReplicaSummary, key: string) =>
	typeof summary[key] === 'number' ? (summary[key] as number) : 0;

/** Keys of a summary that say where the transport stands, not what the music is. */
const NOT_MUSIC = new Set(['playing', 'metronome', 'scene']);

/** The changes to the music itself between the start and the end. */
export function musicChanges(o: Pick<EpisodeOutcome, 'start' | 'end'>): Change[] {
	return diffSummaries(o.start, o.end).filter((c) => !NOT_MUSIC.has(c.key));
}

/** The pattern (1-based) and mute each of the 16 tracks has in scene `n` (1-based), or null. */
function sceneOf(o: Pick<EpisodeOutcome, 'state'>, n: number) {
	const a = o.state.areas.arrange;
	const scene = n - 1 === a.scene ? captureScene(o.state) : a.scenes[n - 1];
	if (!scene) return null;
	return scene.patterns.map((p, t) => ({ pattern: p + 1, muted: scene.mix[t].muted }));
}

/** The tracks that sound in scene `n`: a pattern with notes, not muted. */
function soundingIn(o: Pick<EpisodeOutcome, 'state' | 'virtual'>, n: number): number[] {
	const scene = sceneOf(o, n);
	if (!scene) return [];
	return scene.flatMap((t, i) =>
		!t.muted && o.virtual.readPattern(i + 1, t.pattern).notes.length > 0 ? [i + 1] : []
	);
}

// ─── setups ─────────────────────────────────────────────────────────────────────────────────────

/** Kick on every beat of track 1, one bar. */
function kick(virtual: VirtualOpxy, extra: readonly VirtualNote[] = []): void {
	virtual.writePattern(1, {
		pattern: 1,
		bars: 1,
		notes: [...FOUR.map((s) => note(s, 53, 110)), ...extra]
	});
}

/** A bass line on track 3 (a prism with its filter closed, as a new project has it). */
const BASS = [1, 4, 7, 11, 13].map((s, i) => note(s, [41, 41, 44, 39, 41][i], 100, 2));

/** Track 2's groove before the snare roll: snares on 2 and 4, closed hats on the offbeats. */
const T2_GROOVE = [
	...[5, 13].map((s) => note(s, 55, 105)),
	...OFFBEATS.map((s) => note(s, 61, 80))
];

// ─── the MIDI file ──────────────────────────────────────────────────────────────────────────────

const PPQ = 96;

/** A note as two events, at `beat` for `beats` (quarter notes). */
function midiNote(beat: number, beats: number, n: number, channel: number, velocity = 100) {
	const at = Math.round(beat * PPQ);
	return [
		{ tick: at, event: { type: 'noteOn' as const, channel, note: n, velocity } },
		{
			tick: at + Math.round(beats * PPQ),
			event: { type: 'noteOff' as const, channel, note: n, velocity: 0 }
		}
	];
}

/** The little file's bass line: [beat, MIDI note], half a beat each, two bars in A minor. */
export const GROOVE_BASS: readonly (readonly [number, number])[] = [
	[0, 45],
	[0.75, 45],
	[1.5, 48],
	[2.5, 52],
	[3.5, 43],
	[4, 41],
	[5.5, 41],
	[6.5, 43],
	[7.5, 45]
];

/** The little file's drums: GM kick 36 on 1 and 3, snare 38 on 2 and 4, closed hat 42 on 8ths. */
const GROOVE_DRUMS = (() => {
	const hits: [number, number][] = [];
	for (let bar = 0; bar < 2; bar++) {
		const b = bar * 4;
		hits.push([b, 36], [b + 2, 36], [b + 1, 38], [b + 3, 38]);
		for (let e = 0; e < 8; e++) hits.push([b + e / 2, 42]);
	}
	return hits;
})();

/** A two-bar groove at 100 BPM: drums on channel 10, a bass on channel 1 (a format-1 file). */
export function grooveFile(): EpisodeFile {
	const tracks: { events: EventAtTick[] }[] = [
		{ events: [{ tick: 0, event: tempoMeta(100) }] },
		{
			events: GROOVE_DRUMS.flatMap(([beat, n]) => midiNote(beat, 0.25, n, 9, n === 42 ? 80 : 110))
		},
		{ events: GROOVE_BASS.flatMap(([beat, n]) => midiNote(beat, 0.5, n, 0)) }
	];
	const bytes = encodeMidiFile({
		format: 1,
		division: { kind: 'ppq', ticksPerQuarter: PPQ },
		tracks
	});
	return { name: 'little groove.mid', bytes };
}

/** A quarter-note beat as the step it falls on (a sixteenth per step, step 1 first). */
const stepOf = (beat: number) => Math.round(beat * 4) + 1;

// ─── the episodes ───────────────────────────────────────────────────────────────────────────────

export const EPISODES: readonly Episode[] = [
	{
		id: 'first-jam',
		persona: {
			level: 'beginner',
			temperament: 'vague',
			style: 'do it for me',
			about: 'You play a bit of keyboard and just unboxed the OP-XY.'
		},
		goal: 'You want the OP-XY to play something cool you can jam along to on its keys.',
		wants:
			'A groove plays on the replica, with drums and at least one more part, and you have heard it.',
		opening: 'I just got this. Can you make something cool I can jam over?',
		maxTurns: 5,
		success(o) {
			const fails = playing(o);
			const busy = busyTracks(o);
			if (busy.length < 2) fails.push(`only ${busy.length} track(s) with notes`);
			return fails;
		}
	},
	{
		id: 'brighter-bass',
		persona: { level: 'beginner', temperament: 'patient', style: 'let me do it' },
		goal: 'The bass on track 3 sounds muffled. You want it brighter, and you want to learn to do it yourself on the replica.',
		wants:
			'You turned something yourself and the bass on track 3 is clearly brighter (the screen shows the value that makes it brighter going up).',
		opening: 'how do I make the bass on track 3 brighter? I want to do it myself',
		setup({ virtual }) {
			kick(virtual);
			virtual.writePattern(3, { pattern: 1, bars: 1, notes: BASS });
			virtual.transport('play');
		},
		maxTurns: 6,
		success(o) {
			const fails: string[] = [];
			const from = num(o.start, 't3.cutoff');
			const to = num(o.end, 't3.cutoff');
			if (to < from + 15) fails.push(`track 3's cutoff ${from} → ${to}: not clearly brighter`);
			const moved = userMoved(o, 't3.cutoff');
			if (moved < 15) fails.push(`the user's own turns moved the cutoff by ${moved}`);
			return fails;
		},
		forbidden(o) {
			return agentChanged(o, 't3.cutoff') ? ["the agent set track 3's cutoff itself"] : [];
		}
	},
	{
		id: 'pump',
		persona: { level: 'intermediate', temperament: 'patient', style: 'show me' },
		goal: 'You have a kick on track 1, hats on track 2 and a bass on track 3. You want the bass to pump with the kick, the sidechain feel of dance music, and to see how it is set up.',
		wants: 'The bass ducks with the kick while the beat plays, set up on the replica.',
		opening: 'make the bass pump with the kick',
		setup({ virtual }) {
			kick(virtual);
			virtual.writePattern(2, {
				pattern: 1,
				bars: 1,
				notes: OFFBEATS.map((s) => note(s, 61, 80))
			});
			virtual.writePattern(3, {
				pattern: 1,
				bars: 1,
				notes: [1, 3, 5, 7, 9, 11, 13, 15].map((s) => note(s, 41, 100, 2))
			});
			virtual.setTempo(124);
			virtual.transport('play');
		},
		maxTurns: 5,
		success(o) {
			const fails = playing(o);
			const lfo = o.state.tracks[2].lfo;
			if (lfo.type !== 'duck' || !lfo.on)
				return [...fails, `track 3's LFO is ${lfo.type}, not a duck`];
			if (Math.abs(lfo.amount) < 20) fails.push(`the duck's amount is ${Math.round(lfo.amount)}`);
			if (lfo.source !== 1 && lfo.source !== DUCK_METRONOME) {
				fails.push(`the duck listens to track ${lfo.source}, not the kick (or the metronome)`);
			}
			return fails;
		}
	},
	{
		id: 'kick-lesson',
		persona: { level: 'beginner', temperament: 'patient', style: 'let me do it' },
		goal: 'You want to learn to program a basic four-on-the-floor kick drum yourself, pressing the keys on the replica.',
		wants:
			'You programmed it with your own presses: a kick on every beat of track 1, and you have heard it (or seen the step keys light up).',
		opening: 'teach me to program a 4-on-the-floor kick myself',
		maxTurns: 7,
		success(o) {
			const fails: string[] = [];
			for (const step of FOUR) {
				if (!hitsOn(o, 1, step, KICKS)) fails.push(`no kick on step ${step} of track 1`);
			}
			const stray = notesOf(o, 1).filter((n) => KICKS.includes(n.note) && !FOUR.includes(n.step));
			if (stray.length > 0)
				fails.push(`kicks off the beat too (steps ${stray.map((n) => n.step).join(', ')})`);
			if (!userChanged(o, 't1.notes')) fails.push("the user's own presses put no notes on track 1");
			return fails;
		},
		forbidden(o) {
			return agentChanged(o, 't1.notes') ? ["the agent wrote track 1's notes itself"] : [];
		}
	},
	{
		id: 'snare-roll',
		persona: { level: 'veteran', temperament: 'impatient', style: 'do it for me' },
		goal: "Make track 2's pattern two bars (32 steps) long, keeping its groove, and put a snare roll across its last bar.",
		wants:
			'Track 2 runs 32 steps, its first bar is still your groove, and its second bar ends in a snare roll.',
		opening: "make track 2's pattern 32 steps and put a snare roll in the last bar",
		setup({ virtual }) {
			kick(virtual);
			virtual.writePattern(2, { pattern: 1, bars: 1, notes: T2_GROOVE });
			virtual.transport('play');
		},
		maxTurns: 4,
		success(o) {
			const fails: string[] = [];
			const p = o.virtual.readPattern(2);
			if (p.length !== 32) fails.push(`track 2 plays ${p.length} steps, not 32`);
			const snares = (from: number, to: number) =>
				p.notes.filter((n) => n.step >= from && n.step <= to && SNARES.includes(n.note)).length;
			const roll = snares(17, 32);
			if (roll < 6 || roll < snares(1, 16) + 3) {
				fails.push(`${roll} snare hits in the last bar: no roll`);
			}
			const lost = T2_GROOVE.filter(
				(want) => !p.notes.some((n) => n.step === want.step && n.note === want.note)
			);
			if (lost.length > 1)
				fails.push(`the first bar lost ${lost.length} of its ${T2_GROOVE.length} hits`);
			return fails;
		}
	},
	{
		id: 'song',
		persona: { level: 'intermediate', temperament: 'patient', style: 'do it for me' },
		goal: 'Turn the loop on the replica into a short song: an intro, the groove, a break, and the groove again.',
		wants:
			'The replica plays a song that moves through different sections (an intro, the groove, a break) and comes back to the groove.',
		opening: 'turn this loop into a short song: intro, groove, break, groove',
		setup({ virtual }) {
			kick(virtual, [
				...[5, 13].map((s) => note(s, 55, 100)),
				...OFFBEATS.map((s) => note(s, 61, 75))
			]);
			virtual.writePattern(3, { pattern: 1, bars: 1, notes: BASS });
			virtual.writePattern(7, {
				pattern: 1,
				bars: 1,
				notes: [57, 60, 64].map((n) => note(1, n, 80, 16))
			});
			virtual.setTempo(118);
			virtual.transport('play');
		},
		maxTurns: 5,
		success(o) {
			// the transport may have stopped: a song that does not loop ends by itself
			const fails: string[] = [];
			const { order } = o.virtual.readArrangement().song;
			if (order.length < 4) fails.push(`a song of ${order.length} scene(s), not four sections`);
			const used = [...new Set(order)];
			if (used.length < 3) fails.push(`the song uses ${used.length} different scene(s)`);
			const kinds = new Set(used.map((n) => JSON.stringify(sceneOf(o, n))));
			if (kinds.size < 3) fails.push('fewer than three of its scenes differ from each other');
			const silent = used.filter((n) => soundingIn(o, n).length === 0);
			if (silent.length > 0) fails.push(`scene(s) ${silent.join(', ')} play nothing`);
			// a section comes back when the same music plays twice, as the same scene or a copy of it
			const sections = order.map((n) => JSON.stringify(sceneOf(o, n)));
			if (new Set(sections).size === sections.length && order.length > 0) {
				fails.push('no section comes back (the groove after the break)');
			}
			return fails;
		}
	},
	{
		id: 'warm-pad',
		persona: { level: 'intermediate', temperament: 'patient', style: 'show me' },
		goal: 'Track 4 plays chords with a plucky electric piano; you want it to sound like a slow, warm pad instead, and to see how that is done.',
		wants:
			"Track 4's chords fade in slowly and ring out long after each one, and you saw where that is set.",
		opening: 'track 4 should sound like a slow warm pad',
		setup({ sim, virtual }) {
			virtual.writePattern(4, {
				pattern: 1,
				bars: 2,
				notes: [
					...[60, 64, 67].map((n) => note(1, n, 90, 16)),
					...[57, 60, 64].map((n) => note(17, n, 90, 16))
				]
			});
			playStep(sim, { keys: 'T4' });
			virtual.transport('play');
		},
		maxTurns: 5,
		success(o) {
			const fails: string[] = [];
			const amp = o.state.tracks[3].amp;
			const [attack, release] = [shown(amp.attack), shown(amp.release)];
			const was = {
				attack: num(o.start, 't4.amp.attack'),
				release: num(o.start, 't4.amp.release')
			};
			if (attack < Math.max(30, was.attack + 25)) {
				fails.push(`amp attack ${attack} (was ${was.attack}): no slow fade-in`);
			}
			// a release further left (a lower value) is a longer one on the OP-XY
			if (release > was.release - 15) {
				fails.push(
					`amp release ${release} (was ${was.release}; lower is longer): no longer ring-out`
				);
			}
			return fails;
		}
	},
	{
		id: 'mute-live',
		persona: { level: 'beginner', temperament: 'patient', style: 'let me do it' },
		goal: 'While the beat plays, you want to mute track 2 (the hats) without stopping the music, and learn how, so you can do it live.',
		wants: 'You muted track 2 yourself while the beat kept playing.',
		opening: 'how do I mute track 2 while it plays without stopping?',
		setup({ virtual }) {
			kick(
				virtual,
				[5, 13].map((s) => note(s, 55, 100))
			);
			virtual.writePattern(2, {
				pattern: 1,
				bars: 1,
				notes: [1, 3, 5, 7, 9, 11, 13, 15].map((s) => note(s, 61, 80))
			});
			virtual.transport('play');
		},
		maxTurns: 5,
		success(o) {
			const fails = playing(o);
			if (!o.byUser.some((c) => c.key === 't2.muted' && c.to === true)) {
				fails.push("track 2 was never muted by the user's own presses");
			}
			if (o.byUser.some((c) => c.key === 'playing' && c.to === false)) {
				fails.push("the user's presses stopped the music");
			}
			return fails;
		},
		forbidden(o) {
			return o.byAgent.some((c) => c.key === 't2.muted' && c.to === true)
				? ['the agent muted track 2 itself']
				: [];
		}
	},
	{
		id: 'tempo-swing',
		persona: { level: 'intermediate', temperament: 'impatient', style: 'do it for me' },
		goal: 'Slow the beat down to 90 BPM and give it a swing feel.',
		wants: 'It plays at 90 with a swing (or shuffle) feel.',
		opening: 'slow it to 90 and give it some swing',
		setup({ virtual }) {
			kick(virtual, [
				...[5, 13].map((s) => note(s, 55, 100)),
				...Array.from({ length: 16 }, (_, i) => note(i + 1, 61, i % 2 === 0 ? 85 : 60))
			]);
			virtual.transport('play');
		},
		maxTurns: 4,
		success(o) {
			const fails = [...bpm(o, 90), ...playing(o)];
			const swing = Math.abs(o.state.tempo.swing) >= 5;
			const grooved = o.state.tracks.some(
				(t) => t.engine === 'drum' && currentPattern(t.sequence).groove !== 0
			);
			if (!swing && !grooved) fails.push('no swing: the swing amount and every track groove are 0');
			return fails;
		}
	},
	{
		id: 'midi-file',
		persona: { level: 'intermediate', temperament: 'patient', style: 'do it for me' },
		goal: 'You found a tiny MIDI file of a groove (drums and a bass line) and want it on the replica.',
		wants:
			"The replica has the file's drums and its bass line, at the file's tempo, and you can play it.",
		opening: 'put this on the replica',
		attach: grooveFile,
		maxTurns: 4,
		success(o) {
			const fails = bpm(o, 100, 1);
			const kicks = [0, 2, 4, 6].map(stepOf);
			const snaresAt = [1, 3, 5, 7].map(stepOf);
			const drums = drumTracks(o).filter(
				(t) =>
					kicks.filter((s) => hitsOn(o, t, s, KICKS)).length >= 3 &&
					snaresAt.filter((s) => hitsOn(o, t, s, SNARES)).length >= 3
			);
			if (drums.length === 0) {
				fails.push("no drum track has the file's kicks and snares on their steps");
			}
			const bass = [1, 2, 3, 4, 5, 6, 7, 8]
				.filter((t) => !drumTracks(o).includes(t))
				.filter((t) => {
					const got = notesOf(o, t);
					const found = GROOVE_BASS.filter(([beat, n]) =>
						got.some((g) => g.step === stepOf(beat) && g.note % 12 === n % 12)
					);
					return found.length >= GROOVE_BASS.length - 2;
				});
			if (bass.length === 0) fails.push("no synth track has the file's bass line on its steps");
			// the file's two bars loop as written: a longer pattern rests through part of every loop
			for (const t of [drums[0], bass[0]]) {
				const silent = t === undefined ? [] : silentBars(o, t);
				if (silent.length > 0) {
					fails.push(`track ${t} rests through bar ${silent.join(' and ')} of every loop`);
				}
			}
			return fails;
		}
	},
	{
		id: 'boring',
		persona: { level: 'beginner', temperament: 'vague', style: 'do it for me' },
		goal: 'Your loop sounds boring, but you do not know why or what you want instead.',
		wants: 'It sounds noticeably more interesting than before, and you like what changed.',
		opening: 'it sounds kind of boring',
		setup({ virtual }) {
			kick(virtual);
			virtual.writePattern(3, { pattern: 1, bars: 1, notes: FOUR.map((s) => note(s, 36, 100, 2)) });
			virtual.transport('play');
		},
		maxTurns: 6,
		success(o) {
			const fails = playing(o);
			if (musicChanges(o).length === 0) fails.push('nothing about the music changed');
			if (o.satisfied !== true) fails.push('the user did not come to like a change');
			return fails;
		}
	},
	{
		id: 'impatient-vet',
		persona: {
			level: 'veteran',
			temperament: 'impatient',
			style: 'do it for me',
			about: 'You produce house music and have owned the OP-XY since launch.'
		},
		goal: 'A house beat at 124: a kick on every beat, hats on the offbeats, a clap on 2 and 4. Done in one go, no lecture.',
		wants: 'That beat plays at 124.',
		opening: 'house beat, 124. kick on every quarter, offbeat hats, clap on 2 and 4. go',
		maxTurns: 3,
		success(o) {
			const fails = [...bpm(o, 124), ...playing(o)];
			const on = (steps: readonly number[], keys: readonly number[]) =>
				drumTracks(o).some((t) => steps.every((s) => hitsOn(o, t, s, keys)));
			if (!on(FOUR, KICKS)) fails.push('no kick on every beat');
			if (!on(OFFBEATS, HATS)) fails.push('no hats on the offbeats');
			if (!on([5, 13], SNARES)) fails.push('no clap or snare on 2 and 4');
			return fails;
		}
	}
];
