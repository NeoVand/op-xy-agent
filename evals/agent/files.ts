/**
 * The files eval: can the agent read what the user attaches and play it? Each case gives the
 * headless conductor (the app's code, auto-approving) a file and a request, the fake OP-XY plays
 * whatever it sends, and the notes it played (play_notes calls, in order) are compared with the
 * score: pitch accuracy by edit distance, rhythm accuracy on the aligned notes.
 *
 * Cases: three engraved scores of public-domain melodies (PNG, rendered from the ABC sources beside
 * them with Verovio, a key signature and eighth notes included) and one MIDI file built from a
 * melody. Started by `files.mjs` through Vite's SSR loader, like `run.ts`. A run costs about $1.
 *
 *   node evals/agent/files.mjs                 every case
 *   node evals/agent/files.mjs --ids ode-d     some of them
 *   node evals/agent/files.mjs --model claude-sonnet-5
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseNoteName } from '$lib/core/midi/notes';
import { writeMidiFile, type EventAtTick } from '$lib/core/midi/smf';
import { phrase } from '$lib/core/music/notation';
import { prepareAttachment, toBase64, type PreparedAttachment } from '$lib/agent/attachments';
import { createAnthropicClient } from '$lib/agent/client';
import { Conductor } from '$lib/agent/conductor.svelte';
import { loadManualSource } from '$lib/agent/manual-source';
import { DEFAULT_CONDUCTOR_MODEL } from '$lib/agent/models';
import { createMemoryThreadStore } from '$lib/agent/threads';
import { connectFakeDevice } from './fake-device';
import { anthropicKey } from './key';

const FIXTURES = join(process.cwd(), 'evals/agent/fixtures');

/** A note or rest as played or expected: pitches sounding together and a length in beats. */
interface Step {
	readonly notes: readonly number[];
	readonly beats: number;
}

interface FileCase {
	readonly id: string;
	readonly prompt: string;
	readonly file: () => Promise<PreparedAttachment>;
	/** The melody in `core/music/notation` (C4 = 60; durations in beats persist until changed). */
	readonly expected: string;
	/** Words the answer should use when it says what it read (key, meter), any of them. */
	readonly mentions?: readonly string[];
}

/** An attachment exactly as the app prepares a PNG that already fits (label + image block). */
function pngAttachment(name: string): () => Promise<PreparedAttachment> {
	return async () => {
		const bytes = readFileSync(join(FIXTURES, name));
		const width = bytes.readUInt32BE(16);
		const height = bytes.readUInt32BE(20);
		const data = toBase64(new Uint8Array(bytes));
		return {
			view: { id: name, kind: 'image', name, size: bytes.length, detail: `${width} × ${height}` },
			blocks: [
				{ type: 'text', text: `Image “${name}” (${width} × ${height} px):` },
				{ type: 'image', source: { type: 'base64', media_type: 'image/png', data } }
			],
			bytes: data.length
		};
	};
}

const ODE_C =
	'E4/1 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4/1.5 D4/.5 D4/2 | E4/1 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/1.5 C4/.5 C4/2';
const ODE_D =
	'F#4/1 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | F#4/1.5 E4/.5 E4/2 | F#4/1 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | E4/1.5 D4/.5 D4/2';
const JACQUES =
	'F4/1 G4 A4 F4 | F4 G4 A4 F4 | A4 Bb4 C5/2 | A4/1 Bb4 C5/2 | C5/.5 D5 C5 Bb4 A4/1 F4 | C5/.5 D5 C5 Bb4 A4/1 F4 | F4 C4 F4/2 | F4/1 C4 F4/2';

/** A MIDI file of a melody in notation (480 ticks per beat, 108 bpm), prepared like the app does. */
function midiAttachment(name: string, melody: string): () => Promise<PreparedAttachment> {
	return async () => {
		const events: EventAtTick[] = phrase(melody).flatMap((n) => [
			{
				tick: Math.round(n.start * 480),
				event: { type: 'noteOn', channel: 0, note: n.note, velocity: 90 }
			},
			{
				tick: Math.round((n.start + n.duration) * 480),
				event: { type: 'noteOff', channel: 0, note: n.note, velocity: 0 }
			}
		]);
		const bytes = writeMidiFile([{ name: 'Melody', events }], { bpm: 108 });
		return prepareAttachment(new File([new Uint8Array(bytes)], name, { type: 'audio/midi' }), name);
	};
}

const CASES: readonly FileCase[] = [
	{
		id: 'ode-c',
		prompt: 'Play this melody on track 3.',
		file: pngAttachment('ode-c.png'),
		expected: ODE_C,
		mentions: ['C major', '4/4']
	},
	{
		id: 'ode-d',
		prompt: 'Play this melody on track 3.',
		file: pngAttachment('ode-d.png'),
		expected: ODE_D,
		mentions: ['D major', 'F#', 'F♯']
	},
	{
		id: 'jacques-f',
		prompt: 'Play this on track 3.',
		file: pngAttachment('jacques-f.png'),
		expected: JACQUES,
		mentions: ['F major', 'B♭', 'Bb', 'B-flat', 'B flat']
	},
	{
		id: 'midi-jacques',
		prompt: 'Play the melody in this file on track 3.',
		file: midiAttachment('frere-jacques.mid', JACQUES),
		expected: JACQUES
	}
];

