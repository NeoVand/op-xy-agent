import { describe, expect, it } from 'vitest';
import type { MidiEvent } from '$lib/core/midi/bus';
import type { StepKeyId } from '$lib/core/opxy';
import { ReplicaState, type ReplicaEvent } from '$lib/replica';
import { createFakeRig, type FakeRigOptions } from '../../../test/fakes/rig';
import { BridgeError, ReplicaBridge, type ReplicaBridgeOptions } from './bridge.svelte';
import type { BridgeHint } from './hints';

interface SetupOptions extends FakeRigOptions {
	/** Connect before the test body (default true). */
	readonly connect?: boolean;
	readonly bridge?: Partial<Omit<ReplicaBridgeOptions, 'replica' | 'stack' | 'clock' | 'timers'>>;
}

const hex = (bytes: ArrayLike<number>) =>
	Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

/** A connected fake OP-XY, a replica and a started bridge; `sent()` lists what went out since. */
async function setup(options: SetupOptions = {}) {
	const rig = createFakeRig(options);
	const replica = new ReplicaState({ timers: rig.time });
	const bridge = new ReplicaBridge({
		replica,
		stack: rig.stack,
		clock: rig.time,
		timers: rig.time,
		...options.bridge
	});
	const hints: BridgeHint[] = [];
	bridge.onHint((hint) => hints.push(hint));
	bridge.start();
	if (options.connect ?? true) await rig.connect();
	let mark = rig.opxy.output.sent.length;
	return {
		rig,
		replica,
		bridge,
		hints,
		/** Bytes sent to the device since setup (or the last `resetSent`), as hex. */
		sent: () => rig.opxy.output.sent.slice(mark).map((s) => hex(s.bytes)),
		resetSent: () => {
			mark = rig.opxy.output.sent.length;
		}
	};
}

/** Presses and releases a control like a click would. */
function tap(replica: ReplicaState, id: Parameters<ReplicaState['press']>[0]) {
	replica.press(id, 'pointer');
	replica.release(id, 'pointer');
}

