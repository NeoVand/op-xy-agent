// Pointing at keys in the text rings them on the replica: one pulses, a group gets candidate
// rings, and only this pointer's rings come off again.
import { describe, expect, it } from 'vitest';
import type { ControlId } from '$lib/core/opxy';
import type { HighlightKind } from '../animation';
import { replicaPointer } from './pointing';

function fakeReplica() {
	const marks = new Map<ControlId, HighlightKind>();
	return {
		marks,
		animating: false,
		highlight: (id: ControlId) => marks.get(id),
		setHighlight(id: ControlId, kind: HighlightKind | null) {
			if (kind === null) marks.delete(id);
			else marks.set(id, kind);
		}
	};
}

describe('replicaPointer', () => {
	it('pulses one key, rings a group as candidates, and clears the last on the next call', () => {
		const replica = fakeReplica();
		const point = replicaPointer(replica);
		point(['key.m3']);
		expect([...replica.marks]).toEqual([['key.m3', 'press']]);
		point(['encoder.1', 'encoder.2']);
		expect([...replica.marks]).toEqual([
			['encoder.1', 'candidate'],
			['encoder.2', 'candidate']
		]);
		point(null);
		expect(replica.marks.size).toBe(0);
	});

	it('leaves rings it did not put there', () => {
		const replica = fakeReplica();
		const point = replicaPointer(replica);
		replica.setHighlight('key.shift', 'hold');
		point(['key.shift', 'key.m1']);
		expect(replica.marks.get('key.shift')).toBe('hold');
		// an animation took M1 over meanwhile
		replica.setHighlight('key.m1', 'hold');
		point(null);
		expect([...replica.marks]).toEqual([
			['key.shift', 'hold'],
			['key.m1', 'hold']
		]);
	});

	it('rings nothing while the replica plays an animation', () => {
		const replica = fakeReplica();
		replica.animating = true;
		replicaPointer(replica)(['key.m3']);
		expect(replica.marks.size).toBe(0);
	});
});
