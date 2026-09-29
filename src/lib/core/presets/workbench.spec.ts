// The preset maker's workbench logic: edits and how they are written, grooves, loop tempo, what a
// drop becomes, zones, limits, and kits to randomise and mutate. All audio is synthesized here.
import { describe, expect, it } from 'vitest';
import {
	DEVICE_LIMITS,
	GROOVES,
	audibleSpan,
	buildPreset,
	clampEdit,
	defaultEdit,
	equalSlices,
	findOnsets,
	generateKit,
	groovePattern,
	guessMode,
	loopTempo,
	melodyPattern,
	mutateVoice,
	nearestZero,
	overview,
	partKeys,
	presetProblems,
	presetStats,
	randomKit,
	renderEdit,
	renderVoice,
	slicePattern,
	zoneFor,
	zonesFor,
	type PcmAudio,
	type DrumKind
} from './index';
import type { SoundEdit } from './edit';
import type { DrumRegion, SamplerRegion } from './patch';

const SR = 44100;
const audio = (...channels: Float32Array[]): PcmAudio => ({ sampleRate: SR, channels });

/** A decaying tone, like a plucked note. */
const tone = (hz: number, seconds: number, lead = 0): Float32Array =>
	Float32Array.from({ length: Math.round((seconds + lead) * SR) }, (_, i) => {
		const t = i / SR - lead;
		return t < 0 ? 0 : 0.5 * Math.sin(2 * Math.PI * hz * t) * Math.exp(-t * 0.4);
	});

/** A drum loop: kicks and hats at `bpm` over `beats` beats. */
function drumLoop(bpm: number, beats: number): Float32Array {
	const step = (60 / bpm / 2) * SR;
	const out = new Float32Array(Math.round((60 / bpm) * beats * SR));
	const kick = renderVoice({ type: 'kick', decay: 0.2 }).channels[0];
	const hat = renderVoice({ type: 'closed hat' }).channels[0];
	for (let i = 0; i < beats * 2; i++) {
		const hit = i % 2 === 0 ? kick : hat;
		const at = Math.round(i * step);
		for (let j = 0; j < hit.length && at + j < out.length; j++) out[at + j] += 0.7 * hit[j];
	}
	return out;
}

