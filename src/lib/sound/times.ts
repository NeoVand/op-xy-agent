/**
 * An envelope's stages as times one reads ("attack 50" is about 1.4 s), on the laws measured on the
 * owner's unit (`mapping.ts`, research 60 §3). An agent set a pad's attack to 75 for "a slow swell"
 * unaware that it takes about 24 s; the replica's change lines and read_sound say the time now.
 */
import { envelopeSeconds } from './mapping';

/** The envelope stages that take time (sustain is a level). */
export type EnvelopeStage = 'attack' | 'decay' | 'release';

/** A stage's time at its page value 0–99: the attack to full level, a decay or release nearly out. */
export function stageSeconds(stage: EnvelopeStage, value: number): number {
	return envelopeSeconds({ attack: value, decay: value, sustain: 0, release: value })[stage];
}

/** "8 ms", "0.4 s", "1.4 s", "24 s", "6 min". */
export function timeText(seconds: number): string {
	if (seconds < 0.1) return `${Math.max(1, Math.round(seconds * 1000))} ms`;
	if (seconds < 10) return `${Math.round(seconds * 10) / 10} s`;
	if (seconds < 90) return `${Math.round(seconds)} s`;
	return `${Math.round(seconds / 60)} min`;
}

/** An envelope page's stages as times ("attack 1.4 s, decay 1.6 s, release 3.2 s"), or null. */
export function envelopeTimes(reading: string): string | null {
	const parts = (['attack', 'decay', 'release'] as const).flatMap((stage) => {
		const m = new RegExp(`\\b${stage} (\\d+)`).exec(reading);
		return m ? [`${stage} ${timeText(stageSeconds(stage, Number(m[1])))}`] : [];
	});
	return parts.length > 0 ? parts.join(', ') : null;
}
