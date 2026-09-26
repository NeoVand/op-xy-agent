/**
 * An emulated OP-XY behind a fake Web MIDI port pair, behaving like the owner's unit on OS 1.1.33
 * as logged in docs/research/90-device-probe.md:
 *
 * - Ports named `OP-XY` (one input, one output).
 * - Universal identity request → `F0 7E 21 06 02 00 20 76 21 00 01 00 00 00 00 00 F7`, followed by
 *   the request itself sent back (the unit forwards foreign SysEx even with echo off).
 * - TE protocol (device id 0x21): GREET → metadata with a FAKE serial (`TESTSERIAL`); ECHO → the
 *   same bytes; FILE INIT → `0C 00 02 00 00`; FILE LIST → `drum/` (1) and `synth/` (2), both
 *   empty; FILE INFO / METADATA → status 3; SETTINGS → status 2; unknown commands → status 2.
 *   TE requests are never echoed. DFU is never answered (and is counted: tests assert zero).
 * - Transport: FA/FC and CC104/CC105 (value 127) start and stop it. With COM clock "both" it sends
 *   FA/FC for every start/stop (relaying ours too) and F8 continuously at the current tempo, even
 *   while stopped; with the stock "in" it sends no transport or clock at all.
 * - CC80 sets BPM = 2 × value (clamped 40–220); CC9 mutes a track (0 = unmuted, 1–127 = muted);
 *   CC102 on channel 1 selects a track (zero-based); CC106/107 do nothing (counted).
 * - Hot-plug: `unplug()` / `enterMtp()` make the ports disappear, `plugIn()` / `leaveMtp()` bring
 *   them back.
 */
import { buildResponseFrame, parseFrame, TE_CMD, TE_FILE, type TeFileEntry } from '$lib/core/te';
import type { Clock, Timers } from '$lib/device/types';
import { FakeMidiInput, FakeMidiOutput, type FakeMidiHost } from './fake-midi';

/** The OP-XY's SysEx device id. */
const DEVICE_ID = 0x21;

/** The identity reply the owner's unit sent. */
export const FAKE_OPXY_IDENTITY_REPLY: readonly number[] = [
	0xf0, 0x7e, 0x21, 0x06, 0x02, 0x00, 0x20, 0x76, 0x21, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
	0xf7
];

/** The fake serial numbers GREET reports. Nothing may ever display them. */
export const FAKE_SERIAL = 'TESTSERIAL';
export const FAKE_DSP_SERIAL = 'TESTDSPSERIAL';

/** FILE LIST entries per page. */
const LIST_PAGE_SIZE = 8;

/** The root directory of a unit without user content. */
export const DEFAULT_FILES: Readonly<Record<number, readonly TeFileEntry[]>> = {
	0: [
		{ id: 1, flags: 0x0e, size: 0, name: 'drum' },
		{ id: 2, flags: 0x0e, size: 0, name: 'synth' }
	],
	1: [],
	2: []
};

/** Options for `FakeOpxy`. */
export interface FakeOpxyOptions {
	readonly host: FakeMidiHost;
	readonly clock: Clock;
	readonly timers: Timers;
	/** Port name (default `OP-XY`). */
	readonly name?: string;
	/** Port id prefix (default `opxy`); ports are `<prefix>-in` and `<prefix>-out`. */
	readonly idPrefix?: string;
	/** GREET `os_version` (default `1.1.33`). */
	readonly osVersion?: string;
	/** GREET `mode` (default `normal`). */
	readonly mode?: 'normal' | 'bootloader' | 'test';
	/** COM → clock (default `in`, the stock setting). */
	readonly clockMode?: 'in' | 'both';
	/** Reply latency in ms (default 1). */
	readonly latencyMs?: number;
	/** Answer TE protocol requests (default true). */
	readonly respondToTe?: boolean;
	/** Answer the universal identity request (default true). */
	readonly respondToIdentity?: boolean;
	/** Send the identity request back after answering it (default true, as observed). */
	readonly echoUniversalSysex?: boolean;
	/** COM → midi echo on: send every non-SysEx message back (default false, as found). */
	readonly echoAll?: boolean;
	/** FILE tree by directory node id (default: `drum/`, `synth/`, both empty). */
	readonly files?: Readonly<Record<number, readonly TeFileEntry[]>>;
}

/** An emulated OP-XY. */
export class FakeOpxy {
	/** The port the host reads from (device → host). */
	readonly input: FakeMidiInput;
	/** The port the host writes to (host → device). */
	readonly output: FakeMidiOutput;
	readonly host: FakeMidiHost;

	playing = false;
	bpm = 120;
	/** Selected track, 1–16. */
	selectedTrack = 1;
	/** Mute per track (index 0 = track 1). */
	readonly mutes: boolean[] = Array.from({ length: 16 }, () => false);
	clockMode: 'in' | 'both';
	mode: 'normal' | 'bootloader' | 'test';
	osVersion: string;
	respondToTe: boolean;
	respondToIdentity: boolean;
	echoUniversalSysex: boolean;
	echoAll: boolean;
	latencyMs: number;
	files: Readonly<Record<number, readonly TeFileEntry[]>>;