describe('edits', () => {
	it('start trimmed to what is audible, and loop sustained samplers', () => {
		const x = tone(220, 2, 0.5);
		const span = audibleSpan(audio(x));
		expect(span.start).toBeGreaterThan(0.49 * SR);
		expect(span.start).toBeLessThan(0.5 * SR);
		const edit = defaultEdit(audio(x), 'multisampler');
		expect(edit.start).toBe(span.start);
		expect(edit.loop.mode).toBe('forever');
		expect(edit.loop.end).toBeGreaterThan(edit.loop.start);
		expect(defaultEdit(audio(x), 'drum').loop.mode).toBe('off');
		expect(defaultEdit(audio(x), 'drum', { trim: false }).start).toBe(0);
	});

	it('keep every value in the device’s range and every point in order', () => {
		const base = defaultEdit(audio(tone(220, 1)), 'sampler');
		const wild: SoundEdit = {
			...base,
			start: 5000,
			end: 100,
			fadeIn: 1e9,
			gain: 99,
			pan: -500,
			transpose: 60,
			tune: -300,
			loop: { mode: 'release', start: -5, end: 1e9, crossfade: 1e9 }
		};
		const e = clampEdit(wild, SR);
		expect(e.start).toBe(5000);
		expect(e.end).toBeGreaterThan(e.start);
		expect(e.fadeIn + e.fadeOut).toBeLessThanOrEqual(e.end - e.start);
		expect([e.gain, e.pan, e.transpose, e.tune]).toEqual([20, -100, 48, -99]);
		expect(e.loop.start).toBeGreaterThanOrEqual(e.start);
		expect(e.loop.end).toBeLessThanOrEqual(e.end);
		expect(e.loop.crossfade).toBeLessThanOrEqual(
			Math.min(e.loop.end - e.loop.start, e.loop.start - e.start)
		);
	});

	it('are rendered with fades written in, cropped, and reversed for a preview', () => {
		const x = Float32Array.from({ length: 1000 }, () => 1);
		const edit = clampEdit(
			{
				...defaultEdit(audio(x), 'drum', { trim: false }),
				start: 100,
				end: 900,
				fadeIn: 100,
				fadeOut: 0
			},
			1000
		);
		const cropped = renderEdit(audio(x), edit);
		expect(cropped.audio.channels[0].length).toBe(800);
		expect([cropped.start, cropped.end]).toEqual([0, 800]);
		expect(cropped.audio.channels[0][0]).toBe(0);
		expect(cropped.audio.channels[0][50]).toBeCloseTo(0.5, 5);
		expect(cropped.audio.channels[0][799]).toBe(1);
		const whole = renderEdit(audio(x), edit, { crop: false });
		expect([whole.start, whole.end, whole.audio.channels[0].length]).toEqual([100, 900, 1000]);
		const backwards = renderEdit(audio(x), { ...edit, reverse: true }, { preview: true });
		// the fade-in now ends the sound
		expect(backwards.audio.channels[0][799]).toBe(0);
		expect(backwards.audio.channels[0][0]).toBe(1);
		// the original is untouched
		expect(x[0]).toBe(1);
	});

	it('are written into the patch fields they stand for', () => {
		const kick = renderVoice({ type: 'kick' });
		const edit: SoundEdit = {
			...defaultEdit(kick, 'drum'),
			gain: -6,
			pan: 40,
			transpose: -12,
			reverse: true,
			playmode: 'gate'
		};
		const built = buildPreset([{ name: 'kick', audio: kick, key: 60, edit }], {
			kind: 'drum',
			name: 'edits'
		});
		const region = built.patch.regions[0] as DrumRegion;
		expect(region).toMatchObject({
			hikey: 60,
			gain: -6,
			pan: 40,
			transpose: -12,
			reverse: true,
			playmode: 'gate',
			'sample.end': edit.end - edit.start,
			framecount: edit.end - edit.start
		});
		const pad = audio(tone(220, 3));
		const padEdit: SoundEdit = {
			...defaultEdit(pad, 'sampler'),
			tune: -20,
			gain: 3,
			loop: { mode: 'release', start: 30000, end: 90000, crossfade: 2000 }
		};
		const uncropped = buildPreset([{ name: 'pad', audio: pad, root: 57, edit: padEdit }], {
			kind: 'sampler',
			name: 'pad',
			crop: false
		});
		const zone = uncropped.patch.regions[0] as SamplerRegion;
		expect(zone).toMatchObject({
			'pitch.keycenter': 57,
			tune: -20,
			gain: 3,
			'loop.start': 30000,
			'loop.end': 90000,
			'loop.crossfade': 2000,
			'sample.end': padEdit.end
		});
		expect(zone['loop.onrelease']).toBeUndefined();
		expect(zone['loop.enabled']).toBeUndefined();
	});
});

