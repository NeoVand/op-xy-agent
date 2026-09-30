// What a turn changed on the replica, as the chat shows it: one quiet line with a count, which opens
// into the list.
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ChangesNote from './ChangesNote.svelte';

describe('the changes note', () => {
	it('counts the changes and opens into the list', async () => {
		const lines = [
			'tempo 120 → 107 bpm',
			'T3 M4 lfo: tremolo lfo off → duck lfo on: source metronome'
		];
		const screen = await render(ChangesNote, { props: { lines } });
		const head = screen.getByText('changed on the replica');
		await expect.element(head).toBeVisible();
		await expect.element(screen.getByText('2', { exact: true })).toBeVisible();
		await expect.element(screen.getByText('tempo 120 → 107 bpm')).not.toBeVisible();
		await head.click();
		await expect.element(screen.getByText('tempo 120 → 107 bpm')).toBeVisible();
	});
});