describe('ReplicaBridge: replica → device', () => {
	it('plays keyboard keys as notes on channel 1, through the transport as the replica', async () => {
		const { rig, replica, hints, sent } = await setup();
		const out: MidiEvent[] = [];
		rig.stack.bus.subscribe((event) => {
			if (event.direction === 'out') out.push(event);
		});
		replica.press('keyboard.c4', 'pointer');
		replica.press('keyboard.e4', 'pointer');
		replica.press('keyboard.g4', 'keyboard');
		await rig.time.advance(5);
		expect(rig.opxy.activeNotes.size).toBe(3);
		replica.release('keyboard.c4', 'pointer');
		replica.release('keyboard.e4', 'pointer');
		replica.release('keyboard.g4', 'keyboard');
		expect(sent()).toEqual([
			'90 3C 64',
			'90 40 64',
			'90 43 64',
			'80 3C 00',
			'80 40 00',
			'80 43 00'
		]);
		expect(out.every((e) => e.source === 'replica')).toBe(true);
		expect(out[0].cause).toBe('replica:keyboard.c4');
		await rig.time.advance(5);
		expect(rig.opxy.activeNotes.size).toBe(0);
		expect(hints).toEqual([]);
	});

	it('uses the configured channel and velocity, and ends a note on the channel it began on', async () => {
		const { replica, bridge, sent } = await setup({ bridge: { channel: 2, velocity: 90 } });
		replica.press('keyboard.f3', 'pointer');
		bridge.channel = 5;
		replica.release('keyboard.f3', 'pointer');
		replica.press('keyboard.e5', 'pointer');
		expect(sent()).toEqual(['92 35 5A', '82 35 00', '95 4C 5A']);
		expect(bridge.channel).toBe(5);
		expect(bridge.heldNotes).toBe(1);
		expect(() => (bridge.channel = 16)).toThrow(BridgeError);
		expect(() => (bridge.velocity = 0)).toThrow(BridgeError);
		expect(() => (bridge.velocity = 12.5)).toThrow(/1–127/);
	});

	it('rejects settings out of range at construction', async () => {
		const { rig, replica } = await setup({ connect: false });
		const make = (extra: Partial<ReplicaBridgeOptions>) =>
			new ReplicaBridge({ replica, stack: rig.stack, clock: rig.time, timers: rig.time, ...extra });
		expect(() => make({ channel: -1 })).toThrow(BridgeError);
		expect(() => make({ velocity: 128 })).toThrow(BridgeError);
	});

	it('sends Start for play and Stop for stop', async () => {
		const { rig, replica, sent } = await setup();
		tap(replica, 'key.play');
		await rig.time.advance(5);
		expect(rig.opxy.playing).toBe(true);
		tap(replica, 'key.play');
		tap(replica, 'key.stop');
		await rig.time.advance(5);
		expect(rig.opxy.playing).toBe(false);
		expect(sent()).toEqual(['FA', 'FA', 'FC']);
	});

	it('selects tracks with CC102 (zero-based) and lights the track the app selected', async () => {
		const { rig, replica, sent } = await setup();
		tap(replica, 'track.3');
		expect(sent()).toEqual(['B0 66 02']);
		await rig.time.advance(5);
		expect(rig.opxy.selectedTrack).toBe(3);
		expect(replica.led('track.3')).toBe('white');
		tap(replica, 'track.8');
		await rig.time.flush();
		expect(replica.led('track.3')).toBe('off');
		expect(replica.led('track.8')).toBe('white');
		// The agent picks auxiliary track 11 (external MIDI): its key lights red, as on the device.
		rig.stack.transport.send(
			{ type: 'controlChange', channel: 0, controller: 102, value: 10 },
			{ source: 'agent' }
		);
		await rig.time.flush();
		expect(replica.led('track.8')).toBe('off');
		expect(replica.led('track.3')).toBe('red');
	});

	it('sends nothing for controls without a remote path, and says what they do on the device', async () => {
		const { rig, replica, hints, sent } = await setup();
		for (const id of ['key.m1', 'key.shift', 'step.5', 'key.record', 'key.mix'] as const) {
			tap(replica, id);
		}
		replica.turn('encoder.2', 3, { source: 'pointer' });
		tap(replica, 'encoder.4');
		replica.click('encoder.4', 'pointer');
		replica.setVolume(0.2, 'pointer');
		await rig.time.advance(5);
		expect(sent()).toEqual([]);
		expect(rig.opxy.remoteKeyMessages).toBe(0);
		expect(hints.map((h) => `${h.kind} ${h.control} ${h.action}`)).toEqual([
			'not-remote key.m1 press',
			'not-remote key.shift press',
			'not-remote step.5 press',
			'not-remote key.record press',
			'not-remote key.mix press',
			'not-remote encoder.2 turn',
			'not-remote encoder.4 click',
			'not-remote knob.volume turn'
		]);
		expect(hints[0]).toMatchObject({
			title: "The M1 key can't be pressed remotely on OS 1.1.33.",
			detail:
				'On the device it opens module 1 of the current mode (the engine, on an instrument track).',
			keys: 'M1',
			guide: 'https://teenage.engineering/guides/op-xy/layout#modules',
			firmware: '1.1.33'
		});
	});

	it('speaks about the firmware of the connected unit', async () => {
		const { replica, hints } = await setup({ opxy: { osVersion: '1.1.4' } });
		tap(replica, 'key.m2');
		expect(hints[0].firmware).toBe('1.1.4');
		expect(hints[0].text).toMatch(
			/isn't pressed from here: remote key presses are unverified on OS 1\.1\.4/
		);
	});

	it('does not send what would be a different gesture on the device', async () => {
		const { replica, hints, sent } = await setup();
		replica.press('key.shift', 'pointer');
		tap(replica, 'key.play');
		replica.release('key.shift', 'pointer');
		replica.press('step.5', 'pointer');
		tap(replica, 'keyboard.c4');
		replica.release('step.5', 'pointer');
		replica.press('track.1', 'pointer');
		tap(replica, 'track.3');
		replica.release('track.1', 'pointer');
		// A latched modifier counts as held.
		replica.toggleLatch('key.shift', 'pointer');
		tap(replica, 'key.stop');
		replica.toggleLatch('key.shift', 'pointer');
		expect(sent()).toEqual(['B0 66 00']);
		expect(hints.filter((h) => h.kind === 'combo').map((h) => h.keys)).toEqual([
			'shift + play',
			'step 5 + key C4',
			'T1 + T3',
			'shift + stop'
		]);
		expect(hints.find((h) => h.keys === 'T1 + T3')?.text).toBe(
			"Holding track 1 while pressing track 3 links tracks on the device, which can't be done remotely. Let go of it to select track 3."
		);
	});

	it('lets held notes combine with transport and more notes', async () => {
		const { replica, hints, sent } = await setup();
		replica.press('keyboard.c4', 'pointer');
		tap(replica, 'key.play');
		replica.press('keyboard.g4', 'pointer');
		expect(sent()).toEqual(['90 3C 64', 'FA', '90 43 64']);
		expect(hints).toEqual([]);
	});

	it('ignores holds by teaching animations when judging combos', async () => {
		const { rig, replica, sent } = await setup();
		replica.animate('hold shift');
		await rig.time.advance(1);
		expect(replica.isPressed('key.shift')).toBe(true);
		replica.press('keyboard.d4', 'pointer');
		expect(sent()).toEqual(['90 3E 64']);
	});

	it('bends the pitch on the note channel and re-centres it', async () => {
		const { replica, sent } = await setup();
		replica.setBend(0.5, 'pointer');
		replica.setBend(-1, 'pointer');
		replica.setBend(0, 'pointer');
		expect(sent()).toEqual(['E0 00 60', 'E0 00 00', 'E0 00 40']);
	});

	it('can leave the pitch bend out', async () => {
		const { replica, hints, sent } = await setup({ bridge: { pitchBend: false } });
		replica.setBend(0.4, 'pointer');
		replica.setBend(0, 'pointer');
		expect(sent()).toEqual([]);
		expect(hints.map((h) => `${h.kind} ${h.action}`)).toEqual(['not-remote bend']);
	});

	it('explains a message the transport refused', async () => {
		const { replica, hints, sent } = await setup({
			stack: { transport: { burst: 2, maxDelayMs: 0 } }
		});
		replica.press('keyboard.c4', 'pointer');
		replica.press('keyboard.d4', 'pointer');
		replica.press('keyboard.e4', 'pointer');
		expect(sent()).toEqual(['90 3C 64', '90 3E 64']);
		expect(hints.map((h) => h.kind)).toEqual(['send-failed']);
		expect(hints[0].title).toBe("The E4 key didn't reach the OP-XY.");
		expect(hints[0].detail).toMatch(/^Too many messages at once/);
		// Only notes that went out are released.
		replica.release('keyboard.e4', 'pointer');
		replica.release('keyboard.c4', 'pointer');
		expect(sent()).toEqual(['90 3C 64', '90 3E 64', '80 3C 00']);
	});

	it('is a local simulation while nothing is connected, without hints', async () => {
		const { rig, replica, bridge, hints } = await setup({ connect: false });
		expect(bridge.live).toBe(false);
		replica.press('keyboard.c4', 'pointer');
		expect(replica.isPressed('keyboard.c4')).toBe(true);
		replica.release('keyboard.c4', 'pointer');
		tap(replica, 'key.play');
		tap(replica, 'track.2');
		replica.setBend(0.5, 'pointer');
		tap(replica, 'key.m3');
		expect(rig.opxy.output.sent).toEqual([]);
		// the simulator's screen shows what the keys did: no hints without a device
		expect(hints).toEqual([]);
		await rig.time.flush();
		expect(replica.led('track.2')).toBe('off');
	});
});

