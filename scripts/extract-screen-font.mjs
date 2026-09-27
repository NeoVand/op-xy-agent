#!/usr/bin/env node
/**
 * extract-screen-font.mjs — builds the OP-XY screen font and the screen pictograms from the screen
 * illustrations in Teenage Engineering's public OP-XY guide (decision D9; credited in NOTICE.md).
 *
 * Inputs (git-ignored research, re-create with scripts/fetch-research.sh)
 *   research/ui-reference/guide-screens/index.json — the 53 guide illustrations that show the screen
 *   research/ui-reference/guide-svg/<chapter>/NNN_<asset>.svg — their original vectors (text outlined)
 *
 * Outputs (committed)
 *   knowledge/opxy/screen-font.json  — one outline per character in font units (1000 / em, y down,
 *                                      origin at the pen position on the baseline), advances, the
 *                                      space, kerning pairs, vertical metrics, observed text sizes
 *   knowledge/opxy/screen-icons.json — named pictograms (paths in screen pixels, origin top-left)
 *
 * How
 *   1. Read each SVG (paths, rects, groups, inline masks); the first shape is the screen frame. Every
 *      frame measures 480 × 220 px at 0.4479 units per pixel (TE drew the UI at 480 × 220), so all
 *      geometry is mapped to screen pixels.
 *   2. Glyph candidates are small filled paths without a stroke. Candidates of one colour that sit
 *      side by side on one line become a run (a string on screen).
 *   3. LABELS below lists, per screen, the strings it shows in reading order (transcribed from the
 *      art). Runs are matched to strings by glyph count; each glyph becomes a sample of a character.
 *   4. Sizes: glyph heights factor into a per-character height × a per-run text size (alternating
 *      least squares); the scale is anchored so the list text is 20 px, which puts every other size
 *      on (or within a few hundredths of) a whole pixel. Baselines factor the same way from glyph
 *      bottoms (descenders and overshoots become per-character offsets).
 *   5. Spacing: the gap between neighbours is rsb(a) + lsb(b) (+ the space for a word break); a
 *      least-squares solve over every pair gives side bearings, advances and the space; consistent
 *      leftovers become kerning pairs.
 *   6. The largest sample of each character becomes its outline; every other sample is compared
 *      with it (bounding box and sampled outline distance) and the worst deviations are reported.
 *   7. Pictograms: ICONS below names boxes on specific screens; every non-text shape inside is kept.
 *
 * Deterministic: the output depends only on the inputs. Formatted with the repo's Prettier config.
 *
 * Usage
 *   node scripts/extract-screen-font.mjs            write both files and print the report
 *   node scripts/extract-screen-font.mjs --check    exit 1 when a committed file is stale
 *   node scripts/extract-screen-font.mjs --runs [screen-prefix]   print the text runs (calibration)
 *   node scripts/extract-screen-font.mjs --quiet    no report
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePathData } from './build-replica-art.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = 'research/ui-reference/guide-screens/index.json';
const FONT_OUT = 'knowledge/opxy/screen-font.json';
const ICONS_OUT = 'knowledge/opxy/screen-icons.json';
/** Each area's pictograms (`scripts/screen-art/<area>.mjs`) go to their own file here. */
const AREA_ICONS_DIR = 'knowledge/opxy/screen-icons';

/** The screen as TE drew it. */
const SCREEN = { width: 480, height: 220 };
/** Font units per em. */
const UPM = 1000;

// ─────────────────────────────────────────────────────────────────────────── small helpers

const round = (n, decimals = 2) => {
	const r = Number(n.toFixed(decimals));
	return Object.is(r, -0) ? 0 : r;
};
const median = (xs) => {
	if (xs.length === 0) return NaN;
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const emptyBox = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
const unionBox = (a, b) => ({
	x0: Math.min(a.x0, b.x0),
	y0: Math.min(a.y0, b.y0),
	x1: Math.max(a.x1, b.x1),
	y1: Math.max(a.y1, b.y1)
});
const boxW = (b) => b.x1 - b.x0;
const boxH = (b) => b.y1 - b.y0;

/** Screen-name key of an index entry: `guide-screens/tempo-005-….png` → `tempo-005`. */
const screenKey = (entry) => /([a-z-]+-\d{3})/.exec(path.basename(entry.png))[1];

// ─────────────────────────────────────────────────────────────────────────── SVG reading

const KAPPA = 0.5522847498;

/** Path data for a rect (optionally rounded) or circle element. */
function elementPathData(tag, a) {
	if (tag === 'rect') {
		const x = Number(a.x ?? 0);
		const y = Number(a.y ?? 0);
		const w = Number(a.width);
		const h = Number(a.height);
		const r = Math.min(Number(a.rx ?? a.ry ?? 0), w / 2, h / 2);
		if (!r) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
		const c = r * (1 - KAPPA);
		return (
			`M${x + r} ${y}H${x + w - r}C${x + w - c} ${y} ${x + w} ${y + c} ${x + w} ${y + r}` +
			`V${y + h - r}C${x + w} ${y + h - c} ${x + w - c} ${y + h} ${x + w - r} ${y + h}` +
			`H${x + r}C${x + c} ${y + h} ${x} ${y + h - c} ${x} ${y + h - r}` +
			`V${y + r}C${x} ${y + c} ${x + c} ${y} ${x + r} ${y}Z`
		);
	}
	if (tag === 'circle' || tag === 'ellipse') {
		const cx = Number(a.cx ?? 0);
		const cy = Number(a.cy ?? 0);
		const rx = Number(a.r ?? a.rx);
		const ry = Number(a.r ?? a.ry);
		const kx = rx * KAPPA;
		const ky = ry * KAPPA;
		return (
			`M${cx + rx} ${cy}C${cx + rx} ${cy + ky} ${cx + kx} ${cy + ry} ${cx} ${cy + ry}` +
			`C${cx - kx} ${cy + ry} ${cx - rx} ${cy + ky} ${cx - rx} ${cy}` +
			`C${cx - rx} ${cy - ky} ${cx - kx} ${cy - ry} ${cx} ${cy - ry}` +
			`C${cx + kx} ${cy - ry} ${cx + rx} ${cy - ky} ${cx + rx} ${cy}Z`
		);
	}
	if (tag === 'line') return `M${a.x1} ${a.y1}L${a.x2} ${a.y2}`;
	return a.d ?? null;
}

/** Applies a map to every point of parsed subpaths (returns new subpaths with boxes). */
function mapSubpaths(subpaths, map) {
	return subpaths.map((sp) => {
		const segs = sp.segs.map((seg) =>
			seg.type === 'C'
				? { type: 'C', c1: map(seg.c1), c2: map(seg.c2), to: map(seg.to) }
				: { type: 'L', to: map(seg.to) }
		);
		const out = { start: map(sp.start), segs, closed: sp.closed };
		out.box = subpathsBox([out]);
		return out;
	});
}

/** Exact bounding box of subpaths (cubic extrema included). */
function subpathsBox(subpaths) {
	let box = emptyBox();
	for (const sp of subpaths) {
		const grow = ([x, y]) => {
			box = unionBox(box, { x0: x, y0: y, x1: x, y1: y });
		};
		grow(sp.start);
		let from = sp.start;
		for (const seg of sp.segs) {
			grow(seg.to);
			if (seg.type === 'C') {
				for (const axis of [0, 1]) {
					for (const t of cubicTurns(from[axis], seg.c1[axis], seg.c2[axis], seg.to[axis])) {
						grow(cubicPoint(from, seg.c1, seg.c2, seg.to, t));
					}
				}
			}
			from = seg.to;
		}
	}
	return box;
}

function cubicPoint(p0, p1, p2, p3, t) {
	const mt = 1 - t;
	const a = mt * mt * mt;
	const b = 3 * mt * mt * t;
	const c = 3 * mt * t * t;
	const d = t * t * t;
	return [
		a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
		a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]
	];
}

function cubicTurns(p0, p1, p2, p3) {
	const A = p1 - p0;
	const B = p2 - p1;
	const C = p3 - p2;
	const a = A - 2 * B + C;
	const b = 2 * (B - A);
	const roots = [];
	if (Math.abs(a) < 1e-12) {
		if (Math.abs(b) > 1e-12) roots.push(-A / b);
	} else {
		const disc = b * b - 4 * a * A;
		if (disc >= 0) {
			const s = Math.sqrt(disc);
			roots.push((-b + s) / (2 * a), (-b - s) / (2 * a));
		}
	}
	return roots.filter((t) => t > 0 && t < 1);
}

/** Points along subpaths: every vertex plus `n` samples inside each curve. */
function samplePoints(subpaths, n = 8) {
	const pts = [];
	for (const sp of subpaths) {
		pts.push(sp.start);
		let from = sp.start;
		for (const seg of sp.segs) {
			if (seg.type === 'C') {
				for (let k = 1; k < n; k++) pts.push(cubicPoint(from, seg.c1, seg.c2, seg.to, k / n));
			}
			pts.push(seg.to);
			from = seg.to;
		}
	}
	return pts;
}

const ATTR = /([\w:-]+)="([^"]*)"/g;
const TAG = /<(\/?)([a-zA-Z]+)\b([^>]*?)(\/?)>/g;

