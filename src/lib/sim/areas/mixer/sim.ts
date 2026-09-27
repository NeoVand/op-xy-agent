/**
 * Mix mode pages M2–M4: EQ, saturator and master (manual mix/*; no guide art). Mixer M1 stays in
 * the core.
 */
import type { SimArea } from '../types';

/** Mix pages M1–M4 (manual: mix/overview). */
const MIX_PAGES = ['levels', 'eq', 'saturator', 'master'] as const;

export const mixer: SimArea = {
	id: 'mixer',
	owns: (s) => s.overlay === null && s.sub === null && s.mode === 'mix' && s.pages.mix !== 1,
	frame: (s) => ({
		page: 'text',
		title: `mix · M${s.pages.mix} ${MIX_PAGES[s.pages.mix - 1]}`,
		lines: [`master ${MIX_PAGES[s.pages.mix - 1]}`, 'this page is not drawn yet']
	})
};
