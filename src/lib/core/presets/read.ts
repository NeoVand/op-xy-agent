/**
 * Opens an OP-XY sample preset again so the preset maker can change it
 * (docs/research/30-presets-samples.md §2.6–2.7): a `.preset` folder's files, or a zip of one
 * (stored, as the maker downloads it, or deflated, as most archivers write it). Each region comes
 * back as a sample with its edit (`edit.ts`), read the way `buildPreset` writes them, so a preset
 * built, zipped and read again builds the same `patch.json`. The rest of the patch (engine,
 * envelope, filter, LFO) is handed back as it was, for the maker to keep.
 */
import type { SampleInput } from './build';
import { clampEdit, defaultEdit, type LoopEdit, type SoundEdit } from './edit';
import {
	DRUM_FIRST_KEY,
	DRUM_KEYS,
	type DrumPlayMode,
	type LoopMode,
	type PresetKind
} from './patch';
import { parsePcm } from './pcm';
import type { PcmAudio } from './wav';
import { crc32 } from './zip';

/** Thrown for files that are not a sample preset this app can open, or a zip it cannot read. */
export class PresetReadError extends Error {
	override name = 'PresetReadError';
}

/** One file of a preset: its path (`/`-separated, relative to the folder or zip) and bytes. */
export interface PresetFile {
	readonly path: string;
	readonly bytes: Uint8Array;
}

/** Inflates raw DEFLATE data (the browser passes DecompressionStream('deflate-raw'); tests pass node:zlib). */
export type Inflate = (raw: Uint8Array) => Promise<Uint8Array>;

const END = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
/** The end record's fixed part; a comment of up to 65535 bytes may follow it. */
const END_SIZE = 22;

/** What archivers add beside the files: folders, and macOS's resource forks. */
const skipped = (path: string): boolean =>
	path.endsWith('/') ||
	path.split('/').some((part) => part === '__MACOSX' || part.startsWith('._'));

/** Where the end of central directory record starts, scanning back past any comment. */
function endRecord(bytes: Uint8Array, view: DataView): number {
	const last = Math.max(0, bytes.length - END_SIZE - 0xffff);
	for (let at = bytes.length - END_SIZE; at >= last; at--) {
		if (
			view.getUint32(at, true) === END &&
			at + END_SIZE + view.getUint16(at + 20, true) <= bytes.length
		) {
			return at;
		}
	}
	throw new PresetReadError('this is not a zip archive');
}

/**
 * A zip archive's files: stored (0) and, with `inflate`, deflated (8) entries; folders,
 * `__MACOSX/` and `._` files skipped; every file checked against its CRC-32. Reads the central
 * directory (the end record found by scanning back from the end, a comment allowed).
 * @throws PresetReadError for anything else: not a zip, encrypted, zip64 or split archives, other
 * compression methods, a deflated entry without `inflate`, a bad CRC or damaged data.
 */
export async function unzip(bytes: Uint8Array, inflate?: Inflate): Promise<PresetFile[]> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const end = endRecord(bytes, view);
	const count = view.getUint16(end + 10, true);
	const size = view.getUint32(end + 12, true);
	const offset = view.getUint32(end + 16, true);
	const zip64 = () => new PresetReadError('zip64 archives are not supported');
	const damaged = () => new PresetReadError('the zip archive is damaged');
	if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw zip64();
	if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) {
		throw new PresetReadError('split zip archives are not supported');
	}
	if (offset + size > end) throw damaged();
	const decoder = new TextDecoder();
	const files: PresetFile[] = [];
	for (let i = 0, at = offset; i < count; i++) {
		if (at + 46 > end || view.getUint32(at, true) !== CENTRAL) throw damaged();
		const flags = view.getUint16(at + 8, true);
		const method = view.getUint16(at + 10, true);
		// the CRC and sizes come from the directory: archivers that stream leave them 0 in the
		// local header and write them after the data
		const crc = view.getUint32(at + 16, true);
		const packed = view.getUint32(at + 20, true);
		const length = view.getUint32(at + 24, true);
		const nameLength = view.getUint16(at + 28, true);
		const local = view.getUint32(at + 42, true);
		// UTF-8 whether or not flag bit 11 says so (many archivers write UTF-8 without it); a few
		// Windows tools still separate folders with backslashes
		const path = decoder
			.decode(bytes.subarray(at + 46, at + 46 + nameLength))
			.replaceAll('\\', '/');
		at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
		if (skipped(path)) continue;
		if (flags & 1)
			throw new PresetReadError(`${path} is encrypted: zip it again without a password`);
		if (packed === 0xffffffff || length === 0xffffffff || local === 0xffffffff) throw zip64();
		if (local + 30 > bytes.length || view.getUint32(local, true) !== LOCAL) throw damaged();
		// the local header's name and extra field may differ in length from the directory's
		const data = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
		if (data + packed > bytes.length) throw damaged();
		const raw = bytes.subarray(data, data + packed);
		let content: Uint8Array;
		if (method === 0) content = raw;
		else if (method === 8) {
			if (!inflate)
				throw new PresetReadError(`${path} is deflated, and nothing was given to inflate it`);
			try {
				content = await inflate(raw);
			} catch (error) {
				throw new PresetReadError(`${path} is damaged: it does not inflate`, { cause: error });
			}
		} else {
			throw new PresetReadError(
				`${path} is compressed with method ${method}, which is not supported`
			);
		}
		if (content.length !== length || crc32(content) !== crc) {
			throw new PresetReadError(`${path} is damaged: its CRC-32 does not match`);
		}
		files.push({ path, bytes: content });
	}
	return files;
}

