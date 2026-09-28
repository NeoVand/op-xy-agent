/**
 * The voice call's browser side (docs/research/71-voice.md §2): the microphone (never the OP-XY's
 * own USB input), a short-lived client secret minted with the user's OpenAI key, and a WebRTC call
 * to OpenAI's realtime API with its `oai-events` data channel. Every browser API is injected
 * (`RealtimeEnvironment`), so tests run the whole flow against fakes.
 *
 * Keys: the user's key goes only to `api.openai.com/v1/realtime/client_secrets`, in the
 * Authorization header, once per call; the `ek_…` secret it returns authorises the SDP exchange
 * and is then dropped. Neither is logged, stored or put in a URL.
 */
import {
	CALLS_URL,
	CLIENT_SECRETS_URL,
	CONNECTION_LOST,
	EVENTS_CHANNEL,
	NETWORK_PROBLEM,
	VoiceError,
	blamesReasoning,
	clientSecretRequest,
	isOpxyInput,
	micProblem,
	openAiProblem,
	parseClientSecret,
	parseServerEvent,
	pickMicrophone,
	withoutReasoning,
	type AudioInputInfo,
	type ClientEvent,
	type ClientSecret,
	type RealtimeSessionConfig,
	type ServerEvent,
	type VoiceProblem
} from '$lib/core/voice';
import type { Timers } from '$lib/device/types';

/** A microphone track, as far as the call needs it. */
export interface TrackLike {
	enabled: boolean;
	readonly label: string;
	stop(): void;
	addEventListener?(type: 'ended', listener: () => void): void;
}

/** A media stream. */
export interface StreamLike {
	getAudioTracks(): TrackLike[];
	getTracks(): TrackLike[];
}

/** The `oai-events` data channel. */
export interface DataChannelLike extends EventTarget {
	readonly readyState: string;
	send(data: string): void;
	close(): void;
}

/** The peer connection. */
export interface PeerConnectionLike extends EventTarget {
	readonly connectionState: string;
	addTrack(track: TrackLike, stream: StreamLike): unknown;
	createDataChannel(label: string): DataChannelLike;
	createOffer(): Promise<{ readonly type: string; readonly sdp?: string | null }>;
	setLocalDescription(description: {
		readonly type: string;
		readonly sdp?: string | null;
	}): Promise<void>;
	setRemoteDescription(description: {
		readonly type: 'answer';
		readonly sdp: string;
	}): Promise<void>;
	close(): void;
}

/** Where the voice's audio plays. */
export interface AudioOutLike {
	play(stream: StreamLike): void;
	stop(): void;
}

/** The browser APIs the call uses. */
export interface RealtimeEnvironment {
	readonly fetch: typeof fetch;
	createPeerConnection(): PeerConnectionLike;
	getUserMedia(constraints: MediaStreamConstraints): Promise<StreamLike>;
	enumerateDevices(): Promise<readonly AudioInputInfo[]>;
	createAudioOut(): AudioOutLike;
}

/** This browser's WebRTC, microphone and audio. Touches nothing until used. */
export function browserRealtimeEnvironment(): RealtimeEnvironment {
	return {
		fetch: (input, init) => globalThis.fetch(input, init),
		createPeerConnection: () => new RTCPeerConnection() as unknown as PeerConnectionLike,
		getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
		enumerateDevices: () => navigator.mediaDevices.enumerateDevices(),
		createAudioOut() {
			const element = document.createElement('audio');
			element.autoplay = true;
			return {
				play(stream) {
					element.srcObject = stream as unknown as MediaStream;
					// Allowed: the call starts from a key press (a user gesture).
					void element.play().catch(() => {});
				},
				stop() {
					element.pause();
					element.srcObject = null;
				}
			};
		}
	};
}

/** Whether this browser can make the call at all. */
export function voiceSupported(): boolean {
	return (
		typeof RTCPeerConnection !== 'undefined' &&
		typeof navigator !== 'undefined' &&
		typeof navigator.mediaDevices?.getUserMedia === 'function'
	);
}

/** A live call. */
export interface RealtimeLink {
	/** Sends one client event over the data channel. */
	send(event: ClientEvent): void;
	/** Opens or closes the microphone (a closed track sends silence). */
	setMic(open: boolean): void;
	/** The microphone in use, as the browser names it. */
	readonly microphone: string;
	/** Hangs up and lets go of the microphone. */
	close(): void;
}

