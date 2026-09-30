// The replica shows what an answer changed where the pointer is: a key marked with a change says
// what changed there, a moment after the pointer comes onto it; an unmarked key says nothing.
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import Replica from './Replica.svelte';
import { ReplicaState } from './state.svelte';

describe('the replica', () => {
	it('marks a key an answer changed, and says what changed there under the pointer', async () => {
		const replica = new ReplicaState();
		const screen = render(Replica, { replica });
		replica.setChanged({ 'track.3': { mark: 'rest', note: 'T3 M3 filter: cutoff 00 → 40' } });
		const key = screen.container.querySelector<SVGGElement>('[data-id="track.3"]')!;
		await expect.poll(() => key.getAttribute('data-changed')).toBe('rest');
		await userEvent.hover(key);
		await expect.element(screen.getByRole('tooltip')).toHaveTextContent('cutoff 00 → 40');
		// a key with nothing changed says nothing
		await userEvent.hover(screen.container.querySelector<SVGGElement>('[data-id="track.4"]')!);
		await expect.element(screen.getByRole('tooltip')).not.toBeInTheDocument();
	});
});
