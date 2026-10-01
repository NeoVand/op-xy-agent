/**
 * The probe: the agent as its users meet it, talked to turn by turn by whoever runs the probe (or a
 * script), to find what goes wrong before a user does. The owner's trap-beat session found five
 * problems that no test had: a production worker that could not start, a song's intro heard where
 * a scene was asked for, no way to switch the click off, patterns too long to send in one answer,
 * screen text in the changes list. The unit tests and the Node evals missed them because they
 * check what we imagined, in an environment we assembled; this is the site itself, used.
 *
 * The production build in headless Chromium, as the site ships: the page, its workers (the lab),
 * the replica's sound and its offline renders, the chat and its approvals. The page holds a
 * placeholder key; its calls to api.anthropic.com are answered from here, with the owner's key put
 * on in Node (never in the page, never printed). Every exchange is kept, so each turn comes back
 * whole: the answer, every tool call with its result, what changed on the replica, the approvals
 * given, the cut-offs, the page's errors, the time and the cost. The session's files land in
 * evals/agent/out/probe/<session>/ (exchanges.jsonl, turn-NN.json, screenshots).
 *
 * Driven by `probe.mjs` (serve, say, debrief, shot, reset, stop); the control port answers only
 * this machine, and only requests that carry the probe's header (a web page cannot send it).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright';
import { usageCost, type UsageLike } from '$lib/agent/models';
import { anthropicKey } from './key';

/** What the page holds instead of a key: shaped like one, worth nothing. */
const PLACEHOLDER_KEY = 'sk-ant-probe-placeholder-not-a-key-0000';
const KEY_ENTRY = 'opxy:agent-keys';
/** The header every control request carries (browsers cannot add it cross-origin unasked). */
export const PROBE_HEADER = 'x-opxy-probe';
export const DEFAULT_CONTROL_PORT = 4296;
const SITE_PORT = 4297;
/** The owner's own debrief question, word for word as they asked it. */
export const DEBRIEF =
	"Can you summarize your experience and everything you tried and failed? I want to give you better tools and make sure you don't run into these problems in the future. I'm the programmer of the agent.";

// ─── what the API said ─────────────────────────────────────────────────────────────────────────

/** A content block of a response, put back together from its stream. */
export type Block =
	| { readonly type: 'text'; readonly text: string }
	| { readonly type: 'thinking'; readonly text: string }
	| {
			readonly type: 'tool_use';
			readonly id: string;
			readonly name: string;
			readonly input: unknown;
	  }
	| { readonly type: 'other'; readonly kind: string };

/** One call to the API through the page, and what came back. */
export interface Exchange {
	readonly index: number;
	readonly at: number;
	readonly ms: number;
	readonly method: string;
	readonly path: string;
	readonly status: number;
	/** The conductor (it has write_pattern), a subagent, or not a message at all. */
	readonly agent: 'conductor' | 'subagent' | null;
	readonly model: string | null;
	readonly request: unknown;
	readonly blocks: readonly Block[];
	readonly stopReason: string | null;
	readonly usage: UsageLike | null;
	readonly usd: number | null;
	readonly error: string | null;
}

