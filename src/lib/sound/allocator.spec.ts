import { describe, expect, it } from 'vitest';
import { VOICE_LIMIT, busyAt, victim, type VoiceSlot } from './allocator';

const voice = (
	track: number,
	start: number,
	off = Infinity,
	end = off + 0.2
): VoiceSlot & { id: string } => ({
	id: `${track}@${start}`,
	track,
	start,
	off,
	end: off === Infinity ? Infinity : end
});

describe('voice allocation (24 voices shared by all tracks)', () => {
	it('has room until the limit, counting voices that are still fading out', () => {
		const voices = [voice(0, 0, 1), voice(1, 0.5)];
		expect(victim(voices, 1.1, 2, 3)).toBeNull();
		expect(busyAt(voices, 1.1)).toHaveLength(2);
		// the first has faded out by 1.3
		expect(busyAt(voices, 1.3)).toHaveLength(1);
		expect(victim(voices, 1.3, 2, 2)).toBeNull();
		expect(VOICE_LIMIT).toBe(24);
	});

	it('takes the voice released longest ago first', () => {
		const voices = [voice(0, 0), voice(1, 0.1, 0.9, 5), voice(2, 0.2, 0.5, 5)];
		expect(victim(voices, 1, 3, 3)?.track).toBe(2);
	});

	it('then the oldest held note of the same track, then the oldest overall', () => {
		const voices = [voice(0, 0), voice(1, 0.1), voice(1, 0.2), voice(2, 0.3)];
		expect(victim(voices, 1, 1, 4)).toMatchObject({ track: 1, start: 0.1 });
		expect(victim(voices, 1, 5, 4)).toMatchObject({ track: 0, start: 0 });
	});

	it('prefers voices that have started by then over ones scheduled after', () => {
		const voices = [voice(0, 2), voice(0, 0.5)];
		expect(victim(voices, 1, 0, 2)?.start).toBe(0.5);
		// nothing has started yet: the earliest scheduled one goes
		expect(victim([voice(0, 2), voice(0, 1.5)], 1, 0, 2)?.start).toBe(1.5);
	});
});
