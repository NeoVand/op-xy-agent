#!/usr/bin/env node
/**
 * build-replica-art.mjs — turns Teenage Engineering's OP-XY panel line drawing into per-control
 * replica artwork (decision D9), with the "OP" / "XY" wordmarks left out (decision D6).
 *
 * Inputs
 *   research/ui-reference/guide-svg/layout/001_6731e8d7f430b9ee1a804922.svg — the guide's full-panel
 *     drawing (740 × 265 units, 588 single-colour paths). Git-ignored research input; re-create it
 *     with scripts/fetch-research.sh.
 *   knowledge/opxy/controls.json — millimetre geometry of every control (the ids the art is keyed by).
 *
 * Output
 *   src/lib/replica/art.generated.ts (committed): legend paths per key in keycap-local millimetres,
 *   measured outlines (tiles, keycaps, LED windows, encoder and volume rings), the speaker grille,
 *   the body-margin features (mic, level meter, tick, power switch, pitch bend), the tile-junction
 *   marks for a line-art theme, and the provenance / coverage data the tests check.
 *
 * How
 *   1. Parse every path (M L H V C S Q T Z, absolute and relative; arcs are rejected loudly) into
 *      subpaths with exact bounding boxes. Drop exact duplicates (the drawing repeats some paths).
 *   2. Recognise primitives: rounded rectangles (body, tiles), circles (keycaps, encoder and volume
 *      rings, grille holes, mic), two-circle rings (LED windows), straight lines (level meter).
 *   3. Transform: a first estimate from the body outline (285 × 102 mm), then a least-squares fit
 *      over every control centre in controls.json matched to its drawn feature. The residual is
 *      reported and kept in the output.
 *   4. Assign the rest: fills that hug tile edges are tile-junction marks (texture); whatever sits in
 *      the right margin besides the mic and the level meter is the logo (stripped); every subpath
 *      inside a key's tile is that key's legend — on the cap, or printed on the tile ("num").
 *   5. Emit keycap-local coordinates relative to each control's *drawn* centre, so a legend sits on
 *      its cap exactly as TE drew it while the control itself is placed by controls.json.
 *
 * Deterministic: the output depends only on the two inputs. Formatted with the repo's Prettier config.
 *
 * Usage
 *   node scripts/build-replica-art.mjs          write the module and print the coverage report
 *   node scripts/build-replica-art.mjs --check  exit 1 when the committed module is stale
 *   node scripts/build-replica-art.mjs --quiet  no report
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'research/ui-reference/guide-svg/layout/001_6731e8d7f430b9ee1a804922.svg';
const SOURCE_ASSET = '6731e8d7f430b9ee1a804922';
const CONTROLS = 'knowledge/opxy/controls.json';
const OUTPUT = 'src/lib/replica/art.generated.ts';

/** Decimals of emitted millimetres (1 µm: far below anything a screen can show). */
const DECIMALS = 3;

/** Tolerances in drawing units (1 u ≈ 0.39 mm). */
const TOL = {
	/** A control centre from controls.json may sit this far from its drawn feature. */
	match: 4,
	/** Tile-junction marks never reach further than this from a tile edge; legends stay further. */
	junction: 3.5,
	/** Points of a straight edge lie this close to the bounding box. */
	edge: 0.05
};

// ─────────────────────────────────────────────────────────────────────────── small helpers

const round = (n) => {
	const r = Number(n.toFixed(DECIMALS));
	return Object.is(r, -0) ? 0 : r;
};
const fmt = (n) => String(round(n));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const centreOf = (box) => [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
const boxW = (box) => box.x1 - box.x0;
const boxH = (box) => box.y1 - box.y0;
const emptyBox = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
const growBox = (box, [x, y]) => {
	box.x0 = Math.min(box.x0, x);
	box.y0 = Math.min(box.y0, y);
	box.x1 = Math.max(box.x1, x);
	box.y1 = Math.max(box.y1, y);
	return box;
};
const unionBox = (a, b) => growBox(growBox({ ...a }, [b.x0, b.y0]), [b.x1, b.y1]);
const boxesOverlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const inBox = (box, [x, y], pad = 0) =>
	x >= box.x0 - pad && x <= box.x1 + pad && y >= box.y0 - pad && y <= box.y1 + pad;
const iou = (a, b) => {
	const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
	const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
	if (w <= 0 || h <= 0) return 0;
	const inter = w * h;
	return inter / (boxW(a) * boxH(a) + boxW(b) * boxH(b) - inter);
};

// ─────────────────────────────────────────────────────────────────────────── SVG reading

/**
 * Reads the flat SVG that Figma exports: `<path>` elements only, no transforms.
 * @param {string} svgText
 */
export function readDrawing(svgText) {
	const body = svgText.replace(/<defs>[\s\S]*?<\/defs>/g, '');
	if (/\stransform="/.test(body)) {
		throw new Error('the drawing uses transform attributes; teach build-replica-art.mjs first');
	}
	const others = body.match(/<(?:rect|circle|ellipse|line|polyline|polygon|text|image|use)\b/g);
	if (others) throw new Error(`unsupported SVG elements: ${[...new Set(others)].join(', ')}`);
	const viewBox = /viewBox="([^"]+)"/
		.exec(svgText)?.[1]
		.trim()
		.split(/[\s,]+/)
		.map(Number);
	if (!viewBox || viewBox.length !== 4) throw new Error('the drawing has no viewBox');
	// Paths inherit fill from the root element (Figma writes fill="none" there).
	const rootFill = /<svg\b[^>]*\sfill="([^"]*)"/.exec(svgText)?.[1] ?? 'black';
	const paths = [];
	for (const [, attrText] of body.matchAll(/<path\b([^>]*?)\/?>/g)) {
		const attrs = Object.fromEntries(
			[...attrText.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]])
		);
		if (!attrs.d) continue;
		const fill = attrs.fill ?? rootFill;
		const stroke = attrs.stroke ?? 'none';
		paths.push({
			index: paths.length,
			d: attrs.d,
			filled: fill !== 'none',
			stroked: stroke !== 'none',
			strokeWidth: stroke !== 'none' ? Number(attrs['stroke-width'] ?? 1) : 0,
			evenOdd: attrs['fill-rule'] === 'evenodd',
			subpaths: parsePathData(attrs.d)
		});
	}
	return { viewBox, paths };
}

// ─────────────────────────────────────────────────────────────────────────── path data

const TOKEN = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/**
 * Parses SVG path data into absolute subpaths of line (`L`) and cubic (`C`) segments.
 * @param {string} d
 */
