#!/usr/bin/env node
/**
 * build-device-map.mjs — exports the device map from the simulator (Phase F4, with F3's screen
 * descriptions).
 *
 * Input   the simulator (src/lib/sim), its navigator, the CC map (knowledge/midi/cc-map.json) and
 *         the manual build (knowledge/manual/build/manual.json)
 * Output  knowledge/opxy/device-map.json (committed; our own data): every page with its keys from
 *         a new project, its screen description, and each encoder per layer with its label, range,
 *         display format, CC lane and whether MIDI reaches it on OS 1.1.33
 *
 * The logic lives in src/lib/sim/device-map.ts (tested, including a test that fails while the
 * committed map is stale); this file loads device-map-cli.ts through Vite's SSR loader, because the
 * simulator's `.svelte.ts` modules need the Svelte compiler.
 *
 * Usage
 *   node scripts/build-device-map.mjs            build and write the map
 *   node scripts/build-device-map.mjs --check    fail if the committed map is stale
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
	const cli = await server.ssrLoadModule(resolve(root, 'src/lib/sim/device-map-cli.ts'));
	process.exitCode = cli.main(process.argv.slice(2), root);
} catch (error) {
	console.error('device map failed:', error instanceof Error ? error.stack : error);
	process.exitCode = 1;
} finally {
	await server.close();
}
