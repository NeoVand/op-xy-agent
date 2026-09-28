// The listening light: what the agent hears, the seconds left, and four LEDs that follow the level
// (none below −48 dBFS, the last one red near full scale), with a breathing record LED.
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ListenLight from './ListenLight.svelte';

const states = (container: HTMLElement) =>
	[...container.querySelectorAll('.listen__meter .led')].map((led) =>
		led.getAttribute('data-state')
	);

describe('ListenLight', () => {
	it('says what it hears and how long is left', async () => {
		const screen = render(ListenLight, {
			activity: { source: 'device', seconds: 8, since: Date.now() - 2500 },
			level: 0
		});
		await expect
			.element(screen.getByRole('status'))
			.toHaveTextContent('listening to the op-xy 6 s');
		const record = screen.container.querySelector('.listen > .led');
		expect(record?.getAttribute('data-state')).toBe('red');
		expect(record?.getAttribute('data-blink')).toBe('breathe');
	});

	it('lights its meter with the level', async () => {
		const screen = render(ListenLight, {
			activity: { source: 'replica', seconds: 4, since: Date.now() },
			level: 0
		});
		await expect.element(screen.getByRole('status')).toHaveTextContent('listening to the replica');
		expect(states(screen.container)).toEqual(['dim', 'dim', 'dim', 'dim']);
		// −12 dBFS lights three of four; full scale all four, the last red
		await screen.rerender({ level: 10 ** (-12 / 20) });
		expect(states(screen.container)).toEqual(['white', 'white', 'white', 'dim']);
		await screen.rerender({ level: 1 });
		expect(states(screen.container)).toEqual(['white', 'white', 'white', 'red']);
	});
});
