#!/usr/bin/env node
/**
 * Probes the API's limits on the conductor's strict tools (grammar.ts): the compiled grammar's size
 * and the number of strict tools. An 8-token request per step with the owner's key from
 * $ANTHROPIC_API_KEY or .env (never printed); a fraction of a cent.
 *
 *   node evals/agent/grammar.mjs
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
	const run = await server.ssrLoadModule(resolve(root, 'evals/agent/grammar.ts'));
	await run.main(process.argv.slice(2));
} catch (error) {
	console.error('probe failed:', error instanceof Error ? error.stack : error);
	process.exitCode = 1;
} finally {
	await server.close();
}
