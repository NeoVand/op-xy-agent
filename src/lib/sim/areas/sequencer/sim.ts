/**
 * The bar menu (hold bar: pattern settings, bars, length, clear), players (arpeggio, hold,
 * maestro) and the pages behind step components and parameter locks (manual sequencer/*,
 * players/*).
 */
import type { SimArea } from '../types';

export const sequencer: SimArea = {
	id: 'sequencer',
	owns: (s) => s.overlay === 'bar' || s.overlay === 'players',
	frame: (s) => ({
		page: 'text',
		title: s.overlay ?? '',
		lines: [`${s.overlay} page`, 'this page is not drawn yet']
	})
};
