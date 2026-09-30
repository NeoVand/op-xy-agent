// The simulated user's hands and eyes: a combo with counts reads as the key grammar plus each
// turn's clicks; it plays on a replica wired to a simulator as in the app, as pointer input, one
// event at a time; and what a person sees afterwards is the screen, the sound, the lit keys and
// the walkthrough's marks, never the simulator's state.
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import { ReplicaState, type ReplicaEvent } from '$lib/replica';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { shown } from '$lib/sim/params';
import type { SummaryData } from '$lib/core/listen';
import {
	heardInWords,
	litKeys,
	markedControls,
	parseUserKeys,
	playUserKeys,
	userView,
	type UserKeys
} from './hands';

function setup() {
	const sim = new OpxySim();
	const replica = new ReplicaState();
	replica.observe((event) => sim.input(event));
	const events: string[] = [];
	replica.subscribe((e: ReplicaEvent) => events.push(`${e.type} ${e.id} ${e.source}`));
	return { sim, replica, events };
}

function keys(text: string): UserKeys {
	const parsed = parseUserKeys(text);
	if (!parsed.ok) throw new Error(parsed.error);
	return parsed.value;
}

describe('parseUserKeys', () => {
	it('reads the count after a turn: signed, in words, or none for a single click', () => {
		expect(keys('turn E1 +5').clicks).toEqual([5]);
		expect(keys('turn E2 -3').clicks).toEqual([-3]);
		expect(keys('turn E1 5 clicks').clicks).toEqual([5]);
		expect(keys('turn E1 x4').clicks).toEqual([4]);
		expect(keys('turn E3 counter-clockwise 2').clicks).toEqual([-2]);
		expect(keys('turn E1 + 12').clicks).toEqual([12]);
		const bare = keys('turn E1');
		expect(bare.clicks).toEqual([1]);
		expect(bare.uncounted).toBe(1);
	});

	it('keeps a count per chord, spelled after its turn as the grammar spells the rest', () => {
		const walk = keys('T3 → M3 → turn E1 +40');
		expect(walk.clicks).toEqual([null, null, 40]);
		expect(walk.text).toBe('T3 → M3 → turn E1 +40');
		expect(keys('step 5 + turn E2 -3').text).toBe('step 5 + turn E2 -3');
		expect(keys('shift + player -> + turn E1 2').text).toBe('shift + player → + turn E1 +2');
		expect(keys('`Shift + m1`').text).toBe('shift + M1');
	});

	it('refuses what one hand cannot press, saying why', () => {
		const error = (text: string) => {
			const parsed = parseUserKeys(text);
			return parsed.ok ? null : parsed.error;
		};
		expect(error('Tn')).toMatch(/more than one key/);
		expect(error('[-]/[+]')).toMatch(/more than one key/);
		expect(error('E1')).toMatch(/encoder/);
		expect(error('turn E1 +5 + M1')).toMatch(/after the turn/);
		expect(error('turn E1 +0')).toMatch(/at least one click/);
		expect(error('turn E1 -5 clockwise')).toMatch(/disagree/);
		expect(error('turn E1 +500')).toMatch(/more than any encoder/);
		expect(error('M9')).toMatch(/unknown control/);
		expect(error('power')).toMatch(/power switch/);
		expect(error('  ')).toBe('no keys given');
	});
});

describe('playUserKeys', () => {
	it("turns an encoder one detent per click, as the user's pointer", async () => {
		const { sim, replica, events } = setup();
		await playUserKeys(replica, keys('T3 → M3 → turn E1 +5'));
		expect(shown(sim.state.tracks[2].filter.cutoff)).toBe(5);
		expect(events.filter((e) => e.startsWith('turn encoder.1'))).toHaveLength(5);
		expect(events.every((e) => e.endsWith(' pointer'))).toBe(true);
		expect(replica.pressed).toEqual([]);
		await playUserKeys(replica, keys('turn E1 -2'));
		expect(shown(sim.state.tracks[2].filter.cutoff)).toBe(3);
	});

	it('holds the keys of a chord while the last is pressed, and lets them go after', async () => {
		const { replica, events } = setup();
		await playUserKeys(replica, keys('shift + M1'));
		expect(events).toEqual([
			'press key.shift pointer',
			'press key.m1 pointer',
			'release key.m1 pointer',
			'release key.shift pointer'
		]);
	});

	it('keeps held keys down into the next chord with → +', async () => {
		const { replica, events } = setup();
		await playUserKeys(replica, keys('shift + player → + turn E1 2'));
		expect(events).toEqual([
			'press key.shift pointer',
			'press key.player pointer',
			'release key.player pointer',
			'turn encoder.1 pointer',
			'turn encoder.1 pointer',
			'release key.shift pointer'
		]);
	});

	it('shows what the replica shows while a key is held: shift in mix lights the unmuted tracks', async () => {
		const { sim, replica } = setup();
		await playUserKeys(replica, keys('mix → shift + T2'));
		expect(sim.state.tracks[1].mix.muted).toBe(true);
		const during: string[] = [];
		await playUserKeys(replica, keys('hold shift'), {
			wait: async () => {},
			whileHeld: () => void during.push(userView({ sim, replica }))
		});
		expect(during).toHaveLength(1);
		const lit = /^lit keys: (.*)$/m.exec(during[0])?.[1].split(', ') ?? [];
		expect(lit).toContain('T3');
		expect(lit).not.toContain('T2');
		// let go: the keys show the selected track again
		expect(userView({ sim, replica })).not.toBe(during[0]);
	});

	it('clicks an encoder as a tap reports it, and holds a key as long as asked', async () => {
		const { replica, events } = setup();
		await playUserKeys(replica, keys('click E2'));
		expect(events).toEqual([
			'press encoder.2 pointer',
			'release encoder.2 pointer',
			'click encoder.2 pointer'
		]);
		const waits: number[] = [];
		await playUserKeys(replica, keys('hold M1'), {
			holdMs: 1000,
			wait: async (ms) => void waits.push(ms)
		});
		expect(waits).toEqual([1000]);
		expect(events.slice(3)).toEqual(['press key.m1 pointer', 'release key.m1 pointer']);
	});

	it('puts notes on steps the way a person enters them', async () => {
		const { sim, replica } = setup();
		for (const step of ['step 1', 'step 5', 'step 9', 'step 13']) {
			await playUserKeys(replica, keys(step));
		}
		const notes = createVirtualOpxy({ sim }).readPattern(1).notes;
		expect(notes.map((n) => [n.step, n.note])).toEqual([
			[1, 53],
			[5, 53],
			[9, 53],
			[13, 53]
		]);
	});
});