describe('grooves', () => {
	const kit: (DrumKind | null)[] = Array.from({ length: 24 }, () => null);
	kit[0] = 'kick';
	kit[2] = 'snare';
	kit[8] = 'closed hat';
	kit[10] = 'open hat';
	kit[4] = 'rim';

	it('find each part on the keys that hold it, and play one bar', () => {
		const keys = partKeys(kit);
		expect(keys).toEqual({ kick: 53, snare: 55, hat: 61, open: 63, perc: 57 });
		for (const groove of GROOVES) {
			const pattern = groovePattern(groove, keys, 120);
			expect(pattern.length).toBeCloseTo(2, 6);
			expect(pattern.events.length).toBeGreaterThan(8);
			expect(pattern.events.every((e) => e.time >= 0 && e.time < 2 && e.velocity > 0)).toBe(true);
			// the kick starts the bar
			expect(pattern.events.find((e) => e.time === 0 && e.key === 53)).toBeTruthy();
		}
	});

	it('play only the parts a kit has', () => {
		const onlyKick = partKeys(['kick', ...Array(23).fill(null)]);
		const pattern = groovePattern('house', onlyKick);
		expect(new Set(pattern.events.map((e) => e.key))).toEqual(new Set([53]));
	});

	it('put a sliced loop back together, or shuffle its slices', () => {
		const starts = [0, 11025, 22050, 33075];
		const back = slicePattern(starts, 44100, SR);
		expect(back.events.map((e) => [e.time, e.key])).toEqual([
			[0, 53],
			[0.25, 54],
			[0.5, 55],
			[0.75, 56]
		]);
		const shuffled = slicePattern(starts, 44100, SR, 3);
		expect(shuffled.events.map((e) => e.time)).toEqual([0, 0.25, 0.5, 0.75]);
		expect(new Set(shuffled.events.map((e) => e.key))).toEqual(new Set([53, 54, 55, 56]));
	});

	it('run up the keys or arpeggiate round the middle for instruments', () => {
		const keys = Array.from({ length: 24 }, (_, i) => 53 + i);
		const run = melodyPattern('run', keys);
		expect(run.events[0].key).toBe(53);
		expect(Math.max(...run.events.map((e) => e.key))).toBe(76);
		const arp = melodyPattern('arpeggio', keys);
		expect(arp.events).toHaveLength(24);
		expect(melodyPattern('run', []).events).toEqual([]);
	});
});

describe('loops', () => {
	it('find the tempo a loop’s own length gives, checked against its hits', () => {
		for (const [bpm, beats] of [
			[120, 4],
			[90, 4],
			[128, 8],
			[100, 2]
		]) {
			const loop = audio(drumLoop(bpm, beats));
			const tempo = loopTempo(loop, findOnsets(loop));
			expect(tempo).not.toBeNull();
			expect([bpm, tempo?.bpm]).toEqual([bpm, bpm]);
			expect(tempo?.confidence).toBeGreaterThan(0.8);
		}
		expect(loopTempo(audio(new Float32Array(1000)), [])).toBeNull();
	});

	it('become slices when dropped alone', () => {
		const loop = audio(drumLoop(120, 4));
		expect(guessMode([{ name: 'break.wav', audio: loop }]).mode).toBe('slices');
		expect(equalSlices(loop, 16)).toHaveLength(16);
	});
});

describe('what a drop becomes', () => {
	it('tells hits, one note, a loop and an instrument apart', () => {
		const kick = renderVoice({ type: 'kick' });
		expect(guessMode([{ name: 'kick.wav', audio: kick }]).mode).toBe('drum');
		expect(guessMode([{ name: 'bass-c2.wav', audio: audio(tone(65.4, 1)) }]).mode).toBe('sampler');
		expect(guessMode([{ name: 'pad.wav', audio: audio(tone(220, 2)) }]).mode).toBe('sampler');
		const notes = ['c3', 'e3', 'g3', 'c4'].map((n, i) => ({
			name: `piano ${n}.wav`,
			audio: audio(tone(130.8 * 2 ** (i / 3), 1.5))
		}));
		expect(guessMode(notes).mode).toBe('multisampler');
		const kit = generateKit('909').slice(0, 6);
		expect(guessMode(kit).mode).toBe('drum');
		expect(guessMode([]).mode).toBe('drum');
	});
});

