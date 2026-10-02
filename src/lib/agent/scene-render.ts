/**
 * One scene of the replica's song, as an offline render plays it (the lab's `lab.listen` and the
 * `listen` tool's `scene`): a copy of the project with the scene picked and held, as picking a
 * scene in arrange mode holds it, so play loops it instead of starting the song from its first
 * scene (which is what plain play does whenever the project has a song: the agent once asked for
 * the beat and heard the drumless intro).
 */
import { estimateKey, type KeyEstimate } from '$lib/core/listen/harmony';
import { holdScene, selectScene } from '$lib/sim/areas/arrange/model';
import { snapshot } from '$lib/sim/areas/system/projects';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { SimState } from '$lib/sim/params';
import type { LabRender } from './lab/core';

/** `state` (a copy is made) playing scene `scene` (1–99) round and round from its start. */
export function sceneState(state: SimState, scene: number): SimState {
	const sim = new OpxySim({ state: JSON.parse(JSON.stringify(state)) as SimState, now: () => 0 });
	selectScene(sim.state, scene - 1);
	holdScene(sim.state);
	sim.press('key.play');
	return sim.state;
}

/** The instrument tracks (1–8) that play notes in `state`'s current scene. */
export function tracksPlaying(state: SimState): number[] {
	return state.tracks.flatMap((t, i) => {
		const p = t.sequence.patterns[t.sequence.current];
		return p?.steps.slice(0, p.length).some((s) => s.notes.length > 0) ? [i + 1] : [];
	});
}

/** Whether a drum track plays notes, unmuted, in `state`: what a take's timing can be read by. */
export function drumsPlay(state: SimState): boolean {
	return tracksPlaying(state).some((n) => {
		const t = state.tracks[n - 1];
		return t.engine === 'drum' && !t.mix.muted;
	});
}

/**
 * `state` (a copy) with every instrument track but `track` (1–8) muted. When `track` ducks from
 * another instrument track, that one plays on at level 0, unheard (its sends are after the fader),
 * so the duck moves as it does in the mix: muted, its notes would never start it.
 */
export function alone(state: SimState, track: number): SimState {
	const copy = JSON.parse(JSON.stringify(state)) as SimState;
	copy.tracks.forEach((t, i) => (t.mix.muted = i !== track - 1));
	const lfo = copy.tracks[track - 1]?.lfo;
	const from = lfo?.type === 'duck' && lfo.on ? Math.round(lfo.source) : 0;
	if (from >= 1 && from <= 8 && from !== track) {
		const source = copy.tracks[from - 1].mix;
		source.muted = false;
		source.level = 0;
	}
	return copy;
}

/**
 * A note for a whole-mix take that heard no pump while a track ducks: the hits that start a duck
 * hide its dip in the mix (an agent read "no pump" there as a duck that did not work).
 */
export function mixDuckNote(state: SimState, pumped: boolean): string | null {
	if (pumped) return null;
	const ducking = state.tracks.flatMap((t, i) =>
		t.lfo.type === 'duck' && t.lfo.on && !t.mix.muted ? [i + 1] : []
	);
	if (ducking.length === 0) return null;
	const list = ducking.map((t) => `T${t}`).join(', ');
	return `${list} duck${ducking.length === 1 ? 's' : ''}, and the whole mix shows no pump: the hits that start a duck cover its dip here. Listen with tracks [${ducking.join(', ')}] to hear ${ducking.length === 1 ? 'its' : 'their'} pump alone.`;
}

/** Whether `state`'s metronome clicks in what plays: on, and at a level above 0. */
export const clickHeard = (state: SimState): boolean =>
	state.tempo.metronome.on && state.tempo.metronome.level > 0;

/** What an offline render of `state` takes: its project, and how it plays, for `seconds`. */
export function renderRequest(state: SimState, seconds: number): LabRender {
	return {
		project: snapshot(state),
		transport: { ...state.transport },
		track: state.track,
		mode: state.mode,
		seconds
	};
}

/** The key the pitched notes playing in `state` suggest together (drums and mutes left out). */
export function writtenKey(state: SimState): KeyEstimate | null {
	const chroma = new Array<number>(12).fill(0);
	const classes = new Set<number>();
	for (const t of state.tracks) {
		if (t.engine === 'drum' || t.mix.muted) continue;
		const p = t.sequence.patterns[t.sequence.current];
		for (const step of p?.steps.slice(0, p.length) ?? []) {
			for (const n of step.notes) {
				chroma[n.note % 12] += Math.max(0.25, n.length);
				classes.add(n.note % 12);
			}
		}
	}
	return classes.size >= 3 ? estimateKey(chroma) : null;
}

/**
 * A note for when the key heard is not the key written (an agent once explained C minor heard over
 * its F minor as "the same notes"): heard keys come from the whole sound and miss often.
 */
export function keyNote(
	written: KeyEstimate | null,
	heard: KeyEstimate | null | undefined
): string | null {
	if (!written || !heard) return null;
	if (written.pitchClass === heard.pitchClass && written.mode === heard.mode) return null;
	return `The notes written read as ${written.key}; the analysis heard ${heard.key}. A heard key comes from the whole sound (drums, a bass's overtones, effects) and misses often: go by the written key, and leave the heard one out.`;
}
