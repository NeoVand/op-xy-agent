import { describe, expect, it } from 'vitest';
import { KEYS, getControl } from './controls';
import { remoteKeysFile } from './data';
import { FirmwareVersionError, RemoteKeyError } from './errors';
import type { ControlId } from './ids';
import {
	REMOTE_KEYS,
	REMOTE_KEY_CHANNEL,
	REMOTE_KEY_DOWN_CC,
	REMOTE_KEY_OBSERVATIONS,
	REMOTE_KEY_UP_CC,
	classifyRemoteKeyStatus,
	remoteKeyByLegacyId,
	remoteKeyByValue,
	remoteKeyForControl,
	remoteKeyMessages,
	remoteKeyStatusAt
} from './remoteKeys';

describe('remote key map', () => {
	it('uses CC106 (down) / CC107 (up) on channel 1', () => {
		expect([REMOTE_KEY_DOWN_CC, REMOTE_KEY_UP_CC, REMOTE_KEY_CHANNEL]).toEqual([106, 107, 0]);
	});

	it('maps every value 0–71 to a real control, one-to-one', () => {
		expect(REMOTE_KEYS.map((k) => k.value)).toEqual(Array.from({ length: 72 }, (_, i) => i));
		expect(REMOTE_KEYS).toHaveLength(remoteKeysFile.keys.length);
		for (const key of REMOTE_KEYS) {
			const control = getControl(key.controlId);
			expect(control.midi?.remoteKey, key.legacyId).toBe(key.value);
		}
		expect(new Set(REMOTE_KEYS.map((k) => k.controlId)).size).toBe(72);
	});

	it('covers all 68 keys plus the four encoder clicks (turns cannot be sent)', () => {
		for (const key of KEYS) expect(remoteKeyForControl(key.id)?.input, key.id).toBe('press');
		const clicks = REMOTE_KEYS.filter((k) => k.input === 'click');
		expect(clicks.map((k) => [k.value, k.controlId])).toEqual([
			[10, 'encoder.1'],
			[11, 'encoder.2'],
			[12, 'encoder.3'],
			[13, 'encoder.4']
		]);
		expect(remoteKeyForControl('knob.volume')).toBeUndefined();
		expect(remoteKeyForControl('strip.pitchbend')).toBeUndefined();
	});

	it.each([
		[0, 'key.project'],
		[1, 'key.tempo'],
		[5, 'key.mix'],
		[6, 'key.m1'],
		[14, 'track.1'],
		[22, 'key.player'],
		[25, 'key.bar'],
		[26, 'keyboard.f3'],
		[33, 'keyboard.c4'],
		[49, 'keyboard.e5'],
		[50, 'key.record'],
		[52, 'key.stop'],
		[55, 'key.shift'],
		[56, 'step.1'],
		[71, 'step.16']
	] satisfies [number, ControlId][])('value %i presses %s', (value, id) => {
		expect(remoteKeyByValue(value).controlId).toBe(id);
		expect(remoteKeyForControl(id)?.value).toBe(value);
	});

	it('keeps the ids and risk classes of remote-keys.json', () => {
		expect(remoteKeyByLegacyId('encDark')?.controlId).toBe('encoder.1');
		expect(remoteKeyByLegacyId('key8')?.controlId).toBe('keyboard.c4');
		expect(remoteKeyByLegacyId('mixer')?.controlId).toBe('key.mix');
		expect(remoteKeyByLegacyId('nope')).toBeUndefined();
		expect(remoteKeyForControl('key.m4')?.risk).toBe('destructive-in-context');
		expect(remoteKeyForControl('key.shift')?.risk).toBe('modifier');
		expect(remoteKeyForControl('step.3')?.risk).toBe('writes-project');
		expect(remoteKeyForControl('key.mix')?.risk).toBe('ui');
	});

	it('rejects unmapped and malformed values', () => {
		expect(() => remoteKeyByValue(72)).toThrow(/unmapped/);
		expect(() => remoteKeyByValue(127)).toThrow(RemoteKeyError);
		for (const bad of [-1, 128, 2.5]) expect(() => remoteKeyByValue(bad)).toThrow(/integer 0-127/);
	});

	it('describes the down/up pair that presses and releases a control', () => {
		expect(remoteKeyMessages('key.play')).toEqual({
			down: { channel: 0, cc: 106, value: 51 },
			up: { channel: 0, cc: 107, value: 51 }
		});
		expect(remoteKeyMessages('encoder.4').down.value).toBe(13);
		expect(() => remoteKeyMessages('knob.volume')).toThrow(/cannot be pressed remotely/);
	});
});

describe('remote keys by firmware', () => {
	it('interprets every report in remote-keys.json', () => {
		expect(REMOTE_KEY_OBSERVATIONS.map((o) => [o.version, o.scope, o.status])).toEqual([
			['1.0.21', 'up-to', 'works'],
			['1.0.21', 'exact', 'works'],
			['1.0.25', 'from', 'reported-broken'],
			[null, null, 'reported-broken'],
			['1.1.4', 'up-to', 'works'],
			['1.1.21', 'exact', 'unverified'],
			['1.1.33', 'exact', 'reported-broken']
		]);
	});

	it('says remote keys do not work on the reference firmware 1.1.33 (verified on the device)', () => {
		const status = remoteKeyStatusAt('1.1.33');
		expect(status).toMatchObject({ version: '1.1.33', status: 'reported-broken', exact: true });
		expect(status.evidence.map((o) => o.version)).toEqual([
			'1.0.21',
			'1.0.21',
			'1.0.25',
			'1.1.4',
			'1.1.21',
			'1.1.33'
		]);
	});

	it.each([
		['1.1.4', 'works', true],
		['1.0.21', 'works', true],
		['1.0.25', 'reported-broken', true],
		['1.1.21', 'unverified', true],
		['1.1.15', 'unknown', false]
	] as const)('on %s: %s', (version, status, exact) => {
		expect(remoteKeyStatusAt(version)).toMatchObject({ status, exact });
	});

	it('classifies free-text reports conservatively', () => {
		expect(classifyRemoteKeyStatus('works; systematic sweep 0-127')).toBe('works');
		expect(classifyRemoteKeyStatus('reported disabled (or moved)')).toBe('reported-broken');
		expect(classifyRemoteKeyStatus('unverified (probe step)')).toBe('unverified');
		expect(classifyRemoteKeyStatus('probably fine')).toBe('unknown');
		expect(() => remoteKeyStatusAt('latest')).toThrow(FirmwareVersionError);
	});
});
