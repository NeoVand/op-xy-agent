/**
 * Checks our manual's parameter tables against the replica (the truth triangle, docs/AGENT-V2.md):
 * for every parameter with a screen, an encoder and a layer, the simulator is walked to that page
 * from a new project and the name the replica gives that encoder on that layer is compared with the
 * manual's. Deterministic, no model.
 *
 * Where the page is one of the device map's (`src/lib/sim/device-map.ts`, built from the simulator
 * as the agent's `device_map` tool reads it), its path is replayed and its reading of the control
 * is used: the label a turn moves, or for a click what it does (the map names clicks with the
 * manual's own words, so those are compared with what the click changes instead). Pages the map
 * does not cover (the bar menu, the record page, song mode, the settings lists) are walked to with
 * the keys in {@link PLACES} and read the same way here: the value a detent each way changes.
 */
import {
	buildDeviceMap,
	playPath,
	type DeviceMap,
	type MapControl,
	type MapPage
} from '$lib/sim/device-map';
import { buildFrame } from '$lib/sim/frames';
import { frameValues, pageValues, playStep } from '$lib/sim/navigator';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { SimState } from '$lib/sim/params';
import type { ScreenFrame } from '$lib/sim/screen/frame';
import { describeFrame } from '$lib/sim/screen/render';
import type { ManualParameter, ManualUnit } from '$lib/manual';

/**
 * How a parameter compares:
 * - `match`: the replica's name is the manual's (spelling, abbreviations and plurals aside);
 * - `close`: one name contains the other ("bend range" / "bend"), or one of the manual's
 *   alternatives ("category / engine") is the replica's;
 * - `mismatch`: different names;
 * - `missing`: the page has no such control on that layer;
 * - `unlabelled`: the page shows the value but names no encoder (the settings lists);
 * - `review`: a click, whose effect is shown next to the manual's name for a person to judge;
 * - `unreachable`: the walk does not end on the page;
 * - `unmapped`: no page of the replica is known for the manual's screen.
 */
export type ParameterStatus =
	'match' | 'close' | 'mismatch' | 'missing' | 'unlabelled' | 'review' | 'unreachable' | 'unmapped';

/** One parameter of the manual, checked. */
export interface ParameterCheck {
	readonly unit: string;
	readonly screen: string;
	readonly encoder: string;
	readonly layer: string;
	/** The manual's name. */
	readonly name: string;
	/** The replica's page: a device map page id, or one of {@link PLACES}. */
	readonly page: string | null;
	/** The keys from a new project. */
	readonly path: string | null;
	/** What the page says there. */
	readonly shows: string | null;
	/** The replica's name for the control (a turn's label). */
	readonly label: string | null;
	/** What a click does there, or what an unlabelled turn changes. */
	readonly does: string | null;
	readonly status: ParameterStatus;
	/** The comparison in words. */
	readonly detail: string;
}

// ─── names ─────────────────────────────────────────────────────────────────────────────────────

/** Spellings that mean the same word. */
const SYNONYMS: Readonly<Record<string, string>> = {
	env: 'envelope',
	res: 'resonance',
	freq: 'frequency',
	mod: 'modulation',
	lo: 'low',
	hi: 'high',
	quant: 'quantisation',
	quantization: 'quantisation',
	oct: 'octave',
	vol: 'volume',
	lfo: 'lfo',
	fx: 'fx'
};

/** Words that qualify a name without naming it ("quantisation on/off", "mix the"). */
const FILLER = new Set(['on', 'off', 'the', 'of', 'a', 'an']);

