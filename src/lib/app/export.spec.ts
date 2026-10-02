// What you made, taken elsewhere: the song as MIDI (a track per instrument track that plays, its
// patterns along the song, a muted track left out of its scene), one pattern as MIDI, and the song
// as a WAV laid end to end from a render per entry, with its last scene ringing out.
import { describe, expect, it } from 'vitest';
import { readMidiFile, type MidiFile } from '$lib/core/midi/smf';
import { parseWav } from '$lib/core/presets/wav';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { patternMidi, songMidi, songScenes, songWav, type RenderScene } from './export';
import { createVirtualOpxy } from './virtual';

/** A kick on every beat on T1 in scenes 1 and 2, a bass note on T3 in scene 1; the song 1 2 1. */
function project() {
	const sim = new OpxySim({ now: () => 0 });
	const virtual = createVirtualOpxy({ sim });
	const kick = [1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 110, length: 1 }));
	virtual.writePattern(1, { pattern: 1, bars: 1, notes: kick });
	virtual.writePattern(3, {
		pattern: 1,
		bars: 1,
		notes: [{ step: 1, note: 45, velocity: 100, length: 4 }]
	});
	// scene 2 plays T3's empty pattern 2: the bass rests there
	virtual.writePattern(3, { pattern: 2, bars: 1, notes: [] });
	virtual.writeArrangement({
		scenes: [
			{
				scene: 1,
				patterns: [
					{ track: 1, pattern: 1 },
					{ track: 3, pattern: 1 }
				]
			},
			{
				scene: 2,
				patterns: [
					{ track: 1, pattern: 1 },
					{ track: 3, pattern: 2 }
				]
			}
		],
		song: { order: [1, 2, 1], loop: true }
	});
	return { sim, virtual };
}

/** Each track's note-ons as [tick, note]. */
function noteOns(file: MidiFile) {
	return file.tracks.map((track) => {
		let tick = 0;
		const ons: [number, number][] = [];
		for (const e of track.events) {
			tick += e.delta;
			if (e.event.type === 'noteOn' && e.event.velocity > 0) ons.push([tick, e.event.note]);
		}
		return { name: track.name, ons };
	});
}

describe('the song as MIDI', () => {
	it('lays each track’s patterns along the song, a bar a scene', () => {
		const { sim } = project();
		const file = readMidiFile(songMidi(sim.state));
		const tracks = noteOns(file);
		// the conductor track, named for the project, then T1 and T3
		expect(tracks.map((t) => t.name)).toEqual([
			sim.state.project.name,
			'T1 drum',
			expect.stringMatching(/^T3 /)
		]);
		// four kicks a bar, three bars
		expect(tracks[1].ons).toHaveLength(12);
		expect(tracks[1].ons.slice(0, 2)).toEqual([
			[0, 53],
			[480, 53]
		]);
		// the bass plays in scenes 1 (bars 1 and 3) only
		expect(tracks[2].ons.map(([tick]) => tick)).toEqual([0, 2 * 1920]);
	});

	it('plays a song of one scene four times, and a pattern once through', () => {
		const sim = new OpxySim({ now: () => 0 });
		expect(songScenes(sim.state)).toEqual([0, 0, 0, 0]);
		const { sim: made } = project();
		const one = noteOns(readMidiFile(patternMidi(made.state, 1, 1)));
		expect(one[1].ons).toHaveLength(4);
	});
});

describe('the song as a WAV', () => {
	it('is each entry rendered from its scene, end to end, with the last ringing out', async () => {
		const { sim } = project();
		const rendered: number[] = [];
		const notes: (number | undefined)[] = [];
		const clicks: boolean[] = [];
		const render: RenderScene = async (request) => {
			rendered.push(request.seconds);
			notes.push(request.notes);
			clicks.push(JSON.parse(request.project).tempo.metronome.on);
			const frames = Math.round(request.seconds * request.sampleRate);
			return { sampleRate: request.sampleRate, channels: [new Float32Array(frames).fill(0.25)] };
		};
		const progress: string[] = [];
		const bytes = await songWav(sim.state, render, {
			sampleRate: 8000,
			onProgress: (done, of) => progress.push(`${done}/${of}`)
		});
		// three entries of one bar at 120 bpm (2 s), each rendered with 1.5 s to ring out, its notes
		// stopping at its end (the scene would start over in the tail)
		expect(rendered).toEqual([3.5, 3.5, 3.5]);
		expect(notes).toEqual([1.96875, 1.96875, 1.96875]);
		expect(progress).toEqual(['1/3', '2/3', '3/3']);
		// the metronome is on in a new project, off in the file
		expect(sim.state.tempo.metronome.on).toBe(true);
		expect(clicks).toEqual([false, false, false]);
		const wav = parseWav(bytes);
		expect(wav.channels).toHaveLength(2);
		expect(wav.channels[0].length).toBe(Math.round(7.5 * 8000));
		// where one entry rings into the next they add up, kept under full scale
		expect(Math.max(...wav.channels[0].slice(0, 16000))).toBeCloseTo(0.25, 2);
		expect(wav.channels[0][2 * 8000 + 100]).toBeCloseTo(0.5, 2);
	});
});
