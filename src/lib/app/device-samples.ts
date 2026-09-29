/**
 * The samples a project uses, from the OP-XY itself (M6). A project file names each drum key's, the
 * sampler's and every zone's sample by path, and `sim/xy` puts them on the sample area with the
 * path as the file's id; the file holds no audio, so the replica plays its stand-ins until the audio
 * arrives. With a project loaded from the device over USB, the samples on its drive are read in the
 * same MTP session (reads only: `core/mtp`'s policy), decoded (`core/presets`: WAV and AIFF) and
 * handed to the sound's sample registry under those ids, so every key and zone holding one plays the
 * unit's own sound. TE's factory library (`content/samples/…`) sits inside the firmware, not on the
 * drive MTP shows (docs/research/30-presets-samples.md §4.1): those keys keep the stand-ins.
 *
 * What was read is kept on this computer (IndexedDB, by path; never sent anywhere), so a reload, an
 * undo or a `.xy` opened from disk that names the same files plays them again.
 */
import { MtpError, MtpPaths, type MtpSession } from '$lib/core/mtp';
import { parseAiff } from '$lib/core/presets/aiff';
import { parseWav, type PcmAudio } from '$lib/core/presets/wav';
import { sampleHome } from '$lib/core/xy/model';
import type { SampleState } from '$lib/sim/areas/sample/state';
import type { SampleData } from '$lib/sound/samples';

/** Where decoded audio goes: the app sound's sample registry. */
export interface SampleSink {
	/** The audio a file already has, if any. */
	file(id: string): unknown;
	setFile(id: string, audio: SampleData): void;
}

/** Keeps sample files' bytes on this computer, by the path a project names them with. */
export interface SampleCache {
	get(path: string): Promise<Uint8Array | null>;
	put(path: string, bytes: Uint8Array): Promise<void>;
}

/**
 * The largest file read: 20 s (the longest sample the device records or plays) of stereo 32-bit
 * float at 96 kHz, with room for its header. A bigger file is not a sample the unit plays.
 */
export const MAX_SAMPLE_BYTES = 20 * 96_000 * 2 * 4 + 1_000_000;
/** The most read for one project: twice the device's 64 MB of loaded sample memory. */
export const MAX_PROJECT_BYTES = 128_000_000;

/** The firmware's name for the drive MTP shows: `/fat32/presets/x` is `presets/x` over MTP. */
const DRIVE = /^\/fat32\//i;

/** A sample's path on the MTP drive, or null for one that is not on it (TE's factory library). */
export function mtpPathOf(path: string): string | null {
	return DRIVE.test(path) ? path.replace(DRIVE, '') : null;
}

/** One distinct sample the sample area holds: its path, the ids holding it, its tracks (0-based). */
export interface HeldSample {
	readonly path: string;
	readonly ids: readonly string[];
	readonly tracks: readonly number[];
}

/** Every distinct sample path the tracks hold (drum keys, the sampler, zones), in track order. */
export function heldSamples(area: SampleState): HeldSample[] {
	const byPath = new Map<string, { ids: Set<string>; tracks: Set<number> }>();
	area.tracks.forEach((track, t) => {
		for (const file of [...track.keys, track.synth.file, ...track.zones.map((z) => z.file)]) {
			if (!file?.path) continue;
			let held = byPath.get(file.path);
			if (!held) byPath.set(file.path, (held = { ids: new Set(), tracks: new Set() }));
			held.ids.add(file.id);
			held.tracks.add(t);
		}
	});
	return [...byPath].map(([path, { ids, tracks }]) => ({
		path,
		ids: [...ids],
		tracks: [...tracks]
	}));
}

/** WAV or AIFF bytes as the registry takes them, or null for anything the decoders cannot read. */
export function decodeSample(bytes: Uint8Array): SampleData | null {
	const magic = String.fromCharCode(...bytes.subarray(0, 4));
	let audio: PcmAudio;
	try {
		if (magic === 'RIFF') audio = parseWav(bytes);
		else if (magic === 'FORM') audio = parseAiff(bytes);
		else return null;
	} catch {
		return null;
	}
	if (!(audio.channels[0]?.length > 0) || !(audio.sampleRate > 0)) return null;
	return { sampleRate: audio.sampleRate, channels: [...audio.channels] };
}

