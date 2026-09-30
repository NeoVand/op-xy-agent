// What an answer changed, lit on the replica: the keys that lead to each change breathe, then
// rest lit a while, each with a note of what changed there; pointing at the changes note holds
// them lit; a key the user presses goes out, the answer's demonstration does not count.
import { describe, expect, it } from 'vitest';
import { FakeTime } from '../../../test/fakes/fake-time';
import { BREATH_MS, BREATHS, ChangeGlow, GLOW_IN_MS } from './change-glow';
import { ReplicaState } from './state.svelte';

const FILTER = { brief: 'T3 M3 filter: cutoff 00 → 40', controls: ['track.3', 'key.m3'] } as const;
const LEVEL = { brief: 'T3 level 80 → 60', controls: ['track.3', 'key.mix'] } as const;
const TEMPO = { brief: 'tempo 120 → 96 bpm', controls: ['key.tempo'] } as const;

function setup() {
	const time = new FakeTime();
	const replica = new ReplicaState({ timers: time });
	const glow = new ChangeGlow({ replica, timers: time, rest: 10_000 });
	return { time, replica, glow, stop: glow.start() };
}

describe('the change glow', () => {
	it('breathes the keys of each change, then rests them a while, then puts them out', async () => {
		const { time, replica, glow } = setup();
		glow.show([FILTER, LEVEL, TEMPO]);
		expect(replica.changed('key.m3')).toEqual({ mark: 'breathe', note: FILTER.brief });
		// a key that leads to two changes names both
		expect(replica.changed('track.3')?.note).toBe(`${FILTER.brief}\n${LEVEL.brief}`);
		expect(replica.changed('key.tempo')?.mark).toBe('breathe');
		await time.advance(GLOW_IN_MS + BREATH_MS * BREATHS);
		expect(replica.changed('key.tempo')?.mark).toBe('rest');
		await time.advance(10_000);
		expect(replica.changed('key.tempo')).toBeUndefined();
		expect(replica.changed('track.3')).toBeUndefined();
	});

	it('holds them lit while the changes note is pointed at, and they rest after', () => {
		const { replica, glow } = setup();
		glow.show([FILTER, TEMPO]);
		glow.point([FILTER]);
		expect(replica.changed('key.m3')?.mark).toBe('lit');
		// only the note's changes are lit while it is pointed at
		expect(replica.changed('key.tempo')).toBeUndefined();
		glow.point(null);
		expect(replica.changed('key.m3')?.mark).toBe('rest');
		expect(replica.changed('key.tempo')?.mark).toBe('rest');
	});

	it('puts out a key the user presses, not one the answer showed', () => {
		const { replica, glow } = setup();
		glow.show([FILTER]);
		replica.press('track.3', 'demo');
		replica.release('track.3', 'demo');
		expect(replica.changed('track.3')).toBeDefined();
		replica.press('track.3', 'pointer');
		expect(replica.changed('track.3')).toBeUndefined();
		expect(replica.changed('key.m3')?.mark).toBe('breathe');
	});

	it('puts every key out when cleared or stopped', () => {
		const { replica, glow, stop } = setup();
		glow.show([FILTER, TEMPO]);
		glow.clear();
		expect(replica.changed('key.m3')).toBeUndefined();
		glow.show([TEMPO]);
		stop();
		expect(replica.changed('key.tempo')).toBeUndefined();
	});

	it('counts what a key leads to past three changes', () => {
		const { replica, glow } = setup();
		const pages = ['M1 engine', 'M2 amp envelope', 'M3 filter', 'M4 lfo', 'player'];
		glow.show(pages.map((page) => ({ brief: `T1 ${page}`, controls: ['track.1'] as const })));
		expect(replica.changed('track.1')?.note).toBe(
			'T1 M1 engine\nT1 M2 amp envelope\nT1 M3 filter\nand 2 more'
		);
	});
});
