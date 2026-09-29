/**
 * Listening's ears in the browser: records a few seconds of what the OP-XY plays over its USB audio
 * input, or of what the replica plays in the browser, and hands the recording to the analysis.
 *
 * - **The OP-XY:** the audio input whose name contains "OP-XY" (the device is a class-compliant
 *   UAC1 input, 44.1 kHz stereo, docs/research/90-device-probe.md), opened with echo cancellation,
 *   noise suppression and gain control off, in an audio context at the input's own rate. Browsers
 *   hide input names until a page may use a microphone, so the first time the browser asks: that
 *   first stream only reveals the names and is stopped at once. Nothing but the OP-XY's input is
 *   ever recorded, and a stream whose track is not the OP-XY's is refused.
 * - **The replica:** the master of the app's sound (`AppSound.listenTap()`), tapped in its own
 *   audio context, so the replica keeps playing as it was.
 * - **Recording:** an AudioWorklet (`recorder.worklet.ts`) copies the input a render quantum at a
 *   time, off the main thread, and posts chunks with their peak, which the listening light shows.
 * - **Analysis** runs in a worker (`analysis.worker.ts`): hearing 30 s takes about half a second,
 *   which on the main thread would starve the replica's scheduler (it looks 100 ms ahead).
 *
 * Everything browser-specific is injected, so the Chromium tests drive it with a fake
 * `getUserMedia` and an oscillator; `browser.ts` wires the real browser.
 */
import type { ListenAnalysis, ListenOptions } from '$lib/core/listen';
import type { Timers } from '../types';
import { RECORDER, type RecorderCommand, type RecorderReply } from './protocol';

/** Where a recording comes from: the OP-XY's USB audio, or the replica's sound. */
export type ListenSource = 'device' | 'replica';

/** A recording: one or two channels at a sample rate. */
export interface Recording {
	readonly channels: readonly Float32Array[];
	readonly sampleRate: number;
	readonly source: ListenSource;
	/** The input's name, or "replica". */
	readonly label: string;
}

/** What the replica plays: its audio context and the node everything passes through on its way out. */
export interface SoundTap {
	readonly context: BaseAudioContext;
	readonly output: AudioNode;
}

/** The part of `navigator.mediaDevices` listening uses. */
export interface MediaDevicesLike {
	enumerateDevices(): Promise<readonly MediaDeviceInfo[]>;
	getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
}

/** Hears a recording (the analysis worker in the browser, `analyzeAudio` in tests). */
export type Analyze = (recording: Recording, options: ListenOptions) => Promise<ListenAnalysis>;

/** Options for {@link AudioCapture}. */
export interface AudioCaptureOptions {
	/** The browser's media devices; null where there are none. */
	readonly media: MediaDevicesLike | null;
	/** Makes the audio context a device recording runs in. */
	readonly createContext: (options: AudioContextOptions) => AudioContext;
	/** The URL of the recorder worklet's module. */
	readonly workletUrl: string;
	/** The replica's sound, when it runs (null while it is off). */
	readonly tap: () => SoundTap | null;
	readonly analyze: Analyze;
	readonly timers: Timers;
}

/** What listening is doing right now, for the listening light. */
export interface ListenActivity {
	readonly source: ListenSource;
	readonly seconds: number;
	/** Epoch ms. */
	readonly since: number;
}

/** A recording that could not be made; the message says what to do about it. */
export class ListenCaptureError extends Error {
	override name = 'ListenCaptureError';
}

/** The recording was stopped (the user pressed stop). */
export class ListenAbortedError extends Error {
	override name = 'ListenAbortedError';
}

/** An input or track that is the OP-XY's. */
export function isOpxyInput(label: string): boolean {
	return /op[-–_ ]?xy/i.test(label);
}

/** Seconds a recording may take beyond its length before it counts as stuck. */
const SLACK_SECONDS = 5;
/** A new input stream delivers silence for its first moments: recording starts this much later, ms. */
const PREROLL_MS = 200;
/** How long to wait for the replica's sound to come up (its engine loads on first use), ms. */
const TAP_WAIT_MS = 2000;
const TAP_POLL_MS = 100;

/** Records from the OP-XY or the replica and hands recordings to the analysis. */
export class AudioCapture {
	/** The recording in progress, or null. */
	active: ListenActivity | null = $state.raw(null);
	/** The peak of the latest chunk, 0–1 (for the light; 0 while idle). */
	level = $state(0);

	readonly #options: AudioCaptureOptions;
	/** Contexts the recorder module has been added to (not UI state). */
	readonly #loaded = new WeakSet<BaseAudioContext>();

