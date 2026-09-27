/**
 * The bridge between the app-wide replica and a connected OP-XY, both ways, and honest about it.
 *
 * **Replica → device** (only while a session is ready; every byte goes through the transport with
 * source `replica`, see `mapping.ts` for the table): keyboard keys play notes on the active-track
 * channel (channel 1 by default: the stock COM setting routes it to the selected track), play and
 * stop send Start and Stop, track keys select tracks with CC102, the pitch-bend pad bends. Every
 * other control has no remote path on OS 1.1.33 (remote keys do nothing there), so it sends nothing
 * and the bridge emits a hint saying so and what the control does on the device. A remote control
 * pressed while another key is held (shift + play, step + a note, track + track) would be a
 * different gesture on the device, so it is not sent either. Without a connection the replica is a
 * local simulation: keys move, nothing is sent.
 *
 * **Device → replica** (mirroring what crosses the wire, never guessing):
 * - notes the device sends light their keyboard keys while they sound (echoes of ours don't);
 * - notes the app sends from elsewhere (the agent, the lab) show their keys pressed;
 * - the track the app last selected (the mirror's sent-state) lights its track key, white for an
 *   instrument track and red for an auxiliary one, as the device does;
 * - while the device plays, confirmed by its own Start with its clock arriving (COM → clock
 *   "both"), a playhead runs over the step LEDs: one step per sixteenth, counted from the Start.
 *   The play key has no LED on the OP-XY, so the steps carry the beat.
 *
 * Notes are released on key-up, on pointer cancel (the replica turns it into a release), by
 * `releaseAll()` (the page calls it on blur, when the tab hides and on pagehide), by `disconnect()`
 * and by `stop()`. When the device vanishes, what was sounding is forgotten: nothing can be sent.
 *
 * Nothing here reads mirror state inside a bus listener: the mirror may hear an event after the
 * bridge does, so mirror-derived LEDs are refreshed one microtask later.
 */
import type { MidiEvent } from '$lib/core/midi/bus';
import { unitToBend, type MidiMessage } from '$lib/core/midi/messages';
import {
	getControl,
	keyboardKeyForNote,
	type ControlId,
	type KeyboardKeyId,
	type StepKeyId,
	type TrackKeyId
} from '$lib/core/opxy';
import {
	DeviceError,
	type Clock,
	type DeviceStack,
	type PairChange,
	type Timers
} from '$lib/device';
import type { KeyLedState, PressableId, ReplicaEvent, ReplicaState } from '$lib/replica';
import {
	comboHint,
	notRemoteHint,
	offlineHint,
	sendFailedHint,
	type BridgeHint,
	type HintAction
} from './hints';
import { HeldControls, KeyNotes, SoundingNotes, type HeldNote } from './ledger';
import { remoteRoute, TRACK_SELECT_CC, type RemoteRoute } from './mapping';

/** Invalid bridge settings (a channel or velocity out of range). */
export class BridgeError extends Error {
	override name = 'BridgeError';
}

/** Options for {@link ReplicaBridge}. */
export interface ReplicaBridgeOptions {
	/** The app-wide replica. */
	readonly replica: ReplicaState;
	/** The app-wide device stack (the transport is the only way out). */
	readonly stack: DeviceStack;
	/** `performance.now()` in the browser (the domain of MIDI timestamps). */
	readonly clock: Clock;
	readonly timers: Timers;
	/** Wire channel 0–15 for keyboard notes and pitch bend (default 0 = channel 1). */
	readonly channel?: number;
	/** Note-on velocity 1–127 (default 100). */
	readonly velocity?: number;
	/** Run the playhead over the step LEDs while the device plays (default true). */
	readonly playhead?: boolean;
	/** Send pitch bend from the pad (default true; the device receives it, not yet tried here). */
	readonly pitchBend?: boolean;
	/** The device clock counts as stopped after this long without F8, in ms (default 1000). */
	readonly clockStaleMs?: number;
}

/** MIDI clock ticks per sixteenth-note step (24 per quarter note). */
const TICKS_PER_STEP = 6;
/** Steps per bar on the step keys. */
const STEPS = 16;
/** Pitch bend at rest. */
const BEND_CENTRE = 8192;
/** Play and stop by CC (value 127), as the device answers them (verified on OS 1.1.33). */
const STOP_CC = 105;

/** All Sound Off or All Notes Off: whatever sounded on that channel has stopped. */
const silences = (controller: number) => controller === 120 || controller === 123;

