/**
 * Reads one unit file and checks everything that can be checked without the other units: the
 * front-matter schema, key combos (canonical spelling in the grammar of `core/opxy/keys.ts`),
 * sources, confidence, firmware tags, status rules and parameter CCs. Produces the normalised
 * {@link ManualUnit} that goes into manual.json. Cross-unit checks live in `build.ts`.
 */
import type { z } from 'zod';
import { laneToCc, type LaneLayer, type LaneModule, type LaneEncoder } from '$lib/core/opxy/ccmap';
import type { Confidence } from '$lib/core/opxy/common.schema';
import { compareFirmware } from '$lib/core/opxy/firmware';
import type { ControlId } from '$lib/core/opxy/ids';
import { formatKeys, keyControlIds, tryParseKeys } from '$lib/core/opxy/keys';
import { YamlError } from './errors';
import type { OfficialCorpus } from './official';
import {
	AREA_IDS,
	UnitFrontMatterSchema,
	type ManualParameter,
	type ManualProcedure,
	type ManualSource,
	type ManualUnit,
	type ParameterLayer,
	type UnitFrontMatter
} from './schema';
import { isOfficial, parseSource, type ParsedSource } from './sources';
import { parseFrontMatter } from './yaml';

/** A problem found while building the manual. */
export interface ManualIssue {
	readonly severity: 'error' | 'warning';
	/** Repo-relative file. */
	readonly file: string;
	/** Unit id, when known. */
	readonly unit?: string;
	/** Where in the unit (`facts[2].source`, `body`) or `line:column`. */
	readonly where?: string;
	readonly message: string;
}

/** A unit source file. */
export interface UnitFile {
	/** Repo-relative path: `knowledge/manual/units/<area>/<slug>.md`. */
	readonly path: string;
	readonly text: string;
}

/** Everything unit checks need to know besides the unit itself. */
export interface CheckContext {
	/** Known OS releases (`1.0.9` … `1.1.33`). */
	readonly versions: ReadonlySet<string>;
	/** The guide version units are checked against (`1.1.15`). */
	readonly guideVersion: string;
	/** The local scrape, or null (CI): then guide anchors cannot be checked. */
	readonly official: OfficialCorpus | null;
	/** Research notes: repo path → GitHub heading slugs. */
	readonly research: ReadonlyMap<string, ReadonlySet<string>>;
}

/** Where units live, relative to the repo root. */
export const UNITS_DIR = 'knowledge/manual/units';

/** Words above which a unit body gets a warning (keep units atomic; split long ones). */
export const BODY_WORD_LIMIT = 180;

const DEFAULT_ORDER = 100;

type Reporter = (
	where: string | undefined,
	message: string,
	severity?: 'error' | 'warning'
) => void;

/** Formats zod issues as `path: message`. */
function zodIssues(error: z.ZodError): { where: string; message: string }[] {
	return error.issues.map((issue) => ({
		where: issue.path.map(String).join('.') || '(front-matter)',
		message: issue.message
	}));
}

/** Parsed front-matter plus body, with the reporter bound to the file. */
export interface ParsedUnit {
	readonly file: string;
	readonly data: UnitFrontMatter;
	readonly body: string;
}

/**
 * Parses a unit file: YAML subset, schema, and path ↔ id ↔ area agreement.
 * @returns undefined when the file is unusable (issues explain why)
 */
export function parseUnitFile(file: UnitFile, issues: ManualIssue[]): ParsedUnit | undefined {
	const report = (where: string | undefined, message: string) =>
		issues.push({ severity: 'error', file: file.path, where, message });
	let parsed: ReturnType<typeof parseFrontMatter>;
	try {
		parsed = parseFrontMatter(file.text);
	} catch (error) {
		if (error instanceof YamlError) {
			report(`${error.line}:${error.column}`, error.reason);
			return undefined;
		}
		throw error;
	}
	const result = UnitFrontMatterSchema.safeParse(parsed.data);
	if (!result.success) {
		for (const { where, message } of zodIssues(result.error)) report(where, message);
		return undefined;
	}
	const data = result.data;
	const m = new RegExp(`^${UNITS_DIR}/([^/]+)/([^/]+)\\.md$`).exec(file.path);
	if (!m) {
		report(undefined, `units live at ${UNITS_DIR}/<area>/<slug>.md`);
		return undefined;
	}
	const [, folder, slug] = m;
	if (!(AREA_IDS as readonly string[]).includes(folder)) {
		report(undefined, `unknown area folder "${folder}" (expected one of: ${AREA_IDS.join(', ')})`);
		return undefined;
	}
	if (data.area !== folder)
		report('area', `area "${data.area}" does not match the folder "${folder}"`);
	if (data.id !== `${folder}.${slug}`) {
		report('id', `id "${data.id}" does not match the file: expected "${folder}.${slug}"`);
	}
	return { file: file.path, data, body: parsed.body.trim() };
}

