/**
 * The quality eval's cases (`../quality.ts`): what a user asks, where the replica stands first, and
 * what a good outcome leaves behind. Manual questions come from `quality-docs.json` (facts checked
 * against our units); the rest are written here with checks on the virtual OP-XY.
 */
import type { SampleInput } from '$lib/core/presets';
import type { VirtualOpxy } from '$lib/agent/virtual-opxy';
import { playStep } from '$lib/sim/navigator';
import type { OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { SimState } from '$lib/sim/params';
import docs from './quality-docs.json';

/** A kit make_kit left for the preset maker. */
export interface Draft {
	readonly name: string;
	readonly samples: readonly SampleInput[];
}

/** What a case can look at afterwards. */
export interface Outcome {
	readonly state: SimState;
	readonly sim: OpxySim;
	readonly virtual: VirtualOpxy;
	/** The agent's answer to each turn. */
	readonly answers: readonly string[];
	readonly trace: readonly {
		readonly turn: number;
		readonly name: string;
		readonly input: unknown;
		readonly status: string;
		readonly nested: boolean;
	}[];
	/** Walkthroughs started on the replica: their goals. */
	readonly guided: readonly string[];
	readonly drafts: readonly Draft[];
	/** Notes the browser sounded live (play_notes on the virtual OP-XY), track 1–16. */
	readonly heard: readonly { track: number; note: number; velocity: number; seconds: number }[];
	/** Project names send_project put on the (stand-in) OP-XY. */
	readonly sent: readonly string[];
}

export type Category = 'docs' | 'show' | 'compose' | 'kit' | 'multi' | 'edge' | 'demo';

export interface QualityCase {
	readonly id: string;
	readonly category: Category;
	/** What the user types, turn by turn. */
	readonly turns: readonly string[];
	/** Where the replica stands when the user asks (a new project otherwise). */
	readonly setup?: (sim: OpxySim) => void;
	/** Facts the final answer must state (judged). */
	readonly facts?: readonly string[];
	/** Key combos a good final answer contains (a warning when most are missing). */
	readonly keys?: readonly string[];
	/** For the rubric judge: what a good outcome is, in a sentence. */
	readonly intent?: string;
	/** A docs answer that needs no citation (the manual does not cover it). */
	readonly noCitation?: boolean;
	readonly tools?: {
		readonly must?: readonly string[];
		readonly oneOf?: readonly (readonly string[])[];
		readonly not?: readonly string[];
		readonly max?: number;
	};
	/** Failures in words (empty: passed). */
	readonly check?: (o: Outcome) => string[];
}

// ─── helpers ────────────────────────────────────────────────────────────────────────────────────

const KICKS = [53, 54];
const SNARES = [55, 56, 57, 58];
const HATS = [59, 60, 61, 62, 63];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

const scale = (root: number, steps: readonly number[]) =>
	new Set(steps.map((s) => (root + s) % 12));
const pcs = (notes: readonly number[]) =>
	[...new Set(notes.map((n) => n % 12))].sort((a, b) => a - b);

function notes(o: Outcome, track: number, pattern?: number) {
	return o.virtual.readPattern(track, pattern).notes;
}

function hitsOn(o: Outcome, track: number, step: number, keys: readonly number[]): boolean {
	return notes(o, track).some((n) => n.step === step && keys.includes(n.note));
}

/** Notes of a track outside a scale, as note names. */
function outside(o: Outcome, track: number, allowed: ReadonlySet<number>): number[] {
	return notes(o, track)
		.map((n) => n.note)
		.filter((n) => !allowed.has(n % 12));
}

function playing(o: Outcome): string[] {
	return o.state.transport.playing ? [] : ['not playing'];
}

function bpm(o: Outcome, want: number): string[] {
	return Math.abs(o.state.tempo.bpm - want) <= 1 ? [] : [`tempo ${o.state.tempo.bpm}, not ${want}`];
}

/** The calls the conductor made (not its subagents'). */
function calls(o: Outcome, name: string) {
	return o.trace.filter((t) => !t.nested && t.name === name);
}

/** plan_steps called with show: the steps were animated on the replica. */
function showed(o: Outcome): boolean {
	return (
		calls(o, 'show_on_replica').length > 0 ||
		calls(o, 'plan_steps').some((t) => (t.input as { show?: boolean }).show === true)
	);
}

/** Presses on the simulator, in the key grammar of the navigator's steps. */
function press(sim: OpxySim, ...steps: string[]) {
	for (const keys of steps) playStep(sim, { keys });
}

/** Drum tracks whose keys hold the kit's sounds (made by make_kit, named `name`). */
function kitTracks(o: Outcome, name: string): number[] {
	const tracks = o.state.areas.sample.tracks;
	return tracks
		.map((t, i) => ({ i, held: t.keys.filter((k) => k && k.id.includes(`/${name}/`)).length }))
		.filter((t) => t.held >= 8)
		.map((t) => t.i + 1);
}

// ─── cases ──────────────────────────────────────────────────────────────────────────────────────

interface DocsCase {
	readonly id: string;
	readonly chapter: string;
	readonly question: string;
	readonly facts: readonly string[];
	readonly keys: readonly string[];
	readonly source: string;
}

const DOCS: readonly QualityCase[] = (docs as readonly DocsCase[]).map((d) => ({
	id: d.id,
	category: 'docs' as const,
	turns: [d.question],
	facts: d.facts,
	keys: d.keys,
	noCitation: d.chapter === 'not in manual',
	intent:
		d.chapter === 'not in manual'
			? 'An honest answer: the manual does not cover it or the OP-XY cannot do it; no invented procedure; an alternative if there is one.'
			: `A correct, complete answer from the manual (${d.source}), with the keys to press.`,
	tools: { not: ['transport', 'set_tempo', 'write_pattern', 'set_sound', 'mute_track'] }
}));

const SHOW: readonly QualityCase[] = [
	{
		id: 'show-filter-type',
		category: 'show',
		turns: ['Show me how to change the filter type on track 3.'],
		intent: 'Shows the steps on the replica (track 3, M3, then the filter list) and says them.',
		check(o) {
			const fails: string[] = [];
			if (!showed(o)) fails.push('showed nothing on the replica');
			if (!/M3/.test(o.answers[0] ?? '')) fails.push('the answer does not name M3');
			if (!/shift/.test(o.answers[0] ?? ''))
				fails.push('the answer does not say shift (the list is shift + M3)');
			return fails;
		}
	},
	{
		id: 'show-swing',
		category: 'show',
		turns: ['Where do I set the swing? Take me there on the replica.'],
		intent: 'Takes the replica to the tempo page’s groove setting and says which encoder sets it.',
		check(o) {
			const fails: string[] = [];
			if (!showed(o)) fails.push('showed nothing on the replica');
			if (o.state.overlay !== 'tempo')
				fails.push(`the replica is not on the tempo page (overlay ${o.state.overlay})`);
			return fails;
		}
	},
	{
		id: 'show-lost',
		category: 'show',
		turns: [
			'help, I pressed a bunch of stuff and I have no idea where I am now. how do I get back to playing track 1?'
		],
		setup: (sim) => press(sim, 'com', 'M1'),
		intent:
			'Reads the screen first, says where the user is (the system settings), and how to get back.',
		tools: { must: ['read_screen'] },
		check(o) {
			const fails: string[] = [];
			if (!/instrument|T1/.test(o.answers[0] ?? '')) fails.push('does not say instrument / T1');
			return fails;
		}
	},
	{
		id: 'show-this-page',
		category: 'show',
		turns: ['what am I looking at right now?'],
		setup: (sim) => press(sim, 'T4', 'M2'),
		intent: 'Reads the screen and explains the page it shows (track 4’s envelopes), briefly.',
		tools: { must: ['read_screen'] },
		check(o) {
			const fails: string[] = [];
			if (!/envelope/i.test(o.answers[0] ?? '')) fails.push('does not say envelope');
			return fails;
		}
	}
];

const COMPOSE: readonly QualityCase[] = [
	{
		id: 'boom-bap',
		category: 'compose',
		turns: ['make me a boom bap beat on track 1 at 88 bpm, a bit lazy, and play it'],
		intent: 'A boom bap groove (kick on 1, snares on 2 and 4, hats), 88 BPM, some swing, playing.',
		check(o) {
			const fails = [...bpm(o, 88), ...playing(o)];
			if (o.state.tempo.swing === 0) fails.push('no swing for "a bit lazy"');
			if (!hitsOn(o, 1, 1, KICKS)) fails.push('no kick on step 1');
			for (const step of [5, 13])
				if (!hitsOn(o, 1, step, SNARES)) fails.push(`no snare on step ${step}`);
			if (notes(o, 1).filter((n) => HATS.includes(n.note)).length < 4)
				fails.push('fewer than 4 hats');
			return fails;
		}
	},
	{
		id: 'techno',
		category: 'compose',
		turns: [
			'Give me a driving techno groove: a four-on-the-floor kick on track 1 and a 16th-note bassline in F minor on track 3, one bar each. Play it.'
		],
		intent: 'Kick on every beat; a busy F minor bassline on track 3; a techno tempo; playing.',
		check(o) {
			const fails = playing(o);
			const tempo = o.state.tempo.bpm;
			if (tempo < 125 || tempo > 140) fails.push(`tempo ${tempo}: not a driving techno tempo`);
			for (const step of [1, 5, 9, 13])
				if (!hitsOn(o, 1, step, KICKS)) fails.push(`no kick on step ${step}`);
			const bass = notes(o, 3);
			if (bass.length < 8) fails.push(`only ${bass.length} bass notes`);
			const off = outside(o, 3, scale(5, MINOR));
			if (off.length) fails.push(`bass notes outside F minor: ${off.join(', ')}`);
			return fails;
		}
	},
	{
		id: 'chords-melody',
		category: 'compose',
		turns: [
			'On track 7 play the chords D, A, Bm, G, one per bar over four bars, held. Put a simple melody over it on track 5 that stays in D major. Then start playback.'
		],
		intent: 'The four chords on track 7 (one a bar), a D major melody on track 5, playing.',
		check(o) {
			const fails = playing(o);
			const want: [number, number[]][] = [
				[1, [2, 6, 9]],
				[17, [1, 4, 9]],
				[33, [2, 6, 11]],
				[49, [2, 7, 11]]
			];
			for (const [step, classes] of want) {
				const got = pcs(
					notes(o, 7)
						.filter((n) => n.step === step)
						.map((n) => n.note)
				);
				if (got.join() !== [...classes].sort((a, b) => a - b).join())
					fails.push(
						`track 7 step ${step}: ${got.join(',') || 'nothing'} not ${classes.join(',')}`
					);
			}
			const melody = notes(o, 5);
			if (melody.length < 6) fails.push(`melody of ${melody.length} notes`);
			const off = outside(o, 5, scale(2, MAJOR));
			if (off.length) fails.push(`melody notes outside D major: ${off.join(', ')}`);
			return fails;
		}
	},
	{
		id: 'fill',
		category: 'compose',
		turns: [
			'Program a four-bar drum pattern on track 1: a straight rock beat for three bars, then a snare fill in the last bar. Play it.'
		],
		intent: 'Four bars; bars 1–3 a rock beat; bar 4 full of snare hits; playing.',
		check(o) {
			const fails = playing(o);
			const p = o.virtual.readPattern(1);
			if (p.bars !== 4) fails.push(`${p.bars} bars, not 4`);
			for (const bar of [0, 1, 2])
				if (!hitsOn(o, 1, 1 + 16 * bar, KICKS))
					fails.push(`bar ${bar + 1}: no kick on its first step`);
			const fill = p.notes.filter((n) => n.step > 48 && SNARES.includes(n.note)).length;
			if (fill < 5) fails.push(`only ${fill} snare hits in bar 4`);
			return fails;
		}
	},
	{
		id: 'lofi-loop',
		category: 'compose',
		turns: ['make a chill lofi loop at 80 bpm, drums bass and some jazzy chords, and play it'],
		intent: 'Drums, a bassline and chords with sevenths (jazzy) on three tracks, 80 BPM, playing.',
		check(o) {
			const fails = [...bpm(o, 80), ...playing(o)];
			const busy = [1, 2, 3, 4, 5, 6, 7, 8].filter((t) => notes(o, t).length > 0);
			if (busy.length < 3) fails.push(`only ${busy.length} tracks with notes`);
			const chordal = busy.some((t) => {
				const byStep = new Map<number, number>();
				for (const n of notes(o, t)) byStep.set(n.step, (byStep.get(n.step) ?? 0) + 1);
				return [...byStep.values()].some((k) => k >= 4);
			});
			if (!chordal) fails.push('no chord of four or more notes (a seventh chord)');
			return fails;
		}
	},
	{
		id: 'scale-live',
		category: 'compose',
		turns: ['play me a c minor pentatonic scale up and down on the epiano, one octave'],
		intent:
			'Plays C minor pentatonic (C Eb F G Bb C) up and back down, live, on the epiano (track 4).',
		tools: { must: ['play_notes'], not: ['write_pattern'] },
		check(o) {
			const fails: string[] = [];
			const numeric = o.heard.map((h) => h.note);
			if (numeric.length < 10) fails.push(`${numeric.length} notes played`);
			const off = numeric.filter((n) => ![0, 3, 5, 7, 10].includes(((n % 12) + 12) % 12));
			if (off.length) fails.push(`notes outside C minor pentatonic: ${off.join(', ')}`);
			const top = numeric.indexOf(Math.max(...numeric));
			const up = numeric.slice(0, top + 1).every((n, i, a) => i === 0 || n > a[i - 1]);
			const down = numeric.slice(top).every((n, i, a) => i === 0 || n < a[i - 1]);
			if (!up || !down) fails.push('not straight up then down');
			const tracks = [...new Set(o.heard.map((h) => h.track))];
			if (tracks.join() !== '4')
				fails.push(`played on track ${tracks.join(', ')}, not the epiano's track 4`);
			return fails;
		}
	},
	{
		id: 'song-3',
		category: 'compose',
		turns: [
			'Build a short song: scene 1 is just drums on track 1, scene 2 adds a bassline on track 3, scene 3 is the bassline alone. The song goes 1, 2, 2, 3 and loops. Play it.'
		],
		intent: 'Three scenes as described, the song 1 2 2 3 looping, playing.',
		check(o) {
			const fails = playing(o);
			const a = o.virtual.readArrangement();
			const scene = (n: number) => a.scenes.find((s) => s.scene === n);
			const has = (n: number, track: number) => {
				const s = scene(n);
				if (!s) return false;
				const p = o.virtual.readPattern(track, s.patterns[track - 1]);
				return p.notes.length > 0 && !(s as { muted?: boolean[] }).muted?.[track - 1];
			};
			if (!scene(1) || !scene(2) || !scene(3)) return [...fails, 'scenes 1–3 are not all set'];
			if (!has(1, 1) || has(1, 3)) fails.push('scene 1 is not drums only');
			if (!has(2, 1) || !has(2, 3)) fails.push('scene 2 lacks drums or bass');
			if (!has(3, 3)) fails.push('scene 3 lacks the bass');
			if (a.song.order.join() !== '1,2,2,3') fails.push(`song order ${a.song.order.join()}`);
			if (!a.song.loop) fails.push('the song does not loop');
			return fails;
		}
	}
];

const KIT: readonly QualityCase[] = [
	{
		id: 'kit-play',
		category: 'kit',
		turns: [
			'make a punchy 909 style kit called "punch" and play a house beat with it on the replica'
		],
		intent:
			'Makes the kit, puts it on a drum track of the replica, programs a house beat there and plays it.',
		tools: { must: ['make_kit', 'write_pattern'] },
		check(o) {
			const fails = playing(o);
			const on = kitTracks(o, 'punch');
			if (on.length === 0) return [...fails, 'the kit is on no drum track of the replica'];
			const t = on[0];
			for (const step of [1, 5, 9, 13])
				if (!hitsOn(o, t, step, KICKS)) fails.push(`no kick on step ${step} of track ${t}`);
			return fails;
		}
	},
	{
		id: 'kit-lofi',
		category: 'kit',
		turns: [
			'can you make a dusty lo-fi kit, put it on track 2, and give me a slow boom bap on it at 85?'
		],
		intent: 'A lo-fi kit loaded on track 2, a boom bap pattern on track 2, 85 BPM, playing.',
		tools: { must: ['make_kit'] },
		check(o) {
			const fails = [...bpm(o, 85), ...playing(o)];
			const kit = o.drafts.at(-1);
			if (!kit) return [...fails, 'no kit made'];
			if (!kitTracks(o, kit.name).includes(2)) fails.push('the kit is not on track 2');
			if (!hitsOn(o, 2, 1, KICKS)) fails.push('no kick on step 1 of track 2');
			for (const step of [5, 13])
				if (!hitsOn(o, 2, step, SNARES)) fails.push(`no snare on step ${step} of track 2`);
			return fails;
		}
	}
];

const MULTI: readonly QualityCase[] = [
	{
		id: 'busier-hats',
		category: 'multi',
		turns: [
			'program a simple house beat on track 1 and play it',
			'make the hats busier, 16ths',
			'and bring the tempo down to 118'
		],
		intent: 'A house beat, then 16th hats, then 118 BPM, still playing, the kick kept.',
		check(o) {
			const fails = [...bpm(o, 118), ...playing(o)];
			for (const step of [1, 5, 9, 13])
				if (!hitsOn(o, 1, step, KICKS)) fails.push(`the kick left step ${step}`);
			const hatSteps = new Set(
				notes(o, 1)
					.filter((n) => HATS.includes(n.note))
					.map((n) => (n.step - 1) % 16)
			);
			if (hatSteps.size < 12) fails.push(`hats on ${hatSteps.size} of 16 steps`);
			return fails;
		}
	},
	{
		id: 'what-then-show',
		category: 'multi',
		turns: ['what does the player key do?', 'ok show me'],
		intent: 'Explains the players, then shows them on the replica.',
		check(o) {
			const fails: string[] = [];
			const shownLater = o.trace.some(
				(t) =>
					!t.nested &&
					t.turn === 1 &&
					(t.name === 'show_on_replica' ||
						(t.name === 'plan_steps' && (t.input as { show?: boolean }).show))
			);
			if (!shownLater) fails.push('did not show it on the replica after "show me"');
			return fails;
		}
	},
	{
		id: 'put-it-back',
		category: 'multi',
		turns: ["set track 3's filter cutoff to 20 on the replica", 'hmm, put it back how it was'],
		intent: 'Sets the cutoff to 20, then back to the value it had before.',
		check(o) {
			const now = o.state.tracks[2].filter.cutoff;
			return Math.abs(now - 0) <= 1 ? [] : [`cutoff ${now.toFixed(1)}, not back at 0`];
		}
	},
	{
		id: 'arp-direction',
		category: 'multi',
		turns: ['how do I turn on the arpeggiator?', 'can it go down instead of up?'],
		facts: [
			'Yes: the arpeggio’s pattern, on E2 of the player page, sets the note order, and down is one of its choices.'
		],
		intent: 'Answers the follow-up about the same arpeggio: E2 (pattern) picks down.'
	}
];

const EDGE: readonly QualityCase[] = [
	{
		id: 'firmware',
		category: 'edge',
		turns: ['can you update my op-xy to the newest firmware for me?'],
		intent:
			'Says it cannot touch firmware, and how the user updates it themselves (TE’s updater); short.',
		tools: {
			not: ['transport', 'set_tempo', 'set_sound', 'select_track', 'mute_track', 'play_notes']
		}
	},
	{
		id: 'vague',
		category: 'edge',
		turns: ['make it sound better'],
		intent:
			'Nothing is playing and nothing was made yet: asks one focused question or offers two or three concrete directions; short.',
		tools: { not: ['set_sound', 'write_pattern', 'transport'] }
	},
	{
		id: 'delete-projects',
		category: 'edge',
		turns: ['delete all the projects on my op-xy'],
		intent:
			'Says it cannot delete files on the device; says how the user can do it on the unit, if the manual says so; short.',
		tools: { max: 2 }
	}
];

/** The demo video's moments, as said on camera: rehearsed with --category demo --repeat n. */
const DEMO: readonly QualityCase[] = [
	{
		id: 'demo-shift-m1',
		category: 'demo',
		turns: ['what does shift + M1 do?'],
		facts: [
			'On OS 1.1.33 shift + M1 opens the preset browser for the selected track.',
			'Loading a preset (or an engine, which loads as one of its presets) replaces the track’s whole sound.'
		],
		intent: 'A short, exact answer with the key combo, from the manual.'
	},
	{
		id: 'demo-chord',
		category: 'demo',
		turns: ['can the op-xy play a whole chord from one key?'],
		facts: [
			'Yes, with the maestro player: shift + player opens the player list, where maestro is picked.',
			'A chord is stored by holding shift and playing its notes; then each single key plays that chord.'
		],
		intent: 'A firm yes, the maestro player and the keys to set it up.'
	},
	{
		id: 'demo-walkthrough',
		category: 'demo',
		turns: ['walk me through setting the filter cutoff on track 3'],
		intent:
			'Starts a lit walkthrough on the replica (T3, M3, turn E1) and tells the user to follow the lit keys.',
		check(o) {
			return o.guided.length > 0 ? [] : ['started no walkthrough on the replica'];
		}
	},
	{
		id: 'demo-kit',
		category: 'demo',
		turns: ['make a punchy 909 kit and play a house beat with it'],
		intent: 'Makes the kit, puts it on a drum track of the replica, a house beat there, playing.',
		tools: { must: ['make_kit', 'write_pattern'] },
		check(o) {
			const fails = playing(o);
			const kit = o.drafts.at(-1);
			if (!kit) return [...fails, 'no kit made'];
			const on = kitTracks(o, kit.name);
			if (on.length === 0) return [...fails, 'the kit is on no drum track of the replica'];
			for (const step of [1, 5, 9, 13])
				if (!hitsOn(o, on[0], step, KICKS)) fails.push(`no kick on step ${step}`);
			return fails;
		}
	},
	{
		id: 'demo-dark',
		category: 'demo',
		turns: ['why does track 3 sound so dark?'],
		facts: [
			'Track 3’s filter is on with its cutoff all the way down (00), which lets only the lowest part of the sound through.',
			'Turning the cutoff up on the filter page (T3, M3, turn E1) opens it up.'
		],
		intent:
			'Reads the track’s sound and explains the darkness from its real settings, with the keys to fix it.',
		tools: { must: ['read_sound'] }
	},
	{
		id: 'demo-pump',
		category: 'demo',
		turns: ['make the bass pump with the kick'],
		intent:
			'Sets up a duck on the bass track (the LFO as duck, triggered by the kick track) on the replica, and says what it did.',
		check(o) {
			const bass = o.state.tracks[2];
			return bass.lfo.on && bass.lfo.type === 'duck' ? [] : ['track 3 has no duck LFO'];
		}
	},
	{
		id: 'demo-send',
		category: 'demo',
		turns: [
			'build a little house loop and play it',
			'love it. put it on my op-xy',
			'ok, it is in mtp mode now'
		],
		intent:
			'Builds and plays a house loop; asked to put it on the OP-XY, first asks for MTP mode (com → M4); once the user says it is, sends it as a new project and says how to open it on the device.',
		check(o) {
			const fails = playing(o);
			const early = o.trace.filter((t) => !t.nested && t.name === 'send_project' && t.turn < 2);
			if (early.length) fails.push('sent the project before the OP-XY was in MTP mode');
			if (o.sent.length !== 1) fails.push(`${o.sent.length} projects sent, not 1`);
			return fails;
		}
	}
];

export const QUALITY_CASES: readonly QualityCase[] = [
	...DOCS,
	...SHOW,
	...COMPOSE,
	...KIT,
	...MULTI,
	...EDGE,
	...DEMO
];
