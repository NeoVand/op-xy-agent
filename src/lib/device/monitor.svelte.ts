// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/monitor.svelte.ts

/**
 * The MIDI monitor: the last few thousand messages in and out, described in OP-XY terms.
 *
 * A running MIDI clock alone is 48 messages a second at 120 BPM, so events land in a plain ring
 * buffer and the reactive `version` is bumped at most once per animation frame; a UI that re-renders
 * per message would melt. Rows are described once, when they arrive (label, hex, echo flag), and
 * GREET replies never show their payload because it carries the unit's serial numbers.
 *
 * Fixed from MIDI Lab's monitor: no unbounded rate window, no `splice` per message once full, no
 * start on import, and the frame is requested on demand rather than kept spinning.
 */
import type { Direction, MidiEvent, MidiEventSource, MidiBus } from '$lib/core/midi/bus';
import { ch1, family, type MessageFamily } from '$lib/core/midi/messages';
import { detailFor, displayHex, labelFor } from './describe';
import { RingBuffer } from './ring';
import type { FrameScheduler } from './types';

/** One monitor line. */
export interface MonitorRow {
	/** The bus event id (unique, increasing). */
	readonly id: number;
	/** `performance.now()` domain, ms. */
	readonly time: number;
	readonly direction: Direction;
	readonly source: MidiEventSource;
	readonly cause: string | null;
	readonly family: MessageFamily;
	/** Clock or active sensing: hidden unless asked for. */
	readonly timing: boolean;
	/** Human channel 1–16, or null. */
	readonly channel: number | null;
	/** Bytes as hex, shortened; GREET payloads hidden. */
	readonly hex: string;
	/** One-line description. */
	readonly label: string;
	/** An incoming copy of something we just sent. */
	readonly echo: boolean;
}

/** Which directions to show. */
export type DirectionFilter = 'all' | 'in' | 'out';

/** Constructor options. */
export interface MidiMonitorOptions {
	readonly bus: MidiBus;
	readonly frames: FrameScheduler;
	/** The transport's `isEcho`. */
	readonly isEcho?: (event: MidiEvent) => boolean;
	/** Events kept (default 2000). */
	readonly capacity?: number;
	/** Rows `rows` returns at most (default 250), so the list stays cheap to render. */
	readonly visible?: number;
}

interface Entry {
	readonly row: MonitorRow;
	readonly event: MidiEvent;
}

/** Reactive MIDI monitor. Call `start()` to follow the bus. */
export class MidiMonitor {
	/** Bumped once per animation frame after new events arrived; read by `rows`. */
	version = $state(0);
	/** Hide clock (F8) and active sensing. On by default: the OP-XY's clock never stops. */
	hideClock = $state(true);
	/** Which directions to show. */
	direction: DirectionFilter = $state('all');
	/** Case-insensitive text filter over label, hex and source. */
	search = $state('');
	/** While paused, arriving events are counted but not kept. */
	paused = $state(false);
	/** Events seen since start or `clear` (updated once per frame). */
	total = $state(0);

	readonly capacity: number;
	readonly visible: number;
	readonly #bus: MidiBus;
	readonly #frames: FrameScheduler;
	readonly #isEcho: (event: MidiEvent) => boolean;
	readonly #buffer: RingBuffer<Entry>;
	#seen = 0;
	#frame: unknown = null;
	#unsubscribe: (() => void) | null = null;

	constructor(options: MidiMonitorOptions) {
		this.#bus = options.bus;
		this.#frames = options.frames;
		this.#isEcho = options.isEcho ?? (() => false);
		this.capacity = options.capacity ?? 2000;
		this.visible = options.visible ?? 250;
		this.#buffer = new RingBuffer<Entry>(this.capacity);
	}

	/** Starts following the bus. Idempotent; returns the stop function. */
	start(): () => void {
		this.#unsubscribe ??= this.#bus.subscribe((event) => this.#ingest(event));
		return () => this.stop();
	}

	/** Stops following the bus and cancels a pending frame (the buffer is kept). */
	stop(): void {
		this.#unsubscribe?.();
		this.#unsubscribe = null;
		if (this.#frame !== null) this.#frames.cancel(this.#frame);
		this.#frame = null;
	}

	/** Empties the buffer and the counter. */
	clear(): void {
		this.#buffer.clear();
		this.#seen = 0;
		this.total = 0;
		this.version++;
	}

	/** Events currently held. */
	get size(): number {
		void this.version;
		return this.#buffer.size;
	}

	/** Matching rows, newest first, at most `visible`. Reactive through `version` and the filters. */
	get rows(): MonitorRow[] {
		void this.version;
		const query = this.search.trim().toLowerCase();
		const out: MonitorRow[] = [];
		for (const { row } of this.#buffer.newestFirst()) {
			if (this.hideClock && row.timing) continue;
			if (this.direction !== 'all' && row.direction !== this.direction) continue;
			if (query && !`${row.label} ${row.hex} ${row.source}`.toLowerCase().includes(query)) continue;
			out.push(row);
			if (out.length >= this.visible) break;
		}
		return out;
	}

	/** The full sentence for a row (GREET metadata redacted), or null when it scrolled away. */
	detail(id: number): string | null {
		for (const { row, event } of this.#buffer.newestFirst()) {
			if (row.id === id) return detailFor(event.message, event.bytes);
		}
		return null;
	}

	#ingest(event: MidiEvent): void {
		this.#seen++;
		if (!this.paused) {
			const { message } = event;
			this.#buffer.push({
				event,
				row: {
					id: event.id,
					time: event.time,
					direction: event.direction,
					source: event.source,
					cause: event.cause ?? null,
					family: family(message),
					timing: message.type === 'clock' || message.type === 'activeSensing',
					channel: ch1(message),
					hex: displayHex(event.bytes),
					label: labelFor(message, event.bytes),
					echo: this.#isEcho(event)
				}
			});
		}
		this.#frame ??= this.#frames.request(this.#flush);
	}

	#flush = (): void => {
		this.#frame = null;
		this.total = this.#seen;
		this.version++;
	};
}