const CODE_SPAN = /`([^`\n]+)`/g;

/** The canonical spelling of a key combo, or an error message. */
function checkKeys(keys: string): { canonical: string; controls: ControlId[] } | { error: string } {
	const parsed = tryParseKeys(keys);
	if (!parsed.ok) {
		const { error } = parsed;
		return {
			error: `"${keys}" is not a valid key combo: ${error.message} (at character ${error.offset + 1})`
		};
	}
	const canonical = formatKeys(parsed.value);
	if (canonical !== keys)
		return { error: `write the key combo "${keys}" canonically: "${canonical}"` };
	return { canonical, controls: keyControlIds(parsed.value) };
}

/**
 * Every `code span` in prose is a key combo (`shift + M1`) or names a control (`E1`, `T1…T8`): it
 * must parse and be canonical.
 */
function checkInlineKeys(text: string, where: string, report: Reporter): void {
	for (const m of text.matchAll(CODE_SPAN)) {
		const span = m[1];
		const result = checkKeys(span);
		if (!('error' in result)) continue;
		// A bare encoder or knob ("E1", "E1…E4", "volume") names the control rather than an action.
		const named = !/[+→]/.test(span) && !('error' in checkKeys(`turn ${span}`));
		if (!named) {
			report(where, `${result.error} — \`code spans\` in prose are reserved for key combos`);
		}
	}
}

const PARAMETER_GESTURE: Record<ParameterLayer, (encoder: string) => string> = {
	base: (e) => `turn ${e}`,
	shift: (e) => `shift + turn ${e}`,
	alt: (e) => `turn ${e}`,
	click: (e) => `click ${e}`,
	'shift-click': (e) => `shift + click ${e}`
};

const LANE_LAYERS: Partial<Record<ParameterLayer, LaneLayer>> = {
	base: 'base',
	shift: 'shift',
	alt: 'alt'
};

interface Provenance {
	readonly source: string;
	readonly firmware_min?: string;
	readonly verified_on?: string;
	readonly confidence?: Confidence;
}

