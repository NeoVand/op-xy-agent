// A slow attack against the notes it sounds under: said when they end before it does, or reach
// full level only near their end; nothing for notes that outlast it.
import { describe, expect, it } from 'vitest';
import { ringNote, swellNote, tailNote } from './swell';

const amp = (attack: number, release = 33) =>
	`amp envelope: attack ${attack}, decay 96, sustain 99, release ${release}`;

describe('swellNote', () => {
	it('says notes end before a slow attack does', () => {
		// attack 57 is about 3.2 s; a bar at 120 bpm is 2 s
		expect(swellNote(8, amp(57), [{ length: 16 }], 1, 120)).toBe(
			"T8's amp attack (57 on its page) takes 3.2 s, longer than its longest note (2 s at 120 bpm): its notes end before they reach full level. Longer notes, a slower tempo or a shorter attack let them."
		);
	});

	it('says a note reaches full level only near its end', () => {
		expect(swellNote(8, amp(57), [{ length: 32 }], 1, 120)).toMatch(
			/\(57 on its page\) takes 3\.2 s and its longest note lasts 4 s at 120 bpm, so it reaches full level only near its end/
		);
	});

	it('says nothing for notes that outlast the attack, or a quick attack', () => {
		expect(swellNote(8, amp(57), [{ length: 64 }], 1, 120)).toBeNull();
		expect(swellNote(8, amp(20), [{ length: 1 }], 1, 120)).toBeNull();
	});
});

describe('tailNote', () => {
	// C major then F major then G, a bar each at 120 bpm
	const chord = (step: number, notes: number[], length = 16) =>
		notes.map((note) => ({ step, length, note }));
	const changes = [
		...chord(1, [60, 64, 67]),
		...chord(17, [60, 65, 69]),
		...chord(33, [62, 67, 71])
	];

	it('says a long release rings each chord on under the next', () => {
		// release 30 is about 3.2 s (an agent's pad read Csus4 at every change)
		expect(tailNote(7, amp(35, 30), changes, 1, 120)).toMatch(
			/^T7's amp release \(30 on its page, where a lower value lasts longer\) takes 3\.\d s to die away from each note's end, at any tempo, so at 120 bpm each chord rings on under the next: /
		);
	});

	it('says nothing for a short release, gaps it dies in, or one chord held on', () => {
		expect(tailNote(7, amp(35, 90), changes, 1, 120)).toBeNull();
		// a bar of silence between chords is longer than half the release
		const gapped = [...chord(1, [60, 64, 67], 4), ...chord(33, [60, 65, 69], 4)];
		expect(tailNote(7, amp(35, 60), gapped, 1, 120)).toBeNull();
		// the same chord again: nothing of it is left to ring under another
		const same = [...chord(1, [60, 64, 67]), ...chord(17, [60, 64, 67])];
		expect(tailNote(7, amp(35, 30), same, 1, 120)).toBeNull();
	});
});

describe('ringNote', () => {
	// chord stabs a step long, every 3 steps, on a held-up sound with a long release
	const stabs = [1, 4, 7, 10, 13, 16].flatMap((step) =>
		[60, 64, 67].map((note) => ({ step, length: 1, note }))
	);
	const env = (sustain: number, release: number) =>
		`amp envelope: attack 00, decay 30, sustain ${sustain}, release ${release}`;

	it('says short chords ring on past the next strike', () => {
		expect(ringNote(6, env(47, 60), stabs, 1, 120)).toMatch(
			/^T6's chords are written short \(most 1 step, 0\.1 s at 120 bpm\), but its amp sustain \(47\) holds them and its release \(60 on its page\) rings about 0\.\d s past each, into the next strike 0\.4 s later: they sound longer than written\./
		);
	});

	it('says nothing for a sound that dies on its own, a short release, held chords or single notes', () => {
		// a pluck's low sustain: each stab dies by itself
		expect(ringNote(4, env(11, 69), stabs, 1, 120)).toBeNull();
		expect(ringNote(6, env(47, 95), stabs, 1, 120)).toBeNull();
		const held = stabs.map((n) => ({ ...n, length: 3 }));
		expect(ringNote(6, env(47, 60), held, 1, 120)).toBeNull();
		const line = [1, 4, 7, 10, 13, 16].map((step) => ({ step, length: 1, note: 60 }));
		expect(ringNote(6, env(47, 60), line, 1, 120)).toBeNull();
	});
});
