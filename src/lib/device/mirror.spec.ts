import { describe, expect, it } from 'vitest';
import { tempoToCc } from '$lib/core/opxy';
import { createFakeRig, type FakeRigOptions } from '../../../test/fakes/rig';

async function connected(options: FakeRigOptions = {}) {
	const rig = createFakeRig(options);
	await rig.connect();
	return rig;
}

const cc = (channel: number, controller: number, value: number) =>
	({ type: 'controlChange', channel, controller, value }) as const;

describe('DeviceMirror: clock and tempo', () => {
	it('measures 120 BPM from the device clock, even while stopped', async () => {
		const { stack, time, opxy } = await connected({ opxy: { clockMode: 'both' } });
		expect(opxy.playing).toBe(false);
		await time.advance(2000);
		expect(stack.mirror.clockOut).toBe(true);
		expect(stack.mirror.measuredBpm).toBeCloseTo(120, 1);
		expect(stack.mirror.playState).toBe('unknown');
	});

	it('follows a tempo change sent with CC80', async () => {
		const { stack, time } = await connected({ opxy: { clockMode: 'both' } });
		await time.advance(1000);
		stack.transport.send(cc(0, 80, tempoToCc(92)), { source: 'user' });
		expect(stack.mirror.tempoSent).toBe(92);
		await time.advance(3000);
		expect(stack.mirror.measuredBpm).toBeCloseTo(92, 1);
	});

	it('clamps like the device: CC80 127 is 220 BPM', async () => {
		const { stack, time } = await connected({ opxy: { clockMode: 'both' } });
		stack.transport.send(cc(0, 80, 127), { source: 'user' });
		expect(stack.mirror.tempoSent).toBe(220);
		await time.advance(2000);
		expect(stack.mirror.measuredBpm).toBeCloseTo(220, 0);
	});

	it('reports no clock with the stock COM setting (clock in)', async () => {
		const { stack, time } = await connected();
		await time.advance(2000);
		expect(stack.mirror.clockOut).toBe(false);
		expect(stack.mirror.measuredBpm).toBeNull();
	});

	it('drops clockOut a second after the clock stops', async () => {
		const { stack, time, opxy } = await connected({ opxy: { clockMode: 'both' } });
		await time.advance(1000);
		expect(stack.mirror.clockOut).toBe(true);
		opxy.setClockMode('in');
		await time.advance(900);
		expect(stack.mirror.clockOut).toBe(true);
		await time.advance(200);
		expect(stack.mirror.clockOut).toBe(false);
		expect(stack.mirror.measuredBpm).toBeNull();
	});
});

describe('DeviceMirror: play state', () => {
	it('follows play and stop pressed on the device (FA/FC)', async () => {
		const { stack, time, opxy } = await connected({ opxy: { clockMode: 'both' } });
		opxy.pressPlay();
		await time.advance(5);
		expect(stack.mirror.playState).toBe('playing');
		expect(stack.mirror.playSource).toBe('device');
		opxy.pressStop();
		await time.advance(5);
		expect(stack.mirror.playState).toBe('stopped');
		expect(stack.mirror.playSource).toBe('device');
	});

	it('marks our own FA as unconfirmed until the device relays it', async () => {
		const { stack, time, opxy } = await connected({ opxy: { clockMode: 'both' } });
		stack.transport.send({ type: 'start' }, { source: 'user' });
		expect(stack.mirror.playState).toBe('playing');
		expect(stack.mirror.playSource).toBe('app');
		await time.advance(5);
		expect(opxy.playing).toBe(true);
		expect(stack.mirror.playSource).toBe('echo');
	});

	it('stays unconfirmed with the stock clock-in setting', async () => {
		const { stack, time, opxy } = await connected();
		stack.transport.send({ type: 'start' }, { source: 'user' });
		await time.advance(5);
		expect(opxy.playing).toBe(true);
		expect(stack.mirror.playState).toBe('playing');
		expect(stack.mirror.playSource).toBe('app');
		stack.transport.send({ type: 'stop' }, { source: 'user' });
		expect(stack.mirror.playState).toBe('stopped');
	});

	it('treats CC104/CC105 = 127 as play/stop, confirmed by the device', async () => {
		const { stack, time } = await connected({ opxy: { clockMode: 'both' } });
		stack.transport.send(cc(0, 104, 127), { source: 'user' });
		expect(stack.mirror.playSource).toBe('app');
		await time.advance(5);
		expect(stack.mirror.playState).toBe('playing');
		expect(stack.mirror.playSource).toBe('device');
		stack.transport.send(cc(0, 105, 127), { source: 'user' });
		await time.advance(5);
		expect(stack.mirror.playState).toBe('stopped');
		stack.transport.send(cc(0, 104, 1), { source: 'user' });
		expect(stack.mirror.playState).toBe('stopped');
	});
});