/**
 * Reads one guide screen SVG into shapes in screen pixels.
 * @param {string} svgText
 */
export function readScreen(svgText) {
	/** @type {{ tag: string, fill: string, stroke: string, strokeWidth: number, opacity: number, evenOdd: boolean, lineCap: string|null, lineJoin: string|null, mask: string|null, subpaths: any[] }[]} */
	const raw = [];
	const masks = new Map();
	const stack = [{ opacity: 1, mask: null, inMask: null, skip: false }];
	for (const m of svgText.matchAll(TAG)) {
		const [, closing, tag, attrText, selfClosing] = m;
		const top = stack[stack.length - 1];
		if (closing) {
			if (['g', 'mask', 'defs', 'clipPath', 'svg'].includes(tag)) stack.pop();
			continue;
		}
		const a = Object.fromEntries([...attrText.matchAll(ATTR)].map((x) => [x[1], x[2]]));
		if (tag === 'svg') {
			stack.push({ ...top, rootFill: a.fill ?? 'black' });
			continue;
		}
		if (tag === 'defs' || tag === 'clipPath') {
			if (!selfClosing) stack.push({ ...top, skip: true });
			continue;
		}
		if (tag === 'mask') {
			masks.set(a.id, []);
			if (!selfClosing) stack.push({ ...top, inMask: a.id });
			continue;
		}
		if (tag === 'g') {
			if (!selfClosing) {
				const maskId = /url\(#([^)]+)\)/.exec(a.mask ?? '')?.[1] ?? null;
				stack.push({
					...top,
					opacity: top.opacity * Number(a.opacity ?? 1),
					mask: maskId ?? top.mask
				});
			}
			continue;
		}
		if (!['path', 'rect', 'circle', 'ellipse', 'line'].includes(tag) || top.skip) continue;
		const d = elementPathData(tag, a);
		if (!d) continue;
		const rootFill = stack.find((s) => s.rootFill)?.rootFill ?? 'black';
		const shape = {
			tag,
			fill: a.fill ?? (tag === 'line' ? 'none' : rootFill),
			stroke: a.stroke ?? 'none',
			strokeWidth: a.stroke ? Number(a['stroke-width'] ?? 1) : 0,
			opacity: top.opacity * Number(a.opacity ?? 1) * Number(a['fill-opacity'] ?? 1),
			evenOdd: a['fill-rule'] === 'evenodd',
			lineCap: a['stroke-linecap'] ?? null,
			lineJoin: a['stroke-linejoin'] ?? null,
			mask: /url\(#([^)]+)\)/.exec(a.mask ?? '')?.[1] ?? top.mask,
			subpaths: parsePathData(d)
		};
		if (top.inMask) masks.get(top.inMask).push(shape);
		else raw.push(shape);
	}
	if (raw.length === 0) throw new Error('the screen has no shapes');
	// The first shape is the screen's frame (black, or TE's grey on the tempo page).
	const frameBox = subpathsBox(raw[0].subpaths);
	const k = SCREEN.width / boxW(frameBox);
	const toPx = ([x, y]) => [(x - frameBox.x0) * k, (y - frameBox.y0) * k];
	const px = (shape) => {
		const subpaths = mapSubpaths(shape.subpaths, toPx);
		return { ...shape, strokeWidth: shape.strokeWidth * k, subpaths, box: subpathsBox(subpaths) };
	};
	const maskPx = new Map([...masks].map(([id, shapes]) => [id, shapes.map(px)]));
	const shapes = raw.map((shape, index) => ({ ...px(shape), index }));
	for (const s of shapes) s.maskShapes = s.mask ? (maskPx.get(s.mask) ?? null) : null;
	return {
		unitsPerPixel: 1 / k,
		height: boxH(frameBox) * k,
		shapes
	};
}

// ─────────────────────────────────────────────────────────────────────────── text runs

/** A shape that may be a glyph: filled, not stroked, text-sized. */
function isGlyphCandidate(s) {
	if (s.fill === 'none' || s.stroke !== 'none' || s.maskShapes) return false;
	const w = boxW(s.box);
	const h = boxH(s.box);
	return h >= 0.3 && h <= 64 && w >= 0.3 && w <= 64 && s.opacity > 0.05;
}

const colorKey = (fill) => {
	const f = fill.toLowerCase();
	return f === 'white' ? '#ffffff' : f === 'black' ? '#000000' : f;
};

/**
 * Groups glyph candidates into runs: same colour, overlapping vertically, horizontally close.
 * Small marks (dots, hyphens) join a neighbour whose band they sit in.
 */
export function textRuns(shapes) {
	const cands = shapes.filter(isGlyphCandidate);
	const parent = cands.map((_, i) => i);
	const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
	const join = (i, j) => {
		parent[find(i)] = find(j);
	};
	for (let i = 0; i < cands.length; i++) {
		for (let j = i + 1; j < cands.length; j++) {
			const a = cands[i];
			const b = cands[j];
			if (colorKey(a.fill) !== colorKey(b.fill)) continue;
			const [l, r] = a.box.x0 <= b.box.x0 ? [a, b] : [b, a];
			const gap = r.box.x0 - l.box.x1;
			const ha = boxH(a.box);
			const hb = boxH(b.box);
			const hMax = Math.max(ha, hb);
			const hMin = Math.min(ha, hb);
			const overlap = Math.min(a.box.y1, b.box.y1) - Math.max(a.box.y0, b.box.y0);
			if (gap < -0.5 * Math.min(boxW(a.box), boxW(b.box))) continue;
			if (hMin >= 0.34 * hMax) {
				// comparable glyphs: close, and sharing most of the smaller one's height
				if (gap > 0.6 * hMin) continue;
				if (overlap < 0.5 * hMin) continue;
				if (hMax / hMin > 1.75) continue;
			} else if (hMin < 0.25 * hMax) {
				// a small mark (dot, hyphen, colon): it must sit inside the big glyph's band
				const small = ha < hb ? a : b;
				const big = ha < hb ? b : a;
				if (small.box.y0 < big.box.y0 - 0.15 * hMax || small.box.y1 > big.box.y1 + 0.3 * hMax)
					continue;
				if (gap > 0.35 * hMax) continue;
			} else continue;
			join(i, j);
		}
	}
	const groups = new Map();
	cands.forEach((c, i) => {
		const root = find(i);
		if (!groups.has(root)) groups.set(root, []);
		groups.get(root).push(c);
	});
	const runs = [...groups.values()].map((glyphs) => {
		glyphs.sort((a, b) => a.box.x0 - b.box.x0 || a.box.y0 - b.box.y0);
		// merge pieces of one glyph drawn as separate paths (overlapping horizontally)
		const merged = [];
		for (const g of glyphs) {
			const last = merged[merged.length - 1];
			if (last) {
				const ov = Math.min(last.box.x1, g.box.x1) - Math.max(last.box.x0, g.box.x0);
				if (ov > 0.6 * Math.min(boxW(last.box), boxW(g.box))) {
					merged[merged.length - 1] = {
						...last,
						subpaths: [...last.subpaths, ...g.subpaths],
						box: unionBox(last.box, g.box),
						parts: [...(last.parts ?? [last.index]), g.index]
					};
					continue;
				}
			}
			merged.push(g);
		}
		const box = merged.reduce((b, g) => unionBox(b, g.box), emptyBox());
		return { glyphs: merged, box, color: colorKey(merged[0].fill), line: roughBaseline(merged) };
	});
	// reading order: rows of similar baselines top to bottom, left to right within a row
	runs.sort((a, b) => a.line - b.line || a.box.x0 - b.box.x0);
	let rowStart = -Infinity;
	let row = -1;
	for (const run of runs) {
		if (run.line - rowStart > 3) {
			rowStart = run.line;
			row++;
		}
		run.row = row;
	}
	runs.sort((a, b) => a.row - b.row || a.box.x0 - b.box.x0);
	runs.forEach((run, i) => (run.order = i));
	return runs;
}

/**
 * A run's baseline before we know its characters: the bottom most glyphs share (descenders and
 * raised marks are the minority); on a tie, the higher one (descenders hang below).
 */
function roughBaseline(glyphs) {
	const bottoms = glyphs.map((g) => g.box.y1).sort((a, b) => a - b);
	let best = { count: 0, y: bottoms[0] };
	for (const y of bottoms) {
		const count = bottoms.filter((b) => Math.abs(b - y) <= 0.8).length;
		if (count > best.count) best = { count, y };
	}
	return best.y;
}

// ─────────────────────────────────────────────────────────────────────────── labels

/**
 * The strings each screen shows, in reading order (rows top to bottom, left to right), transcribed
 * from the art. `{ff}` is one glyph (a ligature the design tool applied). An object adds `at`
 * ([x, y] in screen pixels: the nearest run wins, for single glyphs that icons could shadow) and
 * `skip` ([before, after]: pictogram shapes that sit in the run but are not text) and `size` (px,
 * for a lone glyph whose size nothing else pins down).
 * Screens with nothing reliable to read list nothing.
 */
const LABELS = {
	'instrument-012': ['env', 'poly', 'o{ff}', 'mod', '1 semitone', '44'],
	'instrument-032': [
		'svf',
		{ t: '50', at: [231, 47] },
		{ t: '31', at: [229, 87] },
		'FX II',
		{ t: '25', at: [231, 127] },
		{ t: '50', at: [36, 169] },
		// hidden under the send cards, but in the file: the filter graph's axis and its Q box
		{ t: '1K', at: [161, 169] },
		{ t: '2K', at: [245.8, 169] },
		{ t: '5K', at: [330.8, 169] },
		{ t: 'Q', at: [330.7, 100], size: 20 },
		'FX I',
		'20kHz',
		{ t: '77', at: [231, 167] },
		{ t: 'key', at: [46, 195] }
	],
	'instrument-052': [
		'source',
		'amount',
		'signal',
		'tr',
		{ t: '4', at: [150, 113] },
		'hold',
		'release'
	],
	'instrument-062': ['dest', 'source', 'amount', 'mode', { t: 'G', at: [119, 110] }, '{fi}lter'],
	'instrument-071': [
		'speed',
		'amount',
		'dest',
		'res',
		{ t: '4', at: [170, 62] },
		{ t: '3', at: [120, 89] },
		'syn',
		'env'
	],
	'instrument-082': ['source', 'vib', 'vol', 'mode', { t: '5', at: [200, 63] }, 'shape'],
	'instrument-093': ['dest', 'speed', 'amount', 'hold', 'syn', 'free', 'env'],
	'instrument-103': [
		'settings',
		'high pass',
		{ t: '0', at: [305, 23] },
		'mod',
		'velocity sens',
		'59',
		'portamento type',
		'lin',
		'tuning',
		'equal',
		'tuning root',
		{ t: 'C', at: [306, 103] },
		'transpose',
		'0 semi',
		'width',
		{ t: '0', at: [305, 143] }
	],
	'instrument-118': [
		{ t: '6', at: [10, 28] },
		'dissolve',
		'aeroplane',
		'synth',
		'drum',
		'apes are us',
		'external',
		'cherry',
		'hardsync',
		'classix',
		'exoex',
		'grits',
		'hard spunch'
	],
	'synth-engines-007': ['shape', 'ratio', 'shape', 'vibrato', '80', '80', '80', '80'],
	'synth-engines-016': ['swarm', 'am', 'fm', 'detune', '49', '52', '90', '00'],
	'synth-engines-025': ['shape', 'ratio', 'detune', 'stereo', '80', '80', '80', '80'],
	'synth-engines-034': ['midi', 'channel', 'bank', 'program', '16', { t: '8', at: [337, 110] }],
	'synth-engines-048': ['freq', 'sub', 'noise', 'lowcut', '80', '80', '80', '80'],
	'synth-engines-057': [
		'shape',
		'ratio',
		'detune',
		'stereo',
		...['8', '7', '6', '5', '4', '3', '2', '1'].flatMap((digit, row) =>
			[60, 180, 300, 420].map((x) => ({ t: digit, at: [x, 12.7 + 20 * row] }))
		)
	],
	'synth-engines-066': ['shape', 'ratio', 'detune', 'stereo', '80', '80', '80', '80'],
	'synth-engines-075': ['shape', 'pw', 'noise', 'stereo', '80', '80', '00', '00'],
	'synth-engines-084': ['buzz', 'position', 'warp', 'drift', '80', '80', '80', '80'],
	'auxiliary-004': ['c lydian', 'auto', 'root', 'scale', 'track', 'c#', 'lydian', '06'],
	'auxiliary-031': [
		'midi',
		'channel',
		'bank',
		'program',
		'16',
		{ t: '8', at: [337, 110] },
		'main',
		'set I',
		'set II',
		'modulation'
	],
	'auxiliary-057': [
		'CV',
		{ t: '0', at: [240, 98] },
		'-2.5',
		'2.5',
		{ t: '-5', at: [193, 116] },
		{ t: '5', at: [289, 116] }
		// the meter's "V" is a heavier symbol, not text
	],
	'auxiliary-064': ['input', 'drive', 'level', 'mix', '25', '75', '75'],
	'auxiliary-099': [
		{ t: '84', at: [300, 28] },
		'X2',
		{ t: '3', at: [438, 71] },
		'dry',
		{ t: '72', at: [465, 95] },
		{ t: '12', at: [341, 128] }
	],
	'auxiliary-130': [
		'FX I',
		'chorus',
		'rate',
		'depth',
		'feedback',
		'stereo',
		'10 ms',
		'10 us',
		'32',
		'64'
	],
	'arrange-003': [
		// the track icons' lettering ("CV", "FX I", "FX II") is drawn heavier: pictograms, not text
		{ t: '10', at: [240, 45] },
		{ t: '1', at: [306, 80] },
		{ t: '2', at: [306, 112] },
		{ t: '1', at: [7, 121] },
		{ t: '3', at: [306, 142] },
		'clear',
		'copy',
		'paste',
		'new'
	],
	'arrange-020': [
		// the track icons' lettering ("CV", "FX I", "FX II") is drawn heavier: pictograms, not text
		{ t: '10', at: [240, 45] },
		{ t: '1', at: [306, 80] },
		{ t: '2', at: [306, 112] },
		{ t: '1', at: [7, 121] },
		{ t: '3', at: [306, 142] },
		'clear',
		'copy',
		'paste',
		'new'
	],
	'arrange-028': [
		'count',
		'song 9',
		{ t: '06', at: [458, 13] },
		...['1', '2', '3', '4', '5', '6', '7', '8'].map((t, i) => ({ t, at: [87.5 + 40 * i, 31] })),
		{ t: '1', at: [71.7, 49] },
		'99',
		...['1', '1', '1', '1', '3', '3', '5'].map((t, i) => ({ t, at: [139.5 + 40 * i, 60] })),
		{ t: '9', at: [72.1, 89] },
		'17',
		'25',
		'[32]',
		'clear all',
		'delete'
	],
	'mix-003': [{ t: '2', at: [89, 12] }],
	'project-003': ['demo 1', 'new', 'save', 'rename', 'con{fi}g'],
	'project-004': ['demo 1', 'new', 'save', 'rename', 'con{fi}g'],
	'project-014': [
		'factory',
		'aeroplane',
		'templates',
		'apes are us',
		'user',
		'cherry',
		'classix',
		'exoex',
		'grits',
		'hard spunch',
		'jackdish',
		'delete',
		'history',
		'duplicate',
		'load'
	],
	'project-019': [
		'general',
		'signature',
		'4/4',
		'tempo',
		'groove type',
		'shu{ffl}e',
		'voices',
		'midi',
		'back'
	],
	'sample-003': ['+11', 'press key to sample', 'ch mart b.wav'],
	'sample-004': ['+11', 'press', 'to record to {fi}le', { t: 'clear', at: [440, 208] }],
	'sample-017': ['+11', '20:00', 'ch mart b.wav', { t: 'clear', at: [418, 208] }],
	'sample-025': [
		{ t: 'G', at: [461, 12], skip: [1, 0] },
		'–1.22',
		{ t: 'L', at: [15.7, 45] },
		{ t: 'R', at: [15.4, 145] }
	],
	'sample-056': [
		{ t: 'L', at: [130, 13] },
		{ t: 'R', at: [194.7, 13] },
		{ t: 'L', at: [16, 45] },
		{ t: 'R', at: [15.5, 145] }
	],
	'sample-076': ['transient', { t: '3', at: [469, 12] }, 'cancel', 'done'],
	'sample-080': ['transient', { t: '3', at: [469, 12] }, 'cancel', 'done'],
	'sample-087': ['even', { t: '9', at: [469, 12] }, 'cancel', 'done'],
	'sample-094': ['tap', { t: '4', at: [469, 12] }, 'tap', 'cancel', 'done'],
	'sample-100': ['+11', '20:00', 'ch mart b.wav', { t: 'clear', at: [418, 208] }],
	'sample-113': [
		{ t: 'L', at: [15.7, 45] },
		{ t: 'R', at: [15.4, 145] }
	],
	'sample-132': [
		'bass',
		'aeroplane',
		'drum',
		'apes are us',
		'keys',
		'cherry',
		'lead',
		'classix',
		'organ',
		'exoex',
		'pad',
		'grits',
		'pluck',
		'hard spunch',
		'sampler',
		'lubowa',
		'clear'
	],
	'sample-140': [
		'bass',
		'aeroplane',
		'drum',
		'apes are us',
		'keys',
		'cherry',
		'lead',
		'classix',
		'organ',
		'exoex',
		'pad',
		'grits',
		'pluck',
		'hard spunch',
		'sampler',
		'lubowa',
		'clear'
	],
	'tempo-005': ['SH', '125'],
	'com-004': ['adv', 'sync', 'charge on', 'system', 'ctrl', 'devices', 'mtp'],
	'com-014': [
		'system',
		'mod account',
		'0 semi',
		'keyboard',
		'modwheel target',
		'99',
		'midi',
		'aftertouch amount',
		'lin',
		'clock',
		'pitchbend target',
		'equal',
		'battery',
		'pitchbend amount',
		{ t: 'c', at: [310, 106] },
		'legal',
		'velocity target',
		'0 semi',
		'velocity amount',
		{ t: '0', at: [310, 143] },
		'back'
	],
	'com-022': ['eject'],
	// punch-in FX: a dot-matrix picture, no text
	'auxiliary-021': [],
	'com-030': [
		'devices',
		'connected',
		'TP-7',
		'midi ctrl',
		'OP-1',
		'clock',
		'out',
		'ortho remote',
		'notes',
		'in',
		'other',
		'both',
		'timestamp',
		'o{ff}'
	],
	'com-039': ['eject'],
	'how-to-102': ['c lydian', 'auto', 'root', 'scale', 'track', 'c#', 'lydian']
};

/** Splits a label into words of glyph names (`{ff}` is one glyph). */
function parseLabel(label) {
	const spec = typeof label === 'string' ? { t: label } : label;
	const words = spec.t.split(' ').map((word) => {
		const glyphs = [];
		for (let i = 0; i < word.length;) {
			if (word[i] === '{') {
				const end = word.indexOf('}', i);
				glyphs.push(word.slice(i + 1, end));
				i = end + 1;
			} else {
				const cp = word.codePointAt(i);
				const ch = String.fromCodePoint(cp);
				glyphs.push(ch);
				i += ch.length;
			}
		}
		return glyphs;
	});
	return {
		text: spec.t.replace(/[{}]/g, ''),
		words,
		at: spec.at ?? null,
		skip: spec.skip ?? [0, 0],
		size: spec.size ?? null
	};
}

/**
 * Matches a screen's labels to its runs. A label may span several runs of one row (a wide space
 * splits a run), but only at its word breaks. Returns the text instances and the problems found.
 */
export function matchLabels(runs, labels) {
	const used = new Set();
	const instances = [];
	const problems = [];
	let cursor = 0;
	for (const raw of labels) {
		const label = parseLabel(raw);
		const counts = label.words.map((w) => w.length);
		const need = counts.reduce((a, b) => a + b, 0) + label.skip[0] + label.skip[1];
		// word-break positions (glyph counts from the start, after the skipped ones)
		const breaks = new Set([0]);
		counts.reduce((sum, n) => {
			breaks.add(label.skip[0] + sum + n);
			return sum + n;
		}, 0);
		const free = (r) => !used.has(r.order);
		let candidates;
		if (label.at) {
			const [ax, ay] = label.at;
			const dist = (r) =>
				Math.hypot(
					Math.max(r.box.x0 - ax, 0, ax - r.box.x1),
					Math.max(r.box.y0 - ay, 0, ay - r.box.y1)
				);
			candidates = runs.filter((r) => free(r) && dist(r) < 12).sort((a, b) => dist(a) - dist(b));
		} else {
			candidates = [...runs.slice(cursor), ...runs.slice(0, cursor)].filter(free);
		}
		let chain = null;
		for (const start of candidates) {
			chain = chainFrom(start, runs, used, need, breaks, label.skip[0]);
			if (chain) break;
		}
		if (!chain) {
			problems.push(`label "${label.text}" (${need} glyphs) matches no run`);
			continue;
		}
		for (const r of chain) used.add(r.order);
		if (!label.at) cursor = chain[chain.length - 1].order + 1;
		const glyphs = chain.flatMap((r) => r.glyphs).slice(label.skip[0], need - label.skip[1]);
		const names = label.words.flat();
		const wordEnds = new Set();
		counts.reduce((sum, n) => {
			wordEnds.add(sum + n - 1);
			return sum + n;
		}, 0);
		instances.push({
			label: label.text,
			sizeHint: label.size,
			color: chain[0].color,
			runs: chain.map((r) => r.order),
			glyphs: glyphs.map((shape, i) => ({ name: names[i], shape, box: shape.box })),
			spaceAfter: glyphs.map((_, i) => wordEnds.has(i) && i < glyphs.length - 1)
		});
	}
	return { instances, problems };
}

/** A run followed by its right neighbours on the same row until `need` glyphs, or null. */
function chainFrom(start, runs, used, need, breaks, skipBefore) {
	const chain = [start];
	let count = start.glyphs.length;
	if (!breaks.has(count) && count < need) return null;
	while (count < need) {
		const last = chain[chain.length - 1];
		const lineH = Math.max(...last.glyphs.map((g) => boxH(g.box)));
		const next = runs
			.filter(
				(r) =>
					!used.has(r.order) &&
					!chain.includes(r) &&
					r.row === start.row &&
					r.color === start.color &&
					r.box.x0 > last.box.x1 - 0.5 &&
					r.box.x0 - last.box.x1 < 2.2 * lineH
			)
			.sort((a, b) => a.box.x0 - b.box.x0)[0];
		if (!next) return null;
		chain.push(next);
		count += next.glyphs.length;
		if (count < need && !breaks.has(count)) return null;
	}
	if (count !== need) return null;
	if (skipBefore && start.glyphs.length <= skipBefore) return null;
	return chain;
}

// ─────────────────────────────────────────────────────────────────────────── font solve

/** Characters that sit flat on the baseline (their bottom defines it). */
const FLAT_BOTTOM = new Set('hnmlikxzrHEFILTXZ1247.:');
/** Characters whose top is the x-height, cap height or ascender (for the vertical metrics). */
const X_TOP = 'xzvwy';
const CAP_TOP = 'HITLEFXZ';
const ASC_TOP = 'hdlbk';
const DESC_BOTTOM = 'pqgy';

/**
 * Factors glyph heights into per-character heights × per-instance text sizes and glyph bottoms
 * into per-character offsets + per-instance baselines (alternating least squares in log / linear
 * space), then fixes the scale so the list text measures `anchorSize` px.
 */
function solveSizes(instances, anchor) {
	const samples = instances.flatMap((inst, r) =>
		inst.glyphs.map((g) => ({
			r,
			name: g.name,
			key: heightKey(g.name),
			h: boxH(g.box),
			top: g.box.y0,
			bottom: g.box.y1
		}))
	);
	const size = instances.map(() => 1);
	const height = new Map();
	const byName = groupBy(samples, (s) => s.name);
	const byKey = groupBy(samples, (s) => s.key);
	const byInst = groupBy(samples, (s) => s.r);
	for (let iter = 0; iter < 80; iter++) {
		for (const [key, list] of byKey) {
			height.set(key, Math.exp(mean(list.map((s) => Math.log(s.h / size[s.r])))));
		}
		for (const [r, list] of byInst) {
			size[r] = Math.exp(mean(list.map((s) => Math.log(s.h / height.get(s.key)))));
		}
	}
	const islands = sizeIslands(instances, samples, anchor);
	// scale: the list text of the anchor screens is `anchor.size` px
	const anchorSizes = instances
		.map((inst, r) => ({ inst, r }))
		.filter(({ inst }) => anchor.screens.includes(inst.screen))
		.map(({ r }) => size[r]);
	const k = anchor.size / median(anchorSizes);
	for (let r = 0; r < size.length; r++) size[r] *= k;
	// a lone glyph with nothing to compare against (the Q box) carries its size in LABELS
	instances.forEach((inst, r) => {
		if (inst.sizeHint) size[r] = inst.sizeHint;
	});

	// baselines: bottom = baseline + size · descent(char)
	const baseline = instances.map((inst) => median(inst.glyphs.map((g) => g.box.y1)));
	const descent = new Map();
	const top = new Map();
	for (let iter = 0; iter < 40; iter++) {
		// flat-bottomed glyphs sit on the baseline by definition (TE sometimes set a number as its
		// own layer a fraction of a pixel off the words beside it; that must not tilt the font)
		for (const [name, list] of byName) {
			const d = median(list.map((s) => (s.bottom - baseline[s.r]) / size[s.r]));
			descent.set(name, FLAT_BOTTOM.has(name) ? 0 : d);
		}
		for (const [r, list] of byInst) {
			baseline[r] = median(list.map((s) => s.bottom - size[s.r] * descent.get(s.name)));
		}
	}
	for (const [name, list] of byName) {
		top.set(name, median(list.map((s) => (s.top - baseline[s.r]) / size[s.r])));
	}
	return { size, baseline, descent, top, islands };
}

/** Capitals that stand exactly cap-height tall, and the round ones (with overshoot). */
const CAPS_FLAT = new Set('EFHIKLMNPRTXZ');
const CAPS_ROUND = new Set('CGOS');

/**
 * The height a glyph shares with others: flat capitals share one (the cap height), round capitals
 * another; everything else is its own. Without this, capitals that only ever appear in all-caps
 * strings ("CV", "C", "V") would float free of the lower case, with no size to anchor them.
 */
function heightKey(name) {
	if (CAPS_FLAT.has(name)) return '#caps';
	if (CAPS_ROUND.has(name)) return '#caps-round';
	return name;
}

/** Groups of instances whose sizes are tied to each other but not to the anchor screens. */
function sizeIslands(instances, samples, anchor) {
	const parent = new Map();
	const find = (x) => {
		while (parent.get(x) !== x) x = parent.get(x);
		return x;
	};
	const node = (x) => {
		if (!parent.has(x)) parent.set(x, x);
		return x;
	};
	for (const s of samples) {
		const a = find(node(`i${s.r}`));
		const b = find(node(`k${s.key}`));
		if (a !== b) parent.set(a, b);
	}
	const anchorRoots = new Set(
		instances.map((inst, r) => (anchor.screens.includes(inst.screen) ? find(`i${r}`) : null))
	);
	const loose = instances
		.map((inst, r) => ({ inst, r }))
		.filter(({ inst, r }) => !inst.sizeHint && !anchorRoots.has(find(`i${r}`)))
		.map(({ inst }) => `${inst.screen} "${inst.label}"`);
	return loose;
}

/**
 * Side bearings from the gaps between neighbours: gap = rsb(a) + lsb(b) + tracking(string)
 * (+ the space at a word break). TE's styles carry their own letter-spacing (titles run a little
 * tight, some small labels a little loose), so every string gets a tracking term, pulled toward 0
 * and fixed at 0 for the list text of the anchor screens, which defines the bearings. Solved by
 * iteratively reweighted least squares so kerned pairs do not skew the bearings; a weak prior keeps
 * each glyph's two bearings close where the data says nothing.
 */
function solveSpacing(instances, size, anchor, widths, options = {}) {
	const names = [...new Set(instances.flatMap((i) => i.glyphs.map((g) => g.name)))].sort();
	const index = new Map(names.map((n, i) => [n, i]));
	const n = names.length;
	// unknowns: lsb 0..n-1, rsb n..2n-1, the space 2n, then one tracking per string
	const SP = 2 * n;
	const TA = 2 * n + 1; // the figures' shared advance (tabular option)
	const T0 = 2 * n + 2;
	const targets = options.targets ?? null;
	const pairs = [];
	instances.forEach((inst, r) => {
		for (let i = 0; i + 1 < inst.glyphs.length; i++) {
			const a = inst.glyphs[i];
			const b = inst.glyphs[i + 1];
			pairs.push({
				a: a.name,
				b: b.name,
				r,
				space: inst.spaceAfter[i],
				gap: (b.box.x0 - a.box.x1) / size[r],
				where: `${inst.screen} "${inst.label}"`
			});
		}
	});
	const fixed = instances.map((inst) => anchor.screens.includes(inst.screen));
	const unknowns = T0 + instances.length;
	let weights = pairs.map(() => 1);
	let x = new Array(unknowns).fill(0);
	const predict = (p) =>
		x[n + index.get(p.a)] + x[index.get(p.b)] + (p.space ? x[SP] : 0) + x[T0 + p.r];
	for (let iter = 0; iter < 10; iter++) {
		const A = Array.from({ length: unknowns }, () => new Array(unknowns).fill(0));
		const bvec = new Array(unknowns).fill(0);
		const add = (terms, value, w) => {
			for (const [i, ci] of terms) {
				for (const [j, cj] of terms) A[i][j] += w * ci * cj;
				bvec[i] += w * ci * value;
			}
		};
		pairs.forEach((p, k) => {
			const terms = [
				[n + index.get(p.a), 1],
				[index.get(p.b), 1],
				[T0 + p.r, 1]
			];
			if (p.space) terms.push([SP, 1]);
			add(terms, p.gap, weights[k]);
		});
		for (let c = 0; c < n; c++) {
			const target = targets?.get(names[c]);
			if (target) {
				// sparse glyphs lean on well-observed letters of the same side shape
				add([[c, 1]], target.lsb, 0.05);
				add([[n + c, 1]], target.rsb, 0.05);
			} else {
				// symmetric shapes keep equal bearings; others only where the data is silent
				add(
					[
						[c, 1],
						[n + c, -1]
					],
					0,
					SYMMETRIC.has(names[c]) ? 0.5 : 0.02
				);
			}
		}
		instances.forEach((_, r) => add([[T0 + r, 1]], 0, fixed[r] ? 1e6 : 1.5));
		if (options.tabular) {
			// every figure has the same advance: lsb + width + rsb = A
			for (const d of '0123456789') {
				if (!index.has(d)) continue;
				const i = index.get(d);
				add(
					[
						[i, 1],
						[n + i, 1],
						[TA, -1]
					],
					-widths.get(d),
					1e4
				);
			}
		}
		x = solveLinear(A, bvec);
		const huber = 0.006;
		weights = pairs.map((p) => {
			const res = Math.abs(p.gap - predict(p));
			return res <= huber ? 1 : huber / res;
		});
	}
	const lsb = new Map(names.map((name, i) => [name, x[i]]));
	const rsb = new Map(names.map((name, i) => [name, x[n + i]]));
	const tracking = instances.map((_, r) => x[T0 + r]);
	const residuals = pairs.map((p) => ({ ...p, res: p.gap - predict(p) }));
	return { lsb, rsb, space: x[SP], figure: x[TA], tracking, residuals };
}

/** Gaussian elimination with partial pivoting (the system is small and well conditioned). */
function solveLinear(A, b) {
	const n = b.length;
	const M = A.map((row, i) => [...row, b[i]]);
	for (let col = 0; col < n; col++) {
		let pivot = col;
		for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
		[M[col], M[pivot]] = [M[pivot], M[col]];
		const p = M[col][col];
		if (Math.abs(p) < 1e-12) continue;
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const f = M[r][col] / p;
			if (f === 0) continue;
			for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
		}
	}
	return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

function groupBy(list, key) {
	const map = new Map();
	for (const item of list) {
		const k = key(item);
		if (!map.has(k)) map.set(k, []);
		map.get(k).push(item);
	}
	return map;
}

/** Median and worst |residual| (font units) over figure–figure pairs. */
function digitFit(residuals) {
	const values = residuals
		.filter((p) => /^[0-9]$/.test(p.a) && /^[0-9]$/.test(p.b))
		.map((p) => Math.abs(p.res) * UPM);
	return {
		pairs: values.length,
		median: round(median(values), 1),
		max: round(Math.max(...values), 1)
	};
}

/** Serialises subpaths as compact absolute path data (integers when `decimals` is 0). */
function pathData(subpaths, map, decimals) {
	let out = '';
	let last = '';
	const fmt = (v) => String(round(v, decimals));
	const join = (values) =>
		values.map(fmt).reduce((s, v, k) => (k === 0 ? v : s + (v.startsWith('-') ? '' : ' ') + v), '');
	const emit = (command, values) => {
		const text = join(values);
		if (command === last && command !== 'M') out += (text.startsWith('-') ? '' : ' ') + text;
		else out += command + text;
		last = command;
	};
	for (const sp of subpaths) {
		let from = map(sp.start).map((v) => round(v, decimals));
		emit('M', from);
		for (const seg of sp.segs) {
			const to = map(seg.to).map((v) => round(v, decimals));
			if (seg.type === 'C') emit('C', [...map(seg.c1), ...map(seg.c2), ...to]);
			else if (to[1] === from[1] && to[0] !== from[0]) emit('H', [to[0]]);
			else if (to[0] === from[0] && to[1] !== from[1]) emit('V', [to[1]]);
			else if (to[0] !== from[0] || to[1] !== from[1]) emit('L', to);
			from = to;
		}
		if (sp.closed) {
			out += 'Z';
			last = 'Z';
		}
	}
	return out;
}

/** Mean distance (font units) from points of outline `a` to the nearest point of outline `b`. */
function outlineDistance(a, b) {
	const pa = samplePoints(a, 6);
	const pb = samplePoints(b, 12);
	let total = 0;
	for (const [x, y] of pa) {
		let best = Infinity;
		for (const [u, v] of pb) best = Math.min(best, (x - u) ** 2 + (y - v) ** 2);
		total += Math.sqrt(best);
	}
	return total / pa.length;
}

/** Glyph sides grouped by shape: the bearing a sparse glyph leans toward is its class's. */
const LEFT_SIDE = {
	stem: 'bhiklmnpruBDEFHIKLMNPRU',
	round: 'acdegoqCGOQS',
	diagonal: 'vwxyAVWXY',
	open: 'ftzJTZ'
};
const RIGHT_SIDE = {
	stem: 'adghilmnquHIMNU',
	round: 'bceopsBCDGOPQS',
	diagonal: 'kvwxyAKRVWXY',
	open: 'frtzEFLTZ'
};
/** Shapes that are (near) mirror-symmetric: equal side bearings. */
const SYMMETRIC = new Set('-–+.:/#08oOxXHIvVwWTAMUilY');

/** Per sparse glyph, the median bearings of well-observed glyphs with the same side shapes. */
function sideTargets(solution, counts) {
	const classValue = (classes, map) =>
		Object.fromEntries(
			Object.entries(classes).map(([cls, chars]) => {
				const values = [...chars]
					.filter((c) => (counts.get(c) ?? 0) >= 10 && map.has(c))
					.map((c) => map.get(c));
				return [cls, values.length ? median(values) : null];
			})
		);
	const left = classValue(LEFT_SIDE, solution.lsb);
	const right = classValue(RIGHT_SIDE, solution.rsb);
	const find = (classes, values, c) => {
		for (const [cls, chars] of Object.entries(classes)) if (chars.includes(c)) return values[cls];
		return null;
	};
	const targets = new Map();
	for (const [c, count] of counts) {
		if (count >= 6 || c.length > 1) continue;
		const lsb = find(LEFT_SIDE, left, c);
		const rsb = find(RIGHT_SIDE, right, c);
		if (lsb !== null && rsb !== null) targets.set(c, { lsb, rsb });
	}
	return targets;
}

/** The screens whose list text defines 20 px (lists are the most repeated style). */
const SIZE_ANCHOR = { size: 20, screens: ['instrument-103', 'com-014', 'instrument-118'] };

/**
 * Builds the font from every screen: match labels, solve sizes, baselines and spacing, pick and
 * normalise outlines, check consistency.
 */
export function buildFont(screens) {
	const instances = [];
	const problems = [];
	for (const screen of screens) {
		const labels = LABELS[screen.key];
		if (!labels) {
			problems.push(`${screen.key}: no LABELS entry`);
			continue;
		}
		const runs = textRuns(screen.shapes);
		const result = matchLabels(runs, labels);
		for (const inst of result.instances) instances.push({ ...inst, screen: screen.key });
		for (const p of result.problems) problems.push(`${screen.key}: ${p}`);
	}
	const { size, baseline, descent, islands } = solveSizes(instances, SIZE_ANCHOR);
	for (const loose of islands) problems.push(`size not anchored: ${loose}`);
	// glyph widths in em (median over samples), for the tabular-figure constraint
	const widths = new Map(
		[
			...groupBy(
				instances.flatMap((inst, r) => inst.glyphs.map((g) => ({ g, r }))),
				(x) => x.g.name
			)
		].map(([name, list]) => [name, median(list.map(({ g, r }) => boxW(g.box) / size[r]))])
	);
	const counts = new Map(
		[
			...groupBy(
				instances.flatMap((i) => i.glyphs),
				(g) => g.name
			)
		].map(([k, v]) => [k, v.length])
	);
	// pass 1: bearings from the data alone; then priors for sparse glyphs from their shape class
	const first = solveSpacing(instances, size, SIZE_ANCHOR, widths, { tabular: true });
	const targets = sideTargets(first, counts);
	const spacing = solveSpacing(instances, size, SIZE_ANCHOR, widths, { tabular: true, targets });
	const proportional = solveSpacing(instances, size, SIZE_ANCHOR, widths, { targets });

	// outlines: the largest sample of each glyph, in font units relative to the pen on the baseline
	const samples = groupBy(
		instances.flatMap((inst, r) =>
			inst.glyphs.map((g) => ({ ...g, r, screen: inst.screen, label: inst.label }))
		),
		(s) => s.name
	);
	const normalise = (s) => {
		const s0 = size[s.r];
		const penX = s.box.x0 - spacing.lsb.get(s.name) * s0;
		const base = baseline[s.r];
		return (p) => [((p[0] - penX) / s0) * UPM, ((p[1] - base) / s0) * UPM];
	};
	const glyphs = {};
	const sources = {};
	const deviations = [];
	for (const [name, list] of [...samples].sort(([a], [b]) => (a < b ? -1 : 1))) {
		const best = [...list].sort((a, b) => size[b.r] - size[a.r] || a.r - b.r)[0];
		// seat the outline by the glyph's median bottom offset over all its samples (0 when flat),
		// which is robust to the odd string whose layers do not share one baseline
		const raw = mapSubpaths(best.shape.subpaths, normalise(best));
		const seat = descent.get(name) * UPM - subpathsBox(raw).y1;
		const outline = mapSubpaths(raw, ([x, y]) => [x, y + seat]);
		const box = subpathsBox(outline);
		const lsb = spacing.lsb.get(name) * UPM;
		const rsb = spacing.rsb.get(name) * UPM;
		// figures are tabular: one advance for all ten, whatever the chosen sample's width
		const advance = /^[0-9]$/.test(name) ? spacing.figure * UPM : lsb + (box.x1 - box.x0) + rsb;
		// every other sample against the chosen one
		for (const s of list) {
			if (s === best) continue;
			const other = mapSubpaths(s.shape.subpaths, normalise(s));
			const ob = subpathsBox(other);
			const boxDelta = Math.max(
				Math.abs(ob.x1 - ob.x0 - (box.x1 - box.x0)),
				Math.abs(ob.y0 - box.y0),
				Math.abs(ob.y1 - box.y1)
			);
			const shift = [box.x0 - ob.x0, 0];
			const moved = mapSubpaths(other, ([x, y]) => [x + shift[0], y]);
			deviations.push({
				name,
				where: `${s.screen} "${s.label}" @${round(size[s.r], 1)}px`,
				boxDelta,
				distance: outlineDistance(moved, outline)
			});
		}
		glyphs[name] = {
			advance: Math.round(advance),
			bbox: [box.x0, box.y0, box.x1, box.y1].map((v) => Math.round(v)),
			samples: list.length,
			d: pathData(outline, (p) => p, 0)
		};
		sources[name] = `${best.screen} "${best.label}" @${round(size[best.r], 2)}px`;
	}

	// kerning: pairs whose gaps stay off the fit consistently
	const kerning = {};
	for (const [pair, list] of groupBy(spacing.residuals, (p) => p.a + '\u0000' + p.b)) {
		const res = median(list.map((p) => p.res)) * UPM;
		const agree = list.every(
			(p) => Math.sign(p.res) === Math.sign(res) && Math.abs(p.res * UPM) > 8
		);
		// one-off gaps are layout (separate text layers, nudged glyphs), not kerning
		const screensSeen = new Set(list.map((p) => p.where.split(' ')[0])).size;
		if (Math.abs(res) >= 12 && agree && screensSeen >= 3)
			kerning[pair.replace('\u0000', '')] = Math.round(res);
	}

	// vertical metrics from the seated outlines: tops of x-height, cap and ascender letters, bottoms
	// of descenders (bbox index 1 = top, 3 = bottom)
	const boxMetric = (chars, index, sign) => {
		const values = [...chars].filter((c) => glyphs[c]).map((c) => sign * glyphs[c].bbox[index]);
		return values.length ? Math.round(median(values)) : null;
	};
	const sizes = groupBy(
		instances.map((inst, r) => ({ px: size[r], screen: inst.screen })),
		(x) => Math.round(x.px)
	);
	const printable = Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i));
	const missing = printable.filter((c) => !glyphs[c]).join('');
	return {
		font: {
			$comment:
				"Generated by scripts/extract-screen-font.mjs from the screen illustrations in Teenage Engineering's public OP-XY guide (credited in NOTICE.md). Do not edit by hand. Units: 1000 per em, y down, origin at the pen position on the baseline.",
			format: 1,
			source: {
				art: 'teenage.engineering/guides/op-xy (guide v1.1.15), screen illustrations',
				screens: new Set(instances.map((i) => i.screen)).size,
				strings: instances.length
			},
			unitsPerEm: UPM,
			ascender: boxMetric(ASC_TOP, 1, -1),
			capHeight: boxMetric(CAP_TOP, 1, -1),
			xHeight: boxMetric(X_TOP, 1, -1),
			descender: boxMetric(DESC_BOTTOM, 3, 1),
			space: Math.round(spacing.space * UPM),
			figureAdvance: Math.round(spacing.figure * UPM),
			sizes: Object.fromEntries(
				[...sizes].sort(([a], [b]) => a - b).map(([px, list]) => [String(px), list.length])
			),
			ligatures: Object.keys(glyphs)
				.filter((g) => g.length > 1)
				.sort((a, b) => b.length - a.length),
			kerning,
			missing,
			glyphs
		},
		report: {
			figures: {
				tabularAdvance: Math.round(spacing.figure * UPM),
				tabular: digitFit(spacing.residuals),
				proportional: digitFit(proportional.residuals)
			},
			instances,
			size,
			sizes,
			sources,
			problems,
			deviations,
			residuals: spacing.residuals
		}
	};
}

