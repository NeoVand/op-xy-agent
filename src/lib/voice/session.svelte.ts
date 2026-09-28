/**
 * The voice front end (M8) as reactive state for the agent panel: OpenAI's realtime model listens
 * and talks, and hands every OP-XY question or action to the Claude conductor (`bridge.ts`).
 *
 * - **Push-to-talk** (default): hold the mic key; the mic track is open only while it is held,
 *   plus a short tail so the last syllable reaches OpenAI; then the turn is committed and answered.
 * - **Hands-free**: the mic stays open (the key mutes it) and the server takes turns.
 * - **Barge-in**: pressing the key, or speaking hands-free, stops the voice at once.
 * - What is heard and said goes into the conversation as voice lines (`conductor.voiceLine`).
 *
 * The decisions live in the pure state machine (`$lib/core/voice/machine.ts`); this class carries
 * events between it, the WebRTC call (`rtc.ts`), the conductor and the UI. Nothing touches a
 * browser API until `connect()`; call `load()` in onMount to read the saved mode and model.
 */
import type { PreferenceStore } from '$lib/agent/conductor.svelte';
import {
	DEFAULT_VOICE_MODEL,
	REALTIME_MODELS,
	realtimeCost,
	realtimeProfile,
	type RealtimeModelProfile
} from '$lib/agent/models';
import {
	NO_CLAUDE,
	NO_KEY,
	VoiceError,
	initialVoiceState,
	parseToolCall,
	phaseOf,
	sessionConfig,
	stepVoice,
	toolOutput,
	updateNote,
	type FunctionCall,
	type VoiceInput,
	type VoiceMode,
	type VoicePhase,
	type VoiceProblem,
	type VoiceState,
	type VoiceToolResult
} from '$lib/core/voice';
import { browserTimers, browserClock } from '$lib/device/env';
import type { Clock, Timers } from '$lib/device/types';
import { ClaudeBridge, type SpokenEvidence, type VoiceConductor } from './bridge';
import {
	browserRealtimeEnvironment,
	connectRealtime,
	voiceSupported,
	type RealtimeEnvironment,
	type RealtimeLink
} from './rtc';

/** Where the chosen mode and model are remembered. */
export const VOICE_MODE_PREFERENCE = 'opxy:voice-mode';
export const VOICE_MODEL_PREFERENCE = 'opxy:voice-model';

/** Everything the session depends on. */
export interface VoiceSessionOptions {
	/** The user's OpenAI key (from the key store), read when a call starts. */
	readonly apiKey: () => string | null;
	/** The conductor the voice hands requests to (null while there is none). */
	readonly conductor: () => VoiceConductor | null;
	/** The browser's WebRTC, microphone and audio (fakes in tests). */
	readonly environment?: () => RealtimeEnvironment;
	/** Whether this browser can make the call (default: it has WebRTC and a microphone API). */
	readonly supported?: () => boolean;
	readonly preferences?: PreferenceStore;
	readonly timers?: Timers;
	readonly clock?: Clock;
	/** How long the mic stays open after the key comes up (default 250 ms). */
	readonly releaseTailMs?: number;
	/** How long a request runs before the voice says Claude is still on it (default 20 s). */
	readonly patienceMs?: number;
	/** How long to wait for the words of a spoken yes or no (default 2.5 s). */
	readonly transcriptWaitMs?: number;
}

const UNSUPPORTED: VoiceProblem = {
	code: 'unsupported',
	message: 'this browser cannot do voice (it needs webrtc and a microphone)',
	fatal: true
};

function browserPreferences(): PreferenceStore {
	const storage = (): Storage | null => {
		try {
			return typeof localStorage === 'undefined' ? null : localStorage;
		} catch {
			return null;
		}
	};
	return {
		get(key) {
			try {
				return storage()?.getItem(key) ?? null;
			} catch {
				return null;
			}
		},
		set(key, value) {
			try {
				if (value === null) storage()?.removeItem(key);
				else storage()?.setItem(key, value);
			} catch {
				// Blocked storage: the choice lasts for this page.
			}
		}
	};
}

/** The voice front end. Create once per agent panel; `dispose()` when it goes. */
export class VoiceSession {
	/** What the voice is doing. */
	phase: VoicePhase = $state('idle');
	mode: VoiceMode = $state('push-to-talk');
	/** The realtime model (applies from the next call). */
	model: string = $state(DEFAULT_VOICE_MODEL);
	/** The mic key is down (push-to-talk), for its pressed look. */
	keyDown = $state(false);
	/** Hands-free: the mic is muted. */
	muted = $state(false);
	problem: VoiceProblem | null = $state.raw(null);
	/** A short tip ("hold the key while you talk"). */
	hint: string | null = $state(null);
	/** The microphone in use, as the browser names it. */
	microphone: string | null = $state(null);
	/** What this call has cost so far (USD, a lower bound: transcription is billed apart). */
	usd = $state(0);

