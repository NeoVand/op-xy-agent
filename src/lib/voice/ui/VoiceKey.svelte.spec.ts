// Voice in a real browser: the mic key held with the pointer or the keyboard, its LED and the
// strip saying what voice does, the conversation showing what was heard, what Claude was asked and
// what the voice said, barge-in, hands-free with mute, and the message when no OpenAI key is set.
// OpenAI's realtime API, WebRTC and the microphone are faked (test/fakes/fake-realtime.ts), and so
// is the conductor; time is manual.
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import type { PreferenceStore } from '$lib/agent/conductor.svelte';
import Conversation from '$lib/agent/ui/Conversation.svelte';
import { FakeRealtimeServer } from '../../../../test/fakes/fake-realtime';
import { FakeTime } from '../../../../test/fakes/fake-time';
import { VoiceSession } from '../session.svelte';
import { FakeConductor, type FakeReply } from '../testing/fake-conductor.svelte';
import VoiceKey from './VoiceKey.svelte';
import VoiceStrip from './VoiceStrip.svelte';

// Assembled at runtime so secret scanners never see a key-shaped literal.
const KEY = 'sk-' + 'proj-' + 'test-'.padEnd(40, '0');

let voice: VoiceSession | null = null;

afterEach(() => {
	voice?.dispose();
	voice = null;
});

function memory(): PreferenceStore {
	const values: Record<string, string> = {};
	return {
		get: (key) => values[key] ?? null,
		set: (key, value) => {
			if (value === null) delete values[key];
			else values[key] = value;
		}
	};
}

function mount(options: { key?: string | null; reply?: (text: string) => FakeReply } = {}) {
	const server = new FakeRealtimeServer();
	const time = new FakeTime();
	const conductor = new FakeConductor(options.reply);
	const settings: number[] = [];
	const session = new VoiceSession({
		apiKey: () => (options.key === undefined ? KEY : options.key),
		conductor: () => conductor,
		environment: () => server.environment(),
		supported: () => true,
		preferences: memory(),
		timers: time,
		clock: time
	});
	voice = session;
	session.load();
	render(VoiceStrip, {
		props: {
			voice: session,
			get claudeBusy() {
				return conductor.busy;
			},
			onsettings: () => settings.push(1)
		}
	});
	render(VoiceKey, { voice: session });
	const conversation = render(Conversation, {
		props: {
			get entries() {
				return conductor.entries;
			}
		}
	});
	return { server, time, conductor, session, settings, conversation };
}

function pointer(element: Element, type: 'pointerdown' | 'pointerup') {
	element.dispatchEvent(
		new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 7 })
	);
}

const keyLed = () => document.querySelector('.voice-key .led');
const stripText = () => document.querySelector('.strip__text')?.textContent?.trim() ?? '';

