/**
 * Settings in the words plan_steps takes and the manual's recipes write (`set:` on a step): a name,
 * a value and, where it is not an instrument track's parameter, the part of the device, the track
 * (1–16, 9–16 the auxiliary ones), the M-page and a sampler's key. {@link settingGoal} turns one
 * into the navigator's goal, so the agent's tool and the recipes' test read settings alike. Pure,
 * with no runtime imports, so the agent layer can use it without loading the simulator.
 */
import type { PageArea, SettingGoal } from './navigator';
import type { PageNumber } from './params';

/** Where a setting lives, in plan_steps' words. */
export type SettingArea = 'instrument' | 'tempo' | PageArea;

/** The parts of the device a setting can name, for schemas that list them. */
export const SETTING_AREAS: readonly SettingArea[] = [
	'instrument',
	'tempo',
	'auxiliary',
	'mix',
	'player',
	'arrange',
	'bar',
	'sample',
	'com',
	'project'
];

/** A setting as plan_steps takes it and a recipe's step writes it. */
export interface SettingSpec {
	readonly param: string;
	readonly value: number | string;
	readonly area?: SettingArea;
	/** 1–16 (9–16 the auxiliary tracks); default: the selected track. */
	readonly track?: number;
	readonly page?: number;
	/** A sampler track's key (a drum key, a zone), or the drum key slicing starts from. */
	readonly key?: number | string;
	/** An instrument parameter's lock on one pattern step (1–64), the track's value kept. */
	readonly step?: number;
}

/**
 * The navigator's goal for a setting, or why there is none. `selected` is the track the replica
 * has selected (1–16), the default for an instrument parameter; the pages of the other areas
 * default to their own selected track.
 */
export function settingGoal(spec: SettingSpec, selected = 1): SettingGoal | string {
	const track = spec.track;
	const area = spec.area ?? ((track ?? selected) > 8 ? 'auxiliary' : 'instrument');
	const page = spec.page as PageNumber | undefined;
	const extra = {
		...(page ? { page } : {}),
		...(spec.key !== undefined ? { key: spec.key } : {})
	};
	const value = { label: spec.param, value: spec.value, ...extra };
	const eight = (t: number) => ((t - 1) % 8) + 1;
	switch (area) {
		case 'instrument':
		case 'tempo': {
			const t = track ?? selected;
			if (t > 8 && area === 'instrument') {
				return 'only instrument tracks (1–8) have these parameters';
			}
			// tempo values belong to no track
			return {
				track: Math.min(t, 8),
				param: spec.param,
				value: spec.value,
				...extra,
				...(spec.step !== undefined && area === 'instrument' ? { step: spec.step } : {})
			};
		}
		case 'auxiliary':
			// auxiliary pages number their tracks 1–8
			return { area, ...(track === undefined ? {} : { track: eight(track) }), ...value };
		case 'player':
		case 'sample':
			if (track !== undefined && track > 8) {
				return area === 'player'
					? 'players are on instrument tracks 1–8'
					: 'sampling is on instrument tracks 1–8';
			}
			return { area, ...(track === undefined ? {} : { track }), ...value };
		case 'com':
			return { area, ...value };
		default:
			// mix M1, arrange and the bar menu take all sixteen
			return { area, ...(track === undefined ? {} : { track }), ...value };
	}
}
