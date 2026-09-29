#!/usr/bin/env node
/**
 * Checks the eval's ears (ears.ts) without the API: a beat programmed with the agent's tools,
 * rendered through the replica's sound in headless Chromium, and what listen makes of it.
 *
 *   node evals/agent/ears.mjs [--stand-ins]
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const { createServer } = await import('vite');
const server = await createServer({
	root,
	configFile: resolve(root, 'vite.config.ts'),
	server: { port: 5299, strictPort: false, hmr: false, ws: false, fs: { allow: [root] } },
	appType: 'custom',
	logLevel: 'error'
});
try {
	await server.listen();
	const url = server.resolvedUrls?.local[0]?.replace(/\/$/, '');
	if (url) process.env.EVAL_EARS_URL = url;
	const run = await server.ssrLoadModule(resolve(root, 'evals/agent/ears.ts'));
	await run.main(process.argv.slice(2));
} catch (error) {
	console.error('ears failed:', error instanceof Error ? error.stack : error);
	process.exitCode = 1;
} finally {
	await server.close();
}