// ─────────────────────────────────────────────────────────────────────────── pictograms

const big = (min) => (s) => boxW(s.box) >= min || boxH(s.box) >= min;

const { AREA_ART } = await import('./screen-art/index.mjs');

/**
 * Named pictograms: every shape inside `box` (screen pixels) on `screen`, minus text (unless
 * `text`), minus shapes inside an `exclude` box, filtered by `keep`. Coordinates are stored
 * relative to the box's top-left corner. `opaque` drops the 50 % dim TE puts on a page shown under
 * a shift layer's cards (the page itself draws at full strength). `masked` also takes masked shapes
 * that overhang the box (their mask clips them), as where TE drew a whole device and masked it.
 * Instead of `screen`, `svg` names a guide picture that is not a screen (a path under
 * research/ui-reference/guide-svg, such as the step component key icons), read at `scale` screen
 * pixels per SVG unit (default 1).
 */
const ICONS = {
	// tempo
	'tempo.metronome': { screen: 'tempo-005', box: [194, 14, 286, 166], keep: big(80) },
	'tempo.speaker': { screen: 'tempo-005', box: [379, 47, 407, 79] },
	'tempo.jack': { screen: 'tempo-005', box: [374, 139, 420, 155] },
	'tempo.thumb': { screen: 'tempo-005', box: [232, 169, 248, 211] },
	// filter (M3): the key-tracking arrow beside "key"
	'filter.arrow': { screen: 'instrument-032', box: [69, 184, 105, 206], opaque: true },
	// the synth sampler's tune note
	'sampler.note': { screen: 'sample-025', box: [9, 4, 16, 21] },
	// project
	'project.nib': { screen: 'project-003', box: [0, 84, 108, 136] },
	'usage.voices': { screen: 'project-004', box: [365, 19, 397, 46] },
	'usage.cpu': { screen: 'project-004', box: [403, 16, 437, 49] },
	'usage.memory': { screen: 'project-004', box: [444, 19, 471, 46] },
	// engine illustrations (below the 20 px header)
	'engine.prism': { screen: 'synth-engines-066', box: [-1, 20.5, 481, 221] },
	'engine.wavetable': { screen: 'synth-engines-084', box: [-1, 20.5, 481, 221] },
	'engine.axis': { screen: 'synth-engines-007', box: [-1, 20.5, 481, 221] },
	'engine.epiano': { screen: 'synth-engines-025', box: [-1, 20.5, 481, 221] },
	'engine.hardsync': { screen: 'synth-engines-048', box: [-1, 20.5, 481, 221] },
	'engine.simple': { screen: 'synth-engines-075', box: [-1, 20.5, 481, 221] },
	'engine.organ': { screen: 'synth-engines-057', box: [30, 0, 450, 205] },
	'midi.din': { screen: 'synth-engines-034', box: [108, 78, 177, 147] },
	'midi.arrow': { screen: 'synth-engines-034', box: [136, 60, 150, 76] },
	'midi.none': { screen: 'synth-engines-034', box: [214, 69, 306, 146] },
	// sampler header (shift layer) and lanes
	'sampler.direction': { screen: 'sample-056', box: [38, 4, 71, 21] },
	'sampler.pan': { screen: 'sample-056', box: [136, 4, 189, 21] },
	'sampler.fade': { screen: 'sample-056', box: [283, 4, 332, 21] },
	'sampler.gain': { screen: 'sample-056', box: [423, 4, 471, 21] },
	// play mode cards (shift + M2)
	'playmode.poly': { screen: 'instrument-012', box: [144, 34, 183, 71] },
	'playmode.portamento': { screen: 'instrument-012', box: [144, 79, 184, 106] },
	'playmode.bend': { screen: 'instrument-012', box: [143, 119, 183, 147] },
	'playmode.volume': { screen: 'instrument-012', box: [144, 159, 184, 183] },
	// send cards (shift + M3)
	'sends.aux': { screen: 'instrument-032', box: [159, 32, 196, 62] },
	'sends.tape': { screen: 'instrument-032', box: [159, 78, 196, 96] },
	'sends.fx2': { screen: 'instrument-032', box: [159, 115, 201, 139], text: true },
	'sends.fx1': { screen: 'instrument-032', box: [159, 155, 201, 179], text: true },
	// lfo cards (M4)
	'lfo.clock': { screen: 'instrument-093', box: [90, 85, 142, 137] },
	'lfo.wave.syn': { screen: 'instrument-093', box: [248, 29, 285, 55] },
	'lfo.wave.free': { screen: 'instrument-093', box: [248, 89, 285, 115] },
	'lfo.env': { screen: 'instrument-093', box: [249, 151, 286, 169] },
	'lfo.knob': { screen: 'instrument-093', box: [304, 54, 411, 166] },
	'lfo.triplet': { screen: 'instrument-071', box: [95, 80, 145, 142], text: true },
	'lfo.note16': { screen: 'instrument-082', box: [136, 80, 163, 140] },
	'lfo.ramp': { screen: 'instrument-082', box: [338, 58, 382, 102] },
	'lfo.saw': { screen: 'instrument-082', box: [338, 118, 382, 162] },
	// duck: the trigger source's type (audio, note) and the signal it follows
	'lfo.duck.source': { screen: 'instrument-052', box: [100, 147, 138, 165] },
	'lfo.signal': { screen: 'instrument-052', box: [270, 70, 390, 101] },
	// element: the motion curve with its knob on the mode card
	'lfo.mode': { screen: 'instrument-062', box: [305, 52, 418, 168], exclude: [[304, 54, 316, 66]] },
	'lfo.pulse': { screen: 'instrument-062', box: [248, 38, 292, 62] },
	'lfo.adsr': { screen: 'instrument-062', box: [247, 98, 293, 121] },
	'lfo.filter': { screen: 'instrument-062', box: [252, 148, 288, 171] },
	// com
	'com.device': {
		screen: 'com-004',
		box: [4, 4, 236, 191],
		exclude: [[18, 12, 92, 61]],
		masked: true
	},
	// the bluetooth badge (and its leader to the dark encoder), shown while advertising
	'com.badge': { screen: 'com-004', box: [18, 12, 92, 61] }
};

