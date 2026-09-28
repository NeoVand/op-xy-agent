/**
 * The player pages as the device draws them, measured on the owner's OS 1.1.33 unit by camera
 * (docs/research/59-screen-profiling.md §2.7); TE's guide pictures none of them.
 *
 * - arpeggio and maestro: four 50 × 50 cards in the encoders' greys, each with a pictogram of its
 *   setting; the player's name under them; a picture below (the arpeggio's run as a row of
 *   isometric bars, maestro's chord as two stacks of slabs). Only the arpeggio has a shift layer,
 *   and a small arrow beside its cards says so.
 * - hold: its name over an infinity ribbon of eight lanes.
 * - `shift + player`: the track's number and "player", and the three players with the current one
 *   boxed.
 * - a player that is off: the page at 40 % of its brightness, "off" boxed over it.
 *
 * Pictograms TE drew elsewhere are reused (the LFO page's note values); the rest are traced off the
 * device's screen (`research/device/icontrace.py`, knowledge/opxy/device-icons/players.json).
 */
import type { ScreenCtx } from '../../screen/context';
import { fillBox, line, ring, roundRectPath, strokeBox, text } from '../../screen/draw';
import { drawIcon, icon } from '../../screen/icons';
import { compiled, tracePath } from '../../screen/paths';
import { COLORS, RAMP } from '../../screen/palette';
import {
	ARP_PATTERNS,
	ARP_SPEEDS,
	ARP_STYLES,
	MAESTRO_PATTERNS,
	PLAYER_TYPES
} from '../../sequencer';
import type { PlayerFrame } from './frames';

// ─────────────────────────────────────────────────────────────────────────── cards

/** The four cards: E1…E4 left to right. Maestro's sit wider apart (they have no arrow beside them). */
const CARD = { y: 20, size: 50, radius: 3 } as const;
const LAYOUT = { arpeggio: { x: 135, pitch: 53 }, maestro: { x: 130, pitch: 54.75 } } as const;
type Layout = (typeof LAYOUT)[keyof typeof LAYOUT];
const cardX = (layout: Layout, e: number) => layout.x + layout.pitch * e;

/** Each card's grey, the encoder's own, and the colour of what is drawn on it. */
const CARD_FILL = [RAMP[1], RAMP[3], COLORS.card, COLORS.white] as const;
const CARD_INK = [COLORS.white, COLORS.white, COLORS.ink, COLORS.ink] as const;

function cards(ctx: ScreenCtx, layout: Layout): void {
	for (let e = 0; e < 4; e++) {
		fillBox(ctx, cardX(layout, e), CARD.y, CARD.size, CARD.size, CARD_FILL[e], CARD.radius);
	}
}

/** A traced pictogram (drawn on its card's box) in one colour, optionally cut to `clip`. */
function pictogram(
	ctx: ScreenCtx,
	name: string,
	x: number,
	color: string,
	clip?: { x: number; w: number }
): void {
	ctx.save();
	if (clip) {
		ctx.beginPath();
		ctx.rect(clip.x, CARD.y, clip.w, CARD.size);
		ctx.clip();
	}
	drawIcon(ctx, name, x, CARD.y, { tint: color });
	ctx.restore();
}

/**
 * The player's name under the cards, in the heavier weight like all text on these pages. "arpeggio"
 * is set smaller than the rest (18 px, as if fitted to about 75 px), and the two names are centred
 * a little apart: as measured.
 */
const LABELS = { arpeggio: { x: 243.25, size: 18 }, maestro: { x: 241, size: 20 } } as const;
const label = (ctx: ScreenCtx, name: keyof typeof LABELS) =>
	text(ctx, name, LABELS[name].x, 95.5, LABELS[name].size, COLORS.white, 'center', 0, true);

// ─────────────────────────────────────────────────────────────────────────── note values

/**
 * TE's note glyphs from the LFO page: `lfo.note16` is a 32nd (head and stem, then its flags from
 * the top), `lfo.triplet` three eighths under a 3. Fewer or more flags make the other values.
 */
const NOTE = { stem: 0, flags: [2, 3, 1], flagPitch: 7.3, bottom: 59.03, left: 1.45 } as const;
const TRIPLET = { notes: [0, 2, 4], flags: [1, 3, 5], arc: 6, three: 7, width: 53.35 } as const;

function glyph(ctx: ScreenCtx, name: string, shape: number, x: number, y: number, k: number) {
	ctx.beginPath();
	tracePath(ctx, compiled(icon(name).shapes[shape].d), x, y, k);
	ctx.fill();
}

