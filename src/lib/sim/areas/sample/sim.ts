/**
 * The sample key and the sampler engines: recording, the one-shot sampler, drum sampler and
 * multisampler editing, slicing (transient, even, tap) and the sample library browser (guide art
 * sample-003 … 140).
 */
import type { SimArea } from '../types';

export const sample: SimArea = {
	id: 'sample',
	owns: (s) => s.overlay === 'sample',
	frame: () => ({
		page: 'text',
		title: 'sample',
		lines: ['sample page', 'this page is not drawn yet']
	})
};