/** A preset opened for editing (see {@link readPreset}). */
export interface ImportedPreset {
	readonly kind: PresetKind;
	/** The preset's name: its folder's name without `.preset` (or the zip's patch folder). */
	readonly name: string;
	/**
	 * One per region, in region order (a synth sampler's first only: the device plays no other):
	 * drum sounds carry `key` (hikey), samplers `root` (pitch.keycenter), all an `edit`.
	 */
	readonly samples: SampleInput[];
	/** The parsed patch.json, to keep its engine, envelope, filter and LFO settings. */
	readonly patch: Record<string, unknown>;
	/** What was left out or read differently, as lowercase sentences. */
	readonly warnings: string[];
}

type Fields = Record<string, unknown>;

const KINDS: readonly PresetKind[] = ['drum', 'sampler', 'multisampler'];
const PLAYMODES: readonly DrumPlayMode[] = ['gate', 'oneshot', 'group', 'loop'];
const LOOP_POINTS = ['loop.start', 'loop.end', 'loop.crossfade'] as const;
const LOOP_FIELDS = [...LOOP_POINTS, 'loop.onrelease', 'loop.enabled'] as const;

const isFields = (value: unknown): value is Fields =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
/** Paths compared as the device's FAT32 and macOS compare them: case and normalisation aside. */
const folded = (path: string): string => path.normalize('NFC').toLowerCase();

