// The takes a lab run offered: a key each puts that take on (again, and none is), keep leaves it
// on, and once kept the card says which and asks for more like it; nothing to hear while the agent
// still works, or after the page session that made them.
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { TakesDisplay } from '../types';
import TakesCard from './TakesCard.svelte';

const display = (kept?: number): TakesDisplay => ({
	kind: 'takes',
	offer: 'takes-1',
	takes: [
		{ label: 'walking', changes: ['T3 pattern 1: 0 → 4 notes'] },
		{ label: 'octave bounce', changes: ['T3 pattern 1: 0 → 8 notes'] }
	],
	...(kept === undefined ? {} : { kept })
});

describe('the takes card', () => {
	it('puts a take on with its key, none with the same key again, and keeps the one on', async () => {
		const heard: (number | null)[] = [];
		let kept = 0;
		const screen = render(TakesCard, {
			display: display(),
			on: null,
			onhear: (take) => (heard.push(take), true),
			onkeep: () => (kept++, true)
		});
		await expect.element(screen.getByText('tap one to hear it with the loop')).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'keep' })).toBeDisabled();
		await screen.getByRole('button', { name: /octave bounce/ }).click();
		expect(heard).toEqual([1]);
		await screen.rerender({
			display: display(),
			on: 1,
			onhear: (t) => (heard.push(t), true),
			onkeep: () => (kept++, true)
		});
		await expect.element(screen.getByText('T3 pattern 1: 0 → 8 notes')).toBeVisible();
		await screen.getByRole('button', { name: /octave bounce/ }).click();
		expect(heard).toEqual([1, null]);
		await screen.getByRole('button', { name: 'keep' }).click();
		expect(kept).toBe(1);
	});

	it('says which was kept, and asks for more like it', async () => {
		const asked: string[] = [];
		const screen = render(TakesCard, { display: display(1), onreply: (text) => asked.push(text) });
		await expect.element(screen.getByText('kept B')).toBeVisible();
		await screen.getByRole('button', { name: 'more like this' }).click();
		expect(asked).toEqual(['more like take B (octave bounce)']);
	});

	it('waits while the agent works, and says when the takes can no longer be heard', async () => {
		const busy = render(TakesCard, { display: display(), onhear: () => true, busy: true });
		await expect.element(busy.getByText('to hear once the answer is written')).toBeVisible();
		await expect.element(busy.getByRole('button', { name: /walking/ })).toBeDisabled();
		busy.unmount();
		const gone = render(TakesCard, { display: display(), onhear: () => false });
		await gone.getByRole('button', { name: /walking/ }).click();
		await expect.element(gone.getByText(/offered in an earlier visit/)).toBeVisible();
	});
});