export function parsePathData(d) {
	const tokens = d.match(TOKEN) ?? [];
	const isCommand = (t) => /^[a-zA-Z]$/.test(t);
	const subpaths = [];
	let i = 0;
	let cmd = '';
	let x = 0;
	let y = 0;
	let current = null;
	let lastCubic = null; // second control point of the previous C/S (for S reflection)
	let lastQuad = null; // control point of the previous Q/T (for T reflection)
	const num = () => {
		const t = tokens[i++];
		if (t === undefined || isCommand(t)) throw new Error(`path data ends early: "${d}"`);
		return Number(t);
	};
	const open = () => {
		if (!current) {
			current = { start: [x, y], segs: [], closed: false };
			subpaths.push(current);
		}
		return current;
	};
	const cubic = (c1, c2, to) => {
		open().segs.push({ type: 'C', c1, c2, to });
		[x, y] = to;
	};
	while (i < tokens.length) {
		if (isCommand(tokens[i])) cmd = tokens[i++];
		else if (!cmd || cmd === 'Z' || cmd === 'z') throw new Error(`stray number in path "${d}"`);
		const rel = cmd === cmd.toLowerCase();
		const ox = rel ? x : 0;
		const oy = rel ? y : 0;
		switch (cmd.toUpperCase()) {
			case 'M':
				x = ox + num();
				y = oy + num();
				current = { start: [x, y], segs: [], closed: false };
				subpaths.push(current);
				cmd = rel ? 'l' : 'L'; // further pairs are implicit line-tos
				lastCubic = lastQuad = null;
				break;
			case 'L':
				x = ox + num();
				y = oy + num();
				open().segs.push({ type: 'L', to: [x, y] });
				lastCubic = lastQuad = null;
				break;
			case 'H':
				x = ox + num();
				open().segs.push({ type: 'L', to: [x, y] });
				lastCubic = lastQuad = null;
				break;
			case 'V':
				y = oy + num();
				open().segs.push({ type: 'L', to: [x, y] });
				lastCubic = lastQuad = null;
				break;
			case 'C': {
				const c1 = [ox + num(), oy + num()];
				const c2 = [ox + num(), oy + num()];
				const to = [ox + num(), oy + num()];
				cubic(c1, c2, to);
				lastCubic = c2;
				lastQuad = null;
				break;
			}
			case 'S': {
				const c1 = lastCubic ? [2 * x - lastCubic[0], 2 * y - lastCubic[1]] : [x, y];
				const c2 = [ox + num(), oy + num()];
				const to = [ox + num(), oy + num()];
				cubic(c1, c2, to);
				lastCubic = c2;
				lastQuad = null;
				break;
			}
			case 'Q':
			case 'T': {
				const q =
					cmd.toUpperCase() === 'Q'
						? [ox + num(), oy + num()]
						: lastQuad
							? [2 * x - lastQuad[0], 2 * y - lastQuad[1]]
							: [x, y];
				const to = [ox + num(), oy + num()];
				// Degree elevation: a quadratic is the cubic with controls 2/3 of the way to q.
				const from = [x, y];
				cubic(
					[from[0] + (2 / 3) * (q[0] - from[0]), from[1] + (2 / 3) * (q[1] - from[1])],
					[to[0] + (2 / 3) * (q[0] - to[0]), to[1] + (2 / 3) * (q[1] - to[1])],
					to
				);
				lastQuad = q;
				lastCubic = null;
				break;
			}
			case 'Z':
				if (current) {
					current.closed = true;
					[x, y] = current.start;
				}
				current = null; // a following drawing command starts a new subpath here
				lastCubic = lastQuad = null;
				break;
			case 'A':
				throw new Error('elliptical arcs are not supported (the drawing has none); extend me');
			default:
				throw new Error(`unknown path command "${cmd}"`);
		}
	}
	for (const sp of subpaths) {
		sp.box = subpathBox(sp);
		sp.circle = circleOf(sp);
		sp.rect = sp.circle ? null : roundedRectOf(sp);
	}
	return subpaths;
}

