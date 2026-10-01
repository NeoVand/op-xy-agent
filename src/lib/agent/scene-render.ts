/**
 * One scene of the replica's song, as an offline render plays it (the lab's `lab.listen` and the
 * `listen` tool's `scene`): a copy of the project with the scene picked and held, as picking a
 * scene in arrange mode holds it, so play loops it instead of starting the song from its first
 * scene (which is what plain play does whenever the project has a song: the agent once asked for
 * the beat and heard the drumless intro).
 */
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

/** `state` (a copy) with every instrument track but `track` (1–8) muted. */
export function alone(state: SimState, track: number): SimState {
	const copy = JSON.parse(JSON.stringify(state)) as SimState;
	copy.tracks.forEach((t, i) => (t.mix.muted = i !== track - 1));
	return copy;
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