describe('ReplicaBridge: releasing notes', () => {
	it('releases every held note and the bend on releaseAll (blur, hidden tab, pagehide)', async () => {
		const { rig, replica, bridge, sent, resetSent } = await setup();
		replica.press('keyboard.c4', 'pointer');
		replica.press('keyboard.e4', 'keyboard');
		replica.toggleLatch('keyboard.g4', 'pointer');
		replica.press('key.shift', 'pointer');
		replica.setBend(0.3, 'pointer');
		const heard: ReplicaEvent[] = [];
		replica.subscribe((event) => heard.push(event));
		resetSent();
		bridge.releaseAll();
		expect(sent()).toEqual(['80 3C 00', '80 40 00', '80 43 00', 'E0 00 40']);
		expect(replica.pressed).toEqual(['key.shift']);
		expect(replica.isLatched('keyboard.g4')).toBe(false);
		expect(replica.bend).toBe(0);
		expect(heard.map((e) => `${e.type} ${e.id} ${e.source}`)).toEqual([
			'release keyboard.c4 program',
			'release keyboard.e4 program',
			'release keyboard.g4 program',
			'bend strip.pitchbend program'
		]);
		expect(bridge.heldNotes).toBe(0);
		await rig.time.advance(5);
		expect(rig.opxy.activeNotes.size).toBe(0);
		bridge.releaseAll();
		expect(sent()).toHaveLength(4);
	});

	it('releases held notes before the port closes on disconnect', async () => {
		const { rig, replica, bridge, sent, resetSent } = await setup();
		replica.press('keyboard.a4', 'pointer');
		resetSent();
		await bridge.disconnect();
		expect(sent()).toEqual(['80 45 00']);
		expect(rig.stack.session.phase).toBe('idle');
		expect(bridge.live).toBe(false);
		await rig.time.advance(5);
		expect(rig.opxy.activeNotes.size).toBe(0);
		// The key the user still holds comes up later without sending anything.
		replica.release('keyboard.a4', 'pointer');
		expect(sent()).toEqual(['80 45 00']);
	});

	it('forgets what was sounding when the device vanishes, and plays again when it returns', async () => {
		const { rig, replica, bridge, hints, sent, resetSent } = await setup();
		tap(replica, 'track.2');
		replica.press('keyboard.c4', 'pointer');
		rig.opxy.emit([0x90, 64, 100]);
		await rig.time.advance(5);
		expect(replica.led('track.2')).toBe('white');
		expect(replica.led('keyboard.e4')).toBe('white');
		rig.opxy.unplug();
		await rig.time.advance(5);
		expect(rig.stack.session.phase).toBe('disconnected');
		expect(bridge.heldNotes).toBe(0);
		expect(replica.led('track.2')).toBe('off');
		expect(replica.led('keyboard.e4')).toBe('off');
		resetSent();
		replica.release('keyboard.c4', 'pointer');
		expect(sent()).toEqual([]);
		expect(hints).toEqual([]);
		rig.opxy.plugIn();
		await rig.time.advance(50);
		expect(rig.stack.session.phase).toBe('ready');
		resetSent();
		tap(replica, 'keyboard.c4');
		expect(sent()).toEqual(['90 3C 64', '80 3C 00']);
	});

	it('stop() releases notes, puts LEDs and keys back and stops listening', async () => {
		const { rig, replica, bridge, hints, sent, resetSent } = await setup();
		tap(replica, 'track.2');
		replica.press('keyboard.c4', 'pointer');
		rig.opxy.emit([0x90, 64, 100]);
		rig.stack.transport.send(
			{ type: 'noteOn', channel: 0, note: 62, velocity: 90 },
			{ source: 'agent' }
		);
		await rig.time.advance(5);
		expect(replica.isPressed('keyboard.d4')).toBe(true);
		resetSent();
		bridge.stop();
		expect(sent()).toEqual(['80 3C 00']);
		expect(replica.led('track.2')).toBe('off');
		expect(replica.led('keyboard.e4')).toBe('off');
		expect(replica.pressed).toEqual([]);
		tap(replica, 'keyboard.c4');
		tap(replica, 'key.m1');
		expect(sent()).toEqual(['80 3C 00']);
		expect(hints).toEqual([]);
		bridge.stop();
		// Starting again picks the mirror's selection back up.
		bridge.start();
		await rig.time.flush();
		expect(replica.led('track.2')).toBe('white');
	});
});