function cubicAt(p0, p1, p2, p3, t) {
	const mt = 1 - t;
	return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

/** Parameters in (0, 1) where one coordinate of a cubic has a turning point. */
function turningPoints(p0, p1, p2, p3) {
	// B'(t)/3 = A(1−t)² + 2B(1−t)t + Ct² with A = p1−p0, B = p2−p1, C = p3−p2
	const A = p1 - p0;
	const B = p2 - p1;
	const C = p3 - p2;
	const a = A - 2 * B + C;
	const b = 2 * (B - A);
	const c = A;
	const roots = [];
	if (Math.abs(a) < 1e-12) {
		if (Math.abs(b) > 1e-12) roots.push(-c / b);
	} else {
		const disc = b * b - 4 * a * c;
		if (disc >= 0) {
			const s = Math.sqrt(disc);
			roots.push((-b + s) / (2 * a), (-b - s) / (2 * a));
		}
	}
	return roots.filter((t) => t > 0 && t < 1);
}

function subpathBox(sp) {
	const box = growBox(emptyBox(), sp.start);
	let from = sp.start;
	for (const seg of sp.segs) {
		growBox(box, seg.to);
		if (seg.type === 'C') {
			for (const axis of [0, 1]) {
				for (const t of turningPoints(from[axis], seg.c1[axis], seg.c2[axis], seg.to[axis])) {
					const p = [...from];
					p[axis] = cubicAt(from[axis], seg.c1[axis], seg.c2[axis], seg.to[axis], t);
					p[1 - axis] = cubicAt(
						from[1 - axis],
						seg.c1[1 - axis],
						seg.c2[1 - axis],
						seg.to[1 - axis],
						t
					);
					growBox(box, p);
				}
			}
		}
		from = seg.to;
	}
	return box;
}

/** Points along a subpath: every vertex plus `n` samples inside each curve. */
function samplePoints(sp, n = 12) {
	const pts = [sp.start];
	let from = sp.start;
	for (const seg of sp.segs) {
		if (seg.type === 'C') {
			for (let k = 1; k < n; k++) {
				const t = k / n;
				pts.push([
					cubicAt(from[0], seg.c1[0], seg.c2[0], seg.to[0], t),
					cubicAt(from[1], seg.c1[1], seg.c2[1], seg.to[1], t)
				]);
			}
		}
		pts.push(seg.to);
		from = seg.to;
	}
	return pts;
}

const lastPoint = (sp) => (sp.segs.length ? sp.segs[sp.segs.length - 1].to : sp.start);

/** A (nearly) closed subpath whose every point lies on one circle. */
function circleOf(sp) {
	const { box } = sp;
	const w = boxW(box);
	const h = boxH(box);
	if (w < 0.5 || Math.abs(w - h) > 0.03 * w || sp.segs.length < 2) return null;
	const r = (w + h) / 4;
	const c = centreOf(box);
	if (!sp.closed && dist(sp.start, lastPoint(sp)) > 0.05 * r) return null;
	for (const p of samplePoints(sp)) {
		if (Math.abs(dist(p, c) - r) > 0.03 * r + 0.01) return null;
	}
	return { cx: c[0], cy: c[1], r };
}

/** A closed subpath whose perimeter is mostly straight edges on its own bounding box. */
function roundedRectOf(sp) {
	const { box } = sp;
	if (!sp.closed || boxW(box) < 5 || boxH(box) < 5) return null;
	const onEdge = ([x, y]) =>
		Math.min(
			Math.abs(x - box.x0),
			Math.abs(x - box.x1),
			Math.abs(y - box.y0),
			Math.abs(y - box.y1)
		) < TOL.edge;
	let straight = 0;
	let total = 0;
	let from = sp.start;
	const radii = [];
	const segs = [...sp.segs, { type: 'L', to: sp.start }];
	for (const seg of segs) {
		const pts = seg.type === 'C' ? samplePoints({ start: from, segs: [seg] }) : [from, seg.to];
		for (let k = 1; k < pts.length; k++) total += dist(pts[k - 1], pts[k]);
		if (seg.type === 'L') {
			const mid = [(from[0] + seg.to[0]) / 2, (from[1] + seg.to[1]) / 2];
			if (onEdge(from) && onEdge(seg.to) && onEdge(mid)) straight += dist(from, seg.to);
		} else {
			const dx = Math.abs(seg.to[0] - from[0]);
			const dy = Math.abs(seg.to[1] - from[1]);
			if (Math.abs(dx - dy) < 0.05 * Math.max(dx, dy)) radii.push((dx + dy) / 2);
		}
		from = seg.to;
	}
	if (total === 0 || straight / total < 0.6) return null;
	return { x: box.x0, y: box.y0, w: boxW(box), h: boxH(box), r: radii.length ? mean(radii) : 0 };
}

/**
 * Serialises subpaths as compact absolute path data after mapping every point: axis-aligned lines
 * become H/V, and a repeated command letter is left implicit.
 */
function pathData(subpaths, map) {
	let out = '';
	let last = '';
	const join = (values) =>
		values.map(fmt).reduce((s, n, k) => (k === 0 ? n : s + (n.startsWith('-') ? '' : ' ') + n), '');
	const emit = (command, values) => {
		const text = join(values);
		// An implicit repeat needs a separator unless the next number carries its own sign.
		if (command === last && command !== 'M') out += (text.startsWith('-') ? '' : ' ') + text;
		else out += command + text;
		last = command;
	};
	for (const sp of subpaths) {
		let from = map(sp.start).map(round);
		emit('M', from);
		for (const seg of sp.segs) {
			const to = map(seg.to).map(round);
			if (seg.type === 'C') emit('C', [...map(seg.c1), ...map(seg.c2), ...to]);
			else if (to[1] === from[1]) emit('H', [to[0]]);
			else if (to[0] === from[0]) emit('V', [to[1]]);
			else emit('L', to);
			from = to;
		}
		if (sp.closed) {
			out += 'Z';
			last = 'Z';
		}
	}
	return out;
}

// ─────────────────────────────────────────────────────────────────────────── transforms

/** x_mm = ax·u + bx, y_mm = ay·v + by */
const apply = (T, [x, y]) => [T.ax * x + T.bx, T.ay * y + T.by];
const invert = (T, [x, y]) => [(x - T.bx) / T.ax, (y - T.by) / T.ay];

/** Least squares per axis over pairs of [drawing point, millimetre point]. */
function fitAxes(pairs) {
	const axis = (k) => {
		const us = pairs.map((p) => p.u[k]);
		const ms = pairs.map((p) => p.mm[k]);
		const mu = mean(us);
		const mm = mean(ms);
		let sxy = 0;
		let sxx = 0;
		for (let j = 0; j < us.length; j++) {
			sxy += (us[j] - mu) * (ms[j] - mm);
			sxx += (us[j] - mu) ** 2;
		}
		const a = sxy / sxx;
		return [a, mm - a * mu];
	};
	const [ax, bx] = axis(0);
	const [ay, by] = axis(1);
	return { ax, bx, ay, by };
}

function residuals(T, pairs) {
	const rows = pairs.map((p) => {
		const [x, y] = apply(T, p.u);
		return { id: p.id, dx: x - p.mm[0], dy: y - p.mm[1], d: Math.hypot(x - p.mm[0], y - p.mm[1]) };
	});
	const worst = rows.reduce((a, b) => (b.d > a.d ? b : a));
	return {
		pairs: rows.length,
		rms: Math.sqrt(mean(rows.map((r) => r.d * r.d))),
		max: worst.d,
		maxId: worst.id,
		meanDx: mean(rows.map((r) => r.dx)),
		meanDy: mean(rows.map((r) => r.dy))
	};
}

// ─────────────────────────────────────────────────────────────────────────── the build

/**
 * Segments the drawing and returns the module source plus a coverage report.
 * @param {string} svgText the TE layout drawing
 * @param {any} controlsFile parsed knowledge/opxy/controls.json
 */
export function buildArt(svgText, controlsFile) {
	const drawing = readDrawing(svgText);
	const controls = controlsFile.controls;
	const byId = new Map(controls.map((c) => [c.id, c]));
	const panel = controlsFile.panel;

	// 1. exact duplicates
	const seen = new Map();
	const unique = [];
	const duplicates = [];
	for (const p of drawing.paths) {
		const key = `${p.filled}|${p.stroked}|${p.d}`;
		if (seen.has(key)) duplicates.push({ index: p.index, of: seen.get(key) });
		else {
			seen.set(key, p.index);
			unique.push(p);
		}
	}
	// Near duplicates: the same circle written with slightly different numbers (encoder 2's cap).
	const circleKey = (p) =>
		p.subpaths.length === 1 && p.subpaths[0].circle ? p.subpaths[0].circle : null;
	for (let k = unique.length - 1; k >= 0; k--) {
		const a = circleKey(unique[k]);
		if (!a) continue;
		const twin = unique.find((p, j) => {
			const b = circleKey(p);
			return (
				j < k &&
				b &&
				p.filled === unique[k].filled &&
				p.stroked === unique[k].stroked &&
				Math.abs(a.cx - b.cx) < 0.05 &&
				Math.abs(a.cy - b.cy) < 0.05 &&
				Math.abs(a.r - b.r) < 0.05
			);
		});
		if (twin) {
			duplicates.push({ index: unique[k].index, of: twin.index });
			unique.splice(k, 1);
		}
	}
	duplicates.sort((a, b) => a.index - b.index);
	for (const p of unique) {
		p.box = p.subpaths.reduce((b, sp) => unionBox(b, sp.box), emptyBox());
	}

	/** index → { category, id?, note? }; categories are listed in the report. */
	const records = new Map();
	const claim = (p, category, id = null, note = null) => {
		if (records.has(p.index)) throw new Error(`path #${p.index} claimed twice`);
		records.set(p.index, { category, id, note });
	};
	const free = () => unique.filter((p) => !records.has(p.index));
	const single = (p, kind) => p.subpaths.length === 1 && p.subpaths[0][kind];

	// 2. body outline → first transform (the body is 285 × 102 mm without the switch tab)
	const rectPaths = unique.filter((p) => p.stroked && !p.filled && single(p, 'rect'));
	const bodyPath = rectPaths.reduce((a, b) =>
		boxW(b.box) * boxH(b.box) > boxW(a.box) * boxH(a.box) ? b : a
	);
	const bodyRect = bodyPath.subpaths[0].rect;
	const bodyT = {
		ax: panel.body.width / bodyRect.w,
		bx: (-bodyRect.x * panel.body.width) / bodyRect.w,
		ay: panel.body.height / bodyRect.h,
		by: (-bodyRect.y * panel.body.height) / bodyRect.h
	};
	claim(bodyPath, 'body');
	const bodyBox = bodyPath.box;

	const rectToU = (T, r) => {
		const [x0, y0] = invert(T, [r.x, r.y]);
		const [x1, y1] = invert(T, [r.x + r.w, r.y + r.h]);
		return { x0, y0, x1, y1 };
	};

	// 3. tile outlines, matched to every control that owns a grid cell
	const gridControls = controls.filter((c) => c.geometry.face === 'top' && c.geometry.grid);
	const tileOf = new Map(); // control id → drawn tile { box, rect }
	for (const control of gridControls) {
		const want = rectToU(bodyT, control.geometry.rect);
		let best = null;
		for (const p of rectPaths) {
			if (records.has(p.index)) continue;
			const score = iou(p.box, want);
			if (score > 0.85 && (!best || score > best.score)) best = { p, score };
		}
		if (!best) throw new Error(`no drawn tile outline for ${control.id}`);
		claim(best.p, 'tile', control.id);
		tileOf.set(control.id, { box: best.p.box, rect: best.p.subpaths[0].rect });
	}
	const gridBox = [...tileOf.values()].reduce((b, t) => unionBox(b, t.box), emptyBox());
	const tileEdges = [...tileOf.values()].flatMap(({ box: b }) => [
		[
			[b.x0, b.y0],
			[b.x1, b.y0]
		],
		[
			[b.x1, b.y0],
			[b.x1, b.y1]
		],
		[
			[b.x1, b.y1],
			[b.x0, b.y1]
		],
		[
			[b.x0, b.y1],
			[b.x0, b.y0]
		]
	]);

	// 4. circles: keycaps, encoder and volume rings, grille holes, mic
	const circles = unique
		.filter((p) => p.stroked && !p.filled && single(p, 'circle'))
		.map((p) => ({ p, ...p.subpaths[0].circle }));
	const freeCircles = (pred) => circles.filter((c) => !records.has(c.p.index) && pred(c));
	const near = (c, pt, tol = TOL.match) => Math.hypot(c.cx - pt[0], c.cy - pt[1]) < tol;
	const expectedU = (control) =>
		invert(bodyT, [control.geometry.center.x, control.geometry.center.y]);

	const keys = controls.filter((c) => c.kind === 'key');
	const keycapOf = new Map();
	for (const key of keys) {
		const want = expectedU(key);
		const found = freeCircles((c) => c.r > 11 && c.r < 13 && near(c, want)).sort(
			(a, b) =>
				Math.hypot(a.cx - want[0], a.cy - want[1]) - Math.hypot(b.cx - want[0], b.cy - want[1])
		)[0];
		if (!found) throw new Error(`no drawn keycap for ${key.id}`);
		claim(found.p, 'keycap', key.id);
		keycapOf.set(key.id, found);
	}

	const ringsOf = (control, parts) => {
		const want = expectedU(control);
		const found = freeCircles((c) => near(c, want, 1.5) && c.r > 5).sort((a, b) => b.r - a.r);
		if (found.length !== parts.length) {
			throw new Error(
				`${control.id}: expected ${parts.length} concentric circles, found ${found.length}`
			);
		}
		found.forEach((c, k) => claim(c.p, parts[k], control.id));
		return Object.fromEntries(found.map((c, k) => [parts[k], c]));
	};
	const encoders = controls.filter((c) => c.kind === 'encoder');
	const encoderRings = new Map(encoders.map((e) => [e.id, ringsOf(e, ['dish', 'top', 'cap'])]));

	const volume = byId.get('knob.volume');
	const volumeTile = tileOf.get('knob.volume').box;
	const volumeRings = (() => {
		const inTile = freeCircles((c) => inBox(volumeTile, [c.cx, c.cy]));
		const big = inTile.filter((c) => c.r > 5).sort((a, b) => b.r - a.r);
		const small = inTile.filter((c) => c.r <= 5);
		if (big.length !== 2 || small.length !== 1) {
			throw new Error(
				`volume knob: expected 2 rings and a dimple, found ${big.length} + ${small.length}`
			);
		}
		claim(big[0].p, 'volume-outer', volume.id);
		claim(big[1].p, 'volume-top', volume.id);
		claim(small[0].p, 'volume-dimple', volume.id);
		return { outer: big[0], top: big[1], dimple: small[0] };
	})();

	const speaker = byId.get('speaker.internal');
	const speakerTile = tileOf.get('speaker.internal').box;
	const holes = freeCircles((c) => c.r > 1 && c.r < 2 && inBox(speakerTile, [c.cx, c.cy]));
	for (const h of holes) claim(h.p, 'grille-hole', speaker.id);

	const mic = byId.get('mic.internal');
	const micCircle = freeCircles((c) => c.r < 2 && near(c, expectedU(mic)))[0];
	if (!micCircle) throw new Error('no drawn mic hole');
	claim(micCircle.p, 'mic', mic.id);

	// 5. LED windows: filled rings of two concentric circles (Ø ≈ 4.5 u) in the top half of a
	//    keycap. Legends contain smaller rings (the hollow dot of track 5's icon), hence the size.
	const ledOf = new Map();
	for (const p of free()) {
		if (!p.filled || p.subpaths.length !== 2 || !p.subpaths.every((sp) => sp.circle)) continue;
		const [a, b] = p.subpaths.map((sp) => sp.circle);
		if (Math.hypot(a.cx - b.cx, a.cy - b.cy) > 0.05) continue;
		const outer = a.r > b.r ? a : b;
		const inner = a.r > b.r ? b : a;
		if (outer.r < 2 || outer.r > 2.6) continue;
		const key = keys.find((k) => {
			const cap = keycapOf.get(k.id);
			return (
				Math.hypot(outer.cx - cap.cx, outer.cy - cap.cy) < cap.r && outer.cy < cap.cy - cap.r / 2
			);
		});
		if (!key) continue;
		if (ledOf.has(key.id)) throw new Error(`${key.id} has two LED windows`);
		claim(p, 'led', key.id);
		ledOf.set(key.id, { cx: outer.cx, cy: outer.cy, r: outer.r, inner: inner.r });
	}

	// 6. body-margin features, logo, stray grille artefacts
	const rightMargin = { x0: gridBox.x1 + 1, y0: bodyBox.y0, x1: bodyBox.x1 - 0.5, y1: bodyBox.y1 };
	const features = {};
	for (const p of free()) {
		const b = p.box;
		if (b.x0 >= bodyBox.x1 - 0.5) {
			claim(p, 'switch', 'switch.power');
			features.powerSwitch = p;
		} else if (b.y0 >= bodyBox.y1 - 0.5) {
			claim(p, 'pitchbend', 'strip.pitchbend');
			features.pitchBend = p;
		} else if (b.y0 >= gridBox.y1 - 0.5 && b.y1 <= bodyBox.y1 + 0.5) {
			claim(p, 'tick', 'marking.tick');
			features.tick = p;
		} else if (b.x0 >= rightMargin.x0 && b.x1 <= rightMargin.x1) {
			const sp = p.subpaths[0];
			const isLine =
				p.subpaths.length === 1 && sp.segs.length === 1 && sp.segs[0].type === 'L' && boxW(b) < 0.1;
			if (isLine) {
				claim(p, 'meter', 'meter.level');
				features.meter = p;
			} else {
				claim(p, 'logo', null, 'wordmark in the right margin (decision D6)');
			}
		} else if (
			!p.filled &&
			p.subpaths.length === 1 &&
			!p.subpaths[0].closed &&
			inBox(speakerTile, centreOf(b))
		) {
			const onHole = holes.some(
				(h) => Math.hypot(centreOf(b)[0] - h.cx, centreOf(b)[1] - h.cy) < h.r + 1
			);
			if (onHole) claim(p, 'artifact', speaker.id, 'pen tail next to a grille hole');
		}
	}
	for (const name of ['powerSwitch', 'pitchBend', 'tick', 'meter']) {
		if (!features[name]) throw new Error(`no drawn ${name}`);
	}

	// 7. tile-junction marks: fills whose every point hugs a tile edge
	const nearTileEdge = ([x, y]) =>
		tileEdges.some(([a, b]) => {
			const vx = b[0] - a[0];
			const vy = b[1] - a[1];
			const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy)));
			return Math.hypot(x - (a[0] + t * vx), y - (a[1] + t * vy)) < TOL.junction;
		});
	for (const p of free()) {
		if (!p.filled) continue;
		if (p.subpaths.every((sp) => samplePoints(sp).every(nearTileEdge))) {
			claim(p, boxW(p.box) > boxW(gridBox) / 2 ? 'frame' : 'junction');
		}
	}

	// 8. legends: every remaining subpath inside a key tile, on the cap or on the tile
	const legendParts = new Map(keys.map((k) => [k.id, []])); // id → [{ index, part, subpaths, box, p }]
	const unassigned = [];
	for (const p of free()) {
		const groups = new Map();
		const orphans = [];
		for (const sp of p.subpaths) {
			const c = centreOf(sp.box);
			const key = keys.find((k) => inBox(tileOf.get(k.id).box, c));
			if (!key) {
				orphans.push(sp);
				continue;
			}
			const cap = keycapOf.get(key.id);
			const part = Math.hypot(c[0] - cap.cx, c[1] - cap.cy) <= cap.r + 0.25 ? 'cap' : 'tile';
			const gkey = `${key.id}|${part}`;
			if (!groups.has(gkey)) groups.set(gkey, { id: key.id, part, subpaths: [] });
			groups.get(gkey).subpaths.push(sp);
		}
		if (orphans.length) {
			const where = gridControls.find((c) => inBox(tileOf.get(c.id).box, centreOf(p.box)));
			unassigned.push({
				index: p.index,
				reason: where
					? `inside ${where.id} but not a recognised part of it`
					: 'outside every tile and margin feature'
			});
			continue;
		}
		const ids = [...groups.values()];
		claim(p, 'legend', ids.map((g) => g.id).join(', '));
		for (const g of ids) {
			legendParts.get(g.id).push({
				index: p.index,
				part: g.part,
				subpaths: g.subpaths,
				box: g.subpaths.reduce((b, sp) => unionBox(b, sp.box), emptyBox()),
				stroke: p.stroked && !p.filled ? p.strokeWidth : 0,
				evenOdd: p.evenOdd
			});
		}
	}
	for (const p of free()) {
		if (!unassigned.some((u) => u.index === p.index)) {
			unassigned.push({ index: p.index, reason: 'no rule matched' });
		}
	}

	// 9. refined transform: least squares over every control centre and its drawn feature
	const pairs = [];
	const pair = (id, u) => {
		const c = byId.get(id).geometry.center;
		pairs.push({ id, u, mm: [c.x, c.y] });
	};
	for (const key of keys) pair(key.id, [keycapOf.get(key.id).cx, keycapOf.get(key.id).cy]);
	for (const [id, rings] of encoderRings) pair(id, [rings.dish.cx, rings.dish.cy]);
	pair('knob.volume', [volumeRings.outer.cx, volumeRings.outer.cy]);
	pair('speaker.internal', centreOf(speakerTile));
	pair('screen.main', centreOf(tileOf.get('screen.main').box));
	pair('mic.internal', [micCircle.cx, micCircle.cy]);
	const fitT = fitAxes(pairs);
	const fit = residuals(fitT, pairs);
	const bodyFit = residuals(bodyT, pairs);

	// 10. emission helpers: control-local millimetres around a drawn centre (scale of the fit)
	const localMap =
		(origin) =>
		([x, y]) => [fitT.ax * (x - origin[0]), fitT.ay * (y - origin[1])];
	const mmLen = (u) => u * (fitT.ax + fitT.ay) * 0.5;
	/** Drawn centre minus the controls.json centre, both in millimetres (fitted transform). */
	const offsetOf = (id, origin) => {
		const [x, y] = apply(fitT, origin);
		const c = byId.get(id).geometry.center;
		return { x: round(x - c.x), y: round(y - c.y) };
	};
	const localRect = (rect, origin) => {
		const [x, y] = localMap(origin)([rect.x, rect.y]);
		return {
			x: round(x),
			y: round(y),
			w: round(mmLen(rect.w)),
			h: round(mmLen(rect.h)),
			r: round(mmLen(rect.r))
		};
	};

	/** Groups a key's legend paths so that paths in one group never share bounding-box area. */
	const mergeLegend = (parts, origin) => {
		const groups = [];
		for (const part of parts) {
			const group = groups.find(
				(g) =>
					g.part === part.part &&
					g.stroke === part.stroke &&
					g.evenOdd === part.evenOdd &&
					g.boxes.every((b) => !boxesOverlap(b, part.box))
			);
			if (group) {
				group.boxes.push(part.box);
				group.subpaths.push(...part.subpaths);
			} else {
				groups.push({ ...part, boxes: [part.box], subpaths: [...part.subpaths] });
			}
		}
		return groups.map((g) => ({
			d: pathData(g.subpaths, localMap(origin)),
			part: g.part,
			...(g.stroke ? { stroke: round(mmLen(g.stroke)) } : {}),
			...(g.evenOdd ? { rule: 'evenodd' } : {})
		}));
	};

	const keyArt = {};
	const legendless = [];
	for (const key of keys) {
		const cap = keycapOf.get(key.id);
		const origin = [cap.cx, cap.cy];
		const legend = mergeLegend(legendParts.get(key.id), origin);
		const hasGlyph = key.legend?.glyph != null;
		if (hasGlyph !== legend.length > 0) {
			throw new Error(
				`${key.id}: controls.json says ${hasGlyph ? 'a legend' : 'no legend'}, the drawing has ${legend.length} legend paths`
			);
		}
		if ((key.led !== null) !== ledOf.has(key.id)) {
			throw new Error(`${key.id}: LED window in controls.json and in the drawing disagree`);
		}
		if (!legend.length) legendless.push(key.id);
		const led = ledOf.get(key.id);
		const [lx, ly] = led ? localMap(origin)([led.cx, led.cy]) : [0, 0];
		keyArt[key.id] = {
			offset: offsetOf(key.id, origin),
			legend,
			legendless: legend.length === 0,
			capRadius: round(mmLen(cap.r)),
			led: led ? { x: round(lx), y: round(ly), r: round(mmLen(led.r)) } : null,
			tile: localRect(tileOf.get(key.id).rect, origin)
		};
	}

	const encoderArt = {};
	for (const [id, rings] of encoderRings) {
		const origin = [rings.dish.cx, rings.dish.cy];
		encoderArt[id] = {
			offset: offsetOf(id, origin),
			legendless: true,
			dish: round(mmLen(rings.dish.r)),
			top: round(mmLen(rings.top.r)),
			cap: round(mmLen(rings.cap.r)),
			tile: localRect(tileOf.get(id).rect, origin)
		};
	}

	const volumeOrigin = [volumeRings.outer.cx, volumeRings.outer.cy];
	const [dimX, dimY] = localMap(volumeOrigin)([volumeRings.dimple.cx, volumeRings.dimple.cy]);
	const volumeArt = {
		offset: offsetOf('knob.volume', volumeOrigin),
		outer: round(mmLen(volumeRings.outer.r)),
		top: round(mmLen(volumeRings.top.r)),
		dimple: { x: round(dimX), y: round(dimY), r: round(mmLen(volumeRings.dimple.r)) },
		dimpleAngle: round((Math.atan2(dimX, -dimY) * 180) / Math.PI),
		tile: localRect(tileOf.get('knob.volume').rect, volumeOrigin)
	};

	const speakerOrigin = centreOf(speakerTile);
	const holePoints = holes
		.map((h) => localMap(speakerOrigin)([h.cx, h.cy]).map(round))
		.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
	const rowsOf = (pts) => {
		const rows = [];
		for (const pt of pts) {
			const row = rows.find((r) => Math.abs(r.y - pt[1]) < 0.3);
			if (row) row.n++;
			else rows.push({ y: pt[1], n: 1 });
		}
		return rows.map((r) => r.n);
	};
	const pitches = holePoints.flatMap((a, k) =>
		holePoints
			.filter((b, j) => j !== k)
			.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1]))
			.sort((x, y) => x - y)
			.slice(0, 1)
	);
	const grilleArt = {
		offset: offsetOf('speaker.internal', speakerOrigin),
		holeRadius: round(mmLen(mean(holes.map((h) => h.r)))),
		pitch: round(pitches.sort((a, b) => a - b)[Math.floor(pitches.length / 2)]),
		rows: rowsOf(holePoints),
		holes: holePoints,
		tile: localRect(tileOf.get('speaker.internal').rect, speakerOrigin)
	};

	const screenOrigin = centreOf(tileOf.get('screen.main').box);
	const screenArt = {
		offset: offsetOf('screen.main', screenOrigin),
		tile: localRect(tileOf.get('screen.main').rect, screenOrigin)
	};

	// Body-margin features are placed against the body edge, so they use the body transform.
	const bodyMap = (pt) => apply(bodyT, pt);
	const closedAgainst = (p, edge) => {
		// The switch tab and the pitch-bend pill are drawn open against the body edge: close them.
		const sp = p.subpaths[0];
		const d = pathData([{ ...sp, closed: true }], bodyMap);
		const [x0, y0] = bodyMap([p.box.x0, p.box.y0]);
		const [x1, y1] = bodyMap([p.box.x1, p.box.y1]);
		return { d, edge, box: { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) } };
	};
	const tickBox = features.tick.box;
	const [tx0, ty0] = bodyMap([tickBox.x0, tickBox.y0]);
	const [tx1, ty1] = bodyMap([tickBox.x1, tickBox.y1]);
	const meterBox = features.meter.box;
	const [mx, my0] = bodyMap([meterBox.x0, meterBox.y0]);
	const [, my1] = bodyMap([meterBox.x1, meterBox.y1]);
	const [micX, micY] = bodyMap([micCircle.cx, micCircle.cy]);
	const panelArt = {
		body: {
			w: round(bodyRect.w * bodyT.ax),
			h: round(bodyRect.h * bodyT.ay),
			r: round(bodyRect.r * bodyT.ax)
		},
		mic: { x: round(micX), y: round(micY), r: round(micCircle.r * bodyT.ax) },
		meter: { x: round(mx), y1: round(my0), y2: round(my1) },
		tick: { x: round(tx0), y: round(ty0), w: round(tx1 - tx0), h: round(ty1 - ty0) },
		powerSwitch: closedAgainst(features.powerSwitch, 'right'),
		pitchBend: closedAgainst(features.pitchBend, 'bottom')
	};

	// Line-art extras (a TE-guide style theme): junction marks and grid frame, panel mm (fit).
	const fitMap = (pt) => apply(fitT, pt);
	const texture = unique.filter((p) =>
		['junction', 'frame'].includes(records.get(p.index)?.category)
	);
	const guideArt = {
		junctions: pathData(
			texture
				.filter((p) => records.get(p.index).category === 'junction')
				.flatMap((p) => p.subpaths),
			fitMap
		),
		frame: pathData(
			texture.filter((p) => records.get(p.index).category === 'frame').flatMap((p) => p.subpaths),
			fitMap
		)
	};

	// 11. coverage
	const counts = {};
	for (const r of records.values()) counts[r.category] = (counts[r.category] ?? 0) + 1;
	const stripped = unique
		.filter((p) => records.get(p.index)?.category === 'logo')
		.map((p) => {
			const [x0, y0] = bodyMap([p.box.x0, p.box.y0]);
			const [x1, y1] = bodyMap([p.box.x1, p.box.y1]);
			return {
				index: p.index,
				reason: records.get(p.index).note,
				box: { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) }
			};
		});
	const artifacts = unique
		.filter((p) => records.get(p.index)?.category === 'artifact')
		.map((p) => ({ index: p.index, reason: records.get(p.index).note }));

	const leds = [...ledOf.values()].map((l) => {
		const key = keys.find((k) => ledOf.get(k.id) === l);
		const cap = keycapOf.get(key.id);
		return [fitT.ax * (l.cx - cap.cx), fitT.ay * (l.cy - cap.cy)];
	});
	const source = {
		file: SOURCE,
		asset: SOURCE_ASSET,
		sha256: createHash('sha256').update(svgText).digest('hex'),
		viewBox: drawing.viewBox,
		paths: drawing.paths.length,
		duplicates: duplicates.length,
		subpaths: unique.reduce((n, p) => n + p.subpaths.length, 0),
		transform: {
			x: [round6(fitT.ax), round6(fitT.bx)],
			y: [round6(fitT.ay), round6(fitT.by)],
			basis: `least squares over ${fit.pairs} control centres in controls.json`
		},
		bodyTransform: {
			x: [round6(bodyT.ax), round6(bodyT.bx)],
			y: [round6(bodyT.ay), round6(bodyT.by)],
			basis: 'body outline = 285 × 102 mm'
		},
		residual: {
			rms: round(fit.rms),
			max: round(fit.max),
			maxId: fit.maxId,
			bodyRms: round(bodyFit.rms),
			bodyOffset: [round(bodyFit.meanDx), round(bodyFit.meanDy)]
		},
		measured: {
			keycapDiameter: round(mmLen(2 * mean([...keycapOf.values()].map((c) => c.r)))),
			ledDiameter: round(mmLen(2 * mean([...ledOf.values()].map((l) => l.r)))),
			ledOffset: [round(mean(leds.map((l) => l[0]))), round(mean(leds.map((l) => l[1])))],
			tileCornerRadius: round(mmLen(mean([...tileOf.values()].map((t) => t.rect.r)))),
			bodyCornerRadius: panelArt.body.r,
			grilleHoles: holes.length
		},
		coverage: {
			assigned: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
			legendKeys: keys.length - legendless.length,
			legendless: [...legendless, ...encoders.map((e) => e.id)],
			stripped,
			artifacts,
			unassigned
		}
	};

	const report = formatReport({
		drawing,
		unique,
		duplicates,
		counts,
		fit,
		fitT,
		bodyFit,
		bodyT,
		source,
		keyArt,
		legendParts,
		stripped,
		artifacts,
		unassigned
	});

	const code = moduleSource({
		source,
		keyArt,
		encoderArt,
		volumeArt,
		grilleArt,
		screenArt,
		panelArt,
		guideArt
	});
	return { code, report, source };
}

