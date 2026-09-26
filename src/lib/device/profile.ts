/**
 * What the session learns about a connected unit, as plain data: device info from GREET (serial
 * numbers are never kept), the firmware profile against the reference OS 1.1.33 (D3), and what is
 * known about CC106/107 remote keys on that firmware.
 */
import {
	featuresAt,
	FirmwareVersionError,
	REFERENCE_FIRMWARE,
	remoteKeyStatusAt,
	type FirmwareFeatures
} from '$lib/core/opxy';
import type { TeGreetInfo } from '$lib/core/te';

/** GREET `mode`. The updater knows `normal`, `bootloader` and `test`. */
export type DeviceMode = 'normal' | 'bootloader' | 'test' | 'unknown';

/** What GREET tells us about the unit, minus anything that identifies it. */
export interface DeviceInfo {
	readonly product: string | null;
	readonly osVersion: string | null;
	readonly swVersion: string | null;
	readonly hwRev: string | null;
	readonly sku: string | null;
	readonly mode: DeviceMode;
	/** Whether the device reported a serial number. The number itself is never stored or shown. */
	readonly serialReported: boolean;
}

function toMode(value: string | undefined): DeviceMode {
	return value === 'normal' || value === 'bootloader' || value === 'test' ? value : 'unknown';
}

/**
 * Picks the displayable fields out of GREET metadata. Only named keys are copied, so serials
 * (`serial`, `dsp_serial`, `chip_id`) cannot leak even from an unredacted reply.
 */
export function deviceInfoFromGreet(greet: TeGreetInfo): DeviceInfo {
	return {
		product: greet.product ?? null,
		osVersion: greet.os_version ?? null,
		swVersion: greet.sw_version ?? null,
		hwRev: greet.hw_rev ?? null,
		sku: greet.sku ?? null,
		mode: toMode(greet.mode),
		serialReported: greet.serial !== undefined
	};
}

/** The unit's firmware relative to the reference firmware. */
export interface FirmwareProfile {
	/** `os_version` from GREET, normalised; null when unknown. */
	readonly osVersion: string | null;
	/** The firmware this app is verified on (OS 1.1.33). */
	readonly reference: string;
	readonly relation: 'reference' | 'older' | 'newer' | 'unknown';
	readonly mode: DeviceMode;
	/** Firmware-dependent behaviour flags (core/opxy), when the version is known. */
	readonly features: FirmwareFeatures | null;
	/** TE withdrew this release. */
	readonly withdrawn: boolean;
	/** Plain-language warnings for the UI. Empty on a normal 1.1.33 unit. */
	readonly warnings: readonly string[];
}

/** Builds the firmware profile; `info` is null when GREET was unavailable. */
export function firmwareProfile(info: DeviceInfo | null): FirmwareProfile {
	const warnings: string[] = [];
	const mode = info?.mode ?? 'unknown';
	if (mode === 'bootloader') {
		warnings.push(
			'The OP-XY reports bootloader mode (TE Boot). Restart it normally; the app sends nothing else in this mode.'
		);
	} else if (mode === 'test') {
		warnings.push('The OP-XY reports test mode; it may not behave like a normal unit.');
	}
	const unknown = (reason: string): FirmwareProfile => ({
		osVersion: null,
		reference: REFERENCE_FIRMWARE,
		relation: 'unknown',
		mode,
		features: null,
		withdrawn: false,
		warnings: [...warnings, reason]
	});
	const os = info?.osVersion ?? null;
	if (os === null) {
		return unknown(
			`The firmware version is unknown, so the app assumes OS ${REFERENCE_FIRMWARE} behaviour.`
		);
	}
	let features: FirmwareFeatures;
	try {
		features = featuresAt(os);
	} catch (error) {
		if (!(error instanceof FirmwareVersionError)) throw error;
		return unknown(
			`The device reported an unrecognised firmware version ("${os}"); assuming OS ${REFERENCE_FIRMWARE} behaviour.`
		);
	}
	if (features.relation === 'older') {
		warnings.push(
			`This OP-XY runs OS ${features.version}, older than OS ${REFERENCE_FIRMWARE}, which the app is verified on. Some behaviour may differ; consider updating with TE's official updater.`
		);
	} else if (features.relation === 'newer') {
		warnings.push(
			`This OP-XY runs OS ${features.version}, newer than OS ${REFERENCE_FIRMWARE}, which the app is verified on. Most things should work, but some behaviour may differ.`
		);
	}
	if (features.withdrawn) {
		warnings.push(
			`OS ${features.version} was withdrawn by Teenage Engineering; update with TE's official updater.`
		);
	}
	return {
		osVersion: features.version,
		reference: REFERENCE_FIRMWARE,
		relation: features.relation,
		mode,
		features,
		withdrawn: features.withdrawn,
		warnings
	};
}

/** Whether the app may rely on CC106/107 remote keys. It never uses them without a verified probe. */
export type RemoteKeySupport = 'unsupported' | 'reported-working' | 'unknown';

/** Remote-key support on a firmware, with a sentence for the UI. */
export interface RemoteKeyCapability {
	readonly status: RemoteKeySupport;
	readonly note: string;
}

/**
 * What is known about remote keys on `osVersion`. On OS 1.1.33 they were verified to do nothing
 * (docs/research/90-device-probe.md, session 1), so they are reported unsupported, never working.
 */
export function remoteKeyCapability(osVersion: string | null): RemoteKeyCapability {
	if (osVersion === null) {
		return {
			status: 'unknown',
			note: 'Remote keys (CC106/107) are unverified for an unknown firmware, so the app does not use them.'
		};
	}
	let status: ReturnType<typeof remoteKeyStatusAt>['status'];
	try {
		status = remoteKeyStatusAt(osVersion).status;
	} catch (error) {
		if (!(error instanceof FirmwareVersionError)) throw error;
		status = 'unknown';
	}
	if (status === 'reported-broken') {
		return {
			status: 'unsupported',
			note: `Remote keys (CC106/107) have no effect on OS ${osVersion}, so the app cannot press device keys; the replica shows you which keys to press instead.`
		};
	}
	if (status === 'works') {
		return {
			status: 'reported-working',
			note: `Community reports say remote keys work on OS ${osVersion}, but the app has not verified that, so it does not use them.`
		};
	}
	return {
		status: 'unknown',
		note: `Nobody has verified remote keys (CC106/107) on OS ${osVersion}, so the app does not use them.`
	};
}
