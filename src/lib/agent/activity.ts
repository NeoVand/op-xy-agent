/**
 * What the agent is doing right now, in words, for the live status line under the conversation:
 * "reading the manual and thinking", "calling set tempo", "manual expert / search manual “shift
 * M1”", "writing / 42 words", "waiting for your approval". A pure reducer over the event stream and
 * the chat it has just updated, so the conductor exposes it as one reactive value and tests check it
 * without a DOM. Also here: short summaries of tool inputs, shared with the tool chips.
 */
import { agentLabel, parentOf } from './agent-names';
import type { ChatEntry } from './chat';
import type { AgentEvent } from './types';

/** The kind of work in progress. */
export type ActivityPhase = 'thinking' | 'tool' | 'subagent' | 'writing' | 'approval';

/** What the agent is doing right now. */
export interface Activity {
	readonly phase: ActivityPhase;
	/** The main words, lowercase: "thinking", "calling set tempo", "manual expert", "writing". */
	readonly label: string;
	/** What exactly, or '': the latest progress note, a tool's input, a subagent's step, a word count. */
	readonly detail: string;
	/** Epoch ms when this phase began; the status line counts from here. */
	readonly since: number;
	/** What the phase is about (a tool call, a text block…); a new key restarts the clock. */
	readonly key: string;
	/** A change is being written to the device (the LED turns red, as on the chips). */
	readonly writes: boolean;
}

/** What {@link nextActivity} needs besides the event. */
export interface ActivityContext {
	/** Epoch ms. */
	readonly now: number;
	/** Nothing answered yet in this conversation: the first model call still reads the manual. */
	readonly firstTurn: boolean;
}

type ToolEntry = Extract<ChatEntry, { kind: 'tool' }>;

/** Longest input summary in characters (the UI ellipsises further when it has less room). */
const SUMMARY_CHARS = 72;

