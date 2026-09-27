#!/usr/bin/env node
/**
 * OP-XY agent eval runner. Runs the real conductor headless (auto-approving changes) against the
 * live Anthropic API with the owner's key, on the manual Q&A cases (cases/manual.json) and the device
 * tasks (cases/device.ts, against the fake OP-XY from test/fakes), scores answers with Claude as
 * judge and prints a scorecard. It spends real money: a full run is roughly $4–5 on Opus 5.5 (most
 * of it the conductor), re-judging saved answers about $0.30.
 *
 *   node evals/agent/run.mjs                      everything
 *   node evals/agent/run.mjs --only manual        Q&A only (or --only device)
 *   node evals/agent/run.mjs --ids 07-parameter-lock,tempo-96
 *   node evals/agent/run.mjs --limit 5 --concurrency 2
 *   node evals/agent/run.mjs --model claude-sonnet-5 --judge claude-haiku-4-5
 *   node evals/agent/run.mjs --manual ours        production parity: our manual only
 *   node evals/agent/run.mjs --rejudge results.json   re-grade saved answers (no agent calls)
 *   node evals/agent/run.mjs --out results.json   (default: a file in the OS temp directory)
 *
 * The key comes from $ANTHROPIC_API_KEY or .env (whichever value starts with sk-ant-) and is never
 * printed. --manual picks the manual: `combined` (default, what `pnpm dev` uses: our manual from
 * $lib/manual with the local guide scrape behind it as a dev-only supplement), `ours` (what
 * production ships) or `guide` (the scrape alone). The scorecard says which manual each answer drew
 * on: our units cited as [unit-id], guide sections linked, or whichever the manual tools returned.
 * Runs through Vite's SSR loader so `$lib` imports, runes and import.meta.glob behave as in the app.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const { createServer } = await import('vite');
const server = await createServer({
	root,
	configFile: resolve(root, 'vite.config.ts'),
	server: { middlewareMode: true, hmr: false, ws: false },
	appType: 'custom',
	logLevel: 'error'
});
try {
	const run = await server.ssrLoadModule(resolve(root, 'evals/agent/run.ts'));
	await run.main(process.argv.slice(2));
} catch (error) {
	console.error('eval failed:', error instanceof Error ? error.stack : error);
	process.exitCode = 1;
} finally {
	await server.close();
}