/** Puts a streamed (SSE) or plain JSON response back together. */
export function readResponse(
	text: string
): Pick<Exchange, 'blocks' | 'stopReason' | 'usage' | 'error'> {
	const trimmed = text.trimStart();
	if (trimmed.startsWith('{')) {
		try {
			const json = JSON.parse(trimmed) as {
				content?: {
					type: string;
					text?: string;
					thinking?: string;
					id?: string;
					name?: string;
					input?: unknown;
				}[];
				stop_reason?: string;
				usage?: UsageLike;
				error?: { message?: string };
			};
			return {
				blocks: (json.content ?? []).map(toBlock),
				stopReason: json.stop_reason ?? null,
				usage: json.usage ?? null,
				error: json.error?.message ?? null
			};
		} catch {
			return { blocks: [], stopReason: null, usage: null, error: 'unreadable response' };
		}
	}
	const parts: { type: string; text: string; json: string; id?: string; name?: string }[] = [];
	let stopReason: string | null = null;
	let usage: Record<string, unknown> | null = null;
	let error: string | null = null;
	for (const chunk of text.split(/\n\n/)) {
		const data = chunk
			.split('\n')
			.filter((l) => l.startsWith('data:'))
			.map((l) => l.slice(5).trim())
			.join('');
		if (!data) continue;
		let event: Record<string, never>;
		try {
			event = JSON.parse(data);
		} catch {
			continue;
		}
		const e = event as {
			type: string;
			index?: number;
			message?: { usage?: Record<string, unknown> };
			content_block?: { type: string; id?: string; name?: string; text?: string };
			delta?: {
				type?: string;
				text?: string;
				thinking?: string;
				partial_json?: string;
				stop_reason?: string;
			};
			usage?: Record<string, unknown>;
			error?: { message?: string };
		};
		if (e.type === 'message_start') usage = { ...(e.message?.usage ?? {}) };
		else if (e.type === 'content_block_start' && e.index !== undefined && e.content_block) {
			parts[e.index] = {
				type: e.content_block.type,
				text: e.content_block.text ?? '',
				json: '',
				id: e.content_block.id,
				name: e.content_block.name
			};
		} else if (e.type === 'content_block_delta' && e.index !== undefined && parts[e.index]) {
			const part = parts[e.index];
			if (e.delta?.text) part.text += e.delta.text;
			if (e.delta?.thinking) part.text += e.delta.thinking;
			if (e.delta?.partial_json) part.json += e.delta.partial_json;
		} else if (e.type === 'message_delta') {
			stopReason = e.delta?.stop_reason ?? stopReason;
			usage = { ...(usage ?? {}), ...(e.usage ?? {}) };
		} else if (e.type === 'error') error = e.error?.message ?? 'error';
	}
	const blocks = parts.filter(Boolean).map((p): Block => {
		if (p.type === 'text') return { type: 'text', text: p.text };
		if (p.type === 'thinking') return { type: 'thinking', text: p.text };
		if (p.type === 'tool_use') {
			let input: unknown = p.json;
			try {
				input = p.json ? JSON.parse(p.json) : {};
			} catch {
				// a call cut off mid-way: its input as far as it came
			}
			return { type: 'tool_use', id: p.id ?? '', name: p.name ?? '', input };
		}
		return { type: 'other', kind: p.type };
	});
	return { blocks, stopReason, usage: usage as UsageLike | null, error };
}

function toBlock(b: {
	type: string;
	text?: string;
	thinking?: string;
	id?: string;
	name?: string;
	input?: unknown;
}): Block {
	if (b.type === 'text') return { type: 'text', text: b.text ?? '' };
	if (b.type === 'thinking') return { type: 'thinking', text: b.thinking ?? '' };
	if (b.type === 'tool_use')
		return { type: 'tool_use', id: b.id ?? '', name: b.name ?? '', input: b.input };
	return { type: 'other', kind: b.type };
}

// ─── a turn, as it went ────────────────────────────────────────────────────────────────────────

/** A tool call of the turn and what it returned. */
export interface TurnCall {
	readonly agent: 'conductor' | 'subagent';
	readonly name: string;
	readonly input: unknown;
	readonly result: string | null;
	readonly isError: boolean;
}

/** One turn: what was said, what the agent did, what came of it. */
export interface TurnReport {
	readonly turn: number;
	readonly said: string;
	readonly seconds: number;
	readonly answer: string;
	/** Text the conductor wrote between its tool calls (working notes, drafts). */
	readonly notes: readonly string[];
	readonly calls: readonly TurnCall[];
	/** The last changes list the conductor was given (`<replica-changes>`). */
	readonly changes: string | null;
	readonly approvals: readonly string[];
	/** Responses cut off at the output limit, refused or failed. */
	readonly cutoffs: number;
	readonly apiErrors: readonly string[];
	readonly pageErrors: readonly string[];
	readonly requests: number;
	readonly usd: number;
	readonly timedOut: boolean;
}

type Message = { role: string; content: string | { type: string; [k: string]: unknown }[] };

const textOf = (content: unknown): string => {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map((c: { type?: string; text?: string }) =>
				c.type === 'text' ? (c.text ?? '') : `[${c.type}]`
			)
			.join('\n');
	}
	return JSON.stringify(content);
};

