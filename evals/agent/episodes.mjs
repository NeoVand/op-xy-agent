#!/usr/bin/env node
/**
 * Runs the episodes eval (episodes.ts): simulated users with a persona and a goal talk to the agent
 * and act on the replica with their own key presses; success is read from the replica's state.
 * Every run is saved under evals/agent/out/ for the transcript viewer. Real API calls with the
 * owner's keys from $ANTHROPIC_API_KEY / $OPENAI_API_KEY or .env (never printed), roughly
 * $0.3–0.8 an episode.
 *
 * The Vite server also listens on a local port, for the eval's ears: a headless Chromium page that
 * renders the replica's sound when the agent or the user listens (render/page.ts). --no-ears goes
 * without.
 *
 *   node evals/agent/episodes.mjs [--ids first-jam,pump] [--persona beginner] [--user-model gpt-6-sol]
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
	server: { port: 5298, strictPort: false, hmr: false, ws: false, fs: { allow: [root] } },
	appType: 'custom',
	logLevel: 'error'
});
try {
	await server.listen();
	const url = server.resolvedUrls?.local[0]?.replace(/\/$/, '');
	if (url) process.env.EVAL_EARS_URL = url;
	const run = await server.ssrLoadModule(resolve(root, 'evals/agent/episodes.ts'));
	await run.main(process.argv.slice(2));
} catch (error) {
	console.error('eval failed:', error instanceof Error ? error.stack : error);
	process.exitCode = 1;
} finally {
	await server.close();
}
