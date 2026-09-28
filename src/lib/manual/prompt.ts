/**
 * Renders the manual as one Markdown document for the agent's cached system prompt
 * (docs/research/40-official-docs.md §6): deterministic — same units, same bytes — so the prompt
 * cache prefix stays stable. Grouped by area in presentation order; no timestamps.
 */
import { AREA_INFO, type Manual, type ManualUnit } from './schema';
import { BUNDLE_SOURCE_LEGEND, changelogUrl, shortSource } from './sources';

const LAYER_LABEL: Record<string, string> = {
	base: '',
	shift: '',
	alt: ' (alternate page)',
	click: '',
	'shift-click': ''
};

/** The legend at the top of the bundle: how to read key combos, statuses and tags. */
export const BUNDLE_LEGEND = [
	'## How to read this manual',
	'',
	'- Key combos: `A + B` = hold A, then press B (every key but the last is held); `A → B` = press A, release, then press B; `→ +` = keep the earlier keys held; `hold A` = long press; `turn E1` / `click E1` = rotate / push an encoder. E1–E4 are the dark gray, mid gray, light gray and white encoders.',
	'- Controls: `T1`…`T8` track keys, `step 1`…`step 16` step keys, `M1`…`M4` module keys under the screen, `[-]` / `[+]` minus / plus, `key F#3` a keyboard key, `natural 1`…`natural 14` white keys and `accidental 1`…`accidental 0` black keys counted from the left. Placeholders: `Tn`, `step n`, `key`, `natural`, `accidental` = any one; `steps`, `keys`, `naturals`, `accidentals` = one or more.',
	'- Status: current = the guide (v{guide}) still matches; outdated-in-guide = firmware after the guide changed it; changelog-only = the guide is silent and the OS changelog documents it; unverified = community or inferred, not yet confirmed.',
	'- Tags: (since X) = needs OS X or newer; (verified X) = observed on a real unit running OS X; (community), (derived), … = confidence below official.',
	'- Cite a unit as [unit-id] and a fact as [unit-id#fact-id]. Items end with [sN], a source listed at the end of their unit; send users to TE’s page for the original.',
	`- ${BUNDLE_SOURCE_LEGEND} Link a release with ${changelogUrl('1.1.21')} (1.0.29 is the one exception: ${changelogUrl('1.0.29')}).`
].join('\n');

function tags(item: {
	firmware_min: string | null;
	verified_on: string | null;
	confidence: string;
}): string {
	const out: string[] = [];
	if (item.firmware_min) out.push(`(since ${item.firmware_min})`);
	if (item.verified_on) out.push(`(verified ${item.verified_on})`);
	else if (item.confidence !== 'official') out.push(`(${item.confidence})`);
	return out.length > 0 ? ` ${out.join(' ')}` : '';
}

function cell(text: string | null | number): string {
	if (text === null || text === '') return '–';
	return String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * What a recipe step sets, as plan_steps takes it: `amp decay = 25`, or with where it lives
 * `track 5 = out (area auxiliary, track 9, page 2)`.
 */
function setText(set: NonNullable<ManualUnit['procedures'][number]['steps'][number]['set']>) {
	const where = [
		set.area ? `area ${set.area}` : null,
		set.track ? `track ${set.track}` : null,
		set.page ? `page ${set.page}` : null,
		set.key !== undefined ? `key ${set.key}` : null
	].filter(Boolean);
	return `${set.param} = ${set.value}${where.length ? ` (${where.join(', ')})` : ''}`;
}

/** Renders one unit. */
export function renderUnit(unit: ManualUnit): string {
	const sourceIndex = new Map(unit.sources.map((s, i) => [s.url, i + 1]));
	const ref = (url: string) => ` [s${sourceIndex.get(url)}]`;
	const lines: string[] = [];
	lines.push(`### ${unit.title} [${unit.id}]`);
	const fw = unit.firmware;
	const meta = [
		unit.status,
		`OS ≥ ${fw.min}`,
		fw.changed_in.length > 0 ? `changed in ${fw.changed_in.join(', ')}` : null,
		fw.guide_version ? `guide v${fw.guide_version}` : 'not in the guide',
		fw.verified_on ? `verified on ${fw.verified_on}` : null
	].filter(Boolean);
	lines.push(meta.join(' · '));
	if (unit.aliases.length > 0) lines.push(`Also called: ${unit.aliases.join(', ')}`);
	const context = [
		unit.context.modes.length > 0 ? `modes ${unit.context.modes.join(', ')}` : null,
		unit.context.screens.length > 0 ? `screens ${unit.context.screens.join(', ')}` : null
	].filter(Boolean);
	if (context.length > 0) lines.push(`Where: ${context.join('; ')}`);
	lines.push('', unit.summary, '', unit.body, '', 'Facts:');
	for (const fact of unit.facts) {
		lines.push(`- ${fact.text} [#${fact.id}]${tags(fact)}${ref(fact.source)}`);
	}
	if (unit.procedures.length > 0) {
		lines.push('', 'Procedures:');
		for (const p of unit.procedures) {
			lines.push(`- ${p.goal} [#${p.id}]${tags(p)}${ref(p.source)}`);
			if (p.preconditions.length > 0) lines.push(`  Needs: ${p.preconditions.join('; ')}`);
			p.steps.forEach((step, i) => {
				const set = step.set ? ` {set ${setText(step.set)}}` : '';
				lines.push(`  ${i + 1}. \`${step.keys}\`${step.note ? ` — ${step.note}` : ''}${set}`);
			});
			if (p.result) lines.push(`  Result: ${p.result}`);
		}
	}
	if (unit.parameters.length > 0) {
		lines.push('', 'Parameters:', '', '| screen | control | name | range | default | CC | notes |');
		lines.push('| --- | --- | --- | --- | --- | --- | --- |');
		for (const p of unit.parameters) {
			const notes = [p.note, tags(p).trim() || null, `s${sourceIndex.get(p.source)}`]
				.filter(Boolean)
				.join(' ');
			lines.push(
				`| ${p.screen} | \`${p.keys}\`${LAYER_LABEL[p.layer]} | ${cell(p.name)} | ${cell(p.range)} | ${cell(p.default)} | ${cell(p.cc)} | ${cell(notes)} |`
			);
		}
	}
	if (unit.related.length > 0) {
		lines.push('', `Related: ${unit.related.map((id) => `[${id}]`).join(', ')}`);
	}
	lines.push(
		'',
		`Sources: ${unit.sources.map((s, i) => `s${i + 1} ${shortSource(s.url)}`).join(' · ')}`
	);
	return lines.join('\n');
}

/** Renders the whole manual (manual.md). */
export function renderPromptBundle(manual: Manual): string {
	const byId = new Map(manual.units.map((u) => [u.id, u]));
	const parts: string[] = [
		'# OP-XY manual',
		'',
		`Our own reworded, agent-oriented manual for the teenage engineering OP-XY, written for OS ${manual.reference_firmware}. ` +
			`It is derived from TE's online guide (v${manual.guide_version}), the OS changelog and checks on a real unit; ` +
			`${manual.stats.units} units, ${manual.stats.facts} facts, ${manual.stats.procedures} procedures, ${manual.stats.parameters} parameters.`,
		'',
		BUNDLE_LEGEND.replace('{guide}', manual.guide_version)
	];
	for (const area of manual.areas) {
		if (area.units.length === 0) continue;
		parts.push('', `## ${AREA_INFO[area.id].title}`, '', area.description);
		for (const id of area.units) {
			const unit = byId.get(id);
			if (unit) parts.push('', renderUnit(unit));
		}
	}
	return parts.join('\n') + '\n';
}