/** A turn's report from the exchanges made while it ran. */
export function turnReport(
	turn: number,
	said: string,
	exchanges: readonly Exchange[],
	extra: Pick<TurnReport, 'seconds' | 'approvals' | 'pageErrors' | 'timedOut'>
): TurnReport {
	const messages = exchanges.filter((x) => x.agent !== null);
	// results: every tool_result the agents' later requests carry, by the call's id; the changes
	// list only from this turn (after the user's message that started it)
	const results = new Map<string, { text: string; isError: boolean }>();
	let changes: string | null = null;
	for (const x of messages) {
		const body = x.request as { messages?: Message[] };
		const all = body.messages ?? [];
		const started = all.findLastIndex(
			(m) =>
				m.role === 'user' &&
				(typeof m.content === 'string' || !m.content.some((b) => b.type === 'tool_result'))
		);
		for (const [i, m] of all.entries()) {
			if (i < started) continue;
			if (m.role !== 'user' || typeof m.content === 'string') continue;
			for (const block of m.content) {
				if (block.type === 'tool_result') {
					results.set(String(block.tool_use_id), {
						text: textOf(block.content),
						isError: block.is_error === true
					});
				} else if (
					x.agent === 'conductor' &&
					block.type === 'text' &&
					String(block.text).startsWith('<replica-changes>')
				) {
					changes = String(block.text);
				}
			}
		}
	}
	const calls: TurnCall[] = [];
	const notes: string[] = [];
	let answer = '';
	for (const x of messages) {
		const finalText = x.blocks
			.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
			.map((b) => b.text)
			.join('');
		const toolUses = x.blocks.filter(
			(b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use'
		);
		if (x.agent === 'conductor') {
			if (toolUses.length > 0 && finalText.trim()) notes.push(finalText.trim());
			if (toolUses.length === 0 && finalText.trim()) answer = finalText.trim();
		}
		for (const use of toolUses) {
			const result = results.get(use.id);
			calls.push({
				agent: x.agent ?? 'subagent',
				name: use.name,
				input: use.input,
				result: result?.text ?? null,
				isError: result?.isError ?? false
			});
		}
	}
	const apiErrors = exchanges
		.filter((x) => x.error || x.status >= 400)
		.map((x) => `${x.status} ${x.path}: ${x.error ?? ''}`.trim());
	return {
		turn,
		said,
		answer,
		notes,
		calls,
		changes,
		cutoffs: messages.filter((x) => x.stopReason === 'max_tokens' || x.stopReason === 'refusal')
			.length,
		apiErrors,
		requests: exchanges.length,
		usd: exchanges.reduce((sum, x) => sum + (x.usd ?? 0), 0),
		...extra
	};
}

// ─── the browser, the site and the key ─────────────────────────────────────────────────────────

interface Session {
	readonly dir: string;
	readonly context: BrowserContext;
	readonly page: Page;
	readonly exchanges: Exchange[];
	readonly pageErrors: string[];
	inFlight: number;
	turns: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The environment for the build and the preview: this process's, without the NODE_ENV that the
 * Vite server loading the probe sets (a build that inherits "development" prerenders as dev).
 */
function cleanEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	delete env.NODE_ENV;
	return env;
}

function run(command: string, args: string[], log: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: cleanEnv() });
		child.stdout.on('data', (d) => appendFileSync(log, d));
		child.stderr.on('data', (d) => appendFileSync(log, d));
		child.on('exit', (code) =>
			code === 0
				? resolve()
				: reject(new Error(`${command} ${args.join(' ')} exited ${code}; see ${log}`))
		);
	});
}

async function waitForSite(url: string, timeoutMs = 60_000): Promise<void> {
	const until = Date.now() + timeoutMs;
	while (Date.now() < until) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// not up yet
		}
		await sleep(300);
	}
	throw new Error(`the site did not come up at ${url}`);
}

const cors = (origin: string | undefined) => ({
	'access-control-allow-origin': origin ?? '*',
	'access-control-allow-headers': '*',
	'access-control-allow-methods': 'GET, POST, OPTIONS',
	'access-control-expose-headers': '*'
});

