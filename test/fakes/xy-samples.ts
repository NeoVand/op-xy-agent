/**
 * Projects that name samples, for tests: a `.xy` (the committed blank project, say) with the sample
 * regions of a track's pattern written as given (docs/research/10-xy-format.md §3.5 ★), and small
 * WAV files to stand for the samples on a device's drive. Nothing here comes from a device or from
 * TE: the paths are made up and the audio is a sine. Relative imports, so the e2e tests (which do
 * not know `$lib`) can use it too.
 */
import { setU32 } from '../../src/lib/core/xy/bytes';
import { decodeXy, encodeXy } from '../../src/lib/core/xy/container';
import {
	PATTERN,
	PRESET_PATH_SIZE,
	REGION,
	REGION_SIZE,
	SAMPLE_PATH_SIZE,
	SAMPLE_REGIONS,
	walkProject
} from '../../src/lib/core/xy/layout';
import { encodeWav } from '../../src/lib/core/presets/wav';

/** One region as a test writes it; unset fields keep what the template holds. */
export interface RegionEdit {
	/** The sample's path; null empties the region. */
	readonly path: string | null;
	readonly key?: number;
	readonly root?: number;
	readonly frames?: number;
	readonly start?: number;
	readonly end?: number;
	readonly loopStart?: number;
	readonly loopEnd?: number;
	readonly crossfade?: number;
	readonly mode?: number;
	readonly fine?: number;
	readonly gain?: number;
	readonly reverse?: boolean;
}

/** What to write on one track's pattern. */
export interface TrackSamples {
	/** Track, 0-based. */
	readonly t: number;
	/** Pattern, 0-based (default the first). */
	readonly p?: number;
	/** The engine byte (drum 0x03, sampler 0x02, multisampler 0x1E); default the template's. */
	readonly engine?: number;
	/** The preset path (`drum/test`); default the template's. */
	readonly preset?: string;
	/** Empty every region first. */
	readonly clear?: boolean;
	/** Regions by record, 0–23. */
	readonly regions: Readonly<Record<number, RegionEdit>>;
}

const encoder = new TextEncoder();

/** `file` with each track's regions (and engine, preset) written as given. */
export function withSamples(file: Uint8Array, tracks: readonly TrackSamples[]): Uint8Array {
	const { header, image } = decodeXy(file);
	const edited = image.slice();
	const layout = walkProject(header, edited);
	for (const track of tracks) {
		const base = layout.tracks[track.t][track.p ?? 0].base;
		if (track.engine !== undefined) edited[base + PATTERN.engine] = track.engine;
		if (track.preset !== undefined) {
			const at = base + PATTERN.presetPath;
			edited.fill(0, at, at + PRESET_PATH_SIZE);
			edited.set(encoder.encode(track.preset), at);
		}
		if (track.clear) {
			for (let r = 0; r < SAMPLE_REGIONS; r++) {
				const at = base + PATTERN.regions + r * REGION_SIZE + REGION.path;
				edited.fill(0, at, at + SAMPLE_PATH_SIZE);
			}
		}
		for (const [index, edit] of Object.entries(track.regions)) {
			writeRegion(edited, base + PATTERN.regions + Number(index) * REGION_SIZE, edit);
		}
	}
	return encodeXy(header, edited);
}

function writeRegion(image: Uint8Array, at: number, edit: RegionEdit): void {
	const path = at + REGION.path;
	image.fill(0, path, path + SAMPLE_PATH_SIZE);
	if (edit.path !== null) {
		const bytes = encoder.encode(edit.path);
		if (bytes.length >= SAMPLE_PATH_SIZE) throw new Error(`a test path of ${bytes.length} bytes`);
		image.set(bytes, path);
	}
	const words = { frames: 0, start: 0, end: 0, loopStart: 0, loopEnd: 0, crossfade: 0 } as const;
	for (const key of Object.keys(words) as (keyof typeof words)[]) {
		const value = edit[key];
		if (value !== undefined) setU32(image, at + REGION[key], value >>> 0);
	}
	if (edit.root !== undefined) image[at + REGION.root] = edit.root;
	if (edit.key !== undefined) image[at + REGION.key] = edit.key;
	if (edit.mode !== undefined) image[at + REGION.mode] = edit.mode;
	if (edit.fine !== undefined) image[at + REGION.fine] = edit.fine;
	if (edit.gain !== undefined) image[at + REGION.gain] = edit.gain & 0xff;
	if (edit.reverse !== undefined) image[at + REGION.direction] = edit.reverse ? 1 : 0;
}

/** A mono 16-bit WAV of `frames` frames of a sine (the pitch tells files apart). */
export function testWav(frames = 441, sampleRate = 44_100, hz = 440): Uint8Array {
	const channel = Float32Array.from(
		{ length: frames },
		(_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / sampleRate)
	);
	return encodeWav({ sampleRate, channels: [channel] });
}