function round6(n) {
	return Number(n.toFixed(6));
}

// ─────────────────────────────────────────────────────────────────────────── output

function moduleSource(art) {
	const json = (value) => JSON.stringify(value);
	return `// GENERATED by scripts/build-replica-art.mjs from Teenage Engineering's OP-XY guide drawing
// (asset ${SOURCE_ASSET}, decision D9) and knowledge/opxy/controls.json. Do not edit by hand:
// re-run \`node scripts/build-replica-art.mjs\`. The "OP" / "XY" wordmarks are left out (decision D6).
//
// Units are millimetres, y pointing toward the player. Control art is local to the control's
// actuator centre (keycap, encoder or knob centre; the tile centre for the speaker and screen).
import type { EncoderId, KeyId } from '$lib/core/opxy';
import type {
	ArtSource,
	EncoderArt,
	GrilleArt,
	GuideArt,
	KeyArt,
	PanelArt,
	ScreenArt,
	VolumeArt
} from './art.types';

/** Where the art comes from, the fitted transform and its residual, and the coverage report. */
export const ART_SOURCE: ArtSource = ${json(art.source)};

/** Legend, LED window, keycap and tile of every key, keycap-local. */
export const KEY_ART: Readonly<Record<KeyId, KeyArt>> = ${json(art.keyArt)};

/** Dish, knob-top and cap radii of the four encoders, encoder-local. */
export const ENCODER_ART: Readonly<Record<EncoderId, EncoderArt>> = ${json(art.encoderArt)};

/** The volume pot: knob radii and the pointer dimple as drawn, knob-local. */
export const VOLUME_ART: VolumeArt = ${json(art.volumeArt)};

/** Speaker grille holes, local to the speaker tile centre. */
export const GRILLE_ART: GrilleArt = ${json(art.grilleArt)};

/** The screen tile, local to its centre. */
export const SCREEN_ART: ScreenArt = ${json(art.screenArt)};

/** Body-margin features in panel millimetres. */
export const PANEL_ART: PanelArt = ${json(art.panelArt)};

/** Tile-junction marks and the grid frame, for a line-art (guide) theme; panel millimetres. */
export const GUIDE_ART: GuideArt = ${json(art.guideArt)};
`;
}

