/**
 * What the OP-XY takes, made visible before anything is written (docs/research/30-presets-samples.md
 * §1, §3): 24 keys or zones, 20 s a sample, 16-bit 44.1 kHz WAVs, and 64 MB of samples a project
 * can load; plus the name rules (§3.5). Stats are what the preset maker's strip shows; problems are
 * what it warns about (a warning still exports; an error blocks it).
 */
import { MAX_SECONDS, PRESET_RATE } from './audio';
import { safeName } from './build';
import { DRUM_KEYS, MAX_ZONES } from './patch';

/** The device's limits the preset maker checks. */
export const DEVICE_LIMITS = {
	keys: DRUM_KEYS,
	zones: MAX_ZONES,
	seconds: MAX_SECONDS,
	/** Loaded sample memory per project. */
	projectBytes: 64 * 1024 * 1024,
	/** The longest preset name we write (its folder name). */
	name: 24
} as const;

/** A sound as it will be written: its frames and channels. */
export interface SoundSize {
	readonly frames: number;
	readonly channels: number;
}

/** Bytes of one 16-bit WAV as the builder writes it (88-byte header with `smpl`). */
export const wavBytes = (s: SoundSize): number => 88 + s.frames * s.channels * 2;

/** What a preset holds. */
export interface PresetStats {
	readonly sounds: number;
	/** The longest sound, seconds. */
	readonly longest: number;
	/** Every sound's length added up, seconds. */
	readonly seconds: number;
	/** The preset's size (its WAVs and patch.json), bytes. */
	readonly bytes: number;
}

/** The stats of sounds written at the preset rate. */
export function presetStats(sounds: readonly SoundSize[]): PresetStats {
	const seconds = sounds.map((s) => s.frames / PRESET_RATE);
	return {
		sounds: sounds.length,
		longest: seconds.reduce((m, s) => Math.max(m, s), 0),
		seconds: seconds.reduce((a, b) => a + b, 0),
		bytes: sounds.reduce((n, s) => n + wavBytes(s), 0) + 4096
	};
}

/** Something the device would not take, or would take differently than it looks here. */
export interface PresetProblem {
	/** `error` blocks the export; `warning` is worth knowing. */
	readonly level: 'error' | 'warning';
	readonly text: string;
}

/** Checks a preset before it is built: its name, how many sounds, how long, how big. */
export function presetProblems(
	name: string,
	stats: PresetStats,
	options: { readonly zones?: boolean; readonly overflow?: number } = {}
): PresetProblem[] {
	const out: PresetProblem[] = [];
	if (stats.sounds === 0) out.push({ level: 'error', text: 'no sounds yet: drop some audio' });
	const cleaned = safeName(name || 'untitled', DEVICE_LIMITS.name);
	const typed = name.trim().toLowerCase();
	if (typed && cleaned !== typed) {
		out.push({ level: 'warning', text: `the device will list it as “${cleaned}”` });
	}
	if (options.overflow && options.overflow > 0) {
		out.push({
			level: 'warning',
			text: `${options.overflow} more than the ${options.zones ? DEVICE_LIMITS.zones + ' zones' : DEVICE_LIMITS.keys + ' keys'}: left out`
		});
	}
	if (stats.longest > DEVICE_LIMITS.seconds + 1e-9) {
		out.push({
			level: 'warning',
			text: `a sound is over ${DEVICE_LIMITS.seconds} s: it is cut at ${DEVICE_LIMITS.seconds} s`
		});
	}
	if (stats.bytes > DEVICE_LIMITS.projectBytes) {
		out.push({
			level: 'error',
			text: `${megabytes(stats.bytes)} is more than the 64 MB a project can load`
		});
	} else if (stats.bytes > DEVICE_LIMITS.projectBytes / 2) {
		out.push({
			level: 'warning',
			text: `${megabytes(stats.bytes)}: over half of what a project can load`
		});
	}
	return out;
}

/** A size as people read it: "820 KB", "12.4 MB". */
export function megabytes(bytes: number): string {
	return bytes < 1024 * 1024
		? `${Math.max(1, Math.round(bytes / 1024))} KB`
		: `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
