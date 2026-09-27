/**
 * Dev only: hands the /replica bench one of TE's guide pictures (`?guide=<scenario id>`) to compare
 * with the simulator's render of the same state. The pictures are git-ignored research inputs
 * (scripts/fetch-research.sh), so the static build never reads or ships them: outside dev this
 * returns nothing and never looks at the query string (the page is prerendered).
 */
import { dev } from '$app/environment';
import type { PageServerLoad } from './$types';

/** A guide picture as a data URL (`src` null when the research input is missing). */
export interface GuidePicture {
	readonly id: string;
	readonly src: string | null;
}

export const load: PageServerLoad = async ({ url }): Promise<{ guide: GuidePicture | null }> => {
	if (!dev) return { guide: null };
	const id = url.searchParams.get('guide');
	if (!id) return { guide: null };
	const { SCENARIOS } = await import('$lib/sim/scenarios');
	const scenario = SCENARIOS.find((s) => s.id === id);
	if (!scenario || scenario.png === null) return { guide: null };
	const { readFile } = await import('node:fs/promises');
	try {
		const png = await readFile(`research/ui-reference/guide-screens/${scenario.png}`);
		return { guide: { id, src: `data:image/png;base64,${png.toString('base64')}` } };
	} catch {
		return { guide: { id, src: null } };
	}
};
