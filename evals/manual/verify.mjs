#!/usr/bin/env node
/**
 * Runs the manual verifier (verify.ts): every procedure of our manual played on the replica's
 * simulator and judged from its screens, every parameter name compared with the replica's label.
 * Writes evals/manual/out/report.json and docs/research/63-manual-verification.md.
 * The judge makes real API calls with the owner's key from $ANTHROPIC_API_KEY or .env (never
 * printed): Claude Haiku 4.5, about $0.60 for a full run from an empty cache, nothing for
 * procedures already judged (evals/manual/out/judge-cache.json).
 *
 *   node evals/manual/verify.mjs [--units sequencer,howto.pluck] [--no-judge] [--batch 8]
 *        [--concurrency 4] [--budget 3] [--model claude-haiku-4-5] [--print]
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
	const run = await server.ssrLoadModule(resolve(root, 'evals/manual/verify.ts'));
	await run.main(process.argv.slice(2));
} catch (error) {
	console.error('verification failed:', error instanceof Error ? error.stack : error);
	process.exitCode = 1;
} finally {
	await server.close();
}
