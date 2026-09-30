// What the strip under the replica shows: bar and beat in the project's time signature (a count-in
// is bar 0), the tempo, the song entry by entry with the one playing and the one cued, and mutes.
import { describe, expect, it } from 'vitest';
import { cueSongAt, startSong } from '$lib/sim/areas/arrange/model';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { barBeat, nowPlaying } from './now-playing';
import { createVirtualOpxy } from './virtual';

describe('barBeat', () => {
	it('counts bars and beats of sixteenths in the time signature', () => {
		expect(barBeat(0, '4/4')).toBe('1.1');
		expect(barBeat(4, '4/4')).toBe('1.2');
		expect(barBeat(16 + 8, '4/4')).toBe('2.3');
		expect(barBeat(12, '3/4')).toBe('2.1');
		// 6/8 counts eighths: six to a bar
		expect(barBeat(2, '6/8')).toBe('1.2');
		expect(barBeat(12, '6/8')).toBe('2.1');
	});

	it('calls a count-in bar 0', () => {
		expect(barBeat(-16, '4/4')).toBe('0.1');
		expect(barBeat(-4, '4/4')).toBe('0.4');
	});
});

describe('nowPlaying', () => {
	it('reads a stopped new project', () => {
		const sim = new OpxySim({ now: () => 0 });
		const view = nowPlaying(sim.state);
		expect(view).toMatchObject({ playing: false, bpm: '120', position: '1.1', scene: 1 });
		expect(view.song).toEqual([{ scene: 1, playing: false, cued: false, progress: null }]);
		expect(view.muted).toEqual(Array.from({ length: 8 }, () => false));
	});

	it('follows a song: the entry playing, the one cued, and how far it has got', () => {
		const sim = new OpxySim({ now: () => 0 });
		const virtual = createVirtualOpxy({ sim });
		virtual.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 1, note: 53, velocity: 100, length: 1 }]
		});
		virtual.writeArrangement({
			scenes: [
				{ scene: 1, patterns: [{ track: 1, pattern: 1 }] },
				{ scene: 2, patterns: [{ track: 1, pattern: 1 }] }
			],
			song: { order: [1, 2, 2], loop: true }
		});
		startSong(sim.state);
		sim.state.transport.playing = true;
		sim.state.transport.position = 4;
		sim.state.tracks[1].mix.muted = true;
		let view = nowPlaying(sim.state);
		expect(view.songPlaying).toBe(true);
		expect(view.song.map((b) => b.scene)).toEqual([1, 2, 2]);
		expect(view.song[0]).toMatchObject({ playing: true, progress: 0.25 });
		expect(view.position).toBe('1.2');
		expect(view.muted[1]).toBe(true);
		// a block picked while the song plays is cued, the one playing is not
		cueSongAt(sim.state, 2);
		view = nowPlaying(sim.state);
		expect(view.song.map((b) => b.cued)).toEqual([false, false, true]);
		cueSongAt(sim.state, 0);
		expect(nowPlaying(sim.state).song.some((b) => b.cued)).toBe(false);
	});
});
