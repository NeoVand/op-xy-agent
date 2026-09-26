#!/usr/bin/env node
/**
 * ingest-guide.mjs — reproducible scrape of the official OP–XY documentation.
 *
 * Fetches the online OP–XY guide (index + every chapter discovered from its navigation, cross-checked
 * against the site map), the downloads page (full OS changelog), the product/store pages (specs), the
 * field kit and sound-pack pages, the press images and the printable-guide PDF, then converts
 * everything into clean Markdown + JSON under knowledge/official/ (git-ignored; verbatim TE content).
 *
 * How the site works (as of 2026-09): teenage.engineering is a React Router app. Each page embeds its
 * data as a "turbo-stream" payload (window.__reactRouterContext.streamController.enqueue("…")). The
 * page body is a layout tree from TE's CMS ("te013"): nodes {t, a, c} with t ∈ box|txt|svg|cond|…;
 * txt nodes hold rich text items {it: sp|tx|br|ul|ol|li, cls, lnk, c}. We decode that tree and walk it
 * in DOM order, porting the renderer's own rules (top-level spans are display:block; consecutive
 * same-style spans are merged with <br>; `cond` blocks marked mobile-only are skipped).
 *
 * Usage:
 *   node scripts/ingest-guide.mjs                 # fetch pages fresh, reuse downloaded images/PDFs
 *   node scripts/ingest-guide.mjs --offline       # rebuild Markdown from cached raw files only
 *   node scripts/ingest-guide.mjs --no-assets     # skip SVG/press-image/PDF downloads
 *   node scripts/ingest-guide.mjs --delay=1500    # politeness delay between page requests (ms)
 *   node scripts/ingest-guide.mjs --asset-delay=300  # delay between CDN asset downloads (ms)
 *
 * Outputs: knowledge/official/{guide/NN-slug.md, images/ (+ manifest.json, layout-hotspots.json),
 * changelog.md|json, specs.md, fieldkit.md, sound-packs.md, chunks.jsonl, index.json} and the raw
 * cache in research/web/te/ (HTML, decoded JSON, sitemap, PDFs). See docs/research/40-official-docs.md.
 *
 * Node >= 20, no dependencies. Never talks to the OP–XY; network access is limited to
 * teenage.engineering and assets.teenage.engineering (robots.txt disallows /support, so we skip it).
 */

import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ────────────────────────────────────────────────────────────────────────────── config

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'research/web/te');
const OUT_DIR = path.join(ROOT, 'knowledge/official');
const GUIDE_OUT = path.join(OUT_DIR, 'guide');
const IMG_OUT = path.join(OUT_DIR, 'images');
const SITE = 'https://teenage.engineering';
const ASSETS = 'https://assets.teenage.engineering/_img/';
const GUIDE_PATH = 'guides/op-xy';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, dflt) => {
	const hit = argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split('=').slice(1).join('=') : dflt;
};
const OFFLINE = flag('offline');
const NO_ASSETS = flag('no-assets');
const DELAY_MS = Number(opt('delay', '1000'));
const ASSET_DELAY_MS = Number(opt('asset-delay', '150'));
const GENERATED_AT = new Date().toISOString();
// With --offline nothing is fetched: report when the cached raw index page was actually downloaded.
const RAW_INDEX = path.join(RAW_DIR, 'guide-index.html');
const FETCHED_AT =
	OFFLINE && existsSync(RAW_INDEX) ? statSync(RAW_INDEX).mtime.toISOString() : GENERATED_AT;

// TE's 12-column layout grid (desktop): page 980px, 45px margins, 10px gutters, 10px baseline.
const GRID = { cols: 12, pageW: 980, margin: 45, gutter: 10, bh: 10 };
GRID.colW = (GRID.pageW - GRID.margin * 2 - GRID.gutter * (GRID.cols - 1)) / GRID.cols; // 65px

const warnings = [];
const warn = (msg) => {
	if (warnings.includes(msg)) return;
	warnings.push(msg);
	console.warn(`  ! ${msg}`);
};

// ────────────────────────────────────────────────────────────────────────────── fetching

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;

async function politeFetch(url, { delay = DELAY_MS, binary = false } = {}) {
	const wait = lastRequest + delay - Date.now();
	if (wait > 0) await sleep(wait);
	let lastErr;
	for (let attempt = 1; attempt <= 3; attempt++) {
		lastRequest = Date.now();
		try {
			const res = await fetch(url, {
				headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
				redirect: 'follow'
			});
			if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
			return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
		} catch (err) {
			lastErr = err;
			if (/HTTP 404/.test(String(err))) break;
			await sleep(1000 * attempt * attempt);
		}
	}
	throw lastErr;
}

/** Fetch a site page (or read it from the raw cache with --offline) and keep a raw copy. */
async function getPageHtml(sitePath, rawFile) {
	const file = path.join(RAW_DIR, rawFile);
	if (OFFLINE) {
		if (!existsSync(file)) throw new Error(`--offline but ${file} is missing`);
		return fs.readFile(file, 'utf8');
	}
	const url = `${SITE}/${sitePath}`;
	console.log(`  fetch ${url}`);
	const html = await politeFetch(url);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, html);
	return html;
}

async function downloadAsset(url, file, { force = false } = {}) {
	if (!force && existsSync(file) && statSync(file).size > 0) return 'cached';
	if (NO_ASSETS || OFFLINE) return 'skipped';
	const buf = await politeFetch(url, { delay: ASSET_DELAY_MS, binary: true });
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, buf);
	return 'downloaded';
}

// ────────────────────────────────────────────────────────────────────────────── turbo-stream decode

/** Decode React Router's turbo-stream payload embedded in the HTML into plain JSON. */
function decodeTurboStream(html) {
	const re = /window\.__reactRouterContext\.streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/g;
	const chunks = [];
	for (const m of html.matchAll(re)) chunks.push(JSON.parse(m[1]));
	if (!chunks.length) throw new Error('no turbo-stream payload found in page');
	const lines = chunks.join('').split('\n').filter(Boolean);
	const values = JSON.parse(lines[0]);
	const hydrated = new Map();
	const SPECIAL = {
		'-1': undefined,
		'-2': NaN,
		'-3': -Infinity,
		'-4': -0,
		'-5': null,
		'-6': Infinity,
		'-7': undefined
	};
	const hydrate = (i) => {
		if (i < 0) return SPECIAL[String(i)];
		if (hydrated.has(i)) return hydrated.get(i);
		const v = values[i];
		if (!v || typeof v !== 'object') return (hydrated.set(i, v), v);
		if (Array.isArray(v)) {
			if (typeof v[0] === 'string') {
				const [type, b] = v;
				switch (type) {
					case 'D':
						return new Date(b).toISOString();
					case 'U':
						return b;
					case 'Z':
						return hydrate(b);
					case 'P':
						return { __promise: b };
					case 'N': {
						const o = {};
						hydrated.set(i, o);
						for (const k of Object.keys(b)) o[k] = hydrate(b[k]);
						return o;
					}
					case 'S': {
						const a = [];
						hydrated.set(i, a);
						for (let j = 1; j < v.length; j++) a.push(hydrate(v[j]));
						return a;
					}
					case 'M': {
						const o = {};
						hydrated.set(i, o);
						for (let j = 1; j < v.length; j += 2) o[hydrate(v[j])] = hydrate(v[j + 1]);
						return o;
					}
					default:
						return { __type: type, value: v };
				}
			}
			const a = [];
			hydrated.set(i, a);
			v.forEach((n, j) => {
				if (n !== -1) a[j] = hydrate(n);
			});
			return a;
		}
		const o = {};
		hydrated.set(i, o);
		for (const k of Object.keys(v)) o[values[Number(k.slice(1))]] = hydrate(v[k]);
		return o;
	};
	return hydrate(0);
}

/** Return the te013 page object ({title, content, path}) from decoded loader data. */
function te013Page(decoded) {
	const ld = decoded.loaderData || {};
	const key = Object.keys(ld).find((k) => ld[k] && typeof ld[k] === 'object' && 'content' in ld[k]);
	if (!key) throw new Error('no te013 content route in loader data');
	return ld[key];
}

async function loadPage(sitePath, rawBase) {
	const html = await getPageHtml(sitePath, `${rawBase}.html`);
	const decoded = decodeTurboStream(html);
	await fs.writeFile(path.join(RAW_DIR, `${rawBase}.json`), JSON.stringify(decoded, null, 1));
	return decoded;
}

// ────────────────────────────────────────────────────────────────────────────── te013 helpers

const tokens = (cls) =>
	new Set(
		String(cls || '')
			.split(/\s+/)
			.filter(Boolean)
	);
