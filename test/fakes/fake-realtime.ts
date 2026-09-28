/**
 * A stand-in for OpenAI's realtime API over WebRTC, for voice tests: a `fetch` that answers the
 * client-secret mint and the SDP exchange (recording every request), a fake peer connection whose
 * `oai-events` data channel records what the app sends and plays server events back, a fake
 * microphone list, and audio output that records what it was given. Tests script the server with
 * `respond` (called for every client event) and the helpers below. Runs in Node and in the browser
 * (EventTarget, Event and MessageEvent are globals in both).
 */
import type { AudioInputInfo, ClientEvent, ServerEvent } from '$lib/core/voice';
import type {
	AudioOutLike,
	DataChannelLike,
	PeerConnectionLike,
	RealtimeEnvironment,
	StreamLike,
	TrackLike
} from '$lib/voice/rtc';

/** A request the fake API saw. */
export interface CapturedCall {
	readonly url: string;
	readonly method: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
}

export class FakeTrack implements TrackLike {
	enabled = true;
	stopped = false;
	readonly #ended = new Set<() => void>();

	constructor(
		readonly label: string,
		readonly deviceId: string
	) {}

	stop(): void {
		this.stopped = true;
	}

	addEventListener(_type: 'ended', listener: () => void): void {
		this.#ended.add(listener);
	}

	/** The microphone was unplugged. */
	end(): void {
		for (const listener of this.#ended) listener();
	}
}

export class FakeStream implements StreamLike {
	constructor(readonly tracks: FakeTrack[]) {}

	getAudioTracks(): FakeTrack[] {
		return this.tracks;
	}

	getTracks(): FakeTrack[] {
		return this.tracks;
	}
}

export class FakeDataChannel extends EventTarget implements DataChannelLike {
	readyState = 'connecting';
	/** Every client event the app sent, parsed. */
	readonly sent: ClientEvent[] = [];

	constructor(
		readonly label: string,
		readonly onSend: (event: ClientEvent) => void
	) {
		super();
	}

	send(data: string): void {
		if (this.readyState !== 'open') throw new Error('data channel is not open');
		const event = JSON.parse(data) as ClientEvent;
		this.sent.push(event);
		this.onSend(event);
	}

	close(): void {
		if (this.readyState === 'closed') return;
		this.readyState = 'closed';
		this.dispatchEvent(new Event('close'));
	}

	open(): void {
		this.readyState = 'open';
		this.dispatchEvent(new Event('open'));
	}

	receive(event: ServerEvent | Record<string, unknown>): void {
		this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }));
	}
}

export class FakePeerConnection extends EventTarget implements PeerConnectionLike {
	connectionState = 'new';
	readonly tracks: { readonly track: TrackLike; readonly stream: StreamLike }[] = [];
	channel: FakeDataChannel | null = null;
	local: { readonly type: string; readonly sdp?: string | null } | null = null;
	remote: { readonly type: 'answer'; readonly sdp: string } | null = null;
	closed = false;

	constructor(readonly server: FakeRealtimeServer) {
		super();
	}

	addTrack(track: TrackLike, stream: StreamLike): void {
		this.tracks.push({ track, stream });
	}

	createDataChannel(label: string): FakeDataChannel {
		this.channel = new FakeDataChannel(label, (event) => this.server.onClientEvent(event));
		return this.channel;
	}

	async createOffer(): Promise<{ readonly type: string; readonly sdp: string }> {
		return { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=fake offer\r\n' };
	}

	async setLocalDescription(description: {
		readonly type: string;
		readonly sdp?: string | null;
	}): Promise<void> {
		this.local = description;
	}

	async setRemoteDescription(description: {
		readonly type: 'answer';
		readonly sdp: string;
	}): Promise<void> {
		this.remote = description;
		this.connectionState = 'connected';
		const track = Object.assign(new Event('track'), { streams: [new FakeStream([])] });
		this.dispatchEvent(track);
		if (this.server.autoOpen) queueMicrotask(() => this.channel?.open());
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.connectionState = 'closed';
		this.channel?.close();
	}

	/** The network dropped the call. */
	fail(): void {
		this.connectionState = 'failed';
		this.dispatchEvent(new Event('connectionstatechange'));
	}
}

export class FakeAudioOut implements AudioOutLike {
	streams: StreamLike[] = [];
	stopped = false;