/** Word count of prose (for stats and limits). */
export function countWords(text: string): number {
	return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * Checks one parsed unit and normalises it for manual.json. Issues are appended to `issues`.
 */
export function checkUnit(unit: ParsedUnit, ctx: CheckContext, issues: ManualIssue[]): ManualUnit {
	const { data } = unit;
	const report: Reporter = (where, message, severity = 'error') =>
		issues.push({ severity, file: unit.file, unit: data.id, where, message });

	const knownVersion = (version: string, where: string) => {
		if (!ctx.versions.has(version)) report(where, `unknown OS release "${version}"`);
	};

	// --- firmware header
	const fw = data.firmware;
	knownVersion(fw.min, 'firmware.min');
	fw.changed_in.forEach((v, i) => knownVersion(v, `firmware.changed_in[${i}]`));
	if (fw.verified_on !== null) knownVersion(fw.verified_on, 'firmware.verified_on');
	if (fw.guide_version !== null && fw.guide_version !== ctx.guideVersion) {
		report(
			'firmware.guide_version',
			`the guide version is ${ctx.guideVersion}, not ${fw.guide_version}`
		);
	}
	const safeCompare = (a: string, b: string) => {
		try {
			return compareFirmware(a, b);
		} catch {
			return 0;
		}
	};

	// --- sources and provenance of every item
	const sources: ManualSource[] = [];
	const seenSources = new Set<string>();
	let citesGuide = false;
	const derivedChanges = new Set<string>();

	const checkSourceTarget = (source: ParsedSource, where: string) => {
		if (source.kind === 'guide' && ctx.official) {
			if (!ctx.official.anchors.has(source.key)) {
				const slug = source.key.slice(0, source.key.indexOf('#'));
				const known = [...ctx.official.anchors]
					.filter((k) => k.startsWith(`${slug}#`) && k !== `${slug}#`)
					.map((k) => k.slice(slug.length + 1));
				report(
					where,
					`anchor "#${source.anchor ?? ''}" does not exist in the scraped guide chapter "${slug || 'index'}"${known.length ? ` (anchors: ${known.join(', ')})` : ''}`
				);
			}
		}
		if (source.kind === 'research' && source.path !== undefined) {
			const slugs = ctx.research.get(source.path);
			if (!slugs) report(where, `research note ${source.path} does not exist`);
			else if (source.anchor !== null && !slugs.has(source.anchor)) {
				report(where, `${source.path} has no heading with the slug "#${source.anchor}"`);
			}
		}
	};

	const checkProvenance = (item: Provenance, where: string): Confidence => {
		const parsed = parseSource(item.source, ctx.versions);
		let source: ParsedSource | undefined;
		if (!parsed.ok) report(`${where}.source`, parsed.reason);
		else {
			source = parsed.source;
			checkSourceTarget(source, `${where}.source`);
			if (!seenSources.has(item.source)) {
				seenSources.add(item.source);
				sources.push({ url: item.source, kind: source.kind });
			}
			if (source.kind === 'guide') citesGuide = true;
		}
		if (item.firmware_min !== undefined) {
			knownVersion(item.firmware_min, `${where}.firmware_min`);
			if (safeCompare(item.firmware_min, fw.min) < 0) {
				report(
					`${where}.firmware_min`,
					`${item.firmware_min} is older than the unit's firmware.min ${fw.min}`
				);
			} else if (safeCompare(item.firmware_min, fw.min) > 0) derivedChanges.add(item.firmware_min);
			if (source?.kind === 'guide' && safeCompare(item.firmware_min, ctx.guideVersion) > 0) {
				report(
					`${where}.source`,
					`the guide describes ${ctx.guideVersion}; behaviour from ${item.firmware_min} needs a changelog or research source`
				);
			}
		}
		if (source?.kind === 'changelog' && source.version !== undefined) {
			const release = source.version;
			if (safeCompare(release, fw.min) < 0) {
				report(
					`${where}.source`,
					`cites release ${release}, older than the unit's firmware.min ${fw.min}`
				);
			} else if (safeCompare(release, fw.min) > 0 && item.firmware_min !== release) {
				report(
					`${where}.firmware_min`,
					`cites the ${release} changelog: set firmware_min: '${release}' (or cite something else)`
				);
			}
		}
		if (item.verified_on !== undefined) knownVersion(item.verified_on, `${where}.verified_on`);
		// Confidence: explicit, or verified (checked on a unit) / official (TE source) by default.
		if (item.verified_on !== undefined) {
			if (item.confidence !== undefined && item.confidence !== 'verified') {
				report(
					`${where}.confidence`,
					'an item with verified_on has confidence "verified" (or none)'
				);
			}
			return 'verified';
		}
		if (item.confidence === 'verified') {
			report(
				`${where}.verified_on`,
				'confidence "verified" needs verified_on (the OS version it was checked on)'
			);
		}
		if (item.confidence !== undefined) return item.confidence;
		if (source && !isOfficial(source.kind)) {
			report(
				`${where}.confidence`,
				`a ${source.kind} source needs a confidence (community, derived, …) or verified_on`
			);
		}
		return 'official';
	};

	// --- facts
	const facts = data.facts.map((fact, i) => {
		const where = `facts[${i}]`;
		checkInlineKeys(fact.text, `${where}.text`, report);
		const confidence = checkProvenance(fact, where);
		return {
			id: fact.id,
			text: fact.text,
			source: fact.source,
			firmware_min: fact.firmware_min ?? null,
			verified_on: fact.verified_on ?? null,
			confidence
		};
	});
	uniqueIds(
		data.facts.map((f) => f.id),
		'facts',
		report
	);

	// --- procedures
	const controls = new Set<ControlId>();
	const procedures: ManualProcedure[] = data.procedures.map((procedure, i) => {
		const where = `procedures[${i}]`;
		checkInlineKeys(procedure.goal, `${where}.goal`, report);
		(procedure.preconditions ?? []).forEach((p, j) =>
			checkInlineKeys(p, `${where}.preconditions[${j}]`, report)
		);
		if (procedure.result) checkInlineKeys(procedure.result, `${where}.result`, report);
		const steps = procedure.steps.map((step, j) => {
			const checked = checkKeys(step.keys);
			if (step.note) checkInlineKeys(step.note, `${where}.steps[${j}].note`, report);
			if ('error' in checked) report(`${where}.steps[${j}].keys`, checked.error);
			else checked.controls.forEach((c) => controls.add(c));
			return { keys: step.keys, note: step.note ?? null, set: step.set ?? null };
		});
		const confidence = checkProvenance(procedure, where);
		return {
			id: procedure.id,
			goal: procedure.goal,
			preconditions: procedure.preconditions ?? [],
			steps,
			result: procedure.result ?? null,
			source: procedure.source,
			firmware_min: procedure.firmware_min ?? null,
			verified_on: procedure.verified_on ?? null,
			confidence
		};
	});
	uniqueIds(
		data.procedures.map((p) => p.id),
		'procedures',
		report
	);

	// --- parameters
	const laneContext =
		data.context.modes.length > 0 &&
		data.context.modes.every((mode) => mode === 'instrument' || mode === 'auxiliary');
	const seenParameters = new Set<string>();
	const parameters: ManualParameter[] = data.parameters.map((parameter, i) => {
		const where = `parameters[${i}]`;
		const slot = `${parameter.screen} ${parameter.encoder} ${parameter.layer}`;
		if (seenParameters.has(slot)) report(where, `two parameters on ${slot}`);
		seenParameters.add(slot);
		const keys = PARAMETER_GESTURE[parameter.layer](parameter.encoder);
		const checked = checkKeys(keys);
		if (!('error' in checked)) checked.controls.forEach((c) => controls.add(c));
		for (const field of ['name', 'range', 'default', 'note'] as const) {
			const value = parameter[field];
			if (value) checkInlineKeys(value, `${where}.${field}`, report);
		}
		const confidence = checkProvenance(parameter, where);
		let ccConfidence: Confidence | null = null;
		const cc = parameter.cc ?? null;
		const module = /^M([1-4])$/.exec(parameter.screen);
		const laneLayer = LANE_LAYERS[parameter.layer];
		if (cc !== null) {
			ccConfidence = confidence;
			if (laneContext && module && laneLayer) {
				try {
					const lane = laneToCc({
						module: Number(module[1]) as LaneModule,
						layer: laneLayer,
						encoder: Number(parameter.encoder.slice(1)) as LaneEncoder
					});
					if (lane.cc !== cc) {
						report(
							`${where}.cc`,
							`the lane model puts ${parameter.screen} ${parameter.layer} ${parameter.encoder} on CC${lane.cc}, not CC${cc}`
						);
					}
					ccConfidence = lane.confidence;
				} catch (error) {
					report(`${where}.cc`, (error as Error).message);
				}
			} else if (laneContext && module && !laneLayer) {
				report(`${where}.cc`, `encoder ${parameter.layer} actions have no CC lane`);
			}
		}
		return {
			screen: parameter.screen,
			encoder: parameter.encoder,
			layer: parameter.layer,
			keys,
			name: parameter.name,
			range: parameter.range ?? null,
			default: parameter.default ?? null,
			cc,
			cc_confidence: ccConfidence,
			note: parameter.note ?? null,
			source: parameter.source,
			firmware_min: parameter.firmware_min ?? null,
			verified_on: parameter.verified_on ?? null,
			confidence
		};
	});

	// --- firmware and status consistency
	const expectedChanges = [...derivedChanges].sort(safeCompare);
	const sortedDeclared = [...fw.changed_in].sort(safeCompare);
	if (
		fw.changed_in.length !== new Set(fw.changed_in).size ||
		fw.changed_in.join() !== sortedDeclared.join()
	) {
		report('firmware.changed_in', 'list each version once, oldest first');
	}
	if (sortedDeclared.join() !== expectedChanges.join()) {
		report(
			'firmware.changed_in',
			`must list the firmware_min values newer than firmware.min used in this unit: [${expectedChanges.map((v) => `'${v}'`).join(', ')}]`
		);
	}
	if (citesGuide && fw.guide_version === null) {
		report(
			'firmware.guide_version',
			`the unit cites the guide: set guide_version: '${ctx.guideVersion}'`
		);
	}
	if (!citesGuide && fw.guide_version !== null) {
		report('firmware.guide_version', 'the unit cites no guide page: set guide_version: null');
	}
	if (data.status === 'changelog-only' && !sources.some((s) => s.kind === 'changelog')) {
		report('status', 'a changelog-only unit cites the changelog entry that documents the feature');
	}
	if (data.status !== 'changelog-only' && data.status !== 'unverified' && !citesGuide) {
		report(
			'status',
			`a "${data.status}" unit cites at least one guide page (or use "changelog-only")`
		);
	}
	if (
		data.status === 'outdated-in-guide' &&
		!fw.changed_in.some((v) => safeCompare(v, ctx.guideVersion) > 0)
	) {
		report(
			'status',
			`"outdated-in-guide" needs a change after ${ctx.guideVersion} in firmware.changed_in`
		);
	}
	if (fw.verified_on !== null && data.status === 'unverified') {
		report('status', 'a unit verified on a device is not "unverified"');
	}

	// --- prose and links
	checkInlineKeys(data.summary, 'summary', report);
	checkInlineKeys(unit.body, 'body', report);
	if (unit.body === '') report('body', 'add a short prose explanation below the front-matter');
	const bodyWords = countWords(unit.body);
	if (bodyWords > BODY_WORD_LIMIT) {
		report(
			'body',
			`${bodyWords} words: keep bodies under ${BODY_WORD_LIMIT} (split the unit?)`,
			'warning'
		);
	}
	const aliasKeys = new Set<string>();
	for (const alias of data.aliases) {
		const k = alias.toLowerCase();
		if (aliasKeys.has(k) || k === data.title.toLowerCase())
			report('aliases', `duplicate alias "${alias}"`);
		aliasKeys.add(k);
	}
	if (data.related.includes(data.id)) report('related', 'a unit cannot relate to itself');
	if (new Set(data.related).size !== data.related.length) report('related', 'duplicate related id');

	const officialUrl = sources.find((s) => isOfficial(s.kind))?.url ?? null;
	return {
		id: data.id,
		title: data.title,
		aliases: data.aliases,
		area: data.area,
		order: data.order ?? DEFAULT_ORDER,
		path: unit.file,
		context: { modes: data.context.modes, screens: data.context.screens },
		summary: data.summary,
		status: data.status,
		firmware: {
			min: fw.min,
			changed_in: fw.changed_in,
			guide_version: fw.guide_version,
			verified_on: fw.verified_on
		},
		facts,
		procedures,
		parameters,
		related: data.related,
		body: unit.body,
		sources,
		official_url: officialUrl,
		controls: [...controls]
	};
}

function uniqueIds(ids: readonly string[], field: string, report: Reporter): void {
	const seen = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) report(field, `duplicate id "${id}"`);
		seen.add(id);
	}
}