const isMobileOnlyCond = (a = {}) => a.dc === true && a.dcd !== true && a.dcm === true;
const isOtherLangCond = (a = {}) =>
	a.lc === true && typeof a.lcc === 'string' && a.lcc.toLowerCase() !== 'en';
// Box ids double as URL anchors. Skip grid-cell ids ("1", "2"…), layout ids and TE's placeholder "anchor".
const isAnchorId = (id) =>
	typeof id === 'string' &&
	id.trim() !== '' &&
	!/^\d+$/.test(id) &&
	!['top-row', 'left-column', 'right-column', 'anchor'].includes(id.trim());
const assetUrl = (img, suffix) => `${ASSETS}${img.current}_${suffix}`;

function linkUrl(lnk) {
	if (!lnk || typeof lnk !== 'object') return null;
	const hash = lnk.d && typeof lnk.d === 'object' && lnk.d.hash ? `#${encodeURI(lnk.d.hash)}` : '';
	if (lnk.t === 'path') return `${SITE}/${String(lnk.v).replace(/^\/+/, '')}${hash}`;
	if (lnk.t === 'ext') return (String(lnk.v).startsWith('/') ? SITE + lnk.v : String(lnk.v)) + hash;
	if (lnk.t === 'img') {
		try {
			const v = JSON.parse(lnk.v);
			const suffix = v.current_data?.original?.suffix;
			return suffix ? `${ASSETS}${v.current}_${suffix}` : null;
		} catch {
			return null;
		}
	}
	return null; // prod / modal / content links: shop UI, not documentation
}

/** Port of the site's rich-text normalisation (te013 `Ar`/`Tr`): merge consecutive same-style spans. */
function normalizeRich(items, top = false) {
	const styleKey = (e) =>
		e.it !== 'sp' || typeof e.id === 'string'
			? null
			: JSON.stringify({
					cls: e.cls ?? '',
					stl: e.stl?.trim() ?? '',
					lnk: e.lnk ?? null,
					act: e.act ?? null
				});
	const ownContent = (e) => {
		const out = [];
		if (e.tx !== undefined) out.push({ it: 'tx', tx: e.tx });
		if (Array.isArray(e.c)) out.push(...e.c);
		return out;
	};
	const list = (items || [])
		.filter((e) => e != null)
		.map((e) => (Array.isArray(e.c) ? { ...e, c: normalizeRich(e.c) } : { ...e }));
	const out = [];
	let cur = null;
	let curKey = null;
	let pending = [];
	const flush = () => {
		if (cur) out.push(cur, ...pending);
		cur = null;
		curKey = null;
		pending = [];
	};
	for (const e of list) {
		const key = styleKey(e);
		const loose = e.it === 'tx' || e.it === 'br';
		if (cur) {
			if (loose) {
				pending.push(e);
				continue;
			}
			if (key && key === curKey) {
				const merged = [...(cur.c ?? []), ...pending];
				if (top && merged.length > 0 && merged[merged.length - 1]?.it !== 'br')
					merged.push({ it: 'br' });
				cur.c = [...merged, ...ownContent(e)];
				pending = [];
				continue;
			}
			flush();
		}
		if (key) {
			cur = { ...e, c: ownContent(e) };
			delete cur.tx;
			curKey = key;
			continue;
		}
		out.push(e);
	}
	flush();
	return out;
}

const NAV_TEXT = /^(back to index|next chapter|previous chapter)$/i;
/**
 * Stray keystrokes left in TE's CMS: a top-level span with no style/class holding one character
 * (e.g. "§" in 2. layout, "z" after a sentence in 11. tempo). Logged, then dropped.
 */
const isArtifact = (it) =>
	it.it === 'sp' && !it.stl && !it.cls && !it.lnk && plainText([it]).trim().length === 1;
const plainText = (items) =>
	(items || [])
		.map((it) => (it.it === 'tx' ? it.tx : it.it === 'br' ? '\n' : plainText(it.c)))
		.join('');
const isNavItem = (it) => {
	const t = plainText([it]).replace(/\s+/g, ' ').trim();
	if (!t) return false;
	const hasLink = (x) => !!x.lnk || (x.c || []).some(hasLink);
	return NAV_TEXT.test(t) && hasLink(it);
};
const cleanSpaces = (s) => s.replace(/\u00a0/g, ' ').replace(/[ \t]{2,}/g, ' ');

/**
 * Render inline rich items to a Markdown string; '\n' marks <br>. `depth` counts span nesting:
 * nested "wl"/"light" spans are TE's highlighted labels (e.g. "note:") and become **bold**.
 */
function inlineMd(items, ctx, inLink = false, depth = 0) {
	let s = '';
	for (const it of items || []) {
		if (it.it === 'tx') s += typeof it.tx === 'string' ? it.tx : String(it.tx ?? '');
		else if (it.it === 'br') s += '\n';
		else if (it.it === 'ul' || it.it === 'ol') {
			// inline lists (rare): flatten
			s +=
				(it.c || [])
					.map((li, i) => `\n${it.it === 'ol' ? `${i + 1}.` : '-'} ${liMd(li, ctx, inLink)}`)
					.join('') + '\n';
		} else {
			let inner = inlineMd(
				it.c ?? (it.tx !== undefined ? [{ it: 'tx', tx: it.tx }] : []),
				ctx,
				inLink || !!it.lnk,
				depth + 1
			);
			const url = !inLink && it.lnk ? linkUrl(it.lnk) : null;
			const cls = tokens(it.cls);
			if (depth >= 1 && (cls.has('wl') || cls.has('light')) && inner.trim() && !inLink) {
				const m = inner.match(/^(\s*)(.*?)(\s*)$/s);
				inner = `${m[1]}**${m[2]}**${m[3]}`;
			}
			if (url && inner.trim()) {
				const m = inner.match(/^(\s*)(.*?)(\s*)$/s);
				s += `${m[1]}[${m[2].replace(/\n+/g, ' ')}](${url})${m[3]}`;
			} else s += inner;
		}
	}
	return s;
}

/** A list item; the <li> itself may carry the link (changelog "underlined items"). */
function liMd(li, ctx, inLink = false) {
	const text = cleanSpaces(inlineMd(li.c, ctx, inLink || !!li.lnk, 1))
		.replace(/\s*\n\s*/g, ' ')
		.trim();
	const url = !inLink && li.lnk ? linkUrl(li.lnk) : null;
	return url && text ? `[${text}](${url})` : text;
}

/** Split a txt node into typed lines. Each top-level item is a CSS block (display:block). */
function txtLines(node, ctx) {
	const items = normalizeRich(node.a?.c, true);
	const lines = []; // {kind: 'text'|'ul'|'ol'|'heading', text, level?}
	for (const it of items) {
		if (isNavItem(it)) continue;
		if (isArtifact(it)) {
			warn(`${ctx.docId}: dropped stray "${plainText([it]).trim()}" artifact`);
			continue;
		}
		const cls = tokens(it.cls);
		if (it.it === 'ul' || it.it === 'ol') {
			for (const li of it.c || []) lines.push({ kind: it.it, text: liMd(li, ctx) });
			continue;
		}
		const hasList = (it.c || []).some((c) => c.it === 'ul' || c.it === 'ol');
		if (hasList) {
			let buf = [];
			const flushBuf = () => {
				if (buf.length) {
					for (const part of cleanSpaces(inlineMd(buf, ctx, false, 1)).split('\n'))
						lines.push({ kind: 'text', text: part.trim() });
					buf = [];
				}
			};
			for (const c of it.c) {
				if (c.it === 'ul' || c.it === 'ol') {
					flushBuf();
					for (const li of c.c || []) lines.push({ kind: c.it, text: liMd(li, ctx) });
				} else buf.push(c);
			}
			flushBuf();
			continue;
		}
		const md = cleanSpaces(inlineMd([it], ctx, false, 0));
		const isHeading = cls.has('xl') || (cls.has('l') && !cls.has('m') && !cls.has('s'));
		if (isHeading) {
			const text = md
				.replace(/\s*\n\s*/g, ' ')
				.replace(/\s+/g, ' ')
				.trim();
			if (text) lines.push({ kind: 'heading', level: cls.has('xl') ? 2 : 3, text });
			else lines.push({ kind: 'text', text: '' });
			continue;
		}
		// A block's trailing <br> has no visual effect; interior <br>s are line breaks.
		const parts = md.replace(/\n$/, '').split('\n');
		for (const part of parts) lines.push({ kind: 'text', text: part.trim() });
	}
	return lines;
}

