/**
 * Command line for the device map (Node only — never import this from app code). Run it through
 * `node scripts/build-device-map.mjs`, which loads this module with Vite: the simulator's runes and
 * the `$lib` / `$knowledge` aliases need it. Writes `knowledge/opxy/device-map.json`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEVICE_MAP_FILE, buildDeviceMap, formatDeviceMap } from './device-map';

const USAGE = `usage: node scripts/build-device-map.mjs [--check]

  (no option)  build the map from the simulator and write ${DEVICE_MAP_FILE}
  --check      fail if the committed map is stale (writes nothing)
`;

/**
 * Runs the CLI.
 * @param argv arguments after the script name
 * @param root repository root
 * @returns the process exit code
 */
export function main(argv: readonly string[], root: string): number {
	const flags = new Set(argv);
	const unknown = [...flags].filter((flag) => flag !== '--check' && flag !== '--help');
	if (flags.has('--help') || unknown.length > 0) {
		if (unknown.length > 0) console.error(`unknown option(s): ${unknown.join(' ')}`);
		console.log(USAGE);
		return unknown.length > 0 ? 2 : 0;
	}
	const map = buildDeviceMap();
	const text = formatDeviceMap(map);
	const controls = map.pages.reduce((n, page) => n + page.controls.length, 0);
	const summary = `${map.pages.length} pages, ${controls} controls, ${(text.length / 1024).toFixed(0)} KB`;
	const target = path.join(root, DEVICE_MAP_FILE);
	if (existsSync(target) && readFileSync(target, 'utf8') === text) {
		console.log(`device map up to date: ${summary}`);
		return 0;
	}
	if (flags.has('--check')) {
		console.error(`stale: ${DEVICE_MAP_FILE} (run node scripts/build-device-map.mjs)`);
		return 1;
	}
	writeFileSync(target, text);
	console.log(`wrote ${DEVICE_MAP_FILE}: ${summary}`);
	return 0;
}
