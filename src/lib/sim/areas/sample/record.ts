/**
 * The recorder behind the sample key (manual: sampler/sampling, synth-sampler, drum-sampler,
 * multisampler). Holding M1 (or, on the synth sampler, a keyboard key) arms it; recording starts
 * once the input passes the threshold and stops on release or after 20 seconds. The take goes to
 * the track's sampler (the synth sampler's sample, the selected drum key, a multisampler zone) and
 * to the library's user folder; on other tracks it is a stand-alone take M2 plays and M4 deletes.
 *
 * There is no audio input: a stand-in input plays TE's demo waveform on a 20 s loop, so the meter
 * moves, the threshold matters and a take looks like the guide's picture. A sound engine would
 * replace {@link inputLevel} with the real input and attach the recorded buffer to the take's id.
 */
import type { SimState, TrackState } from '../../params';
import type { RecordTarget } from './frames';
import {
	FIRST_NOTE,
	MAX_SECONDS,
	defaultRegion,
	placeZone,
	sampleFile,
	type RecordState,
	type SampleFile,
	type SampleState
} from './state';
import { DEMO_SEED, UNIT_SECONDS, standIn, type Peaks } from './wave';

/** Takes longer than this land on a drum key in the key play mode (ours: the limit is unknown). */
const LONG_TAKE_SECONDS = 2.5;

/** Which record page the sample key opens for a track (manual: sampler/sampling "which-page"). */
export function recordTarget(track: TrackState): RecordTarget {
	if (track.engine === 'drum' || track.engine === 'sampler' || track.engine === 'multisampler') {
		return track.engine;
	}
	return 'library';
}

/**
 * The record page the sample key opens now, which is also where the library loads: the selected
 * instrument track's sampler, or the library when an auxiliary track is selected, since only a
 * sample track records into its sampler (manual: sampling "which-page").
 */
export function targetOf(s: SimState): RecordTarget {
	return s.active === 'auxiliary' ? 'library' : recordTarget(s.tracks[s.track]);
}

/** How loud the stand-in input plays at 0 dB (0–1 of the meter). */
const INPUT_PEAK = 0.25;
/** The stand-in input's performance: TE's demo waveform, looping every 20 s. */
const PERFORMANCE = standIn(DEMO_SEED, MAX_SECONDS).levels;

/** The input meter at area time `ms` with `gain` dB (0–1). */
export function inputLevel(ms: number, gain: number): number {
	// a hair past each boundary, so a unit's first millisecond reads that unit despite rounding
	const i = Math.floor(ms / (UNIT_SECONDS * 1000) + 1e-9) % PERFORMANCE.length;
	const raw = (PERFORMANCE[(i + PERFORMANCE.length) % PERFORMANCE.length] / 16) * INPUT_PEAK;
	return Math.min(1, raw * 10 ** (gain / 20));
}

/**
 * Area time (ms) when an armed recorder's input first reached the threshold, or null. A threshold
 * of 0 records at once; the stand-in input repeats every 20 s, so one loop settles the rest.
 */
export function recordingStart(rec: RecordState): number | null {
	if (!rec.trigger) return null;
	if (rec.threshold <= 0) return rec.armedClock;
	const threshold = rec.threshold / 99;
	const unit = UNIT_SECONDS * 1000;
	const end = Math.min(rec.armedClock + rec.held, rec.armedClock + MAX_SECONDS * 1000 + unit);
	// the input changes once per unit: check the arming moment, then each unit boundary after it
	if (inputLevel(rec.armedClock, rec.gain) >= threshold) return rec.armedClock;
	for (let i = Math.floor(rec.armedClock / unit) + 1; i * unit <= end; i++) {
		if (inputLevel(i * unit, rec.gain) >= threshold) return i * unit;
	}
	return null;
}

/** Milliseconds recorded so far (0 while waiting for the threshold). */
export function recordedMs(rec: RecordState): number {
	const start = recordingStart(rec);
	if (start === null) return 0;
	return Math.min(MAX_SECONDS * 1000, rec.armedClock + rec.held - start);
}

