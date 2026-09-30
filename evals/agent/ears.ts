/**
 * A check of the eval's ears without the model: programs a beat on the replica with the agent's own
 * tools (a made kit on T1, drums, a bass line, chords), plays it, and prints what `listen` and
 * `listen_tracks` hand the agent, as the quality eval's agent would read it, then what a lab program
 * hears of two forks through the same ears, and a held bass ducked on every beat (its pump). No API
 * calls.
 *
 *   node evals/agent/ears.mjs [--stand-ins]   (--stand-ins: the replica's own kit, no made kit)
 */
import { createVirtualOpxy } from '$lib/app/virtual';
import { createNodeLabHost } from '$lib/agent/lab/node';
import { NO_MANUAL } from '$lib/agent/manual-source';
import type { AgentEnvironment, AnyTool, ToolResult } from '$lib/agent/tools/define';
import { listenTool, listenTracksTool } from '$lib/agent/tools/listen';
import { makeKitTool } from '$lib/agent/tools/presets';
import { writePatternTool } from '$lib/agent/tools/virtual';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { DUCK_METRONOME } from '$lib/sim/params';
import type { SampleData } from '$lib/sound/samples';
import { openEars } from './render';

const realTimers = {
	now: () => Date.now(),
	setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
	clearTimeout: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>)
};

export async function main(argv: readonly string[]): Promise<void> {
	const url = process.env.EVAL_EARS_URL;
	if (!url) throw new Error('run it with node evals/agent/ears.mjs');
	const ears = await openEars(url);
	try {
		const sim = new OpxySim();
		const files = new Map<string, SampleData>();
		const virtual = createVirtualOpxy({
			sim,
			sound: {
				available: true,
				enabled: true,
				preview: () => true,
				samples: { setFile: (id, audio) => void files.set(id, audio) }
			}
		});
		const env = {
			device: null,
			replica: null,
			virtual,
			listen: ears.host(sim, files),
			manual: NO_MANUAL,
			timers: realTimers,
			confirmWindowMs: 0,
			plan: { get: () => [], set: () => {} },
			abortDeviceWork: () => {}
		} as unknown as AgentEnvironment;
		const run = (tool: AnyTool, input: unknown): Promise<ToolResult> =>
			tool.run(tool.input.parse(input), {
				toolCallId: `toolu_${tool.name}`,
				agent: 'conductor',
				signal: new AbortController().signal,
				env
			});
		const say = (label: string, result: ToolResult) =>
			console.log(`\n── ${label} (${result.summary})\n${String(result.content).slice(0, 2400)}`);

		if (!argv.includes('--stand-ins')) {
			say('make_kit', await run(makeKitTool, { name: 'ears', style: '909', track: 1, voices: [] }));
		}
		const four = [1, 5, 9, 13];
		say(
			'write_pattern T1',
			await run(writePatternTool, {
				track: 1,
				pattern: 1,
				bars: 1,
				notes: [
					...four.map((step) => ({ step, note: 53, velocity: 110 })),
					...[5, 13].map((step) => ({ step, note: 55, velocity: 100 })),
					...[3, 7, 11, 15].map((step) => ({ step, note: 61, velocity: 80 }))
				]
			})
		);
		say(
			'write_pattern T3',
			await run(writePatternTool, {
				track: 3,
				pattern: 1,
				bars: 1,
				notes: [1, 4, 7, 11, 13].map((step, i) => ({
					step,
					note: [41, 41, 44, 39, 41][i],
					length: 2
				}))
			})
		);
		say(
			'write_pattern T7',
			await run(writePatternTool, {
				track: 7,
				pattern: 1,
				bars: 1,
				notes: [65, 68, 72].map((note) => ({ step: 1, note, length: 16, velocity: 80 }))
			})
		);
		virtual.setTempo(124);
		virtual.transport('play');
		say('listen', await run(listenTool, { seconds: 4 }));
		say('listen_tracks', await run(listenTracksTool, {}));

		// the lab hears its forks through the same ears, offline: the bass at two cutoffs, alone
		const lab = createNodeLabHost({ sim, render: ears.renderer(files) });
		const { result } = await lab.run(
			[
				'const tries = [];',
				'for (const cutoff of [10, 70]) {',
				'	const f = lab.fork();',
				'	f.set({ track: 3, param: "cutoff", value: cutoff });',
				'	const heard = await lab.listen(f, { tracks: [3], seconds: 3 });',
				'	tries.push({ cutoff, centroidHz: heard.tracks[0].data.tone?.centroidHz });',
				'}',
				'return tries;'
			].join('\n'),
			{ signal: new AbortController().signal, timeoutMs: 60_000 }
		);
		console.log(
			`\n── lab: T3 at two cutoffs, heard offline (${result.ms} ms)\n${JSON.stringify(result.ok ? result.value : result.error)}`
		);

		// a pump: the bass held for the bar, ducked from the metronome (which fires with the click off
		// and with the other tracks muted), heard alone and in the mix
		await run(writePatternTool, {
			track: 3,
			pattern: 1,
			bars: 1,
			notes: [{ step: 1, note: 41, length: 16, velocity: 110 }]
		});
		Object.assign(sim.state.tracks[2].lfo, {
			type: 'duck',
			on: true,
			source: DUCK_METRONOME,
			amount: 80,
			hold: 10,
			release: 45
		});
		virtual.setMetronome(false);
		say('listen, the bass ducked', await run(listenTool, { seconds: 4, focus: 'mix' }));
		say('listen_tracks, the bass ducked', await run(listenTracksTool, { tracks: [3] }));
	} finally {
		await ears.close();
	}
}