	constructor(options: AudioCaptureOptions) {
		this.#options = options;
	}

	/**
	 * Records `seconds` of `source`.
	 * @throws {ListenCaptureError} when it cannot (no input, no permission, sound off, stuck audio)
	 * @throws {ListenAbortedError} when `signal` aborts first
	 */
	async record(source: ListenSource, seconds: number, signal: AbortSignal): Promise<Recording> {
		if (signal.aborted) throw new ListenAbortedError('stopped');
		if (this.active) throw new ListenCaptureError('Already listening; wait for it to finish.');
		this.active = { source, seconds, since: Date.now() };
		try {
			return source === 'device'
				? await this.#recordDevice(seconds, signal)
				: await this.#recordReplica(seconds, signal);
		} finally {
			this.active = null;
			this.level = 0;
		}
	}

	/** Hears a recording (off the main thread in the browser). */
	analyze(recording: Recording, options: ListenOptions = {}): Promise<ListenAnalysis> {
		return this.#options.analyze(recording, options);
	}

	async #recordReplica(seconds: number, signal: AbortSignal): Promise<Recording> {
		const tap = await this.#waitForTap(signal);
		const channels = await this.#recordFrom(tap.context, tap.output, seconds, signal);
		return { channels, sampleRate: tap.context.sampleRate, source: 'replica', label: 'replica' };
	}

	/** The replica's sound, once it runs (it loads on first use and wakes on a gesture). */
	async #waitForTap(signal: AbortSignal): Promise<SoundTap> {
		const { timers } = this.#options;
		for (let waited = 0; ; waited += TAP_POLL_MS) {
			const tap = this.#options.tap();
			if (tap && tap.context.state === 'running') return tap;
			if (waited >= TAP_WAIT_MS) {
				throw new ListenCaptureError(
					tap
						? "The browser has not let the replica's sound start yet: click anywhere on the page, then ask again."
						: "The replica's sound is off: switch sound on under the replica, then ask again."
				);
			}
			await wait(TAP_POLL_MS, timers, signal);
		}
	}

	async #recordDevice(seconds: number, signal: AbortSignal): Promise<Recording> {
		const { stream, label } = await this.#openDevice(signal);
		let context: AudioContext | null = null;
		try {
			const rate = stream.getAudioTracks()[0]?.getSettings().sampleRate;
			try {
				context = this.#options.createContext(rate ? { sampleRate: rate } : {});
			} catch {
				// a rate this browser will not open a context at: its own rate (the stream is resampled)
				context = this.#options.createContext({});
			}
			if (context.state !== 'running') await context.resume().catch(() => {});
			if (context.state !== 'running') {
				throw new ListenCaptureError(
					'The browser has not let audio start yet: click anywhere on the page, then ask again.'
				);
			}
			const source = context.createMediaStreamSource(stream);
			const channels = await this.#recordFrom(context, source, seconds, signal, PREROLL_MS);
			source.disconnect();
			return { channels, sampleRate: context.sampleRate, source: 'device', label };
		} finally {
			for (const track of stream.getTracks()) track.stop();
			if (context && context.state !== 'closed') void context.close().catch(() => {});
		}
	}

	/** The OP-XY's input as a stream, asking the browser for permission if it must. */
	async #openDevice(signal: AbortSignal): Promise<{ stream: MediaStream; label: string }> {
		const media = this.#options.media;
		if (!media) {
			throw new ListenCaptureError(
				'This browser cannot record audio inputs, so the OP-XY cannot be heard here.'
			);
		}
		const inputs = async () =>
			(await media.enumerateDevices()).filter((d) => d.kind === 'audioinput');
		let found = (await inputs()).find((d) => isOpxyInput(d.label));
		if (!found && (await inputs()).every((d) => !d.label)) {
			// input names are hidden until the page may use a microphone: this asks once, and the
			// stream it gives (whatever input the user allows) is stopped unheard
			const unlock = await guard(() => media.getUserMedia({ audio: true }));
			for (const track of unlock.getTracks()) track.stop();
			found = (await inputs()).find((d) => isOpxyInput(d.label));
		}
		if (signal.aborted) throw new ListenAbortedError('stopped');
		if (!found) {
			throw new ListenCaptureError(
				'No audio input named OP-XY. Check that the OP-XY is connected with a data cable (it appears as an audio input on the computer), then ask again.'
			);
		}
		const stream = await guard(() =>
			media.getUserMedia({
				audio: {
					deviceId: { exact: found.deviceId },
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false,
					channelCount: { ideal: 2 }
				}
			})
		);
		const track = stream.getAudioTracks()[0];
		if (!track || !isOpxyInput(track.label)) {
			for (const t of stream.getTracks()) t.stop();
			throw new ListenCaptureError(
				'The browser opened another input instead of the OP-XY, so nothing was recorded.'
			);
		}
		if (signal.aborted) {
			for (const t of stream.getTracks()) t.stop();
			throw new ListenAbortedError('stopped');
		}
		return { stream, label: track.label };
	}

	/** Records `seconds` of `source` through the recorder worklet in `context`, `preroll` ms in. */
	async #recordFrom(
		context: BaseAudioContext,
		source: AudioNode,
		seconds: number,
		signal: AbortSignal,
		preroll = 0
	): Promise<Float32Array[]> {
		if (!context.audioWorklet) throw new ListenCaptureError('This browser has no AudioWorklet.');
		if (!this.#loaded.has(context)) {
			await context.audioWorklet.addModule(this.#options.workletUrl);
			this.#loaded.add(context);
		}
		// stopped while the recorder loaded: its abort event has come and gone
		if (signal.aborted) throw new ListenAbortedError('stopped');
		const frames = Math.max(1, Math.round(seconds * context.sampleRate));
		const node = new AudioWorkletNode(context, RECORDER, {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			outputChannelCount: [1],
			channelCount: 2,
			channelCountMode: 'explicit',
			channelInterpretation: 'speakers'
		});
		// pulled by the destination through a silent gain, so it runs in every browser
		const mute = context.createGain();
		mute.gain.value = 0;
		source.connect(node);
		node.connect(mute).connect(context.destination);
		const chunks: (readonly Float32Array[])[] = [];
		const { timers } = this.#options;
		try {
			if (preroll > 0) await wait(preroll, timers, signal);
			await new Promise<void>((resolve, reject) => {
				const timeout = timers.setTimeout(
					() =>
						settle(
							new ListenCaptureError('The audio stopped running, so the recording did not finish.')
						),
					(seconds + SLACK_SECONDS) * 1000
				);
				const onAbort = () => settle(new ListenAbortedError('stopped'));
				const settle = (error?: Error) => {
					timers.clearTimeout(timeout);
					signal.removeEventListener('abort', onAbort);
					node.port.onmessage = null;
					if (error) reject(error);
					else resolve();
				};
				signal.addEventListener('abort', onAbort, { once: true });
				if (signal.aborted) {
					onAbort();
					return;
				}
				node.port.onmessage = (event: MessageEvent<RecorderReply>) => {
					const reply = event.data;
					if (reply.type === 'chunk') {
						chunks.push(reply.channels);
						this.level = Math.min(1, reply.peak);
					} else {
						settle();
					}
				};
				const start: RecorderCommand = { type: 'start', frames };
				node.port.postMessage(start);
			});
		} finally {
			try {
				source.disconnect(node);
			} catch {
				// already gone
			}
			node.disconnect();
			mute.disconnect();
			node.port.close();
		}
		return [0, 1].map((c) => {
			const out = new Float32Array(frames);
			let at = 0;
			for (const chunk of chunks) {
				const part = chunk[c].subarray(0, Math.min(chunk[c].length, frames - at));
				out.set(part, at);
				at += part.length;
			}
			return out;
		});
	}
}

