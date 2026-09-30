#!/usr/bin/env node
/**
 * Runs the honesty check (honesty.ts) over saved runs: every claim an answer makes about what the
 * agent did, checked against its tool results and the replica's changes.
 * Real API calls with the owner's key from $ANTHROPIC_API_KEY or .env (never printed), a few cents a turn.
 *
 *   node evals/agent/honesty.mjs evals/agent/out/v23-quality.json [--ids a,b] [--judge claude-opus-5-5]
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const files = process.argv.slice(2).map((a) => (a.endsWith('.json') ? resolve(a) : a));
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
	const run = await server.ssrLoadModule(resolve(root, 'evals/agent/honesty.ts'));
	await run.main(files);
} catch (error) {
	console.error('honesty check failed:', error instanceof Error ? error.stack : error);
	process.exitCode = 1;
} finally {
	await server.close();
}
