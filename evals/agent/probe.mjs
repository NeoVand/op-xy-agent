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
 *   node evals/agent/probe.mjs scenarios evals/agent/probe-scenarios.json [--only a,b] [--parallel 4]
 *                                       runs scripted conversations side by side, each in its own
 *                                       session ({say, files?} | {press} | {why} | {debrief} steps),
 *                                       a markdown report each under evals/agent/out/probe/reports/
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
const valued = ['--control', '--only', '--parallel'];
const words = rest.filter(
	(w, i) => !w.startsWith('--') && !(i > 0 && valued.includes(rest[i - 1]))
);

/** The owner's debrief question (probe.ts DEBRIEF), kept in step with it. */
const DEBRIEF =
	"Can you summarize your experience and everything you tried and failed? I want to give you better tools and make sure you don't run into these problems in the future. I'm the programmer of the agent.";

/** Asked after a task: the agent's own account of what confused it. */
const WHY =
	'Before we go on: was anything in that confusing, unclear or harder than it should have been? Tell me what tripped you up from your side (the tools, their results, the instructions you have, what you could not see), and what would have made it easy. Be specific; say "nothing" if nothing did.';

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

/** One step of a turn report, as markdown for reading back. */
function markdown(step, report) {
	const lines = [];
	const head = [`${report.seconds} s`, `${report.calls.length} calls`, `$${report.usd.toFixed(3)}`];
	if (report.cutoffs) head.push(`${report.cutoffs} cut off`);
	if (report.timedOut) head.push('TIMED OUT');
	lines.push(`*${head.join(' · ')}*`, '');
	for (const note of report.notes)
		lines.push(`> (working) ${note.replace(/\s+/g, ' ').slice(0, 400)}`);
	for (const c of report.calls) {
		const mark = c.result === null ? '…' : c.isError ? '✗' : '✓';
		lines.push(
			`- ${mark} \`${c.name}\`${c.agent === 'subagent' ? ' (subagent)' : ''} \`${cut(c.input, 500)}\``
		);
		if (c.result !== null) lines.push(`  - → ${cut(c.result.replace(/\n/g, ' ⏎ '), 900)}`);
	}
	if (report.changes)
		lines.push('', `**changes given:** ${report.changes.replace(/\n/g, ' ⏎ ').slice(0, 1500)}`);
	for (const a of report.approvals) lines.push(`- approved: ${a}`);
	for (const e of report.apiErrors) lines.push(`- **API:** ${e}`);
	for (const e of report.pageErrors) lines.push(`- **page:** ${cut(e, 400)}`);
	lines.push('', '**answer:**', '', report.answer || '(none)');
	return lines.join('\n');
}

/** Runs one scenario in its own session and writes its report; returns a line about it. */
async function runScenario(scenario, dir) {
	const session = scenario.name;
	const out = [`# ${scenario.name}`, '', scenario.about ?? '', ''];
	let usd = 0;
	let failures = 0;
	await call('/reset', { session });
	for (const [i, step] of scenario.steps.entries()) {
		let title;
		let report;
		try {
			if (step.follow) {
				// a user following the walkthrough: press what it lights, a step at a time (held keys
				// latched around the press, an encoder to turn turned a few detents)
				title = `follow the lit keys (up to ${step.follow} steps)`;
				const done = [];
				for (let k = 0; k < step.follow; k++) {
					const { keys } = await call('/lit', { session });
					const of = (kind) =>
						keys.filter((x) => x.endsWith(`:${kind}`)).map((x) => x.split(':')[0]);
					const hold = of('hold');
					const press = of('press');
					const turns = of('turn');
					if (press.length === 0 && turns.length === 0) break;
					const ids = [
						...hold.map((id) => `latch:${id}`),
						...press,
						...turns.map((id) => `turn:${id}:${step.detents ?? 4}`),
						...hold.map((id) => `latch:${id}`)
					];
					const result = await call('/press', { session, ids, timeoutMs: 5 * 60_000 });
					done.push(`${ids.join(' ')} → lit after: ${result.lit.keys.join(', ') || '(nothing)'}`);
					if (result.turn) report = result.turn;
				}
				out.push(`## ${i + 1}. ${title}`, '', ...done.map((d) => `- ${d}`), '');
				if (!report) {
					out.push('(no agent turn followed)', '');
					continue;
				}
			} else if (step.press) {
				title = `press ${step.press.join(', ')}`;
				const result = await call('/press', { session, ids: step.press });
				out.push(
					`## ${i + 1}. ${title}`,
					'',
					`lit after: ${result.lit.keys.join(', ') || '(nothing)'}${result.missing.length ? `; missing: ${result.missing.join(', ')}` : ''}`
				);
				report = result.turn;
				if (!report) {
					out.push('', '(no agent turn followed)', '');
					continue;
				}
			} else {
				const text = step.why ? WHY : step.debrief ? DEBRIEF : step.say;
				title = step.why ? 'why (what confused you?)' : step.debrief ? 'debrief' : `say: ${text}`;
				report = await call('/say', { session, text, files: step.files ?? [] });
				out.push(`## ${i + 1}. ${title}`, '');
				if (step.files?.length) out.push(`(attached: ${step.files.join(', ')})`, '');
			}
			usd += report.usd;
			failures += report.calls.filter((c) => c.isError).length;
			out.push(markdown(step, report), '');
		} catch (error) {
			out.push(
				`## ${i + 1}. ${title ?? 'step'}`,
				'',
				`**probe error:** ${error instanceof Error ? error.message : error}`,
				''
			);
		}
	}
	const { writeFileSync, mkdirSync } = await import('node:fs');
	mkdirSync(dir, { recursive: true });
	const file = resolve(dir, `${scenario.name}.md`);
	writeFileSync(file, out.join('\n'));
	await call('/close', { session }).catch(() => {});
	return `${scenario.name}: $${usd.toFixed(2)}, ${failures} failed calls → ${file}`;
}

try {
	switch (command) {
		case 'scenarios': {
			const { readFileSync } = await import('node:fs');
			const file = words[0];
			if (!file) throw new Error('scenarios <file.json> [--only a,b] [--parallel n]');
			const only = option('only')?.split(',');
			const all = JSON.parse(readFileSync(resolve(root, file), 'utf8'));
			const chosen = all.filter((s) => !only || only.includes(s.name));
			const parallel = Number(option('parallel') ?? 4);
			const dir = resolve(
				root,
				'evals/agent/out/probe/reports',
				new Date().toISOString().replace(/[:.]/g, '-')
			);
			const queue = [...chosen];
			const done = [];
			await Promise.all(
				Array.from({ length: Math.min(parallel, queue.length) }, async () => {
					for (let next = queue.shift(); next; next = queue.shift()) {
						const line = await runScenario(next, dir).catch(
							(e) => `${next.name}: failed (${e.message})`
						);
						console.log(line);
						done.push(line);
					}
				})
			);
			console.log(`reports in ${dir}`);
			break;
		}
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
