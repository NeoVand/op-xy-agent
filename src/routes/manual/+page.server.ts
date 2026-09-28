// The manual's index, built at prerender time: the areas and their units' titles and summaries.
// The manual module itself stays out of the page's bundle until the search box is used.
import { loadManual } from '$lib/manual';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const manual = loadManual();
	const byId = new Map(manual.units.map((unit) => [unit.id, unit]));
	return {
		firmware: manual.reference_firmware,
		guide: manual.guide_version,
		stats: {
			units: manual.stats.units,
			facts: manual.stats.facts,
			verified: manual.stats.verified_items
		},
		areas: manual.areas.map((area) => ({
			id: area.id,
			title: area.title,
			description: area.description,
			units: area.units.flatMap((id) => {
				const unit = byId.get(id);
				return unit ? [{ id, title: unit.title, summary: unit.summary, status: unit.status }] : [];
			})
		}))
	};
};
