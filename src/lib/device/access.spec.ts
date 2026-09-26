import { describe, expect, it } from 'vitest';
import { FakeMidiHost, FakeMidiInput, FakeMidiOutput } from '../../../test/fakes/fake-midi';
import { FakeOpxy } from '../../../test/fakes/fake-opxy';
import { FakeTime } from '../../../test/fakes/fake-time';
import { MidiAccessController, type PairChange } from './access.svelte';
import { CHROME_152_MAC_HINT, NO_DEVICE_HINT } from './ports';
import type { LifecycleTarget, PageTransitionLike } from './types';

function setup(options: { plugged?: boolean } = {}) {
	const time = new FakeTime();
	const host = new FakeMidiHost({ clock: time, timers: time });
	const opxy = new FakeOpxy({ host, clock: time, timers: time });
	if (options.plugged ?? true) opxy.plugIn();
	const access = new MidiAccessController({ environment: () => host.environment() });
	const changes: PairChange['kind'][] = [];
	access.onPairChange((change) => changes.push(change.kind));
	const messages: number[][] = [];
	access.onMessage((data) => messages.push([...data]));
	return { time, host, opxy, access, changes, messages };
}

class FakeWindow implements LifecycleTarget {
	#listeners = new Map<string, Array<(event: PageTransitionLike) => void>>();
	addEventListener(type: 'pagehide' | 'pageshow', listener: (event: PageTransitionLike) => void) {
		this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
	}
	removeEventListener(
		type: 'pagehide' | 'pageshow',
		listener: (event: PageTransitionLike) => void
	) {
		this.#listeners.set(
			type,
			(this.#listeners.get(type) ?? []).filter((l) => l !== listener)
		);
	}
	fire(type: 'pagehide' | 'pageshow', persisted: boolean) {
		for (const listener of this.#listeners.get(type) ?? []) listener({ persisted });
	}
	count(type: 'pagehide' | 'pageshow') {
		return this.#listeners.get(type)?.length ?? 0;
	}
}

describe('MidiAccessController: support and permission', () => {
	it('does nothing on construction and never prompts in init()', async () => {
		const { host, access, time } = setup();
		expect(access.status).toBe('idle');
		access.init();
		await time.flush();
		expect(host.requests).toHaveLength(0);
		expect(access.status).toBe('idle');
		expect(access.permission).toBe('prompt');
	});

	it('reports a browser without Web MIDI as unsupported, with guidance', async () => {
		const { host, access } = setup();
		host.supported = false;
		access.init();
		expect(access.status).toBe('unsupported');
		expect(access.problem?.code).toBe('unsupported-browser');
		expect(access.problem?.action).toMatch(/Chrome, Edge or Firefox/);
		expect(await access.request()).toBe(false);
		expect(host.requests).toHaveLength(0);
	});

	it('reports an insecure page as unsupported', () => {
		const { host, access } = setup();
		host.secureContext = false;
		access.init();
		expect(access.status).toBe('unsupported');
		expect(access.problem?.code).toBe('insecure-context');
		expect(access.supported).toBe(false);
	});

	it('grants MIDI with SysEx and pairs the OP-XY ports by name', async () => {
		const { host, access, changes, time } = setup();
		const pending = access.request();
		expect(access.status).toBe('requesting');
		expect(await pending).toBe(true);
		await time.flush();
		expect(host.requests).toEqual([{ sysex: true }]);
		expect(access.status).toBe('granted');
		expect(access.sysex).toBe(true);
		expect(access.sysexEnabled).toBe(true);
		expect(access.problem).toBeNull();
		expect(access.permission).toBe('granted');
		expect(access.pair?.input).toMatchObject({ id: 'opxy-in', name: 'OP-XY', state: 'connected' });
		expect(access.pair?.output).toMatchObject({ id: 'opxy-out', name: 'OP-XY' });
		expect(access.inputs.map((p) => p.name)).toEqual(['OP-XY']);
		expect(changes).toEqual(['connected']);
		// Granting access opens nothing.
		expect(access.opened).toBe(false);
		expect(access.output).toBeNull();
	});

	it('shares one request between concurrent calls', async () => {
		const { host, access } = setup();
		const [a, b] = await Promise.all([access.request(), access.request()]);
		expect(a && b).toBe(true);
		expect(host.requests).toHaveLength(1);
	});

	it('reports MIDI without SysEx as its own problem', async () => {
		const { host, access } = setup();
		host.grantSysex = false;
		expect(await access.request()).toBe(true);
		expect(access.status).toBe('granted');
		expect(access.sysex).toBe(false);
		expect(access.problem?.code).toBe('sysex-denied');
		expect(access.problem?.detail).toMatch(/firmware version/);
	});

	it('maps a denial to status denied with site-settings guidance', async () => {
		const { host, access, time } = setup();
		host.denyWith = 'NotAllowedError';
		expect(await access.request()).toBe(false);
		await time.flush();
		expect(access.status).toBe('denied');
		expect(access.problem).toMatchObject({
			code: 'permission-denied',
			errorName: 'NotAllowedError'
		});
		expect(access.problem?.action).toMatch(/site settings/);
		expect(access.permission).toBe('denied');
	});

	it.each([
		['InvalidStateError', 'system-error'],
		['NotSupportedError', 'not-supported'],
		['AbortError', 'aborted'],
		['WeirdError', 'unknown']
	])('maps %s to status error (%s)', async (name, code) => {
		const { host, access } = setup();
		host.denyWith = name;
		expect(await access.request()).toBe(false);
		expect(access.status).toBe('error');
		expect(access.problem?.code).toBe(code);
	});

	it('can retry after a denial', async () => {
		const { host, access } = setup();
		host.denyWith = 'NotAllowedError';
		await access.request();
		host.denyWith = null;
		expect(await access.request()).toBe(true);
		expect(access.status).toBe('granted');
		expect(access.problem).toBeNull();
	});
});

describe('MidiAccessController: pairing', () => {
	it('ignores ports that are not the OP-XY and prefers identically named pairs', async () => {
		const { host, access } = setup({ plugged: false });
		host.plug(
			new FakeMidiInput({ id: 'iac', name: 'IAC Bus 1' }),
			new FakeMidiOutput({ id: 'iac-out', name: 'IAC Bus 1' }),
			new FakeMidiInput({ id: 'win-in', name: 'MIDIIN2 (OP-XY)' }),
			new FakeMidiInput({ id: 'xy-in', name: 'OP-XY' }),
			new FakeMidiOutput({ id: 'xy-out', name: 'OP-XY' })
		);
		await access.request();
		expect(access.pair?.input.id).toBe('xy-in');
		expect(access.pair?.output.id).toBe('xy-out');
		expect(access.inputs).toHaveLength(3);
	});

	it('explains a missing device, with the Chrome 152 hint on macOS', async () => {
		const { host, access } = setup({ plugged: false });
		host.userAgent =
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7000.0 Safari/537.36';
		await access.request();
		expect(access.pair).toBeNull();
		expect(access.hints).toEqual([NO_DEVICE_HINT, CHROME_152_MAC_HINT]);
	});

	it('gives only the generic hint elsewhere', async () => {
		const { access } = setup({ plugged: false });
		await access.request();
		expect(access.hints).toEqual([NO_DEVICE_HINT]);
	});
});

describe('MidiAccessController: open and close', () => {
	it('opens the pair explicitly and delivers messages only while open', async () => {
		const { access, opxy, messages, time } = setup();
		await access.request();
		opxy.emit([0x90, 60, 100]);
		await time.advance(5);
		expect(messages).toEqual([]);

		expect(await access.openPair()).toBe(true);
		expect(access.opened).toBe(true);
		expect(opxy.input.connection).toBe('open');
		expect(opxy.output.connection).toBe('open');
		expect(access.output).toBe(opxy.output);
		expect(access.inputPort).toEqual({ id: 'opxy-in', name: 'OP-XY' });
		expect(opxy.input.listenerCount).toBe(1);

		opxy.emit([0x90, 60, 100]);
		await time.advance(5);
		expect(messages).toEqual([[0x90, 60, 100]]);

		await access.closePair();
		expect(access.opened).toBe(false);
		expect(access.output).toBeNull();
		expect(opxy.input.connection).toBe('closed');
		expect(opxy.output.connection).toBe('closed');
		expect(opxy.input.listenerCount).toBe(0);
		opxy.emit([0x80, 60, 0]);
		await time.advance(5);
		expect(messages).toHaveLength(1);
	});

	it('is idempotent and does not loop on its own statechange events', async () => {
		const { access, opxy, changes } = setup();
		await access.request();
		await access.openPair();
		await access.openPair();
		expect(opxy.input.listenerCount).toBe(1);
		expect(changes).toEqual(['connected']);
	});

	it('reports a port that will not open', async () => {
		const { access, opxy } = setup();
		await access.request();
		opxy.input.failOpenWith = 'InvalidAccessError';
		expect(await access.openPair()).toBe(false);
		expect(access.opened).toBe(false);
		expect(access.problem).toMatchObject({ code: 'open-failed', errorName: 'InvalidAccessError' });
		expect(await access.openPair()).toBe(true);
		expect(access.problem).toBeNull();
	});

	it('stays closed when closed while the ports were still opening', async () => {
		const { access, opxy, messages, time } = setup();
		await access.request();
		const opening = access.openPair();
		await access.closePair();
		expect(await opening).toBe(false);
		expect(access.opened).toBe(false);
		expect(access.output).toBeNull();
		opxy.emit([0x90, 60, 1]);
		await time.advance(5);
		expect(messages).toEqual([]);
	});

	it('returns false without a device', async () => {
		const { access } = setup({ plugged: false });
		await access.request();
		expect(await access.openPair()).toBe(false);
	});

	it('close() releases access entirely', async () => {
		const { access, host, opxy } = setup();
		await access.request();
		await access.openPair();
		await access.close();
		expect(access.status).toBe('idle');
		expect(access.pair).toBeNull();
		expect(access.inputs).toEqual([]);
		expect(opxy.input.connection).toBe('closed');
		expect(host.accesses[0].listenerCount).toBe(0);
	});
});

describe('MidiAccessController: hot-plug', () => {
	it('reports unplugging as a disconnect and reopens when the device returns', async () => {
		const { access, opxy, changes, messages, time } = setup();
		await access.request();
		await access.openPair();

		opxy.unplug();
		expect(changes).toEqual(['connected', 'disconnected']);
		expect(access.pair).toBeNull();
		expect(access.opened).toBe(false);
		expect(access.output).toBeNull();
		expect(access.status).toBe('granted');
		expect(access.problem).toBeNull();
		expect(opxy.input.connection).toBe('pending');

		opxy.plugIn();
		await time.flush();
		expect(changes).toEqual(['connected', 'disconnected', 'connected']);
		expect(access.opened).toBe(true);
		expect(opxy.input.connection).toBe('open');
		opxy.emit([0xb0, 7, 100]);
		await time.advance(5);
		expect(messages).toEqual([[0xb0, 7, 100]]);
	});

	it('treats MTP mode (ports removed) the same way', async () => {
		const { access, host, opxy, changes, time } = setup();
		host.removeOnDisconnect = true;
		await access.request();
		await access.openPair();
		opxy.enterMtp();
		expect(access.pair).toBeNull();
		expect(access.inputs).toEqual([]);
		expect(changes.at(-1)).toBe('disconnected');
		opxy.leaveMtp();
		await time.flush();
		expect(changes.at(-1)).toBe('connected');
		expect(access.opened).toBe(true);
	});

	it('does not reopen a pair the user closed', async () => {
		const { access, opxy, time } = setup();
		await access.request();
		await access.openPair();
		await access.closePair();
		opxy.unplug();
		opxy.plugIn();
		await time.flush();
		expect(access.pair).not.toBeNull();
		expect(access.opened).toBe(false);
		expect(opxy.input.connection).toBe('closed');
	});

	it('finds a device plugged in after access was granted', async () => {
		const { access, opxy, changes } = setup({ plugged: false });
		await access.request();
		expect(access.pair).toBeNull();
		opxy.plugIn();
		expect(access.pair?.input.name).toBe('OP-XY');
		expect(access.hints).toEqual([]);
		expect(changes).toEqual(['connected']);
	});

	it('moves the listener when the device comes back as new port objects', async () => {
		const { access, host, opxy, messages, time } = setup();
		await access.request();
		await access.openPair();
		opxy.unplug();
		const replacement = new FakeOpxy({ host, clock: time, timers: time, idPrefix: 'opxy2' });
		replacement.plugIn();
		await time.flush();
		expect(access.pair?.input.id).toBe('opxy2-in');
		expect(access.opened).toBe(true);
		expect(opxy.input.listenerCount).toBe(0);
		replacement.emit([0x90, 64, 1]);
		await time.advance(5);
		expect(messages).toEqual([[0x90, 64, 1]]);
	});
});

describe('MidiAccessController: page lifecycle', () => {
	it('closes the ports on pagehide and reopens them from the back/forward cache', async () => {
		const { access, opxy, time } = setup();
		const win = new FakeWindow();
		const unbind = access.bindLifecycle(win);
		await access.request();
		await access.openPair();

		win.fire('pagehide', true);
		await time.flush();
		expect(opxy.input.connection).toBe('closed');
		expect(access.opened).toBe(false);

		win.fire('pageshow', true);
		await time.flush();
		expect(opxy.input.connection).toBe('open');
		expect(access.opened).toBe(true);

		unbind();
		expect(win.count('pagehide')).toBe(0);
		expect(win.count('pageshow')).toBe(0);
	});

	it('does not reopen on a fresh pageshow or after the user closed the pair', async () => {
		const { access, opxy, time } = setup();
		const win = new FakeWindow();
		access.bindLifecycle(win);
		await access.request();
		await access.openPair();
		win.fire('pagehide', false);
		win.fire('pageshow', false);
		await time.flush();
		expect(opxy.input.connection).toBe('closed');
		await access.closePair();
		win.fire('pageshow', true);
		await time.flush();
		expect(opxy.input.connection).toBe('closed');
	});
});