	play(stream: StreamLike): void {
		this.streams.push(stream);
	}

	stop(): void {
		this.stopped = true;
	}
}

/** Options for {@link FakeRealtimeServer}. */
export interface FakeRealtimeOptions {
	/** Inputs the browser lists (default: a built-in microphone as the default). */
	readonly devices?: readonly AudioInputInfo[];
	/** The name of a `getUserMedia` error to throw (`NotAllowedError`…). */
	readonly micError?: string | null;
	/** The mint's answer (default: 200 with an `ek_` secret). */
	readonly mint?: (call: CapturedCall) => Response;
	/** The SDP exchange's answer (default: 201 with an SDP answer). */
	readonly calls?: (call: CapturedCall) => Response;
	/** Open the data channel right after the SDP exchange (default true). */
	readonly autoOpen?: boolean;
}

/** The secret the fake mint hands out (not key-shaped). */
export const FAKE_CLIENT_SECRET = 'ek_fake_client_secret';

export const BUILT_IN_MIC: AudioInputInfo = {
	deviceId: 'default',
	kind: 'audioinput',
	label: 'Default - MacBook Pro Microphone'
};

/** OpenAI's realtime API, WebRTC and the microphone, faked together. */
export class FakeRealtimeServer {
	readonly calls: CapturedCall[] = [];
	readonly peers: FakePeerConnection[] = [];
	readonly mics: FakeTrack[] = [];
	/** Where the voice's audio went, one per call. */
	readonly speakers: FakeAudioOut[] = [];
	readonly constraints: MediaStreamConstraints[] = [];
	readonly autoOpen: boolean;
	devices: readonly AudioInputInfo[];
	micError: string | null;
	/** Called for every client event, to script the server's side. */
	respond: ((event: ClientEvent) => void) | null = null;
	readonly #mint: (call: CapturedCall) => Response;
	readonly #answer: (call: CapturedCall) => Response;
	#item = 0;