/** The prose fields of a unit with their paths (what the verbatim guard reads). */
export function proseFields(unit: ManualUnit): { where: string; text: string }[] {
	const out: { where: string; text: string }[] = [{ where: 'title', text: unit.title }];
	unit.aliases.forEach((text, i) => out.push({ where: `aliases[${i}]`, text }));
	out.push({ where: 'summary', text: unit.summary });
	unit.facts.forEach((f, i) => out.push({ where: `facts[${i}].text`, text: f.text }));
	unit.procedures.forEach((p, i) => {
		out.push({ where: `procedures[${i}].goal`, text: p.goal });
		p.preconditions.forEach((text, j) =>
			out.push({ where: `procedures[${i}].preconditions[${j}]`, text })
		);
		p.steps.forEach((s, j) => {
			if (s.note) out.push({ where: `procedures[${i}].steps[${j}].note`, text: s.note });
		});
		if (p.result) out.push({ where: `procedures[${i}].result`, text: p.result });
	});
	unit.parameters.forEach((p, i) => {
		out.push({ where: `parameters[${i}].name`, text: p.name });
		for (const field of ['range', 'default', 'note'] as const) {
			const text = p[field];
			if (text) out.push({ where: `parameters[${i}].${field}`, text });
		}
	});
	out.push({ where: 'body', text: unit.body });
	return out;
}
