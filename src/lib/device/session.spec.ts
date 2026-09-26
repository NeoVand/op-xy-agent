import { describe, expect, it } from 'vitest';
import { buildResponseFrame } from '$lib/core/te';
import { FAKE_DSP_SERIAL, FAKE_SERIAL } from '../../../test/fakes/fake-opxy';
import { createFakeRig, type FakeRigOptions } from '../../../test/fakes/rig';
import { SessionStateError } from './errors';
import { NO_DEVICE_HINT } from './ports';
import { DISCONNECTED_NOTICE } from './session.svelte';

/** Messages the fake device received, as hex strings. */
function received(rig: ReturnType<typeof createFakeRig>): string[] {
	return rig.opxy.received.map((bytes) =>
		[...bytes].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
	);
}

const IDENTITY_REQUEST = 'F0 7E 7F 06 01 F7';
const isGreet = (hex: string) => /^F0 00 20 76 21 40 [67][0-9A-F] [0-9A-F]{2} 01 F7$/.test(hex);

function rig(options: FakeRigOptions = {}) {
	return createFakeRig(options);
}

describe('DeviceSession.connect', () => {
	it('asks for MIDI + SysEx, identifies, greets and reaches ready', async () => {
		const r = rig();
		const { session, access } = r.stack;
		await r.connect();

		expect(r.host.requests).toEqual([{ sysex: true }]);
		expect(access.opened).toBe(true);
		expect(session.phase).toBe('ready');
		expect(session.ready).toBe(true);
		expect(session.identity).toMatchObject({ deviceId: 0x21, sku: 'TE033AS001', familyCode: 33 });
		expect(session.info).toEqual({
			product: 'OP-XY',
			osVersion: '1.1.33',
			swVersion: '1.1.33',
			hwRev: '2',
			sku: 'TE033AS001',
			mode: 'normal',
			serialReported: true
		});
		expect(session.firmware).toMatchObject({
			osVersion: '1.1.33',
			reference: '1.1.33',
			relation: 'reference',
			mode: 'normal',
			withdrawn: false,
			warnings: []
		});
		expect(session.warnings).toEqual([]);
		expect(session.allWarnings).toEqual([]);
		expect(session.identityStatus).toBe('ok');
		expect(session.teStatus).toBe('ok');

		// Read-only probe: exactly one identity request and one GREET reached the device.
		const sent = received(r);
		expect(sent).toHaveLength(2);
		expect(sent[0]).toBe(IDENTITY_REQUEST);
		expect(isGreet(sent[1])).toBe(true);
	});

	it('reports capabilities, with remote keys unsupported on 1.1.33', async () => {
		const r = rig();
		await r.connect();
		const caps = r.stack.session.capabilities;
		expect(caps).toMatchObject({
			sysex: true,
			identity: 'ok',
			teProtocol: 'ok',
			files: 'unknown',
			clockOut: 'not-seen'
		});
		expect(caps.remoteKeys.status).toBe('unsupported');
		expect(caps.remoteKeys.note).toMatch(/no effect on OS 1\.1\.33/);
	});

	it('sees clock out when COM clock is set to both', async () => {
		const r = rig({ opxy: { clockMode: 'both' } });
		await r.connect();
		await r.time.advance(100);
		expect(r.stack.session.capabilities.clockOut).toBe('observed');
	});

	it('never keeps or exposes the serial numbers', async () => {
		const r = rig();
		await r.connect();
		const { session, monitor } = r.stack;
		await r.time.runFrames();
		const visible = JSON.stringify({
			info: session.info,
			firmware: session.firmware,
			identity: session.identity,
			warnings: session.allWarnings,
			rows: monitor.rows,
			details: monitor.rows.map((row) => monitor.detail(row.id))
		});
		expect(visible).not.toContain(FAKE_SERIAL);
		expect(visible).not.toContain(FAKE_DSP_SERIAL);
		expect(visible).toContain('<redacted>');
	});

	it('routes all probe traffic through the transport with source system', async () => {
		const r = rig();
		const out: Array<{ source: string; cause?: string }> = [];
		r.stack.bus.subscribe((e) => {
			if (e.direction === 'out') out.push({ source: e.source, cause: e.cause });
		});
		await r.connect();
		expect(out).toEqual([
			{ source: 'system', cause: 'session:identity' },
			{ source: 'system', cause: 'session' }
		]);
	});
});

