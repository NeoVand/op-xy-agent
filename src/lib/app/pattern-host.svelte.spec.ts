// A pattern card on the replica's own patterns: it shows what the pattern holds, a click adds or
// takes away a hit there (the track keeps playing the pattern it played), a drag up on a hit
// makes it harder, and its play key plays it (keeping to the scene when the song has others) while
// its stop key stops the replica.
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import PatternCard from '$lib/agent/ui/PatternCard.svelte';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { patternHost } from './pattern-host';
import type { AppSimulator } from './simulator.svelte';
import { createVirtualOpxy } from './virtual';

function setup() {
	const sim = new OpxySim({ now: () => 0 });
	const virtual = createVirtualOpxy({ sim });
	const kick = [1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 100, length: 1 }));
	virtual.writePattern(1, { pattern: 1, bars: 1, notes: kick });
	// pattern 2 written last: it is the one the track plays
	virtual.writePattern(1, { pattern: 2, bars: 1, notes: kick.slice(0, 1) });
	let saved = 0;
	const host = patternHost({
		simulator: { sim } as unknown as AppSimulator,
		changed: () => saved++
	});
	return { sim, virtual, host, saved: () => saved };
}

const cell = (container: HTMLElement, label: string) =>
	container.querySelector<HTMLButtonElement>(`[aria-label^="${label}"]`)!;

describe('a pattern card on the replica', () => {
	it('shows the pattern, and a click adds a hit without changing what the track plays', async () => {
		const { sim, virtual, host, saved } = setup();
		const screen = render(PatternCard, { host, track: 1, pattern: 1 });
		await expect.element(screen.getByText('kick 1', { exact: true })).toBeVisible();
		expect(cell(screen.container, 'step 1, kick 1').getAttribute('aria-selected')).toBe('true');
		await userEvent.click(cell(screen.container, 'step 3, kick 1'));
		await expect.poll(() => virtual.readPattern(1, 1).notes.map((n) => n.step)).toContain(3);
		expect(sim.state.tracks[0].sequence.current).toBe(1);
		expect(saved()).toBeGreaterThan(0);
		// and a click on a hit takes it away
		await userEvent.click(cell(screen.container, 'step 5, kick 1'));
		await expect.poll(() => virtual.readPattern(1, 1).notes.map((n) => n.step)).not.toContain(5);
	});

	it('makes a hit harder with a drag up', async () => {
		const { virtual, host } = setup();
		const screen = render(PatternCard, { host, track: 1, pattern: 1 });
		const target = cell(screen.container, 'step 9, kick 1');
		const at = (type: string, y: number) =>
			target.dispatchEvent(
				new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientY: y })
			);
		at('pointerdown', 200);
		at('pointermove', 190);
		at('pointermove', 180);
		at('pointerup', 180);
		await expect
			.poll(() => virtual.readPattern(1, 1).notes.find((n) => n.step === 9)?.velocity)
			.toBe(127);
		// the drag did not take the hit away
		expect(virtual.readPattern(1, 1).notes.map((n) => n.step)).toEqual([1, 5, 9, 13]);
	});

	it('plays the pattern from its card, and stops the replica', async () => {
		const { sim, host } = setup();
		const screen = render(PatternCard, { host, track: 1, pattern: 1 });
		const play = screen.getByRole('button', { name: 'play track 1 pattern 1' });
		const stop = screen.getByRole('button', { name: 'stop' });
		await expect.element(stop).toBeDisabled();
		await play.click();
		// the track plays pattern 1 now, and the replica plays
		expect(sim.state.tracks[0].sequence.current).toBe(0);
		expect(sim.state.transport.playing).toBe(true);
		await expect.element(play).toHaveAttribute('aria-pressed', 'true');
		await stop.click();
		expect(sim.state.transport.playing).toBe(false);
		await expect.element(play).toHaveAttribute('aria-pressed', 'false');
	});

	it('keeps to the scene when the song has others, so the pattern played is heard', () => {
		const { sim, virtual, host } = setup();
		virtual.writeArrangement({
			scenes: [
				{ scene: 1, patterns: [{ track: 1, pattern: 2 }] },
				{ scene: 2, patterns: [{ track: 1, pattern: 2 }] }
			],
			song: { order: [2, 1], loop: true }
		});
		host.play(1, 1);
		// plain play would start the song at scene 2, and its pattern 2
		expect(sim.state.areas.arrange.scene).toBe(0);
		expect(sim.state.areas.arrange.held).toBe(true);
		expect(sim.state.tracks[0].sequence.current).toBe(0);
		expect(sim.state.transport.playing).toBe(true);
	});
});
