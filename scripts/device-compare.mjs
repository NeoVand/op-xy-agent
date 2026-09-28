#!/usr/bin/env node
/**
 * Compares simulator frames with the device's own screens, captured by camera and realigned
 * (research/device/captures/aligned, git-ignored; docs/research/59-screen-profiling.md). For each
 * case it renders the frame at 2× and maps the capture onto the same 220-row design grid. The lit
 * capture spans 222 rows, so it is scaled by 220/222. Then it measures how far apart their lines
 * are: the chamfer distance, in design pixels, from every bright pixel of one to the nearest bright
 * pixel of the other, both ways. It writes an overlay per case: the simulator in red, the device in
 * green, and yellow where they agree.
 *
 *   node scripts/device-compare.mjs --envelope [--out DIR]   the M2 envelope states (env2-amp runs)
 *   node scripts/device-compare.mjs --cases cases.json      [{ name, frame, capture }, …]
 *
 * Needs rsvg-convert and uv. Colours are not compared (the camera shifts them); geometry is.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const args = process.argv.slice(2);
const flag = (name) => {
	const i = args.indexOf(name);
	return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const out = resolve(flag('--out') ?? 'research/ui-reference/device-compare');
const casesPath = flag('--cases');
const captures = resolve('research/device/captures');

/** The envelope runs' states as simulator frames (CC values 0–127 → the view's 0–1). */
function envelopeCases() {
	const index = JSON.parse(readFileSync(join(captures, 'screens/env2-amp.json'), 'utf8'));
	const wanted =
		/^(ref|amp-attack-(032|064|127)|amp-decay-(032|127)|amp-sustain-(032|100)|amp-release-(000|064|112)|amp-x|both-)/;
	const toView = ([a, d, s, r]) => ({
		attack: a / 127,
		decay: d / 127,
		sustain: s / 127,
		release: r / 127
	});
	return index.states
		.filter((st) => wanted.test(st.label))
		.map((st) => ({
			name: `env-${st.label}`,
			capture: `aligned/env2-amp-${String(st.n).padStart(3, '0')}.png`,
			frame: { page: 'envelope', amp: toView(st.amp), filter: toView(st.filter), selected: 'amp' }
		}));
}

const cases = casesPath
	? JSON.parse(readFileSync(casesPath, 'utf8'))
	: args.includes('--envelope')
		? envelopeCases()
		: null;
if (!cases) {
	console.log('usage: node scripts/device-compare.mjs --envelope | --cases FILE');
	process.exit(1);
}

const { createServer } = await import('vite');
const server = await createServer({
	root,
	configFile: resolve(root, 'vite.config.ts'),
	server: { middlewareMode: true, hmr: false, ws: false },
	appType: 'custom',
	logLevel: 'error'
});
try {
	const { frameToSvg } = await server.ssrLoadModule('/src/lib/sim/screen/svg.ts');
	mkdirSync(join(out, 'sim'), { recursive: true });
	const jobs = [];
	for (const c of cases) {
		const capture = join(captures, c.capture);
		if (!existsSync(capture)) {
			console.log(`${c.name}: no capture ${c.capture}`);
			continue;
		}
		const svg = join(out, 'sim', `${c.name}.svg`);
		const png = join(out, 'sim', `${c.name}.png`);
		writeFileSync(svg, frameToSvg(c.frame, 2));
		execFileSync('rsvg-convert', ['-o', png, svg]);
		jobs.push({ name: c.name, sim: png, device: capture, out: join(out, `${c.name}.png`) });
	}
	const py = `
import json, sys
import numpy as np, cv2
jobs = json.loads(sys.argv[1])
rows = []
for j in jobs:
    sim = cv2.cvtColor(cv2.imread(j['sim']), cv2.COLOR_BGR2GRAY).astype(np.float32)
    dev = cv2.cvtColor(cv2.imread(j['device']), cv2.COLOR_BGR2GRAY)
    dev = cv2.resize(dev, (sim.shape[1], sim.shape[0]), interpolation=cv2.INTER_AREA).astype(np.float32)
    s, d = sim > 110, dev > 110
    ds = cv2.distanceTransform((~s).astype(np.uint8), cv2.DIST_L2, 3)
    dd = cv2.distanceTransform((~d).astype(np.uint8), cv2.DIST_L2, 3)
    dev_to_sim = float(ds[d].mean()) / 2 if d.any() else 0.0
    sim_to_dev = float(dd[s].mean()) / 2 if s.any() else 0.0
    p90 = float(np.percentile(ds[d], 90)) / 2 if d.any() else 0.0
    over = np.zeros(sim.shape + (3,), np.uint8)
    over[..., 2] = np.clip(sim, 0, 255)
    over[..., 1] = np.clip(dev, 0, 255)
    cv2.imwrite(j['out'], np.vstack([cv2.cvtColor(sim.astype(np.uint8), cv2.COLOR_GRAY2BGR),
                                     cv2.cvtColor(dev.astype(np.uint8), cv2.COLOR_GRAY2BGR), over]))
    rows.append((j['name'], dev_to_sim, sim_to_dev, p90))
for name, a, b, p in rows:
    print(f"{name:34s} device->sim {a:5.2f} px  sim->device {b:5.2f} px  p90 {p:5.2f}")
print(f"mean device->sim {np.mean([r[1] for r in rows]):.2f} px, sim->device {np.mean([r[2] for r in rows]):.2f} px over {len(rows)} cases")
`;
	execFileSync(
		'uv',
		[
			'run',
			'--quiet',
			'--with',
			'opencv-python-headless',
			'--with',
			'numpy',
			'python',
			'-c',
			py,
			JSON.stringify(jobs)
		],
		{ stdio: 'inherit' }
	);
	console.log(`images in ${out}`);
} finally {
	await server.close();
}
