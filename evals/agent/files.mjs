#!/usr/bin/env node
/**
 * Runs the files eval (files.ts): the agent reads attached scores and a MIDI file and plays them on
 * the fake OP-XY; its notes are compared with the score. Real API calls with the owner's key from
 * $ANTHROPIC_API_KEY or .env (never printed), about $1 a run.
 *
 *   node evals/agent/files.mjs [--ids ode-c,midi-jacques] [--model claude-sonnet-5]
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
	const run = await server.ssrLoadModule(resolve(root, 'evals/agent/files.ts'));
	await run.main(process.argv.slice(2));
} catch (error) {
	console.error('eval failed:', error instanceof Error ? error.stack : error);
	process.exitCode = 1;
} finally {
	await server.close();
}
