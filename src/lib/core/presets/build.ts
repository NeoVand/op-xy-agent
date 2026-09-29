/**
 * Builds an OP-XY sample preset from your recordings (docs/research/30-presets-samples.md): a
 * `<name>.preset` folder with `patch.json` and 16-bit, 44.1 kHz WAVs, ready to unzip into Field Kit
 * or the device's `presets/` folder over MTP.
 *
 * - A drum kit puts up to 24 samples on keys 53–76, each where TE's factory kits keep that kind of
 *   sound (kick, kick, snare, snare, rim, clap, … recognised from the file name), the rest in order.
 * - A multisampler lays up to 24 samples over the keyboard by their root notes (from the WAV's
 *   `smpl` chunk, else a note in the file name, else the detected pitch); each zone reaches up to
 *   half way to the next root (zones fill down from their `hikey`), the last to the top.
 * - A synth sampler plays one sample across the keyboard.
 * Samplers loop sustained samples on points found in the audio, with a crossfade; loops can be
 * forever (the device's default), until release, or off.
 */
import {
	MAX_SECONDS,
	PRESET_RATE,
	detectNote,
	findLoop,
	noteFromName,
	noteName,
	prepare,
	resample,
	type PrepareOptions
} from './audio';
import { clampEdit, renderEdit, type RenderedSound, type SoundEdit } from './edit';
import type { Voice } from './generate';
import {
	DRUM_FIRST_KEY,
	DRUM_KEYS,
	MAX_ZONES,
	drumRegion,
	patch,
	samplerRegion,
	serializePatch,
	type LoopMode,
	type Patch,
	type PresetKind
} from './patch';
import { encodeWav, type PcmAudio } from './wav';
import { zip, type ZipEntry } from './zip';

/** A recording to build from: its file name and decoded audio. */
export interface SampleInput {
	readonly name: string;
	readonly audio: PcmAudio;
	/** A root note chosen by the user (multisampler, sampler), over any found in the file. */
	readonly root?: number;
	/** A drum key (53–76) chosen by the user, over the automatic layout. */
	readonly key?: number;
	/**
	 * The preset maker's edit (region, fades, gain, pitch, play mode, loop; `edit.ts`), in frames
	 * of `audio`. With one, the sound is written as edited and `trim` does not apply to it.
	 */
	readonly edit?: SoundEdit;
	/** The generated voice it was rendered from (`generate.ts`), so it can be turned and mutated. */
	readonly voice?: Voice;
}

export interface PresetOptions extends PrepareOptions {
	readonly kind: PresetKind;
	/** The preset's name (its folder's name, as the device lists it). */
	readonly name: string;
	/** Samplers: how the samples loop. Default forever, as the device loops a fresh sample. */
	readonly loop?: LoopMode;
	/** Drum kits: the keys choke each other (the kit's mute group), as the device's slicer sets them. */
	readonly choke?: boolean;
	/**
	 * Edited samples: write only their region (default true, smaller files), or the whole file
	 * with the region in `sample.start` and `sample.end`.
	 */
	readonly crop?: boolean;
}

/**
 * An edited sample at the preset rate and within the device's 20 s (its edit moved along), then
 * rendered: fades written in, cropped unless told not to, normalised when asked.
 */
