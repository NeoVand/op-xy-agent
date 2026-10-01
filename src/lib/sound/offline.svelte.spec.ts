// The replica's sound rendered offline in a real browser: a new project's beat on T1 (the stand-in
// kit, no sample files) and a bass on T3 through the synth core's worklet come back as audio, and a
// project with nothing playing comes back silent; the lab hears a fork with it end to end, and the
// listen tool hears one scene of a song looping, not the song's silent intro.
import { describe, expect, it } from 'vitest';
import { BrowserLabHost } from '$lib/agent/lab/host';
import { listenTool } from '$lib/agent/tools/listen';
import { NO_MANUAL } from '$lib/agent/manual-source';
import type { AgentEnvironment } from '$lib/agent/tools/define';
import { createVirtualOpxy } from '$lib/app/virtual';
import { analyzeAudio } from '$lib/core/listen';
import { snapshot } from '$lib/sim/areas/system/projects';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { renderOffline } from './offline';
import { SampleRegistry } from './samples';

const peak = (channels: readonly Float32Array[]) =>
	Math.max(...channels.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));

function playing(write: boolean) {
	const sim = new OpxySim({ now: () => 0 });
	const virtual = createVirtualOpxy({ sim });
	if (write) {
		virtual.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 110, length: 1 }))
		});
		virtual.writePattern(3, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 1, note: 45, velocity: 100, length: 8 }]
		});
	}
	virtual.transport('play');
	const s = sim.state;
	return {
		project: snapshot(s),
		transport: { ...s.transport },
		track: s.track,
		mode: s.mode,
		seconds: 2,
		sampleRate: 48_000
	};
}

describe('renderOffline', () => {
	it('renders what the project plays, and silence when nothing does', async () => {
		const audio = await renderOffline(playing(true), new SampleRegistry());
		expect(audio.sampleRate).toBe(48_000);
		expect(audio.channels).toHaveLength(2);
		expect(audio.channels[0].length).toBe(96_000);
		expect(peak(audio.channels)).toBeGreaterThan(0.01);
		// nothing written, and the metronome (on in a new project) switched off: nothing at all
		const quiet = playing(false);
		const project = JSON.parse(quiet.project);
		project.tempo.metronome.on = false;
		const silent = await renderOffline(
			{ ...quiet, project: JSON.stringify(project) },
			new SampleRegistry()
		);
		expect(peak(silent.channels)).toBeLessThan(1e-4);
	}, 60_000);

	it('lets the lab hear a fork', async () => {
		const sim = new OpxySim({ now: () => 0 });
		const samples = new SampleRegistry();
		const host = new BrowserLabHost({
			sim,
			render: { render: (request) => renderOffline({ ...request, sampleRate: 48_000 }, samples) }
		});
		try {
			const { result } = await host.run(
				[
					'const f = lab.fork();',
					'f.setMetronome(false);',
					'f.writePattern(1, { notes: [1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 110 })) });',
					'const heard = await lab.listen(f, { seconds: 3 });',
					'return { first: heard.text.split("\\n")[0], lufs: heard.data.level.lufs, onsets: heard.data.rhythm?.onsets ?? 0 };'
				].join('\n'),
				{ signal: new AbortController().signal, timeoutMs: 30_000 }
			);
			expect(result.error).toBeUndefined();
			const value = result.value as { first: string; lufs: number; onsets: number };
			expect(value.first).toMatch(/^heard 3 s of fork 1/);
			expect(value.lufs).toBeGreaterThan(-60);
			expect(value.onsets).toBeGreaterThan(2);
		} finally {
			host.dispose();
		}
	}, 60_000);

	it('lets the listen tool hear one scene of a song looping, stopped', async () => {
		const sim = new OpxySim({ now: () => 0 });
		const virtual = createVirtualOpxy({ sim });
		virtual.setMetronome(false);
		// the song opens on a silent intro (scene 1); the beat is scene 2
		virtual.writePattern(1, {
			pattern: 2,
			bars: 1,
			notes: [1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 110, length: 1 }))
		});
		virtual.writeArrangement({
			scenes: [
				{ scene: 1, patterns: [{ track: 1, pattern: 1 }] },
				{ scene: 2, patterns: [{ track: 1, pattern: 2 }] }
			],
			song: { order: [1, 2], loop: true }
		});
		const samples = new SampleRegistry();
		const env = {
			device: null,
			replica: null,
			virtual,
			manual: NO_MANUAL,
			timers: { now: () => 0, setTimeout, clearTimeout },
			confirmWindowMs: 0,
			plan: { get: () => [], set: () => {} },
			abortDeviceWork: () => {},
			listen: {
				record: () => Promise.reject(new Error('nothing is recorded live here')),
				analyze: async (recording, options) =>
					analyzeAudio(recording.channels, recording.sampleRate, options),
				render: async (request) => ({
					...(await renderOffline({ ...request, sampleRate: 48_000 }, samples)),
					source: 'replica' as const,
					label: 'replica, rendered offline'
				})
			}
		} as AgentEnvironment;
		const hear = async (scene: number) => {
			const result = await listenTool.run(
				{ scene, seconds: 3 },
				{ toolCallId: 'toolu_s', agent: 'conductor', signal: new AbortController().signal, env }
			);
			expect(result.isError, String(result.content)).toBeFalsy();
			const numbers = String(result.content)
				.split('\n')
				.find((l) => l.startsWith('numbers: '));
			return JSON.parse(numbers!.slice('numbers: '.length));
		};
		const beat = await hear(2);
		expect(beat.level.lufs).toBeGreaterThan(-60);
		expect(beat.rhythm?.onsets ?? 0).toBeGreaterThan(2);
		const intro = await hear(1);
		expect(intro.flags ?? []).not.toContain('clipping');
		expect(intro.level.lufs === null || intro.level.lufs < -60).toBe(true);
		// the replica itself never played
		expect(sim.state.transport.playing).toBe(false);
	}, 60_000);
});
