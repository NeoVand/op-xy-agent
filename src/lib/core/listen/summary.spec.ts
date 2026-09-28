// The summary the agent reads: short lines in words, the flags, and rounded numbers. A clean little
// song raises nothing; clipping, quiet, silence, dropouts, a flipped low end, a rhythm off the set
// tempo and loose timing each raise their flag; the focus puts its lines first and adds detail;
// tracks heard alone are compared.
import { describe, expect, it } from 'vitest';
import { analyzeAudio } from './analyze';
import { clickTrack, drumLoop, gain, mix, noise, progression, sine } from './signals';
import { FLAG_LIMITS, LISTEN_FOCUS, flagsOf, summarize, summarizeTracks } from './summary';

const SR = 22050;

function song(bpm = 120) {
	const drums = drumLoop({
		bpm,
		bars: 4,
		sampleRate: SR,
		offset: 0,
		pattern: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14] }
	});
	const chords = progression(
		[
			['A3', 'C4', 'E4'],
			['F3', 'A3', 'C4'],
			['C4', 'E4', 'G4'],
			['G3', 'B3', 'D4']
		],
		(4 * 60) / bpm,
		SR,
		{ wave: 'saw', amplitude: 0.05 }
	);
	const seconds = Math.floor(((16 * 60) / bpm) * SR);
	const kit = gain(drums.samples, 0.5);
	return {
		left: mix(kit, chords).subarray(0, seconds),
		right: mix(kit, gain(chords, 0.8)).subarray(0, seconds)
	};
}

describe('summarize', () => {
	const { left, right } = song();
	const analysis = analyzeAudio([left, right], SR, { expectedBpm: 120 });

	it('reads a clean song in a few lines, with nothing to flag', () => {
		const s = summarize(analysis, { source: 'the virtual OP-XY' });
		expect(s.flags).toEqual([]);
		const lines = s.text.split('\n');
		expect(lines[0]).toBe('heard 8 s of the virtual OP-XY (22.1 kHz stereo)');
		expect(lines.at(-1)).toBe('nothing stands out');
		expect(s.text).toMatch(/^level: -?\d+(\.\d)? LUFS integrated/m);
		expect(s.text).toMatch(/matches the set 120/);
		expect(s.text).toMatch(/grid tight/);
		// the first kick starts the recording, with nothing before it to rise from
		expect(s.text).toMatch(/^drums: low \(kicks, bass\) 15 hits, on the beat 100 %/m);
		expect(s.text).not.toMatch(/swung/);
		expect(s.text).toMatch(/chords \(rough\) Am \(0 s\) F \(2 s\) C \(4 s\) G \(6 s\)/);
		expect(s.text.length).toBeLessThan(1400);
	});

	it('carries rounded numbers that survive JSON', () => {
		const { data } = summarize(analysis);
		expect(JSON.parse(JSON.stringify(data))).toEqual(data);
		expect(data.rhythm).toMatchObject({ bpm: 120, setBpm: 120, relation: 'same' });
		expect(data.harmony!.chords.map(([, c]) => c)).toEqual(['Am', 'F', 'C', 'G']);
		expect(Number.isInteger(data.tone!.centroidHz)).toBe(true);
		expect(data.level.lufs! * 10).toBeCloseTo(Math.round(data.level.lufs! * 10), 6);
		expect(data.drums!.low).toMatchObject({ count: 15, beat: 1 });
		expect(data.rhythm!.swing).toBeNull();
		expect(JSON.stringify(data).length).toBeLessThan(1600);
	});

	it('puts the focus first and adds its detail', () => {
		const drums = summarize(analysis, { focus: 'drums' }).text.split('\n');
		expect(drums[1]).toMatch(/^rhythm:/);
		expect(drums[2]).toMatch(/^drums:/);
		expect(drums.some((l) => l.startsWith('harmony:'))).toBe(false);
		const harmony = summarize(analysis, { focus: 'harmony' }).text.split('\n');
		expect(harmony[1]).toMatch(/^harmony: key (A minor|C major)/);
		const tone = summarize(analysis, { focus: 'tone' });
		expect(tone.text.split('\n')[1]).toMatch(/strongest third octaves/);
		expect(Object.keys(tone.data.tone!.thirdOctaves!).length).toBeGreaterThan(20);
		expect(summarize(analysis).data.tone!.thirdOctaves).toBeUndefined();
		const mix = summarize(analysis, { focus: 'mix' }).text.split('\n');
		expect(mix.slice(1, 4).map((l) => l.split(':')[0])).toEqual(['level', 'tone', 'stereo']);
		expect(LISTEN_FOCUS).toContain('tempo');
	});

	it('says so when it heard silence', () => {
		const quiet = new Float32Array(SR * 2);
		const s = summarize(analyzeAudio([quiet, quiet], SR), { source: 'the OP-XY’s USB audio' });
		expect(s.flags).toEqual(['silent']);
		expect(s.text).toBe(
			'heard 2 s of the OP-XY’s USB audio (22.1 kHz stereo)\nsilence: nothing above -60 dBFS the whole time\nworth a look: silent'
		);
	});
});