	constructor(options: FakeRealtimeOptions = {}) {
		this.devices = options.devices ?? [
			BUILT_IN_MIC,
			{ deviceId: 'mbp', kind: 'audioinput', label: 'MacBook Pro Microphone' }
		];
		this.micError = options.micError ?? null;
		this.autoOpen = options.autoOpen ?? true;
		this.#mint =
			options.mint ??
			(() =>
				new Response(
					JSON.stringify({
						value: FAKE_CLIENT_SECRET,
						expires_at: 1_790_000_120,
						session: { type: 'realtime', id: 'sess_fake' }
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				));
		this.#answer =
			options.calls ??
			(() =>
				new Response('v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=fake answer\r\n', {
					status: 201,
					headers: { 'content-type': 'application/sdp' }
				}));
	}

	get peer(): FakePeerConnection | null {
		return this.peers.at(-1) ?? null;
	}

	get channel(): FakeDataChannel | null {
		return this.peer?.channel ?? null;
	}

	/** The client events sent on the current call. */
	get sent(): readonly ClientEvent[] {
		return this.channel?.sent ?? [];
	}

	/** Their types. */
	sentTypes(): string[] {
		return this.sent.map((e) => e.type);
	}

	/** The microphone track of the current call. */
	get mic(): FakeTrack | null {
		return this.mics.at(-1) ?? null;
	}

	/** Plays a server event to the app. */
	emit(event: ServerEvent | Record<string, unknown>): void {
		this.channel?.receive(event);
	}

	onClientEvent(event: ClientEvent): void {
		this.respond?.(event);
	}

	/** A fresh item id. */
	nextItem(prefix = 'item'): string {
		this.#item += 1;
		return `${prefix}_${this.#item}`;
	}

	/** The server heard a committed user turn and transcribed it. */
	heard(text: string, item: string = this.nextItem()): string {
		this.emit({ type: 'input_audio_buffer.committed', item_id: item });
		this.emit({
			type: 'conversation.item.input_audio_transcription.completed',
			item_id: item,
			transcript: text
		});
		return item;
	}

	/** The voice says `text` as a whole response (created, audio, transcript, done, stopped). */
	says(text: string, response: string = this.nextItem('resp')): void {
		const item = `${response}_msg`;
		this.emit({ type: 'response.created', response: { id: response } });
		this.emit({ type: 'output_audio_buffer.started', response_id: response });
		this.emit({ type: 'response.output_audio_transcript.delta', item_id: item, delta: text });
		this.emit({ type: 'response.output_audio_transcript.done', item_id: item, transcript: text });
		this.emit({ type: 'response.done', response: { id: response, status: 'completed' } });
		this.emit({ type: 'output_audio_buffer.stopped', response_id: response });
	}

	/** The voice calls a tool as a response of its own. */
	callsTool(
		name: string,
		args: Record<string, unknown>,
		call: string = this.nextItem('call')
	): string {
		const response = this.nextItem('resp');
		const item = {
			type: 'function_call',
			status: 'completed',
			call_id: call,
			name,
			arguments: JSON.stringify(args)
		};
		this.emit({ type: 'response.created', response: { id: response } });
		this.emit({ type: 'response.output_item.done', item });
		this.emit({
			type: 'response.done',
			response: { id: response, status: 'completed', output: [item] }
		});
		return call;
	}

	/** The outputs the app returned for tool calls, parsed, by call id. */
	toolOutputs(): Record<string, unknown> {
		const out: Record<string, unknown> = {};
		for (const event of this.sent) {
			if (event.type === 'conversation.item.create' && event.item.type === 'function_call_output') {
				out[event.item.call_id] = JSON.parse(event.item.output);
			}
		}
		return out;
	}

	/** This fake as the browser's realtime environment. */
	environment(): RealtimeEnvironment {
		return {
			fetch: async (input, init) => {
				const url =
					typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
				const headers: Record<string, string> = {};
				new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
				const call: CapturedCall = {
					url,
					method: init?.method ?? 'GET',
					headers,
					body: typeof init?.body === 'string' ? init.body : ''
				};
				this.calls.push(call);
				if (url.endsWith('/v1/realtime/client_secrets')) return this.#mint(call);
				if (url.endsWith('/v1/realtime/calls')) return this.#answer(call);
				return new Response('not found', { status: 404 });
			},
			createPeerConnection: () => {
				const peer = new FakePeerConnection(this);
				this.peers.push(peer);
				return peer;
			},
			getUserMedia: async (constraints) => {
				this.constraints.push(constraints);
				if (this.micError) {
					throw Object.assign(new Error('mic refused'), { name: this.micError });
				}
				const audio = constraints.audio;
				const wanted =
					audio && typeof audio === 'object' && audio.deviceId
						? ((audio.deviceId as { exact?: string }).exact ?? null)
						: null;
				const device =
					(wanted ? this.devices.find((d) => d.deviceId === wanted) : this.devices[0]) ?? null;
				if (!device)
					throw Object.assign(new Error('no such mic'), { name: 'OverconstrainedError' });
				const track = new FakeTrack(device.label.replace(/^Default - /, ''), device.deviceId);
				this.mics.push(track);
				return new FakeStream([track]);
			},
			enumerateDevices: async () => this.devices,
			createAudioOut: () => {
				const out = new FakeAudioOut();
				this.speakers.push(out);
				return out;
			}
		};
	}
}