function formatReport(r) {
	const lines = [];
	const n = (x, w = 3) => String(x).padStart(w);
	const legendPaths = [...r.legendParts.values()].reduce((s, parts) => s + parts.length, 0);
	const tilePrints = [...r.legendParts.entries()]
		.filter(([, parts]) => parts.some((p) => p.part === 'tile'))
		.map(([id]) => id);
	lines.push(
		`TE layout drawing ${SOURCE_ASSET}: ${r.drawing.paths.length} paths, ${r.duplicates.length} exact duplicates dropped → ${r.unique.length} unique`
	);
	lines.push('');
	lines.push('transform (drawing units → controls.json millimetres)');
	lines.push(
		`  least squares over ${r.fit.pairs} control centres: x = ${r.fitT.ax.toFixed(6)}·u ${sign(r.fitT.bx)}, y = ${r.fitT.ay.toFixed(6)}·v ${sign(r.fitT.by)}`
	);
	lines.push(
		`  residual: rms ${r.fit.rms.toFixed(3)} mm, max ${r.fit.max.toFixed(3)} mm (${r.fit.maxId})`
	);
	lines.push(
		`  body outline alone (285 × 102 mm): x = ${r.bodyT.ax.toFixed(6)}·u ${sign(r.bodyT.bx)}; controls.json sits ${fmtPair(r.bodyFit.meanDx, r.bodyFit.meanDy)} mm from the drawing (rms ${r.bodyFit.rms.toFixed(3)} mm)`
	);
	lines.push('');
	lines.push('assigned paths');
	const order = [
		['body', 'body outline'],
		['tile', 'tile outlines (keys, encoders, volume, screen, speaker)'],
		['keycap', 'keycaps'],
		['led', 'LED windows'],
		['dish', 'encoder dishes'],
		['top', 'encoder knob tops'],
		['cap', 'encoder caps'],
		['volume-outer', 'volume knob'],
		['volume-top', 'volume knob top'],
		['volume-dimple', 'volume pointer dimple'],
		['grille-hole', 'speaker grille holes'],
		['mic', 'mic hole'],
		['meter', 'level meter'],
		['tick', 'front tick'],
		['switch', 'power switch tab'],
		['pitchbend', 'pitch-bend pill'],
		[
			'legend',
			`legend paths → ${legendPaths} legend parts on ${r.source.coverage.legendKeys} keys`
		],
		['junction', 'tile-junction marks (texture; line-art theme only)'],
		['frame', 'grid frame (texture; line-art theme only)'],
		['artifact', 'drawing artefacts (dropped)'],
		['logo', 'wordmark paths (stripped, D6)']
	];
	for (const [key, label] of order) {
		if (r.counts[key]) lines.push(`  ${n(r.counts[key])}  ${label}`);
	}
	const known = new Set(order.map(([k]) => k));
	for (const [key, count] of Object.entries(r.counts)) {
		if (!known.has(key)) lines.push(`  ${n(count)}  ${key}`);
	}
	lines.push(`  tile prints (legend on the tile, not the cap): ${tilePrints.join(', ') || 'none'}`);
	lines.push(
		`  legend-less keys: ${r.source.coverage.legendless.filter((id) => !id.startsWith('encoder')).length} (step keys); encoders: 4`
	);
	lines.push('');
	lines.push(`stripped (D6): ${r.stripped.length}`);
	for (const s of r.stripped) {
		lines.push(`  #${s.index} at ${s.box.x}, ${s.box.y} mm (${s.box.w} × ${s.box.h}): ${s.reason}`);
	}
	lines.push(`artefacts dropped: ${r.artifacts.length}`);
	for (const a of r.artifacts) lines.push(`  #${a.index}: ${a.reason}`);
	lines.push(`unassigned: ${r.unassigned.length}`);
	for (const u of r.unassigned) lines.push(`  #${u.index}: ${u.reason}`);
	lines.push('');
	lines.push(
		`measured: keycap Ø ${r.source.measured.keycapDiameter} mm, LED Ø ${r.source.measured.ledDiameter} mm at ${fmtPair(...r.source.measured.ledOffset)} mm, tile corner r ${r.source.measured.tileCornerRadius} mm, body corner r ${r.source.measured.bodyCornerRadius} mm, ${r.source.measured.grilleHoles} grille holes`
	);
	return lines.join('\n');
}

