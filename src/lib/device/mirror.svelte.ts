/**
 * A live mirror of the OP-XY's state, built only from what actually crosses the wire, and honest
 * about where each value comes from (docs/DESIGN.md: "honest instruments").
 *
 * What the device tells us (verified on OS 1.1.33, docs/research/90-device-probe.md):
 * - With COM → clock "both" it sends FA on every play press, FC on stop, and F8 continuously, even
 *   while stopped. With the stock "clock in" it sends none of these.
 * - It re-transmits FA/FC it receives, and answers CC104/CC105 (value 127) with FA/FC.
 * - It sends notes only from tracks the project gives a MIDI channel (none in a fresh project).
 * - It never reports encoder moves, track selection or mutes.
 *
 * So: play state follows FA/FC in both directions and says who reported it (`playSource`); tempo is
 * measured from F8; `clockOut` says whether F8 arrived in the last second; `noteChannels` lists the
 * channels the device has sent notes on. Selected track, mutes,
 * tempo and every CC value we sent are a **sent-state cache**: what the app last set, labelled as
 * such, because the device may have been changed by hand since.
 */
import type { MidiBus, MidiEvent } from '$lib/core/midi/bus';
import { ccToTempo } from '$lib/core/opxy';
import { ClockFollower } from './clock-follower';
import { OPXY_DESCRIBE_PROFILE } from './describe';
import type { Clock, Timers } from './types';

/** Whether the sequencer runs. */
export type PlayState = 'playing' | 'stopped' | 'unknown';

/**
 * Where the play state came from: the device sent FA/FC by itself (`device`), it re-sent ours
 * (`echo`), or it is only what the app sent (`app`, unconfirmed).
 */
export type PlaySource = 'device' | 'echo' | 'app';

/** The last value the app sent for one controller on one channel. */
export interface SentCc {
	/** Wire channel 0–15. */
	readonly channel: number;
	readonly controller: number;
	readonly value: number;
	/** When it went out (`performance.now()` domain). */
	readonly time: number;
	/** OP-XY name (`tempo`, `T1 mute`), when the CC map knows it. */
	readonly name: string | null;
}

/** Constructor options. */
export interface DeviceMirrorOptions {
	readonly bus: MidiBus;
	readonly clock: Clock;
	readonly timers: Timers;
	/** Tells echoes of our own sends apart (the transport's `isEcho`). */
	readonly isEcho?: (event: MidiEvent) => boolean;
	/** Clock counts as present while an F8 arrived within this many ms (default 1000). */
	readonly clockStaleMs?: number;
	/** F8 intervals in the tempo estimate (default 48, two beats). */
	readonly clockWindow?: number;
}

/** The track-select controller (CC102, channel 1, zero-based value). */
const CC_TRACK_SELECT = 102;
/** The tempo controller (CC80, BPM = 2 × value). */
const CC_TEMPO = 80;
/** Track mute (CC9 on the track's channel; 0 = unmuted, 1–127 = muted). */
const CC_MUTE = 9;
/** Play / stop controllers (value 127). */
const CC_PLAY = 104;
const CC_STOP = 105;

/** Reactive device-state mirror. Call `start()` to follow the bus. */
export class DeviceMirror {
	/** Whether the sequencer runs, as far as the wire tells. */
	playState: PlayState = $state('unknown');
	/** Who reported `playState`; null until something did. */
	playSource: PlaySource | null = $state(null);
	/** True while F8 clock arrives from the device (COM → clock "out" or "both"). */
	clockOut = $state(false);
	/** Tempo measured from the device's clock, rounded to 0.1 BPM; null without clock. */
	measuredBpm: number | null = $state(null);
	/** Wire channels (0–15) the device has sent notes on since it connected, in order. */
	noteChannels: readonly number[] = $state.raw([]);
	/** Sent-state: the tempo the app last set with CC80, in BPM. */
	tempoSent: number | null = $state(null);
	/** Sent-state: the track (1–16) the app last selected with CC102. */
	selectedTrack: number | null = $state(null);
	/** Sent-state: mute per track (index 0 = track 1) as the app last set it with CC9; null = never. */
	mutes: (boolean | null)[] = $state(Array.from({ length: 16 }, () => null));
	/** Sent-state: the last value of every CC the app sent, keyed `channel:controller`. */
	sentCcs: Readonly<Record<string, SentCc>> = $state.raw({});

	readonly #bus: MidiBus;
	readonly #clock: Clock;
	readonly #timers: Timers;
	readonly #isEcho: (event: MidiEvent) => boolean;
	readonly #staleMs: number;
	readonly #follower: ClockFollower;
	#lastClockAt = Number.NEGATIVE_INFINITY;
	#staleTimer: unknown = null;
	#unsubscribe: (() => void) | null = null;