/** Shape styles as stored in screen-icons.json. */
function shapeStyle(s) {
	const style = {};
	if (s.fill !== 'none') style.fill = normaliseColor(s.fill);
	if (s.stroke !== 'none') {
		style.stroke = normaliseColor(s.stroke);
		style.width = round(s.strokeWidth, 2);
		if (s.lineCap && s.lineCap !== 'butt') style.cap = s.lineCap;
		if (s.lineJoin && s.lineJoin !== 'miter') style.join = s.lineJoin;
	}
	if (s.opacity < 0.999) style.alpha = round(s.opacity, 3);
	if (s.evenOdd) style.evenodd = true;
	return style;
}

function normaliseColor(c) {
	const lower = c.toLowerCase();
	if (lower === 'white') return '#ffffff';
	if (lower === 'black') return '#000000';
	return lower;
}

/**
 * A guide picture that is not a screen, read at `scale` screen pixels per SVG unit. A black frame
 * put in front stands in for a screen's (shape 0, which buildIcons skips), so the picture's own
 * shapes keep their coordinates × `scale`. Null when the file is missing.
 */
function readPicture(file, scale = 1) {
	const at = path.join(ROOT, file);
	if (!existsSync(at)) return null;
	const frame = `<rect x="0" y="0" width="${SCREEN.width / scale}" height="${SCREEN.height / scale}" fill="black"/>`;
	return readScreen(readFileSync(at, 'utf8').replace(/<svg\b[^>]*>/, (open) => open + frame));
}