/**
 * A note value on the first card: `flags` 0 (a quarter) to 4 (a 64th), or three under a 3.
 * Centred on the card, standing on the same line whatever its flags.
 */
function noteValue(ctx: ScreenCtx, flags: number, triplet: boolean, color: string): void {
	const card = cardX(LAYOUT.arpeggio, 0);
	ctx.fillStyle = color;
	if (triplet) {
		const k = 0.58;
		const x = card + 25 - (TRIPLET.width * k) / 2 - 1.78 * k;
		const y = 62.4 - 61.12 * k;
		for (const n of TRIPLET.notes) glyph(ctx, 'lfo.triplet', n, x, y, k);
		for (const f of TRIPLET.flags) {
			for (let i = 0; i < flags; i++) glyph(ctx, 'lfo.triplet', f, x, y + i * 3.9 * k, k);
		}
		// the device sets the 3 and its arc higher over the notes than the LFO page does
		glyph(ctx, 'lfo.triplet', TRIPLET.arc, x, y - 6, k);
		glyph(ctx, 'lfo.triplet', TRIPLET.three, x, y - 6, k);
		return;
	}
	const k = 0.59;
	const width = flags > 0 ? 26.2 - NOTE.left : 16.74 - NOTE.left;
	const x = card + 24.75 - (width * k) / 2 - NOTE.left * k;
	const y = 62.4 - NOTE.bottom * k;
	// a 64th's stem reaches one flag higher
	const lift = flags > 3 ? NOTE.flagPitch * k : 0;
	glyph(ctx, 'lfo.note16', NOTE.stem, x, y, k);
	if (lift) fillBox(ctx, x + 15.1 * k, y + 1.5 * k - lift, 1.6 * k, lift + 2, color);
	for (let i = 0; i < flags; i++) {
		const shape = NOTE.flags[Math.min(i, 2)];
		const drop = i > 2 ? (i - 2) * NOTE.flagPitch * k : 0;
		glyph(ctx, 'lfo.note16', shape, x, y + drop - lift, k);
	}
}

// ─────────────────────────────────────────────────────────────────────────── arpeggio

/** Pattern pictograms by pattern (arpeggio's six; maestro's four are among them). */
const PATTERN_ICON: Record<string, string> = {
	up: 'player.pattern.up',
	down: 'player.pattern.down',
	'up/down': 'player.pattern.updown',
	'up/repeat/down': 'player.pattern.repeat',
	random: 'player.pattern.random',
	'play order': 'player.pattern.order'
};

/** The range ladder on the third card: two rails, four rungs, the octave count beside it. */
function ladder(ctx: ScreenCtx, range: number): void {
	const x = cardX(LAYOUT.arpeggio, 2);
	ctx.fillStyle = COLORS.ink;
	ctx.fillRect(x + 17.25, 27.3, 3, 36.1);
	ctx.fillRect(x + 31.75, 27.3, 3, 36.1);
	for (let i = 0; i < 4; i++) ctx.fillRect(x + 17.25, 32.5 + 7.7 * i, 17.5, 2);
	text(ctx, String(range), x + 39.5, 31.2, 10, COLORS.grey4);
}

/** The hand on the fourth card: pale while hold is off, filled in ink when it is on. */
function hand(ctx: ScreenCtx, layout: Layout, hold: boolean): void {
	pictogram(ctx, 'player.hand', cardX(layout, 3), hold ? COLORS.ink : COLORS.blue);
}

/**
 * The run: fourteen bars, one per note of the cycle (repeating), each an isometric prism standing
 * on the screen's bottom edge whose height is the note's rank among the run's pitches. Drawn left
 * to right, so each bar hides the side of the one before where it is taller.
 */
const BARS = { x: 172.5, pitch: 10, width: 10, floor: 220, top: 159.55, rank: 3.964, depth: 5 };

function prism(ctx: ScreenCtx, x: number, top: number, fill: string): void {
	const { width: w, depth: d, floor } = BARS;
	const faces = [
		[x, top, x + w, top, x + w, floor, x, floor],
		[x, top, x + d, top - d, x + w + d, top - d, x + w, top],
		[x + w, top, x + w + d, top - d, x + w + d, floor - d, x + w, floor]
	];
	for (const f of faces) {
		ctx.beginPath();
		ctx.moveTo(f[0], f[1]);
		for (let i = 2; i < f.length; i += 2) ctx.lineTo(f[i], f[i + 1]);
		ctx.closePath();
		ctx.fillStyle = fill;
		ctx.fill();
		ctx.strokeStyle = COLORS.blueEdge;
		ctx.lineWidth = 1;
		ctx.lineJoin = 'round';
		ctx.stroke();
	}
}

