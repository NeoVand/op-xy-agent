// Under the last answer, the things to say next: offered once it is written, sent with a click,
// and gone while the agent works.
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ChatEntry } from '../chat';
import Conversation from './Conversation.svelte';

const ENTRIES: ChatEntry[] = [
	{ kind: 'user', id: 'u1', text: 'give me a beat' },
	{
		kind: 'text',
		id: 'a1',
		agent: 'conductor',
		parent: null,
		text: 'Four on the floor on T1. Want me to add a fill, or make it a song?',
		citations: []
	},
	{ kind: 'changes', id: 'c1', lines: ['T1 pattern 1: 0 → 4 notes'], undo: 'ready' }
];

describe('quick replies', () => {
	it('offer what to say next under the last answer, and send one with a click', async () => {
		const sent: string[] = [];
		const screen = render(Conversation, { entries: ENTRIES, onreply: (text) => sent.push(text) });
		const group = screen.getByRole('group', { name: 'quick replies' });
		await expect.element(group).toBeVisible();
		// the offer's alternatives first, then a next step, three in all
		expect(group.getByRole('button').elements()).toHaveLength(3);
		await screen.getByRole('button', { name: 'make it a song' }).click();
		expect(sent).toEqual(['make it a song']);
	});

	it('are not offered while the agent works', async () => {
		const screen = render(Conversation, { entries: ENTRIES, running: true, onreply: () => {} });
		await expect
			.element(screen.getByRole('group', { name: 'quick replies' }))
			.not.toBeInTheDocument();
	});
});
