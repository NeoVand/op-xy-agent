/**
 * Firmware versions as first-class state: parsing, ordering, and which MIDI/USB behaviours a
 * given OS version has, from `knowledge/firmware/changelog-midi-usb.json`. The owner's device and
 * our reference is OS 1.1.33; TE's online guide describes 1.1.15.
 */
import type { ChangelogItem } from './changelog.schema';
import { changelogFile } from './data';
import { FirmwareVersionError, KnowledgeValidationError } from './errors';

/** A parsed `major.minor.patch` version. */
export interface FirmwareVersion {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
}

/** The firmware every behaviour, map and format in this project is checked against (D3). */
export const REFERENCE_FIRMWARE = '1.1.33';

/** The OS version TE's online guide describes (changes after it are manual errata). */
export const GUIDE_FIRMWARE = '1.1.15';

const VERSION_RE = /^\s*[vV]?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*$/;

/**
 * Parses `1.1.33` (a leading `v` and surrounding spaces are tolerated, as GREET or users write it).
 * @throws {FirmwareVersionError}
 */
export function parseFirmwareVersion(text: string): FirmwareVersion {
	const m = VERSION_RE.exec(text);
	if (!m)
		throw new FirmwareVersionError(`not a firmware version: "${text}" (expected e.g. 1.1.33)`);
	return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Formats a version as `major.minor.patch`. */
export function formatFirmwareVersion(version: FirmwareVersion): string {
	return `${version.major}.${version.minor}.${version.patch}`;
}

const asVersion = (v: string | FirmwareVersion) =>
	typeof v === 'string' ? parseFirmwareVersion(v) : v;

/**
 * Orders two versions numerically (1.1.4 < 1.1.15 < 1.1.33).
 * @returns -1, 0 or 1
 * @throws {FirmwareVersionError} for malformed strings
 */
export function compareFirmware(
	a: string | FirmwareVersion,
	b: string | FirmwareVersion
): -1 | 0 | 1 {
	const x = asVersion(a);
	const y = asVersion(b);
	const d = x.major - y.major || x.minor - y.minor || x.patch - y.patch;
	return d < 0 ? -1 : d > 0 ? 1 : 0;
}

/** True when `version` is `minimum` or newer. */
export function isFirmwareAtLeast(
	version: string | FirmwareVersion,
	minimum: string | FirmwareVersion
): boolean {
	return compareFirmware(version, minimum) >= 0;
}

/** Every MIDI/USB-relevant changelog item, oldest first. */
export const CHANGELOG: readonly ChangelogItem[] = changelogFile.items;

interface FeatureDefinition {
	/** First version with the behaviour. */
	readonly since: string;
	/** Changelog area of the item that introduced it. */
	readonly area: string;
	/** Disambiguates when one release has several items in the same area. */
	readonly match?: RegExp;
	readonly description: string;
}

/**
 * Named behaviours that firmware-aware code branches on, each pinned to the changelog item that
 * introduced it (checked when this module loads). If `device < since`, assume the old behaviour.
 */
export const FIRMWARE_FEATURES = {
	midiEngineName: {
		since: '1.0.15',
		area: 'midi-track',
		description:
			'the engine that drives external gear is called "midi" (was "external"); LFOs work on MIDI tracks'
	},
	pitchBendToLinkedTracks: {
		since: '1.0.15',
		area: 'midi-out',
		description: 'pitch bend is forwarded to linked tracks; arpeggio notes are not'
	},
	echoRespectsLinkedNotes: {
		since: '1.0.15',
		area: 'midi-echo',
		description: 'the MIDI echo setting also applies to linked notes'
	},
	bleClockAndTransportRelay: {
		since: '1.0.29',
		area: 'midi-sync',
		description: 'MIDI clock over BLE; incoming transport is relayed to other MIDI devices'
	},
	sysexCrashFixed: {
		since: '1.0.29',
		area: 'sysex',
		description:
			'unexpected SysEx no longer crashes the unit; never probe older firmware with SysEx'
	},
	batteryOnComHold: {
		since: '1.0.36',
		area: 'ui',
		description: 'holding com shows the battery level on the level meter'
	},
	projectLoadCcSafe: {
		since: '1.0.40',
		area: 'midi-cc',
		description:
			'repeated project-load requests (CC86) no longer crash the unit; still rate-limit them'
	},
	delayedSceneCc: {
		since: '1.1.0',
		area: 'midi-cc',
		description: 'CC82 queues a scene switch for the next bar'
	},
	midiTrackDuckSource: {
		since: '1.1.3',
		area: 'midi-track',
		description: 'a MIDI track can be the duck LFO source'
	},
	sixteenPatterns: {
		since: '1.1.15',
		area: 'limits',
		description: '16 patterns per track (was 9)'
	},
	midiMonitor: {
		since: '1.1.15',
		area: 'midi-in',
		match: /monitor/i,
		description: 'COM system menu has a MIDI monitor for checking what arrives'
	},
	sustainPedal: {
		since: '1.1.15',
		area: 'midi-in',
		match: /sustain/i,
		description: 'CC64 sustain holds notes until pedal up'
	},
	holdPlayerNoteOff: {
		since: '1.1.25',
		area: 'midi-out',
		description: 'stopping the hold player sends a normal note-off with release'
	},
	plocksOnEmptySteps: {
		since: '1.1.33',
		area: 'sequencer',
		description: 'parameter locks can be added to empty steps'
	}
} as const satisfies Record<string, FeatureDefinition>;

/** A named firmware behaviour. */
export type FirmwareFeature = keyof typeof FIRMWARE_FEATURES;

/** The changelog item that introduced each feature (resolved and checked at load). */
export const FEATURE_ITEMS: Readonly<Record<FirmwareFeature, ChangelogItem>> = (() => {
	const issues: string[] = [];
	const items = {} as Record<FirmwareFeature, ChangelogItem>;
	for (const [name, def] of Object.entries(FIRMWARE_FEATURES) as [
		FirmwareFeature,
		FeatureDefinition
	][]) {
		const candidates = CHANGELOG.filter(
			(item) =>
				item.version === def.since &&
				item.area === def.area &&
				(def.match === undefined || def.match.test(item.summary))
		);
		if (candidates.length === 1) items[name] = candidates[0];
		else
			issues.push(
				`feature ${name}: expected one ${def.since} ${def.area} item, found ${candidates.length}`
			);
	}
	if (issues.length > 0) {
		throw new KnowledgeValidationError('knowledge/firmware/changelog-midi-usb.json', issues);
	}
	return items;
})();

/** Firmware-dependent facts about one OS version. */
export interface FirmwareFeatures {
	readonly version: string;
	/** Each named behaviour: present (true) or not yet (false). */
	readonly flags: Readonly<Record<FirmwareFeature, boolean>>;
	/** Changelog items shipped at or before `version`, oldest first. */
	readonly changes: readonly ChangelogItem[];
	/** Items shipped after `version` up to the newest one we know: behaviour this unit lacks. */
	readonly missing: readonly ChangelogItem[];
	/** The release was withdrawn by TE (e.g. 1.0.29, MTP backup corruption). */
	readonly withdrawn: boolean;
	/** Relative to {@link REFERENCE_FIRMWARE}: facts may differ on older or newer units. */
	readonly relation: 'older' | 'reference' | 'newer';
}

/**
 * What a device on `version` can do, as far as the MIDI/USB changelog tells.
 * @throws {FirmwareVersionError}
 */
export function featuresAt(version: string): FirmwareFeatures {
	const parsed = parseFirmwareVersion(version);
	const changes = CHANGELOG.filter((item) => compareFirmware(item.version, parsed) <= 0);
	const missing = CHANGELOG.filter((item) => compareFirmware(item.version, parsed) > 0);
	const flags = Object.fromEntries(
		Object.entries(FIRMWARE_FEATURES).map(([name, def]) => [
			name,
			isFirmwareAtLeast(parsed, def.since)
		])
	) as Record<FirmwareFeature, boolean>;
	const withdrawn = CHANGELOG.some(
		(item) =>
			item.area === 'release' &&
			/withdrawn/i.test(item.summary) &&
			compareFirmware(item.version, parsed) === 0
	);
	const relative = compareFirmware(parsed, REFERENCE_FIRMWARE);
	return {
		version: formatFirmwareVersion(parsed),
		flags,
		changes,
		missing,
		withdrawn,
		relation: relative < 0 ? 'older' : relative > 0 ? 'newer' : 'reference'
	};
}

/**
 * Whether `version` has a named behaviour.
 * @throws {FirmwareVersionError}
 */
export function hasFeature(version: string, feature: FirmwareFeature): boolean {
	return isFirmwareAtLeast(version, FIRMWARE_FEATURES[feature].since);
}

/**
 * Changelog items after `from` up to and including `to` — what changed when a unit updated.
 * @throws {FirmwareVersionError}
 */
export function changesBetween(from: string, to: string): ChangelogItem[] {
	return CHANGELOG.filter(
		(item) => compareFirmware(item.version, from) > 0 && compareFirmware(item.version, to) <= 0
	);
}
