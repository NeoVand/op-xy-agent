import { describe, expect, it } from 'vitest';
import { ccMapFile, controlsFile } from './data';
import { FirmwareVersionError } from './errors';
import {
	CHANGELOG,
	FEATURE_ITEMS,
	FIRMWARE_FEATURES,
	GUIDE_FIRMWARE,
	REFERENCE_FIRMWARE,
	changesBetween,
	compareFirmware,
	featuresAt,
	formatFirmwareVersion,
	hasFeature,
	isFirmwareAtLeast,
	parseFirmwareVersion,
	type FirmwareFeature
} from './firmware';

describe('versions', () => {
	it('parses major.minor.patch, tolerating a leading v and spaces', () => {
		expect(parseFirmwareVersion('1.1.33')).toEqual({ major: 1, minor: 1, patch: 33 });
		expect(parseFirmwareVersion(' v1.0.9 ')).toEqual({ major: 1, minor: 0, patch: 9 });
		expect(formatFirmwareVersion({ major: 1, minor: 1, patch: 4 })).toBe('1.1.4');
	});

	it.each(['1.1', '1.1.33.1', 'OS', '', 'x.y.z', '1.1.33-beta'])('rejects "%s"', (text) => {
		expect(() => parseFirmwareVersion(text)).toThrow(FirmwareVersionError);
	});

	it('orders numerically, not as text', () => {
		expect(compareFirmware('1.1.4', '1.1.15')).toBe(-1);
		expect(compareFirmware('1.1.33', '1.1.15')).toBe(1);
		expect(compareFirmware('1.0.50', '1.1.0')).toBe(-1);
		expect(compareFirmware('2.0.0', '1.99.99')).toBe(1);
		expect(compareFirmware('1.1.33', parseFirmwareVersion('1.1.33'))).toBe(0);
		expect(isFirmwareAtLeast('1.1.33', '1.1.33')).toBe(true);
		expect(isFirmwareAtLeast('1.0.40', '1.1.0')).toBe(false);
	});

	it('pins the reference firmware to the owner’s device and the guide to 1.1.15', () => {
		expect(REFERENCE_FIRMWARE).toBe('1.1.33');
		expect(controlsFile.firmware.reference).toBe(REFERENCE_FIRMWARE);
		expect(
			(ccMapFile.firmware as { deviceOfRecord: { os_version: string } }).deviceOfRecord.os_version
		).toBe(REFERENCE_FIRMWARE);
		expect(GUIDE_FIRMWARE).toBe('1.1.15');
		expect(controlsFile.firmware.guide).toBe(GUIDE_FIRMWARE);
	});
});

describe('changelog', () => {
	it('is in release order and ends at the reference firmware', () => {
		for (let i = 1; i < CHANGELOG.length; i++) {
			expect(compareFirmware(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeLessThanOrEqual(
				0
			);
		}
		expect(CHANGELOG[CHANGELOG.length - 1].version).toBe(REFERENCE_FIRMWARE);
	});

	it('pins every named feature to the changelog item that introduced it', () => {
		for (const [name, def] of Object.entries(FIRMWARE_FEATURES)) {
			const item = FEATURE_ITEMS[name as FirmwareFeature];
			expect(item.version, name).toBe(def.since);
			expect(item.area, name).toBe(def.area);
		}
		expect(FEATURE_ITEMS.sustainPedal.summary).toMatch(/sustain/i);
		expect(FEATURE_ITEMS.midiMonitor.summary).toMatch(/monitor/i);
	});

	it('lists what changed between two versions', () => {
		const versions = changesBetween('1.1.15', '1.1.33').map((i) => i.version);
		expect([...new Set(versions)]).toEqual(['1.1.25', '1.1.32', '1.1.33']);
		expect(changesBetween('1.1.33', '1.1.33')).toEqual([]);
	});
});

describe('featuresAt', () => {
	it('has everything on the reference firmware', () => {
		const features = featuresAt('1.1.33');
		expect(Object.values(features.flags).every(Boolean)).toBe(true);
		expect(features.changes).toHaveLength(CHANGELOG.length);
		expect(features.missing).toEqual([]);
		expect(features.relation).toBe('reference');
		expect(features.withdrawn).toBe(false);
	});

	it('knows what an older unit lacks', () => {
		const features = featuresAt('1.0.36');
		expect(features.relation).toBe('older');
		expect(features.flags).toMatchObject({
			sysexCrashFixed: true,
			batteryOnComHold: true,
			projectLoadCcSafe: false,
			delayedSceneCc: false,
			sixteenPatterns: false,
			plocksOnEmptySteps: false
		});
		expect(features.missing[0].version).toBe('1.0.38');
		expect(features.changes.every((i) => compareFirmware(i.version, '1.0.36') <= 0)).toBe(true);
		expect(featuresAt('1.0.9').flags.midiEngineName).toBe(false);
	});

	it('flags the withdrawn 1.0.29 release', () => {
		expect(featuresAt('1.0.29').withdrawn).toBe(true);
		expect(featuresAt('1.0.32').withdrawn).toBe(false);
	});

	it('treats unknown newer firmware as having every known feature', () => {
		const features = featuresAt('v1.2.0');
		expect(features.version).toBe('1.2.0');
		expect(features.relation).toBe('newer');
		expect(Object.values(features.flags).every(Boolean)).toBe(true);
	});

	it('answers single feature questions', () => {
		expect(hasFeature('1.1.15', 'sixteenPatterns')).toBe(true);
		expect(hasFeature('1.1.4', 'sixteenPatterns')).toBe(false);
		expect(hasFeature('1.0.40', 'projectLoadCcSafe')).toBe(true);
		expect(() => featuresAt('newest')).toThrow(FirmwareVersionError);
	});
});