/** Turn typed lines into blocks: paragraphs (hard line breaks), lists, headings. */
function linesToBlocks(lines) {
	const blocks = [];
	let para = [];
	let list = null;
	const flushPara = () => {
		if (para.length) blocks.push({ t: 'p', text: para.join('  \n') });
		para = [];
	};
	const flushList = () => {
		if (list) blocks.push(list);
		list = null;
	};
	for (const l of lines) {
		if (l.kind === 'heading') {
			flushPara();
			flushList();
			blocks.push({ t: 'h', level: l.level, text: l.text });
		} else if (l.kind === 'ul' || l.kind === 'ol') {
			flushPara();
			if (!list || list.ordered !== (l.kind === 'ol')) {
				flushList();
				list = { t: 'list', ordered: l.kind === 'ol', items: [] };
			}
			if (l.text) list.items.push(l.text);
		} else if (l.text === '') {
			flushPara();
			flushList();
		} else {
			flushList();
			para.push(l.text);
		}
	}
	flushPara();
	flushList();
	return blocks;
}

// ────────────────────────────────────────────────────────────────────────────── tables & TOC

const contentNodes = (n) => {
	const out = [];
	const g = (m) => {
		if (!m || typeof m !== 'object') return;
		if (Array.isArray(m)) return m.forEach(g);
		if (m.t === 'cond' && isMobileOnlyCond(m.a)) return;
		if (m.t === 'txt' || m.t === 'svg') out.push(m);
		if (m.c) g(m.c);
	};
	g(n.c);
	return out;
};
const isCell = (b) =>
	b.t === 'box' &&
	contentNodes(b).length <= 2 &&
	!(b.c || []).some((x) => x.t === 'box' && (x.c || []).filter((y) => y.t === 'box').length >= 2);
/** A bordered grid row: ≥2 child cells, each holding at most one txt/svg (TE draws tables this way). */
const isTableRow = (b) =>
	b.t === 'box' &&
	!!b.a?.ln &&
	(b.c || []).length >= 2 &&
	(b.c || []).every(isCell) &&
	(b.c || []).filter((x) => contentNodes(x).length).length >= 2;

function tableRun(kids, start) {
	const run = [];
	for (let i = start; i < kids.length; i++) {
		if (!isTableRow(kids[i])) break;
		if (run.length && run[0].c.length !== kids[i].c.length) break;
		run.push(kids[i]);
	}
	return run;
}

function renderTable(rows, ctx) {
	const cellText = (cell, rowText) => {
		const parts = [];
		for (const n of contentNodes(cell)) {
			if (n.t === 'txt') {
				const text = txtLines(n, ctx)
					.map((l) => l.text)
					.filter(Boolean)
					.join('<br>');
				if (text) parts.push(text);
			} else if (n.t === 'svg') {
				const ref = registerImage(n, ctx, { tableRow: rowText });
				if (ref) parts.push(`![${ref.alt}](${ref.rel})`);
			}
		}
		return parts.join(' ').replace(/\|/g, '\\|');
	};
	const matrix = rows.map((row) => {
		const texts = (row.c || []).map((cell) =>
			contentNodes(cell)
				.filter((n) => n.t === 'txt')
				.map((n) => plainText(n.a?.c).replace(/\s+/g, ' ').trim())
				.join(' ')
		);
		const rowText = texts.find(Boolean) || '';
		return (row.c || []).map((cell) => cellText(cell, rowText));
	});
	return { t: 'table', rows: matrix, header: !!rows[0].a?.bc || true };
}

/** Index page: the TOC is a column of section numbers next to a column of links. Zip them. */
function tryToc(node, ctx) {
	const kids = (node.c || []).filter((k) => k.t === 'box' && contentNodes(k).length);
	if (kids.length !== 2) return null;
	const [numsNode, linksNode] = kids.map((k) => contentNodes(k));
	if (
		numsNode.length !== 1 ||
		linksNode.length !== 1 ||
		numsNode[0].t !== 'txt' ||
		linksNode[0].t !== 'txt'
	)
		return null;
	const nums = txtLines(numsNode[0], ctx).map((l) => l.text);
	if (!nums.some(Boolean) || !nums.every((t) => t === '' || /^\d+(\.\d+)*\.?$/.test(t)))
		return null;
	const links = txtLines(linksNode[0], ctx).map((l) => l.text);
	const nNums = nums.filter(Boolean).length;
	const nLinks = links.filter(Boolean).length;
	if (nNums !== nLinks)
		warn(
			`TOC column mismatch: ${nNums} numbers vs ${nLinks} links — zipping non-empty entries in order`
		);
	const a = nums.filter(Boolean);
	const b = links.filter(Boolean);
	const items = [];
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const num = (a[i] ?? '').replace(/\.$/, '');
		const depth = num.includes('.') ? 1 : 0;
		items.push(`${'  '.repeat(depth)}- ${num ? num + ' ' : ''}${b[i] ?? ''}`.trimEnd());
	}
	return [{ t: 'raw', text: items.join('\n') }];
}

// ────────────────────────────────────────────────────────────────────────────── images

/** Global image registry: one entry per unique asset (TE `current` id), with every use recorded. */
const imageRegistry = new Map();

function registerImage(node, ctx, extra = {}) {
	const a = node.a || {};
	const img = a.img;
	if (!img?.current_data) return null;
	const kind = img.kind;
	let suffix;
	if (kind === 'svg')
		suffix = img.current_data.original?.suffix || img.current_data.svg_opt?.suffix;
	else {
		// raster: prefer the original, else the largest width variant
		const variants = Object.entries(img.current_data).filter(([k]) => /^w\d+$/.test(k));
		variants.sort((x, y) => Number(y[0].slice(1)) - Number(x[0].slice(1)));
		suffix = img.current_data.original?.suffix || variants[0]?.[1]?.suffix;
	}
	if (!suffix) return null;
	const file = `${img.current}_${suffix}`;
	let entry = imageRegistry.get(img.current);
	if (!entry) {
		entry = {
			file,
			url: assetUrl(img, suffix),
			asset_id: img._id,
			current: img.current,
			kind,
			width: Number(img.current_data.original?.width) || null,
			height: Number(img.current_data.original?.height) || null,
			variants: Object.fromEntries(
				Object.entries(img.current_data).map(([k, v]) => [k, assetUrl(img, v.suffix)])
			),
			uses: []
		};
		imageRegistry.set(img.current, entry);
	}
	const use = {
		doc: ctx.docId,
		source_url: ctx.pageUrl,
		mobile_only: !!ctx.mobileOnly,
		role: extra.role || (extra.tableRow !== undefined ? 'table-icon' : 'diagram'),
		table_row: extra.tableRow,
		colors: { fill: a.fc ?? null, stroke: a.sc ?? null, mono: a.mc ?? null },
		transform:
			a.tt || a.ts || a.tr
				? { translate_pct: a.tt ?? null, scale: a.ts ?? null, rotate: a.tr ?? null }
				: undefined
	};
	entry.uses.push(use);
	const rel = `../images/${file}`;
	return { entry, use, rel, alt: extra.tableRow || 'diagram' };
}

// ────────────────────────────────────────────────────────────────────────────── page → blocks

function walk(node, ctx) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) return node.forEach((n) => walk(n, ctx));
	const a = node.a || {};
	switch (node.t) {
		case 'page':
			walk(node.c, ctx);
			break;
		case 'cond':
			if (isOtherLangCond(a)) return;
			if (isMobileOnlyCond(a)) {
				// Not rendered (desktop text is canonical) but its images are still part of the guide.
				collectImagesOnly(node.c, { ...ctx, mobileOnly: true });
				return;
			}
			walk(node.c, ctx);
			break;
		case 'box': {
			if (isCalloutBadge(node)) return; // numbered dots drawn over a diagram → layout-hotspots.json
			if (isAnchorId(a.id)) ctx.blocks.push({ t: 'anchor', id: a.id.trim() });
			if (a.bi?.img?.current_data)
				registerImage({ a: { img: a.bi.img } }, ctx, { role: 'background' });
			const toc = tryToc(node, ctx);
			if (toc) {
				ctx.blocks.push(...toc);
				return;
			}
			const kids = node.c || [];
			for (let i = 0; i < kids.length;) {
				const run = tableRun(kids, i);
				if (run.length >= 2) {
					ctx.blocks.push(renderTable(run, ctx));
					i += run.length;
					continue;
				}
				walk(kids[i], ctx);
				i++;
			}
			// A whole box can be a download link (e.g. the printable guide PDF on the index page).
			if (a.lnk?.t === 'img') {
				const url = linkUrl(a.lnk);
				let name = 'download';
				try {
					name = JSON.parse(a.lnk.v).name || name;
				} catch {
					/* keep default */
				}
				if (url) ctx.blocks.push({ t: 'p', text: `download: [${name}](${url})` });
			}
			break;
		}
		case 'txt':
			ctx.blocks.push(...linesToBlocks(txtLines(node, ctx)));
			break;
		case 'svg': {
			const ref = registerImage(node, ctx);
			if (ref) ctx.blocks.push({ t: 'img', ref });
			break;
		}
		case 'player': // audio demo player (sound-packs page)
			if (a.src)
				ctx.blocks.push({ t: 'p', text: `audio demo: [${a.name || a.src}](${ASSETS}${a.src})` });
			break;
		default:
			warn(`${ctx.docId}: unhandled node type "${node.t}"`);
			walk(node.c, ctx);
	}
}

