/**
 * Arrange mode: patterns per track, the 99 scenes and song mode (guide art arrange-003, 020, 028;
 * manual arrange/*).
 */
import type { SimArea } from '../types';

export const arrange: SimArea = {
	id: 'arrange',
	owns: (s) => s.overlay === null && s.sub === null && s.mode === 'arrange',
	frame: (s) => ({
		page: 'text',
		title: `arrange · ${s.banks.arrange} tracks`,
		lines: ['arrange', 'scenes and songs are not drawn yet']
	})
};
