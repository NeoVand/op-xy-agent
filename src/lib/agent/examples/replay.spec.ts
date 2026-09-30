// The examples shown without a key: a recorded conversation replayed through the real conductor,
// its tools running for real on the replica, its answer as it was written; and it can be stopped.
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { createExamplePlayer, RECORDED } from './replay';
import list from './list.json';

describe('the recorded examples', () => {
	it('are listed as they are recorded, each with a turn to play', () => {
		expect(list.map((e) => e.id)).toEqual(RECORDED.map((e) => e.id));
		for (const example of RECORDED) {
			expect(example.turns.length).toBeGreaterThan(0);
			expect(example.turns.at(-1)?.conductor.at(-1)?.text).toBeTruthy();
		}
	});

	it('replay on the replica: the song example writes, arranges and plays it', async () => {
		const sim = new OpxySim({ now: () => 0 });
		const virtual = createVirtualOpxy({ sim });
		const player = await createExamplePlayer('song', { device: null, replica: null, virtual });
		await player.play();
		const arrangement = virtual.readArrangement();
		expect(arrangement.song.order.length).toBeGreaterThan(1);
		expect(sim.state.transport.playing).toBe(true);
		// the answer is the recorded one, whole
		const recorded = RECORDED.find((e) => e.id === 'song')!.turns[0].conductor.at(-1)!.text!;
		const answers = player.conductor.entries.filter((e) => e.kind === 'text');
		expect(answers.map((e) => (e.kind === 'text' ? e.text : '')).join('\n')).toContain(
			recorded.slice(0, 60)
		);
		// nothing failed on the way
		const tools = player.conductor.entries.filter((e) => e.kind === 'tool');
		expect(tools.every((e) => e.kind === 'tool' && e.status === 'ok')).toBe(true);
		player.conductor.dispose();
	}, 30_000);

	it('stops where it is', async () => {
		const sim = new OpxySim({ now: () => 0 });
		const player = await createExamplePlayer('dark', {
			device: null,
			replica: null,
			virtual: createVirtualOpxy({ sim })
		});
		const playing = player.play();
		player.stop();
		await playing;
		expect(player.conductor.busy).toBe(false);
		player.conductor.dispose();
	});
});
