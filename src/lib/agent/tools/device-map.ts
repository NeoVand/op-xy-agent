/**
 * `device_map` (Phase F4): what each page of the OP-XY holds, from the map exported from the
 * simulator (`knowledge/opxy/device-map.json`, built by `$lib/sim/device-map.ts`): the keys from a
 * new project, what the screen says there, and each encoder per layer with its range and display
 * format, the plan_steps parameter that sets it, its CC and whether MIDI reaches it on OS 1.1.33.
 * Read-only: the agent looks a page up here instead of working encoders and ranges out itself;
 * plan_steps then gives the keys from where the replica stands.
 */
import { z } from 'zod';
import type { DeviceMap, MapControl, MapMidi, MapPage, MapRange } from '$lib/sim/device-map';
import { defineTool, errorResult, jsonResult } from './define';

let loading: Promise<DeviceMap> | undefined;

/** The committed map, loaded on first use (it stays out of the app's first bundle). */
export function loadDeviceMap(): Promise<DeviceMap> {
	loading ??= import('$knowledge/opxy/device-map.json?raw').then(
		(module) => JSON.parse(module.default) as DeviceMap
	);
	return loading;
}

/** Pages shown whole in one answer; the others are named. */
const MAX_PAGES = 4;
/** Controls listed when searching every page for a parameter. */
const MAX_CONTROLS = 12;

