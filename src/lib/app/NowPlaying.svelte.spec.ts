// The strip of what plays: the tempo and bar, the song's blocks (cued with a click while the song
// plays), and a light per track that mutes it with a click, except while the OP-XY is connected.
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { startSong } from '$lib/sim/areas/arrange/model';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import NowPlaying from './NowPlaying.svelte';
import type { AppSimulator } from './simulator.svelte';
import { createVirtualOpxy } from './virtual';

const LEVELS = [0, 0, 0.75, 0, 0, 0, 0, 0];

function simulator(sim = new OpxySim({ now: () => 0 })): AppSimulator {
	return { sim } as unknown as AppSimulator;
}

describe('the now-playing strip', () => {
	it('shows the tempo, the bar and the song, and mutes a track with a click', async () => {
		const sim = new OpxySim({ now: () => 0 });
		let changes = 0;
		const screen = render(NowPlaying, {
			simulator: simulator(sim),
			levels: LEVELS,
			onchange: () => changes++
		});
		await expect.element(screen.getByText('120')).toBeVisible();
		await expect.element(screen.getByText('1.1')).toBeVisible();
		await expect.element(screen.getByLabelText('scene 1')).toBeVisible();
		const two = screen.getByRole('button', { name: 'mute track 2' });
		await two.click();
		expect(sim.state.tracks[1].mix.muted).toBe(true);
		await expect.element(two).toHaveAttribute('aria-pressed', 'true');
		expect(changes).toBe(1);
	});

	it('cues a scene of the playing song', async () => {
		const sim = new OpxySim({ now: () => 0 });
		const virtual = createVirtualOpxy({ sim });
		virtual.writeArrangement({
			scenes: [
				{ scene: 1, patterns: [] },
				{ scene: 2, patterns: [] }
			],
			song: { order: [1, 2], loop: true }
		});
		startSong(sim.state);
		sim.state.transport.playing = true;
		const screen = render(NowPlaying, { simulator: simulator(sim), levels: LEVELS });
		await screen.getByRole('button', { name: 'cue scene 2, entry 2' }).click();
		expect(sim.state.areas.arrange.cue).toBe(1);
	});

	it('leaves the mutes to the OP-XY while it is connected', async () => {
		const sim = new OpxySim({ now: () => 0 });
		const screen = render(NowPlaying, { simulator: simulator(sim), levels: LEVELS, live: true });
		await expect.element(screen.getByRole('button', { name: 'mute track 1' })).toBeDisabled();
	});
});
