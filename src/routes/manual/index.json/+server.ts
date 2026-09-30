// The manual's pages by title, as a small prerendered file: the home page's command palette opens
// them without bundling the manual itself.
import { json } from '@sveltejs/kit';
import { loadManual, unitTitle } from '$lib/manual';

export const prerender = true;

export function GET() {
	const manual = loadManual();
	const areas = new Map(manual.areas.flatMap((area) => area.units.map((id) => [id, area.title])));
	return json(
		manual.units.map((unit) => ({
			id: unit.id,
			title: unitTitle(unit.title),
			area: areas.get(unit.id) ?? ''
		}))
	);
}
