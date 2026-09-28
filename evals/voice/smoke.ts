/**
 * Voice smoke test against the live OpenAI API (docs/research/71-voice.md §8). Two checks:
 *
 * 1. **Mint** a client secret with the app's exact session (`sessionConfig`) for every realtime
 *    model and both modes: the API must accept it and echo the model, turn taking and tools.
 *    Minting costs nothing.
 * 2. **Round trip** in text over a WebSocket on the short-lived secret (WebRTC needs a browser):
 *    an OP-XY question must come back as an `ask_claude` call; a scripted Claude answer is
 *    returned; a scripted approval must be put to the user and a "yes" passed on with
 *    `answer_approval`. Output is text only, so this costs about a cent.
 *
 * The key comes from $OPENAI_API_KEY or a .env file (the value that starts with `sk-` but not
 * `sk-ant-`, since the .env labels were once swapped). No key or secret value is ever printed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REALTIME_MODELS } from '$lib/agent/models';
import {
	CLIENT_SECRETS_URL,
	clientSecretRequest,
	parseClientSecret,
	sessionConfig,
	type VoiceMode
} from '$lib/core/voice';

/** The OpenAI key, chosen by its prefix. Never printed. */
function openaiKey(envFile: string): string {
	const fromEnv = process.env.OPENAI_API_KEY?.trim();
	if (fromEnv?.startsWith('sk-') && !fromEnv.startsWith('sk-ant-')) return fromEnv;
	let text = '';
	try {
		text = readFileSync(envFile, 'utf8');
	} catch {
		// no .env
	}
	for (const line of text.split('\n')) {
		const value = line
			.slice(line.indexOf('=') + 1)
			.trim()
			.replace(/^['"]|['"]$/g, '');
		if (value.startsWith('sk-') && !value.startsWith('sk-ant-')) return value;
	}
	throw new Error(`No OpenAI key (sk-…) in $OPENAI_API_KEY or ${envFile}`);
}

/** Replaces anything key-shaped in a string (API error messages can echo a key's tail). */
function scrub(text: string): string {
	return text.replace(/\b(sk-[\w-]{4})[\w-]+/g, '$1…').replace(/\bek_[\w-]+/g, 'ek_…');
}

async function mint(key: string, model: string, mode: VoiceMode) {
	const session = sessionConfig({ model, mode, reasoning: 'low' });
	const started = performance.now();
	const response = await fetch(CLIENT_SECRETS_URL, {
		method: 'POST',
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(clientSecretRequest(session))
	});
	const ms = Math.round(performance.now() - started);
	const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
	if (!response.ok) {
		const message = (body?.error as { message?: string } | undefined)?.message ?? '';
		console.log(`  ✗ mint ${model} ${mode}: HTTP ${response.status} ${scrub(message)}`);
		return null;
	}
	const secret = parseClientSecret(body);
	const echoed = (body?.session ?? {}) as Record<string, unknown>;
	const audio = echoed.audio as
		{ input?: { turn_detection?: { type?: string } | null } } | undefined;
	const tools = ((echoed.tools as { name?: string }[] | undefined) ?? []).map((t) => t.name);
	console.log(
		`  ✓ mint ${model} ${mode}: ${ms} ms, secret ek_…, expires in ${
			secret.expiresAt ? secret.expiresAt - Math.floor(Date.now() / 1000) : '?'
		} s, model ${echoed.model}, turns ${audio?.input?.turn_detection?.type ?? 'push-to-talk'}, tools ${tools.join(' ')}`
	);
	return secret;
}

type Event = Record<string, unknown> & { type: string };

/** A text-only realtime conversation over WebSocket, authorised by a client secret. */
async function roundTrip(secret: string, model: string): Promise<boolean> {
	const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
	const socket = new WebSocket(url, ['realtime', `openai-insecure-api-key.${secret}`]);
	const events: Event[] = [];
	const waiters: { test: (e: Event) => boolean; resolve: (e: Event) => void }[] = [];
	socket.addEventListener('message', (message) => {
		const event = JSON.parse(String(message.data)) as Event;
		events.push(event);
		if (event.type === 'error')
			console.log(`  ! server error: ${scrub(JSON.stringify(event.error))}`);
		for (const waiter of [...waiters]) {
			if (waiter.test(event)) {
				waiters.splice(waiters.indexOf(waiter), 1);
				waiter.resolve(event);
			}
		}
	});
	const next = (test: (e: Event) => boolean, ms = 30_000) =>
		new Promise<Event>((resolve, reject) => {
			waiters.push({ test, resolve });
			setTimeout(() => reject(new Error('timed out waiting for the server')), ms);
		});
	const send = (event: Record<string, unknown>) => socket.send(JSON.stringify(event));
	await new Promise<void>((resolve, reject) => {
		socket.addEventListener('open', () => resolve(), { once: true });
		socket.addEventListener('error', () => reject(new Error('WebSocket did not open')), {
			once: true
		});
	});
	console.log('  ✓ websocket open on the client secret');
	let ok = true;
	try {
		await next((e) => e.type === 'session.created');
		send({ type: 'session.update', session: { type: 'realtime', output_modalities: ['text'] } });
		await next((e) => e.type === 'session.updated');

		const turn = async (text: string) => {
			send({
				type: 'conversation.item.create',
				item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] }
			});
			send({ type: 'response.create' });
			return next((e) => e.type === 'response.done');
		};
		const callsIn = (done: Event) =>
			(((done.response as { output?: Event[] }).output ?? []) as Event[]).filter(
				(item) => item.type === 'function_call'
			);
		const textIn = (done: Event) =>
			((done.response as { output?: { content?: { text?: string }[] }[] }).output ?? [])
				.flatMap((item) => item.content ?? [])
				.map((c) => c.text ?? '')
				.join(' ')
				.trim();
		const answer = async (call: Event, output: Record<string, unknown>) => {
			const added = next(
				(e) =>
					e.type === 'conversation.item.added' &&
					(e.item as Event).type === 'function_call_output' &&
					(e.item as { call_id?: string }).call_id === call.call_id
			);
			send({
				type: 'conversation.item.create',
				item: {
					type: 'function_call_output',
					call_id: call.call_id,
					output: JSON.stringify(output)
				}
			});
			await added;
			console.log('  ✓ our tool output confirmed with conversation.item.added');
			send({ type: 'response.create' });
			return next((e) => e.type === 'response.done');
		};

		const first = await turn('What does shift plus M1 do on my OP-XY?');
		const [ask] = callsIn(first);
		if (ask?.name === 'ask_claude') {
			console.log(`  ✓ question handed to Claude: ask_claude ${String(ask.arguments)}`);
		} else {
			ok = false;
			console.log(
				`  ✗ expected ask_claude, got: ${textIn(first) || JSON.stringify(callsIn(first))}`
			);
		}
		if (ask) {
			const said = await answer(ask, {
				status: 'done',
				answer: 'Hold shift and press M1 to open the preset browser, where engines are listed.',
				changes: []
			});
			console.log(`  ✓ says the result: “${textIn(said)}”`);
		}

		const second = await turn('Set the tempo to 96.');
		const [tempo] = callsIn(second);
		if (tempo?.name !== 'ask_claude') {
			ok = false;
			console.log(`  ✗ expected ask_claude for the tempo, got: ${textIn(second)}`);
		} else {
			const asked = await answer(tempo, {
				status: 'needs_approval',
				changes: ['tempo 120 → 96 bpm'],
				instruction:
					'Tell the user in one sentence what would change and ask for a yes or no. Wait for their answer, then call answer_approval. They can also tap approve or reject on screen.'
			});
			const early = callsIn(asked).find((c) => c.name === 'answer_approval');
			if (early) {
				ok = false;
				console.log('  ✗ answered the approval without asking the user');
			} else {
				console.log(`  ✓ puts the approval to the user: “${textIn(asked)}”`);
			}
			const yes = await turn('Yes, go ahead.');
			const [approval] = callsIn(yes);
			if (approval?.name === 'answer_approval') {
				console.log(`  ✓ a spoken yes becomes answer_approval ${String(approval.arguments)}`);
			} else {
				ok = false;
				console.log(`  ✗ expected answer_approval, got: ${textIn(yes)}`);
			}
		}
		const usage = events
			.filter((e) => e.type === 'response.done')
			.map((e) => (e.response as { usage?: { total_tokens?: number } }).usage?.total_tokens ?? 0);
		console.log(`  tokens per response: ${usage.join(', ')}`);
	} finally {
		socket.close();
	}
	return ok;
}

/** Runs the smoke test; `--env <file>` points at the .env holding the key. */
export async function main(argv: readonly string[]): Promise<void> {
	const envAt = argv.indexOf('--env');
	const envFile = envAt >= 0 ? argv[envAt + 1] : join(process.cwd(), '.env');
	const key = openaiKey(envFile);
	console.log('mint the app’s voice session (costs nothing):');
	let secret: string | null = null;
	for (const model of REALTIME_MODELS) {
		for (const mode of ['push-to-talk', 'hands-free'] as const) {
			const minted = await mint(key, model.id, mode);
			if (minted && model.id === REALTIME_MODELS[0].id && mode === 'push-to-talk') {
				secret = minted.value;
			}
		}
	}
	if (argv.includes('--mint-only') || !secret) return;
	console.log(`text round trip on ${REALTIME_MODELS[0].id} (about a cent):`);
	const ok = await roundTrip(secret, REALTIME_MODELS[0].id);
	console.log(ok ? 'voice smoke test passed' : 'voice smoke test: see ✗ above');
	if (!ok) process.exitCode = 1;
}