describe('DeviceMirror: sent-state cache', () => {
	it('remembers the track selected with CC102 (zero-based, channel 1 only)', async () => {
		const { stack, time, opxy } = await connected();
		expect(stack.mirror.selectedTrack).toBeNull();
		stack.transport.send(cc(0, 102, 2), { source: 'user' });
		expect(stack.mirror.selectedTrack).toBe(3);
		await time.advance(5);
		expect(opxy.selectedTrack).toBe(3);
		stack.transport.send(cc(4, 102, 6), { source: 'user' });
		expect(stack.mirror.selectedTrack).toBe(3);
	});

	it('remembers mutes set with CC9 as a level (0 unmuted, 1–127 muted)', async () => {
		const { stack, time, opxy } = await connected();
		stack.transport.send(cc(0, 9, 127), { source: 'user' });
		stack.transport.send(cc(3, 9, 1), { source: 'user' });
		stack.transport.send(cc(3, 9, 0), { source: 'user' });
		expect(stack.mirror.mutes.slice(0, 5)).toEqual([true, null, null, false, null]);
		await time.advance(5);
		expect(opxy.mutes.slice(0, 4)).toEqual([true, false, false, false]);
	});

	it('keeps the last value of every CC sent, with its OP-XY name', async () => {
		const { stack, time } = await connected();
		stack.transport.send(cc(2, 32, 40), { source: 'agent' });
		stack.transport.send(cc(2, 32, 41), { source: 'agent' });
		expect(stack.mirror.sentCcs['2:32']).toMatchObject({
			channel: 2,
			controller: 32,
			value: 41,
			time: time.now(),
			name: 'T3 filter cutoff'
		});
		expect(Object.keys(stack.mirror.sentCcs)).toEqual(['2:32']);
	});

	it('ignores CCs the device sends (they are not our sent state)', async () => {
		const { stack, time, opxy } = await connected();
		opxy.emit([0xb0, 9, 127]);
		await time.advance(5);
		expect(stack.mirror.mutes[0]).toBeNull();
		expect(stack.mirror.sentCcs).toEqual({});
	});

	it('forgets everything when the device goes away', async () => {
		const { stack, time, opxy } = await connected({ opxy: { clockMode: 'both' } });
		stack.transport.send(cc(0, 102, 1), { source: 'user' });
		stack.transport.send(cc(0, 9, 127), { source: 'user' });
		stack.transport.send({ type: 'start' }, { source: 'user' });
		await time.advance(500);
		opxy.unplug();
		expect(stack.mirror).toMatchObject({
			playState: 'unknown',
			playSource: null,
			clockOut: false,
			measuredBpm: null,
			tempoSent: null,
			selectedTrack: null
		});
		expect(stack.mirror.mutes.every((m) => m === null)).toBe(true);
		expect(stack.mirror.sentCcs).toEqual({});
	});

	it('stops following the bus when stopped', async () => {
		const { stack } = await connected();
		stack.mirror.stop();
		stack.transport.send(cc(0, 102, 5), { source: 'user' });
		expect(stack.mirror.selectedTrack).toBeNull();
		stack.mirror.start();
		stack.transport.send(cc(0, 102, 5), { source: 'user' });
		expect(stack.mirror.selectedTrack).toBe(6);
	});
});
