#!/usr/bin/env node
/**
 * Compares simulator pages with TE's guide art. For each scenario (`src/lib/sim/scenarios.ts`: the
 * core's and every area's), it renders the simulator's frame at 2×, aligns it with the guide picture
 * (`research/ui-reference/guide-screens`, git-ignored research input) and prints the mean absolute
 * luminance difference (MAD). For each one it writes a comparison image (ours, TE's, and the
 * difference in red) to look at.
 *
 *   node scripts/compare-screens.mjs                   every scenario
 *   node scripts/compare-screens.mjs prism tempo       some, by id
 *   node scripts/compare-screens.mjs --prefix arrange  ids starting with a prefix
 *   node scripts/compare-screens.mjs --out <dir>       images (default research/ui-reference/compare)
 *
 * Needs rsvg-convert (Homebrew librsvg) and uv (Pillow and numpy are fetched on demand). Runs the
 * simulator through Vite's SSR loader so `$lib` imports behave as in the app.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const args = process.argv.slice(2);
const flag = (name) => {
	const i = args.indexOf(name);
	return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const out = resolve(flag('--out') ?? 'research/ui-reference/compare');
const prefix = flag('--prefix');
const ids = args;

const { createServer } = await import('vite');
const server = await createServer({
	root,
	configFile: resolve(root, 'vite.config.ts'),
	server: { middlewareMode: true, hmr: false, ws: false },
	appType: 'custom',
	logLevel: 'error'
});
try {
	const { SCENARIOS } = await server.ssrLoadModule('/src/lib/sim/scenarios.ts');
	const { OpxySim } = await server.ssrLoadModule('/src/lib/sim/opxy-sim.svelte.ts');
	const { frameToSvg } = await server.ssrLoadModule('/src/lib/sim/screen/svg.ts');
	const chosen = SCENARIOS.filter(
		(s) => (ids.length === 0 || ids.includes(s.id)) && (!prefix || s.id.startsWith(prefix))
	);
	if (chosen.length === 0) throw new Error('no scenario matches');
	mkdirSync(out, { recursive: true });
	const pairs = [];
	for (const scenario of chosen) {
		const sim = new OpxySim({ now: () => 0 });
		scenario.setup(sim);
		const frame = sim.frame;
		const svg = join(out, `${scenario.id}.svg`);
		const png = join(out, `${scenario.id}.ours.png`);
		writeFileSync(svg, frameToSvg(frame, 2));
		execFileSync('rsvg-convert', [svg, '-o', png]);
		pairs.push({
			id: scenario.id,
			page: frame.page,
			expected: scenario.page,
			ours: png,
			guide: join(root, 'research/ui-reference/guide-screens', scenario.png),
			image: join(out, `${scenario.id}.compare.png`)
		});
	}
	const report = execFileSync(
		'uv',
		[
			'run',
			'--quiet',
			'--with',
			'pillow',
			'--with',
			'numpy',
			'python',
			join(root, 'scripts/compare_screens.py')
		],
		{ input: JSON.stringify(pairs), encoding: 'utf8' }
	);
	const results = JSON.parse(report);
	console.log('scenario'.padEnd(22), 'page'.padEnd(12), 'MAD'.padStart(7), '  offset');
	for (const r of results) {
		const wrong = r.page !== r.expected ? `  (expected page ${r.expected})` : '';
		const mad = r.error ? `  ${r.error}` : `${(r.mad * 100).toFixed(2)}%`.padStart(7);
		console.log(r.id.padEnd(22), r.page.padEnd(12), mad, `  ${r.offset ?? ''}${wrong}`);
	}
	console.log(`\nimages: ${out}`);
} finally {
	await server.close();
}