/** Extracts every entry of an icon table (default: the core's ICONS) from its screen. */
export function buildIcons(screens, textShapes, table = ICONS) {
	const byKey = new Map(screens.map((s) => [s.key, s]));
	const icons = {};
	const problems = [];
	for (const [name, spec] of Object.entries(table)) {
		const screen = spec.svg ? readPicture(spec.svg, spec.scale) : byKey.get(spec.screen);
		if (!screen) {
			problems.push(`${name}: no screen ${spec.screen ?? spec.svg}`);
			continue;
		}
		const [x0, y0, x1, y1] = spec.box;
		const inside = (b, [a0, b0, a1, b1], tol = 0.75) =>
			b.x0 >= a0 - tol && b.y0 >= b0 - tol && b.x1 <= a1 + tol && b.y1 <= b1 + tol;
		const meets = (b, [a0, b0, a1, b1]) => b.x0 < a1 && b.x1 > a0 && b.y0 < b1 && b.y1 > b0;
		const text = textShapes.get(spec.screen) ?? new Set();
		const shapes = screen.shapes.filter(
			(s) =>
				s.index > 0 &&
				// masked shapes may overhang the box (TE drew the whole device and masked it)
				(inside(s.box, spec.box) ||
					(spec.masked && s.maskShapes?.length && meets(s.box, spec.box))) &&
				(spec.text || !text.has(s.index)) &&
				!(spec.exclude ?? []).some((ex) => inside(s.box, ex, 0)) &&
				(!spec.keep || spec.keep(s))
		);
		if (shapes.length === 0) {
			problems.push(`${name}: nothing inside ${JSON.stringify(spec.box)} on ${spec.screen}`);
			continue;
		}
		const map = ([x, y]) => [x - x0, y - y0];
		icons[name] = {
			w: round(x1 - x0, 2),
			h: round(y1 - y0, 2),
			shapes: shapes.map((s) => {
				const out = {
					d: pathData(s.subpaths, map, 2),
					...shapeStyle(spec.opaque ? { ...s, opacity: 1 } : s)
				};
				if (s.maskShapes?.length) {
					out.clip = s.maskShapes.map((m) => pathData(m.subpaths, map, 2)).join('');
				}
				return out;
			})
		};
	}
	return { icons, problems };
}

