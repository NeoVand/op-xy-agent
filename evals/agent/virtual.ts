/**
 * The virtual OP-XY eval: with no device connected, the agent programs the replica's simulator from
 * a request in plain words (a beat, a chord progression, a two-scene song) and starts it; we check
 * the patterns, scenes and song it left, exactly. Real API calls with the owner's key.
 *
 *   node evals/agent/virtual.mjs [--ids beat,chords] [--model claude-sonnet-5]
 */
import { evalAgentModes } from './modes';
import { createAnthropicClient } from '$lib/agent/client';
import { Conductor } from '$lib/agent/conductor.svelte';
import { loadManualSource } from '$lib/agent/manual-source';
import { createMemoryThreadStore } from '$lib/agent/threads';
import { createVirtualOpxy } from '$lib/app/virtual';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { VirtualOpxy } from '$lib/agent/virtual-opxy';
import type { SampleInput } from '$lib/core/presets';
import { anthropicKey } from './key';

/** A kit make_kit left for the preset maker. */
interface Draft {
	readonly name: string;
	readonly samples: readonly SampleInput[];
}

/** A check on what the agent left; returns failures in words (empty: passed). */
type Check = (v: VirtualOpxy, drafts: readonly Draft[]) => string[];

interface VirtualCase {
	readonly id: string;
	readonly prompt: string;
	readonly check: Check;
}

const pitchClasses = (notes: readonly number[]) =>
	[...new Set(notes.map((n) => n % 12))].sort((a, b) => a - b);
const notesAt = (v: VirtualOpxy, track: number, step: number, pattern?: number) =>
	v.readPattern(track, pattern).notes.filter((n) => n.step === step);

/** A sound's pitch from its zero crossings between 0.15 s and 0.5 s (a kick's settled body). */
function pitchOf(sample: SampleInput): number {
	const x = sample.audio.channels[0];
	const sr = sample.audio.sampleRate;
	let crossings = 0;
	const from = Math.round(0.15 * sr);
	const to = Math.min(x.length, Math.round(0.5 * sr));
	for (let i = from + 1; i < to; i++) if (x[i - 1] < 0 !== x[i] < 0) crossings++;
	return crossings / 2 / ((to - from) / sr);
}

const CASES: readonly VirtualCase[] = [
	{
		id: 'kit',
		prompt:
			'Make me a dark, crushed lo-fi drum kit called "dust" with a long, deep kick at about 45 Hz.',
		check(_v, drafts) {
			const kit = drafts.at(-1);
			if (!kit) return ['no kit left in the preset maker'];
			const fails: string[] = [];
			if (kit.name !== 'dust') fails.push(`named "${kit.name}"`);
			const kick = kit.samples.find((s) => s.key === 53);
			if (!kick) fails.push('no sound on key 53 (kick)');
			else {
				const pitch = pitchOf(kick);
				if (pitch < 38 || pitch > 52) fails.push(`kick at ${pitch.toFixed(1)} Hz`);
				if (kick.audio.channels[0].length / kick.audio.sampleRate < 0.6) fails.push('a short kick');
			}
			if (kit.samples.length < 8) fails.push(`only ${kit.samples.length} sounds`);
			return fails;
		}
	},
	{
		id: 'beat',
		prompt:
			'Program a basic house beat on track 1: a kick on every quarter note and a snare on beats 2 and 4, one bar. Then play it.',
		check(v) {
			const fails: string[] = [];
			const p = v.readPattern(1);
			for (const step of [1, 5, 9, 13]) {
				if (!p.notes.some((n) => n.step === step && n.note === 53))
					fails.push(`no kick (53) on step ${step}`);
			}
			for (const step of [5, 13]) {
				if (!p.notes.some((n) => n.step === step && n.note !== 53))
					fails.push(`no snare on step ${step}`);
			}
			for (const step of [3, 7, 11, 15]) {
				if (p.notes.some((n) => n.step === step && n.note === 53))
					fails.push(`a kick on step ${step}`);
			}
			if (!v.status().playing) fails.push('not playing');
			return fails;
		}
	},
	{
		id: 'chords',
		prompt:
			'On track 4, program the chord progression C major, A minor, F major, G major: one chord per bar over four bars, each held for the whole bar. Then start playback.',
		check(v) {
			const fails: string[] = [];
			const p = v.readPattern(4);
			if (p.bars !== 4) fails.push(`${p.bars} bars, not 4`);
			const want: [number, number[]][] = [
				[1, [0, 4, 7]],
				[17, [0, 4, 9]],
				[33, [0, 5, 9]],
				[49, [2, 7, 11]]
			];
			for (const [step, classes] of want) {
				const chord = notesAt(v, 4, step);
				const got = pitchClasses(chord.map((n) => n.note));
				if (got.join() !== classes.join())
					fails.push(`step ${step}: pitch classes ${got.join()} not ${classes.join()}`);
				if (chord.some((n) => n.length < 12))
					fails.push(`step ${step}: a note shorter than most of the bar`);
			}
			if (!v.status().playing) fails.push('not playing');
			return fails;
		}
	},
	{
		id: 'song',
		prompt:
			'Make a small two-scene song. Scene 1: only a kick on every beat on track 1. Scene 2: the same kick plus a bass line on track 3 playing C2 on every eighth note. The song plays scene 1 twice, then scene 2 twice, and loops. Start it.',
		check(v) {
			const fails: string[] = [];
			const a = v.readArrangement();
			const scene = (n: number) => a.scenes.find((s) => s.scene === n);
			const s1 = scene(1);
			const s2 = scene(2);
			if (!s1 || !s2) return ['scenes 1 and 2 are not both set'];
			const bassIn = (patterns: readonly number[]) =>
				v.readPattern(3, patterns[2]).notes.filter((n) => n.note === 36).length;
			const kickIn = (patterns: readonly number[]) =>
				v.readPattern(1, patterns[0]).notes.filter((n) => n.note === 53).length;
			if (kickIn(s1.patterns) < 4) fails.push('scene 1 has no kick on every beat');
			if (kickIn(s2.patterns) < 4) fails.push('scene 2 has no kick on every beat');
			if (bassIn(s1.patterns) > 0) fails.push('scene 1 has the bass line');
			if (bassIn(s2.patterns) < 8) fails.push('scene 2 lacks C2 on every eighth');
			if (a.song.order.join() !== '1,1,2,2') fails.push(`song order ${a.song.order.join()}`);
			if (!a.song.loop) fails.push('the song does not loop');
			if (!v.status().playing) fails.push('not playing');
			return fails;
		}
	}
];