/** What reading or putting back a project's samples came to. */
export interface SampleReport {
	/** Distinct samples on the device's drive that play its audio now. */
	readonly device: number;
	/** Distinct samples of TE's factory library, which play the replica's stand-ins. */
	readonly factory: number;
	/** Distinct samples on the drive (or at a path no family names) still without audio. */
	readonly missing: number;
	/** What could not be read, one line each, for the project card. */
	readonly skipped: readonly string[];
}

/** How many of the area's samples have audio in `sink`, how many are TE's, how many have none. */
export function sampleStatus(
	area: SampleState,
	sink: SampleSink,
	skipped: readonly string[] = []
): SampleReport {
	let device = 0;
	let factory = 0;
	let missing = 0;
	for (const held of heldSamples(area)) {
		if (sampleHome(held.path) === 'factory') factory++;
		else if (held.ids.every((id) => sink.file(id))) device++;
		else missing++;
	}
	return { device, factory, missing, skipped };
}

/** Options for {@link readDeviceSamples}. */
export interface ReadSamplesOptions {
	/** An open session on the OP-XY: only `list` and `read` are used. */
	readonly session: Pick<MtpSession, 'list' | 'read'>;
	readonly storage: number;
	readonly area: SampleState;
	readonly sink: SampleSink;
	/** Keeps each file read (none by default). */
	readonly cache?: SampleCache | null;
	/** Before each file and once at the end: the files done, of those to read. */
	readonly progress?: (done: number, total: number) => void;
	/** The largest file read ({@link MAX_SAMPLE_BYTES}). */
	readonly maxBytes?: number;
	/** The most read in all ({@link MAX_PROJECT_BYTES}). */
	readonly maxTotal?: number;
}

/** The tracks holding a sample, as the project card names them. */
const tracksOf = (held: HeldSample) => held.tracks.map((t) => `T${t + 1}`).join(', ');

const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Reads the samples on the device's drive that the area holds, one file at a time over an open MTP
 * session (each folder listed once): each is decoded, handed to `sink` under every id that holds it,
 * then kept in `cache`. A file that is missing, too big, not WAV or AIFF, or refused by the device
 * is noted and the rest go on; a connection that breaks off ends the reading, the rest keeping their
 * stand-ins. It lists and reads, nothing else, and never throws for a file.
 */
export async function readDeviceSamples(options: ReadSamplesOptions): Promise<SampleReport> {
	const { session, storage, area, sink, cache, progress } = options;
	const maxBytes = options.maxBytes ?? MAX_SAMPLE_BYTES;
	const maxTotal = options.maxTotal ?? MAX_PROJECT_BYTES;
	const skipped: string[] = [];
	const held = heldSamples(area);
	for (const h of held.filter((h) => sampleHome(h.path) === 'unknown')) {
		skipped.push(`${tracksOf(h)}: ${h.path} is not a path on the op-xy's drive`);
	}
	const wanted = held.filter((h) => mtpPathOf(h.path) !== null);
	const paths = new MtpPaths(session, storage);
	let total = 0;
	for (const [i, h] of wanted.entries()) {
		progress?.(i, wanted.length);
		const path = mtpPathOf(h.path) as string;
		const at = `${tracksOf(h)}: ${path}`;
		let bytes: Uint8Array;
		try {
			const entry = await paths.resolve(path);
			if (!entry || entry.folder) {
				skipped.push(`${at} is not on the op-xy`);
				continue;
			}
			if (entry.size > maxBytes) {
				skipped.push(`${at} is ${megabytes(entry.size)}, more than a 20 s sample: not read`);
				continue;
			}
			if (total + entry.size > maxTotal) {
				skipped.push(`${at}: not read, the project's samples passed ${megabytes(maxTotal)}`);
				continue;
			}
			bytes = await session.read(entry.handle);
		} catch (e) {
			if (e instanceof MtpError) {
				skipped.push(`${at} could not be read (${e.message})`);
				continue;
			}
			// the pipe itself failed (unplugged, timed out, out of step): the rest cannot be read
			const left = wanted.length - i - 1;
			skipped.push(
				`${at}: the op-xy stopped answering (${errorText(e)})${left > 0 ? `; ${left} more not read` : ''}`
			);
			break;
		}
		total += bytes.length;
		const audio = decodeSample(bytes);
		if (!audio) {
			skipped.push(`${at} is not a wav or aiff file the replica can play`);
			continue;
		}
		try {
			for (const id of h.ids) sink.setFile(id, audio);
		} catch (e) {
			skipped.push(`${at} could not be played (${errorText(e)})`);
			continue;
		}
		await cache?.put(h.path, bytes).catch(() => {});
	}
	progress?.(wanted.length, wanted.length);
	return sampleStatus(area, sink, skipped);
}

