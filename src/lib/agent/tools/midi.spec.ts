// import_midi on the replica: a made-up file (drums, a bass) previewed without a change, then
// written as patterns, scenes and a song that plays; a name the conversation does not hold, and a
// file track that is not there, are refused with the reason.
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import { encodeMidiFile, tempoMeta } from '$lib/core/midi/smf';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { FakeTime } from '../../../../test/fakes/fake-time';
import { NO_MANUAL } from '../manual-source';
import type { AgentEnvironment, ToolResult } from './define';
import { importMidiTool } from './midi';

const PPQ = 96;

function song(): Uint8Array {
	const events = (channel: number, notes: [number, number][]) =>
		notes.flatMap(([beat, n]) => [
			{ tick: beat * PPQ, event: { type: 'noteOn' as const, channel, note: n, velocity: 100 } },
			{
				tick: beat * PPQ + PPQ / 4,
				event: { type: 'noteOff' as const, channel, note: n, velocity: 0 }
			}
		]);
	const kick = Array.from({ length: 32 }, (_, i) => [i, 36] as [number, number]);
	const bass = Array.from({ length: 32 }, (_, i) => [i, i < 16 ? 33 : 36] as [number, number]);
	return encodeMidiFile({
		format: 1,
		division: { kind: 'ppq', ticksPerQuarter: PPQ },
		tracks: [
			{ events: [{ tick: 0, event: tempoMeta(107) }] },
			{ events: events(9, kick) },
			{ events: events(1, bass) }
		]
	});
}

function setup() {
	const sim = new OpxySim({ now: () => 0 });
	const virtual = createVirtualOpxy({ sim });
	const bytes = song();
	const env: AgentEnvironment = {
		device: null,
		replica: null,
		virtual,
		files: {
			midi: (name) => (name === 'louie.mid' ? bytes : null),
			midiNames: () => ['louie.mid']
		},
		manual: NO_MANUAL,
		timers: new FakeTime(),
		confirmWindowMs: 0,
		plan: { get: () => [], set: () => {} },
		abortDeviceWork: () => {}
	};
	const run = (input: unknown): Promise<ToolResult> =>
		importMidiTool.run(importMidiTool.input.parse(input), {
			toolCallId: 'toolu_m',
			agent: 'conductor',
			signal: new AbortController().signal,
			env
		});
	return { sim, virtual, run };
}

const json = (r: ToolResult) => JSON.parse(String(r.content));

describe('import_midi', () => {
	const tracks = [
		{ midi: 2, to: 1 },
		{ midi: 3, to: 3 }
	];

	it('previews what it would make and changes nothing', async () => {
		const { virtual, run } = setup();
		const result = await run({ file: 'louie.mid', tracks, preview: true });
		expect(result.isError).toBeFalsy();
		expect(json(result).preview).toMatchObject({
			bpm: 107,
			bars: '1–8',
			scenes: 2,
			song: [1, 2],
			sceneStarts: { '1': 'bars 1–4', '2': 'bars 5–8' }
		});
		expect(virtual.readPattern(1).notes).toHaveLength(0);
		expect(virtual.status().bpm).toBe(120);
	});

	it('writes the patterns, scenes, song and tempo, and the song plays', async () => {
		const { sim, virtual, run } = setup();
		const result = await run({ file: 'louie.mid', tracks });
		expect(result.isError).toBeFalsy();
		expect(result.summary).toBe('2 tracks, 2 scenes, a song of 2');
		expect(virtual.status().bpm).toBe(107);
		expect(virtual.readPattern(1, 1).notes.every((n) => n.note === 53)).toBe(true);
		expect(virtual.readPattern(1, 1).notes).toHaveLength(16);
		expect(virtual.readPattern(3, 1).notes[0].note).toBe(33);
		expect(virtual.readPattern(3, 2).notes[0].note).toBe(36);
		const arrangement = virtual.readArrangement();
		expect(arrangement.song).toEqual({ order: [1, 2], loop: true });
		virtual.transport('play');
		expect(sim.state.transport.playing).toBe(true);
	});

	it('says which files it has, and which file tracks exist', async () => {
		const { run } = setup();
		const missing = await run({ file: 'nope.mid', tracks });
		expect(missing).toMatchObject({ isError: true, summary: 'no such file' });
		expect(String(missing.content)).toMatch(/louie\.mid/);
		const bad = await run({ file: 'louie.mid', tracks: [{ midi: 9, to: 1 }] });
		expect(bad).toMatchObject({ isError: true, summary: 'cannot import' });
	});
});
