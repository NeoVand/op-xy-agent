// One unit of the manual, built at prerender time for every unit.
import { error } from '@sveltejs/kit';
import { getUnit, loadManual, unitTitle } from '$lib/manual';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => loadManual().units.map((unit) => ({ id: unit.id }));

export const load: PageServerLoad = ({ params }) => {
	const unit = getUnit(params.id);
	if (!unit) error(404, `the manual has no unit ${params.id}`);
	const manual = loadManual();
	const area = manual.areas.find((a) => a.id === unit.area);
	const siblings = area?.units ?? [];
	const at = siblings.indexOf(unit.id);
	const titleOf = (id: string | undefined) => {
		const other = id === undefined ? undefined : getUnit(id);
		return other ? { id: other.id, title: unitTitle(other.title) } : null;
	};
	return {
		unit,
		title: unitTitle(unit.title),
		area: area ? { id: area.id, title: area.title } : null,
		prev: titleOf(siblings[at - 1]),
		next: titleOf(siblings[at + 1]),
		// every unit's title, for citations in the text and the related list
		titles: Object.fromEntries(manual.units.map((u) => [u.id, unitTitle(u.title)])),
		firmware: manual.reference_firmware
	};
};
