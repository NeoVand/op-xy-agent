/**
 * SFZ in for OP-XY presets: an instrument described as text (`<region> sample=… pitch_keycenter=…`)
 * becomes a multisample, one zone per root at most 24, each sample with the loop, tuning and level
 * its regions give it (docs/research/30-presets-samples.md §2.6–2.7). Headers inherit as the format
 * says (`<global>` → `<master>` → `<group>` → `<region>`, `<control>`'s `default_path` in front of
 * every sample); comments and sample paths with spaces are read. Where several regions share a
 * root (velocity layers, round robins), the one played at velocity 100 is kept, as the OP-XY has
 * no layers. The parser is our own, from the SFZ format's public description; no code of the
 * community tools is used.
 */
import type { SampleInput } from './build';
import { clampEdit, defaultEdit } from './edit';
import { MAX_ZONES, type LoopMode } from './patch';
import type { PcmAudio } from './wav';

/** Errors for text that is not an instrument we can read. */
export class SfzError extends Error {
	override name = 'SfzError';
}

/** One region with everything it inherited, opcodes by name. */
export type SfzRegion = Readonly<Record<string, string>>;

/** The headers whose opcodes shape regions (`<curve>`, `<effect>`, `<midi>` … are skipped). */
const HEADERS = ['control', 'global', 'master', 'group', 'region'];

/** A note as SFZ writes it (a number, or `c4` = 60, `f#3`, `eb2`), or null. */
export function sfzNote(value: string | undefined): number | null {
	if (value === undefined) return null;
	const text = value.trim().toLowerCase();
	if (/^-?\d+$/.test(text)) {
		const n = Number(text);
		return n >= 0 && n <= 127 ? n : null;
	}
	const m = /^([a-g])(#|b|♯|♭)?(-?\d)$/.exec(text);
	if (!m) return null;
	const pc = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1] as 'c'];
	const accidental = m[2] === '#' || m[2] === '♯' ? 1 : m[2] ? -1 : 0;
	const n = 12 * (Number(m[3]) + 1) + pc + accidental;
	return n >= 0 && n <= 127 ? n : null;
}

/**
 * The regions of an SFZ file, each with the opcodes it inherits from its group, master and
 * global headers, `sample` prefixed with `default_path`.
 */
export function parseSfz(text: string): SfzRegion[] {
	const clean = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
	const tokens = clean.split(/(<[a-z_]+>)/i);
	const scopes: Record<string, Record<string, string>> = {
		control: {},
		global: {},
		master: {},
		group: {}
	};
	const regions: SfzRegion[] = [];
	let header = '';
	let current: Record<string, string> | null = null;
	const finish = () => {
		if (header === 'region' && current) {
			const merged = { ...scopes.global, ...scopes.master, ...scopes.group, ...current };
			if (merged.sample) {
				const prefix = scopes.control.default_path ?? '';
				merged.sample = (prefix + merged.sample).replace(/\\/g, '/');
				regions.push(merged);
			}
		}
	};
	for (const token of tokens) {
		const tag = /^<([a-z_]+)>$/i.exec(token);
		if (tag) {
			finish();
			header = tag[1].toLowerCase();
			if (!HEADERS.includes(header)) header = 'other';
			current = {};
			// a new master or group starts afresh; a global resets all below it
			if (header === 'global') scopes.global = current;
			if (header === 'global' || header === 'master') scopes.master = {};
			if (header === 'master') scopes.master = current;
			if (header !== 'region' && header !== 'control' && header !== 'other') scopes.group = {};
			if (header === 'group') scopes.group = current;
			if (header === 'control') scopes.control = current;
			continue;
		}
		if (!current) continue;
		// opcode=value pairs; a value runs to the next opcode (sample paths may hold spaces)
		const re = /([a-z_][a-z0-9_]*)=([\s\S]*?)(?=\s+[a-z_][a-z0-9_]*=|$)/gi;
		for (const m of token.trim().matchAll(re)) current[m[1].toLowerCase()] = m[2].trim();
	}
	finish();
	return regions;
}