function clip(text: string, max = SUMMARY_CHARS): string {
	const line = text.replace(/\s+/g, ' ').trim();
	return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

function field(input: unknown, key: string): unknown {
	return input !== null && typeof input === 'object'
		? (input as Record<string, unknown>)[key]
		: undefined;
}

function plural(n: number, word: string): string {
	return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * A short summary of a tool call's input for chips and the status line ("shift + M1", "“shift
 * M1”", "96 bpm", "track 2 mute"); '' when there is nothing worth showing. Accepts partial input
 * (a call still being written).
 */
export function inputSummary(name: string, input: unknown): string {
	const text = (key: string) => {
		const value = field(input, key);
		return typeof value === 'string' ? value : null;
	};
	const count = (key: string) => {
		const value = field(input, key);
		return typeof value === 'number' ? value : null;
	};
	const track = count('track');
	switch (name) {
		case 'show_on_replica':
			return clip(text('keys') ?? '');
		case 'search_manual': {
			const query = text('query');
			return query ? `“${clip(query, SUMMARY_CHARS - 2)}”` : '';
		}
		case 'read_manual_unit':
			return clip(text('id') ?? '');
		case 'set_tempo': {
			const bpm = count('bpm');
			return bpm === null ? '' : `${bpm} bpm`;
		}
		case 'select_track':
			return track === null ? '' : `track ${track}`;
		case 'mute_track': {
			const muted = field(input, 'muted');
			if (track === null) return '';
			return typeof muted === 'boolean'
				? `track ${track} ${muted ? 'mute' : 'unmute'}`
				: `track ${track}`;
		}
		case 'transport':
			return text('action') ?? '';
		case 'play_notes': {
			const steps = field(input, 'steps');
			const n = Array.isArray(steps) ? steps.length : 0;
			return track === null ? '' : `track ${track}${n > 0 ? `, ${plural(n, 'step')}` : ''}`;
		}
		case 'write_todos': {
			const todos = field(input, 'todos');
			return Array.isArray(todos) && todos.length > 0 ? plural(todos.length, 'step') : '';
		}
		case 'task':
			return clip(text('description') ?? '');
		case 'listen': {
			const seconds = count('seconds');
			const focus = text('focus');
			return [seconds === null ? '' : `${seconds} s`, focus && focus !== 'all' ? focus : '']
				.filter(Boolean)
				.join(', ');
		}
		case 'listen_tracks': {
			const tracks = field(input, 'tracks');
			return Array.isArray(tracks) && tracks.length > 0
				? `tracks ${tracks.filter((t) => typeof t === 'number').join(', ')}`
				: '';
		}
		case 'device_status':
		case 'panic':
			return '';
		default: {
			// A tool this list does not know yet: its first short scalar value.
			if (input === null || typeof input !== 'object') return '';
			for (const value of Object.values(input)) {
				if (['string', 'number', 'boolean'].includes(typeof value)) return clip(String(value));
			}
			return '';
		}
	}
}

/** Words in a text (whitespace-separated runs), without allocating: runs on every streamed delta. */
export function countWords(text: string): number {
	let words = 0;
	let inWord = false;
	for (let i = 0; i < text.length; i++) {
		const space = text.charCodeAt(i) <= 32;
		if (!space && !inWord) words++;
		inWord = !space;
	}
	return words;
}

/** The last non-empty line of a text, trimmed; '' when there is none. */
export function lastLine(text: string): string {
	let end = text.length;
	while (end > 0) {
		const start = text.lastIndexOf('\n', end - 1) + 1;
		const line = text.slice(start, end).trim();
		if (line) return line;
		end = start - 1;
	}
	return '';
}

/** Elapsed time for the status line: `4.2s` under a minute, then `1m 05s`. */
export function formatElapsed(ms: number): string {
	const seconds = Math.max(0, ms) / 1000;
	if (seconds < 59.95) return `${seconds.toFixed(1)}s`; // 59.96 would round to "60.0s"
	const whole = Math.max(60, Math.floor(seconds));
	return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`;
}

function thinkingLabel(firstTurn: boolean): string {
	return firstTurn ? 'reading the manual and thinking' : 'thinking';
}

/** The activity when a run starts, before the first event arrives. */
export function startActivity(now: number, firstTurn: boolean): Activity {
	return {
		phase: 'thinking',
		label: thinkingLabel(firstTurn),
		detail: '',
		since: now,
		key: 'thinking',
		writes: false
	};
}

function find<K extends ChatEntry['kind']>(
	entries: readonly ChatEntry[],
	kind: K,
	id: string
): Extract<ChatEntry, { kind: K }> | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.kind === kind && entry.id === id) return entry as Extract<ChatEntry, { kind: K }>;
	}
	return undefined;
}

function isActive(entry: ChatEntry): entry is ToolEntry {
	return entry.kind === 'tool' && (entry.status === 'pending' || entry.status === 'running');
}

/** The display name of a subagent ("manual expert"). */
export function subagentLabel(agentOrType: string): string {
	return agentLabel(agentOrType).replace(/-/g, ' ');
}

/** What a subagent is doing, from the newest entry it produced under its task call. */
function subagentStep(entries: readonly ChatEntry[], task: string): string {
	let started = false;
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (!('parent' in entry) || entry.parent !== task) continue;
		started = true;
		if (entry.kind === 'text') return `writing ${plural(countWords(entry.text), 'word')}`;
		if (entry.kind === 'progress') {
			const note = lastLine(entry.text);
			if (note) return note;
			continue;
		}
		if (entry.kind === 'tool') {
			if (!isActive(entry)) return 'thinking';
			const summary = inputSummary(entry.name, entry.input);
			return summary ? `${entry.label} ${summary}` : entry.label;
		}
	}
	return started ? 'thinking' : 'reading the manual';
}

/**
 * The activity after one event (`entries` already include it), or `prev` when nothing visible
 * changed. Returns null once the conductor is done; tracks nothing while no run is active (`prev`
 * is null), so stray events outside a run (an undo's revision) never start the line.
 */
export function nextActivity(
	prev: Activity | null,
	event: AgentEvent,
	entries: readonly ChatEntry[],
	context: ActivityContext
): Activity | null {
	if (prev === null) return null;
	const make = (
		phase: ActivityPhase,
		label: string,
		detail: string,
		key: string,
		writes = false
	): Activity => {
		const same = prev.phase === phase && prev.key === key;
		if (same && prev.label === label && prev.detail === detail && prev.writes === writes) {
			return prev;
		}
		return { phase, label, detail, key, writes, since: same ? prev.since : context.now };
	};

	// Where the conductor stands with its tool calls: a running subagent first (the long one), then
	// the calls running, else the call the model is writing (the last pending one: earlier calls
	// of the same response are complete and wait for it).
	const fromTools = (): Activity => {
		const active = entries.filter((e): e is ToolEntry => isActive(e) && e.parent === null);
		const task = active.find((e) => e.name === 'task' && e.status === 'running');
		if (task) {
			const type = field(task.input, 'subagent_type');
			return make(
				'subagent',
				subagentLabel(typeof type === 'string' ? type : 'subagent'),
				subagentStep(entries, task.id),
				'subagent'
			);
		}
		const running = active.filter((e) => e.status === 'running');
		const first = running[0];
		if (first) {
			const more = running.length > 1 ? ` and ${running.length - 1} more` : '';
			return make(
				'tool',
				`calling ${first.label}${more}`,
				inputSummary(first.name, first.input),
				first.id,
				first.toolKind === 'mutate'
			);
		}
		const writing = active.at(-1);
		if (!writing) return make('thinking', 'thinking', '', 'thinking');
		return make(
			'tool',
			`preparing ${writing.label}`,
			inputSummary(writing.name, writing.input),
			writing.id
		);
	};

	switch (event.type) {
		case 'done':
			return event.agent === 'conductor' ? null : prev;
		case 'approval':
			return make(
				'approval',
				'waiting for your approval',
				clip(event.request.actions.map((a) => a.preview.label).join(', ')),
				event.request.id
			);
		case 'approval_resolved':
			return fromTools();
		case 'turn':
		case 'progress':
		case 'text':
		case 'tool_pending':
		case 'tool_input':
		case 'tool_start':
		case 'tool_end':
			break;
		default:
			// usage, citations, notices, errors (a `done` follows), plans, revisions: no change.
			return prev;
	}

	const task = parentOf(event.agent);
	if (task !== null) {
		// Subagent work shows under its own name while its task call runs.
		return make('subagent', subagentLabel(event.agent), subagentStep(entries, task), 'subagent');
	}
	switch (event.type) {
		case 'turn':
			return make('thinking', thinkingLabel(context.firstTurn), '', 'thinking');
		case 'progress': {
			const note = find(entries, 'progress', `${event.turn}:${event.block}:progress`);
			return make('thinking', 'thinking', note ? lastLine(note.text) : '', 'thinking');
		}
		case 'text': {
			const id = `${event.turn}:${event.block}`;
			const entry = find(entries, 'text', id);
			return make('writing', 'writing', plural(entry ? countWords(entry.text) : 0, 'word'), id);
		}
		default:
			return fromTools();
	}
}