function renderInput(
	s: SampleInput & { edit: SoundEdit },
	options: PresetOptions,
	warnings: string[]
): RenderedSound & { edit: SoundEdit } {
	const from = s.audio.sampleRate;
	let channels = resample(s.audio.channels.slice(0, 2), from, PRESET_RATE);
	const scale = PRESET_RATE / from;
	const at = (frame: number) => Math.round(frame * scale);
	const max = MAX_SECONDS * PRESET_RATE;
	if (channels[0].length > max) {
		warnings.push(`"${s.name}" is longer than ${MAX_SECONDS} s: cut at ${MAX_SECONDS} s`);
		channels = channels.map((c) => c.slice(0, max));
	}
	const frames = channels[0].length;
	const e = s.edit;
	const edit = clampEdit(
		{
			...e,
			start: at(e.start),
			end: at(e.end),
			fadeIn: at(e.fadeIn),
			fadeOut: at(e.fadeOut),
			loop: {
				...e.loop,
				start: at(e.loop.start),
				end: at(e.loop.end),
				crossfade: at(e.loop.crossfade)
			}
		},
		frames
	);
	const rendered = renderEdit({ sampleRate: PRESET_RATE, channels }, edit, {
		crop: options.crop !== false
	});
	if (options.normalize) {
		let peak = 0;
		for (const c of rendered.audio.channels) {
			for (let i = rendered.start; i < rendered.end; i++) peak = Math.max(peak, Math.abs(c[i]));
		}
		if (peak > 0) {
			const gain = 10 ** (-1 / 20) / peak;
			for (const c of rendered.audio.channels) for (let i = 0; i < c.length; i++) c[i] *= gain;
		}
	}
	return { ...rendered, edit };
}

const edited = (s: SampleInput): s is SampleInput & { edit: SoundEdit } => s.edit !== undefined;

/** A built preset: its folder, its patch and the files inside, and what was noticed on the way. */
export interface BuiltPreset {
	readonly folder: string;
	readonly patch: Patch;
	readonly files: readonly ZipEntry[];
	readonly warnings: readonly string[];
}

/**
 * The drum kinds in TE's factory order over keys 53–76, each with the words that name it. A hat
 * that is neither open nor closed counts as closed; toms and congas go low → high by the word.
 */
export const DRUM_LAYOUT: readonly { readonly kind: string; readonly words: RegExp }[] = [
	{ kind: 'kick', words: /kick|\bbd\b|bass ?drum|\bkik\b/i },
	{ kind: 'kick', words: /kick|\bbd\b|bass ?drum|\bkik\b/i },
	{ kind: 'snare', words: /snare|\bsd\b|\bsnr\b/i },
	{ kind: 'snare', words: /snare|\bsd\b|\bsnr\b/i },
	{ kind: 'rim', words: /rim|stick|\brs\b/i },
	{ kind: 'clap', words: /clap|\bcp\b|\bclp\b/i },
	{ kind: 'tamb', words: /tamb/i },
	{ kind: 'shaker', words: /shak|maraca|cabasa/i },
	{
		kind: 'closed hat',
		words: /(closed|\bcl\b|\bch\b|\bchh\b)|^(?!.*(open|\boh\b)).*(hat|\bhh\b)/i
	},
	{
		kind: 'closed hat',
		words: /(closed|\bcl\b|\bch\b|\bchh\b)|^(?!.*(open|\boh\b)).*(hat|\bhh\b)/i
	},
	{ kind: 'open hat', words: /open|\boh\b|\bohh\b/i },
	{ kind: 'clave', words: /clav/i },
	{ kind: 'low tom', words: /(low|lo|floor).*tom|tom.*(low|lo|floor)|\blt\b/i },
	{ kind: 'ride', words: /ride/i },
	{ kind: 'mid tom', words: /(mid|md).*tom|tom.*(mid|md)|\bmt\b|tom/i },
	{ kind: 'crash', words: /crash|cymbal/i },
	{ kind: 'high tom', words: /(high|hi).*tom|tom.*(high|hi)|\bht\b/i },
	{ kind: 'triangle', words: /triang/i },
	{ kind: 'low conga', words: /(low|lo).*(conga|bongo)|(conga|bongo).*(low|lo)/i },
	{ kind: 'high conga', words: /conga|bongo/i },
	{ kind: 'cowbell', words: /cowbell|\bbell\b/i },
	{ kind: 'guiro', words: /guiro/i },
	{ kind: 'metal', words: /metal|\bperc\b/i },
	{ kind: 'chi', words: /chi\b|chime|\bfx\b/i }
];

