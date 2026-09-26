/**
 * CC106/107 remote keys: `CC106 = v` presses front-panel key v, `CC107 = v` releases it (values
 * 0–71 cover every key and the four encoder clicks; nothing turns an encoder). Community-verified up
 * to OS 1.1.4 and **unknown on 1.1.33** — capability-gate every use on a UI-only probe per firmware
 * (docs/research/20-midi-control.md §7). This module maps values ↔ control ids; it sends nothing.
 */
import type { Confidence } from './common.schema';
import { CONTROLS } from './controls';
import { remoteKeysFile } from './data';
import { RemoteKeyError } from './errors';
import { compareFirmware, parseFirmwareVersion } from './firmware';
import type { ControlId } from './ids';
import type { RemoteKeyGroup, RemoteKeyRisk } from './remoteKeys.schema';

/** Controller number of a remote key press. */
export const REMOTE_KEY_DOWN_CC = remoteKeysFile.protocol.down.cc;
/** Controller number of a remote key release. */
export const REMOTE_KEY_UP_CC = remoteKeysFile.protocol.up.cc;
/** 0-based channel every source uses (channel 1); other channels are untested. */
export const REMOTE_KEY_CHANNEL = remoteKeysFile.protocol.channelObserved - 1;

/** One remote key. */
export interface RemoteKey {
	/** CC106/107 data value, 0–71. */
	readonly value: number;
	readonly controlId: ControlId;
	/** `click` for the four encoders, `press` for keys. */
	readonly input: 'press' | 'click';
	/** Id used in remote-keys.json (`encDark`, `key8`, …). */
	readonly legacyId: string;
	readonly label: string;
	readonly group: RemoteKeyGroup;
	/** How dangerous a remote press is (see remote-keys.json `riskClasses`). */
	readonly risk: RemoteKeyRisk;
	readonly behavior: string;
	readonly confidence: Confidence;
	readonly source: readonly string[];
}

/** A channel-voice CC message, described (core/midi encodes the bytes). */
export interface CcMessageSpec {
	/** 0-based channel. */
	readonly channel: number;
	readonly cc: number;
	readonly value: number;
}

const CONTROL_BY_REMOTE_KEY = new Map(
	CONTROLS.filter((c) => c.midi?.remoteKey != null).map((c) => [c.midi?.remoteKey as number, c])
);

/** Every remote key, by value. Consistency with controls.json is checked when data.ts loads. */
export const REMOTE_KEYS: readonly RemoteKey[] = remoteKeysFile.keys.map((key) => {
	const control = CONTROL_BY_REMOTE_KEY.get(key.value);
	if (!control) throw new RemoteKeyError(`remote key ${key.value} has no control`);
	return {
		value: key.value,
		controlId: control.id,
		input: control.kind === 'encoder' ? 'click' : 'press',
		legacyId: key.id,
		label: key.label,
		group: key.group,
		risk: key.risk,
		behavior: key.behavior,
		confidence: key.confidence,
		source: key.source
	};
});

const BY_CONTROL = new Map<ControlId, RemoteKey>(REMOTE_KEYS.map((k) => [k.controlId, k]));
const BY_LEGACY_ID = new Map<string, RemoteKey>(REMOTE_KEYS.map((k) => [k.legacyId, k]));

/** The remote key that presses (or clicks) a control; undefined for controls without one. */
export function remoteKeyForControl(id: ControlId): RemoteKey | undefined {
	return BY_CONTROL.get(id);
}

/**
 * The remote key with a CC106/107 value.
 * @throws {RemoteKeyError} for values outside 0–127 or unmapped values (72–127: no observed effect)
 */
export function remoteKeyByValue(value: number): RemoteKey {
	if (!Number.isInteger(value) || value < 0 || value > 127) {
		throw new RemoteKeyError(`remote key value must be an integer 0-127, got ${value}`);
	}
	const key = REMOTE_KEYS[value];
	if (!key) throw new RemoteKeyError(`remote key value ${value} is unmapped (no observed effect)`);
	return key;
}

