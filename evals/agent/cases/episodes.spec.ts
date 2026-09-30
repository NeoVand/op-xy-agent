// The episodes' checks, on replicas set by hand: each passes the outcome it asks for and fails the
// near misses, and a user who wanted to learn fails when the agent did it for them. The changes are
// attributed as the eval does it: a summary of the replica around each hand's work.
import { describe, expect, it } from 'vitest';
import type { VirtualOpxy } from '$lib/agent/virtual-opxy';
import { createVirtualOpxy } from '$lib/app/virtual';
import { readMidiFile } from '$lib/core/midi/smf';
import { playStep } from '$lib/sim/navigator';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { DUCK_METRONOME } from '$lib/sim/params';
import { diffSummaries, summarizeReplica, type Change } from '../changes';
import { EPISODES, GROOVE_BASS, grooveFile, type Episode, type EpisodeOutcome } from './episodes';

const episode = (id: string): Episode => {
	const found = EPISODES.find((e) => e.id === id);
	if (!found) throw new Error(`no episode ${id}`);
	return found;
};

/** A key press, or a turn with its detents, as the navigator plays it. */
type Press = string | readonly [string, number];

/** An episode's replica after its setup, and hands to change it: the user's or the agent's. */
function world(id: string) {
	const e = episode(id);
	const sim = new OpxySim();
	const virtual = createVirtualOpxy({ sim });
	e.setup?.({ sim, virtual });
	const start = summarizeReplica(sim, virtual);
	const byUser: Change[] = [];
	const byAgent: Change[] = [];
	const act = (into: Change[], work: () => void) => {
		const before = summarizeReplica(sim, virtual);
		work();
		into.push(...diffSummaries(before, summarizeReplica(sim, virtual)));
	};
	const presses =
		(...steps: Press[]) =>
		() => {
			for (const step of steps) {
				if (typeof step === 'string') playStep(sim, { keys: step });
				else playStep(sim, { keys: step[0], clicks: step[1] });
			}
		};
	return {
		sim,
		virtual,
		user: (...steps: Press[]) => act(byUser, presses(...steps)),
		agent: (work: (v: VirtualOpxy) => void) => act(byAgent, () => work(virtual)),
		agentPresses: (...steps: Press[]) => act(byAgent, presses(...steps)),
		check(satisfied: boolean | null = true) {
			const o: EpisodeOutcome = {
				state: sim.state,
				virtual,
				start,
				end: summarizeReplica(sim, virtual),
				byUser,
				byAgent,
				trace: [],
				satisfied,
				turns: 2
			};
			return { fails: e.success(o), forbidden: e.forbidden?.(o) ?? [] };
		}
	};
}

const hit = (step: number, note: number, length = 1) => ({ step, note, velocity: 100, length });

describe('the episodes', () => {
	it('are a dozen owners across every level, temperament and way of learning', () => {
		expect(EPISODES.length).toBeGreaterThanOrEqual(12);
		expect(new Set(EPISODES.map((e) => e.id)).size).toBe(EPISODES.length);
		for (const trait of ['level', 'temperament', 'style'] as const) {
			const seen = new Set(EPISODES.map((e) => e.persona[trait]));
			expect(seen.size, trait).toBe(3);
		}
		for (const e of EPISODES) {
			expect(e.opening.trim().length, e.id).toBeGreaterThan(5);
			expect(e.goal.trim().length, e.id).toBeGreaterThan(20);
			expect(e.wants.trim().length, e.id).toBeGreaterThan(10);
			expect(e.maxTurns, e.id).toBeGreaterThanOrEqual(2);
			expect(e.maxTurns, e.id).toBeLessThanOrEqual(8);
		}
	});

	it('fail on a replica nobody touched', () => {
		for (const e of EPISODES) expect(world(e.id).check().fails, e.id).not.toEqual([]);
	});
});