describe('DeviceSession: firmware profile', () => {
	it('warns about an older firmware than the 1.1.33 reference', async () => {
		const r = rig({ opxy: { osVersion: '1.1.21' } });
		await r.connect();
		const { firmware } = r.stack.session;
		expect(firmware?.relation).toBe('older');
		expect(firmware?.warnings.join(' ')).toMatch(/OS 1\.1\.21, older than OS 1\.1\.33/);
		expect(r.stack.session.capabilities.remoteKeys.status).not.toBe('unsupported');
	});

	it('warns about a newer firmware', async () => {
		const r = rig({ opxy: { osVersion: '1.2.0' } });
		await r.connect();
		expect(r.stack.session.firmware?.relation).toBe('newer');
		expect(r.stack.session.allWarnings.join(' ')).toMatch(/newer than OS 1\.1\.33/);
	});

	it('warns about a withdrawn release', async () => {
		const r = rig({ opxy: { osVersion: '1.0.29' } });
		await r.connect();
		expect(r.stack.session.firmware?.withdrawn).toBe(true);
		expect(r.stack.session.allWarnings.join(' ')).toMatch(/withdrawn/);
	});

	it('flags bootloader mode and refuses to read files', async () => {
		const r = rig({ opxy: { mode: 'bootloader' } });
		await r.connect();
		const { session } = r.stack;
		expect(session.phase).toBe('ready');
		expect(session.firmware?.mode).toBe('bootloader');
		expect(session.allWarnings.join(' ')).toMatch(/bootloader/);
		await expect(session.listFiles(0)).rejects.toBeInstanceOf(SessionStateError);
	});
});

describe('DeviceSession: a silent or limited device', () => {
	it('gives GREET about 2 s, then carries on without the TE protocol', async () => {
		const r = rig({ opxy: { respondToTe: false } });
		const { session } = r.stack;
		const done = session.connect();
		await r.time.advance(50);
		expect(session.phase).toBe('greeting');
		await r.time.advance(1900);
		expect(session.phase).toBe('greeting');
		await r.time.advance(100);
		await done;
		expect(session.phase).toBe('ready');
		expect(session.teStatus).toBe('failed');
		expect(session.identityStatus).toBe('ok');
		expect(session.firmware?.relation).toBe('unknown');
		expect(session.warnings.join(' ')).toMatch(/GREET/);
		expect(session.allWarnings.join(' ')).toMatch(/assumes OS 1\.1\.33/);
	});

	it('retries the identity request, then gives up without sending GREET', async () => {
		const r = rig({ opxy: { respondToIdentity: false, echoUniversalSysex: false } });
		const { session } = r.stack;
		const done = session.connect();
		await r.time.advance(3000);
		await done;
		expect(session.phase).toBe('ready');
		expect(session.identityStatus).toBe('no-reply');
		expect(session.teStatus).toBe('skipped');
		expect(received(r)).toEqual([IDENTITY_REQUEST, IDENTITY_REQUEST, IDENTITY_REQUEST]);
	});

	it('sends no SysEx at all when SysEx was not granted', async () => {
		const r = rig();
		r.host.grantSysex = false;
		await r.connect();
		const { session, access } = r.stack;
		expect(access.problem?.code).toBe('sysex-denied');
		expect(session.phase).toBe('ready');
		expect(session.identityStatus).toBe('skipped');
		expect(session.teStatus).toBe('skipped');
		expect(session.capabilities.sysex).toBe(false);
		expect(session.warnings.join(' ')).toMatch(/SysEx is not allowed/);
		expect(received(r)).toEqual([]);
	});

	it('ends in error with guidance when MIDI is denied', async () => {
		const r = rig();
		r.host.denyWith = 'NotAllowedError';
		await r.connect();
		const { session } = r.stack;
		expect(session.phase).toBe('error');
		expect(session.problem?.code).toBe('permission-denied');
		expect(received(r)).toEqual([]);
	});

	it('ends in error when the browser has no Web MIDI', async () => {
		// The environment is read once, when the stack starts, so change it before that.
		const r = rig({ start: false });
		r.host.supported = false;
		await r.connect();
		expect(r.stack.session.phase).toBe('error');
		expect(r.stack.session.problem?.code).toBe('unsupported-browser');
		expect(r.host.requests).toEqual([]);
	});

	it('halts TE traffic on a device debug frame', async () => {
		const r = rig();
		await r.connect();
		r.opxy.emit([0xf0, 0x00, 0x20, 0x76, 0x21, 0x33, 0x6f, 0x6f, 0x70, 0x73, 0xf7]);
		await r.time.advance(5);
		expect(r.stack.session.teStatus).toBe('halted');
		expect(r.stack.session.warnings.join(' ')).toMatch(/Power-cycle/);
		await expect(r.stack.session.listFiles(0)).rejects.toBeInstanceOf(SessionStateError);
	});
});