/** Looks a remote key up by its remote-keys.json id (`encDark`, `track3`, `key8`). */
export function remoteKeyByLegacyId(id: string): RemoteKey | undefined {
	return BY_LEGACY_ID.get(id);
}

/**
 * The down/up message pair that presses and releases a control remotely. Every down must be
 * followed by its up (held-key ledger, release on stop/panic/disconnect).
 * @throws {RemoteKeyError} for controls without a remote key (encoder turns, volume, …)
 */
export function remoteKeyMessages(id: ControlId): { down: CcMessageSpec; up: CcMessageSpec } {
	const key = BY_CONTROL.get(id);
	if (!key) throw new RemoteKeyError(`${id} cannot be pressed remotely`);
	return {
		down: { channel: REMOTE_KEY_CHANNEL, cc: REMOTE_KEY_DOWN_CC, value: key.value },
		up: { channel: REMOTE_KEY_CHANNEL, cc: REMOTE_KEY_UP_CC, value: key.value }
	};
}

// ---------------------------------------------------------------------------------------------
// Firmware status

/** What is known about remote keys on a firmware version. */
export type RemoteKeyStatus = 'works' | 'reported-broken' | 'unverified' | 'unknown';

/** One report from remote-keys.json `firmwareStatus`, interpreted. */
export interface RemoteKeyObservation {
	/** The report's firmware text, e.g. `<=1.1.4 (tested 2026-03-04)`. */
	readonly firmware: string;
	/** Version the report was made on, or null when it names none ("2025 (unspecified)"). */
	readonly version: string | null;
	/** Whether the report claims just that version or a range around it. */
	readonly scope: 'exact' | 'up-to' | 'from' | null;
	readonly status: RemoteKeyStatus;
	readonly statusText: string;
	readonly source: readonly string[];
}

/** Classifies a report's free-text status. Unrecognised wording counts as unknown. */
export function classifyRemoteKeyStatus(text: string): RemoteKeyStatus {
	if (/^(?:works|used as)/i.test(text)) return 'works';
	if (/disabled|not working/i.test(text)) return 'reported-broken';
	if (/^unverified/i.test(text)) return 'unverified';
	return 'unknown';
}

/** Every firmware report, interpreted, in file order. */
export const REMOTE_KEY_OBSERVATIONS: readonly RemoteKeyObservation[] =
	remoteKeysFile.firmwareStatus.map((report) => {
		const m = /^(<=|>=)?\s*(\d+\.\d+\.\d+)/.exec(report.firmware);
		const version = m ? m[2] : null;
		if (version !== null) parseFirmwareVersion(version);
		return {
			firmware: report.firmware,
			version,
			scope: m ? (m[1] === '<=' ? 'up-to' : m[1] === '>=' ? 'from' : 'exact') : null,
			status: classifyRemoteKeyStatus(report.status),
			statusText: report.status,
			source: report.source
		};
	});

/**
 * What the reports say about remote keys on `version`: the status of reports made on exactly
 * that version when they agree, otherwise `unknown`. Either way the app must still run its own
 * UI-only probe before pressing anything; `evidence` lists every dated report, oldest first.
 * @throws {FirmwareVersionError} for a malformed version
 */
export function remoteKeyStatusAt(version: string): {
	readonly version: string;
	readonly status: RemoteKeyStatus;
	readonly exact: boolean;
	readonly evidence: readonly RemoteKeyObservation[];
} {
	parseFirmwareVersion(version);
	const dated = REMOTE_KEY_OBSERVATIONS.filter((o) => o.version !== null).sort((a, b) =>
		compareFirmware(a.version as string, b.version as string)
	);
	const statuses = new Set(
		dated.filter((o) => compareFirmware(o.version as string, version) === 0).map((o) => o.status)
	);
	const status = statuses.size === 1 ? [...statuses][0] : 'unknown';
	return { version, status, exact: statuses.size > 0, evidence: dated };
}