/**
 * Cell patterns: pictures TE drew as a grid of equal squares (dissolve's noise field), kept as one
 * string per row, `.` for an unlit cell and 1…n for the colour at that index, far smaller than paths.
 */
const PATTERNS = {
	'engine.dissolve': {
		screen: 'synth-engines-016',
		cell: 10,
		origin: [0, 20.4],
		cols: 48,
		rows: 20
	}
};

/** Builds a pattern table (default: the core's PATTERNS) from their screens. */
export function buildPatterns(screens, table = PATTERNS) {
	const byKey = new Map(screens.map((s) => [s.key, s]));
	const patterns = {};
	const problems = [];
	for (const [name, spec] of Object.entries(table)) {
		const screen = byKey.get(spec.screen);
		if (!screen) {
			problems.push(`${name}: no screen ${spec.screen}`);
			continue;
		}
		const [ox, oy] = spec.origin;
		const colors = [];
		const grid = Array.from({ length: spec.rows }, () => Array(spec.cols).fill('.'));
		let cells = 0;
		for (const s of screen.shapes) {
			const w = boxW(s.box);
			const h = boxH(s.box);
			if (
				s.index === 0 ||
				s.fill === 'none' ||
				Math.abs(w - spec.cell) > 0.2 ||
				Math.abs(h - spec.cell) > 0.2
			)
				continue;
			const col = Math.round((s.box.x0 - ox) / spec.cell);
			const row = Math.round((s.box.y0 - oy) / spec.cell);
			if (col < 0 || col >= spec.cols || row < 0 || row >= spec.rows) continue;
			const color = normaliseColor(s.fill);
			if (color === '#000000') continue; // unlit: the screen's black
			let at = colors.indexOf(color);
			if (at < 0) at = colors.push(color) - 1;
			grid[row][col] = String(at + 1);
			cells++;
		}
		if (cells === 0) problems.push(`${name}: no cells on ${spec.screen}`);
		patterns[name] = {
			cell: spec.cell,
			x: ox,
			y: oy,
			colors,
			grid: grid.map((row) => row.join(''))
		};
	}
	return { patterns, problems };
}

