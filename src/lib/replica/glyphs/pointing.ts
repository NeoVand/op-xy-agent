/**
 * Rings on the replica the controls a reader points at in the text, so a key drawn in a sentence
 * shows where it sits on the device: one control pulses like a key about to be pressed, a group
 * (`Tn`, `E1…E4`, a whole combo) gets the dashed ring of candidates. Each call replaces the last;
 * null takes the rings off. Only rings this pointer put there come off (an animation started in
 * between keeps its own), and nothing is ringed while the replica plays an animation.
 */
import type { ControlId } from '$lib/core/opxy';
import type { HighlightKind } from '../animation';
import type { ReplicaState } from '../state.svelte';

/** What {@link replicaPointer} needs of a replica. */
export type PointableReplica = Pick<ReplicaState, 'highlight' | 'setHighlight' | 'animating'>;

/** A function to hand `KeyCombo`'s `onpoint`: it rings `ids` on `replica`. */
export function replicaPointer(
	replica: PointableReplica
): (ids: readonly ControlId[] | null) => void {
	let shown: { id: ControlId; kind: HighlightKind }[] = [];
	return (ids) => {
		for (const { id, kind } of shown) {
			if (replica.highlight(id) === kind) replica.setHighlight(id, null);
		}
		shown = [];
		if (!ids || ids.length === 0 || replica.animating) return;
		const kind: HighlightKind = ids.length === 1 ? 'press' : 'candidate';
		for (const id of ids) {
			if (replica.highlight(id)) continue;
			replica.setHighlight(id, kind);
			shown.push({ id, kind });
		}
	};
}
