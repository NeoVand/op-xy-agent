#!/usr/bin/env node
/**
 * The probe (probe.ts): talk to the agent on the production site, turn by turn, and read what it
 * did. Real API calls with the owner's key from $ANTHROPIC_API_KEY or .env (put on in Node, never
 * in the page, never printed).
 *
 *   node evals/agent/probe.mjs serve [--no-build] [--headed]   start it (stays up: run it in the
 *                                                              background); builds the site first
 *   node evals/agent/probe.mjs say "make me a trap beat"        one turn, reported whole
 *   node evals/agent/probe.mjs debrief                          the owner's debrief question
 *   node evals/agent/probe.mjs press step.5 keyboard.g3          press replica keys as a user would
 *   node evals/agent/probe.mjs lit                              the keys lit for the user now
 *   node evals/agent/probe.mjs shot | info | reset | stop
 *
 * say prints the answer, every tool call (input and result, cut short; --full for all of them),
 * the changes the agent was given, the approvals, cut-offs, errors, time and cost. Each turn is
 * also saved whole as JSON in the session's folder under evals/agent/out/probe/.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const [command = 'help', ...rest] = process.argv.slice(2);
const option = (name) => {
	const i = rest.indexOf(`--${name}`);
	return i >= 0 ? rest[i + 1] : undefined;
};
const full = rest.includes('--full');
const port = Number(option('control') ?? 4296);
const words = rest.filter((w, i) => !w.startsWith('--') && !(i > 0 && rest[i - 1] === '--control'));

/** The owner's debrief question (probe.ts DEBRIEF), kept in step with it. */
const DEBRIEF =
	"Can you summarize your experience and everything you tried and failed? I want to give you better tools and make sure you don't run into these problems in the future. I'm the programmer of the agent.";

async function call(path, body = {}) {
	const response = await fetch(`http://127.0.0.1:${port}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-opxy-probe': '1' },
		body: JSON.stringify(body)
	});
	const value = await response.json();
	if (!response.ok) throw new Error(value.error ?? response.statusText);
	return value;
}

const cut = (text, n) => {
	const s = typeof text === 'string' ? text : JSON.stringify(text);
	if (full || s.length <= n) return s;
	return `${s.slice(0, n)}… (+${s.length - n})`;
};

function print(report) {
	const head = [
		`turn ${report.turn}`,
		`${report.seconds} s`,
		`${report.calls.length} calls`,
		`${report.requests} requests`,
		`$${report.usd.toFixed(3)}`
	];
	if (report.cutoffs) head.push(`${report.cutoffs} cut off`);
	if (report.timedOut) head.push('TIMED OUT');
	console.log(`── ${head.join(' · ')}`);
	for (const note of report.notes) console.log(`  · ${cut(note.replace(/\s+/g, ' '), 300)}`);
	for (const c of report.calls) {
		const mark = c.result === null ? '…' : c.isError ? '✗' : '✓';
		const who = c.agent === 'subagent' ? ' (subagent)' : '';
		console.log(`  ${mark} ${c.name}${who} ${cut(c.input, 400)}`);
		if (c.result !== null) console.log(`      ${cut(c.result.replace(/\n/g, ' ⏎ '), 700)}`);
	}
	if (report.changes)
		console.log(`changes given: ${cut(report.changes.replace(/\n/g, ' ⏎ '), 900)}`);
	for (const a of report.approvals) console.log(`approved: ${a}`);
	for (const e of report.apiErrors) console.log(`API: ${e}`);
	for (const e of report.pageErrors) console.log(`page: ${cut(e, 300)}`);
	console.log(`answer:\n${report.answer || '(none)'}`);
}

try {
	switch (command) {
		case 'serve': {
			const { createServer } = await import('vite');
			const server = await createServer({
				root,
				configFile: resolve(root, 'vite.config.ts'),
				server: { middlewareMode: true, hmr: false, ws: false },
				appType: 'custom',
				logLevel: 'error'
			});
			const probe = await server.ssrLoadModule(resolve(root, 'evals/agent/probe.ts'));
			await probe.main(rest);
			break;
		}
		case 'say': {
			const text = words.join(' ');
			print(await call('/say', { text }));
			break;
		}
		case 'debrief':
			print(await call('/say', { text: DEBRIEF }));
			break;
		case 'press': {
			// replica control ids: step.5, keyboard.g3, track.1, key.play, encoder.2 …
			const result = await call('/press', { ids: words });
			console.log(
				`pressed: ${result.pressed.join(', ') || '(none)'}${result.missing.length ? `; not on the page: ${result.missing.join(', ')}` : ''}`
			);
			console.log(`lit now: ${result.lit.keys.join(', ') || '(nothing)'}`);
			if (result.turn) print(result.turn);
			else console.log('(no agent turn followed)');
			break;
		}
		case 'lit': {
			const result = await call('/lit');
			console.log(`lit: ${result.keys.join(', ') || '(nothing)'}\nscreen: ${result.screen ?? '?'}`);
			break;
		}
		case 'shot':
		case 'info':
		case 'reset':
		case 'stop':
			console.log(JSON.stringify(await call(`/${command}`)));
			break;
		default:
			console.log(
				'usage: node evals/agent/probe.mjs serve | say "…" | debrief | shot | info | reset | stop'
			);
	}
} catch (error) {
	console.error(`probe: ${error instanceof Error ? error.message : error}`);
	process.exitCode = 1;
}