/** Options for {@link connectRealtime}. */
export interface RealtimeConnectOptions {
	/** The user's OpenAI key, for minting the client secret only. */
	readonly apiKey: string;
	readonly session: RealtimeSessionConfig;
	readonly environment: RealtimeEnvironment;
	readonly timers: Timers;
	readonly onEvent: (event: ServerEvent) => void;
	/** The call ended without `close()`: dropped, or the microphone went away. */
	readonly onClose: (problem: VoiceProblem) => void;
	/** Whether the microphone starts open. */
	readonly micOpen?: boolean;
	/** A microphone chosen before (a device id). */
	readonly preferredMic?: string | null;
	readonly signal?: AbortSignal;
	/** How long the data channel may take to open (default 15 s). */
	readonly openTimeoutMs?: number;
}

const ABORTED: VoiceProblem = { code: 'connection', message: 'stopped', fatal: true };
const NO_WEBRTC: VoiceProblem = {
	code: 'unsupported',
	message: 'this browser could not start the call',
	fatal: true
};

function checkAbort(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw new VoiceError(ABORTED);
}

async function post(fetcher: typeof fetch, url: string, init: RequestInit): Promise<Response> {
	try {
		return await fetcher(url, { ...init, method: 'POST' });
	} catch (error) {
		if (init.signal?.aborted) throw new VoiceError(ABORTED);
		throw new VoiceError(error instanceof VoiceError ? error.problem : NETWORK_PROBLEM);
	}
}

async function errorBody(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

/**
 * Mints the client secret with the user's key. A model that takes no reasoning setting gets one
 * more try without it.
 */
export async function mintClientSecret(
	fetcher: typeof fetch,
	apiKey: string,
	session: RealtimeSessionConfig,
	signal?: AbortSignal
): Promise<ClientSecret> {
	const response = await post(fetcher, CLIENT_SECRETS_URL, {
		headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(clientSecretRequest(session)),
		signal
	});
	if (!response.ok) {
		const body = await errorBody(response);
		if (response.status === 400 && session.reasoning && blamesReasoning(body)) {
			return mintClientSecret(fetcher, apiKey, withoutReasoning(session), signal);
		}
		throw new VoiceError(openAiProblem(response.status, body));
	}
	return parseClientSecret(await errorBody(response));
}

/** Sends the SDP offer with the client secret and returns the answer. */
export async function exchangeSdp(
	fetcher: typeof fetch,
	secret: ClientSecret,
	offer: string,
	signal?: AbortSignal
): Promise<string> {
	const response = await post(fetcher, CALLS_URL, {
		headers: { Authorization: `Bearer ${secret.value}`, 'Content-Type': 'application/sdp' },
		body: offer,
		signal
	});
	if (!response.ok) throw new VoiceError(openAiProblem(response.status, await errorBody(response)));
	return response.text();
}

const MIC_CONSTRAINTS = {
	echoCancellation: true,
	noiseSuppression: true,
	autoGainControl: true
} as const;

function errorName(error: unknown): string {
	return error !== null && typeof error === 'object' && 'name' in error
		? String((error as { name: unknown }).name)
		: '';
}

/** Opens the microphone: the preferred one, else the default unless that is the OP-XY. */
export async function openMicrophone(
	env: RealtimeEnvironment,
	preferred: string | null
): Promise<{ readonly stream: StreamLike; readonly track: TrackLike }> {
	const open = async (deviceId: string | null) => {
		const stream = await env.getUserMedia({
			audio: { ...MIC_CONSTRAINTS, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) }
		});
		const track = stream.getAudioTracks()[0];
		if (!track) {
			for (const t of stream.getTracks()) t.stop();
			throw new VoiceError(micProblem('NotFoundError'));
		}
		return { stream, track };
	};
	let mic: { readonly stream: StreamLike; readonly track: TrackLike };
	try {
		mic = await open(preferred);
	} catch (error) {
		if (error instanceof VoiceError) throw error;
		// The preferred microphone is gone: take the default instead.
		if (preferred && errorName(error) === 'OverconstrainedError') return openMicrophone(env, null);
		throw new VoiceError(micProblem(errorName(error)));
	}
	if (!isOpxyInput(mic.track.label)) return mic;
	// The browser's default is the OP-XY's own input: the voice would hear the synth, not you.
	const devices = await env.enumerateDevices().catch(() => [] as readonly AudioInputInfo[]);
	const other = pickMicrophone(devices);
	if (!other) return mic;
	for (const t of mic.stream.getTracks()) t.stop();
	try {
		return await open(other);
	} catch (error) {
		throw error instanceof VoiceError ? error : new VoiceError(micProblem(errorName(error)));
	}
}