/** Waits `ms`, rejecting with {@link ListenAbortedError} when `signal` aborts. */
function wait(ms: number, timers: Timers, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new ListenAbortedError('stopped'));
			return;
		}
		const onAbort = () => {
			timers.clearTimeout(handle);
			reject(new ListenAbortedError('stopped'));
		};
		const handle = timers.setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		signal.addEventListener('abort', onAbort, { once: true });
	});
}

/** A `getUserMedia` call whose refusals read as what to do about them. */
async function guard(open: () => Promise<MediaStream>): Promise<MediaStream> {
	try {
		return await open();
	} catch (error) {
		const name = error instanceof Error ? error.name : '';
		if (name === 'NotAllowedError' || name === 'SecurityError') {
			throw new ListenCaptureError(
				"The browser was not allowed to use the OP-XY's audio input. Allow microphone access for this site (the app records only the input named OP-XY), then ask again.",
				{ cause: error }
			);
		}
		if (
			name === 'NotFoundError' ||
			name === 'OverconstrainedError' ||
			name === 'NotReadableError'
		) {
			throw new ListenCaptureError(
				"The OP-XY's audio input could not be opened (another app may hold it). Check the connection, then ask again.",
				{ cause: error }
			);
		}
		throw new ListenCaptureError(
			`The OP-XY's audio input could not be opened: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
}
