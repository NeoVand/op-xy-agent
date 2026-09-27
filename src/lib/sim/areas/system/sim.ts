/**
 * The project and COM sub-pages (project folder, config, rename, save as; system settings,
 * controller, devices, MTP, bluetooth), the preset browser (shift + Tn) and preset settings (shift
 * + instrument) (guide art project-004 … 019, com-014 … 039, instrument-103, 118).
 */
import type { SimArea } from '../types';

export const system: SimArea = {
	id: 'system',
	owns: (s) => s.sub !== null,
	frame: (s) => ({
		page: 'text',
		title: s.sub ?? '',
		lines: [s.sub ?? '', 'this page is not drawn yet']
	})
};