interface CaseResult {
	readonly id: string;
	readonly fails: readonly string[];
	readonly tools: readonly string[];
	readonly usd: number;
	readonly seconds: number;
	readonly answer: string;
	readonly error: string | null;
}

async function runCase(c: VirtualCase, model: string, apiKey: string): Promise<CaseResult> {
	const sim = new OpxySim();
	const virtual = createVirtualOpxy({ sim });
	const drafts: Draft[] = [];
	const conductor = await Conductor.create({
		...evalAgentModes(),
		client: createAnthropicClient({ apiKey }),
		device: null,
		replica: null,
		virtual,
		presets: { put: (draft) => drafts.push(draft), href: '/presets' },
		manual: await loadManualSource({ dev: false }),
		store: createMemoryThreadStore(),
		autoApprove: true,
		confirmWindowMs: 0,
		model
	});
	const tools: string[] = [];
	conductor.on((event) => {
		if (event.type === 'tool_start') tools.push(event.name);
	});
	const started = performance.now();
	let error: string | null = null;
	try {
		await conductor.send(c.prompt);
	} catch (e) {
		error = e instanceof Error ? e.message : String(e);
	}
	const answer = conductor.entries
		.filter((e) => e.kind === 'text' && e.parent === null)
		.map((e) => (e.kind === 'text' ? e.text : ''))
		.join('\n\n');
	return {
		id: c.id,
		fails: error
			? [`error: ${error}`]
			: conductor.lastError
				? [`agent error: ${conductor.lastError.code} ${conductor.lastError.message}`]
				: c.check(virtual, drafts),
		tools,
		usd: conductor.usage.usd,
		seconds: (performance.now() - started) / 1000,
		answer,
		error
	};
}

export async function main(argv: readonly string[]): Promise<void> {
	const flag = (name: string) => {
		const i = argv.indexOf(name);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	const ids = flag('--ids')?.split(',');
	const model = flag('--model') ?? 'claude-sonnet-5-5';
	const apiKey = anthropicKey();
	const cases = CASES.filter((c) => !ids || ids.includes(c.id));
	let passed = 0;
	let usd = 0;
	for (const c of cases) {
		const r = await runCase(c, model, apiKey);
		usd += r.usd;
		if (r.fails.length === 0) passed++;
		console.log(
			`${r.fails.length === 0 ? 'PASS' : 'FAIL'} ${r.id}  $${r.usd.toFixed(3)}  ${r.seconds.toFixed(0)} s  tools: ${r.tools.join(' → ')}`
		);
		for (const f of r.fails) console.log(`     - ${f}`);
		console.log(`     answer: ${r.answer.replace(/\s+/g, ' ').slice(0, 240)}`);
	}
	console.log(`\n${passed}/${cases.length} passed, $${usd.toFixed(3)} (${model})`);
}