const wordsOf = (text: string) => text.toLowerCase().match(/[a-z0-9#]+/g) ?? [];

/** How many of `query`'s words start a word of `text` (so "envelope" finds "envelopes"). */
function score(query: readonly string[], text: string): number {
	const words = wordsOf(text);
	return query.filter((q) => words.some((w) => w.startsWith(q))).length;
}

/** The best matches: those with every word, else the most words, in the map's order. */
function best<T>(items: readonly T[], query: readonly string[], text: (item: T) => string): T[] {
	const scored = items.map((item) => ({ item, score: score(query, text(item)) }));
	const top = Math.max(0, ...scored.map((s) => s.score));
	return top === 0 ? [] : scored.filter((s) => s.score === top).map((s) => s.item);
}

const pageText = (page: MapPage) => `${page.id} ${page.name}`;
const controlText = (control: MapControl) =>
	`${control.label ?? ''} ${control.param ?? ''} ${control.keys}`;

/** A page's path from a new project, as plan_steps lists steps. */
function pathText(page: MapPage): string {
	if (page.path.length === 0) return 'a new project opens here';
	return page.path
		.map((step) =>
			step.clicks === undefined
				? step.keys
				: `${step.keys} ×${Math.abs(step.clicks)} ${step.clicks > 0 ? 'clockwise' : 'counter-clockwise'}`
		)
		.join(', ');
}

function rangeText(range: MapRange): string {
	const text = range.values
		? range.values.join(' | ')
		: range.step !== undefined
			? `${range.first}…${range.last} by ${range.step}${range.fine !== undefined ? ` (${range.fine} pushed in)` : ''}`
			: `${range.first}…${range.last} over ${range.detents} detents (${(range.examples ?? []).join(', ')})`;
	const shows = range.shows?.map(
		(s) => `${s.from === s.to ? s.from : `${s.from}–${s.to}`} as ${s.shows}`
	);
	return shows ? `${text}; the screen writes ${shows.join(', ')}` : text;
}

function midiText(midi: MapMidi | undefined): string {
	if (!midi) return 'no CC';
	const channel =
		midi.channel === 'track'
			? ''
			: midi.channel === 'any'
				? ' (any channel)'
				: ` on channel ${midi.channel}`;
	const reach = {
		answers: 'works over MIDI on OS 1.1.33',
		ignores: 'ignored on OS 1.1.33',
		untested: 'not tried on OS 1.1.33'
	}[midi.reach];
	return `CC${midi.cc}${channel}: ${reach}`;
}

/** A control in one line, without its keys (so encoders that do the same can share one). */
function controlBody(control: MapControl): string {
	const parts = control.range
		? [
				`${control.label}${control.param ? ` [plan_steps: ${control.param}]` : ''}`,
				rangeText(control.range),
				...(control.value !== undefined ? [`now ${control.value}`] : []),
				...(control.needs ? [`needs ${control.needs}`] : []),
				midiText(control.midi)
			]
		: [
				`${control.label ? `${control.label}: ` : ''}${control.does ?? ''}`,
				...(control.midi ? [midiText(control.midi)] : [])
			];
	return [...parts, ...(control.about ? [control.about] : [])].join('; ');
}

/**
 * Controls as lines; neighbouring encoders that do the same on one layer share a line (`click
 * E1…E4`, the key grammar's range).
 */
export function controlLines(controls: readonly MapControl[]): string[] {
	const lines: { gesture: string; body: string; encoders: number[] }[] = [];
	for (const control of controls) {
		const gesture = control.keys.replace(/E[1-4]$/, 'E');
		const body = controlBody(control);
		const last = lines[lines.length - 1];
		const next = last && last.encoders[last.encoders.length - 1] + 1 === control.encoder;
		if (last && next && last.gesture === gesture && last.body === body) {
			last.encoders.push(control.encoder);
		} else lines.push({ gesture, body, encoders: [control.encoder] });
	}
	return lines.map(({ gesture, body, encoders }) => {
		const first = encoders[0];
		const which = encoders.length > 1 ? `${first}…E${encoders[encoders.length - 1]}` : `${first}`;
		return `${gesture}${which}: ${body}`;
	});
}

/** A page as the model reads it. */
function pageView(page: MapPage, controls: readonly MapControl[] = page.controls) {
	return {
		id: page.id,
		name: page.name,
		...(page.track !== undefined ? { track: page.track } : {}),
		keys: pathText(page),
		screen: page.screen,
		...(page.shiftScreen ? { shift: page.shiftScreen } : {}),
		...(page.altScreen ? { other: page.altScreen } : {}),
		...(page.soft ? { soft: page.soft.join(' · ') } : {}),
		...(page.keys ? { opens: page.keys.map((k) => `${k.keys}: ${k.opens}`) } : {}),
		...(page.note ? { note: page.note } : {}),
		controls: controls.length > 0 ? controlLines(controls) : ['no encoder does anything here'],
		...(page.units ? { manual: page.units } : {})
	};
}

/** What `device_map` answers, from the map and the words given. */
export interface MapAnswer {
	readonly content: unknown;
	readonly summary: string;
	readonly found: boolean;
}

/** Looks pages and controls up in the map by the words the agent gives. */
export function lookUp(map: DeviceMap, input: { page?: string; param?: string }): MapAnswer {
	const pageWords = wordsOf(input.page ?? '');
	const paramWords = wordsOf(input.param ?? '');
	const pages = pageWords.length > 0 ? best(map.pages, pageWords, pageText) : map.pages;
	if (pageWords.length === 0 && paramWords.length === 0) {
		return {
			content: {
				firmware: map.firmware,
				pages: map.pages.map((p) => `${p.id}: ${p.name}`),
				hint: 'give page (and param) for a page’s keys, screen and encoders'
			},
			summary: `${map.pages.length} pages`,
			found: true
		};
	}
	if (pages.length === 0) {
		return {
			content: `No page matches "${input.page}". Pages: ${map.pages.map((p) => p.id).join(', ')}`,
			summary: 'no such page',
			found: false
		};
	}
	if (paramWords.length === 0) {
		return {
			content: {
				pages: pages.slice(0, MAX_PAGES).map((p) => pageView(p)),
				...(pages.length > MAX_PAGES ? { more: pages.slice(MAX_PAGES).map((p) => p.id) } : {})
			},
			summary: pages.length === 1 ? pages[0].name : `${pages.length} pages: ${pages[0].name}, …`,
			found: true
		};
	}
	const hits = best(
		pages.flatMap((page) => page.controls.map((control) => ({ page, control }))),
		paramWords,
		({ control }) => controlText(control)
	);
	if (hits.length === 0) {
		return {
			content: `No control on ${pageWords.length > 0 ? `"${input.page}"` : 'any page'} matches "${input.param}".`,
			summary: 'no such control',
			found: false
		};
	}
	const byPage = new Map<MapPage, MapControl[]>();
	for (const { page, control } of hits.slice(0, MAX_CONTROLS)) {
		byPage.set(page, [...(byPage.get(page) ?? []), control]);
	}
	return {
		content: {
			pages: [...byPage].map(([page, controls]) => pageView(page, controls)),
			...(hits.length > MAX_CONTROLS ? { more: `${hits.length - MAX_CONTROLS} more controls` } : {})
		},
		summary: `${input.param}: ${hits.length} control${hits.length === 1 ? '' : 's'} on ${byPage.size} page${byPage.size === 1 ? '' : 's'}`,
		found: true
	};
}

export const deviceMapTool = defineTool({
	name: 'device_map',
	label: 'device map',
	kind: 'read',
	// the strict tool set sits at the API's grammar size limit: with this one strict too, every
	// request was refused ("compiled grammar is too large"); zod still checks the two strings
	strict: false,
	description:
		'What a page of the OP-XY holds, from the device map exported from the simulator. Pages: every engine’s M1, the envelopes and play mode (M2), filter and sends (M3), each LFO type (M4), the preset browser and type lists, every auxiliary track’s pages, the mixer, tempo, the players, project and COM. For each: the keys from a new project, what the screen shows there, and each encoder per layer (turn, with shift, the other view, click) with its label, range and display format, the plan_steps parameter that sets it, its CC and whether MIDI reaches it on OS 1.1.33. page picks pages by name ("filter", "duck lfo", "tape", "fx i", "mix m2", "prism"); param picks controls by label ("cutoff", "size", "fx ii send"); both narrow a page to its control; neither lists the pages.',
	input: z.object({
		page: z
			.string()
			.min(1)
			.max(60)
			.optional()
			.describe(
				'Words that pick pages: a page, engine, LFO type, effect or track ("filter", "duck lfo", "tape", "mix m2"); leave out to search every page'
			),
		param: z
			.string()
			.min(1)
			.max(60)
			.optional()
			.describe(
				'Words that pick controls by label ("cutoff", "size", "release"); leave out for whole pages'
			)
	}),
	async run(input) {
		const answer = lookUp(await loadDeviceMap(), input);
		if (!answer.found) return errorResult(String(answer.content), answer.summary);
		return jsonResult(answer.content, answer.summary);
	}
});

/** The device map tool. */
export const DEVICE_MAP_TOOLS = [deviceMapTool];