/** A region's number field, or `fallback` when it is absent or not a number. */
function num(region: Fields, key: string, fallback: number): number {
	const value = region[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * A region's loop from its flags (note 30 §2.6): `onrelease` true loops forever, `enabled` false
 * is off, neither loops until release. Both flags (byte 0xC0) is probably off.
 */
function loopMode(region: Fields): LoopMode {
	if (region['loop.enabled'] === false) return 'off';
	return region['loop.onrelease'] === true ? 'forever' : 'release';
}

/** `a`, `a and b`, `a, b and c` … `a, b, c and 2 more`. */
function listed(names: readonly string[]): string {
	const shown = names.length > 4 ? [...names.slice(0, 3), `${names.length - 3} more`] : names;
	if (shown.length < 2) return shown.join('');
	return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

function parsePatch(bytes: Uint8Array): Fields {
	let json: unknown;
	try {
		json = JSON.parse(new TextDecoder().decode(bytes));
	} catch (error) {
		throw new PresetReadError('patch.json is not valid JSON', { cause: error });
	}
	if (!isFields(json)) throw new PresetReadError('patch.json does not hold a preset');
	return json;
}

/** A region's fields as the preset maker's edit of `audio`, in the file's own frames. */
function regionEdit(region: Fields, audio: PcmAudio, kind: PresetKind): SoundEdit {
	const frames = audio.channels[0].length;
	const drum = kind === 'drum';
	// the kind only decides whether defaultEdit looks for a loop, a scan of the whole sample:
	// skip it when the region brings its own points
	const own = LOOP_POINTS.every((key) => typeof region[key] === 'number');
	const base = defaultEdit(audio, drum || own ? 'drum' : kind, { trim: false });
	const loop: LoopEdit =
		!drum && LOOP_FIELDS.some((key) => key in region)
			? {
					mode: loopMode(region),
					start: num(region, 'loop.start', base.loop.start),
					end: num(region, 'loop.end', base.loop.end),
					crossfade: num(region, 'loop.crossfade', base.loop.crossfade)
				}
			: base.loop;
	return clampEdit(
		{
			...base,
			start: num(region, 'sample.start', 0),
			end: Math.min(num(region, 'sample.end', num(region, 'framecount', frames)), frames),
			// fades are written into the WAV, never into the patch: none to read back
			fadeIn: 0,
			fadeOut: 0,
			gain: num(region, 'gain', 0),
			pan: drum ? num(region, 'pan', 0) : base.pan,
			transpose: drum ? num(region, 'transpose', 0) : base.transpose,
			tune: num(region, 'tune', 0),
			reverse: region.reverse === true,
			// `key` and numbers are not play modes: the device plays them one-shot (note 30 §2.6)
			playmode: drum
				? (PLAYMODES.find((mode) => mode === region.playmode) ?? 'oneshot')
				: base.playmode,
			loop
		},
		frames
	);
}

/**
 * A preset from its files (a folder's files with their relative paths, or {@link unzip}'s
 * output): the `patch.json` at any depth (the first by path when there are several), its samples
 * (WAV or AIFF) found beside it by name, exactly and then ignoring case, and each region's fields
 * read into an edit. A sample that is missing or unreadable, or a drum key outside 53–76, is left
 * out with a warning; where a region's `framecount` disagrees with its file, the file is trusted.
 * @throws PresetReadError when there is no `patch.json`, it is not JSON, or it is not a drum kit,
 * sampler or multisampler (a synth preset has no samples to edit).
 */
export function readPreset(files: readonly PresetFile[]): ImportedPreset {
	const found = files
		.filter((f) => !skipped(f.path) && baseName(f.path).toLowerCase() === 'patch.json')
		.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	if (found.length === 0) {
		throw new PresetReadError('there is no patch.json: this is not an OP-XY preset');
	}
	const folder = found[0].path.slice(0, -'patch.json'.length);
	const name = baseName(folder.slice(0, -1)).replace(/\.preset$/i, '') || 'imported';
	const patch = parsePatch(found[0].bytes);
	const kind = KINDS.find((k) => k === patch.type);
	const type = typeof patch.type === 'string' ? patch.type : undefined;
	const regions = patch.regions;
	if (!kind) {
		if (type !== undefined && !(Array.isArray(regions) && regions.length > 0)) {
			throw new PresetReadError(`"${name}" is a synth preset (${type}): it has no samples to edit`);
		}
		throw new PresetReadError(
			`"${name}" is not a drum kit, sampler or multisampler (its type is ${type ?? 'missing'})`
		);
	}
	if (!Array.isArray(regions)) throw new PresetReadError('patch.json has no regions');

	const warnings: string[] = [];
	if (found.length > 1) {
		warnings.push(`the files hold ${found.length} presets: only "${name}" is opened`);
	}
	const drum = kind === 'drum';
	const used: unknown[] = kind === 'sampler' ? regions.slice(0, 1) : regions;
	if (regions.length > used.length) {
		const more = regions.length - used.length;
		warnings.push(
			`a synth sampler plays one sample: ${more} more ${more === 1 ? 'is' : 'are'} left out`
		);
	}
	// slices of one recording share its file: decode it once
	const decoded = new Map<string, PcmAudio | null>();
	const holders = new Map<number, string>();
	const misCounted: string[] = [];
	const samples: SampleInput[] = [];
	for (const [i, region] of used.entries()) {
		if (!isFields(region) || typeof region.sample !== 'string' || region.sample === '') {
			warnings.push(`region ${i + 1} names no sample: left out`);
			continue;
		}
		const sample = region.sample;
		let key: number | undefined;
		if (drum) {
			const hikey = region.hikey;
			if (typeof hikey !== 'number') {
				warnings.push(`${sample} has no key: left out`);
				continue;
			}
			if (
				!Number.isInteger(hikey) ||
				hikey < DRUM_FIRST_KEY ||
				hikey >= DRUM_FIRST_KEY + DRUM_KEYS
			) {
				warnings.push(`${sample} is on key ${hikey}, outside the kit's 53–76: left out`);
				continue;
			}
			key = hikey;
		}
		const target = folder + sample;
		const file =
			files.find((f) => f.path === target) ?? files.find((f) => folded(f.path) === folded(target));
		if (!file) {
			warnings.push(
				`${sample} is missing: ${drum ? 'that key is left empty' : 'that zone is left out'}`
			);
			continue;
		}
		const fileName = baseName(file.path);
		let audio = decoded.get(file.path);
		if (audio === undefined) {
			audio = parsePcm(file.bytes);
			decoded.set(file.path, audio);
		}
		if (!audio) {
			warnings.push(`${fileName} could not be read as WAV or AIFF: left out`);
			continue;
		}
		const frames = audio.channels[0]?.length ?? 0;
		if (frames === 0) {
			warnings.push(`${fileName} holds no audio: left out`);
			continue;
		}
		if (
			typeof region.framecount === 'number' &&
			region.framecount !== frames &&
			!misCounted.includes(fileName)
		) {
			misCounted.push(fileName);
		}
		let root: number | undefined;
		if (!drum) {
			const center = region['pitch.keycenter'];
			if (typeof center === 'number' && Number.isInteger(center) && center >= 0 && center <= 127) {
				root = center;
			} else {
				warnings.push(`${fileName} has no root note in patch.json: it is found from the sample`);
			}
		}
		if (key !== undefined) {
			// the builder keeps the first sound on a key and moves the next to a free one
			const holder = holders.get(key);
			if (holder === undefined) holders.set(key, fileName);
			else warnings.push(`${fileName} shares key ${key} with ${holder}: it moves to a free key`);
		}
		samples.push({
			name: fileName,
			audio,
			...(key === undefined ? {} : { key }),
			...(root === undefined ? {} : { root }),
			edit: regionEdit(region, audio, kind)
		});
	}
	if (misCounted.length > 0) {
		const one = misCounted.length === 1;
		warnings.push(
			`patch.json's frame count${one ? '' : 's'} for ${listed(misCounted)} ${one ? 'is' : 'are'} wrong: the file${one ? ' is' : 's are'} trusted`
		);
	}
	if (samples.length === 0) {
		warnings.push(
			used.length === 0 ? 'the preset holds no samples' : 'none of its samples could be opened'
		);
	}
	return { kind, name, samples, patch, warnings: [...new Set(warnings)] };
}