/** An absolutely positioned (rp) box whose only content is a number: a diagram callout dot. */
function isCalloutBadge(node) {
	if (!node.a?.rp || !node.a?.rpv) return false;
	const content = contentNodes(node);
	return (
		content.length === 1 &&
		content[0].t === 'txt' &&
		/^\d{1,2}$/.test(plainText(content[0].a?.c).trim())
	);
}

function collectImagesOnly(node, ctx) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) return node.forEach((n) => collectImagesOnly(n, ctx));
	if (node.t === 'svg') registerImage(node, ctx, { role: 'mobile-layout' });
	if (node.a?.bi?.img?.current_data)
		registerImage({ a: { img: node.a.bi.img } }, ctx, { role: 'background' });
	collectImagesOnly(node.c, ctx);
}

/** Post-process blocks: heading levels, anchors, image context, spacing. */
function finalizeBlocks(blocks, { pageUrl }) {
	const out = blocks.filter((b) => !(b.t === 'p' && !b.text.trim()));
	// 1) chapter title: first numbered "N." heading (or the first heading) becomes H1; a heading that
	//    immediately continues it (two-line titles such as "4. get started on your / first project…") merges.
	let h1 = out.findIndex(
		(b) => b.t === 'h' && /^\d+\.?\s/.test(b.text) && !/^\d+\.\d+/.test(b.text)
	);
	if (h1 < 0) h1 = out.findIndex((b) => b.t === 'h');
	if (h1 >= 0) {
		out[h1].level = 1;
		let j = h1 + 1;
		while (out[j]?.t === 'anchor') j++;
		if (out[j]?.t === 'h' && out[j].level === 2 && !/^\d/.test(out[j].text)) {
			out[h1].text = `${out[h1].text} ${out[j].text}`;
			out.splice(j, 1);
		}
	}
	// 2) anchors: attach the adjacent box id to each heading. Section boxes either wrap their heading
	//    (id just before it) or directly follow it (id just after), so: preceding wins, else following.
	//    Card headings (H3) only take an id that directly precedes them.
	for (let i = 0; i < out.length; i++) {
		const b = out[i];
		if (b.t !== 'h') continue;
		if (out[i - 1]?.t === 'anchor' && !out[i - 1].used) b.anchor = out[i - 1].id;
		else if (b.level <= 2 && out[i + 1]?.t === 'anchor' && !out[i + 1].used)
			b.anchor = out[i + 1].id;
		if (b.anchor) for (const x of out) if (x.t === 'anchor' && x.id === b.anchor) x.used = true;
	}
	// 3) image context for the manifest: chapter, section, card title, caption.
	let section = null;
	let card = null;
	for (let i = 0; i < out.length; i++) {
		const b = out[i];
		if (b.t === 'h') {
			if (b.level <= 2) {
				section = b;
				card = null;
			} else card = b;
			continue;
		}
		if (b.t !== 'img') continue;
		let caption = '';
		for (let j = i + 1; j < out.length && j <= i + 6; j++) {
			if (out[j].t === 'img' || out[j].t === 'anchor') continue;
			if (out[j].t === 'p') caption = out[j].text;
			break;
		}
		const use = b.ref.use;
		use.section = section?.text ?? null;
		use.section_id = section?.anchor ?? null;
		use.card = card?.text ?? null;
		use.caption =
			caption
				.replace(/\s*\n\s*/g, ' ')
				.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
				.slice(0, 400) || null;
		use.url = section?.anchor ? `${pageUrl}#${encodeURI(section.anchor)}` : pageUrl;
		b.alt = (card?.text || section?.text || 'diagram').replace(/[[\]]/g, '');
	}
	// drop unused duplicate anchors that repeat the immediately previous anchor
	return out.filter(
		(b, i) => !(b.t === 'anchor' && out[i - 1]?.t === 'anchor' && out[i - 1].id === b.id)
	);
}