describe('zones', () => {
	it('reach half way to the next root, the ends to 0 and 127, as the builder writes them', () => {
		const zones = zonesFor([60, 48, 72, 60]);
		expect(zones).toEqual([
			{ root: 48, low: 0, high: 54 },
			{ root: 60, low: 55, high: 66 },
			{ root: 72, low: 67, high: 127 }
		]);
		expect(zoneFor(zones, 55)?.root).toBe(60);
		expect(zoneFor(zones, 20)?.root).toBe(48);
		expect(zoneFor([], 60)).toBeNull();
		const built = buildPreset(
			[48, 60, 72].map((root) => ({ name: `n${root}`, audio: audio(tone(261.6, 1)), root })),
			{ kind: 'multisampler', name: 'z' }
		);
		expect(built.patch.regions.map((r) => r.hikey)).toEqual(zones.map((z) => z.high));
	});
});

describe('waveforms and zero crossings', () => {
	it('draw each column’s lowest and highest sample', () => {
		const x = Float32Array.from({ length: 400 }, (_, i) => (i < 200 ? 0.5 : -0.25));
		expect(Array.from(overview(audio(x), 2))).toEqual([0, 0.5, -0.25, 0]);
		expect(Array.from(overview(audio(x), 2, 0, 0))).toEqual([0, 0, 0, 0]);
	});

	it('find the rising zero crossing nearest a point', () => {
		const x = Float32Array.from({ length: 1000 }, (_, i) => Math.sin((2 * Math.PI * i) / 100));
		const at = nearestZero(audio(x), 230, 60);
		// sin(4π) comes out a hair below zero, so the crossing may land one frame later
		expect([0, 1]).toContain(at % 100);
		expect(Math.abs(at - 230)).toBeLessThanOrEqual(70);
		expect(nearestZero(audio(new Float32Array(100)), 50, 10)).toBe(50);
	});
});

describe('limits', () => {
	it('add up a preset and warn before the device would refuse it', () => {
		const stats = presetStats([
			{ frames: SR, channels: 1 },
			{ frames: 2 * SR, channels: 2 }
		]);
		expect(stats.sounds).toBe(2);
		expect(stats.longest).toBe(2);
		expect(stats.bytes).toBe(88 + SR * 2 + 88 + 2 * SR * 4 + 4096);
		expect(presetProblems('my kit', stats)).toEqual([]);
		expect(presetProblems('', presetStats([]))[0].level).toBe('error');
		expect(presetProblems('Kick/Snare!', stats)[0].text).toMatch(/kick-snare/);
		const huge = presetStats(Array.from({ length: 24 }, () => ({ frames: 20 * SR, channels: 2 })));
		expect(presetProblems('big', huge).some((p) => p.level === 'error')).toBe(true);
		const long = presetStats([{ frames: 25 * SR, channels: 1 }]);
		expect(presetProblems('long', long)[0].text).toMatch(/20 s/);
		expect(presetProblems('x', stats, { overflow: 2, zones: true })[0].text).toMatch(/24 zones/);
		expect(DEVICE_LIMITS.keys).toBe(24);
	});
});

describe('kits to play with', () => {
	it('mutate a voice a little, within its ranges, and deterministically', () => {
		const voice = { type: 'kick' as const, pitch: 50, decay: 0.5, tone: 0.5 };
		const a = mutateVoice(voice, 0.2, 1);
		expect(a).toEqual(mutateVoice(voice, 0.2, 1));
		expect(a).not.toEqual(mutateVoice(voice, 0.2, 2));
		expect(a.type).toBe('kick');
		expect(a.pitch).toBeGreaterThan(35);
		expect(a.pitch).toBeLessThan(70);
		expect(a.tone).toBeGreaterThanOrEqual(0);
		expect(a.tone).toBeLessThanOrEqual(1);
	});

	it('make random kits on TE’s layout, each sound with its voice', () => {
		const kit = randomKit(5);
		expect(kit.map((s) => s.key)).toEqual(Array.from({ length: 24 }, (_, i) => 53 + i));
		expect(kit.every((s) => s.voice && s.audio.channels[0].length > 0)).toBe(true);
		expect(randomKit(5)[0].audio.channels[0]).toEqual(kit[0].audio.channels[0]);
		expect(generateKit('808')[0].voice?.type).toBe('kick');
	});
});