	/** Everything the device received, in order. */
	readonly received: Uint8Array[] = [];
	/** CC86 values received (project loads). */
	readonly projectLoads: number[] = [];
	/** CC106/107 received (no effect on 1.1.33). */
	remoteKeyMessages = 0;
	/** TE DFU frames received. Must stay 0. */
	dfuFrames = 0;
	/** TE FILE writes received. Must stay 0 in M1. */
	fileWrites = 0;
	/** All Notes Off / All Sound Off received. */
	allNotesOff = 0;
	allSoundOff = 0;
	/** Sounding notes (`channel * 128 + note`). */
	readonly activeNotes = new Set<number>();
	/** Whether a FILE session is open. */
	fileSessionOpen = false;

	readonly #clock: Clock;
	readonly #timers: Timers;
	#plugged = false;
	#clockTimer: unknown = null;
	readonly #pending = new Set<unknown>();

	constructor(options: FakeOpxyOptions) {
		this.host = options.host;
		this.#clock = options.clock;
		this.#timers = options.timers;
		const name = options.name ?? 'OP-XY';
		const prefix = options.idPrefix ?? 'opxy';
		this.input = new FakeMidiInput({ id: `${prefix}-in`, name });
		this.output = new FakeMidiOutput({ id: `${prefix}-out`, name });
		this.output.onDeliver = (bytes) => this.#receive(bytes);
		this.clockMode = options.clockMode ?? 'in';
		this.mode = options.mode ?? 'normal';
		this.osVersion = options.osVersion ?? '1.1.33';
		this.respondToTe = options.respondToTe ?? true;
		this.respondToIdentity = options.respondToIdentity ?? true;
		this.echoUniversalSysex = options.echoUniversalSysex ?? true;
		this.echoAll = options.echoAll ?? false;
		this.latencyMs = options.latencyMs ?? 1;
		this.files = options.files ?? DEFAULT_FILES;
	}

	/** Whether the ports are present. */
	get plugged(): boolean {
		return this.#plugged;
	}

	/** Plugs the device in: the ports appear (again). */
	plugIn(): void {
		this.#plugged = true;
		this.host.plug(this.input, this.output);
		this.#syncClock();
	}

	/** Unplugs the device: the ports disappear and pending replies are lost. */
	unplug(): void {
		this.#plugged = false;
		this.fileSessionOpen = false;
		for (const handle of this.#pending) this.#timers.clearTimeout(handle);
		this.#pending.clear();
		this.#syncClock();
		this.host.unplug(this.input, this.output);
	}

	/** COM → M4: MTP mode re-enumerates the USB device without MIDI, so the ports vanish. */
	enterMtp(): void {
		this.unplug();
	}

	/** Closing the MTP session returns the device to MIDI mode. */
	leaveMtp(): void {
		this.plugIn();
	}

	/** Changes COM → clock. */
	setClockMode(mode: 'in' | 'both'): void {
		this.clockMode = mode;
		this.#syncClock();
	}

	/** The play key on the device. */
	pressPlay(): void {
		this.#start();
	}

	/** The stop key on the device. */
	pressStop(): void {
		this.#stop();
	}

	/** GREET metadata as the device would send it (FAKE serials). */
	greetText(): string {
		return [
			'product:OP-XY',
			`mode:${this.mode}`,
			`serial:${FAKE_SERIAL}`,
			`dsp_serial:${FAKE_DSP_SERIAL}`,
			`os_version:${this.osVersion}`,
			`sw_version:${this.osVersion}`,
			'hw_rev:2',
			'sku:TE033AS001'
		].join(';');
	}

	/** Sends a message to the host after `delay` ms (default: the reply latency). */
	emit(bytes: ArrayLike<number>, delay = this.latencyMs): void {
		const copy = Uint8Array.from(bytes);
		const handle = this.#timers.setTimeout(() => {
			this.#pending.delete(handle);
			if (this.#plugged) this.input.deliver(copy, this.#clock.now());
		}, delay);
		this.#pending.add(handle);
	}

	#receive(bytes: Uint8Array): void {
		if (!this.#plugged) return;
		this.received.push(bytes);
		const status = bytes[0];
		if (status === 0xf0) {
			this.#receiveSysex(bytes);
			return;
		}
		if (this.echoAll) this.emit(bytes);
		if (status === 0xfa || status === 0xfb) {
			this.#start();
			return;
		}
		if (status === 0xfc) {
			this.#stop();
			return;
		}
		const kind = status & 0xf0;
		const channel = status & 0x0f;
		if (kind === 0x90 && bytes[2] > 0) this.activeNotes.add(channel * 128 + bytes[1]);
		else if (kind === 0x80 || kind === 0x90) this.activeNotes.delete(channel * 128 + bytes[1]);
		else if (kind === 0xb0) this.#controlChange(channel, bytes[1], bytes[2]);
	}

