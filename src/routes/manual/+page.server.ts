// The manual's landing page, built at prerender time: the areas (what each covers, how many units,
// where it starts), a few recipes to start from and the rest of the recipes. The manual module itself stays out of the page's
// bundle until the search box is used.
import { getUnit, loadManual, unitTitle } from '$lib/manual';
import type { PageServerLoad } from './$types';

/** Where a newcomer starts: recipes, in the order they build on each other. */
const START = [
	'howto.get-started',
	'howto.first-drum-beat',
	'howto.first-bassline',
	'howto.first-chords',
	'howto.song-from-scenes',
	'howto.loop-one-scene'
];

export const load: PageServerLoad = () => {
	const manual = loadManual();
	return {
		firmware: manual.reference_firmware,
		guide: manual.guide_version,
		stats: {
			units: manual.stats.units,
			facts: manual.stats.facts,
			verified: manual.stats.verified_items
		},
		start: START.flatMap((id) => {
			const unit = getUnit(id);
			return unit ? [{ id, title: unitTitle(unit.title) }] : [];
		}),
		recipes: (manual.areas.find((area) => area.id === 'howto')?.units ?? []).flatMap((id) => {
			const unit = getUnit(id);
			return unit ? [{ id, title: unitTitle(unit.title) }] : [];
		}),
		areas: manual.areas.map((area) => ({
			id: area.id,
			title: area.title,
			description: area.description,
			count: area.units.length,
			first: area.units[0] ?? null
		}))
	};
};
