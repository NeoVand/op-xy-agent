/**
 * What a parameter lock on a drum track reaches: a lock is the whole step's, so every sound on
 * that step takes it. An agent sent "the snare only" to the delay by locking the send on the
 * snare's steps and told the user the hats stayed dry, though hats played on those steps too.
 */
import type { VirtualOpxy } from './virtual-opxy';

/** A sentence when locks on `steps` of `track` reach more than one sound; null otherwise. */
export function lockReach(
	virtual: VirtualOpxy,
	track: number,
	steps: readonly number[]
): string | null {
	if (track > 8 || virtual.status().tracks[track - 1]?.engine !== 'drum') return null;
	const p = virtual.readPattern(track);
	const shared = [...new Set(steps)].flatMap((step) => {
		const sounds = [
			...new Set(p.notes.filter((n) => n.step === step).map((n) => n.sound ?? String(n.note)))
		];
		return sounds.length > 1 ? [`step ${step}: ${sounds.join(', ')}`] : [];
	});
	return shared.length
		? `A lock is the whole step's on a drum track, so it reaches every sound there: ${shared.join('; ')}. To lock one sound alone, give it steps of its own, or put it on a track of its own (T2 is a second drum track, with a kit of its own).`
		: null;
}