function runBars(ctx: ScreenCtx, run: readonly number[], at: number | null): void {
	if (run.length === 0) return;
	const high = Math.max(...run);
	// tall runs are squeezed under the name
	const rank = high > 0 ? Math.min(BARS.rank, (BARS.top - 104) / high) : BARS.rank;
	for (let i = 0; i < 14; i++) {
		const note = i % run.length;
		const top = BARS.top - rank * run[note];
		prism(ctx, BARS.x + BARS.pitch * i, top, at === note ? COLORS.white : COLORS.blue);
	}
}

/** The arpeggio page: speed, pattern, range and hold, or its shift layer. */
function drawArpeggio(ctx: ScreenCtx, frame: PlayerFrame): void {
	const a = frame.arp;
	if (!a) return;
	const layout = LAYOUT.arpeggio;
	cards(ctx, layout);
	if (frame.shift) {
		arpShiftCards(ctx, frame);
	} else {
		const speed = ARP_SPEEDS[a.speed] ?? ARP_SPEEDS[0];
		noteValue(ctx, speed.flags, speed.triplet, CARD_INK[0]);
		const pattern = PATTERN_ICON[ARP_PATTERNS[a.pattern]] ?? PATTERN_ICON.up;
		pictogram(ctx, pattern, cardX(layout, 1), CARD_INK[1]);
		ladder(ctx, a.range);
		hand(ctx, layout, a.hold);
		// the arrow: this page has a shift layer
		drawIcon(ctx, 'player.arrow', 347, 14, { tint: COLORS.white });
	}
	label(ctx, 'arpeggio');
	runBars(ctx, frame.run, frame.at);
}

/** Style pictograms: each style's order over five rising notes, as bars (ours; see sequencer.ts). */
const STYLE_ORDER: Record<string, readonly number[]> = {
	converge: [1, 5, 2, 4, 3],
	diverge: [3, 4, 2, 5, 1],
	pinky: [1, 5, 2, 5, 3, 5, 4],
	thumb: [1, 2, 1, 3, 1, 4, 1]
};

/**
 * The shift layer: note length as a tie under two notes (white as far as the length reaches),
 * style as "off" or bars, glide as a rising squiggle inked as far as the glide reaches, stereo as
 * two rings that part as it rises.
 */
function arpShiftCards(ctx: ScreenCtx, frame: PlayerFrame): void {
	const a = frame.arp;
	if (!a) return;
	const [x0, x1, x2, x3] = [0, 1, 2, 3].map((e) => cardX(LAYOUT.arpeggio, e));
	// length: two small quarter notes and the tie between them
	ctx.fillStyle = CARD_INK[0];
	glyph(ctx, 'lfo.note16', NOTE.stem, x0 + 6.9, 31.7, 0.42);
	glyph(ctx, 'lfo.note16', NOTE.stem, x0 + 35.9, 27.7, 0.42);
	const tie = (color: string) => {
		ctx.strokeStyle = color;
		ctx.lineWidth = 1.5;
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(x0 + 16.5, 57.7);
		ctx.quadraticCurveTo(x0 + 25, 61.3, x0 + 33.5, 58);
		ctx.stroke();
	};
	tie(COLORS.blue);
	ctx.save();
	ctx.beginPath();
	ctx.rect(x0 + 15.5, 50, 19 * (a.length / 99), 15);
	ctx.clip();
	tie(CARD_INK[0]);
	ctx.restore();

	// style
	const style = ARP_STYLES[a.style] ?? 'off';
	const order = STYLE_ORDER[style];
	if (!order) text(ctx, 'off', x1 + 24.5, 53.5, 20, CARD_INK[1], 'center', 0, true);
	else {
		order.forEach((level, i) => {
			const h = 3.5 * level;
			fillBox(ctx, x1 + 8 + 5 * i, 55 - h, 4, h, CARD_INK[1], 0.5);
		});
	}

	// glide: the squiggle, inked from the left as far as the glide goes
	pictogram(ctx, 'player.glide', x2, COLORS.blue);
	const reach = 38 * (a.glide / 99);
	if (reach > 0) pictogram(ctx, 'player.glide', x2, CARD_INK[2], { x: x2 + 6, w: reach });

	// stereo: the pale ring moves right, the inked one left
	const cx = x3 + 25;
	const spread = 8 * (a.stereo / 99);
	ring(ctx, cx + spread, 45.2, 13.2, COLORS.blue, 2);
	ring(ctx, cx - spread, 45.2, 13.2, CARD_INK[3], 2);
}

