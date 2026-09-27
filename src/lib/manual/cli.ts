/**
 * Command line for the manual build (Node only — never import this from app code). Run it through
 * `node scripts/build-manual.mjs`, which loads this module with Vite so `$lib` / `$knowledge`
 * aliases and TypeScript work.
 *
 * Reads `knowledge/manual/units/**.md`, `docs/research/*.md` and, when present, the local scrape in
 * `knowledge/official/`; writes `knowledge/manual/build/`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BUILD_DIR, BUILD_FILES, buildManual, formatIssue, type BuildOutputs } from './build';
import { formatCoverageReport } from './coverage';
import { loadOfficialCorpus, type OfficialCorpus } from './official';
import { UNITS_DIR, type UnitFile } from './validate';

const USAGE = `usage: node scripts/build-manual.mjs [options]

  (no option)       validate every unit and write knowledge/manual/build/
  --check           validate and fail if the committed build is stale (writes nothing)
  --coverage        print every official guide section no unit cites yet
  --json            with --coverage: machine-readable output
  --allow-dangling  related ids of units not written yet are warnings (fan-out work in progress)
  --quiet           print errors only
`;

const OFFICIAL_DIR = 'knowledge/official';
const RESEARCH_DIR = 'docs/research';
const VERBATIM_ALLOW = 'knowledge/manual/verbatim-allow.json';

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.flatMap((entry) => {
			const full = path.join(dir, entry.name);
			return entry.isDirectory() ? walk(full) : [full];
		})
		.sort();
}

/** Reads the scrape when present; undefined when `knowledge/official/` is missing (CI). */
function readOfficial(root: string): OfficialCorpus | undefined {
	const dir = path.join(root, OFFICIAL_DIR);
	if (!existsSync(path.join(dir, 'index.json'))) return undefined;
	const read = (file: string) => readFileSync(path.join(dir, file), 'utf8');
	const guide: Record<string, string> = {};
	for (const file of readdirSync(path.join(dir, 'guide')).sort()) {
		if (file.endsWith('.md')) guide[file] = read(path.join('guide', file));
	}
	const extras: Record<string, string> = {};
	for (const file of ['changelog.md', 'specs.md', 'fieldkit.md', 'sound-packs.md']) {
		if (existsSync(path.join(dir, file))) extras[file] = read(file);
	}
	return loadOfficialCorpus({
		index: read('index.json'),
		chunks: read('chunks.jsonl'),
		changelog: read('changelog.json'),
		guide,
		extras
	});
}

function readVerbatimAllow(root: string): string[] {
	const file = path.join(root, VERBATIM_ALLOW);
	if (!existsSync(file)) return [];
	const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
	if (
		!Array.isArray(data) ||
		!data.every(
			(e) =>
				typeof e === 'object' &&
				e !== null &&
				typeof e.phrase === 'string' &&
				typeof e.reason === 'string'
		)
	) {
		throw new Error(`${VERBATIM_ALLOW} must be an array of { "phrase": …, "reason": … }`);
	}
	return data.map((e: { phrase: string }) => e.phrase);
}

/**
 * Runs the CLI.
 * @param argv arguments after the script name
 * @param root repository root
 * @returns the process exit code
 */
export function main(argv: readonly string[], root: string): number {
	const flags = new Set(argv);
	const known = ['--check', '--coverage', '--json', '--allow-dangling', '--quiet', '--help'];
	const unknown = [...flags].filter((f) => !known.includes(f));
	if (flags.has('--help') || unknown.length > 0) {
		if (unknown.length > 0) console.error(`unknown option(s): ${unknown.join(' ')}`);
		console.log(USAGE);
		return unknown.length > 0 ? 2 : 0;
	}
	const quiet = flags.has('--quiet');
	const log = (line: string) => {
		if (!quiet) console.log(line);
	};

	const units: UnitFile[] = walk(path.join(root, UNITS_DIR))
		.filter((file) => file.endsWith('.md'))
		.map((file) => ({
			path: path.relative(root, file).split(path.sep).join('/'),
			text: readFileSync(file, 'utf8')
		}));
	const research: Record<string, string> = {};
	for (const file of walk(path.join(root, RESEARCH_DIR)).filter((f) => f.endsWith('.md'))) {
		research[path.relative(root, file).split(path.sep).join('/')] = readFileSync(file, 'utf8');
	}
	const official = readOfficial(root);
	const result = buildManual({
		units,
		official,
		research,
		allowDangling: flags.has('--allow-dangling'),
		verbatimAllow: readVerbatimAllow(root)
	});

	for (const issue of result.errors) console.error(formatIssue(issue));
	for (const issue of result.warnings) log(formatIssue(issue));
	if (!official) {
		log(
			`note: ${OFFICIAL_DIR}/ not found — skipped guide-anchor checks, the verbatim guard and coverage (run scripts/ingest-guide.mjs to enable them)`
		);
	}
	if (!result.ok || !result.outputs || !result.manual) {
		console.error(
			`manual build failed: ${result.errors.length} error(s) in ${units.length} unit(s)`
		);
		return 1;
	}

	const outputs: [string, keyof BuildOutputs][] = [
		[BUILD_FILES.manual, 'manualJson'],
		[BUILD_FILES.bundle, 'promptBundle'],
		[BUILD_FILES.searchIndex, 'searchIndexJson'],
		[BUILD_FILES.coverage, 'coverageJson']
	];
	const buildDir = path.join(root, BUILD_DIR);
	let stale = 0;
	for (const [file, key] of outputs) {
		const content = result.outputs[key];
		if (content === null) continue; // coverage without the scrape: keep the committed file
		const target = path.join(buildDir, file);
		const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
		if (current === content) continue;
		if (flags.has('--check')) {
			console.error(`stale: ${BUILD_DIR}/${file} (run node scripts/build-manual.mjs)`);
			stale++;
		} else {
			mkdirSync(buildDir, { recursive: true });
			writeFileSync(target, content);
			log(`wrote ${BUILD_DIR}/${file}`);
		}
	}

	const { stats } = result.manual;
	log(
		`manual: ${stats.units} units, ${stats.facts} facts, ${stats.procedures} procedures, ${stats.parameters} parameters, ${stats.verified_items} verified on a device, ~${stats.words} words` +
			(result.verbatimChecked ? '; verbatim guard passed' : '')
	);
	// ~3.6 characters per token for this kind of text; measure exactly with the API's token counter.
	const bundle = result.outputs.promptBundle;
	log(
		`prompt bundle: ${(bundle.length / 1024).toFixed(1)} KB, ~${Math.round(bundle.length / 3.6 / 100) / 10}k tokens (≈${Math.round(bundle.length / 3.6 / stats.units)} per unit)`
	);
	if (result.coverage) {
		if (flags.has('--coverage') && flags.has('--json')) {
			console.log(
				JSON.stringify(
					{
						guide_version: result.coverage.guideVersion,
						total: result.coverage.total,
						covered: result.coverage.covered,
						percent: result.coverage.percent,
						uncovered: result.coverage.uncovered
					},
					null,
					2
				)
			);
		} else log(formatCoverageReport(result.coverage, flags.has('--coverage')));
	} else if (flags.has('--coverage')) {
		console.error('coverage needs the local scrape in knowledge/official/');
		return 1;
	}
	return stale > 0 ? 1 : 0;
}