/** "20:00": seconds and hundredths left of the 20 s limit. */
export function timerText(ms: number): string {
	const left = Math.max(0, Math.round((MAX_SECONDS * 1000 - ms) / 10));
	const s = Math.floor(left / 100);
	const cs = left % 100;
	return `${String(s).padStart(2, '0')}:${String(cs).padStart(2, '0')}`;
}

/** The input captured from area time `from` for `ms`, as peaks at the stand-in's point rate. */
export function capture(from: number, ms: number, gain: number): Peaks {
	const unit = UNIT_SECONDS * 1000;
	const points = Math.max(1, Math.round(ms / unit));
	const levels = Array.from({ length: points }, (_, i) => inputLevel(from + i * unit, gain));
	return { rate: points / Math.max(ms / 1000, 0.001), channels: [levels] };
}

/** Arms the recorder: `trigger` holds it, the take goes to `key` (null: the synth sampler's root). */
export function arm(rec: RecordState, trigger: string, now: number, key: number | null): void {
	rec.trigger = trigger;
	rec.armedAt = now;
	rec.armedClock = rec.clock;
	rec.held = 0;
	rec.key = key ?? -1;
	rec.playing = false;
}

/** Disarms without keeping anything. */
export function disarm(rec: RecordState): void {
	rec.trigger = null;
	rec.held = 0;
}

/** Note (MIDI) of keyboard key `key` at the area's octave. */
export function keyNote(area: SampleState, key: number): number {
	return FIRST_NOTE + key + 12 * area.octave;
}

/**
 * Stops the recorder and keeps the take (nothing when the input never reached the threshold). The
 * take is saved to the user folder and loaded where the page records to. `now` (context clock)
 * covers the time that passed without the area's clock running.
 */
export function finish(s: SimState, now: number | null): SampleFile | null {
	const area = s.areas.sample;
	const rec = area.record;
	if (!rec.trigger) return null;
	if (now !== null) rec.held = Math.max(rec.held, now - rec.armedAt);
	const start = recordingStart(rec);
	const ms = recordedMs(rec);
	const key = rec.key;
	disarm(rec);
	if (start === null || ms < UNIT_SECONDS * 1000) return null;
	area.takes += 1;
	const peaks = capture(start, ms, rec.gain);
	const take: SampleFile = {
		...sampleFile(`take ${area.takes}.wav`, 'user', Math.round(ms) / 1000),
		peaks
	};
	area.user.push(take);
	const t = s.tracks[s.track];
	const st = area.tracks[s.track];
	switch (targetOf(s)) {
		case 'library':
			rec.take = take;
			break;
		case 'sampler': {
			const root = key >= 0 ? keyNote(area, key) : st.synth.root;
			st.synth = { file: { ...take, root }, root, region: defaultRegion() };
			break;
		}
		case 'drum': {
			const at = key >= 0 ? key : t.drumKey;
			st.keys[at] = { ...take };
			const settings = t.drumKeys[at];
			settings.start = 0;
			settings.end = 99;
			// long takes play only while held (OS 1.0.32; manual: drum-sampler "long-samples")
			settings.playMode = take.seconds > LONG_TAKE_SECONDS ? 'key' : 'oneshot';
			break;
		}
		case 'multisampler': {
			const note = keyNote(area, key >= 0 ? key : t.drumKey);
			st.zones = placeZone(st.zones, {
				note,
				file: { ...take, root: note },
				region: defaultRegion()
			});
			break;
		}
	}
	return take;
}

/**
 * Time passing on the record page: the meter follows the input, the take's playback ends at its
 * length, and a recording stops at 20 s.
 */
export function advanceRecord(s: SimState, ms: number): void {
	const rec = s.areas.sample.record;
	rec.clock += ms;
	rec.level = inputLevel(rec.clock, rec.gain);
	if (rec.playing) {
		rec.played += ms;
		if (!rec.take || rec.played >= rec.take.seconds * 1000) rec.playing = false;
	}
	if (!rec.trigger) return;
	rec.held += ms;
	if (recordedMs(rec) >= MAX_SECONDS * 1000) finish(s, null);
}

/** M2 on the library record page: plays the take from the start. */
export function playTake(rec: RecordState): void {
	rec.playing = rec.take !== null;
	rec.played = 0;
}