function blocksToMarkdown(blocks) {
	const parts = [];
	for (const b of blocks) {
		switch (b.t) {
			case 'h':
				parts.push(
					`${b.anchor ? `<a id="${b.anchor}"></a>\n` : ''}${'#'.repeat(b.level)} ${b.text}`
				);
				break;
			case 'anchor':
				if (!b.used) parts.push(`<a id="${b.id}"></a>`);
				break;
			case 'p':
				parts.push(b.text.replace(/^(#{1,6}\s)/gm, '\\$1'));
				break;
			case 'list':
				parts.push(b.items.map((t, i) => `${b.ordered ? `${i + 1}.` : '-'} ${t}`).join('\n'));
				break;
			case 'img':
				parts.push(`![${b.alt}](${b.ref.rel})`);
				break;
			case 'table': {
				const [head, ...rows] = b.rows;
				const width = Math.max(...b.rows.map((r) => r.length));
				const pad = (r) => [...r, ...Array(width - r.length).fill('')];
				parts.push(
					[
						`| ${pad(head).join(' | ')} |`,
						`| ${Array(width).fill('---').join(' | ')} |`,
						...rows.map((r) => `| ${pad(r).join(' | ')} |`)
					].join('\n')
				);
				break;
			}
			case 'raw':
				parts.push(b.text);
				break;
		}
	}
	// merge stacked images onto consecutive lines; everything else is separated by a blank line
	return parts.join('\n\n').replace(/(!\[[^\]]*\]\([^)]*\))\n\n(?=!\[)/g, '$1\n') + '\n';
}

function convertPage(content, { docId, pageUrl }) {
	const ctx = { docId, pageUrl, blocks: [] };
	walk(content, ctx);
	const blocks = finalizeBlocks(ctx.blocks, { docId, pageUrl });
	return { blocks, markdown: blocksToMarkdown(blocks) };
}

// ────────────────────────────────────────────────────────────────────────────── front-matter & stats

const yamlStr = (s) => JSON.stringify(String(s ?? ''));
function frontMatter(obj) {
	const lines = ['---'];
	for (const [k, v] of Object.entries(obj)) {
		if (v === undefined) continue;
		if (Array.isArray(v)) {
			if (!v.length) {
				lines.push(`${k}: []`);
				continue;
			}
			lines.push(`${k}:`);
			for (const item of v) {
				if (item && typeof item === 'object') {
					const entries = Object.entries(item).filter(([, x]) => x !== undefined && x !== null);
					entries.forEach(([ik, iv], idx) =>
						lines.push(
							`${idx === 0 ? '  - ' : '    '}${ik}: ${typeof iv === 'number' ? iv : yamlStr(iv)}`
						)
					);
				} else lines.push(`  - ${yamlStr(item)}`);
			}
		} else lines.push(`${k}: ${typeof v === 'number' || typeof v === 'boolean' ? v : yamlStr(v)}`);
	}
	lines.push('---', '');
	return lines.join('\n');
}

const stripMd = (md) =>
	md
		.replace(/^---[\s\S]*?\n---\n/, '')
		.replace(/<a id="[^"]*"><\/a>/g, '')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[#*|>-]/g, ' ');
const wordCount = (md) => (stripMd(md).match(/[\p{L}\p{N}][\p{L}\p{N}'’.+/–-]*/gu) || []).length;
/** Markdown minus image refs and anchor tags: what an LLM actually needs to read. */
const readableText = (md) =>
	md
		.replace(/^---[\s\S]*?\n---\n/, '')
		.replace(/<a id="[^"]*"><\/a>\n?/g, '')
		.replace(/!\[[^\]]*\]\([^)]*\)\n?/g, '')
		.replace(/\n{3,}/g, '\n\n');
/** Rough Claude token estimate for English prose + light Markdown (≈3.8 chars/token), images excluded. */
const tokenEstimate = (text) => Math.round(readableText(text).length / 3.8);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ────────────────────────────────────────────────────────────────────────────── chunks (RAG units)

/** Section-level chunks: one per H2 (or H1 intro); oversized sections split at H3 cards. */
function buildChunks(doc) {
	const chunks = [];
	const sections = [];
	let cur = null;
	for (const b of doc.blocks) {
		if (b.t === 'h' && b.level <= 2) {
			cur = { heading: b, blocks: [] };
			sections.push(cur);
			continue;
		}
		if (!cur) {
			cur = { heading: { text: doc.title, anchor: null, level: 1 }, blocks: [] };
			sections.push(cur);
		}
		cur.blocks.push(b);
	}
	// Chunk text drops image refs (listed separately for the UI) and anchor tags (listed as sub_anchors).
	const chunkText = (blocks) =>
		readableText(blocksToMarkdown(blocks.filter((b) => b.t !== 'anchor' && b.t !== 'img'))).trim();
	const chunkImages = (blocks) => {
		const imgs = blocks
			.filter((b) => b.t === 'img')
			.map((b) => ({ file: b.ref.entry.file, alt: b.alt }));
		return imgs.length ? imgs : undefined;
	};
	for (const s of sections) {
		const md = chunkText(s.blocks);
		// anchors inside the section that are not attached to a heading (e.g. #rotate-trigs-functionality)
		const anchorIds = s.blocks.filter((b) => b.t === 'anchor' && !b.used).map((b) => b.id);
		const url = s.heading.anchor
			? `${doc.source_url}#${encodeURI(s.heading.anchor)}`
			: doc.source_url;
		const base = {
			doc: doc.id,
			chapter: doc.title,
			section: s.heading.text,
			anchor: s.heading.anchor ?? null,
			url,
			sub_anchors: anchorIds.length ? anchorIds : undefined
		};
		const whole = `# ${doc.title}\n## ${s.heading.text}\n\n${md}`;
		if (tokenEstimate(whole) <= 900 || !s.blocks.some((b) => b.t === 'h' && b.level === 3)) {
			chunks.push({
				id: `${doc.id}#${s.heading.anchor ?? 'intro'}`,
				...base,
				text: md,
				images: chunkImages(s.blocks),
				tokens_est: tokenEstimate(whole)
			});
			continue;
		}
		// split at H3 cards, grouping small cards together up to ~600 tokens
		let group = [];
		let groupTitle = null;
		let n = 0;
		const emit = () => {
			if (!group.length) return;
			const text = chunkText(group);
			chunks.push({
				id: `${doc.id}#${s.heading.anchor ?? 'intro'}:${++n}`,
				...base,
				card: groupTitle ?? undefined,
				text,
				images: chunkImages(group),
				tokens_est: tokenEstimate(`# ${doc.title}\n## ${s.heading.text}\n\n${text}`)
			});
			group = [];
			groupTitle = null;
		};
		for (const b of s.blocks) {
			if (b.t === 'h' && b.level === 3 && tokenEstimate(blocksToMarkdown(group)) > 600) emit();
			if (b.t === 'h' && b.level === 3 && groupTitle === null) groupTitle = b.text;
			group.push(b);
		}
		emit();
	}
	return chunks;
}

// ────────────────────────────────────────────────────────────────────────────── layout hotspots

/**
 * The "2. layout" chapter overlays clickable regions on the full-panel diagram. Their geometry is a
 * CSS float layout of fixed-size boxes; simulate it to recover region rectangles in diagram pixels.
 */
function extractLayoutHotspots(content, pageUrl) {
	const px = (dim, isWidth) => {
		if (!dim || typeof dim.v !== 'number') return 0;
		if (dim.u === 'u') return dim.v;
		if (isWidth) return GRID.colW * dim.v + GRID.gutter * (dim.v - 1);
		return GRID.bh * dim.v;
	};
	const findDiagram = (n, parent) => {
		if (!n || typeof n !== 'object') return null;
		if (Array.isArray(n)) {
			for (const x of n) {
				const r = findDiagram(x, parent);
				if (r) return r;
			}
			return null;
		}
		if (n.t === 'cond' && isMobileOnlyCond(n.a)) return null;
		if (
			n.t === 'box' &&
			(n.c || []).some((k) => (k.c || []).some((s) => s.t === 'svg')) &&
			(n.c || []).some((k) => k.a?.rp && (k.c || []).length > 5)
		)
			return n;
		return findDiagram(n.c, n);
	};
	const root = findDiagram(content, null);
	if (!root) return null;
	const svgBox = root.c.find((k) => (k.c || []).some((s) => s.t === 'svg'));
	const svg = svgBox.c.find((s) => s.t === 'svg');
	const overlay = root.c.find((k) => k.a?.rp && (k.c || []).length > 5);
	const regions = [];
	const layoutFloats = (kids, originX, originY, width) => {
		const placed = [];
		for (const k of kids) {
			if (k.t !== 'box') continue;
			const w = px(k.a?.w, true);
			const h = px(k.a?.h, false);
			const mr = k.a?.gts === 'f' ? 0 : k.a?.gts === 'h' ? GRID.gutter / 2 : GRID.gutter;
			let y = placed.reduce((m, p) => Math.max(m, p.y), 0);
			let x = 0;
			for (let guard = 0; guard < 100; guard++) {
				const blockers = placed.filter((p) => p.y + p.h > y);
				x = blockers.reduce((m, p) => Math.max(m, p.x + p.w + p.mr), 0);
				if (x + w <= width + 0.01 || !blockers.length) break;
				y = Math.min(...blockers.map((p) => p.y + p.h));
			}
			placed.push({ x, y, w, h, mr });
			const hash = k.a?.lnk?.d?.hash;
			if (hash && !(k.c || []).some((c) => c.a?.lnk)) {
				regions.push({
					id: hash,
					x: originX + x,
					y: originY + y,
					w,
					h,
					url: `${pageUrl}#${encodeURI(hash)}`
				});
			}
			if ((k.c || []).length) layoutFloats(k.c, originX + x, originY + y, w);
		}
	};
	layoutFloats(overlay.c, 0, 0, px(svgBox.a?.w, true));
	const callouts = [];
	for (const k of root.c) {
		if (!k.a?.rp || !k.a?.rpv?.v || k === overlay) continue;
		const label = contentNodes(k)
			.map((n) => (n.t === 'txt' ? plainText(n.a.c).trim() : ''))
			.join('');
		if (!/^\d+$/.test(label)) continue;
		const hash = k.a?.lnk?.d?.hash;
		callouts.push({
			n: Number(label),
			target: hash,
			x: k.a.rpv.v.x,
			y: k.a.rpv.v.y,
			size: 15,
			scale: k.a.ts ?? 1
		});
	}
	callouts.sort((p, q) => p.n - q.n);
	const img = svg.a.img;
	return {
		source_url: pageUrl,
		note:
			'Region rectangles recovered by simulating the page float layout (desktop, 740px-wide diagram). Units: diagram pixels. ' +
			'Checked against live browser rendering on 2026-09-26: all 14 regions matched exactly. Callout x/y is the top-left of a 15px dot drawn at scale 1.95.',
		diagram: {
			file: `${img.current}_${img.current_data.original.suffix}`,
			width: Number(img.current_data.original.width),
			height: Number(img.current_data.original.height)
		},
		regions,
		callouts
	};
}

// ────────────────────────────────────────────────────────────────────────────── changelog

function parseChangelog(content) {
	const versions = [];
	const preamble = [];
	const reVer = /^\d+\.\d+\.\d+$/;
	const reDate = /^(\d{4})\.(\d{2})\.(\d{2})$/;
	const ctx = { docId: 'changelog', pageUrl: `${SITE}/downloads/op-xy`, blocks: [] };
	const top = content.c || [];
	for (const box of top) {
		if (box.t !== 'box') continue;
		const txts = contentNodes(box).filter((n) => n.t === 'txt');
		const flat = txts.map((n) => plainText(n.a?.c).replace(/\s+/g, ' ').trim());
		const vIdx = flat.findIndex((t) => reVer.test(t));
		const dIdx = flat.findIndex((t) => reDate.test(t));
		if (vIdx < 0 || dIdx < 0) {
			const isColumnHeader = flat
				.filter(Boolean)
				.every((t) => /^(os|date|new update features:?)$/i.test(t));
			if (!versions.length && !isColumnHeader) {
				for (const n of txts) {
					const blocks = linesToBlocks(txtLines(n, ctx));
					for (const b of blocks) if (b.t === 'p' || b.t === 'list') preamble.push(b);
				}
			}
			continue;
		}
		const [, y, m, d] = flat[dIdx].match(reDate);
		let download = null;
		const findLnk = (n) => {
			if (!n || typeof n !== 'object' || download) return;
			if (Array.isArray(n)) return n.forEach(findLnk);
			if (n.a?.lnk && /\.tfw$/i.test(String(n.a.lnk.v))) download = linkUrl(n.a.lnk);
			findLnk(n.c);
		};
		findLnk(box);
		const items = [];
		const notes = [];
		let downloadStatus = download ? 'available' : 'none';
		txts.forEach((n, i) => {
			if (i === vIdx || i === dIdx) return;
			for (const l of txtLines(n, ctx)) {
				if (!l.text || /^click to download$/i.test(l.text)) continue;
				if (/^unavailable$/i.test(l.text)) {
					downloadStatus = 'unavailable';
					continue;
				}
				if (l.kind === 'ul' || l.kind === 'ol') items.push(l.text);
				else notes.push(l.text);
			}
		});
		// Merge note fragments split across lines ("note: some updates…" + continuation).
		versions.push({
			version: flat[vIdx],
			date: `${y}-${m}-${d}`,
			download,
			download_status: downloadStatus,
			items,
			notes: notes.length ? [notes.join(' ').replace(/\s+/g, ' ').trim()] : []
		});
	}
	return { preamble, versions };
}

function changelogMarkdown({ preamble, versions }, meta) {
	const out = [];
	out.push(
		frontMatter({
			title: 'OP–XY OS changelog',
			source_url: `${SITE}/downloads/op-xy`,
			fetched_at: FETCHED_AT,
			latest_version: versions[0]?.version,
			latest_date: versions[0]?.date,
			oldest_version: versions.at(-1)?.version,
			version_count: versions.length,
			guide_version: meta.guideVersion
		})
	);
	out.push('# OP–XY OS changelog\n');
	out.push(
		`Source: ${SITE}/downloads/op-xy (fetched ${FETCHED_AT.slice(0, 10)}). Newest first. Dates are ISO (TE writes YYYY.MM.DD).\n`
	);
	if (preamble.length) {
		out.push('## how to update (from the downloads page)\n');
		out.push(blocksToMarkdown(preamble));
	}
	out.push('## versions\n');
	out.push('| version | date | items |\n| --- | --- | --- |');
	for (const v of versions)
		out.push(
			`| [${v.version}](#${v.version.replace(/\./g, '')}) | ${v.date} | ${v.items.length} |`
		);
	out.push('');
	for (const v of versions) {
		out.push(`<a id="${v.version.replace(/\./g, '')}"></a>\n### ${v.version} — ${v.date}\n`);
		if (v.download) out.push(`firmware file: ${v.download}\n`);
		else if (v.download_status === 'unavailable')
			out.push('firmware file: unavailable (the downloads page offers no file for this version)\n');
		for (const n of v.notes) out.push(`> ${n}\n`);
		out.push(v.items.map((t) => `- ${t}`).join('\n') + '\n');
	}
	return out.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────── specs

function productSpecs(content) {
	// Desktop "technical specifications" block: category headings (cls has "light") + item lines.
	const txts = [];
	const g = (n) => {
		if (!n || typeof n !== 'object') return;
		if (Array.isArray(n)) return n.forEach(g);
		if (n.t === 'cond' && isMobileOnlyCond(n.a)) return;
		if (n.t === 'txt') txts.push(n);
		g(n.c);
	};
	g(content);
	const start = txts.findIndex((n) => /technical specifications/i.test(plainText(n.a?.c)));
	if (start < 0) return [];
	const groups = [];
	let cur = null;
	for (const n of txts.slice(start + 1, start + 12)) {
		for (const it of normalizeRich(n.a?.c, true)) {
			const cls = tokens(it.cls);
			if (it.it === 'ul' || it.it === 'ol' || (it.c || []).some((c) => c.it === 'ul')) {
				const lis =
					it.it === 'ul' || it.it === 'ol'
						? it.c
						: it.c.filter((c) => c.it === 'ul').flatMap((u) => u.c);
				for (const li of lis || []) cur?.items.push(cleanSpaces(plainText(li.c)).trim());
				continue;
			}
			// merged same-style spans are separated by <br> ('\n'): one spec item per line
			const lines = cleanSpaces(plainText(it.c ?? []))
				.split('\n')
				.map((t) => t.trim())
				.filter(Boolean);
			if (!lines.length) continue;
			if (cls.has('light')) {
				cur = { heading: lines.join(' '), items: [] };
				groups.push(cur);
			} else {
				if (!cur) groups.push((cur = { heading: '', items: [] }));
				cur.items.push(...lines);
			}
		}
		if (groups.some((gr) => gr.heading === 'usb')) break;
	}
	return groups;
}

/** Key regulatory identifiers from the guide index's regulatory statements. */
function regulatoryFacts(indexMarkdown) {
	const t = indexMarkdown.replace(/ {2}\n/g, '\n');
	const grab = (re) => t.match(re)?.[1]?.trim() ?? null;
	return [
		['model number', grab(/model no:\s*([^\n]+)/i)],
		['FCC ID', grab(/FCC ID:\s*([^\n]+)/)],
		['ISED IC', grab(/\bIC:\s*([^\n]+)/)],
		['radio frequency band', grab(/frequency band:\s*\n?([^\n]+)/i)],
		['radio maximum output power', grab(/maximum output power:\s*\n?([^\n]+)/i)],
		['body SAR (highest reported, FCC)', grab(/was\s+([\d.]+\s?W\/kg)/i)],
		['korea head SAR', grab(/head SAR:\s*([^\n]+)/i)]
	].filter(([, v]) => v);
}

// ────────────────────────────────────────────────────────────────────────────── main

async function main() {
	console.log(
		`OP–XY docs ingest → ${path.relative(ROOT, OUT_DIR)} (${OFFLINE ? 'offline' : 'online'})`
	);
	await fs.mkdir(path.join(RAW_DIR, 'guide'), { recursive: true });
	await fs.mkdir(path.join(RAW_DIR, 'pages'), { recursive: true });
	await fs.mkdir(GUIDE_OUT, { recursive: true });
	await fs.mkdir(IMG_OUT, { recursive: true });

	// 1) guide index → chapter discovery + guide version
	const indexDecoded = await loadPage(GUIDE_PATH, 'guide-index');
	const indexPage = te013Page(indexDecoded);
	const slugs = [];
	const scan = (n) => {
		if (!n || typeof n !== 'object') return;
		if (Array.isArray(n)) return n.forEach(scan);
		const consider = (lnk) => {
			if (lnk?.t !== 'path') return;
			const m = String(lnk.v)
				.replace(/^\/+/, '')
				.match(/^guides\/op-xy\/([a-z0-9-]+)\/?$/);
			if (m && !slugs.includes(m[1])) slugs.push(m[1]);
		};
		consider(n.lnk);
		consider(n.a?.lnk);
		if (Array.isArray(n.a?.c)) scan(n.a.c);
		scan(n.c);
	};
	scan(indexPage.content);
	let guideVersion = null;
	const findVersion = (n) => {
		if (!n || typeof n !== 'object' || guideVersion) return;
		if (Array.isArray(n)) return n.forEach(findVersion);
		if (n.t === 'txt') {
			const m = plainText(n.a?.c)
				.trim()
				.match(/^v\.?\s*(\d+\.\d+\.\d+)$/);
			if (m) guideVersion = m[1];
		}
		findVersion(n.c);
	};
	findVersion(indexPage.content);
	console.log(
		`  guide version label: v${guideVersion}; ${slugs.length} chapters linked from the index`
	);

	// cross-check against the site map (catches chapters that are live but not linked)
	try {
		const sitemap = OFFLINE
			? await fs.readFile(path.join(RAW_DIR, 'sitemap.txt'), 'utf8')
			: await politeFetch(`${SITE}/sitemap.txt`);
		if (!OFFLINE) await fs.writeFile(path.join(RAW_DIR, 'sitemap.txt'), sitemap);
		for (const m of sitemap.matchAll(/\/guides\/op-xy\/([a-z0-9-]+)\s/g)) {
			if (!slugs.includes(m[1])) {
				warn(`sitemap lists guides/op-xy/${m[1]} which the index does not link — adding it`);
				slugs.push(m[1]);
			}
		}
	} catch (err) {
		warn(`sitemap check failed: ${err.message}`);
	}

	// 2) chapters
	const docs = [];
	const indexUrl = `${SITE}/${GUIDE_PATH}`;
	const pages = [
		{ slug: 'index', sitePath: GUIDE_PATH, raw: 'guide-index', decoded: indexDecoded }
	];
	for (const slug of slugs)
		pages.push({ slug, sitePath: `${GUIDE_PATH}/${slug}`, raw: `guide/${slug}` });
	for (const p of pages) {
		const decoded = p.decoded ?? (await loadPage(p.sitePath, p.raw));
		const page = te013Page(decoded);
		const pageUrl = p.slug === 'index' ? indexUrl : `${SITE}/${p.sitePath}`;
		const { blocks, markdown } = convertPage(page.content, { docId: p.slug, pageUrl });
		const h1 = blocks.find((b) => b.t === 'h' && b.level === 1);
		const numMatch = h1?.text.match(/^(\d+)\.?\s/);
		const chapterNo = p.slug === 'index' ? 0 : numMatch ? Number(numMatch[1]) : null;
		const title =
			p.slug === 'index' ? `OP–XY guide v${guideVersion} — index` : (h1?.text ?? page.title);
		const sections = blocks
			.filter((b) => b.t === 'h' && b.level <= 2)
			.map((b) => ({
				id: b.anchor ?? null,
				title: b.text,
				level: b.level,
				url: b.anchor ? `${pageUrl}#${encodeURI(b.anchor)}` : pageUrl
			}));
		const anchors = [
			...new Set(
				blocks
					.filter((b) => (b.t === 'h' && b.anchor) || b.t === 'anchor')
					.map((b) => (b.t === 'h' ? b.anchor : b.id))
			)
		];
		const cards = blocks.filter((b) => b.t === 'h' && b.level === 3).length;
		const images =
			blocks.filter((b) => b.t === 'img').length +
			blocks
				.filter((b) => b.t === 'table')
				.reduce((n, b) => n + b.rows.flat().join(' ').split('![').length - 1, 0);
		const doc = {
			id: p.slug,
			slug: p.slug,
			chapter: chapterNo,
			title,
			page_title: page.title,
			source_url: pageUrl,
			blocks,
			markdown,
			sections,
			anchors,
			cards,
			images,
			source_sha256: sha256(JSON.stringify(page.content))
		};
		doc.words = wordCount(markdown);
		doc.tokens_est = tokenEstimate(markdown);
		docs.push(doc);
	}
	// file names: NN-slug.md (NN = official chapter number; the online guide has no chapter 13)
	let fallbackNo = 90;
	for (const d of docs)
		d.file = `${String(d.chapter ?? fallbackNo++).padStart(2, '0')}-${d.slug}.md`;
	await fs.rm(GUIDE_OUT, { recursive: true, force: true });
	await fs.mkdir(GUIDE_OUT, { recursive: true });
	for (const d of docs) {
		const fm = frontMatter({
			title: d.title,
			chapter: d.chapter ?? undefined,
			slug: d.slug,
			page_title: d.page_title,
			source_url: d.source_url,
			guide_version: guideVersion,
			fetched_at: FETCHED_AT,
			source_sha256: d.source_sha256,
			words: d.words,
			tokens_est: d.tokens_est,
			images: d.images,
			sections: d.sections,
			anchors: d.anchors
		});
		await fs.writeFile(path.join(GUIDE_OUT, d.file), fm + d.markdown);
		console.log(
			`  wrote guide/${d.file} (${d.words} words, ${d.sections.length} sections, ${d.images} images)`
		);
	}

	// 3) layout hotspots (replica input)
	const layoutDecoded = JSON.parse(
		await fs.readFile(path.join(RAW_DIR, 'guide/layout.json'), 'utf8')
	);
	const hotspots = extractLayoutHotspots(
		te013Page(layoutDecoded).content,
		`${SITE}/${GUIDE_PATH}/layout`
	);
	if (hotspots)
		await fs.writeFile(
			path.join(IMG_OUT, 'layout-hotspots.json'),
			JSON.stringify(hotspots, null, 2) + '\n'
		);

	// 4) other official pages
	const extras = [];
	const other = [
		{
			sitePath: 'guides/fieldkit',
			raw: 'pages/guides_fieldkit',
			out: 'fieldkit.md',
			id: 'fieldkit'
		},
		{
			sitePath: 'downloads/op-xy/sound-packs',
			raw: 'pages/downloads_op-xy_sound-packs',
			out: 'sound-packs.md',
			id: 'sound-packs'
		}
	];
	for (const o of other) {
		try {
			const page = te013Page(await loadPage(o.sitePath, o.raw));
			const pageUrl = `${SITE}/${o.sitePath}`;
			const { markdown } = convertPage(page.content, { docId: o.id, pageUrl });
			const fm = frontMatter({
				title: page.title,
				source_url: pageUrl,
				fetched_at: FETCHED_AT,
				words: wordCount(markdown)
			});
			await fs.writeFile(path.join(OUT_DIR, o.out), fm + markdown);
			extras.push({
				file: o.out,
				title: page.title,
				source_url: pageUrl,
				words: wordCount(markdown)
			});
			console.log(`  wrote ${o.out}`);
		} catch (err) {
			warn(`${o.sitePath}: ${err.message}`);
		}
	}

	// 5) changelog
	const dlPage = te013Page(await loadPage('downloads/op-xy', 'pages/downloads_op-xy'));
	const changelog = parseChangelog(dlPage.content);
	await fs.writeFile(
		path.join(OUT_DIR, 'changelog.md'),
		changelogMarkdown(changelog, { guideVersion })
	);
	await fs.writeFile(
		path.join(OUT_DIR, 'changelog.json'),
		JSON.stringify(
			{
				source_url: `${SITE}/downloads/op-xy`,
				fetched_at: FETCHED_AT,
				guide_version: guideVersion,
				versions: changelog.versions
			},
			null,
			2
		) + '\n'
	);
	console.log(
		`  wrote changelog.md (${changelog.versions.length} versions, latest ${changelog.versions[0]?.version} ${changelog.versions[0]?.date})`
	);

	// 6) specs: product page + store page + guide chapter 1 + index (box contents, model no.)
	const prodPage = te013Page(await loadPage('products/op-xy', 'pages/products_op-xy'));
	const specGroups = productSpecs(prodPage.content);
	let storeDetails = [];
	try {
		const storeDecoded = decodeTurboStream(
			await getPageHtml('store/op-xy', 'pages/store_op-xy.html')
		);
		await fs.writeFile(
			path.join(RAW_DIR, 'pages/store_op-xy.json'),
			JSON.stringify(storeDecoded, null, 1)
		);
		const route = Object.values(storeDecoded.loaderData).find((v) => v?.product);
		storeDetails = (route?.product?.details || []).map((d) => d.text);
	} catch (err) {
		warn(`store page: ${err.message}`);
	}
	const hw = docs.find((d) => d.slug === 'hardware-overview');
	const idx = docs.find((d) => d.slug === 'index');
	const sectionMd = (doc, anchor) => {
		const i = doc.blocks.findIndex((b) => b.t === 'h' && b.anchor === anchor);
		if (i < 0) return '';
		const end = doc.blocks.findIndex(
			(b, j) => j > i && (b.t === 'h' || (b.t === 'anchor' && !b.used))
		);
		return blocksToMarkdown(
			doc.blocks
				.slice(i + 1, end < 0 ? undefined : end)
				.filter((b) => b.t !== 'img' && b.t !== 'anchor')
		).trim();
	};
	const regFacts = idx ? regulatoryFacts(idx.markdown) : [];
	const specsMd = [
		frontMatter({
			title: 'OP–XY specifications',
			fetched_at: FETCHED_AT,
			sources: [
				`${SITE}/products/op-xy`,
				`${SITE}/store/op-xy`,
				`${SITE}/${GUIDE_PATH}/hardware-overview`,
				`${SITE}/${GUIDE_PATH}`
			]
		}),
		'# OP–XY specifications\n',
		'Compiled verbatim from official teenage engineering pages. Where pages disagree, both values are kept (see "discrepancies").\n',
		`## product page — technical specifications\n\nsource: ${SITE}/products/op-xy\n`,
		...specGroups.map(
			(gr) => `### ${gr.heading || '(untitled)'}\n\n${gr.items.map((t) => `- ${t}`).join('\n')}\n`
		),
		`## store page — details\n\nsource: ${SITE}/store/op-xy\n\n${storeDetails.map((t) => `- ${t}`).join('\n')}\n`,
		`## user guide — 1.4 technical specifications\n\nsource: ${SITE}/${GUIDE_PATH}/hardware-overview#technical-specifications\n\n${hw ? sectionMd(hw, 'technical-specifications') : ''}\n`,
		`## user guide — 1.5 electrical characteristics\n\nsource: ${SITE}/${GUIDE_PATH}/hardware-overview#electrical-characteristics\n\n${hw ? sectionMd(hw, 'electrical-characteristics') : ''}\n`,
		`## user guide — what's in the box\n\nsource: ${SITE}/${GUIDE_PATH}#whats-in-the-box\n\n${idx ? sectionMd(idx, 'whats-in-the-box') : ''}\n`,
		`## regulatory identifiers\n\nsource: ${SITE}/${GUIDE_PATH}#regulatory-statements (full text in guide/00-index.md)\n\n${regFacts.map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n`,
		`## discrepancies between official sources\n\n` +
			[
				'- patterns per track: the product page says "9 patterns per track"; OS 1.1.15 (2026-07-01) raised this to 16 and the guide\'s arrange chapter says "a track can hold a maximum of 16 patterns".',
				'- display: the product page says "480 x 222px IPS TFT display"; the guide (1.4) says "480 x 220 IPS TFT display".'
			].join('\n') +
			'\n'
	].join('\n');
	await fs.writeFile(path.join(OUT_DIR, 'specs.md'), specsMd);
	console.log(
		`  wrote specs.md (${specGroups.length} product spec groups, ${storeDetails.length} store details)`
	);

	// 7) assets: guide SVGs, press images, printable PDF
	const pressImages = [];
	try {
		const press = te013Page(await loadPage('press/op-xy', 'pages/press_op-xy'));
		const seen = new Set();
		const g = (n) => {
			if (!n || typeof n !== 'object') return;
			if (Array.isArray(n)) return n.forEach(g);
			const l = n.a?.lnk;
			if (l?.t === 'img') {
				try {
					const v = JSON.parse(l.v);
					const suffix = v.current_data?.original?.suffix;
					if (suffix && !seen.has(v.current)) {
						seen.add(v.current);
						const safe = String(v.name)
							.replace(/[\u2013\u2014]/g, '-')
							.replace(/\s+/g, '_')
							.replace(/[^\w.-]/g, '');
						pressImages.push({
							file: `press/${safe}`,
							original_name: v.name,
							url: `${ASSETS}${v.current}_${suffix}`,
							width: v.current_data.original.width ?? null,
							height: v.current_data.original.height ?? null,
							source_url: `${SITE}/press/op-xy`
						});
					}
				} catch {
					/* not a JSON asset link */
				}
			}
			g(n.c);
		};
		g(press.content);
	} catch (err) {
		warn(`press page: ${err.message}`);
	}
	const pdfs = [];
	const findPdfs = (n) => {
		if (!n || typeof n !== 'object') return;
		if (Array.isArray(n)) return n.forEach(findPdfs);
		const consider = (l) => {
			if (l?.t !== 'img') return;
			try {
				const v = JSON.parse(l.v);
				if (
					v.kind === 'bin' &&
					/\.pdf$/i.test(v.name) &&
					!pdfs.some((p) => p.current === v.current)
				)
					pdfs.push({
						name: v.name,
						date: v.date,
						current: v.current,
						url: `${ASSETS}${v.current}_${v.current_data?.original?.suffix || 'original.pdf'}`
					});
			} catch {
				/* ignore */
			}
		};
		consider(n.lnk);
		consider(n.a?.lnk);
		if (Array.isArray(n.a?.c)) findPdfs(n.a.c);
		findPdfs(n.c);
	};
	findPdfs(indexPage.content);

	let dl = { downloaded: 0, cached: 0, skipped: 0, failed: 0 };
	const images = [...imageRegistry.values()];
	console.log(
		`  assets: ${images.length} unique guide images, ${pressImages.length} press images, ${pdfs.length} PDFs`
	);
	for (const img of images) {
		try {
			dl[await downloadAsset(img.url, path.join(IMG_OUT, img.file))]++;
		} catch (err) {
			dl.failed++;
			warn(`image ${img.url}: ${err.message}`);
		}
	}
	for (const pi of pressImages) {
		try {
			dl[await downloadAsset(pi.url, path.join(IMG_OUT, pi.file))]++;
		} catch (err) {
			dl.failed++;
			warn(`press image ${pi.url}: ${err.message}`);
		}
	}
	// Only the newest printable guide is downloaded (older ones stay listed in the manifest).
	const guidePdfs = pdfs
		.filter((p) => /printed guide/i.test(p.name))
		.sort((x, y) => String(y.date).localeCompare(String(x.date)));
	for (const old of guidePdfs.slice(1)) old.superseded_by = guidePdfs[0].name;
	for (const pdf of pdfs) {
		const safe = pdf.name
			.replace(/[\u2013\u2014]/g, '-')
			.replace(/\s+/g, '_')
			.replace(/[^\w.()-]/g, '');
		pdf.file = path.relative(ROOT, path.join(RAW_DIR, 'pdf', safe));
		if (pdf.superseded_by) {
			pdf.file = null;
			continue;
		}
		try {
			dl[await downloadAsset(pdf.url, path.join(ROOT, pdf.file))]++;
		} catch (err) {
			dl.failed++;
			warn(`pdf ${pdf.url}: ${err.message}`);
		}
	}
	console.log(`  assets: ${JSON.stringify(dl)}`);

	// 8) manifest + corpus index + chunks
	const byDoc = Object.fromEntries(docs.map((d) => [d.id, d]));
	const manifest = {
		generated_at: GENERATED_AT,
		guide_version: guideVersion,
		note:
			'Guide images are SVGs (vector = highest resolution; text is outlined, so there is no alt text on the site). ' +
			'"file" keeps the CDN asset name (<current>_<suffix>). Context fields (section/card/caption) are derived from the page layout. ' +
			'The site recolours SVGs at render time using colors.fill/stroke/mono.',
		url_pattern: `${ASSETS}<current>_<suffix>  (suffixes: original.svg, opt.svg, mono.svg, thumb.webp; rasters: original.*, 128…5120.webp)`,
		images: images
			.map((img) => ({
				file: img.file,
				url: img.url,
				kind: img.kind,
				width: img.width,
				height: img.height,
				asset_id: img.asset_id,
				variants: img.variants,
				uses: img.uses.map((u) => ({
					chapter_file: byDoc[u.doc]?.file ?? u.doc,
					chapter: byDoc[u.doc]?.title ?? u.doc,
					...u,
					doc: undefined
				}))
			}))
			.sort((x, y) => (x.uses[0]?.chapter_file ?? '').localeCompare(y.uses[0]?.chapter_file ?? '')),
		press_images: pressImages,
		pdfs
	};
	await fs.writeFile(path.join(IMG_OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

	const chunks = docs.flatMap((d) => buildChunks(d));
	await fs.writeFile(
		path.join(OUT_DIR, 'chunks.jsonl'),
		chunks.map((c) => JSON.stringify(c)).join('\n') + '\n'
	);

	const index = {
		generated_at: GENERATED_AT,
		fetched_at: FETCHED_AT,
		guide_version: guideVersion,
		guide_url: indexUrl,
		totals: {
			chapters: docs.filter((d) => d.slug !== 'index').length,
			documents: docs.length,
			words: docs.reduce((n, d) => n + d.words, 0),
			tokens_est: docs.reduce((n, d) => n + d.tokens_est, 0),
			sections: docs.reduce((n, d) => n + d.sections.length, 0),
			cards: docs.reduce((n, d) => n + d.cards, 0),
			image_refs: docs.reduce((n, d) => n + d.images, 0),
			unique_images: images.length,
			chunks: chunks.length,
			changelog_versions: changelog.versions.length
		},
		chapters: docs.map((d) => ({
			file: `guide/${d.file}`,
			chapter: d.chapter,
			slug: d.slug,
			title: d.title,
			source_url: d.source_url,
			words: d.words,
			tokens_est: d.tokens_est,
			sections: d.sections.length,
			cards: d.cards,
			images: d.images,
			source_sha256: d.source_sha256
		})),
		extras: [
			...extras,
			{ file: 'changelog.md', title: 'OP–XY OS changelog', source_url: `${SITE}/downloads/op-xy` },
			{ file: 'specs.md', title: 'OP–XY specifications', source_url: `${SITE}/products/op-xy` }
		],
		warnings
	};
	await fs.writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');
	await fs.writeFile(
		path.join(OUT_DIR, 'README.md'),
		[
			'# knowledge/official — verbatim teenage engineering OP–XY documentation (git-ignored)',
			'',
			`Generated by \`node scripts/ingest-guide.mjs\` on ${GENERATED_AT} (pages fetched ${FETCHED_AT}). Guide label v${guideVersion}. Do not edit by hand; re-run the script.`,
			"This is TE's text, kept locally as source material only (see docs/research/40-official-docs.md).",
			'',
			'- `guide/NN-slug.md` — one file per guide page (00 = index/front matter; the online guide has no chapter 13).',
			'- `images/` — every guide SVG (`<asset>_original.svg`), `press/` product photos, `manifest.json`, `layout-hotspots.json`.',
			'- `changelog.md` / `changelog.json` — full OS changelog. `specs.md` — product specs. `fieldkit.md`, `sound-packs.md`.',
			'- `chunks.jsonl` — section-level retrieval units; `index.json` — corpus stats and chapter list.',
			''
		].join('\n')
	);
	console.log(
		`done: ${index.totals.chapters} chapters (+index), ${index.totals.words} words (~${index.totals.tokens_est} tokens), ` +
			`${images.length} unique images, ${chunks.length} chunks, ${changelog.versions.length} changelog versions, ${warnings.length} warnings`
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