	#controlChange(channel: number, controller: number, value: number): void {
		switch (controller) {
			case 80:
				this.bpm = Math.min(220, Math.max(40, value * 2));
				return;
			case 9:
				this.mutes[channel] = value >= 1;
				return;
			case 102:
				if (channel === 0 && value <= 15) this.selectedTrack = value + 1;
				return;
			case 104:
				if (value === 127) this.#start();
				return;
			case 105:
				if (value === 127) this.#stop();
				return;
			case 106:
			case 107:
				this.remoteKeyMessages++;
				return;
			case 86:
				this.projectLoads.push(value);
				return;
			case 123:
				this.allNotesOff++;
				for (const key of [...this.activeNotes])
					if (key >> 7 === channel) this.activeNotes.delete(key);
				return;
			case 120:
				this.allSoundOff++;
				return;
		}
	}

	#start(): void {
		this.playing = true;
		if (this.clockMode === 'both') this.emit([0xfa]);
	}

	#stop(): void {
		this.playing = false;
		if (this.clockMode === 'both') this.emit([0xfc]);
	}

	#receiveSysex(bytes: Uint8Array): void {
		const isIdentityRequest =
			bytes.length === 6 && bytes[1] === 0x7e && bytes[3] === 0x06 && bytes[4] === 0x01;
		if (isIdentityRequest) {
			if (this.respondToIdentity) this.emit(FAKE_OPXY_IDENTITY_REPLY);
			if (this.echoUniversalSysex) this.emit(bytes, this.latencyMs + 1);
			return;
		}
		const frame = parseFrame(bytes);
		if (frame.kind !== 'request' || frame.requestId === null || frame.deviceId !== DEVICE_ID)
			return;
		if (frame.cmd === TE_CMD.DFU) {
			this.dfuFrames++;
			return;
		}
		if (!this.respondToTe) return;
		const reply = (status: number, data: ArrayLike<number> = []) =>
			this.emit(
				buildResponseFrame({
					deviceId: DEVICE_ID,
					requestId: frame.requestId as number,
					cmd: frame.cmd,
					status,
					data
				})
			);
		switch (frame.cmd) {
			case TE_CMD.GREET:
				reply(0, ascii(this.greetText()));
				return;
			case TE_CMD.ECHO:
				reply(0, frame.payload);
				return;
			case TE_CMD.FILE:
				this.#file(frame.payload, reply);
				return;
			default:
				// SETTINGS and anything else: "command not found", as observed.
				reply(2);
		}
	}

	#file(payload: Uint8Array, reply: (status: number, data?: ArrayLike<number>) => void): void {
		switch (payload[0]) {
			case TE_FILE.INIT:
				this.fileSessionOpen = true;
				reply(0, [0x0c, 0x00, 0x02, 0x00, 0x00]);
				return;
			case TE_FILE.LIST: {
				const page = (payload[1] << 8) | payload[2];
				const node = (payload[3] << 8) | payload[4];
				const entries = this.files[node];
				if (entries === undefined) {
					reply(3);
					return;
				}
				const slice = entries.slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE);
				reply(0, [page >> 8, page & 0xff, ...slice.flatMap(encodeEntry)]);
				return;
			}
			case TE_FILE.PUT:
			case TE_FILE.DELETE:
			case TE_FILE.MOVE:
				this.fileWrites++;
				reply(3);
				return;
			default:
				// INFO, METADATA and GET in the EP-133 layout: "bad request" on 1.1.33.
				reply(3);
		}
	}

	#syncClock(): void {
		const shouldRun = this.#plugged && this.clockMode === 'both';
		if (shouldRun && this.#clockTimer === null) this.#scheduleTick();
		if (!shouldRun && this.#clockTimer !== null) {
			this.#timers.clearTimeout(this.#clockTimer);
			this.#clockTimer = null;
		}
	}

	#scheduleTick(): void {
		this.#clockTimer = this.#timers.setTimeout(
			() => {
				this.#clockTimer = null;
				if (!this.#plugged || this.clockMode !== 'both') return;
				this.input.deliver([0xf8], this.#clock.now());
				this.#scheduleTick();
			},
			60_000 / (this.bpm * 24)
		);
	}
}

function ascii(text: string): number[] {
	return Array.from(text, (char) => char.charCodeAt(0));
}

function encodeEntry(entry: TeFileEntry): number[] {
	return [
		entry.id >> 8,
		entry.id & 0xff,
		entry.flags,
		(entry.size >>> 24) & 0xff,
		(entry.size >>> 16) & 0xff,
		(entry.size >>> 8) & 0xff,
		entry.size & 0xff,
		...ascii(entry.name),
		0
	];
}