/** Steps from the notation at their written lengths (the scores have no rests). */
function expectedSteps(melody: string): Step[] {
	return phrase(melody, { gate: 1 }).map((n) => ({ notes: [n.note], beats: n.duration }));
}

/** What the agent played: every play_notes step in call order. */
function playedSteps(calls: readonly unknown[]): Step[] {
	const steps: Step[] = [];
	for (const input of calls) {
		const list = (input as { steps?: { notes: (number | string)[]; beats: number }[] }).steps ?? [];
		for (const step of list) {
			const notes = step.notes
				.map((n) => (typeof n === 'number' ? n : parseNoteName(n, 'c4')))
				.filter((n): n is number => n !== null);
			steps.push({ notes, beats: step.beats });
		}
	}
	return steps;
}

/** Levenshtein distance between two sequences. */
function distance<T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean): number {
	const row = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		let diagonal = row[0];
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const up = row[j];
			row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (same(a[i - 1], b[j - 1]) ? 0 : 1));
			diagonal = up;
		}
	}
	return row[b.length];
}

interface CaseResult {
	readonly id: string;
	readonly pitch: number;
	readonly rhythm: number | null;
	readonly played: number;
	readonly expected: number;
	readonly mentioned: boolean | null;
	readonly usd: number;
	readonly seconds: number;
	readonly answer: string;
	readonly error: string | null;
}

async function runCase(c: FileCase, model: string, apiKey: string): Promise<CaseResult> {
	const device = await connectFakeDevice();
	const conductor = await Conductor.create({
		client: createAnthropicClient({ apiKey }),
		device: device.stack,
		replica: null,
		manual: await loadManualSource({ dev: false }),
		store: createMemoryThreadStore(),
		autoApprove: true,
		confirmWindowMs: 150,
		model
	});
	const calls: unknown[] = [];
	conductor.on((event) => {
		if (event.type === 'tool_start' && event.name === 'play_notes') calls.push(event.input);
	});
	const started = performance.now();
	await conductor.send(c.prompt, [await c.file()]);
	const seconds = (performance.now() - started) / 1000;
	const answer = conductor.entries
		.filter((e) => e.kind === 'text' && e.parent === null)
		.map((e) => (e.kind === 'text' ? e.text : ''))
		.join('\n\n');
	const played = playedSteps(calls).filter((s) => s.notes.length > 0);
	const expected = expectedSteps(c.expected);
	const pitches = (steps: Step[]) => steps.map((s) => s.notes.join('+'));
	const pitchErrors = distance(pitches(played), pitches(expected), (a, b) => a === b);
	const aligned = played.length === expected.length;
	const rhythmHits = aligned
		? played.filter((s, i) => Math.abs(s.beats - expected[i].beats) < 0.02).length
		: 0;
	const result: CaseResult = {
		id: c.id,
		pitch: Math.max(0, 1 - pitchErrors / expected.length),
		rhythm: aligned ? rhythmHits / expected.length : null,
		played: played.length,
		expected: expected.length,
		mentioned: c.mentions ? c.mentions.some((m) => answer.includes(m)) : null,
		usd: conductor.usage.usd,
		seconds,
		answer,
		error: conductor.lastError?.message ?? null
	};
	conductor.dispose();
	await device.dispose();
	return result;
}

const percent = (x: number | null) =>
	x === null ? '  –  ' : `${Math.round(x * 100)}%`.padStart(5);

export async function main(argv: readonly string[]): Promise<void> {
	const get = (flag: string) => {
		const index = argv.indexOf(flag);
		return index >= 0 ? argv[index + 1] : undefined;
	};
	const ids = get('--ids')?.split(',') ?? null;
	const model = get('--model') ?? DEFAULT_CONDUCTOR_MODEL;
	const apiKey = anthropicKey();
	const cases = CASES.filter((c) => !ids || ids.includes(c.id));
	console.log(`files eval · ${model} · ${cases.length} case${cases.length === 1 ? '' : 's'}\n`);
	const results: CaseResult[] = [];
	for (const c of cases) {
		const result = await runCase(c, model, apiKey);
		results.push(result);
		console.log(
			`${result.id.padEnd(14)} pitch ${percent(result.pitch)}  rhythm ${percent(result.rhythm)}  notes ${String(result.played).padStart(2)}/${result.expected}  read-out ${result.mentioned === null ? '–' : result.mentioned ? 'yes' : 'no'}  $${result.usd.toFixed(3)}  ${result.seconds.toFixed(0)}s${result.error ? `  error: ${result.error}` : ''}`
		);
		console.log(`  ${result.answer.replace(/\s+/g, ' ').slice(0, 400)}\n`);
	}
	const total = results.reduce((sum, r) => sum + r.usd, 0);
	const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
	console.log(
		`mean pitch ${percent(mean(results.map((r) => r.pitch)))} · rhythm ${percent(mean(results.flatMap((r) => (r.rhythm === null ? [] : [r.rhythm]))))} · $${total.toFixed(2)}`
	);
}