describe('checks on hand-made outcomes', () => {
	it('first-jam: a groove of two parts, playing', () => {
		const w = world('first-jam');
		w.agent((v) => {
			v.writePattern(1, { pattern: 1, bars: 1, notes: [1, 5, 9, 13].map((s) => hit(s, 53)) });
			v.transport('play');
		});
		expect(w.check().fails).toEqual(['only 1 track(s) with notes']);
		w.agent((v) => v.writePattern(3, { pattern: 1, bars: 1, notes: [hit(1, 41, 4)] }));
		expect(w.check().fails).toEqual([]);
	});

	it("brighter-bass: the user's own turns open the cutoff; the agent may not", () => {
		const mine = world('brighter-bass');
		mine.user('T3', 'M3', ['turn E1', 20]);
		expect(mine.check()).toEqual({ fails: [], forbidden: [] });

		const done = world('brighter-bass');
		done.agentPresses('T3', 'M3', ['turn E1', 40]);
		const result = done.check();
		expect(result.fails).toEqual(["the user's own turns moved the cutoff by 0"]);
		expect(result.forbidden).toEqual(["the agent set track 3's cutoff itself"]);

		const timid = world('brighter-bass');
		timid.user('T3', 'M3', ['turn E1', 6]);
		expect(timid.check().fails[0]).toMatch(/^track 3's cutoff 0 → 6: not clearly brighter/);
	});

	it('pump: a duck on the bass that listens to the kick or the metronome', () => {
		const w = world('pump');
		const duck = (amount: number, source: number) =>
			w.agent(() =>
				Object.assign(w.sim.state.tracks[2].lfo, { type: 'duck', on: true, amount, source })
			);
		duck(0, 1);
		expect(w.check().fails).toEqual(["the duck's amount is 0"]);
		duck(60, 2);
		expect(w.check().fails).toEqual([
			'the duck listens to track 2, not the kick (or the metronome)'
		]);
		duck(60, DUCK_METRONOME);
		expect(w.check().fails).toEqual([]);
	});

	it("kick-lesson: four kicks from the user's own presses, none off the beat", () => {
		const w = world('kick-lesson');
		w.user('T1', 'step 1', 'step 5', 'step 9');
		expect(w.check().fails).toEqual(['no kick on step 13 of track 1']);
		w.user('step 13', 'step 3');
		expect(w.check().fails).toEqual(['kicks off the beat too (steps 3)']);
		w.user('step 3');
		expect(w.check()).toEqual({ fails: [], forbidden: [] });

		const done = world('kick-lesson');
		done.agent((v) =>
			v.writePattern(1, { pattern: 1, bars: 1, notes: [1, 5, 9, 13].map((s) => hit(s, 53)) })
		);
		expect(done.check()).toEqual({
			fails: ["the user's own presses put no notes on track 1"],
			forbidden: ["the agent wrote track 1's notes itself"]
		});
	});

	it('snare-roll: 32 steps, the first bar kept, a roll in the second', () => {
		const w = world('snare-roll');
		const groove = w.virtual.readPattern(2).notes.map((n) => hit(n.step, n.note));
		w.agent((v) =>
			v.writePattern(2, {
				pattern: 1,
				bars: 2,
				notes: [...groove, ...groove.map((n) => hit(n.step + 16, n.note))]
			})
		);
		expect(w.check().fails).toEqual(['2 snare hits in the last bar: no roll']);
		w.agent((v) =>
			v.writePattern(2, {
				pattern: 1,
				bars: 2,
				notes: [...groove, ...[21, 25, 27, 29, 30, 31, 32].map((s) => hit(s, 55))]
			})
		);
		expect(w.check().fails).toEqual([]);
		w.agent((v) => v.writePattern(2, { pattern: 1, bars: 1, notes: [] }));
		expect(w.check().fails).toEqual([
			'track 2 plays 16 steps, not 32',
			'0 snare hits in the last bar: no roll',
			'the first bar lost 6 of its 6 hits'
		]);
	});

	it('song: three different sections that all sound, and the groove comes back', () => {
		const w = world('song');
		w.agent((v) => {
			v.writePattern(1, { pattern: 2, bars: 1, notes: [1, 5, 9, 13].map((s) => hit(s, 53)) });
			v.writePattern(1, { pattern: 1, bars: 1, notes: v.readPattern(1, 1).notes });
			v.writeArrangement({
				scenes: [
					{ scene: 1, patterns: [{ track: 1, pattern: 2 }] },
					{ scene: 2, patterns: [{ track: 1, pattern: 1 }] },
					{ scene: 3, patterns: [{ track: 1, pattern: 3 }] }
				],
				song: { order: [1, 2, 3], loop: true }
			});
		});
		expect(w.check().fails).toEqual([
			'a song of 3 scene(s), not four sections',
			'no section comes back (the groove after the break)'
		]);
		w.agent((v) => v.writeArrangement({ song: { order: [1, 2, 3, 2], loop: true } }));
		expect(w.check().fails).toEqual([]);
		// the groove again as a scene of its own, a copy of scene 2: it comes back all the same
		w.agent((v) =>
			v.writeArrangement({
				scenes: [{ scene: 4, patterns: [{ track: 1, pattern: 1 }] }],
				song: { order: [1, 2, 3, 4], loop: false }
			})
		);
		expect(w.check().fails).toEqual([]);
		w.agent((v) => v.writeArrangement({ song: { order: [1, 1, 2, 2], loop: true } }));
		expect(w.check().fails).toEqual([
			'the song uses 2 different scene(s)',
			'fewer than three of its scenes differ from each other'
		]);
	});

	it('warm-pad: a slow attack and a longer release (a lower value)', () => {
		const w = world('warm-pad');
		w.agent(() => Object.assign(w.sim.state.tracks[3].amp, { attack: 50 }));
		expect(w.check().fails).toEqual([
			'amp release 69 (was 69; lower is longer): no longer ring-out'
		]);
		w.agent(() => Object.assign(w.sim.state.tracks[3].amp, { release: 30 }));
		expect(w.check().fails).toEqual([]);
	});

	it('mute-live: the user mutes track 2 and the music plays on', () => {
		const w = world('mute-live');
		w.user('mix', 'shift + T2');
		expect(w.check()).toEqual({ fails: [], forbidden: [] });
		w.user('stop');
		expect(w.check().fails).toEqual([
			'nothing plays at the end',
			"the user's presses stopped the music"
		]);

		const done = world('mute-live');
		done.agent((v) => v.setMuted(2, true));
		expect(done.check()).toEqual({
			fails: ["track 2 was never muted by the user's own presses"],
			forbidden: ['the agent muted track 2 itself']
		});
	});

	it('tempo-swing: 90 BPM and a swing, from the tempo page or a track groove', () => {
		const w = world('tempo-swing');
		w.agent((v) => v.setTempo(90));
		expect(w.check().fails).toEqual(['no swing: the swing amount and every track groove are 0']);
		w.agent(() => (w.sim.state.tempo.swing = 30));
		expect(w.check().fails).toEqual([]);
	});

	it("midi-file: the file's kicks, snares and bass line on their steps, looping as written", () => {
		const file = readMidiFile(grooveFile().bytes);
		expect(file.tracks).toHaveLength(3);
		const drums = [1, 9, 17, 25]
			.map((s) => hit(s, 53))
			.concat([5, 13, 21, 29].map((s) => hit(s, 55)));
		// an octave up is the same line
		const bass = GROOVE_BASS.map(([beat, n]) => hit(Math.round(beat * 4) + 1, n + 12, 2));
		const w = world('midi-file');
		w.agent((v) => {
			v.setTempo(100);
			v.writePattern(1, { pattern: 1, bars: 2, notes: drums });
		});
		expect(w.check().fails).toEqual(["no synth track has the file's bass line on its steps"]);
		w.agent((v) => v.writePattern(3, { pattern: 1, bars: 2, notes: bass }));
		expect(w.check().fails).toEqual([]);
		// the same two bars in four-bar patterns: half of every loop is silence
		w.agent((v) => {
			v.writePattern(1, { pattern: 1, bars: 4, notes: drums });
			v.writePattern(3, { pattern: 1, bars: 4, notes: bass });
		});
		expect(w.check().fails).toEqual([
			'track 1 rests through bar 3 and 4 of every loop',
			'track 3 rests through bar 3 and 4 of every loop'
		]);
	});

	it('boring: something about the music changes, and the user likes it', () => {
		const w = world('boring');
		expect(w.check().fails).toEqual(['nothing about the music changed']);
		w.agent((v) =>
			v.writePattern(2, { pattern: 1, bars: 1, notes: [3, 7, 11, 15].map((s) => hit(s, 61)) })
		);
		expect(w.check(true).fails).toEqual([]);
		expect(w.check(false).fails).toEqual(['the user did not come to like a change']);
		expect(w.check(null).fails).toEqual(['the user did not come to like a change']);
	});

	it('impatient-vet: kick, offbeat hats and a clap at 124, playing', () => {
		const w = world('impatient-vet');
		w.agent((v) => {
			v.setTempo(124);
			v.writePattern(1, {
				pattern: 1,
				bars: 1,
				notes: [1, 5, 9, 13].map((s) => hit(s, 53)).concat([3, 7, 11, 15].map((s) => hit(s, 61)))
			});
			v.transport('play');
		});
		expect(w.check().fails).toEqual(['no clap or snare on 2 and 4']);
		w.agent((v) =>
			v.writePattern(2, { pattern: 1, bars: 1, notes: [5, 13].map((s) => hit(s, 58)) })
		);
		expect(w.check().fails).toEqual([]);
	});
});

describe('the change summaries', () => {
	it('read like the device, and leave out where the user is on it', () => {
		const sim = new OpxySim();
		const virtual = createVirtualOpxy({ sim });
		const before = summarizeReplica(sim, virtual);
		expect(before).toMatchObject({
			tempo: 120,
			playing: false,
			't3.cutoff': 0,
			't1.notes': 'none'
		});
		playStep(sim, { keys: 'T3' });
		playStep(sim, { keys: 'M3' });
		expect(diffSummaries(before, summarizeReplica(sim, virtual))).toEqual([]);
		playStep(sim, { keys: 'turn E1', clicks: 12 });
		virtual.writePattern(1, { pattern: 1, bars: 1, notes: [hit(1, 53), hit(5, 53)] });
		expect(diffSummaries(before, summarizeReplica(sim, virtual))).toEqual([
			{ key: 't1.notes', from: 'none', to: '1:53 5:53' },
			{ key: 't3.cutoff', from: 0, to: 12 }
		]);
	});
});