	constructor(options: DeviceMirrorOptions) {
		this.#bus = options.bus;
		this.#clock = options.clock;
		this.#timers = options.timers;
		this.#isEcho = options.isEcho ?? (() => false);
		this.#staleMs = options.clockStaleMs ?? 1000;
		this.#follower = new ClockFollower({ window: options.clockWindow ?? 48 });
	}

	/** Starts following the bus. Idempotent; returns the stop function. */
	start(): () => void {
		this.#unsubscribe ??= this.#bus.subscribe((event) => this.#onEvent(event));
		return () => this.stop();
	}

	/** Stops following the bus (state is kept). */
	stop(): void {
		this.#unsubscribe?.();
		this.#unsubscribe = null;
		this.#clearStaleTimer();
	}

	/** Forgets everything: the device went away or was replaced. */
	reset(): void {
		this.playState = 'unknown';
		this.playSource = null;
		this.clockOut = false;
		this.measuredBpm = null;
		this.noteChannels = [];
		this.tempoSent = null;
		this.selectedTrack = null;
		this.mutes = Array.from({ length: 16 }, () => null);
		this.sentCcs = {};
		this.#follower.reset();
		this.#lastClockAt = Number.NEGATIVE_INFINITY;
		this.#clearStaleTimer();
	}

	#onEvent(event: MidiEvent): void {
		if (event.direction === 'in') this.#incoming(event);
		else this.#outgoing(event);
	}

	#incoming(event: MidiEvent): void {
		const { message } = event;
		switch (message.type) {
			case 'clock':
				this.#onClock(event.time);
				return;
			case 'start':
			case 'continue':
				this.#setPlay('playing', this.#isEcho(event) ? 'echo' : 'device');
				return;
			case 'stop':
				this.#setPlay('stopped', this.#isEcho(event) ? 'echo' : 'device');
				return;
			case 'noteOn':
				if (!this.#isEcho(event)) this.#heardNote(message.channel);
				return;
		}
	}

	#heardNote(channel: number): void {
		if (this.noteChannels.includes(channel)) return;
		this.noteChannels = [...this.noteChannels, channel].sort((a, b) => a - b);
	}

	#outgoing(event: MidiEvent): void {
		const { message } = event;
		switch (message.type) {
			case 'start':
			case 'continue':
				this.#setPlay('playing', 'app');
				return;
			case 'stop':
				this.#setPlay('stopped', 'app');
				return;
			case 'controlChange':
				break;
			default:
				return;
		}
		const { channel, controller, value } = message;
		this.sentCcs = {
			...this.sentCcs,
			[`${channel}:${controller}`]: {
				channel,
				controller,
				value,
				time: event.time,
				name: OPXY_DESCRIBE_PROFILE.ccName?.(controller, channel) ?? null
			}
		};
		if (controller === CC_TEMPO) {
			this.tempoSent = ccToTempo(value);
		} else if (controller === CC_TRACK_SELECT && channel === 0 && value <= 15) {
			this.selectedTrack = value + 1;
		} else if (controller === CC_MUTE) {
			this.mutes[channel] = value >= 1;
		} else if (controller === CC_PLAY && value === 127) {
			this.#setPlay('playing', 'app');
		} else if (controller === CC_STOP && value === 127) {
			this.#setPlay('stopped', 'app');
		}
	}

	#setPlay(state: PlayState, source: PlaySource): void {
		this.playState = state;
		this.playSource = source;
	}

	#onClock(time: number): void {
		this.#follower.tick(time);
		this.#lastClockAt = time;
		if (!this.clockOut) this.clockOut = true;
		const bpm = this.#follower.bpm;
		const rounded = bpm === null ? null : Math.round(bpm * 10) / 10;
		if (rounded !== this.measuredBpm) this.measuredBpm = rounded;
		if (this.#staleTimer === null) {
			this.#staleTimer = this.#timers.setTimeout(this.#checkStale, this.#staleMs);
		}
	}

	#checkStale = (): void => {
		this.#staleTimer = null;
		const idle = this.#clock.now() - this.#lastClockAt;
		if (idle >= this.#staleMs) {
			this.clockOut = false;
			this.measuredBpm = null;
			this.#follower.reset();
		} else {
			this.#staleTimer = this.#timers.setTimeout(this.#checkStale, this.#staleMs - idle);
		}
	};

	#clearStaleTimer(): void {
		if (this.#staleTimer !== null) this.#timers.clearTimeout(this.#staleTimer);
		this.#staleTimer = null;
	}
}
