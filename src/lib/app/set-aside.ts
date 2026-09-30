/**
 * The replica set aside for an example (the chat's examples play on a new project, as they were
 * recorded): the user's project, the selected track and mode wait while a new project stands in,
 * and saving holds meanwhile, so nothing the example does can take the place of the user's work,
 * even if the page closes. Putting it back restores all of it exactly.
 */
import { restore, snapshot } from '$lib/sim/areas/system/projects';
import type { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { defaultState } from '$lib/sim/params';
import type { SimPersistence } from './persistence';

/** Sets the replica aside for a new project; returns what puts the user's back. */
export function setAside(
	sim: OpxySim,
	persistence?: Pick<SimPersistence, 'hold'> | null
): () => void {
	const s = sim.state;
	const release = persistence?.hold();
	const project = snapshot(s);
	const name = s.project.name;
	const { track, mode } = s;
	s.transport.playing = false;
	const fresh = defaultState();
	restore(s, snapshot(fresh), fresh.project.name);
	s.track = fresh.track;
	s.mode = fresh.mode;
	let back = false;
	return () => {
		if (back) return;
		back = true;
		s.transport.playing = false;
		restore(s, project, name);
		s.track = track;
		s.mode = mode;
		release?.();
	};
}
