import { describe, expect, it } from 'vitest';
import { parse } from '$lib/core/midi/messages';
import { buildResponseFrame, buildRequestFrame, fileListRequest, greetRequest } from '$lib/core/te';
import {
	displayHex,
	isGreetReply,
	labelFor,
	OPXY_DESCRIBE_PROFILE,
	redactedGreetText,
	teFrameLabel
} from './describe';
import {
	accessProblem,
	findOpxyPair,
	isChromium152OnMac,
	isOpxyPortName,
	problemFromError,
	type AccessProblemCode
} from './ports';
import { deviceInfoFromGreet, firmwareProfile, remoteKeyCapability } from './profile';
import type { MidiInputLike, MidiOutputLike } from './types';

const GREET =
	'product:OP-XY;mode:normal;serial:TESTSERIAL;dsp_serial:TESTDSPSERIAL;os_version:1.1.33;sw_version:1.1.33;hw_rev:2;sku:TE033AS001';

describe('port names and pairing', () => {
	it.each(['OP-XY', 'op-xy', 'OP XY', 'opxy', 'OP–XY', 'MIDIIN2 (OP-XY)', 'OP-XY Midi'])(
		'recognises %s',
		(name) => {
			expect(isOpxyPortName(name)).toBe(true);
		}
	);

	it.each(['OP-1', 'OP-Z', 'IAC Bus 1', 'Loop XY', 'TopXY', ''])('rejects %s', (name) => {
		expect(isOpxyPortName(name)).toBe(false);
	});

	it('rejects a missing name', () => {
		expect(isOpxyPortName(null)).toBe(false);
	});

	it('pairs only connected ports', () => {
		const port = (id: string, name: string, state: 'connected' | 'disconnected') =>
			({ id, name, state }) as unknown as MidiInputLike & MidiOutputLike;
		expect(
			findOpxyPair([port('a', 'OP-XY', 'disconnected')], [port('b', 'OP-XY', 'connected')])
		).toBeNull();
		const pair = findOpxyPair(
			[port('a', 'OP-XY (1)', 'connected'), port('c', 'OP-XY', 'connected')],
			[port('b', 'OP-XY', 'connected')]
		);
		expect(pair?.input.id).toBe('c');
		const fallback = findOpxyPair(
			[port('a', 'OP-XY in', 'connected')],
			[port('b', 'OP-XY out', 'connected')]
		);
		expect([fallback?.input.id, fallback?.output.id]).toEqual(['a', 'b']);
	});
});

describe('access guidance', () => {
	it('has a title, detail and action for every problem', () => {
		const codes: AccessProblemCode[] = [
			'unsupported-browser',
			'insecure-context',
			'permission-denied',
			'sysex-denied',
			'system-error',
			'not-supported',
			'aborted',
			'open-failed',
			'unknown'
		];
		for (const code of codes) {
			const problem = accessProblem(code);
			expect(problem.code).toBe(code);
			expect(problem.title).toMatch(/^[a-z]/);
			expect(problem.detail.length).toBeGreaterThan(20);
			expect(problem.action.length).toBeGreaterThan(10);
		}
	});

	it('maps DOMException names and odd values', () => {
		expect(problemFromError(new DOMException('x', 'SecurityError')).code).toBe('permission-denied');
		expect(problemFromError('nope').code).toBe('unknown');
		expect(problemFromError(null).errorName).toBeNull();
	});

	it('spots Chromium 152 on macOS only', () => {
		const mac =
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)';
		expect(isChromium152OnMac(`${mac} Chrome/152.0.7000.1 Safari/537.36`)).toBe(true);
		expect(isChromium152OnMac(`${mac} Chrome/153.0.7100.1 Safari/537.36`)).toBe(false);
		expect(isChromium152OnMac('Mozilla/5.0 (Windows NT 10.0) Chrome/152.0.1 Safari/537.36')).toBe(
			false
		);
	});
});