describe('DeviceSession: hot-plug', () => {
	it('waits for a device that is not plugged in, then probes it when it appears', async () => {
		const r = rig({ plugged: false });
		const { session } = r.stack;
		await r.connect();
		expect(session.phase).toBe('waiting-for-device');
		expect(session.notice).toBe(NO_DEVICE_HINT);
		r.opxy.plugIn();
		await r.time.advance(50);
		expect(session.phase).toBe('ready');
		expect(session.info?.osVersion).toBe('1.1.33');
	});

	it('treats MTP mode as a disconnect (not an error) and reconnects afterwards', async () => {
		const r = rig({ opxy: { clockMode: 'both' } });
		const { session, mirror } = r.stack;
		await r.connect();
		await r.time.advance(100);
		expect(mirror.clockOut).toBe(true);

		r.opxy.enterMtp();
		expect(session.phase).toBe('disconnected');
		expect(session.problem).toBeNull();
		expect(session.notice).toBe(DISCONNECTED_NOTICE);
		expect(session.notice).toMatch(/MTP/);
		expect(session.info?.product).toBe('OP-XY');
		expect(mirror.clockOut).toBe(false);

		r.opxy.leaveMtp();
		await r.time.advance(50);
		expect(session.phase).toBe('ready');
		expect(received(r).filter((m) => m === IDENTITY_REQUEST)).toHaveLength(2);
	});

	it('survives an unplug in the middle of GREET', async () => {
		const r = rig({ opxy: { latencyMs: 20 } });
		const { session } = r.stack;
		const done = session.connect();
		await r.time.advance(30);
		expect(session.phase).toBe('greeting');
		r.opxy.unplug();
		await r.time.advance(3000);
		await done;
		expect(session.phase).toBe('disconnected');
		r.opxy.plugIn();
		await r.time.advance(200);
		expect(session.phase).toBe('ready');
		expect(session.teStatus).toBe('ok');
	});

	it('survives an unplug during the identity request, without stale warnings', async () => {
		const r = rig({ opxy: { latencyMs: 20 } });
		const { session } = r.stack;
		const done = session.connect();
		await r.time.advance(5);
		expect(session.phase).toBe('identifying');
		r.opxy.unplug();
		await r.time.advance(3000);
		await done;
		expect(session.phase).toBe('disconnected');
		expect(session.warnings).toEqual([]);
		r.opxy.plugIn();
		await r.time.advance(200);
		expect(session.phase).toBe('ready');
		expect(session.identityStatus).toBe('ok');
	});

	it('does not reconnect after an explicit disconnect', async () => {
		const r = rig();
		const { session, access } = r.stack;
		await r.connect();
		await session.disconnect();
		expect(session.phase).toBe('idle');
		expect(session.info).toBeNull();
		expect(access.opened).toBe(false);
		expect(r.opxy.input.connection).toBe('closed');
		r.opxy.unplug();
		r.opxy.plugIn();
		await r.time.advance(50);
		expect(session.phase).toBe('idle');
		expect(received(r).filter((m) => m === IDENTITY_REQUEST)).toHaveLength(1);
	});

	it('can connect again after disconnecting', async () => {
		const r = rig();
		await r.connect();
		await r.stack.session.disconnect();
		await r.connect();
		expect(r.stack.session.phase).toBe('ready');
		expect(r.host.requests).toHaveLength(1);
	});
});

describe('DeviceSession.listFiles (read-only)', () => {
	it('lists the root and the empty drum and synth folders', async () => {
		const r = rig();
		const { session, bus } = r.stack;
		await r.connect();
		const causes: string[] = [];
		bus.subscribe((e) => {
			if (e.direction === 'out') causes.push(`${e.source}:${e.cause}`);
		});

		const listing = session.listFiles(0);
		await r.time.advance(20);
		expect((await listing).map((e) => [e.id, e.name, e.flags])).toEqual([
			[1, 'drum', 0x0e],
			[2, 'synth', 0x0e]
		]);
		const drum = session.listFiles(1);
		await r.time.advance(20);
		expect(await drum).toEqual([]);
		expect(session.fileStatus).toBe('ok');
		expect(session.capabilities.files).toBe('ok');

		// FILE INIT once, then LIST pages; every request attributed to the user.
		const fileRequests = received(r).filter((m) => / 05 00 /.test(m.slice(0, 30)));
		expect(fileRequests.length).toBeGreaterThanOrEqual(3);
		expect(causes.every((c) => c === 'user:files')).toBe(true);
		expect(r.opxy.fileWrites).toBe(0);
	});

	it('refuses before the device is ready', async () => {
		const r = rig();
		await expect(r.stack.session.listFiles(0)).rejects.toBeInstanceOf(SessionStateError);
	});

	it('marks FILE as failed when the device refuses a listing', async () => {
		const r = rig();
		await r.connect();
		const listing = r.stack.session.listFiles(99);
		const settled = listing.catch((error: unknown) => error);
		await r.time.advance(20);
		expect(await settled).toBeInstanceOf(Error);
		expect(r.stack.session.fileStatus).toBe('failed');
	});
});

describe('DeviceSession: unknown replies', () => {
	it('ignores TE replies that belong to nothing', async () => {
		const r = rig();
		await r.connect();
		r.opxy.emit(buildResponseFrame({ deviceId: 0x21, requestId: 999, cmd: 1, status: 0 }));
		await r.time.advance(5);
		expect(r.stack.session.phase).toBe('ready');
		expect(r.stack.session.teStatus).toBe('ok');
	});
});