// ─────────────────────────────────────────────────────────────────────────── maestro

/**
 * Maestro's chord as two stacks of four slabs, filled from the back of the left stack to the front
 * of the right one: a slab stands for each stored note (flat where there is none), tall while the
 * chord sounds.
 */
const SLABS = {
	stacks: [160, 250],
	floor: 176.4,
	width: [35, 31.7],
	depth: [5, -5],
	step: [10, -9.9],
	tall: 39.6,
	short: 19.8
} as const;

function slab(ctx: ScreenCtx, x: number, y: number, h: number): void {
	const [ax, ay] = SLABS.width;
	const [bx, by] = SLABS.depth;
	const faces = [
		[x, y, x + ax, y + ay, x + ax, y + ay - h, x, y - h],
		[x + ax, y + ay, x + ax + bx, y + ay + by, x + ax + bx, y + ay + by - h, x + ax, y + ay - h],
		[x, y - h, x + ax, y + ay - h, x + ax + bx, y + ay + by - h, x + bx, y + by - h]
	];
	for (const f of faces) {
		ctx.beginPath();
		ctx.moveTo(f[0], f[1]);
		for (let i = 2; i < f.length; i += 2) ctx.lineTo(f[i], f[i + 1]);
		ctx.closePath();
		ctx.fillStyle = COLORS.blue;
		ctx.fill();
		ctx.strokeStyle = COLORS.blueEdge;
		ctx.lineWidth = 1;
		ctx.lineJoin = 'round';
		ctx.stroke();
	}
}

function slabs(ctx: ScreenCtx, notes: number, sounding: boolean): void {
	const h = sounding ? SLABS.tall : SLABS.short;
	SLABS.stacks.forEach((x0, stack) => {
		// back to front, so the front slabs cover the ones behind
		for (let k = 3; k >= 0; k--) {
			const slot = stack * 4 + (3 - k);
			const x = x0 + SLABS.step[0] * k;
			const y = SLABS.floor + SLABS.step[1] * k;
			slab(ctx, x, y, slot < notes ? h : 0);
		}
	});
}

/** The maestro page: roll, pattern, (no third job) and hold, over its chord. */
function drawMaestro(ctx: ScreenCtx, frame: PlayerFrame): void {
	const m = frame.maestro;
	if (!m) return;
	const layout = LAYOUT.maestro;
	cards(ctx, layout);
	pictogram(ctx, 'player.roll', cardX(layout, 0), CARD_INK[0]);
	text(ctx, String(m.roll), cardX(layout, 0) + 37.5, 34.7, 14, CARD_INK[0], 'left', 0, true);
	const pattern = PATTERN_ICON[MAESTRO_PATTERNS[m.pattern]] ?? PATTERN_ICON.up;
	pictogram(ctx, pattern, cardX(layout, 1), CARD_INK[1]);
	// the third encoder has no job here: its card is crossed out
	const x = cardX(layout, 2);
	ctx.save();
	ctx.beginPath();
	roundRectPath(ctx, x, CARD.y, CARD.size, CARD.size, CARD.radius);
	ctx.clip();
	line(ctx, x, CARD.y, x + CARD.size, CARD.y + CARD.size, CARD_INK[2], 1);
	line(ctx, x + CARD.size, CARD.y, x, CARD.y + CARD.size, CARD_INK[2], 1);
	ctx.restore();
	hand(ctx, layout, m.hold);
	label(ctx, 'maestro');
	slabs(ctx, m.notes, m.sounding);
}

// ─────────────────────────────────────────────────────────────────────────── hold

/**
 * Hold's infinity: two loops of eight lanes, 5.56 px each, from a 5.5 px hole to a 50 px rim. A
 * lane at radius r on the left loop is at 55.5 − r on the right, so the crossing lanes run at 45°;
 * the band falling to the right lies over the one rising to it.
 */
const RIBBON = { left: 200.25, right: 278.75, y: 121, inner: 5.5, outer: 50, lanes: 8 } as const;