/**
 * A preset name the device takes (note 30 §3.5): lowercase letters, digits, spaces and `-`, `#`,
 * `(`, `)` (the factory content's characters), anything else a dash, starting with a letter or
 * digit, at most `max` characters.
 */
export function safeName(name: string, max: number): string {
	const cleaned = name
		.toLowerCase()
		.replace(/\.[a-z0-9]+$/, '')
		.replace(/[^a-z0-9 #()-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^[^a-z0-9]+|[\s-]+$/g, '');
	return (cleaned || 'untitled').slice(0, max).replace(/[\s-]+$/, '');
}

/** A sample file's stem the device takes (note 30 §3.5): lowercase letters, digits, `#` and `-`. */
export function safeStem(name: string, max = 16): string {
	const cleaned = name
		.toLowerCase()
		.replace(/\.[a-z0-9]+$/, '')
		.replace(/[^a-z0-9#-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^[^a-z0-9]+/, '');
	return cleaned.slice(0, max).replace(/-+$/, '') || 'sample';
}

/**
 * The longest sample path a project can hold, `/fat32/presets/<folders>/<name>.preset/<file>`
 * (note 30 §3.5), and the room kept for the folder the preset is copied into: up to 7 characters.
 */
const PATH_MAX = 71;
const FOLDER_ROOM = '/fat32/presets/'.length + 8;

/** Which drum key each sample goes on: the user's, then the layout by name, then in order. */
export function drumKeys(samples: readonly Pick<SampleInput, 'name' | 'key'>[]): (number | null)[] {
	const taken = new Set<number>();
	const keys: (number | null)[] = samples.map((s) => {
		const k = s.key;
		if (k !== undefined && k >= DRUM_FIRST_KEY && k < DRUM_FIRST_KEY + DRUM_KEYS && !taken.has(k)) {
			taken.add(k);
			return k;
		}
		return null;
	});
	samples.forEach((s, i) => {
		if (keys[i] !== null) return;
		const slot = DRUM_LAYOUT.findIndex(
			(d, j) => d.words.test(s.name) && !taken.has(DRUM_FIRST_KEY + j)
		);
		if (slot >= 0) {
			keys[i] = DRUM_FIRST_KEY + slot;
			taken.add(keys[i] as number);
		}
	});
	samples.forEach((_s, i) => {
		if (keys[i] !== null) return;
		for (let k = DRUM_FIRST_KEY; k < DRUM_FIRST_KEY + DRUM_KEYS; k++) {
			if (!taken.has(k)) {
				keys[i] = k;
				taken.add(k);
				return;
			}
		}
	});
	return keys;
}

/** Builds the preset: samples prepared and written, regions laid out, `patch.json` serialised. */
export function buildPreset(samples: readonly SampleInput[], options: PresetOptions): BuiltPreset {
	const warnings: string[] = [];
	const name = safeName(options.name, 24);
	const folder = `${name}.preset`;
	const stemMax = Math.min(16, PATH_MAX - FOLDER_ROOM - folder.length - '/.wav'.length);
	const files: ZipEntry[] = [];
	const used = new Set<string>();
	const unique = (base: string) => {
		let file = `${base}.wav`;
		for (let n = 2; used.has(file); n++) {
			file = `${base.slice(0, stemMax - String(n).length - 1).replace(/-+$/, '')}-${n}.wav`;
		}
		used.add(file);
		return file;
	};
	const loop = options.loop ?? 'forever';
	let regions: Patch['regions'];

	if (options.kind === 'drum') {
		if (samples.length > DRUM_KEYS)
			warnings.push(`a kit holds ${DRUM_KEYS} sounds: ${samples.length - DRUM_KEYS} left out`);
		const kept = samples.slice(0, DRUM_KEYS);
		const keys = drumKeys(kept);
		regions = kept
			.map((s, i) => {
				const file = unique(safeStem(s.name, stemMax));
				const mode = options.choke ? 'group' : 'oneshot';
				if (edited(s)) {
					const r = renderInput(s, options, warnings);
					files.push({ path: `${folder}/${file}`, bytes: encodeWav({ ...r.audio, root: 60 }) });
					const region = drumRegion(
						keys[i] as number,
						file,
						r.audio.channels[0].length,
						s.edit.playmode
					);
					if (r.start > 0) region['sample.start'] = r.start;
					region['sample.end'] = r.end;
					region.gain = r.edit.gain;
					region.pan = r.edit.pan;
					region.transpose = r.edit.transpose;
					region.reverse = r.edit.reverse;
					return region;
				}
				const audio = prepare(s.audio, options);
				files.push({ path: `${folder}/${file}`, bytes: encodeWav({ ...audio, root: 60 }) });
				return drumRegion(keys[i] as number, file, audio.channels[0].length, mode);
			})
			.sort((a, b) => a.hikey - b.hikey);
	} else {
		const kept = options.kind === 'sampler' ? samples.slice(0, 1) : samples;
		if (options.kind === 'sampler' && samples.length > 1) {
			warnings.push('a synth sampler plays one sample: the first is used');
		}
		type Zone = {
			s: SampleInput;
			audio: PcmAudio;
			root: number;
			r: ReturnType<typeof renderInput> | null;
		};
		const zones = kept
			.map((s) => {
				const r = edited(s) ? renderInput(s, options, warnings) : null;
				const audio = r ? r.audio : prepare(s.audio, options);
				const root = s.root ?? s.audio.root ?? noteFromName(s.name) ?? detectNote(audio);
				return { s, audio, root, r };
			})
			.filter((z) => {
				if (z.root === null || z.root === undefined) {
					warnings.push(`no root note for "${z.s.name}" (name it like piano-c4.wav): left out`);
					return false;
				}
				return true;
			}) as Zone[];
		zones.sort((a, b) => a.root - b.root);
		const distinct = zones.filter((z, i) => {
			if (i > 0 && zones[i - 1].root === z.root) {
				warnings.push(`"${z.s.name}" has the same root as "${zones[i - 1].s.name}": left out`);
				return false;
			}
			return true;
		});
		if (distinct.length > MAX_ZONES)
			warnings.push(`a multisample holds ${MAX_ZONES} zones: the highest are left out`);
		const layered = distinct.slice(0, MAX_ZONES);
		regions = layered.map((z, i) => {
			const next = layered[i + 1];
			const hikey = next ? Math.floor((z.root + next.root) / 2) : 127;
			const file = unique(
				options.kind === 'multisampler' ? noteName(z.root) : safeStem(z.s.name, stemMax)
			);
			const frames = z.audio.channels[0].length;
			files.push({ path: `${folder}/${file}`, bytes: encodeWav({ ...z.audio, root: z.root }) });
			const top = options.kind === 'sampler' ? z.root : hikey;
			if (z.r) {
				const { edit } = z.r;
				const region = samplerRegion(file, frames, z.root, top, z.r.loop.mode, z.r.loop);
				if (z.r.start > 0) region['sample.start'] = z.r.start;
				region['sample.end'] = z.r.end;
				region.tune = edit.tune;
				region.reverse = edit.reverse;
				if (edit.gain !== 0) region.gain = edit.gain;
				return region;
			}
			const points = loop === 'off' ? null : findLoop(z.audio);
			if (loop !== 'off' && !points)
				warnings.push(`"${z.s.name}" is too short to loop: it plays once`);
			return samplerRegion(file, frames, z.root, top, points ? loop : 'off', points);
		});
	}
	if (regions.length === 0) warnings.push('no samples made it into the preset');
	const built = patch(options.kind, regions);
	files.unshift({
		path: `${folder}/patch.json`,
		bytes: new TextEncoder().encode(serializePatch(built))
	});
	return { folder, patch: built, files, warnings };
}

/** The preset as a zip archive of its folder. */
export const zipPreset = (preset: BuiltPreset): Uint8Array => zip(preset.files);