function whenOpen(
	channel: DataChannelLike,
	timers: Timers,
	timeoutMs: number,
	signal?: AbortSignal
): Promise<void> {
	if (channel.readyState === 'open') return Promise.resolve();
	return new Promise((resolve, reject) => {
		const done = (error?: VoiceError) => {
			timers.clearTimeout(handle);
			channel.removeEventListener('open', onOpen);
			channel.removeEventListener('close', onClose);
			signal?.removeEventListener('abort', onAbort);
			if (error) reject(error);
			else resolve();
		};
		const onOpen = () => done();
		const onClose = () => done(new VoiceError(CONNECTION_LOST));
		const onAbort = () => done(new VoiceError(ABORTED));
		const handle = timers.setTimeout(() => done(new VoiceError(CONNECTION_LOST)), timeoutMs);
		channel.addEventListener('open', onOpen);
		channel.addEventListener('close', onClose);
		signal?.addEventListener('abort', onAbort);
	});
}

/**
 * Opens a voice call: microphone first (so a refusal costs nothing), then the client secret, the
 * peer connection with the mic track and the events channel, the SDP exchange, and the channel
 * opening. Anything that fails lets go of what was opened and throws a {@link VoiceError}.
 */
export async function connectRealtime(options: RealtimeConnectOptions): Promise<RealtimeLink> {
	const { environment: env, signal } = options;
	const undo: (() => void)[] = [];
	const release = () => {
		for (const step of undo.splice(0).reverse()) {
			try {
				step();
			} catch {
				// Already closed.
			}
		}
	};
	try {
		checkAbort(signal);
		const mic = await openMicrophone(env, options.preferredMic ?? null);
		undo.push(() => {
			for (const track of mic.stream.getTracks()) track.stop();
		});
		checkAbort(signal);
		const secret = await mintClientSecret(env.fetch, options.apiKey, options.session, signal);
		checkAbort(signal);

		const peer = env.createPeerConnection();
		undo.push(() => peer.close());
		const audio = env.createAudioOut();
		undo.push(() => audio.stop());
		peer.addEventListener('track', (event) => {
			const stream = (event as Event & { streams?: readonly StreamLike[] }).streams?.[0];
			if (stream) audio.play(stream);
		});
		mic.track.enabled = options.micOpen ?? false;
		peer.addTrack(mic.track, mic.stream);
		const channel = peer.createDataChannel(EVENTS_CHANNEL);
		undo.push(() => channel.close());

		const offer = await peer.createOffer();
		if (!offer.sdp) throw new VoiceError(NO_WEBRTC);
		await peer.setLocalDescription(offer);
		const answer = await exchangeSdp(env.fetch, secret, offer.sdp, signal);
		checkAbort(signal);
		await peer.setRemoteDescription({ type: 'answer', sdp: answer });
		await whenOpen(channel, options.timers, options.openTimeoutMs ?? 15_000, signal);

		let closed = false;
		const lost = (problem: VoiceProblem) => {
			if (closed) return;
			closed = true;
			release();
			options.onClose(problem);
		};
		channel.addEventListener('message', (event) => {
			const parsed = parseServerEvent((event as MessageEvent).data);
			if (parsed && !closed) options.onEvent(parsed);
		});
		channel.addEventListener('close', () => lost(CONNECTION_LOST));
		peer.addEventListener('connectionstatechange', () => {
			if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
				lost(CONNECTION_LOST);
			}
		});
		mic.track.addEventListener?.('ended', () =>
			lost({ code: 'no-mic', message: 'the microphone went away', fatal: true })
		);

		return {
			microphone: mic.track.label,
			send(event) {
				if (!closed && channel.readyState === 'open') channel.send(JSON.stringify(event));
			},
			setMic(open) {
				if (!closed) mic.track.enabled = open;
			},
			close() {
				if (closed) return;
				closed = true;
				release();
			}
		};
	} catch (error) {
		release();
		throw error instanceof VoiceError ? error : new VoiceError(NO_WEBRTC);
	}
}
