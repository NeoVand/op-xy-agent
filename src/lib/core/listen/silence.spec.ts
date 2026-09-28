// Silence and dropouts: silent stretches at the start, in the middle and at the end are measured to
// a frame; a noise floor counts as silence; glitches cut into a tone are found where they are, while
// notes that fade out and rest are not glitches.
import { describe, expect, it } from 'vitest';
import { chord, concat, noise, silence, sine } from './signals';
import { silenceStats } from './silence';

const SR = 44100;

describe('silenceStats', () => {
	it('measures silence at the ends and between sounds', () => {
		const tone = () => sine(330, 1, SR, 0.3);
		const x = concat(silence(0.5, SR), tone(), silence(0.3, SR), tone(), silence(0.7, SR));
		const s = silenceStats([x, x], SR);
		expect(s.silent).toBe(false);
		expect(s.leadingSeconds).toBeCloseTo(0.5, 2);
		expect(s.trailingSeconds).toBeCloseTo(0.7, 2);
		expect(s.longestGapSeconds).toBeCloseTo(0.3, 2);
		expect(s.silentSeconds).toBeCloseTo(1.5, 1);
		expect(s.dropoutCount).toBe(0);
	});

	it('counts a noise floor as silence', () => {
		const floor = noise('white', 2, SR, { rms: 1e-4 });
		expect(silenceStats([floor], SR)).toMatchObject({ silent: true, leadingSeconds: 2 });
		expect(silenceStats([new Float32Array(SR)], SR)).toMatchObject({
			silent: true,
			silentSeconds: 1,
			trailingSeconds: 1,
			longestGapSeconds: 0
		});
	});

	it('finds glitches cut into a tone', () => {
		const x = sine(440, 1.5, SR, 0.3);
		const cuts = [0.3137, 0.7021, 1.1];
		for (const t of cuts) x.fill(0, Math.round(t * SR), Math.round((t + 0.005) * SR));
		const s = silenceStats([x, x], SR);
		expect(s.dropoutCount).toBe(3);
		s.dropouts.forEach((d, i) => {
			expect(d.time).toBeCloseTo(cuts[i], 3);
			expect(d.ms).toBeCloseTo(5, 0);
		});
		// a gap longer than a glitch is a rest, not a dropout
		const rest = sine(440, 1, SR, 0.3);
		rest.fill(0, SR / 2, SR / 2 + Math.round(0.05 * SR));
		expect(silenceStats([rest], SR).dropoutCount).toBe(0);
	});

	it('does not take notes that fade out for glitches', () => {
		const notes = concat(
			...Array.from({ length: 12 }, () =>
				concat(
					chord(['C4'], 0.1, SR, { amplitude: 0.3, wave: 'saw', fade: 0.005 }),
					silence(0.01, SR)
				)
			)
		);
		expect(silenceStats([notes], SR).dropoutCount).toBe(0);
	});

	it('handles an empty recording', () => {
		expect(silenceStats([new Float32Array(0)], SR)).toMatchObject({
			silent: true,
			dropoutCount: 0
		});
	});
});