/** The keyboard key that plays `note` on the replica (53–76), if any. */
const keyFor = (note: number): KeyboardKeyId | undefined => keyboardKeyForNote(note)?.id;

/** Connects the replica to the device stack; see the module comment. Call `start()` in onMount. */
export class ReplicaBridge {
	#channel = $state(0);
	#velocity = $state(100);

	readonly #replica: ReplicaState;
	readonly #stack: DeviceStack;
	readonly #clock: Clock;
	readonly #timers: Timers;
	readonly #playheadEnabled: boolean;
	readonly #bendEnabled: boolean;
	readonly #staleMs: number;
	readonly #hintListeners: ((hint: BridgeHint) => void)[] = [];

	#stops: (() => void)[] | null = null;
	/** Controls someone holds on the replica. */
	readonly #held = new HeldControls();
	/** Notes the replica keyboard started on the device. */
	readonly #notes = new KeyNotes();
	/** The pitch bend we left the device at, or null when centred. */
	#bend: { readonly channel: number; readonly value: number } | null = null;
	/** Notes the device is sounding; marked ones lit their keyboard LED. */
	readonly #deviceNotes = new SoundingNotes();
	/** Notes the app's other senders are sounding; marked ones pressed their key. */
	readonly #sentNotes = new SoundingNotes();
	/** The track LED showing the app's last track selection. */
	#trackLed: { readonly id: TrackKeyId; readonly state: KeyLedState } | null = null;
	/** The running playhead: clock ticks since Start and the step LED it lit. */
	#playhead: { ticks: number; lit: { id: StepKeyId; saved: KeyLedState } | null } | null = null;
	#lastTickAt = Number.NEGATIVE_INFINITY;
	#staleTimer: unknown = null;
	#syncQueued = false;

	constructor(options: ReplicaBridgeOptions) {
		this.#replica = options.replica;
		this.#stack = options.stack;
		this.#clock = options.clock;
		this.#timers = options.timers;
		this.#playheadEnabled = options.playhead ?? true;
		this.#bendEnabled = options.pitchBend ?? true;
		this.#staleMs = options.clockStaleMs ?? 1000;
		if (options.channel !== undefined) this.channel = options.channel;
		if (options.velocity !== undefined) this.velocity = options.velocity;
	}

	/** Wire channel 0–15 that keyboard notes and pitch bend go to (display it as `channel + 1`). */
	get channel(): number {
		return this.#channel;
	}

	set channel(value: number) {
		if (!Number.isInteger(value) || value < 0 || value > 15) {
			throw new BridgeError(`the channel is a wire channel 0–15, got ${value}`);
		}
		this.#channel = value;
	}

	/** Note-on velocity, 1–127. */
	get velocity(): number {
		return this.#velocity;
	}

	set velocity(value: number) {
		if (!Number.isInteger(value) || value < 1 || value > 127) {
			throw new BridgeError(`the velocity is 1–127, got ${value}`);
		}
		this.#velocity = value;
	}

	/** True while replica input reaches the device (a ready session with its ports open). */
	get live(): boolean {
		return this.#stack.session.phase === 'ready' && this.#stack.access.opened;
	}

	/** How many notes the replica keyboard is holding on the device. */
	get heldNotes(): number {
		return this.#notes.size;
	}

