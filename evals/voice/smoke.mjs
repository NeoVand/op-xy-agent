#!/usr/bin/env node
/**
 * Voice smoke test against the live OpenAI API: mints the app's exact realtime session for every
 * voice model and mode (free), then runs a text-only round trip over WebSocket (about a cent) to
 * check that questions reach ask_claude and approvals are put to the user. See evals/voice/smoke.ts.
 *
 *   node evals/voice/smoke.mjs                    key from $OPENAI_API_KEY or ./.env
 *   node evals/voice/smoke.mjs --env ../.env      another .env
 *   node evals/voice/smoke.mjs --mint-only        the free part only
 *
 * No key or client-secret value is ever printed. Runs through Vite's SSR loader so `$lib` imports
 * behave as in the app.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2).map((arg, i, all) =>
	// A relative --env path is taken from where the command was run.
	all[i - 1] === '--env' ? resolve(process.cwd(), arg) : arg
);
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
	const smoke = await server.ssrLoadModule(resolve(root, 'evals/voice/smoke.ts'));
	await smoke.main(argv);
} finally {
	await server.close();
}