const sign = (b) => (b < 0 ? `− ${Math.abs(b).toFixed(4)}` : `+ ${b.toFixed(4)}`);
const fmtPair = (x, y) =>
	`(${x >= 0 ? '+' : ''}${x.toFixed(3)}, ${y >= 0 ? '+' : ''}${y.toFixed(3)})`;

async function format(code, file) {
	const prettier = await import('prettier');
	const options = (await prettier.resolveConfig(file)) ?? {};
	return prettier.format(code, { ...options, filepath: file });
}

// ─────────────────────────────────────────────────────────────────────────── CLI

async function main() {
	const args = new Set(process.argv.slice(2));
	const sourcePath = path.join(ROOT, SOURCE);
	if (!existsSync(sourcePath)) {
		console.error(
			`missing ${SOURCE}\nIt is a git-ignored research input: run scripts/fetch-research.sh first.`
		);
		process.exit(2);
	}
	const svgText = readFileSync(sourcePath, 'utf8');
	const controlsFile = JSON.parse(readFileSync(path.join(ROOT, CONTROLS), 'utf8'));
	const { code, report } = buildArt(svgText, controlsFile);
	const outPath = path.join(ROOT, OUTPUT);
	const formatted = await format(code, outPath);
	const previous = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null;
	if (!args.has('--quiet')) console.log(report + '\n');
	if (args.has('--check')) {
		if (previous !== formatted) {
			console.error(`${OUTPUT} is stale: run node scripts/build-replica-art.mjs`);
			process.exit(1);
		}
		console.log(`${OUTPUT} is up to date`);
		return;
	}
	if (previous === formatted) {
		console.log(`${OUTPUT} unchanged (${(formatted.length / 1024).toFixed(1)} KiB)`);
	} else {
		writeFileSync(outPath, formatted);
		console.log(`wrote ${OUTPUT} (${(formatted.length / 1024).toFixed(1)} KiB)`);
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	});
}