describe('voice key (browser)', () => {
	it('holds to talk and puts what was heard, asked and said into the conversation', async () => {
		const { server, time, conductor, session } = mount({
			reply: () => ({ answer: 'Hold `shift` and press `M1` to open the engine list.' })
		});
		const key = page.getByRole('button', { name: 'hold to talk' });
		await expect.element(key).toBeVisible();
		expect(keyLed()?.getAttribute('data-state')).toBe('off');

		pointer(key.element(), 'pointerdown');
		await expect.poll(() => session.phase).toBe('user-speaking');
		await expect.element(key).toHaveAttribute('aria-pressed', 'true');
		expect(keyLed()?.getAttribute('data-state')).toBe('red');
		expect(stripText()).toBe('listening to you');
		expect(server.mic?.enabled).toBe(true);

		await time.advance(900);
		pointer(key.element(), 'pointerup');
		await time.advance(250);
		await expect.element(key).toHaveAttribute('aria-pressed', 'false');
		expect(server.sentTypes().at(-1)).toBe('input_audio_buffer.commit');
		expect(server.mic?.enabled).toBe(false);
		await expect.poll(stripText).toBe('thinking');
		expect(keyLed()?.getAttribute('data-blink')).toBe('breathe');

		server.heard('what does shift m1 do');
		server.says('One moment.');
		const call = server.callsTool('ask_claude', { request: 'What does shift + M1 do?' });
		await expect.poll(() => server.toolOutputs()[call]).toBeTruthy();
		server.says('It opens the engine list.');

		await expect.element(page.getByText('what does shift m1 do')).toBeVisible();
		await expect.element(page.getByText('asked claude')).toBeVisible();
		await expect.element(page.getByText('What does shift + M1 do?')).toBeVisible();
		await expect.element(page.getByText('It opens the engine list.')).toBeVisible();
		await expect.element(page.getByText(/to open the engine list/)).toBeVisible();
		expect(conductor.entries.map((e) => e.kind)).toEqual([
			'voice',
			'voice',
			'user',
			'text',
			'voice'
		]);
		await expect.poll(stripText).toBe('hold the mic key to talk');
		expect(keyLed()?.getAttribute('data-state')).toBe('dim');

		await page.getByRole('button', { name: 'end' }).click();
		expect(session.phase).toBe('idle');
		expect(server.peer?.closed).toBe(true);
	});

	it('barges in with the keyboard: the voice stops and its line is marked cut off', async () => {
		const { server, time, session } = mount();
		const key = page.getByRole('button', { name: 'hold to talk' });
		(key.element() as HTMLElement).focus();
		await userEvent.keyboard('{Enter>}');
		await expect.poll(() => session.phase).toBe('user-speaking');
		await time.advance(600);
		await userEvent.keyboard('{/Enter}');
		await time.advance(250);
		server.heard('tell me about the arpeggio');
		server.emit({ type: 'response.created', response: { id: 'r1' } });
		server.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
		server.emit({
			type: 'response.output_audio_transcript.delta',
			item_id: 'm1',
			delta: 'The arpeggio has'
		});
		await expect.poll(stripText).toBe('speaking');
		expect(keyLed()?.getAttribute('data-state')).toBe('white');

		const before = server.sent.length;
		await userEvent.keyboard('{Enter>}');
		await expect.poll(() => server.sent.length).toBeGreaterThan(before);
		expect(server.sent.slice(before).map((e) => e.type)).toEqual([
			'response.cancel',
			'output_audio_buffer.clear',
			'input_audio_buffer.clear'
		]);
		await expect.element(page.getByText('cut off')).toBeVisible();
		await userEvent.keyboard('{/Enter}');
	});

	it('goes hands-free from the strip, and then the key mutes the mic', async () => {
		const { server, session } = mount();
		pointer(page.getByRole('button', { name: 'hold to talk' }).element(), 'pointerdown');
		await expect.poll(() => session.phase).toBe('user-speaking');
		pointer(page.getByRole('button', { name: 'hold to talk' }).element(), 'pointerup');

		await page.getByRole('switch').click();
		expect(session.mode).toBe('hands-free');
		expect(server.sent.find((e) => e.type === 'session.update')).toMatchObject({
			session: { audio: { input: { turn_detection: { type: 'semantic_vad' } } } }
		});
		await expect.poll(stripText).toBe('listening');
		expect(server.mic?.enabled).toBe(true);
		expect(keyLed()?.getAttribute('data-state')).toBe('red');

		await page.getByRole('button', { name: 'mute the mic' }).click();
		expect(session.muted).toBe(true);
		expect(server.mic?.enabled).toBe(false);
		await expect.poll(stripText).toBe('mic muted');
		await page.getByRole('button', { name: 'open the mic' }).click();
		expect(server.mic?.enabled).toBe(true);
	});

	it('holds to talk with the ` key, but not while typing', async () => {
		const { session, conversation } = mount();
		await userEvent.keyboard('{`>}');
		await expect.poll(() => session.phase).toBe('user-speaking');
		await userEvent.keyboard('{/`}');
		expect(session.keyDown).toBe(false);

		const field = document.createElement('textarea');
		conversation.container.append(field);
		field.focus();
		await userEvent.keyboard('`');
		expect(field.value).toBe('`');
		expect(session.keyDown).toBe(false);
	});

	it('says plainly that voice needs an OpenAI key, and offers the settings', async () => {
		const { server, settings, session } = mount({ key: null });
		pointer(page.getByRole('button', { name: 'hold to talk' }).element(), 'pointerdown');
		await expect.poll(stripText).toBe('voice needs your openai key');
		expect(server.calls).toEqual([]);
		await page.getByRole('button', { name: 'add key' }).click();
		expect(settings).toEqual([1]);
		await page.getByRole('button', { name: 'dismiss' }).click();
		expect(session.problem).toBeNull();
		expect(session.phase).toBe('idle');
	});
});
