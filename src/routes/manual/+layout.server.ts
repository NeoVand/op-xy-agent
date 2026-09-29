// The manual's navigation, built at prerender time: every area with its units' titles, for the
// sidebar every manual page shares.
import { loadManual, unitTitle } from '$lib/manual';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
	const manual = loadManual();
	const titles = new Map(manual.units.map((unit) => [unit.id, unitTitle(unit.title)]));
	return {
		nav: manual.areas.map((area) => ({
			id: area.id,
			title: area.title,
			units: area.units.flatMap((id) => {
				const title = titles.get(id);
				return title ? [{ id, title }] : [];
			})
		}))
	};
};
