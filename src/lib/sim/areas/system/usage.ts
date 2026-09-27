/**
 * The system usage indicators (manual: project/system-usage-indicators): the voice icon from 17 of
 * the 24 voices, the CPU icon above 70 % load and the sample memory icon above 70 % use. The
 * replica has no audio engine, so the figures are our estimate from what the state says is
 * sounding: the keys held on the keyboard play on the selected track, and while the sequencer runs
 * every unmuted track plays the notes of the step under the playhead. Engine costs and sample
 * sizes are ours; 64 MB of sample memory is the research figure (docs/research/30).
 */
import type { EngineId } from '$lib/core/opxy';
import type { SimState } from '../../params';
import { currentPattern, stepAt } from '../../sequencer';

/** Voices the OP-XY has (manual). */
export const VOICES = 24;
/** Thresholds of the three icons (manual). */
export const THRESHOLDS = { voices: 17, cpu: 70, memory: 70 } as const;

/** Load one voice of an engine adds, in % of the CPU (ours). */
const VOICE_COST: Readonly<Partial<Record<EngineId, number>>> = {
	dissolve: 4,
	wavetable: 3.5,
	hardsync: 3,
	axis: 3,
	prism: 3,
	organ: 2.5,
	epiano: 2.5,
	simple: 2,
	drum: 1.5,
	sampler: 1.5,
	multisampler: 2,
	midi: 0
};
/** What the system itself takes (ours). */
const BASE_LOAD = 12;
/** Sample memory a track's samples take, in MB (ours), of 64 MB (research 30). */
const SAMPLE_MB: Readonly<Partial<Record<EngineId, number>>> = {
	drum: 12,
	sampler: 4,
	multisampler: 16
};
const SAMPLE_MEMORY_MB = 64;

/** Voices in use, CPU load (%) and sample memory in use (%), estimated. */
export function usageOf(s: SimState): { voices: number; cpu: number; memory: number } {
	const held = s.held.filter((id) => id.startsWith('keyboard.')).length;
	const active = s.tracks[s.track];
	let voices = held;
	let cpu = BASE_LOAD + held * (VOICE_COST[active.engine] ?? 2);
	if (s.transport.playing) {
		for (const t of s.tracks) {
			if (t.mix.muted) continue;
			const pattern = currentPattern(t.sequence);
			const notes = pattern.steps[stepAt(pattern, s.transport.position)]?.notes.length ?? 0;
			voices += notes;
			cpu += notes * (VOICE_COST[t.engine] ?? 2);
		}
	}
	const mb = s.tracks.reduce((sum, t) => sum + (SAMPLE_MB[t.engine] ?? 0), 0);
	return {
		voices: Math.min(VOICES, voices),
		cpu: Math.min(100, Math.round(cpu)),
		memory: Math.min(100, Math.round((mb / SAMPLE_MEMORY_MB) * 100))
	};
}

/** Which icons the project page shows. */
export function indicators(s: SimState): { voices: boolean; cpu: boolean; memory: boolean } {
	const u = usageOf(s);
	return {
		voices: u.voices >= THRESHOLDS.voices,
		cpu: u.cpu > THRESHOLDS.cpu,
		memory: u.memory > THRESHOLDS.memory
	};
}
