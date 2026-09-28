import { describe, expect, it } from 'vitest';
import type { EngineId } from '$lib/core/opxy';
import { defaultEngines } from '$lib/sim/params';
import { punchTracks } from './effects';
import { PunchState, type PunchTrigger, type SoundChange } from './state';

/** A new project's engines: T1–T2 drums, T3–T8 synths. */
const engines: EngineId[] = defaultEngines();
const tracks = engines.map((engine) => ({ engine }));

/** Key `key` (0–23) held on the punch-in track. */
const onT2 = (key: number): PunchTrigger => ({
	key,
	from: null,
	tracks: punchTracks(tracks, { key, from: null })
});

/** The track a change is for. */
const trackOf = (c: SoundChange) => (c.kind === 'add' ? c.span.track : c.track);

const adds = (changes: SoundChange[]) =>
	changes.flatMap((c) => (c.kind === 'add' ? [[c.span.track, c.span.effect]] : []));

describe('which punch-in effects hold, where and when', () => {
	it('starts a held key’s effects on the sound of each track it acts on, as its group hears them', () => {
		const state = new PunchState();
		// F♯: a stutter, which chops the drums and restarts the synths
		expect(adds(state.live([onT2(1), onT2(13)], 1, engines))).toEqual([
			[0, 'chop'],
			[1, 'chop'],
			[2, 'stutter'],
			[3, 'stutter'],
			[4, 'stutter'],
			[5, 'stutter'],
			[6, 'stutter'],
			[7, 'stutter']
		]);
		// held on: nothing new
		expect(state.live([onT2(1), onT2(13)], 1.5, engines)).toEqual([]);
		expect(state.at(0, 1.2)).toEqual(['stutter']);
		expect(state.at(4, 0.5)).toEqual([]);
	});

	it('ends a key’s spans where it is let go, leaving the others', () => {
		const state = new PunchState();
		state.live([onT2(0), onT2(15)], 1, engines);
		const changes = state.live([onT2(15)], 2, engines);
		expect(changes.every((c) => c.kind === 'end' && c.at === 2)).toBe(true);
		expect(changes.map(trackOf)).toEqual([0, 1]);
		expect(state.at(0, 2.5)).toEqual([]);
		// the upper G♯ sweeps the synths' sound, still holding
		expect(state.at(3, 2.5)).toEqual(['pan']);
		expect(state.sounding(2.5).map((s) => [s.track, s.effect])).toContainEqual([3, 'sweep']);
	});

	it('keeps the effects on notes out of the sound, but says they hold', () => {
		const state = new PunchState();
		// A♯ (octave), C♯ (short) and the lower G♯ (pan: each drum hit placed) act on notes
		expect(state.live([onT2(5), onT2(8), onT2(3)], 1, engines)).toEqual([]);
		expect(state.at(0, 1.1).sort()).toEqual(['octave', 'pan', 'short']);
		expect(state.size).toBe(3);
	});

	it('plays the punch-in pattern’s notes over their times, and ends them when the transport stops', () => {
		const state = new PunchState();
		const changes = state.pattern(onT2(12), 4, 4.5, engines);
		expect(changes).toHaveLength(6);
		expect(changes[0]).toMatchObject({ kind: 'add', span: { from: 4, to: 4.5, effect: 'mute' } });
		expect(state.at(2, 3.9)).toEqual([]);
		expect(state.at(2, 4.2)).toEqual(['mute']);
		expect(state.at(2, 4.5)).toEqual([]);
		state.live([onT2(0)], 4.1, engines);
		// stopped at 4.2: the pattern's spans end there, the held key's go on
		const stopped = state.stop(4.2);
		expect(stopped.map(trackOf)).toEqual([2, 3, 4, 5, 6, 7]);
		expect(state.at(2, 4.3)).toEqual([]);
		expect(state.at(0, 4.3)).toEqual(['mute']);
		expect(state.pattern(onT2(12), 5, 5, engines)).toEqual([]);
	});

	it('skips a midi track, forgets what has ended, and gives a late processor what still holds', () => {
		const state = new PunchState();
		const withMidi: EngineId[] = engines.map((e, k) => (k === 2 ? 'midi' : e));
		const changes = state.live([onT2(12)], 1, withMidi);
		expect(changes.map(trackOf)).toEqual([3, 4, 5, 6, 7]);
		state.pattern(onT2(0), 2, 2.25, engines);
		expect(state.sounding(2.1)).toHaveLength(7);
		expect(state.sounding(3)).toHaveLength(5);
		state.prune(3);
		expect(state.size).toBe(1);
		state.clear();
		expect(state.size).toBe(0);
	});
});