/** A name's words: lower case, hyphens and slashes apart, synonyms and plurals folded. */
export function nameWords(name: string): string[] {
	return name
		.toLowerCase()
		.replace(/[–—-]/g, ' ')
		.split(/[^a-z0-9#]+/)
		.filter((w) => w && !FILLER.has(w))
		.map((w) => SYNONYMS[w] ?? w)
		.map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** A manual name's alternatives: "category / engine" is two names; "on/off" stays one. */
const alternatives = (name: string) => name.split(/\s+\/\s+/).filter(Boolean);

const same = (a: readonly string[], b: readonly string[]) =>
	a.length === b.length && a.every((w, i) => w === b[i]);
const within = (a: readonly string[], b: readonly string[]) =>
	a.length > 0 && a.every((w) => b.includes(w));

/** How the manual's name compares with the replica's label for a turn. */
export function compareNames(
	manual: string,
	replica: string
): { status: 'match' | 'close' | 'mismatch'; detail: string } {
	const r = nameWords(replica);
	const names = alternatives(manual);
	const whole = nameWords(manual);
	if (same(whole, r)) return { status: 'match', detail: `both "${replica}"` };
	for (const alt of names) {
		const m = nameWords(alt);
		if (same(m, r) || within(m, r) || within(r, m)) {
			return {
				status: 'close',
				detail: `the manual says "${manual}", the replica "${replica}"`
			};
		}
	}
	return { status: 'mismatch', detail: `the manual says "${manual}", the replica "${replica}"` };
}

/** How the manual's name for a click compares with what the click does on the replica. */
export function compareClick(
	manual: string,
	does: string
): { status: 'match' | 'close' | 'review'; detail: string } {
	const words = nameWords(manual);
	const effect = new Set(nameWords(does));
	const found = words.filter((w) => effect.has(w) || [...effect].some((e) => e.startsWith(w)));
	const detail = `the manual says "${manual}"; on the replica the click: ${does}`;
	if (words.length > 0 && found.length === words.length) return { status: 'match', detail };
	if (found.length > 0) return { status: 'close', detail };
	return { status: 'review', detail };
}

// ─── pages ─────────────────────────────────────────────────────────────────────────────────────

/** The manual's screen name for a device map page (its parameter tables' `screen`), or null. */
export function manualScreenOf(page: MapPage): string | null {
	const id = page.id;
	const m = /^(instrument|auxiliary\.[a-z-]+|mix)\.m([1-4])(\.|$)/.exec(id);
	if (m) return `M${m[2]}`;
	if (id === 'instrument.presets') return 'preset browser';
	if (id === 'tempo' || id === 'com') return id;
	if (id.startsWith('player.')) return 'player';
	return null;
}

/** A page the device map does not cover: the keys that open it and what must be held there. */
interface Place {
	readonly name: string;
	readonly keys: readonly string[];
	/** Keys kept down while the page is read (the bar menu shows while bar is held). */
	readonly held?: readonly string[];
	/** The frame the page must show. */
	readonly frame: ScreenFrame['page'];
	/** What its description must start with, where several pages share a frame. */
	readonly starts?: string;
}

/** The pages the manual's tables name that the device map does not cover, by the manual's screen. */
export const PLACES: Readonly<Record<string, Place>> = {
	bar: { name: 'bar menu (bar held)', keys: [], held: ['key.bar'], frame: 'bar' },
	sample: { name: 'record page (T3)', keys: ['T3', 'sample'], frame: 'sample-record' },
	'sample library': {
		name: 'sample library (shift + sample)',
		keys: ['shift + sample'],
		frame: 'sample-library'
	},
	song: { name: 'song mode', keys: ['arrange', 'shift + arrange'], frame: 'song' },
	'preset settings': {
		name: 'preset settings (shift + instrument)',
		keys: ['shift + instrument'],
		frame: 'system-list',
		starts: 'preset settings'
	},
	'system settings': {
		name: 'system settings (com → M1)',
		keys: ['com', 'M1'],
		frame: 'system-list',
		starts: 'system settings'
	},
	controller: { name: 'controller mode (com → M2)', keys: ['com', 'M2'], frame: 'system-link' }
};

const cloneState = (state: SimState): SimState => JSON.parse(JSON.stringify(state)) as SimState;
const simAt = (state: SimState) => new OpxySim({ state: cloneState(state), now: () => 0 });
const screenOf = (sim: OpxySim) => describeFrame(buildFrame(sim.state));

/** A new project walked to one of {@link PLACES}, its held keys down, or why it did not get there. */
function walkTo(place: Place): { sim: OpxySim; reached: boolean } {
	const sim = new OpxySim({ now: () => 0 });
	for (const keys of place.keys) playStep(sim, { keys });
	for (const id of place.held ?? []) sim.input({ type: 'press', id });
	const frame = buildFrame(sim.state);
	const reached =
		frame.page === place.frame && (!place.starts || describeFrame(frame).startsWith(place.starts));
	return { sim, reached };
}

/** Pages whose description is a row of list columns ("system, screen brightness, 80"), not values. */
const LISTS: ReadonlySet<string> = new Set(['system-list', 'sample-library']);

/** Values the page names: its description's "label value" parts, then the frame's own. */
function valuesOf(sim: OpxySim): Map<string, string> {
	const frame = buildFrame(sim.state);
	const described = LISTS.has(frame.page) ? [] : pageValues(describeFrame(frame));
	return new Map([...described, ...frameValues(frame)]);
}

/** A description's changed part: "system, screen brightness, 80" → "keyboard, velocity, off". */
function changeOf(before: string, after: string): string {
	const a = before.split(/[:,;]\s*/);
	const b = after.split(/[:,;]\s*/);
	const gone = a.filter((part) => !b.includes(part));
	const added = b.filter((part) => !a.includes(part));
	return `${gone.join(', ') || '—'} → ${added.join(', ') || '—'}`;
}

/**
 * What encoder `e` (1–4) does on a page that the device map does not cover: the label of the
 * value a detent each way changes, else the change it makes, else nothing.
 */
export function readControl(
	at: OpxySim,
	e: 1 | 2 | 3 | 4,
	layer: string
): { label: string | null; does: string | null } {
	const shift = layer === 'shift' || layer === 'shift-click';
	const fresh = () => {
		const sim = simAt(at.state);
		if (shift) sim.input({ type: 'press', id: 'key.shift' });
		return sim;
	};
	const before = fresh();
	if (layer === 'click' || layer === 'shift-click') {
		const after = fresh();
		after.click(e);
		const [a, b] = [screenOf(before), screenOf(after)];
		return { label: null, does: a === b ? null : changeOf(a, b) };
	}
	const up = fresh();
	up.turn(e, 1);
	const down = fresh();
	down.turn(e, -1);
	const [v0, v1, v2] = [valuesOf(before), valuesOf(up), valuesOf(down)];
	const labels = [...new Set([...v0.keys(), ...v1.keys(), ...v2.keys()])];
	const moved =
		labels.find((l) => v1.get(l) !== v2.get(l)) ??
		labels.find((l) => v1.get(l) !== v0.get(l) || v2.get(l) !== v0.get(l));
	if (moved) return { label: moved, does: null };
	const [s0, s1, s2] = [screenOf(before), screenOf(up), screenOf(down)];
	if (s1 !== s0 || s2 !== s0) return { label: null, does: changeOf(s0, s1 !== s0 ? s1 : s2) };
	return { label: null, does: null };
}

// ─── checking ──────────────────────────────────────────────────────────────────────────────────

const pathText = (steps: readonly { keys: string; clicks?: number }[]) =>
	steps
		.map((s) => (s.clicks ? `${s.keys} (${s.clicks > 0 ? '+' : ''}${s.clicks})` : s.keys))
		.join(' → ') || '(a new project)';

/** The device map's pages for a unit's screen, the unit's own pages first. */
function pagesFor(map: DeviceMap, unit: string, screen: string): MapPage[] {
	return map.pages
		.filter((p) => (p.units ?? []).includes(unit) && manualScreenOf(p) === screen)
		.sort((a, b) => Number(a.units?.[0] !== unit) - Number(b.units?.[0] !== unit));
}

/** Whether replaying a page's path on a new project ends on the page. */
const reaches = (page: MapPage) => {
	const sim = new OpxySim({ now: () => 0 });
	playPath(sim, page.path);
	return screenOf(sim) === page.screen;
};

/** Checks one parameter on a device map page. */
function onMapPage(p: ManualParameter, unit: string, pages: readonly MapPage[]): ParameterCheck {
	const encoder = Number(p.encoder.slice(1));
	const find = (page: MapPage): MapControl | undefined =>
		page.controls.find((c) => c.layer === p.layer && c.encoder === encoder);
	const page = pages.find(find) ?? pages[0];
	const base = {
		unit,
		screen: p.screen,
		encoder: p.encoder,
		layer: p.layer,
		name: p.name,
		page: page.id,
		path: pathText(page.path),
		shows: page.screen
	};
	if (!reaches(page)) {
		return {
			...base,
			label: null,
			does: null,
			status: 'unreachable',
			detail: `its path no longer ends on the page`
		};
	}
	const control = find(page);
	if (!control) {
		const plain = page.controls.find((c) => c.layer === 'base' && c.encoder === encoder);
		const detail =
			p.layer === 'shift' && plain
				? `no shift layer of ${p.encoder} here: with shift held it turns what it turns alone ("${plain.label}")`
				: `the page has no ${p.layer === 'base' ? '' : `${p.layer} `}control on ${p.encoder}`;
		return { ...base, label: null, does: null, status: 'missing', detail };
	}
	if (p.layer === 'click' || p.layer === 'shift-click') {
		const does = control.does ?? '';
		return { ...base, label: null, does, ...compareClick(p.name, does) };
	}
	const label = control.label ?? '';
	return { ...base, label, does: null, ...compareNames(p.name, label) };
}

/** Checks one parameter on a page the device map does not cover. */
function onPlace(p: ManualParameter, unit: string, place: Place): ParameterCheck {
	const { sim, reached } = walkTo(place);
	const base = {
		unit,
		screen: p.screen,
		encoder: p.encoder,
		layer: p.layer,
		name: p.name,
		page: place.name,
		path: [...place.keys, ...(place.held ?? []).map((id) => `hold ${id.replace('key.', '')}`)].join(
			' → '
		),
		shows: screenOf(sim)
	};
	if (!reached) {
		return {
			...base,
			label: null,
			does: null,
			status: 'unreachable',
			detail: `the keys lead to "${screenOf(sim)}"`
		};
	}
	const e = Number(p.encoder.slice(1)) as 1 | 2 | 3 | 4;
	if (p.layer === 'alt') {
		return { ...base, label: null, does: null, status: 'missing', detail: 'no other view here' };
	}
	const { label, does } = readControl(sim, e, p.layer);
	if (p.layer === 'click' || p.layer === 'shift-click') {
		if (!does) {
			return {
				...base,
				label: null,
				does: null,
				status: 'missing',
				detail: `a click of ${p.encoder} changes nothing here`
			};
		}
		return { ...base, label: null, does, ...compareClick(p.name, does) };
	}
	if (label) return { ...base, label, does: null, ...compareNames(p.name, label) };
	if (does) {
		return {
			...base,
			label: null,
			does,
			status: 'unlabelled',
			detail: `the page names no encoder; ${p.layer === 'shift' ? 'shift + ' : ''}${p.encoder} changes ${does}`
		};
	}
	return {
		...base,
		label: null,
		does: null,
		status: 'missing',
		detail: `${p.layer === 'shift' ? 'shift + ' : ''}${p.encoder} changes nothing here`
	};
}

/** Checks every parameter of the manual's units against the replica. */
export function checkParameters(
	units: readonly ManualUnit[],
	map: DeviceMap = buildDeviceMap()
): ParameterCheck[] {
	return units.flatMap((unit) =>
		unit.parameters.map((p): ParameterCheck => {
			const pages = pagesFor(map, unit.id, p.screen);
			if (pages.length > 0) return onMapPage(p, unit.id, pages);
			const place = PLACES[p.screen];
			if (place) return onPlace(p, unit.id, place);
			return {
				unit: unit.id,
				screen: p.screen,
				encoder: p.encoder,
				layer: p.layer,
				name: p.name,
				page: null,
				path: null,
				shows: null,
				label: null,
				does: null,
				status: 'unmapped',
				detail: `no page of the replica is known for the manual's "${p.screen}" of this unit`
			};
		})
	);
}