	/** Starts listening to the replica, the bus and hot-plug. Idempotent; returns `stop`. */
	start(): () => void {
		this.#stops ??= [
			this.#replica.subscribe((event) => this.#onReplica(event)),
			this.#stack.bus.subscribe((event) => this.#onBus(event)),
			this.#stack.access.onPairChange((change) => this.#onPairChange(change))
		];
		this.#scheduleSync();
		return () => this.stop();
	}

	/** Releases held notes, stops listening and puts every LED and key it set back. */
	stop(): void {
		if (!this.#stops) return;
		this.releaseAll();
		for (const stop of this.#stops) stop();
		this.#stops = null;
		this.#held.clear();
		this.#forgetDevice();
	}

	/**
	 * Releases every note the replica keyboard holds (note off for each, the keys come up) and
	 * re-centres the pitch bend. Call it when the page loses focus, hides or goes away.
	 */
	releaseAll(): void {
		for (const id of this.#notes.keys()) {
			// The release event turns the note off through the usual path.
			if (this.#replica.isPressed(id)) this.#replica.release(id, 'program');
		}
		for (const id of this.#notes.keys()) {
			const note = this.#notes.take(id);
			if (note) this.#noteOff(id, note);
		}
		if (this.#bend) {
			if (this.#replica.bend !== 0) this.#replica.setBend(0, 'program');
			if (this.#bend) this.#sendBend('strip.pitchbend', this.#bend.channel, BEND_CENTRE, true);
		}
	}

	/** Releases held notes while the port is still open, then disconnects the session. */
	async disconnect(): Promise<void> {
		this.releaseAll();
		await this.#stack.session.disconnect();
		this.#forgetDevice();
	}

	/** Listens to hints (a control with no remote path, a combo, no device…). Returns `unsubscribe`. */
	onHint(listener: (hint: BridgeHint) => void): () => void {
		this.#hintListeners.push(listener);
		return () => {
			const index = this.#hintListeners.indexOf(listener);
			if (index >= 0) this.#hintListeners.splice(index, 1);
		};
	}

	// ─────────────────────────────────────────────────────────── replica → device

	#onReplica(event: ReplicaEvent): void {
		switch (event.type) {
			case 'press':
				this.#onPress(event.id);
				return;
			case 'release':
				this.#onRelease(event.id);
				return;
			case 'turn':
				this.#hint(notRemoteHint(event.id, 'turn', this.#firmware));
				return;
			case 'click':
				this.#hint(notRemoteHint(event.id, 'click', this.#firmware));
				return;
			case 'bend':
				this.#onBend(event.value);
				return;
		}
	}

	#onPress(id: PressableId): void {
		this.#held.press(id);
		// An encoder push comes with a click or turns, which say it better.
		if (getControl(id).kind === 'encoder') return;
		const route = remoteRoute(id);
		if (route === null) {
			this.#hint(notRemoteHint(id, 'press', this.#firmware));
			return;
		}
		const held = this.#blockingHeld(id, route);
		if (held.length > 0) {
			this.#hint(comboHint(held, id, route, this.#firmware));
			return;
		}
		if (!this.live) {
			this.#scheduleSync();
			this.#hint(offlineHint(id));
			return;
		}
		switch (route.kind) {
			case 'note':
				this.#noteOn(id as KeyboardKeyId, route.note);
				return;
			case 'start':
				this.#send(id, 'press', { type: 'start' });
				return;
			case 'stop':
				this.#send(id, 'press', { type: 'stop' });
				return;
			case 'track':
				this.#send(id, 'press', {
					type: 'controlChange',
					channel: 0,
					controller: TRACK_SELECT_CC,
					value: route.track - 1
				});
				return;
		}
	}

	#onRelease(id: PressableId): void {
		this.#held.release(id);
		const note = this.#notes.take(id as KeyboardKeyId);
		if (note) this.#noteOff(id, note);
	}

	/**
	 * Held controls that turn this press into a different gesture on the device: any held control
	 * without a remote path (shift, record, a step, a mode key, an encoder push), and another track
	 * key under a track key (on the device that links tracks). Held notes change nothing.
	 */
	#blockingHeld(id: PressableId, route: RemoteRoute): PressableId[] {
		return this.#held
			.others(id, (other) => this.#replica.isPressed(other))
			.filter((other) => {
				const otherRoute = remoteRoute(other);
				return otherRoute === null || (route.kind === 'track' && otherRoute.kind === 'track');
			});
	}

	#noteOn(id: KeyboardKeyId, note: number): void {
		const channel = this.#channel;
		const sent = this.#send(id, 'press', {
			type: 'noteOn',
			channel,
			note,
			velocity: this.#velocity
		});
		if (sent) this.#notes.set(id, { channel, note });
	}

	#noteOff(id: ControlId, { channel, note }: HeldNote): void {
		// Without an open port there is nothing to release (the transport forgot it too).
		if (!this.live) return;
		this.#send(id, 'press', { type: 'noteOff', channel, note, velocity: 0 }, true);
	}

	#onBend(value: number): void {
		const id = 'strip.pitchbend';
		if (!this.#bendEnabled) {
			if (value !== 0) this.#hint(notRemoteHint(id, 'bend', this.#firmware));
			return;
		}
		if (!this.live) {
			if (value !== 0) this.#hint(offlineHint(id, 'bend'));
			return;
		}
		const wire = unitToBend(value);
		const channel = this.#bend?.channel ?? this.#channel;
		if (wire === (this.#bend?.value ?? BEND_CENTRE)) return;
		this.#sendBend(id, channel, wire, false);
	}

	#sendBend(id: ControlId, channel: number, value: number, quiet: boolean): void {
		const sent = this.live && this.#send(id, 'bend', { type: 'pitchBend', channel, value }, quiet);
		// A failed centring still counts as centred: there is no port left to bend.
		if (sent || value === BEND_CENTRE) {
			this.#bend = value === BEND_CENTRE ? null : { channel, value };
		}
	}

	/** Sends one message through the transport; returns false (and says why) when it was refused. */
	#send(id: ControlId, action: HintAction, message: MidiMessage, quiet = false): boolean {
		try {
			this.#stack.transport.send(message, { source: 'replica', cause: `replica:${id}` });
			return true;
		} catch (error) {
			if (!(error instanceof DeviceError)) throw error;
			if (!quiet) this.#hint(sendFailedHint(id, action, error, this.#firmware));
			return false;
		}
	}

	get #firmware(): string | null {
		return this.#stack.session.firmware?.osVersion ?? null;
	}

	#hint(hint: BridgeHint): void {
		for (const listener of [...this.#hintListeners]) {
			try {
				listener(hint);
			} catch (error) {
				console.error('[bridge] a hint listener threw; the others still run', error);
			}
		}
	}

	// ─────────────────────────────────────────────────────────── device → replica

	#onBus(event: MidiEvent): void {
		if (event.direction === 'in') this.#incoming(event);
		else this.#outgoing(event);
	}

	#incoming(event: MidiEvent): void {
		const { message } = event;
		switch (message.type) {
			case 'clock':
				this.#tick(event.time);
				return;
			case 'start':
			case 'continue':
				// The device's own Start, or its relay of ours: either way it is playing now.
				this.#startPlayhead();
				return;
			case 'stop':
				this.#stopPlayhead();
				return;
		}
		if (this.#stack.transport.isEcho(event)) return;
		switch (message.type) {
			case 'noteOn':
				this.#deviceNote(message.channel, message.note, true);
				return;
			case 'noteOff':
				this.#deviceNote(message.channel, message.note, false);
				return;
			case 'controlChange':
				if (silences(message.controller)) {
					for (const note of this.#deviceNotes.silence(message.channel)) this.#unlight(note);
				}
				return;
		}
	}

	#outgoing(event: MidiEvent): void {
		const { message } = event;
		// The replica already shows its own keys; what other senders play is shown on the keyboard.
		const other = event.source !== 'replica';
		switch (message.type) {
			case 'stop':
				this.#stopPlayhead();
				return;
			case 'noteOn':
				if (other) this.#sentNote(message.channel, message.note, true);
				return;
			case 'noteOff':
				if (other) this.#sentNote(message.channel, message.note, false);
				return;
			case 'controlChange':
				if (message.controller === TRACK_SELECT_CC) this.#scheduleSync();
				else if (message.controller === STOP_CC && message.value === 127) this.#stopPlayhead();
				else if (other && silences(message.controller)) {
					for (const note of this.#sentNotes.silence(message.channel)) this.#unshow(note);
				}
				return;
		}
	}

	/** The device plays or ends a note: its key lights white while any channel sounds it. */
	#deviceNote(channel: number, note: number, on: boolean): void {
		const key = keyFor(note);
		if (!key || !this.#deviceNotes.set(channel, note, on)) return;
		if (!on) {
			this.#unlight(note);
			return;
		}
		this.#deviceNotes.mark(note);
		this.#replica.setLed(key, 'white');
	}

	#unlight(note: number): void {
		const key = keyFor(note);
		if (key && this.#deviceNotes.unmark(note)) this.#darken(key);
	}

	/** Turns a keyboard LED the bridge lit off, unless someone else changed it meanwhile. */
	#darken(key: KeyboardKeyId): void {
		if (this.#replica.led(key) === 'white') this.#replica.setLed(key, 'off');
	}

	/** Another sender plays or ends a note: its key shows pressed while any channel sounds it. */
	#sentNote(channel: number, note: number, on: boolean): void {
		const key = keyFor(note);
		if (!key || !this.#sentNotes.set(channel, note, on)) return;
		if (!on) {
			this.#unshow(note);
			return;
		}
		// A key someone holds already shows; it stays theirs.
		if (this.#replica.isPressed(key)) return;
		this.#sentNotes.mark(note);
		this.#replica.press(key, 'device');
	}

	#unshow(note: number): void {
		const key = keyFor(note);
		if (key && this.#sentNotes.unmark(note)) this.#replica.release(key, 'device');
	}

	#onPairChange(change: PairChange): void {
		if (change.kind === 'disconnected') this.#forgetDevice();
		this.#scheduleSync();
	}

	/** Refreshes mirror-derived LEDs once the mirror has heard the same events (next microtask). */
	#scheduleSync(): void {
		if (this.#syncQueued) return;
		this.#syncQueued = true;
		queueMicrotask(() => {
			this.#syncQueued = false;
			if (this.#stops) this.#sync();
		});
	}

	#sync(): void {
		if (!this.live) {
			this.#forgetDevice();
			return;
		}
		this.#setTrackLed(this.#stack.mirror.selectedTrack);
	}

	/**
	 * Shows the app's last track selection: tracks 1–8 light their key white, auxiliary tracks
	 * 9–16 light key n − 8 red (the device's convention), null lights nothing.
	 */
	#setTrackLed(track: number | null): void {
		const next =
			track === null || track < 1 || track > 16
				? null
				: track <= 8
					? { id: `track.${track}` as TrackKeyId, state: 'white' as const }
					: { id: `track.${track - 8}` as TrackKeyId, state: 'red' as const };
		const current = this.#trackLed;
		if (current?.id === next?.id && current?.state === next?.state) return;
		if (current && this.#replica.led(current.id) === current.state) {
			this.#replica.setLed(current.id, 'off');
		}
		if (next) this.#replica.setLed(next.id, next.state);
		this.#trackLed = next;
	}

	/** The device is gone (or the bridge stops): forget what sounded and put the replica back. */
	#forgetDevice(): void {
		this.#notes.clear();
		this.#bend = null;
		this.#stopPlayhead();
		this.#lastTickAt = Number.NEGATIVE_INFINITY;
		for (const note of this.#deviceNotes.clear()) {
			const key = keyFor(note);
			if (key) this.#darken(key);
		}
		for (const note of this.#sentNotes.clear()) {
			const key = keyFor(note);
			if (key) this.#replica.release(key, 'device');
		}
		this.#setTrackLed(null);
	}

	// ─────────────────────────────────────────────────────────── playhead

	#startPlayhead(): void {
		if (!this.#playheadEnabled) return;
		// Only with the device's clock arriving: without it there is nothing to count.
		if (this.#clock.now() - this.#lastTickAt > this.#staleMs) return;
		this.#stopPlayhead();
		// The first F8 after Start is the downbeat: it counts as tick 0.
		this.#playhead = { ticks: -1, lit: null };
		this.#showStep(0);
		this.#armStale();
	}

	#tick(time: number): void {
		this.#lastTickAt = time;
		const playhead = this.#playhead;
		if (!playhead) return;
		playhead.ticks = (playhead.ticks + 1) % (STEPS * TICKS_PER_STEP);
		if (playhead.ticks % TICKS_PER_STEP === 0) this.#showStep(playhead.ticks / TICKS_PER_STEP);
	}

	#showStep(index: number): void {
		const playhead = this.#playhead;
		if (!playhead) return;
		const id = `step.${index + 1}` as StepKeyId;
		if (playhead.lit?.id === id) return;
		this.#restoreStep();
		playhead.lit = { id, saved: this.#replica.led(id) };
		this.#replica.setLed(id, 'white');
	}

	/** Puts the step LED the playhead lit back as it was (unless someone else took it over). */
	#restoreStep(): void {
		const playhead = this.#playhead;
		const lit = playhead?.lit;
		if (!playhead || !lit) return;
		if (this.#replica.led(lit.id) === 'white') this.#replica.setLed(lit.id, lit.saved);
		playhead.lit = null;
	}

	#stopPlayhead(): void {
		this.#restoreStep();
		this.#playhead = null;
		if (this.#staleTimer !== null) this.#timers.clearTimeout(this.#staleTimer);
		this.#staleTimer = null;
	}

	#armStale(): void {
		if (this.#staleTimer !== null) return;
		this.#staleTimer = this.#timers.setTimeout(this.#checkStale, this.#staleMs);
	}

	/** The clock stopped arriving (unplugged, or COM → clock changed): the playhead stops too. */
	#checkStale = (): void => {
		this.#staleTimer = null;
		if (!this.#playhead) return;
		const idle = this.#clock.now() - this.#lastTickAt;
		if (idle >= this.#staleMs) this.#stopPlayhead();
		else this.#staleTimer = this.#timers.setTimeout(this.#checkStale, this.#staleMs - idle);
	};
}