/** Answers the page's API calls from Node, with the owner's key on them. */
function proxy(session: () => Session | null, key: string) {
	return async (route: Route) => {
		const request = route.request();
		const headers = await request.allHeaders();
		if (request.method() === 'OPTIONS') {
			await route.fulfill({ status: 204, headers: cors(headers.origin) });
			return;
		}
		const s = session();
		const started = Date.now();
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(headers)) {
			if (k.startsWith(':') || ['host', 'content-length', 'connection'].includes(k)) continue;
			out[k] = v;
		}
		out['x-api-key'] = key;
		const body = request.postData();
		if (s) s.inFlight++;
		let status = 0;
		let text = '';
		let failure: string | null = null;
		const kept: Record<string, string> = {};
		try {
			const response = await fetch(request.url(), {
				method: request.method(),
				headers: out,
				body: body ?? undefined
			});
			status = response.status;
			text = await response.text();
			response.headers.forEach((v, k) => {
				if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k))
					kept[k] = v;
			});
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		} finally {
			if (s) s.inFlight--;
		}
		if (s) {
			let parsed: unknown;
			try {
				parsed = body ? JSON.parse(body) : null;
			} catch {
				parsed = body;
			}
			const req = parsed as { model?: string; tools?: { name: string }[] } | null;
			const isMessage = new URL(request.url()).pathname.startsWith('/v1/messages');
			const read = isMessage
				? readResponse(text)
				: { blocks: [], stopReason: null, usage: null, error: null };
			const model = req?.model ?? null;
			const exchange: Exchange = {
				index: s.exchanges.length,
				at: started,
				ms: Date.now() - started,
				method: request.method(),
				path: new URL(request.url()).pathname,
				status,
				agent: !isMessage
					? null
					: req?.tools?.some((t) => t.name === 'write_pattern')
						? 'conductor'
						: 'subagent',
				model,
				request: parsed,
				...read,
				error: failure ?? read.error ?? (status >= 400 ? text.slice(0, 500) : null),
				usd: model && read.usage ? usageCost(model, read.usage) : null
			};
			s.exchanges.push(exchange);
			appendFileSync(join(s.dir, 'exchanges.jsonl'), `${JSON.stringify(exchange)}\n`);
		}
		try {
			if (failure !== null) await route.abort('failed');
			else
				await route.fulfill({ status, headers: { ...kept, ...cors(headers.origin) }, body: text });
		} catch {
			// the page went away or stopped waiting
		}
	};
}

// ─── the server ────────────────────────────────────────────────────────────────────────────────

