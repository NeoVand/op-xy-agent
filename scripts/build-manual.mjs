#!/usr/bin/env node
/**
 * build-manual.mjs — validates our reworded OP-XY manual and builds its artefacts.
 *
 * Inputs
 *   knowledge/manual/units/<area>/<slug>.md   the units (YAML front-matter + prose), ours
 *   docs/research/*.md                         research notes units may cite (probe log, …)
 *   knowledge/official/                        TE's text, git-ignored and optional: when present,
 *                                              guide anchors are checked, the verbatim guard runs
 *                                              (no 8-word run copied from TE) and coverage is computed
 * Outputs (committed; they are our own words)
 *   knowledge/manual/build/manual.json         validated units for the app
 *   knowledge/manual/build/manual.md           deterministic prompt bundle for the agent
 *   knowledge/manual/build/search-index.json   MiniSearch index
 *   knowledge/manual/build/coverage.json       guide sections covered (only rewritten with the scrape)
 *
 * The logic lives in src/lib/manual (build.ts is pure and tested); this file only loads cli.ts
 * through Vite's module runner so TypeScript and the $lib / $knowledge aliases work in Node.
 *
 * Usage
 *   node scripts/build-manual.mjs                 build (see --help for --check, --coverage, …)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { module } = await runnerImport(path.join(ROOT, 'src/lib/manual/cli.ts'), {
	configFile: false,
	root: ROOT,
	logLevel: 'error',
	resolve: {
		alias: { $lib: path.join(ROOT, 'src/lib'), $knowledge: path.join(ROOT, 'knowledge') }
	}
});

process.exitCode = module.main(process.argv.slice(2), ROOT);
