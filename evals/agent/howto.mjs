#!/usr/bin/env node
/**
 * Runs the how-to eval (howto.ts): the agent plans steps to pages and values, guides the
 * replica, and sets sounds up from an idea; we check its steps and what it left.
 * Real API calls with the owner's key from $ANTHROPIC_API_KEY or .env (never printed), about $1 a run.
 *
 *   node evals/agent/howto.mjs [--ids cutoff,tempo] [--model claude-sonnet-5]
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
	const run = await server.ssrLoadModule(resolve(root, 'evals/agent/howto.ts'));
	await run.main(process.argv.slice(2));
} catch (error) {
	console.error('eval failed:', error instanceof Error ? error.stack : error);
	process.exitCode = 1;
} finally {
	await server.close();
}
