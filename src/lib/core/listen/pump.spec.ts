// The pump: a tone ducked on every beat is heard as one, with its depth; a steady tone, and notes on
// the offbeat (which rise and fall within the beat), are not. A kick on the beat over a ducked bass
// still pumps, so do hats over one (heard in the low end), and a held pad with no onsets is folded on
// the set tempo.
import { describe, expect, it } from 'vitest';
import { pumpStats } from './pump';

const RATE = 16000;
const BPM = 120;
const BEAT = 60 / BPM;

/** `seconds` of a tone at `hz`, its gain at each moment from `gain(t)`. */
function tone(seconds: number, hz: number, gain: (t: number) => number): Float32Array {
	const out = new Float32Array(Math.round(seconds * RATE));
	for (let i = 0; i < out.length; i++) {
		const t = i / RATE;
		out[i] = 0.5 * gain(t) * Math.sin(2 * Math.PI * hz * t);
	}
	return out;
}

/** A duck: down to `floor` at each beat, back to full over `release` seconds. */
const duck =
	(floor: number, release: number, offset = 0) =>
	(t: number) => {
		const since = (((t - offset) % BEAT) + BEAT) % BEAT;
		return since >= release ? 1 : floor + (1 - floor) * (since / release);
	};

const add = (a: Float32Array, b: Float32Array) => a.map((v, i) => v + (b[i] ?? 0));

describe('pumpStats', () => {
	it('hears a tone ducked on every beat, and how deep', () => {
		const bass = tone(8, 110, duck(0.25, 0.4));
		const pump = pumpStats([bass], RATE, BPM, 0);
		expect(pump).not.toBeNull();
		expect(pump!.depthDb).toBeGreaterThan(8);
		expect(pump!.lowAt).toBeLessThan(0.2);
	});

	it('hears nothing in a steady tone or in notes on the offbeat', () => {
		expect(pumpStats([tone(8, 110, () => 1)], RATE, BPM, 0)).toBeNull();
		// a 150 ms note on each "and", silence between
		const offbeat = tone(8, 110, (t) => {
			const since = t % BEAT;
			return since >= BEAT / 2 && since < BEAT / 2 + 0.15 ? 1 : 0;
		});
		expect(pumpStats([offbeat], RATE, BPM, 0)).toBeNull();
		expect(pumpStats([offbeat], RATE, BPM, null)).toBeNull();
	});

	it('still hears it under a kick on the beat', () => {
		const kick = tone(8, 55, (t) => {
			const since = t % BEAT;
			return since < 0.12 ? 1.6 * (1 - since / 0.12) : 0;
		});
		const bass = tone(8, 110, duck(0.2, 0.42));
		expect(pumpStats([add(kick, bass)], RATE, BPM, 0)?.depthDb).toBeGreaterThan(5);
		expect(pumpStats([add(kick, bass)], RATE, BPM, null)?.depthDb).toBeGreaterThan(5);
	});

	it('hears it in a mix whose hats would break the swell, in the low end', () => {
		// a 5 kHz tick on every eighth, loud, over the ducked bass
		const hats = tone(8, 5000, (t) => (t % (BEAT / 2) < 0.02 ? 1.5 : 0));
		const bass = tone(8, 110, duck(0.2, 0.42));
		expect(pumpStats([add(hats, bass)], RATE, BPM, null)?.depthDb).toBeGreaterThan(5);
		// and the hats over a steady bass are no pump
		expect(
			pumpStats(
				[
					add(
						hats,
						tone(8, 110, () => 1)
					)
				],
				RATE,
				BPM,
				null
			)
		).toBeNull();
	});

	it('folds a take with no beat grid on the set tempo, wherever its beats fall', () => {
		const pad = tone(8, 220, duck(0.3, 0.35, 0.137));
		expect(pumpStats([pad], RATE, BPM, null)).not.toBeNull();
		// too short to tell
		expect(pumpStats([tone(1, 110, duck(0.25, 0.4))], RATE, BPM, 0)).toBeNull();
	});
});