describe('flags', () => {
	it('flags clipping, a hot peak, quiet and loud', () => {
		const clipped = sine(100, 2, SR, 3).map((v) => Math.max(-1, Math.min(1, v)));
		const c = flagsOf(analyzeAudio([clipped], SR));
		expect(c).toContain('clipping');
		expect(c).toContain('loud');
		expect(flagsOf(analyzeAudio([sine(100, 2, SR, 0.9995)], SR))).toContain('hot');
		expect(flagsOf(analyzeAudio([sine(440, 2, SR, 0.01)], SR))).toContain('quiet');
	});

	it('flags mostly silence, dropouts and a DC offset', () => {
		const sparse = new Float32Array(4 * SR);
		sparse.set(sine(440, 1, SR, 0.3), SR);
		expect(flagsOf(analyzeAudio([sparse], SR))).toContain('mostly-silent');
		const glitchy = sine(440, 2, SR, 0.3);
		glitchy.fill(0, SR, SR + 100);
		const g = analyzeAudio([glitchy], SR);
		expect(flagsOf(g)).toContain('dropouts');
		expect(summarize(g).text).toMatch(
			/1 possible dropout \(digital silence cut into the sound\) at 1 s/
		);
		expect(flagsOf(analyzeAudio([sine(440, 2, SR, 0.2).map((v) => v + 0.05)], SR))).toContain(
			'dc-offset'
		);
	});

	it('flags a low end out of phase', () => {
		const bass = sine(60, 2, SR, 0.3);
		const s = analyzeAudio([bass, gain(bass, -1)], SR);
		expect(flagsOf(s)).toContain('phase');
		expect(summarize(s).text).toMatch(/low end out of phase/);
	});

	it('flags a rhythm that does not fit the set tempo, and loose timing', () => {
		const clicks = clickTrack({ bpm: 120, seconds: 8, sampleRate: SR, perBeat: 2 });
		const off = analyzeAudio([clicks.samples], SR, { expectedBpm: 97 });
		expect(flagsOf(off)).toContain('off-tempo');
		expect(summarize(off).text).toMatch(/does not fit the set 97/);
		expect(flagsOf(analyzeAudio([clicks.samples], SR, { expectedBpm: 120 }))).not.toContain(
			'off-tempo'
		);
		const loose = clickTrack({
			bpm: 100,
			seconds: 10,
			sampleRate: SR,
			perBeat: 4,
			jitterMs: 25,
			seed: 3
		});
		const l = analyzeAudio([loose.samples], SR, { expectedBpm: 100 });
		expect(l.rhythm!.grid!.tightnessMs).toBeGreaterThan(FLAG_LIMITS.looseMs);
		expect(flagsOf(l)).toContain('loose');
	});

	it('flags no pulse in noise bursts at random times', () => {
		const x = new Float32Array(8 * SR);
		const burst = noise('white', 0.03, SR, { rms: 0.3 });
		for (const t of [0.4, 1.3, 1.5, 2.9, 3.1, 4.8, 5.0, 5.9, 7.3]) x.set(burst, Math.round(t * SR));
		expect(flagsOf(analyzeAudio([x], SR))).toContain('no-pulse');
	});
});

describe('summarizeTracks', () => {
	it('compares tracks heard alone', () => {
		const drums = drumLoop({
			bpm: 120,
			bars: 2,
			sampleRate: SR,
			offset: 0,
			pattern: { kick: [0, 4, 8, 12] }
		}).samples.subarray(0, 4 * SR);
		const bass = progression([['A1'], ['F1']], 2, SR, { wave: 'saw', amplitude: 0.3 });
		const pad = progression(
			[
				['A3', 'C4', 'E4'],
				['F3', 'A3', 'C4']
			],
			2,
			SR,
			{ amplitude: 0.05 }
		);
		const takes = [
			{ track: 1, name: 'drum', analysis: analyzeAudio([drums], SR, { expectedBpm: 120 }) },
			{ track: 3, name: 'prism', analysis: analyzeAudio([bass], SR) },
			{ track: 5, name: 'dissolve', analysis: analyzeAudio([pad], SR) },
			{ track: 6, name: 'hardsync', analysis: analyzeAudio([new Float32Array(SR)], SR) }
		];
		const s = summarizeTracks(takes, { source: 'the virtual OP-XY' });
		const lines = s.text.split('\n');
		expect(lines[0]).toBe('heard 4 tracks alone, one at a time, from the virtual OP-XY');
		expect(lines[1]).toMatch(/^T1 \(drum\): .*LUFS.*mostly low/);
		expect(lines[4]).toMatch(/^T6 \(hardsync\): silent/);
		expect(s.text).toMatch(/compared: loudest T3, quietest T5, \d+(\.\d)? LU apart/);
		expect(s.text).toMatch(
			/T1 and T3 put most of their energy in the low band: they compete there/
		);
		expect(s.tracks.map((t) => t.track)).toEqual([1, 3, 5, 6]);
		expect(s.tracks[3].flags).toEqual(['silent']);
	});
});