// ─────────────────────────────────────────────────────────────────────────── CLI

function loadScreens() {
	const indexPath = path.join(ROOT, INDEX);
	if (!existsSync(indexPath)) {
		console.error(
			`missing ${INDEX}\nIt is a git-ignored research input: run scripts/fetch-research.sh first.`
		);
		process.exit(2);
	}
	const index = JSON.parse(readFileSync(indexPath, 'utf8'));
	return index.map((entry) => {
		const key = screenKey(entry);
		const svgText = readFileSync(path.join(ROOT, entry.svg), 'utf8');
		return { key, entry, ...readScreen(svgText) };
	});
}

function printRuns(prefix) {
	for (const screen of loadScreens()) {
		if (prefix && !screen.key.startsWith(prefix)) continue;
		const runs = textRuns(screen.shapes);
		console.log(`\n${screen.key}  (${screen.height.toFixed(2)} px tall, ${runs.length} runs)`);
		for (const run of runs) {
			const b = run.box;
			const sizes = run.glyphs.map((g) => boxH(g.box).toFixed(1)).join(' ');
			const gaps = run.glyphs
				.slice(1)
				.map((g, i) => (g.box.x0 - run.glyphs[i].box.x1).toFixed(1))
				.join(' ');
			console.log(
				`  n=${String(run.glyphs.length).padStart(2)} ${run.color.padEnd(8)} [${b.x0.toFixed(1)}, ${b.y0.toFixed(1)} → ${b.x1.toFixed(1)}, ${b.y1.toFixed(1)}] h: ${sizes} | gaps: ${gaps}`
			);
		}
	}
}

