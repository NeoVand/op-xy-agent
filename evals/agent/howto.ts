/**
 * The how-to eval (Phase F4): the agent is asked how to reach a page or set a parameter, to show it
 * on the replica, and to set a sound up from an idea. The replica here is a real ReplicaState whose
 * events drive the simulator, as in the app, so `plan_steps` with show leaves the virtual OP-XY
 * where it led;
 * we check the steps the agent gave, the tools it used and the values it left. Real API calls with
 * the owner's key.
 *
 *   node evals/agent/howto.mjs [--ids cutoff,tempo] [--model claude-sonnet-5]
 */
import { createAnthropicClient } from '$lib/agent/client';
import { Conductor } from '$lib/agent/conductor.svelte';
import { loadManualSource } from '$lib/agent/manual-source';
import { createMemoryThreadStore } from '$lib/agent/threads';
import type { ScreenReader } from '$lib/agent/tools';
import { createVirtualOpxy } from '$lib/app/virtual';
import { ReplicaState } from '$lib/replica';
import { buildFrame } from '$lib/sim/frames';
import { planSettings, playStep } from '$lib/sim/navigator';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { PLAY_MODES, shown, type SimState } from '$lib/sim/params';
import { describeFrame } from '$lib/sim/screen/render';
import { anthropicKey } from './key';

/** What a case can look at afterwards. */
interface Outcome {
	readonly state: SimState;
	readonly answer: string;
	readonly tools: readonly { readonly name: string; readonly input: unknown }[];
}

interface HowtoCase {
	readonly id: string;
	readonly prompt: string;
	/** Where the replica stands when the user asks (a new project otherwise). */
	setup?(sim: OpxySim): void;
	/** Failures in words (empty: passed). */
	check(o: Outcome): string[];
}

const used = (o: Outcome, name: string) => o.tools.some((t) => t.name === name);
/** plan_steps called with show: the steps were animated on the replica. */
const showed = (o: Outcome) =>
	o.tools.some((t) => t.name === 'plan_steps' && (t.input as { show?: boolean }).show === true);
const mentions = (o: Outcome, ...words: string[]) =>
	words.filter((w) => !o.answer.toLowerCase().includes(w.toLowerCase()));

/** Presses on the simulator, in the key grammar of the navigator's steps. */
function press(sim: OpxySim, ...steps: string[]) {
	for (const keys of steps) playStep(sim, { keys });
}