describe('device info and firmware profile', () => {
	const info = (text: string) =>
		deviceInfoFromGreet(
			Object.fromEntries(text.split(';').map((kv) => kv.split(':') as [string, string]))
		);

	it('copies only displayable GREET fields, never serials', () => {
		const result = info(GREET);
		expect(result).toEqual({
			product: 'OP-XY',
			osVersion: '1.1.33',
			swVersion: '1.1.33',
			hwRev: '2',
			sku: 'TE033AS001',
			mode: 'normal',
			serialReported: true
		});
		expect(JSON.stringify(result)).not.toContain('TESTSERIAL');
		expect(deviceInfoFromGreet({ mode: 'weird' })).toMatchObject({
			mode: 'unknown',
			serialReported: false
		});
	});

	it('is quiet for the reference firmware', () => {
		expect(firmwareProfile(info(GREET))).toMatchObject({ relation: 'reference', warnings: [] });
	});

	it('explains unknown and unparseable versions', () => {
		expect(firmwareProfile(null)).toMatchObject({ relation: 'unknown', mode: 'unknown' });
		expect(firmwareProfile(null).warnings[0]).toMatch(/unknown/);
		const odd = firmwareProfile(info('product:OP-XY;os_version:banana;mode:test'));
		expect(odd.relation).toBe('unknown');
		expect(odd.warnings.join(' ')).toMatch(/test mode/);
		expect(odd.warnings.join(' ')).toMatch(/"banana"/);
	});

	it('knows remote keys do nothing on 1.1.33 and are unverified elsewhere', () => {
		expect(remoteKeyCapability('1.1.33').status).toBe('unsupported');
		expect(remoteKeyCapability('1.1.4').status).toBe('reported-working');
		expect(remoteKeyCapability('1.1.30').status).toBe('unknown');
		expect(remoteKeyCapability(null).status).toBe('unknown');
		expect(remoteKeyCapability('x.y').status).toBe('unknown');
	});
});

describe('describing traffic', () => {
	it('names OP-XY controllers', () => {
		expect(OPXY_DESCRIBE_PROFILE.ccName?.(80, 5)).toBe('tempo');
		expect(OPXY_DESCRIBE_PROFILE.ccName?.(9, 0)).toBe('T1 mute');
		expect(OPXY_DESCRIBE_PROFILE.ccName?.(32, 2)).toBe('T3 filter cutoff');
		expect(OPXY_DESCRIBE_PROFILE.ccName?.(3, 15)).toBeUndefined();
		expect(labelFor(parse([0xb0, 104, 127]), Uint8Array.of(0xb0, 104, 127))).toBe('play = 127');
	});

	it('labels TE frames by command', () => {
		const greet = buildRequestFrame({ deviceId: 0x21, requestId: 9, ...greetRequest() });
		const list = buildRequestFrame({ deviceId: 0x21, requestId: 10, ...fileListRequest(0, 0) });
		expect(teFrameLabel(greet)).toBe('TE GREET request');
		expect(teFrameLabel(list)).toBe('TE FILE LIST request');
		expect(
			teFrameLabel(buildResponseFrame({ deviceId: 0x21, requestId: 10, cmd: 5, status: 3 }))
		).toBe('TE FILE reply · bad request');
		expect(teFrameLabel([0xf0, 0x00, 0x20, 0x76, 0x21, 0x33, 0x41, 0xf7])).toMatch(/debug/);
		expect(teFrameLabel([0x90, 60, 100])).toBeNull();
	});

	it('hides the GREET payload and redacts its text', () => {
		const reply = buildResponseFrame({
			deviceId: 0x21,
			requestId: 1,
			cmd: 1,
			status: 0,
			data: Array.from(GREET, (c) => c.charCodeAt(0))
		});
		expect(isGreetReply(reply)).toBe(true);
		const shown = displayHex(reply);
		expect(shown).toMatch(/^F0 00 20 76 21 40 20 01 01 00 … \(\d+ bytes hidden/);
		const text = redactedGreetText(reply) ?? '';
		expect(text).toContain('serial: <redacted>');
		expect(text).toContain('dsp_serial: <redacted>');
		expect(text).not.toContain('TESTSERIAL');
		expect(redactedGreetText([0x90, 1, 1])).toBeNull();
	});

	it('shortens long messages', () => {
		const long = new Uint8Array(40).fill(0x01);
		long[0] = 0xf0;
		long[39] = 0xf7;
		expect(displayHex(long, 8)).toBe('F0 01 01 01 01 01 01 01 … (+32 bytes)');
	});
});