/** Starts the site, the browser and the control port; resolves once it is all up. */
export async function main(args: readonly string[]): Promise<void> {
	const flag = (name: string) => args.includes(`--${name}`);
	const option = (name: string) => {
		const i = args.indexOf(`--${name}`);
		return i >= 0 ? args[i + 1] : undefined;
	};
	const controlPort = Number(option('control') ?? DEFAULT_CONTROL_PORT);
	const root = join(process.cwd(), 'evals/agent/out/probe');
	mkdirSync(root, { recursive: true });
	const key = anthropicKey();
	const log = join(root, 'site.log');
	writeFileSync(log, '');
	if (!flag('no-build')) {
		console.log('building the site…');
		await run('pnpm', ['build'], log);
	}
	const site = `http://127.0.0.1:${SITE_PORT}`;
	// a server left on the port would answer with whatever it serves (once: a build half rewritten)
	if (
		await fetch(site).then(
			() => true,
			() => false
		)
	) {
		throw new Error(
			`something already serves ${site}: stop it first (an earlier probe's preview?)`
		);
	}
	// vite itself, not through pnpm, so stopping the probe stops the server too
	const preview: ChildProcess = spawn(
		join(process.cwd(), 'node_modules/.bin/vite'),
		['preview', '--port', String(SITE_PORT), '--strictPort', '--host', '127.0.0.1'],
		{ stdio: ['ignore', 'pipe', 'pipe'], env: cleanEnv() }
	);
	preview.stdout?.on('data', (d) => appendFileSync(log, d));
	preview.stderr?.on('data', (d) => appendFileSync(log, d));
	const quit = () => preview.kill();
	process.on('exit', quit);
	process.on('SIGINT', () => process.exit(130));
	process.on('SIGTERM', () => process.exit(143));
	await waitForSite(site);
	const browser: Browser = await chromium.launch({
		headless: !flag('headed'),
		args: ['--autoplay-policy=no-user-gesture-required']
	});
	let session: Session | null = null;

	async function open(): Promise<Session> {
		const dir = join(root, new Date().toISOString().replace(/[:.]/g, '-'));
		mkdirSync(dir, { recursive: true });
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		await context.addInitScript(
			([entry, placeholder]) => {
				if (!localStorage.getItem(entry))
					localStorage.setItem(entry, JSON.stringify({ anthropic: placeholder }));
			},
			[KEY_ENTRY, PLACEHOLDER_KEY] as const
		);
		const page = await context.newPage();
		const s: Session = { dir, context, page, exchanges: [], pageErrors: [], inFlight: 0, turns: 0 };
		await context.route(
			'https://api.anthropic.com/**',
			proxy(() => session, key)
		);
		page.on('pageerror', (error) => s.pageErrors.push(`pageerror: ${error.message}`));
		page.on('console', (message) => {
			if (message.type() === 'error') s.pageErrors.push(`console: ${message.text().slice(0, 400)}`);
		});
		session = s;
		await page.goto(site);
		await page.getByLabel('message to the agent').waitFor({ state: 'visible', timeout: 60_000 });
		await page.waitForFunction(
			() => {
				const field = document.querySelector(
					'textarea.composer__field'
				) as HTMLTextAreaElement | null;
				return field !== null && !field.disabled;
			},
			null,
			{ timeout: 60_000 }
		);
		console.log(`session ${dir}`);
		return s;
	}

	/** Sends a message and waits for the turn to end, approving what the agent asks. */
	async function say(s: Session, text: string, timeoutMs: number): Promise<TurnReport> {
		const field = s.page.getByLabel('message to the agent');
		await field.fill(text);
		const from = s.exchanges.length;
		const errorsFrom = s.pageErrors.length;
		const started = Date.now();
		await field.press('Enter');
		return (await waitTurn(s, text, { from, errorsFrom, started, timeoutMs, grace: 5000 }))!;
	}

	/**
	 * Presses keys on the replica as a user would (a click on each), then waits for a turn they
	 * set off (a walkthrough's end tells the agent), or reports none.
	 */
	async function press(s: Session, ids: readonly string[], timeoutMs: number) {
		const from = s.exchanges.length;
		const errorsFrom = s.pageErrors.length;
		const started = Date.now();
		const missing: string[] = [];
		for (const id of ids) {
			// a computer key held down or let go (the replica's keyboard shortcuts: X is G3)
			const held = /^(down|up):(.+)$/.exec(id);
			if (held) {
				await (held[1] === 'down' ? s.page.keyboard.down(held[2]) : s.page.keyboard.up(held[2]));
				await sleep(150);
				continue;
			}
			const key = s.page.locator(`[data-id="${id}"]`).first();
			if ((await key.count()) === 0) {
				missing.push(id);
				continue;
			}
			await key.click();
			await sleep(250);
		}
		const turn = await waitTurn(s, `(pressed ${ids.join(', ')})`, {
			from,
			errorsFrom,
			started,
			timeoutMs,
			grace: 3000,
			optional: true
		});
		return { pressed: ids.filter((id) => !missing.includes(id)), missing, lit: await lit(s), turn };
	}

	/** The replica's keys lit for the user now (a walkthrough's), and what its screen says. */
	async function lit(s: Session) {
		return s.page.evaluate(() => ({
			keys: [...document.querySelectorAll('[data-hl]')]
				.map((e) => `${e.getAttribute('data-id')}:${e.getAttribute('data-hl')}`)
				.filter((x) => !x.endsWith(':')),
			screen: document.querySelector('[aria-live]')?.textContent?.trim() ?? null
		}));
	}

	async function waitTurn(
		s: Session,
		text: string,
		o: {
			from: number;
			errorsFrom: number;
			started: number;
			timeoutMs: number;
			grace: number;
			optional?: boolean;
		}
	): Promise<TurnReport | null> {
		const { from, errorsFrom, started, timeoutMs } = o;
		// the composer's own stop button (pattern cards in the chat have stop buttons too)
		const stop = s.page.locator('form.composer button[aria-label="stop"]');
		/** Working: the composer says so, or offers to stop. */
		const working = () =>
			s.page
				.evaluate(() => {
					const field = document.querySelector('textarea.composer__field');
					const placeholder = field instanceof HTMLTextAreaElement ? field.placeholder : '';
					return (
						placeholder.startsWith('Working') ||
						document.querySelector('form.composer button[aria-label="stop"]') !== null
					);
				})
				.catch(() => false);
		const approvals: string[] = [];
		let sawBusy = false;
		let idleSince: number | null = null;
		let timedOut = false;
		for (;;) {
			if (Date.now() - started > timeoutMs) {
				timedOut = true;
				await stop.click().catch(() => {});
				break;
			}
			const sheet = s.page.getByRole('alertdialog');
			if (await sheet.isVisible().catch(() => false)) {
				const what = (await sheet.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
				approvals.push(what.slice(0, 300));
				await sheet
					.getByRole('button', { name: 'approve', exact: true })
					.click()
					.catch(() => {});
				await sleep(300);
				continue;
			}
			const busy = await working();
			if (busy) sawBusy = true;
			if (o.optional && !sawBusy && s.inFlight === 0 && Date.now() - started > o.grace) return null;
			const quiet = !busy && s.inFlight === 0 && (sawBusy || Date.now() - started > o.grace);
			if (quiet) {
				idleSince ??= Date.now();
				if (Date.now() - idleSince > 1500) break;
			} else idleSince = null;
			await sleep(250);
		}
		const turn = ++s.turns;
		const report = turnReport(turn, text, s.exchanges.slice(from), {
			seconds: Math.round((Date.now() - started) / 100) / 10,
			approvals,
			pageErrors: s.pageErrors.slice(errorsFrom),
			timedOut
		});
		writeFileSync(
			join(s.dir, `turn-${String(turn).padStart(2, '0')}.json`),
			JSON.stringify(report, null, 2)
		);
		return report;
	}

	session = await open();
	const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
		const reply = (status: number, value: unknown) => {
			res.writeHead(status, { 'content-type': 'application/json' });
			res.end(JSON.stringify(value));
		};
		if (req.headers[PROBE_HEADER] !== '1' || req.headers.origin)
			return reply(403, { error: 'not the probe' });
		const chunks: Buffer[] = [];
		for await (const chunk of req) chunks.push(chunk as Buffer);
		let body: Record<string, unknown>;
		try {
			body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
		} catch {
			return reply(400, { error: 'bad json' });
		}
		try {
			const s = session ?? (session = await open());
			switch (req.url) {
				case '/say': {
					const text = String(body.text ?? '').trim();
					if (!text) return reply(400, { error: 'nothing to say' });
					return reply(200, await say(s, text, Number(body.timeoutMs ?? 15 * 60_000)));
				}
				case '/press': {
					const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
					if (ids.length === 0) return reply(400, { error: 'no keys to press' });
					return reply(200, await press(s, ids, Number(body.timeoutMs ?? 15 * 60_000)));
				}
				case '/lit':
					return reply(200, await lit(s));
				case '/shot': {
					const path = join(s.dir, `shot-${Date.now()}.png`);
					await s.page.screenshot({ path, fullPage: false });
					return reply(200, { path });
				}
				case '/eval': {
					const value = await s.page.evaluate(String(body.js ?? 'null'));
					return reply(200, { value });
				}
				case '/reset': {
					await s.context.close();
					session = await open();
					return reply(200, { dir: session.dir });
				}
				case '/info':
					return reply(200, {
						dir: s.dir,
						turns: s.turns,
						exchanges: s.exchanges.length,
						usd: s.exchanges.reduce((n, x) => n + (x.usd ?? 0), 0)
					});
				case '/stop':
					reply(200, { ok: true });
					await browser.close();
					preview.kill();
					server.close();
					process.exit(0);
					return;
				default:
					return reply(404, { error: `no ${req.url}` });
			}
		} catch (error) {
			return reply(500, { error: error instanceof Error ? error.message : String(error) });
		}
	});
	await new Promise<void>((resolve) => server.listen(controlPort, '127.0.0.1', resolve));
	console.log(`probe ready on 127.0.0.1:${controlPort}`);
	await new Promise(() => {});
}