/** What an SFZ instrument became. */
export interface SfzImport {
	readonly samples: SampleInput[];
	readonly warnings: string[];
}

const num = (v: string | undefined, fallback = 0) => {
	const n = Number(v);
	return v !== undefined && Number.isFinite(n) ? n : fallback;
};

/**
 * The multisample an SFZ instrument makes: for each root (its `pitch_keycenter`, else `key`, else
 * its `lokey`) the region played at velocity 100, at most 24 spread over the range, each with its
 * audio (`audio(path)`, the sample's path as written; null when the file is missing), loop,
 * tuning, level and region.
 */
export function sfzSamples(
	regions: readonly SfzRegion[],
	audio: (path: string) => PcmAudio | null
): SfzImport {
	const warnings: string[] = [];
	const byRoot = new Map<number, SfzRegion>();
	let layered = false;
	for (const r of regions) {
		const root = sfzNote(r.pitch_keycenter) ?? sfzNote(r.key) ?? sfzNote(r.lokey) ?? 60;
		const lo = num(r.lovel, 0);
		const hi = num(r.hivel, 127);
		const plays = lo <= 100 && hi >= 100;
		const held = byRoot.get(root);
		if (held) layered = true;
		if (!held || (plays && !(num(held.lovel, 0) <= 100 && num(held.hivel, 127) >= 100))) {
			byRoot.set(root, r);
		}
	}
	if (layered) warnings.push('velocity layers: kept the one played at velocity 100');
	let roots = [...byRoot.keys()].sort((a, b) => a - b);
	if (roots.length > MAX_ZONES) {
		warnings.push(`${roots.length} roots: kept ${MAX_ZONES} spread over the range`);
		roots = Array.from(
			{ length: MAX_ZONES },
			(_, i) => roots[Math.round((i * (roots.length - 1)) / (MAX_ZONES - 1))]
		);
	}
	const samples: SampleInput[] = [];
	const missing: string[] = [];
	for (const root of roots) {
		const r = byRoot.get(root) as SfzRegion;
		const pcm = audio(r.sample);
		if (!pcm) {
			missing.push(r.sample);
			continue;
		}
		const frames = pcm.channels[0]?.length ?? 0;
		const base = defaultEdit(pcm, 'multisampler', { trim: false });
		const loopStart = r.loop_start ?? r.loopstart;
		const loopEnd = r.loop_end ?? r.loopend;
		const hasLoop = loopStart !== undefined && loopEnd !== undefined;
		// loop points and no mode: a continuous loop, as SFZ players read it
		const mode = r.loop_mode ?? r.loopmode ?? (hasLoop ? 'loop_continuous' : 'no_loop');
		const loopMode: LoopMode =
			mode === 'loop_continuous' ? 'forever' : mode === 'loop_sustain' ? 'release' : 'off';
		// whole semitones move the root (the tune field holds only ±99 cents)
		const total = num(r.tune) + 100 * num(r.transpose);
		const semitones = Math.round(total / 100);
		const cents = total - 100 * semitones;
		const playedAt = Math.max(0, Math.min(127, root - semitones));
		const edit = clampEdit(
			{
				...base,
				start: num(r.offset),
				end: r.end !== undefined ? num(r.end) + 1 : frames,
				gain: num(r.volume),
				tune: cents,
				loop:
					loopMode === 'off'
						? { ...base.loop, mode: 'off' }
						: hasLoop
							? { mode: loopMode, start: num(loopStart), end: num(loopEnd) + 1, crossfade: 0 }
							: { ...base.loop, mode: loopMode }
			},
			frames
		);
		const name = (r.sample.split('/').pop() ?? r.sample).replace(/\.[a-z0-9]+$/i, '');
		samples.push({ name, audio: pcm, root: playedAt, edit });
	}
	if (missing.length > 0) {
		warnings.push(
			`missing ${missing.length} sample${missing.length > 1 ? 's' : ''}: ${missing[0]}`
		);
	}
	if (samples.length === 0) throw new SfzError('none of its samples were found next to it');
	return { samples, warnings };
}