const CASES: readonly HowtoCase[] = [
	{
		id: 'cutoff',
		prompt: 'How do I set the filter cutoff on track 3 to 40?',
		check(o) {
			const fails: string[] = [];
			if (!used(o, 'plan_steps')) fails.push('did not plan the steps');
			for (const w of mentions(o, 'T3', 'M3', 'E1', '40')) fails.push(`answer lacks "${w}"`);
			return fails;
		}
	},
	{
		id: 'release',
		prompt:
			'On track 2, I want the notes to stop the moment I let go of the keys. What do I turn, and which way?',
		check(o) {
			const fails: string[] = [];
			for (const w of mentions(o, 'M2', 'E4')) fails.push(`answer lacks "${w}"`);
			if (!/clockwise|right/i.test(o.answer) || /counter-?clockwise.*short/i.test(o.answer)) {
				fails.push('does not say clockwise (a higher release is shorter)');
			}
			return fails;
		}
	},
	{
		id: 'tempo',
		prompt: 'Show me on the replica how to set the tempo to 96.',
		check(o) {
			const fails: string[] = [];
			if (!showed(o)) fails.push('did not show it on the replica');
			if (o.state.tempo.bpm !== 96) fails.push(`the virtual OP-XY is at ${o.state.tempo.bpm} bpm`);
			return fails;
		}
	},
	{
		id: 'slow-filter',
		prompt:
			'Set up track 3 on the virtual OP-XY so its filter opens slowly on every note: filter envelope attack around 70 and filter envelope amount 50. Then tell me the steps so I can do it on my own OP-XY.',
		check(o) {
			const fails: string[] = [];
			const t = o.state.tracks[2];
			if (Math.abs(shown(t.filterEnv.attack) - 70) > 3) {
				fails.push(`filter attack reads ${shown(t.filterEnv.attack)}`);
			}
			if (Math.abs(t.filter.envAmount - 50) > 3) fails.push(`env amount ${t.filter.envAmount}`);
			for (const w of mentions(o, 'M2', 'M3')) fails.push(`answer lacks "${w}"`);
			return fails;
		}
	},
	{
		id: 'duck',
		prompt:
			'Make the bass on track 3 pump with the kick on track 1, like sidechain compression. Set it up on the virtual OP-XY, then tell me how to do it on my own unit.',
		check(o) {
			const fails: string[] = [];
			const lfo = o.state.tracks[2].lfo;
			if (lfo.type !== 'duck' || !lfo.on) fails.push(`lfo is ${lfo.type}${lfo.on ? '' : ' (off)'}`);
			if (lfo.source !== 1) fails.push(`duck source ${lfo.source}`);
			if (lfo.amount < 30) fails.push(`amount only ${lfo.amount}`);
			if (!showed(o)) fails.push('changed nothing on the virtual OP-XY');
			for (const w of mentions(o, 'M4', 'shift + M4')) fails.push(`answer lacks "${w}"`);
			return fails;
		}
	},
	{
		id: 'acid',
		prompt:
			'Turn track 3 into a squelchy acid bass on the virtual OP-XY: the classic resonant filter snap, and notes that slide.',
		check(o) {
			const fails: string[] = [];
			const t = o.state.tracks[2];
			if (!t.filter.on) fails.push('the filter is off');
			if (shown(t.filter.resonance) < 45) fails.push(`resonance ${shown(t.filter.resonance)}`);
			if (t.filter.envAmount < 30) fails.push(`env amount ${t.filter.envAmount}`);
			if (PLAY_MODES[t.playMode.mode] === 'poly') fails.push('still poly: nothing slides');
			if (t.playMode.portamento <= 0) fails.push('no portamento');
			if (!showed(o)) fails.push('changed nothing on the virtual OP-XY');
			return fails;
		}
	},
	{
		id: 'reverb',
		prompt:
			'Give everything more space on the virtual OP-XY: make the reverb on FX II bigger, size about 85, and send more of track 7 to it, about 60.',
		check(o) {
			const fails: string[] = [];
			const size = shown(o.state.areas.auxiliary.fx[1].params[0]);
			if (Math.abs(size - 85) > 3) fails.push(`FX II size ${size}`);
			const send = shown(o.state.tracks[6].sends[3]);
			if (Math.abs(send - 60) > 3) fails.push(`track 7 sends ${send} to FX II`);
			if (!showed(o)) fails.push('changed nothing on the virtual OP-XY');
			return fails;
		}
	},
	{
		id: 'mix',
		prompt:
			'In the mix, bring track 2 down to about 40 and pan it a little to the left. Set it on the virtual OP-XY and tell me the keys.',
		check(o) {
			const fails: string[] = [];
			const { level, pan } = o.state.tracks[1].mix;
			if (Math.abs(level - 40) > 4) fails.push(`track 2 level ${Math.round(level)}`);
			if (pan >= 0) fails.push(`pan ${pan}`);
			if (!showed(o)) fails.push('changed nothing on the virtual OP-XY');
			for (const w of mentions(o, 'mix', 'T2')) fails.push(`answer lacks "${w}"`);
			return fails;
		}
	},
	{
		id: 'screen-off',
		prompt:
			'There is a box on my screen that just says "off". What does it mean, and how do I get rid of it?',
		setup: (sim) => press(sim, 'T5', 'M3'),
		check(o) {
			const fails: string[] = [];
			if (!used(o, 'read_screen')) fails.push('did not look at the screen');
			for (const w of mentions(o, 'filter', 'M3')) fails.push(`answer lacks "${w}"`);
			return fails;
		}
	},
	{
		id: 'screen-page',
		prompt: 'What is this page on my screen, and what is it doing to my sound?',
		setup(sim) {
			const plan = planSettings(sim.state, [
				{ track: 3, param: 'lfo type', value: 'duck' },
				{ track: 3, param: 'duck source', value: 'metronome' },
				{ track: 3, param: 'lfo amount', value: 60 }
			]);
			for (const step of plan.steps) playStep(sim, step);
		},
		check(o) {
			const fails: string[] = [];
			if (!used(o, 'read_screen')) fails.push('did not look at the screen');
			for (const w of mentions(o, 'duck', 'metronome')) fails.push(`answer lacks "${w}"`);
			return fails;
		}
	},
	{
		id: 'screen-lost',
		prompt:
			'I pressed something and now my screen shows a bunch of tilted panels on a grid. What is this, and how do I get back to the filter of track 3?',
		setup: (sim) => press(sim, 'mix', 'M2'),
		check(o) {
			const fails: string[] = [];
			if (!used(o, 'read_screen')) fails.push('did not look at the screen');
			if (!/\beq\b/i.test(o.answer)) fails.push('does not say it is the master EQ');
			for (const w of mentions(o, 'instrument', 'T3', 'M3')) fails.push(`answer lacks "${w}"`);
			return fails;
		}
	},
	{
		id: 'pluck',
		prompt:
			'I want a plucky bass on track 3: a short decay, no sustain and a bit more resonance. Set it up for me on the virtual OP-XY and tell me what you changed.',
		check(o) {
			const fails: string[] = [];
			const t = o.state.tracks[2];
			if (shown(t.amp.sustain) > 15) fails.push(`amp sustain still ${shown(t.amp.sustain)}`);
			if (shown(t.amp.decay) > 50) fails.push(`amp decay still ${shown(t.amp.decay)}`);
			if (shown(t.filter.resonance) <= 10) fails.push(`resonance ${shown(t.filter.resonance)}`);
			if (!showed(o)) fails.push('changed nothing on the virtual OP-XY');
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
}

async function runCase(c: HowtoCase, model: string, apiKey: string): Promise<CaseResult> {
	const sim = new OpxySim();
	c.setup?.(sim);
	// the app's wiring: every replica event, the agent's animations included, reaches the simulator
	const replica = new ReplicaState();
	replica.observe((event) => sim.input(event));
	const virtual = createVirtualOpxy({ sim });
	const screen: ScreenReader = {
		read() {
			const s = sim.state;
			const frame = buildFrame(s);
			return {
				page: frame.page,
				shows: describeFrame(frame),
				mode: s.mode,
				overlay: s.overlay,
				modulePage: s.overlay === null && s.mode !== 'arrange' ? s.pages[s.mode] : null,
				track: s.track + 1,
				engine: s.tracks[s.track].engine,
				shift: s.shift,
				bpm: s.tempo.bpm,
				playing: s.transport.playing
			};
		}
	};
	const conductor = await Conductor.create({
		client: createAnthropicClient({ apiKey }),
		device: null,
		replica,
		screen,
		virtual,
		manual: await loadManualSource({ dev: false }),
		store: createMemoryThreadStore(),
		autoApprove: true,
		confirmWindowMs: 0,
		model
	});
	const tools: { name: string; input: unknown }[] = [];
	conductor.on((event) => {
		if (event.type === 'tool_start') tools.push({ name: event.name, input: event.input });
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
	if (process.env.HOWTO_DEBUG) {
		for (const e of conductor.entries)
			console.log('entry', e.kind, JSON.stringify(e).slice(0, 300));
	}
	const outcome: Outcome = { state: sim.state, answer, tools };
	return {
		id: c.id,
		fails: error ? [`error: ${error}`] : c.check(outcome),
		tools: tools.map((t) => t.name),
		usd: conductor.usage.usd,
		seconds: (performance.now() - started) / 1000,
		answer
	};
}

export async function main(argv: readonly string[]): Promise<void> {
	const flag = (name: string) => {
		const i = argv.indexOf(name);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	const ids = flag('--ids')?.split(',');
	const model = flag('--model') ?? 'claude-opus-5-5';
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
		console.log(`     answer: ${r.answer.replace(/\s+/g, ' ').slice(0, 400)}`);
	}
	console.log(`\n${passed}/${cases.length} passed, $${usd.toFixed(3)} (${model})`);
}
