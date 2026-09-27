/**
 * Auxiliary tracks (T1–T8 with auxiliary): brain, punch-in FX, external MIDI, external CV,
 * external audio, tape, FX I and FX II, with their M1–M4 pages (guide art auxiliary-004 … 130).
 */
import { AUX_NAMES } from '../../params';
import type { SimArea } from '../types';

export const auxiliary: SimArea = {
	id: 'auxiliary',
	owns: (s) => s.overlay === null && s.sub === null && s.mode === 'auxiliary',
	frame: (s) => ({
		page: 'text',
		title: `auxiliary · T${s.auxTrack + 1} ${AUX_NAMES[s.auxTrack]} · M${s.pages.auxiliary}`,
		lines: [AUX_NAMES[s.auxTrack], 'auxiliary pages are not drawn yet']
	})
};