describe('ReplicaBridge: device → replica', () => {
	it('lights keyboard keys while the device sounds their notes, on any channel', async () => {
		const { rig, replica } = await setup();
		rig.opxy.emit([0x92, 64, 90]);
		await rig.time.advance(5);
		expect(replica.led('keyboard.e4')).toBe('white');
		expect(replica.isPressed('keyboard.e4')).toBe(false);
		rig.opxy.emit([0x92, 64, 0]);
		await rig.time.advance(5);
		expect(replica.led('keyboard.e4')).toBe('off');
		rig.opxy.emit([0x90, 60, 90]);
		rig.opxy.emit([0x91, 60, 90]);
		rig.opxy.emit([0x80, 60, 0]);
		await rig.time.advance(5);
		expect(replica.led('keyboard.c4')).toBe('white');
		rig.opxy.emit([0x81, 60, 0]);
		await rig.time.advance(5);
		expect(replica.led('keyboard.c4')).toBe('off');
		// All Notes Off clears the channel, notes below the keyboard included.
		rig.opxy.emit([0x93, 74, 90]);
		rig.opxy.emit([0x93, 30, 90]);
		await rig.time.advance(5);
		expect(replica.led('keyboard.d5')).toBe('white');
		expect(replica.led('keyboard.fs3')).toBe('white');
		rig.opxy.emit([0xb3, 123, 0]);
		await rig.time.advance(5);
		expect(replica.led('keyboard.d5')).toBe('off');
		expect(replica.led('keyboard.fs3')).toBe('off');
	});

	it('shows notes outside its two octaves on the key of the same name', async () => {
		const { rig, replica } = await setup();
		// F2 and F3 share the low F key; it stays lit until both have ended.
		rig.opxy.emit([0x90, 41, 90]);
		rig.opxy.emit([0x90, 53, 90]);
		await rig.time.advance(5);
		expect(replica.led('keyboard.f3')).toBe('white');
		rig.opxy.emit([0x80, 41, 0]);
		await rig.time.advance(5);
		expect(replica.led('keyboard.f3')).toBe('white');
		rig.opxy.emit([0x80, 53, 0]);
		await rig.time.advance(5);
		expect(replica.led('keyboard.f3')).toBe('off');
		// F5 (77) and C7 (96) fold down onto F4 and C5.
		rig.opxy.emit([0x90, 77, 90]);
		rig.opxy.emit([0x90, 96, 90]);
		await rig.time.advance(5);
		expect(replica.led('keyboard.f4')).toBe('white');
		expect(replica.led('keyboard.c5')).toBe('white');
	});

	it("shows other senders' notes outside its two octaves as pressed keys", async () => {
		const { rig, replica } = await setup();
		const send = (type: 'noteOn' | 'noteOff', note: number) =>
			rig.stack.transport.send(
				{ type, channel: 1, note, velocity: type === 'noteOn' ? 80 : 0 },
				{ source: 'agent' }
			);
		send('noteOn', 36);
		send('noteOn', 48);
		expect(replica.isPressed('keyboard.c4')).toBe(true);
		send('noteOff', 36);
		expect(replica.isPressed('keyboard.c4')).toBe(true);
		send('noteOff', 48);
		expect(replica.isPressed('keyboard.c4')).toBe(false);
	});

	it("moves the pad with the device's pitch bend, once a frame, ending on the latest value", async () => {
		const { rig, replica, sent } = await setup();
		const heard: ReplicaEvent[] = [];
		replica.subscribe((event) => heard.push(event));
		rig.opxy.emit([0xe0, 0x7f, 0x7f]);
		await rig.time.advance(5);
		expect(replica.bend).toBe(1);
		// A burst within one frame shows only its last value, a frame later.
		rig.opxy.emit([0xe0, 0x00, 0x60]);
		rig.opxy.emit([0xe0, 0x00, 0x20]);
		await rig.time.advance(2);
		expect(replica.bend).toBe(1);
		await rig.time.advance(20);
		expect(replica.bend).toBeCloseTo(-0.5, 3);
		rig.opxy.emit([0xe0, 0x00, 0x40]);
		await rig.time.advance(40);
		expect(replica.bend).toBe(0);
		// Mirroring is not playing: nothing went back to the device, no replica events.
		expect(heard).toEqual([]);
		expect(sent()).toEqual([]);
	});

	it('leaves the pad to the pointer while the replica bends, and centres it when the device goes', async () => {
		const { rig, replica, sent } = await setup();
		replica.setBend(0.5, 'pointer');
		rig.opxy.emit([0xe1, 0x00, 0x00]);
		await rig.time.advance(40);
		expect(replica.bend).toBe(0.5);
		replica.setBend(0, 'pointer');
		expect(sent()).toEqual(['E0 00 60', 'E0 00 40']);
		rig.opxy.emit([0xe1, 0x00, 0x00]);
		await rig.time.advance(40);
		expect(replica.bend).toBe(-1);
		rig.opxy.unplug();
		await rig.time.advance(40);
		expect(replica.bend).toBe(0);
	});

	it('does not light keys for echoes of its own notes', async () => {
		const { rig, replica } = await setup({ opxy: { echoAll: true } });
		replica.press('keyboard.c4', 'pointer');
		rig.stack.transport.send(
			{ type: 'noteOn', channel: 1, note: 67, velocity: 90 },
			{ source: 'agent' }
		);
		await rig.time.advance(5);
		expect(rig.opxy.received.filter((b) => b[0] === 0x90 || b[0] === 0x91)).toHaveLength(2);
		expect(replica.led('keyboard.c4')).toBe('off');
		expect(replica.led('keyboard.g4')).toBe('off');
		expect(replica.isPressed('keyboard.c4')).toBe(true);
		expect(replica.isPressed('keyboard.g4')).toBe(true);
	});

	it('shows notes other senders play as pressed keys, without replica events', async () => {
		const { rig, replica, sent } = await setup();
		const heard: ReplicaEvent[] = [];
		replica.subscribe((event) => heard.push(event));
		const send = (type: 'noteOn' | 'noteOff', note: number, channel = 3) =>
			rig.stack.transport.send(
				{ type, channel, note, velocity: type === 'noteOn' ? 80 : 0 },
				{ source: 'agent' }
			);
		send('noteOn', 64);
		send('noteOn', 38);
		expect(replica.isPressed('keyboard.e4')).toBe(true);
		expect(replica.isPressed('keyboard.d4')).toBe(true);
		send('noteOff', 64);
		expect(replica.isPressed('keyboard.e4')).toBe(false);
		send('noteOn', 60, 0);
		send('noteOn', 62, 0);
		rig.stack.transport.panic({ source: 'user' });
		expect(replica.pressed).toEqual([]);
		expect(heard).toEqual([]);
		expect(sent().filter((b) => b.startsWith('9'))).toHaveLength(4);
	});

	it('leaves a key the user holds alone when another sender plays and ends its note', async () => {
		const { rig, replica, sent } = await setup();
		replica.press('keyboard.c4', 'pointer');
		rig.stack.transport.send(
			{ type: 'noteOn', channel: 2, note: 60, velocity: 80 },
			{ source: 'agent' }
		);
		rig.stack.transport.send(
			{ type: 'noteOff', channel: 2, note: 60, velocity: 0 },
			{ source: 'agent' }
		);
		expect(replica.isPressed('keyboard.c4')).toBe(true);
		replica.release('keyboard.c4', 'pointer');
		expect(sent()).toEqual(['90 3C 64', '92 3C 50', '82 3C 00', '80 3C 00']);
	});
});

