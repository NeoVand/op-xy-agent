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

/** The page value 0–99 whose stage time is nearest `seconds` (the attack's 2 s is about 53). */
export function nearestStage(stage: EnvelopeStage, seconds: number): number {
	let best = 0;
	for (let v = 1; v <= 99; v++) {
		const err = Math.abs(Math.log(stageSeconds(stage, v) / seconds));
		if (err < Math.abs(Math.log(stageSeconds(stage, best) / seconds))) best = v;
	}
	return best;
}

/** An envelope stage's setting by its name: "attack", "amp release", "filter envelope decay". */
const STAGE_PARAM = /^(?:(?:amp|filter)(?: envelope)? )?(attack|decay|release)$/i;
const STAGE_TIME = /^(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|seconds?)$/i;

/**
 * An envelope stage's setting read in time. Given as a time ("amp attack", "2 s"): the nearest page
 * value, and a line that says so (an agent wanting a swell of about two seconds guessed 54 from two
 * anchors and got 2.3 s); given as a page value: the time it takes, and which way the release runs
 * (an agent set a release of 12 keeping in mind by itself that lower is longer). Null for anything
 * else, a duck's release among them (it runs on another law).
 */
export function stageSetting(
	param: string,
	value: string | number
): { readonly value: string | number; readonly line: string } | null {
	const name = param.trim();
	const stage = STAGE_PARAM.exec(name)?.[1].toLowerCase() as EnvelopeStage | undefined;
	if (!stage) return null;
	const text = String(value).trim();
	if (/^\d+$/.test(text) && Number(text) <= 99) {
		const turns =
			stage === 'release' ? ' (the release runs the other way: a lower value lasts longer)' : '';
		return {
			value,
			line: `${name} ${text}: about ${timeText(stageSeconds(stage, Number(text)))}${turns}`
		};
	}
	const time = STAGE_TIME.exec(text);
	if (!time) return null;
	const page = nearestStage(stage, Number(time[1]) / (time[2].toLowerCase() === 'ms' ? 1000 : 1));
	return {
		value: page,
		line: `${name} ${text}: the page value ${page} (of 0–99) is the nearest, ${timeText(stageSeconds(stage, page))}`
	};
}