/** Options for {@link restoreCachedSamples}. */
export interface RestoreSamplesOptions {
	readonly area: SampleState;
	readonly sink: SampleSink;
	readonly cache: SampleCache;
	/** Paths looked up already: each is looked up once (the set is added to). */
	readonly tried?: Set<string>;
}

/**
 * Puts kept audio back for the drive samples the area holds without audio (after a reload, an undo,
 * a `.xy` opened from disk). Only files still without audio take it, so audio read from the device
 * meanwhile, which is newer, stays. Returns how many samples came back.
 */
export async function restoreCachedSamples(options: RestoreSamplesOptions): Promise<number> {
	const { area, sink, cache, tried } = options;
	let restored = 0;
	for (const h of heldSamples(area)) {
		if (sampleHome(h.path) !== 'drive' || tried?.has(h.path)) continue;
		if (h.ids.every((id) => sink.file(id))) continue;
		tried?.add(h.path);
		const bytes = await cache.get(h.path).catch(() => null);
		const audio = bytes ? decodeSample(bytes) : null;
		if (!audio) continue;
		const empty = h.ids.filter((id) => !sink.file(id));
		try {
			for (const id of empty) sink.setFile(id, audio);
		} catch {
			continue;
		}
		if (empty.length > 0) restored++;
	}
	return restored;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A report as the project card says it after "loaded …", parts joined with " · ", or "" when there
 * is nothing to say: from the device, what was read, what could not be and TE's factory sounds; for
 * a file opened from disk, the drive samples kept from an earlier load and those still on the unit.
 */
export function describeSamples(report: SampleReport, from: 'device' | 'file'): string {
	const parts: string[] = [];
	const { device, missing, factory } = report;
	if (from === 'device') {
		if (device > 0) parts.push(`${count(device, 'sample')} from your op-xy`);
		if (missing > 0) parts.push(`${count(missing, 'sample')} could not be read`);
		if (factory > 0) {
			parts.push(
				`${count(factory, 'factory sound')} play${factory === 1 ? 's' : ''} the replica’s stand-ins (the op-xy does not share its factory library over usb)`
			);
		}
	} else {
		if (device > 0) parts.push(`${count(device, 'sample')} kept from your op-xy`);
		if (missing > 0) {
			parts.push(
				`${count(missing, 'sample')} on your op-xy: load the project from it over usb to hear ${missing === 1 ? 'it' : 'them'}`
			);
		}
	}
	return parts.join(' · ');
}

// ───────────────────────────────────────────────────────────────────────── caches

/** Keeps sample files in memory (tests). */
export function createMemorySampleCache(): SampleCache & {
	readonly files: Map<string, Uint8Array>;
} {
	const files = new Map<string, Uint8Array>();
	return {
		files,
		async get(path) {
			return files.get(path) ?? null;
		},
		async put(path, bytes) {
			files.set(path, bytes);
		}
	};
}

const SAMPLE_DB = 'opxy-samples';
const FILES = 'files';

/** What the IndexedDB cache holds per file. */
interface KeptSample {
	readonly path: string;
	readonly bytes: Uint8Array;
	readonly keptAt: number;
}

/**
 * Keeps sample files in IndexedDB (a database of its own, `opxy-samples`, on this computer only);
 * where it is unavailable (a private window) or fails, nothing is kept and nothing breaks.
 */
export function createIdbSampleCache(): SampleCache {
	type Db = import('idb').IDBPDatabase;
	let db: Promise<Db | null> | null = null;
	const open = (): Promise<Db | null> => {
		db ??= (async () => {
			if (typeof indexedDB === 'undefined') return null;
			try {
				const { openDB } = await import('idb');
				return await openDB(SAMPLE_DB, 1, {
					upgrade(database) {
						if (!database.objectStoreNames.contains(FILES)) database.createObjectStore(FILES);
					}
				});
			} catch {
				return null;
			}
		})();
		return db;
	};
	return {
		async get(path) {
			const database = await open();
			if (!database) return null;
			const kept = (await database.get(FILES, path)) as KeptSample | undefined;
			return kept?.bytes instanceof Uint8Array ? kept.bytes : null;
		},
		async put(path, bytes) {
			const database = await open();
			if (!database) return;
			const kept: KeptSample = { path, bytes, keptAt: Date.now() };
			await database.put(FILES, kept, path);
		}
	};
}