describe('ReplicaBridge: playhead', () => {
	const steps = (replica: ReplicaState) =>
		Array.from({ length: 16 }, (_, i) => `step.${i + 1}` as StepKeyId).filter(
			(id) => replica.led(id) !== 'off'
		);

	it('runs over the step LEDs while the device plays to its clock, one step per sixteenth', async () => {
		const { rig, replica } = await setup({ opxy: { clockMode: 'both' } });
		await rig.time.advance(200);
		expect(steps(replica)).toEqual([]);
		rig.opxy.pressPlay();
		await rig.time.advance(2);
		expect(steps(replica)).toEqual(['step.1']);
		// 120 BPM: a tick is 20.8 ms, a step 125 ms; the first tick after Start is the downbeat.
		await rig.time.advance(23 + 125);
		expect(steps(replica)).toEqual(['step.2']);
		await rig.time.advance(125 * 14);
		expect(steps(replica)).toEqual(['step.16']);
		await rig.time.advance(125);
		expect(steps(replica)).toEqual(['step.1']);
		rig.opxy.pressStop();
		await rig.time.advance(2);
		expect(steps(replica)).toEqual([]);
	});

	it('starts from the replica too, once the device relays the Start', async () => {
		const { rig, replica } = await setup({ opxy: { clockMode: 'both' } });
		await rig.time.advance(200);
		tap(replica, 'key.play');
		expect(steps(replica)).toEqual([]);
		await rig.time.advance(2);
		expect(steps(replica)).toEqual(['step.1']);
		tap(replica, 'key.stop');
		expect(steps(replica)).toEqual([]);
	});

	it('does nothing without the device clock (COM → clock "in")', async () => {
		const { rig, replica } = await setup();
		tap(replica, 'key.play');
		await rig.time.advance(500);
		expect(rig.opxy.playing).toBe(true);
		expect(steps(replica)).toEqual([]);
	});

	it('stops when the clock stops, and puts LEDs back as it found them', async () => {
		const { rig, replica } = await setup({ opxy: { clockMode: 'both' } });
		replica.setLed('step.2', 'red');
		await rig.time.advance(200);
		rig.opxy.pressPlay();
		await rig.time.advance(2 + 23 + 125);
		expect(replica.led('step.2')).toBe('white');
		await rig.time.advance(125);
		expect(replica.led('step.2')).toBe('red');
		expect(replica.led('step.3')).toBe('white');
		rig.opxy.setClockMode('in');
		await rig.time.advance(1100);
		expect(steps(replica)).toEqual(['step.2']);
		expect(replica.led('step.2')).toBe('red');
	});

	it('can be turned off', async () => {
		const { rig, replica } = await setup({
			opxy: { clockMode: 'both' },
			bridge: { playhead: false }
		});
		await rig.time.advance(200);
		rig.opxy.pressPlay();
		await rig.time.advance(300);
		expect(steps(replica)).toEqual([]);
	});
});