function drawRibbon(ctx: ScreenCtx): void {
	const { left, right, y, inner, outer, lanes } = RIBBON;
	const sum = inner + outer;
	const q = Math.SQRT1_2;
	const radii = Array.from({ length: lanes + 1 }, (_, i) => inner + ((outer - inner) * i) / lanes);
	// where a lane leaves each loop: the falling band leaves the left loop up-right and meets the
	// right loop down-left; the rising band the other way round
	const falling = (r: number) => [
		left + r * q,
		y - r * q,
		right - (sum - r) * q,
		y + (sum - r) * q
	];
	const rising = (r: number) => [right - (sum - r) * q, y - (sum - r) * q, left + r * q, y + r * q];
	// the falling band reaches `e` into the loops at both ends, so it laps over their seams
	const stretch = (ends: number[], e: number) => [
		ends[0] - e * q,
		ends[1] - e * q,
		ends[2] + e * q,
		ends[3] + e * q
	];
	const band = (ends: (r: number) => number[], e = 0) => {
		const a = stretch(ends(inner), e);
		const b = stretch(ends(outer), e);
		ctx.moveTo(a[0], a[1]);
		ctx.lineTo(a[2], a[3]);
		ctx.lineTo(b[2], b[3]);
		ctx.lineTo(b[0], b[1]);
		ctx.closePath();
	};
	const sector = (cx: number, start: number, end: number) => {
		ctx.moveTo(cx + outer * Math.cos(start), y + outer * Math.sin(start));
		ctx.arc(cx, y, outer, start, end);
		ctx.arc(cx, y, inner, end, start, true);
		ctx.closePath();
	};
	const lanesOf = (ends: (r: number) => number[], e = 0) => {
		for (const r of radii.slice(1, -1)) {
			const [x0, y0, x1, y1] = stretch(ends(r), e);
			ctx.moveTo(x0, y0);
			ctx.lineTo(x1, y1);
		}
	};
	const arcs = (cx: number, start: number, end: number) => {
		for (const r of radii.slice(1, -1)) {
			ctx.moveTo(cx + r * Math.cos(start), y + r * Math.sin(start));
			ctx.arc(cx, y, r, start, end);
		}
	};
	const [leftStart, leftEnd] = [Math.PI / 4, (Math.PI * 7) / 4];
	const [rightStart, rightEnd] = [(Math.PI * 5) / 4, (Math.PI * 3) / 4];
	// the loops (three quarters of a ring each) and the rising band, in one fill so no seams show
	ctx.fillStyle = COLORS.blue;
	ctx.beginPath();
	sector(left, leftStart, leftEnd);
	sector(right, rightStart, rightEnd);
	band(rising);
	ctx.fill();
	ctx.strokeStyle = COLORS.blueEdge;
	ctx.lineWidth = 1;
	ctx.beginPath();
	arcs(left, leftStart, leftEnd);
	arcs(right, rightStart, rightEnd);
	lanesOf(rising);
	ctx.stroke();
	// the falling band over them
	ctx.beginPath();
	band(falling, 0.75);
	ctx.fill();
	ctx.beginPath();
	lanesOf(falling, 0.75);
	ctx.stroke();
}

function drawHold(ctx: ScreenCtx): void {
	text(ctx, 'hold', 239.5, 45.6, 20, COLORS.white, 'center', 0, true);
	drawRibbon(ctx);
}

// ─────────────────────────────────────────────────────────────────────────── list, off

/** `shift + player`: the track's number and "player"; the players, the current one boxed. */
function drawList(ctx: ScreenCtx, frame: PlayerFrame): void {
	if (!frame.list) return;
	text(ctx, String(frame.list.track), 4, 25.3, 20, COLORS.white, 'left', 0, true);
	text(ctx, 'player', 4, 45.3, 20, COLORS.white, 'left', 0, true);
	PLAYER_TYPES.forEach((type, i) => {
		const baseline = 25.3 + 20 * i;
		text(ctx, type, 111, baseline, 20, COLORS.white, 'left', 0, true);
		if (type === frame.type) {
			strokeBox(ctx, 105.25, baseline - 16.8, 125.25, 20.8, COLORS.white, 1.5, 2.5);
		}
	});
}

/** A player that is off: "off" in a black box over the page. */
function drawOff(ctx: ScreenCtx): void {
	fillBox(ctx, 210.5, 90.5, 60, 40, COLORS.black, 4);
	strokeBox(ctx, 210.5, 90.5, 60, 40, COLORS.white, 1.5, 4);
	text(ctx, 'off', 240.5, 121, 30, COLORS.white, 'center', 0, true);
}

/** The player page (or the list over it). */
export function drawPlayer(ctx: ScreenCtx, frame: PlayerFrame): void {
	if (frame.list) {
		drawList(ctx, frame);
		return;
	}
	ctx.save();
	if (!frame.on) ctx.globalAlpha = 0.4;
	if (frame.type === 'arpeggio') drawArpeggio(ctx, frame);
	else if (frame.type === 'maestro') drawMaestro(ctx, frame);
	else drawHold(ctx);
	ctx.restore();
	if (!frame.on) drawOff(ctx);
}