describe('what the user sees', () => {
	it('shows the screen, the sound and the lit keys', async () => {
		const { sim, replica } = setup();
		expect(userView({ sim, replica })).toBe(
			'screen: drum key F3: tune +0.00, play mode oneshot\nsound: stopped\nlit keys: T1'
		);
		await playUserKeys(replica, keys('step 1 → play'));
		const view = userView({ sim, replica, card: 'walkthrough card 1/2: M3' });
		expect(view).toContain('sound: playing');
		expect(view).toContain('lit keys: T1, step 1');
		expect(view).toContain('walkthrough card 1/2: M3');
	});

	it("names the walkthrough's marks by their keys, with the way to turn", () => {
		const { sim, replica } = setup();
		replica.setHighlight('key.m3', 'press');
		replica.setHighlight('encoder.1', 'turn');
		replica.setTurnHint('encoder.1', -1);
		expect(markedControls(replica).sort()).toEqual(['E1 (turn counter-clockwise)', 'M3 (press)']);
		expect(userView({ sim, replica })).toMatch(/^marked on the replica: .*M3 \(press\)/m);
	});

	it('names lit keys by their key names, the colour only when it is not white', () => {
		expect(litKeys({ 'track.1': 'white', 'step.5': 'dim', 'keyboard.f3': 'off' })).toBe(
			'T1, step 5 (dim)'
		);
		expect(litKeys({ 'keyboard.f3': 'red' })).toBe('key F3 (red)');
		expect(litKeys({})).toBeNull();
	});
});

describe('what the user hears', () => {
	/** A take's analysis as the listening summary hands it over (the fields the words read). */
	const take = (over: {
		lufs?: number;
		centroidHz?: number;
		rhythm?: Partial<NonNullable<SummaryData['rhythm']>> | null;
		harmony?: SummaryData['harmony'];
	}): SummaryData =>
		({
			seconds: 5,
			level: { lufs: over.lufs ?? -16 },
			tone: { centroidHz: over.centroidHz ?? 4000 },
			rhythm:
				over.rhythm === null
					? null
					: { onsets: 20, perSecond: 4, bpm: 124, confidence: 0.6, swing: 50, ...over.rhythm },
			drums: { mid: { count: 17, beat: 1, e: 0, and: 0, a: 0 } },
			harmony: over.harmony ?? null
		}) as unknown as SummaryData;

	it('says what a person hears: level, brightness, the beat, the key', () => {
		expect(heardInWords({ data: take({}), flags: [] })).toBe(
			'You hear it at a comfortable level, bright; a steady beat at about 124 BPM, straight.'
		);
		const swung = take({
			lufs: -28,
			centroidHz: 600,
			rhythm: { bpm: 90, swing: 62, perSecond: 1.5 },
			harmony: {
				key: 'A minor',
				clear: true,
				runnerUp: null,
				chords: [
					[0, 'Am'],
					[2, 'F']
				]
			}
		});
		expect(heardInWords({ data: swung, flags: [] })).toBe(
			'You hear it quiet, dark and muffled; a steady beat at about 90 BPM, swung, sparse; it sounds in A minor, the chords move.'
		);
	});

	it('leaves out the counts per band a person cannot hear', () => {
		expect(heardInWords({ data: take({}), flags: [] })).not.toMatch(/mid|onset|17/);
	});

	it('hears no chords in drums: harmony only when the music has a clear key', () => {
		const drums = take({
			harmony: {
				key: 'F# minor',
				clear: false,
				runnerUp: null,
				chords: [
					[0, 'F#m'],
					[1, 'D']
				]
			}
		});
		expect(heardInWords({ data: drums, flags: [] })).toBe(
			'You hear it at a comfortable level, bright; a steady beat at about 124 BPM, straight.'
		);
	});

	it("hears the music's own beat when the pulse locks onto twice or half of it", () => {
		const doubled = take({ rhythm: { bpm: 200, setBpm: 100, relation: 'double' } });
		expect(heardInWords({ data: doubled, flags: [] })).toMatch(/about 100 BPM/);
		// a tempo that is really off stays off
		const off = take({ rhythm: { bpm: 112, setBpm: 100, relation: 'different' } });
		expect(heardInWords({ data: off, flags: [] })).toMatch(/about 112 BPM/);
	});

	it('hears silence, distortion, and sound without a beat', () => {
		expect(heardInWords({ data: take({}), flags: ['silent'] })).toBe(
			'You hear silence: nothing plays.'
		);
		expect(heardInWords({ data: take({ lufs: -6 }), flags: ['clipping'] })).toMatch(
			/^You hear it very loud, bright, and it distorts;/
		);
		expect(heardInWords({ data: take({ rhythm: null }), flags: [] })).toMatch(
			/no beat, only held sound\.$/
		);
	});
});
