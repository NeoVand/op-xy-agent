import { describe, expect, it } from 'vitest';
import { CONTROL_IDS, KEY_IDS } from '$lib/core/opxy';
import { isKeyboardKey, isRemoteControl, remoteRoute } from './mapping';

describe('remoteRoute', () => {
	it('plays the 24 keyboard keys as notes 53–76, left to right', () => {
		const notes = KEY_IDS.filter(isKeyboardKey).map((id) => remoteRoute(id));
		expect(notes).toHaveLength(24);
		expect(notes).toEqual(Array.from({ length: 24 }, (_, i) => ({ kind: 'note', note: 53 + i })));
	});

	it('maps play, stop, the track keys and the pitch-bend pad', () => {
		expect(remoteRoute('key.play')).toEqual({ kind: 'start' });
		expect(remoteRoute('key.stop')).toEqual({ kind: 'stop' });
		expect(remoteRoute('strip.pitchbend')).toEqual({ kind: 'bend' });
		expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => remoteRoute(`track.${n}` as never))).toEqual(
			[1, 2, 3, 4, 5, 6, 7, 8].map((track) => ({ kind: 'track', track }))
		);
	});

	it('has no route for anything else on OS 1.1.33', () => {
		const remote = CONTROL_IDS.filter(isRemoteControl);
		expect(remote).toHaveLength(24 + 2 + 8 + 1);
		for (const id of [
			'key.shift',
			'key.record',
			'key.m1',
			'key.instrument',
			'key.minus',
			'step.1',
			'encoder.1',
			'knob.volume',
			'screen.main'
		] as const) {
			expect(remoteRoute(id), id).toBeNull();
		}
		expect(remoteRoute('nope' as never)).toBeNull();
	});
});