	/** The realtime models to pick from. */
	readonly models: readonly RealtimeModelProfile[] = REALTIME_MODELS;

	readonly #apiKey: () => string | null;
	readonly #conductor: () => VoiceConductor | null;
	readonly #environment: () => RealtimeEnvironment;
	readonly #supported: () => boolean;
	readonly #preferences: PreferenceStore;
	readonly #timers: Timers;
	readonly #clock: Clock;
	readonly #releaseTailMs: number;
	readonly #bridge: ClaudeBridge;
	#state: VoiceState = initialVoiceState();
	#link: RealtimeLink | null = null;
	#connecting: AbortController | null = null;
	#pressedAt = 0;
	#releaseTimer: unknown = null;
	// Bookkeeping, not UI state.
	#queue: VoiceInput[] = [];
	#applying = false;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly #watchers = new Set<() => void>();
	#disposed = false;

	constructor(options: VoiceSessionOptions) {
		this.#apiKey = options.apiKey;
		this.#conductor = options.conductor;
		this.#environment = options.environment ?? browserRealtimeEnvironment;
		this.#supported = options.supported ?? voiceSupported;
		this.#preferences = options.preferences ?? browserPreferences();
		this.#timers = options.timers ?? browserTimers;
		this.#clock = options.clock ?? browserClock;
		this.#releaseTailMs = options.releaseTailMs ?? 250;
		this.#bridge = new ClaudeBridge({
			conductor: this.#conductor,
			evidence: this.#evidence,
			timers: this.#timers,
			patienceMs: options.patienceMs,
			transcriptWaitMs: options.transcriptWaitMs,
			onUpdate: (result) => this.#announce(result)
		});
	}

	/** A call is open or opening (reactive: it follows `phase`). */
	get active(): boolean {
		return this.phase !== 'idle' && this.phase !== 'error';
	}

	/** Whether the voice strip has something to show. */
	get visible(): boolean {
		return this.phase !== 'idle' || this.problem !== null || this.hint !== null;
	}

	/** Reads the saved mode and model. */
	load(): void {
		const mode = this.#preferences.get(VOICE_MODE_PREFERENCE);
		if (mode === 'push-to-talk' || mode === 'hands-free') this.mode = mode;
		const model = this.#preferences.get(VOICE_MODEL_PREFERENCE);
		if (model && REALTIME_MODELS.some((m) => m.id === model)) this.model = model;
		if (!this.active) this.#state = initialVoiceState(this.mode);
	}

	/** Starts a call (the mic key does this on its first press). */
	async connect(): Promise<void> {
		if (this.#disposed || this.active) return;
		if (!this.#supported()) return this.#apply({ type: 'failed', problem: UNSUPPORTED });
		const apiKey = this.#apiKey();
		if (!apiKey) return this.#apply({ type: 'failed', problem: NO_KEY });
		if (!this.#conductor()) return this.#apply({ type: 'failed', problem: NO_CLAUDE });
		const controller = new AbortController();
		this.#connecting = controller;
		this.#apply({ type: 'connect', mode: this.mode });
		const profile = realtimeProfile(this.model);
		try {
			const link = await connectRealtime({
				apiKey,
				session: sessionConfig({
					model: profile.id,
					mode: this.mode,
					reasoning: profile.reasoning ? 'low' : null
				}),
				environment: this.#environment(),
				timers: this.#timers,
				signal: controller.signal,
				onEvent: (event) => this.#apply({ type: 'server', event }),
				onClose: (problem) => this.#lost(problem)
			});
			if (controller.signal.aborted) {
				link.close();
				return;
			}
			this.#link = link;
			this.microphone = link.microphone || null;
			this.#apply({ type: 'open' });
		} catch (error) {
			if (controller.signal.aborted) return;
			const problem =
				error instanceof VoiceError
					? error.problem
					: { code: 'unsupported' as const, message: 'voice could not start', fatal: true };
			this.#apply({ type: 'failed', problem });
		} finally {
			if (this.#connecting === controller) this.#connecting = null;
		}
	}

	/**
	 * The mic key went down. Push-to-talk: the mic opens and a voice still talking stops. The first
	 * press also starts the call (held on, the turn begins once it is open).
	 */
	press(): void {
		if (this.#disposed) return;
		if (this.mode === 'hands-free') {
			if (!this.active) void this.connect();
			return;
		}
		if (this.keyDown) return;
		this.keyDown = true;
		if (this.#releaseTimer !== null) {
			// Pressed again during the tail: the same turn goes on.
			this.#timers.clearTimeout(this.#releaseTimer);
			this.#releaseTimer = null;
			return;
		}
		if (!this.active && !this.#apiKey()) {
			this.keyDown = false;
			void this.connect();
			return;
		}
		this.#pressedAt = this.#clock.now();
		this.#apply({ type: 'press' });
		if (!this.active) void this.connect();
	}

	/** The mic key came up: after a short tail the turn is committed and answered. */
	release(): void {
		if (!this.keyDown) return;
		this.keyDown = false;
		if (this.mode !== 'push-to-talk') return;
		const heldMs = this.#clock.now() - this.#pressedAt;
		this.#releaseTimer = this.#timers.setTimeout(() => {
			this.#releaseTimer = null;
			this.#apply({ type: 'release', heldMs });
		}, this.#releaseTailMs);
	}

	/** Push-to-talk or hands-free (remembered; switches a live call too). */
	setMode(mode: VoiceMode): void {
		if (mode === this.mode) return;
		this.#cancelTail();
		this.keyDown = false;
		this.mode = mode;
		this.#preferences.set(VOICE_MODE_PREFERENCE, mode);
		this.#apply({ type: 'mode', mode });
	}

	/** Hands-free: mutes or opens the mic. */
	toggleMute(): void {
		this.muted = !this.muted;
		this.#apply({ type: 'mute', muted: this.muted });
	}

	/** Chooses the realtime model (remembered; used from the next call). */
	setModel(id: string): void {
		if (!REALTIME_MODELS.some((m) => m.id === id) || id === this.model) return;
		this.model = id;
		this.#preferences.set(VOICE_MODEL_PREFERENCE, id);
	}

	/** Hangs up. A request already with Claude carries on in the conversation. */
	disconnect(): void {
		this.#cancelTail();
		this.keyDown = false;
		this.#connecting?.abort();
		this.#connecting = null;
		const link = this.#link;
		this.#link = null;
		link?.close();
		this.microphone = null;
		this.muted = false;
		this.#apply({ type: 'closed' });
	}

	/** Clears a problem or a hint the strip shows. */
	dismiss(): void {
		this.#apply({ type: 'dismiss' });
	}

	/** Hangs up and lets go of the conductor. */
	dispose(): void {
		if (this.#disposed) return;
		this.disconnect();
		this.#disposed = true;
		this.#bridge.dispose();
		this.#watchers.clear();
	}

	// ─── internals ────────────────────────────────────────────────────────────────────────────

	/** What the user said, for the bridge's approval check. */
	readonly #evidence: SpokenEvidence = {
		turns: () => this.#state.turnCount,
		answerSince: (since, waitMs) => {
			const latest = () => {
				const turns = this.#state.turns;
				for (let i = turns.length - 1; i >= 0; i--) if (turns[i].index > since) return turns[i];
				return null;
			};
			const turn = latest();
			if (!turn) return Promise.resolve(null);
			if (turn.transcript !== null) return Promise.resolve(turn.transcript);
			return new Promise((resolve) => {
				const finish = (text: string) => {
					this.#timers.clearTimeout(handle);
					this.#watchers.delete(watch);
					resolve(text);
				};
				const watch = () => {
					const now = latest();
					if (now && now.transcript !== null) finish(now.transcript);
				};
				const handle = this.#timers.setTimeout(() => finish(latest()?.transcript ?? ''), waitMs);
				this.#watchers.add(watch);
			});
		}
	};

	/** Applies inputs one at a time (an input may lead to another while it is applied). */
	#apply(input: VoiceInput): void {
		this.#queue.push(input);
		if (this.#applying) return;
		this.#applying = true;
		try {
			for (let next = this.#queue.shift(); next; next = this.#queue.shift()) this.#step(next);
		} finally {
			this.#applying = false;
		}
	}

	#step(input: VoiceInput): void {
		const step = stepVoice(this.#state, input);
		this.#state = step.state;
		const link = this.#link;
		for (const event of step.send) link?.send(event);
		link?.setMic(step.mic);
		if (step.lines.length > 0) {
			const conductor = this.#conductor();
			for (const line of step.lines) conductor?.voiceLine(line);
		}
		for (const call of step.run) void this.#run(call);
		const s = this.#state;
		this.phase = phaseOf(s);
		this.hint = s.hint;
		this.problem = s.problem;
		this.usd = realtimeCost(this.model, s.tokens);
		for (const watch of [...this.#watchers]) watch();
	}

	async #run(call: FunctionCall): Promise<void> {
		let result: VoiceToolResult;
		try {
			result = await this.#bridge.handle(parseToolCall(call.name, call.arguments));
		} catch (error) {
			result = {
				status: 'error',
				message: error instanceof Error ? error.message : 'The request failed.'
			};
		}
		this.#apply({ type: 'result', callId: call.callId, output: toolOutput(result) });
	}

	#announce(result: VoiceToolResult): void {
		this.#apply({ type: 'announce', text: updateNote(result) });
	}

	/** The call dropped by itself. */
	#lost(problem: VoiceProblem): void {
		this.#cancelTail();
		this.keyDown = false;
		this.#link = null;
		this.microphone = null;
		this.#apply({ type: 'closed', problem });
	}

	#cancelTail(): void {
		if (this.#releaseTimer === null) return;
		this.#timers.clearTimeout(this.#releaseTimer);
		this.#releaseTimer = null;
	}
}