function formatFontReport(font, report) {
	const lines = [];
	const glyphNames = Object.keys(font.glyphs);
	lines.push(`glyphs: ${glyphNames.length}  (${glyphNames.join('')})`);
	lines.push(
		`metrics (units/em ${font.unitsPerEm}): ascender ${font.ascender}, cap ${font.capHeight}, x ${font.xHeight}, descender ${font.descender}, space ${font.space}`
	);
	lines.push(`missing printable ASCII: ${font.missing}`);
	lines.push(`text instances: ${report.instances.length}`);
	const sizeLine = [...report.sizes]
		.sort(([a], [b]) => a - b)
		.map(([px, list]) => {
			const spread = list.map((x) => x.px);
			return `${px}px ×${list.length} (${round(Math.min(...spread), 2)}–${round(Math.max(...spread), 2)})`;
		})
		.join(', ');
	lines.push(`text sizes: ${sizeLine}`);
	const worst = [...report.deviations].sort((a, b) => b.distance - a.distance).slice(0, 12);
	lines.push('largest sample deviations (font units: outline distance / bbox):');
	for (const d of worst) {
		lines.push(
			`  ${d.name.padEnd(4)} ${round(d.distance, 1)} / ${round(d.boxDelta, 1)}  ${d.where}`
		);
	}
	const res = report.residuals.map((r) => Math.abs(r.res) * font.unitsPerEm);
	lines.push(
		`spacing fit: ${res.length} pairs, median |residual| ${round(median(res), 1)} u, 90th ${round(
			[...res].sort((a, b) => a - b)[Math.floor(res.length * 0.9)],
			1
		)} u, max ${round(Math.max(...res), 1)} u`
	);
	lines.push(
		`figures: tabular advance ${report.figures.tabularAdvance} u; digit pairs fit tabular ${JSON.stringify(report.figures.tabular)} vs proportional ${JSON.stringify(report.figures.proportional)}`
	);
	lines.push(`kerning pairs: ${Object.keys(font.kerning).length}  ${JSON.stringify(font.kerning)}`);
	if (report.problems.length) {
		lines.push(`problems (${report.problems.length}):`);
		for (const p of report.problems) lines.push(`  ${p}`);
	}
	return lines.join('\n');
}

async function main() {
	const args = process.argv.slice(2);
	if (args[0] === '--runs') {
		printRuns(args[1]);
		return;
	}
	const screens = loadScreens();
	const { font, report } = buildFont(screens);
	if (!args.includes('--quiet')) console.log(formatFontReport(font, report));
	if (args.includes('--instances')) {
		report.instances.forEach((inst, r) =>
			console.log(
				`${inst.screen.padEnd(18)} ${round(report.size[r], 2).toString().padStart(6)}px  ${inst.label}`
			)
		);
		return;
	}
	// shapes used as text are left out of the pictograms
	const textShapes = new Map();
	for (const inst of report.instances) {
		if (!textShapes.has(inst.screen)) textShapes.set(inst.screen, new Set());
		for (const g of inst.glyphs) {
			for (const index of g.shape.parts ?? [g.shape.index]) textShapes.get(inst.screen).add(index);
		}
	}
	const { icons, problems } = buildIcons(screens, textShapes);
	const { patterns, problems: patternProblems } = buildPatterns(screens);
	if (!args.includes('--quiet')) {
		console.log(`icons: ${Object.keys(icons).length}  (${Object.keys(icons).join(', ')})`);
		console.log(`patterns: ${Object.keys(patterns).join(', ')}`);
		for (const p of [...problems, ...patternProblems]) console.log(`  icon problem: ${p}`);
	}
	const comment =
		"Generated by scripts/extract-screen-font.mjs from the screen illustrations in Teenage Engineering's public OP-XY guide (credited in NOTICE.md). Do not edit by hand. Units: screen pixels (480 × 220 design grid), origin at each icon's top-left.";
	const outputs = [
		[FONT_OUT, font],
		[ICONS_OUT, { $comment: comment, format: 1, icons, patterns }]
	];
	// each area's pictograms in a file of its own; an area with none has no file
	const retired = [];
	for (const [area, art] of Object.entries(AREA_ART)) {
		const file = `${AREA_ICONS_DIR}/${area}.json`;
		const built = buildIcons(screens, textShapes, art.icons);
		const cells = buildPatterns(screens, art.patterns);
		for (const p of [...built.problems, ...cells.problems])
			console.log(`  icon problem (${area}): ${p}`);
		if (Object.keys(built.icons).length + Object.keys(cells.patterns).length === 0) {
			if (existsSync(path.join(ROOT, file))) retired.push(file);
			continue;
		}
		if (!args.includes('--quiet')) {
			console.log(`${area} icons: ${Object.keys(built.icons).join(', ') || '–'}`);
		}
		outputs.push([
			file,
			{ $comment: comment, format: 1, icons: built.icons, patterns: cells.patterns }
		]);
	}
	await writeOutputs(outputs, args.includes('--check'), retired);
}

async function format(code, file) {
	const prettier = await import('prettier');
	const options = (await prettier.resolveConfig(file)) ?? {};
	return prettier.format(code, { ...options, filepath: file });
}

/**
 * Writes (or with `check`, compares) each [file, data] as Prettier-formatted JSON, and deletes (or
 * reports) `retired` files that nothing produces any more.
 */
async function writeOutputs(outputs, check, retired = []) {
	let stale = false;
	for (const file of retired) {
		if (check) {
			console.error(
				`${file} is stale (its area has no icons): run node scripts/extract-screen-font.mjs`
			);
			stale = true;
		} else {
			unlinkSync(path.join(ROOT, file));
			console.log(`deleted ${file}`);
		}
	}
	for (const [file, data] of outputs) {
		const outPath = path.join(ROOT, file);
		mkdirSync(path.dirname(outPath), { recursive: true });
		const formatted = await format(JSON.stringify(data), outPath);
		const previous = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null;
		const kib = `${(formatted.length / 1024).toFixed(1)} KiB`;
		if (check) {
			if (previous !== formatted) {
				console.error(`${file} is stale: run node scripts/extract-screen-font.mjs`);
				stale = true;
			} else console.log(`${file} is up to date`);
		} else if (previous === formatted) {
			console.log(`${file} unchanged (${kib})`);
		} else {
			writeFileSync(outPath, formatted);
			console.log(`wrote ${file} (${kib})`);
		}
	}
	if (stale) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.stack : error);
		process.exit(1);
	});
}
