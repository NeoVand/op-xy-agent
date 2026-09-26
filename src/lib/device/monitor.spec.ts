import { describe, expect, it } from 'vitest';
import { MidiBus } from '$lib/core/midi/bus';
import { parse } from '$lib/core/midi/messages';
import { FAKE_SERIAL } from '../../../test/fakes/fake-opxy';
import { FakeTime } from '../../../test/fakes/fake-time';
import { createFakeRig } from '../../../test/fakes/rig';
import { MidiMonitor } from './monitor.svelte';

function setup(options: { capacity?: number; visible?: number } = {}) {
	const time = new FakeTime();
	const bus = new MidiBus();
	const monitor = new MidiMonitor({ bus, frames: time, ...options });
	monitor.start();
	const emit = (bytes: number[], direction: 'in' | 'out' = 'in') =>
		bus.emit({
			time: time.now(),
			portId: 'p',
			portName: 'OP-XY',
			direction,
			source: direction === 'in' ? 'device' : 'user',
			bytes: Uint8Array.from(bytes),
			message: parse(bytes)
		});
	return { time, bus, monitor, emit };
}

describe('MidiMonitor', () => {
	it('batches UI updates to one per animation frame', async () => {
		const { time, monitor, emit } = setup();
		for (let i = 0; i < 100; i++) emit([0xb0, 7, i]);
		expect(monitor.version).toBe(0);
		expect(time.pendingFrames).toBe(1);
		await time.runFrames();
		expect(monitor.version).toBe(1);
		expect(monitor.total).toBe(100);
		expect(monitor.rows).toHaveLength(100);
		await time.runFrames();
		expect(monitor.version).toBe(1);
	});

	it('keeps the newest 2,000 events in a ring buffer', async () => {
		const { time, monitor, emit } = setup({ visible: 5000 });
		for (let i = 0; i < 2100; i++) emit([0x90 | (i % 16), i % 128, 1 + (i % 100)]);
		await time.runFrames();
		expect(monitor.size).toBe(2000);
		expect(monitor.total).toBe(2100);
		const rows = monitor.rows;
		expect(rows).toHaveLength(2000);
		expect(rows[0].id).toBe(2100);
		expect(rows.at(-1)?.id).toBe(101);
	});

	it('shows at most `visible` rows, newest first', async () => {
		const { time, monitor, emit } = setup({ visible: 3 });
		for (let i = 0; i < 10; i++) emit([0xb0, 7, i]);
		await time.runFrames();
		expect(monitor.rows.map((r) => r.label)).toEqual([
			'T1 volume / level = 9',
			'T1 volume / level = 8',
			'T1 volume / level = 7'
		]);
	});

	it('hides clock by default and filters by direction and text', async () => {
		const { time, monitor, emit } = setup();
		emit([0xf8]);
		emit([0xf8]);
		emit([0xfa]);
		emit([0xb0, 80, 60], 'out');
		await time.runFrames();
		expect(monitor.rows.map((r) => r.label)).toEqual(['tempo = 60', 'Start']);
		monitor.hideClock = false;
		expect(monitor.rows).toHaveLength(4);
		monitor.direction = 'out';
		expect(monitor.rows.map((r) => r.direction)).toEqual(['out']);
		monitor.direction = 'all';
		monitor.search = 'START';
		expect(monitor.rows.map((r) => r.label)).toEqual(['Start']);
	});

	it('describes messages in OP-XY terms', async () => {
		const { time, monitor, emit } = setup();
		emit([0xb0, 102, 2], 'out');
		emit([0xb2, 9, 127], 'out');
		emit([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7], 'out');
		await time.runFrames();
		const [identity, mute, select] = monitor.rows;
		expect(select).toMatchObject({ label: 'track select = 2', channel: 1, hex: 'B0 66 02' });
		expect(mute.label).toBe('T3 mute = 127');
		expect(identity.label).toBe('SysEx · Identity Request');
		expect(monitor.detail(select.id)).toMatch(/Track select \(CC 102\) set to 2/);
	});

	it('counts but does not keep events while paused', async () => {
		const { time, monitor, emit } = setup();
		monitor.paused = true;
		emit([0xb0, 7, 1]);
		await time.runFrames();
		expect(monitor.total).toBe(1);
		expect(monitor.rows).toEqual([]);
	});

	it('clears, and stops following the bus when stopped', async () => {
		const { time, monitor, emit } = setup();
		emit([0xb0, 7, 1]);
		await time.runFrames();
		monitor.clear();
		expect(monitor.rows).toEqual([]);
		expect(monitor.total).toBe(0);
		monitor.stop();
		emit([0xb0, 7, 2]);
		expect(time.pendingFrames).toBe(0);
		expect(monitor.size).toBe(0);
		expect(monitor.detail(1)).toBeNull();
	});

	it('marks echoes and labels TE traffic, hiding GREET serials', async () => {
		const rig = createFakeRig({ opxy: { echoAll: true } });
		await rig.connect();
		rig.stack.transport.send(
			{ type: 'controlChange', channel: 0, controller: 9, value: 127 },
			{
				source: 'user'
			}
		);
		await rig.time.advance(10);
		await rig.time.runFrames();
		const rows = rig.stack.monitor.rows;
		const labels = rows.map((r) => `${r.direction} ${r.label}${r.echo ? ' (echo)' : ''}`).reverse();
		expect(labels).toEqual([
			'out SysEx · Identity Request',
			'in SysEx · Identity Reply · Teenage Engineering',
			// GREET goes out as soon as the reply arrives; the echoed request lands just after.
			'out TE GREET request',
			'in SysEx · Identity Request (echo)',
			'in TE GREET reply · ok',
			'out T1 mute = 127',
			'in T1 mute = 127 (echo)'
		]);
		const greet = rows.find((r) => r.label.startsWith('TE GREET reply'));
		expect(greet?.hex).toMatch(/bytes hidden/);
		const detail = rig.stack.monitor.detail(greet?.id ?? -1) ?? '';
		expect(detail).toMatch(/serial: <redacted>/);
		expect(detail).toMatch(/os_version: 1\.1\.33/);
		expect(JSON.stringify(rows) + detail).not.toContain(FAKE_SERIAL);
	});
});
