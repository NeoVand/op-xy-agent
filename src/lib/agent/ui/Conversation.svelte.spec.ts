// The conversation in a real browser, fed by the real conductor and SDK over a paced fake API:
// streamed text reaches the DOM delta by delta (nothing batches it until the end), the caret and
// the status line live exactly as long as the writing, and a subagent's work shows under its chip
// while it runs.
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createAnthropicClient } from '../client';
import { Conductor } from '../conductor.svelte';
import { createUnitSource } from '../manual-index';
import { PacedTurn, pacedApi, type CapturedRequest } from '../testing/paced-api';
import { createMemoryThreadStore } from '../threads';
import Conversation from './Conversation.svelte';

const MANUAL = createUnitSource({
	kind: 'manual',
	label: 'test manual',
	header: '# Test manual',
	units: [
		{
			id: 'modes.m1',
			title: 'M1 page',
			text: 'Hold shift and press M1 to open the engine list.',
			source: 'https://example.test/manual#m1'
		}
	]
});

const ANSWER = Array.from({ length: 40 }, (_, i) => `word${i + 1}`).join(' ');

let conductor: Conductor | null = null;

afterEach(() => {
	conductor?.dispose();
	conductor = null;
});

async function mount(respond: (request: CapturedRequest) => PacedTurn) {
	const api = pacedApi(respond);
	conductor = await Conductor.create({
		client: createAnthropicClient({ apiKey: 'test-not-a-key', fetch: api.fetch, maxRetries: 0 }),
		device: null,
		replica: null,
		manual: MANUAL,
		store: createMemoryThreadStore(),
		preferences: { get: () => null, set: () => {} }
	});
	const c = conductor;
	const screen = await render(Conversation, {
		props: {
			get entries() {
				return c.entries;
			},
			get running() {
				return c.busy;
			},
			get activity() {
				return c.activity;
			}
		}
	});
	return { conductor: c, container: screen.container };
}

function lastAnswer(container: HTMLElement): HTMLElement | null {
	const blocks = container.querySelectorAll<HTMLElement>('.conv__item--text .md');
	return blocks.item(blocks.length - 1);
}

describe('Conversation (browser)', () => {
	it('renders a streamed answer delta by delta, with a caret and a live status line', async () => {
		const { conductor, container } = await mount(() =>
			new PacedTurn()
				.start()
				.wait(40)
				.thinking('Thinking it over.', { size: 1 })
				.wait(40)
				.text(ANSWER, { size: 1, every: 15 })
				.stop('end_turn')
		);
		const states: { at: number; text: string; caret: boolean; status: string }[] = [];
		const record = () => {
			const text = lastAnswer(container)?.textContent ?? '';
			if (text && text !== states.at(-1)?.text) {
				states.push({
					at: performance.now(),
					text,
					caret: container.querySelector('.md .caret') !== null,
					status: container.querySelector('.act')?.textContent ?? ''
				});
			}
		};
		const observer = new MutationObserver(record);
		observer.observe(container, { subtree: true, childList: true, characterData: true });

		const run = conductor.send('count to forty');
		await expect.poll(() => container.querySelector('.act')?.textContent ?? '').toMatch(/thinking/);
		await run;
		observer.disconnect();

		// 40 deltas 15 ms apart: nearly every one is its own DOM update, spread over the stream.
		expect(states.length).toBeGreaterThanOrEqual(30);
		expect(states.at(-1)!.at - states[0].at).toBeGreaterThan(300);
		expect(states.at(-1)!.text.trim()).toBe(ANSWER);
		expect(states.slice(0, -1).every((s) => s.caret)).toBe(true);
		expect(states.some((s) => /writing\s*\d+ words/.test(s.status))).toBe(true);
		// Once the run is over the caret and the status line are gone.
		expect(container.querySelector('.md .caret')).toBeNull();
		expect(container.querySelector('.act')).toBeNull();
	});

	it("opens a subagent's chip while it works, with its steps and its newest line", async () => {
		const { conductor, container } = await mount((request) => {
			const body = request.body as { tools: { name: string }[]; messages: { content: unknown }[] };
			const conductorCall = body.tools.some((t) => t.name === 'task');
			const results = JSON.stringify(body.messages.at(-1)?.content ?? '').includes('tool_result');
			if (conductorCall && !results) {
				return new PacedTurn()
					.start()
					.toolUse('toolu_task', 'task', {
						subagent_type: 'manual-expert',
						description: 'What does shift + M1 do? Cite the manual.'
					})
					.stop('tool_use');
			}
			if (conductorCall)
				return new PacedTurn().start().text('It opens the engine list.').stop('end_turn');
			if (!results) {
				return new PacedTurn('claude-sonnet-5')
					.start()
					.toolUse('toolu_search', 'search_manual', { query: 'shift M1' })
					.stop('tool_use');
			}
			return new PacedTurn('claude-sonnet-5')
				.start()
				.wait(30)
				.text('Hold shift and press M1 to open the engine list, then turn E1 to pick one.', {
					size: 1,
					every: 60
				})
				.stop('end_turn');
		});
		const run = conductor.send('what does shift + M1 do?');
		await expect
			.poll(() => container.querySelector('.chip--live .chip__now--writing')?.textContent ?? '', {
				timeout: 5000
			})
			.toMatch(/manual expert\s*Hold shift/);
		const live = container.querySelector<HTMLDetailsElement>('details.chip--live');
		expect(live?.open).toBe(true);
		expect(live?.querySelector('.chip__nested')?.textContent).toMatch(/search manual/);
		expect(container.querySelector('.act')?.textContent).toMatch(/manual expert/);
		await run;
		const chip = container.querySelector<HTMLDetailsElement>('.conv__item--tool details');
		expect(chip?.open).toBe(false);
		expect(chip?.textContent).toMatch(/manual expert answered/);
	});
});

describe('Conversation: files you sent', () => {
	it('shows a picture as a thumbnail and other files as tags with their detail', async () => {
		const screen = render(Conversation, {
			props: {
				entries: [
					{
						kind: 'user',
						id: 'u1',
						text: 'play this',
						attachments: [
							{
								id: 'f1',
								kind: 'image',
								name: 'score.png',
								size: 1000,
								detail: '1500 × 2000',
								thumb:
									'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
							},
							{
								id: 'f2',
								kind: 'midi',
								name: 'song.mid',
								size: 200,
								detail: '2 tracks · 64 notes · 0:32'
							}
						]
					}
				]
			}
		});
		const list = screen.getByRole('list', { name: 'files sent' });
		await expect.element(list).toBeVisible();
		await expect.element(screen.getByText('score.png')).toBeVisible();
		await expect.element(screen.getByText('2 tracks · 64 notes · 0:32')).toBeVisible();
		await expect.element(screen.getByText('midi')).toBeVisible();
		await expect.element(screen.getByText('play this')).toBeVisible();
		const img = list.element().querySelector('img');
		expect(img?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
	});
});
