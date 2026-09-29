#!/usr/bin/env node
/**
 * Runs the quality eval (quality.ts): hard manual questions, showing on the replica, composing,
 * kits played on the replica, follow-ups and refusals, scored by checks, lints and a rubric judge;
 * every transcript is saved under evals/agent/out/.
 * Real API calls with the owner's key from $ANTHROPIC_API_KEY or .env (never printed), about $4 a full run.
 *
 * The Vite server also listens on a local port, for the eval's ears: a headless Chromium page that
 * renders the replica's sound when the agent listens (render/page.ts). --no-ears goes without.
 *
 *   node evals/agent/quality.mjs [--ids a,b] [--category compose] [--model claude-sonnet-5-5]
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const { createServer } = await import('vite');
const server = await createServer({
	root,
	configFile: resolve(root, 'vite.config.ts'),
	// the ears' page loads its modules from evals/agent/render, outside SvelteKit's served folders
	server: { port: 5299, strictPort: false, hmr: false, ws: false, fs: { allow: [root] } },
	appType: 'custom',
	logLevel: 'error'
});
try {
	await server.listen();
	const url = server.resolvedUrls?.local[0]?.replace(/\/$/, '');
	if (url) process.env.EVAL_EARS_URL = url;
	const run = await server.ssrLoadModule(resolve(root, 'evals/agent/quality.ts'));
	await run.main(process.argv.slice(2));
} catch (error) {
	console.error('eval failed:', error instanceof Error ? error.stack : error);
	process.exitCode = 1;
} finally {
	await server.close();
}
