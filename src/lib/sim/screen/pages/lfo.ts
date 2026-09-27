/**
 * M4 (LFO), guide art instrument-052 … 093. White cards labelled in 10 px above them, each with its
 * encoder's dot: speed (a clock dial when free, a note and count when synced), amount (a ruler and
 * pointer), destination (a window onto the module list, the chosen one in the middle), and the
 * parameter card (a knob on a curve). Value, random, tremolo, duck and element follow TE's layouts.
 */
import type { ScreenCtx } from '../context';
import { amountRuler, card as plainCard, disc, encoderDot, line, strokeBox, text } from '../draw';
import type { LfoFrame } from '../frame';
import { drawIcon } from '../icons';
import { COLORS } from '../palette';

/** LFO cards carry TE's ink outline, which shows as a seam where cards touch. */
const card = (ctx: ScreenCtx, x: number, y: number, w: number, h: number) =>
	plainCard(ctx, x, y, w, h, COLORS.white, true);

/** Icons of the destination modules. */
const DEST_ICON: Record<string, string> = {
	syn: 'lfo.wave.syn',
	env: 'lfo.env',
	filter: 'lfo.filter',
	lfo: 'lfo.pulse'
};

/** The modules an LFO can reach. */
const MODULES = ['syn', 'env', 'filter', 'lfo'] as const;

/**
 * The destination list of value and random: each module followed by its free-running twin (the
 * manual: every page appears twice, normal and free).
 */
export const DESTINATIONS: readonly { readonly module: string; readonly free: boolean }[] =
	MODULES.flatMap((module) => [
		{ module, free: false },
		{ module, free: true }
	]);

/** Element follows a sensor, so nothing retriggers: its list has no free twins. */
export const SENSOR_DESTINATIONS: readonly { readonly module: string; readonly free: boolean }[] =
	MODULES.map((module) => ({ module, free: false }));

/**
 * Element's art draws the modules with other pictograms (a pulse for syn, an ADSR for env), centred
 * and unnamed; only the filter card keeps its name under the icon. We follow the art.
 */
const SENSOR_CARDS: Record<string, { icon: string; dx: number; dy: number; named: boolean }> = {
	syn: { icon: 'lfo.pulse', dx: 8, dy: 18, named: false },
	env: { icon: 'lfo.adsr', dx: 7, dy: 18, named: false },
	filter: { icon: 'lfo.filter', dx: 12, dy: 8, named: true },
	lfo: { icon: 'lfo.pulse', dx: 8, dy: 9, named: true }
};

/** The speed card: free = a dial whose hand turns; synced = a sixteenth note and the count. */
function speedCard(ctx: ScreenCtx, frame: LfoFrame, x: number, y: number): void {
	card(ctx, x, y, 120, 120);
	encoderDot(ctx, 0, x + 6, y + 5);
	if (frame.speed.synced) {
		if (frame.type === 'random') drawIcon(ctx, 'lfo.triplet', x + 35, y + 30);
		else drawIcon(ctx, 'lfo.note16', x + 46, y + 30);
		text(ctx, frame.speed.label, x + 115, y + 20, 20, COLORS.ink, 'right');
	} else {
		const cx = x + 61;
		const cy = y + 61;
		disc(ctx, cx, cy, 25, COLORS.ink);
		for (let i = 0; i < 12; i++) {
			const a = (i / 12) * Math.PI * 2;
			line(
				ctx,
				cx + Math.sin(a) * 18,
				cy - Math.cos(a) * 18,
				cx + Math.sin(a) * 23,
				cy - Math.cos(a) * 23,
				COLORS.white,
				1.6
			);
		}
		const hand = (-0.4 + 0.8 * Math.max(0, Math.min(1, frame.speed.position))) * Math.PI * 2;
		ctx.lineCap = 'round';
		line(ctx, cx, cy, cx + Math.sin(hand) * 15, cy - Math.cos(hand) * 15, COLORS.white, 2.2);
	}
	if (frame.type !== 'random' && frame.type !== 'element') return;
	// the speed's place along its range: a rule with a gap
	const gap = x + 5 + 105 * Math.max(0, Math.min(1, frame.speed.position));
	line(ctx, x + 5, y + 115, x + 115, y + 115, COLORS.ink, 1.12);
	line(ctx, gap, y + 115, gap + 5, y + 115, COLORS.white, 1.5);
}

/** A 60 × 60 destination card with its icon and name (element's cards as its art draws them). */
function destCard(
	ctx: ScreenCtx,
	label: string,
	module: string,
	x: number,
	y: number,
	sensor = false
): void {
	card(ctx, x, y, 60, 60);
	const own = sensor ? SENSOR_CARDS[module] : undefined;
	if (own) {
		drawIcon(ctx, own.icon, x + own.dx, y + own.dy);
		if (own.named) text(ctx, label, x + 30, y + 51.4, 20, COLORS.ink, 'center');
		return;
	}
	const icon = DEST_ICON[module];
	if (icon) drawIcon(ctx, icon, x + 13, y + 9);
	text(ctx, label, x + 30, y + 50, 20, COLORS.ink, 'center');
}

/**
 * Element's source card: the sensor's letter in a black disc, and the rule whose gap marks where
 * that sensor sits among the four (ours: TE's art shows the gyroscope with the gap near the left).
 */
function sensorCard(ctx: ScreenCtx, frame: LfoFrame, x: number, y: number): void {
	card(ctx, x, y, 120, 120);
	encoderDot(ctx, 0, x + 5, y + 5);
	disc(ctx, x + 60, y + 60, 25, COLORS.ink);
	text(ctx, frame.source ?? 'G', x + 59.5, y + 74.6, 40, COLORS.white, 'center');
	const at = frame.sourceAt ?? frame.speed.position;
	const gap = x + 5 + 105 * Math.max(0, Math.min(1, at));
	line(ctx, x + 5, y + 115, x + 115, y + 115, COLORS.ink, 1.12);
	line(ctx, gap, y + 115, gap + 5, y + 115, COLORS.white, 1.5);
}

/**
 * An envelope's ramp in its 60 × 60 card at (x, y): random's env card, tremolo's mode card. TE
 * draws a fade-in as a line across the card (envelope 1); ours for the rest: a shorter fade rises
 * to the top sooner (straight up at 0, no fade), a fade-out holds the top and falls at the end.
 */
function envelopeRamp(ctx: ScreenCtx, x: number, y: number, envelope: number): void {
	const e = Math.max(-1, Math.min(1, envelope));
	const [left, right, top, bottom] = [x + 10, x + 50, y + 10, y + 50];
	const run = 40 * Math.abs(e);
	const points =
		e >= 0
			? [
					[left, bottom],
					[left + run, top],
					[right, top]
				]
			: [
					[left, top],
					[right - run, top],
					[right, bottom]
				];
	// a full fade is one straight line: drop the corner that meets an end
	const path = points.filter(
		([px, py], i) => i === 0 || px !== points[i - 1][0] || py !== points[i - 1][1]
	);
	ctx.strokeStyle = COLORS.ink;
	ctx.lineWidth = 1.67;
	ctx.lineCap = 'butt';
	ctx.lineJoin = 'miter';
	ctx.beginPath();
	path.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
	ctx.stroke();
}

/** Draws the LFO page. */
export function drawLfo(ctx: ScreenCtx, frame: LfoFrame): void {
	if (frame.type === 'tremolo') {
		drawTremolo(ctx, frame);
		return;
	}
	if (frame.type === 'duck') {
		drawDuck(ctx, frame);
		return;
	}
	const random = frame.type === 'random';
	const element = frame.type === 'element';
	// value: speed 55, amount 175, destination column 235, parameter 295; random and element sit
	// 5 px further right, random stacks only its destination and envelope cards
	const dx = random || element ? 5 : 0;
	text(ctx, element ? 'source' : 'speed', 60 + dx, 45, 10, COLORS.white);
	if (element) sensorCard(ctx, frame, 55 + dx, 50);
	else speedCard(ctx, frame, 55 + dx, 50);

	text(ctx, 'amount', 180 + dx, 45, 10, COLORS.white);
	card(ctx, 175 + dx, 50, 60, 120);
	encoderDot(ctx, 1, 180 + dx, 55);
	amountRuler(ctx, 220 + dx, 55, 165, frame.amount);

	const module = frame.destination.label;
	const shown = frame.destination.free ? 'free' : module;
	if (random) {
		text(ctx, 'dest', 245, 45, 10, COLORS.white);
		destCard(ctx, shown, module, 240, 50);
		encoderDot(ctx, 2, 245, 55);
		card(ctx, 240, 110, 60, 60);
		envelopeRamp(ctx, 240, 110, frame.envelope ?? 1);
		text(ctx, 'env', 245.5, 182.5, 10, COLORS.white);
	} else {
		text(ctx, 'dest', 240 + dx, 15, 10, COLORS.white);
		const list = element ? SENSOR_DESTINATIONS : DESTINATIONS;
		const at = Math.max(
			0,
			list.findIndex((d) => d.module === module && d.free === frame.destination.free)
		);
		const n = list.length;
		[-1, 0, 1].forEach((offset, row) => {
			const d = list[(at + offset + n) % n];
			destCard(ctx, d.free ? 'free' : d.module, d.module, 235 + dx, 20 + 60 * row, element);
		});
		encoderDot(ctx, 2, 240 + dx, 85);
	}

	const px = 295 + dx;
	text(ctx, element ? 'mode' : frame.fourth, px + 5, 45, 10, COLORS.white);
	card(ctx, px, 50, 120, 120);
	if (element) {
		// the motion curve and its knob (TE's picture)
		drawIcon(ctx, 'lfo.mode', px + 5, 52);
		encoderDot(ctx, 3, px + 5, 55);
		return;
	}
	drawIcon(ctx, 'lfo.knob', px + 9, 54, random ? { colors: { '#96969b': COLORS.grey3 } } : {});
	// the knob's cap takes the colour of the destination parameter's encoder
	const cap = ['#0f0e12', '#484850', '#96969b', COLORS.white][frame.parameter] ?? '#96969b';
	ctx.save();
	ctx.translate(px + 60, 50 + 42.45);
	ctx.scale(1, 7.55 / 9.7);
	disc(ctx, 0, 0, 9.7, cap);
	ctx.restore();
	encoderDot(ctx, 3, px + 5, 55);
}

/** A duck card: white with a thin black edge (TE draws duck's cards lighter than value's). */
function thinCard(ctx: ScreenCtx, x: number, y: number, w: number, h: number): void {
	plainCard(ctx, x, y, w, h, COLORS.white);
	strokeBox(ctx, x, y, w, h, COLORS.black, 1.12, 5);
}

/**
 * Duck (instrument-052): the trigger track ("tr 4", or the metronome) with its source type (audio
 * or notes), the amount, the signal it follows, and hold and release (TE's pictograms: the cards do
 * not show their values).
 */
function drawDuck(ctx: ScreenCtx, frame: LfoFrame): void {
	text(ctx, 'source', 95, 45, 10, COLORS.white);
	thinCard(ctx, 90, 50, 120, 120);
	encoderDot(ctx, 0, 95, 55);
	if (frame.source === 'metronome') {
		// ours: TE's art shows a track; the metronome gets the tempo page's pictogram
		drawIcon(ctx, 'tempo.metronome', 127, 60, { scale: 0.5, tint: COLORS.ink });
	} else {
		text(ctx, 'tr', 138.5, 95, 10, COLORS.ink);
		text(ctx, frame.source ?? '1', 150, 127.4, 40, COLORS.ink, 'center');
	}
	// the source type: the chosen one black, the other grey
	const audio = frame.sourceAudio ?? true;
	drawIcon(ctx, 'lfo.duck.source', 100, 147, {
		colors: audio ? {} : { '#000000': '#afafb4', '#afafb4': '#000000' }
	});

	text(ctx, 'amount', 215, 45, 10, COLORS.white);
	thinCard(ctx, 210, 50, 60, 120);
	encoderDot(ctx, 1, 215, 55);
	amountRuler(ctx, 255, 55, 165, frame.amount);

	// the signal: a black card edged in white
	strokeBox(ctx, 271.5, 50.9, 117.4, 57.6, COLORS.white, 1.12, 4.8);
	text(ctx, 'signal', 275, 62.8, 10, COLORS.white);
	drawIcon(ctx, 'lfo.signal', 270, 70);

	thinCard(ctx, 270, 110, 60, 60);
	encoderDot(ctx, 2, 275, 115);
	line(ctx, 283.4, 157.4, 316.6, 126.6, COLORS.ink, 1.67);
	text(ctx, 'hold', 275, 182.5, 10, COLORS.white);

	thinCard(ctx, 330, 110, 60, 60);
	encoderDot(ctx, 3, 335, 115);
	line(ctx, 343.4, 126.6, 376.6, 157.4, COLORS.ink, 1.67);
	text(ctx, 'release', 335, 182.5, 10, COLORS.white);
}

/**
 * Tremolo (instrument-082): source, vibrato and volume rulers, the mode card (the envelope's ramp)
 * and the shape card (TE's saw whatever the shape: no art shows another).
 */
function drawTremolo(ctx: ScreenCtx, frame: LfoFrame): void {
	text(ctx, 'source', 95, 45, 10, COLORS.white);
	speedCard(ctx, frame, 90, 50);

	text(ctx, 'vib', 215, 45, 10, COLORS.white);
	card(ctx, 210, 50, 60, 120);
	encoderDot(ctx, 1, 215, 55);
	amountRuler(ctx, 255, 55, 165, frame.amount);

	text(ctx, 'vol', 275, 45, 10, COLORS.white);
	card(ctx, 270, 50, 60, 120);
	encoderDot(ctx, 2, 275, 55);
	amountRuler(ctx, 315, 55, 165, frame.volume);

	// the mode card is the envelope E4 turns (manual: lfo-tremolo); TE's art labels it "mode"
	text(ctx, 'mode', 335, 45, 10, COLORS.white);
	card(ctx, 330, 50, 60, 60);
	envelopeRamp(ctx, 330, 50, frame.envelope ?? 1);
	encoderDot(ctx, 3, 335, 55);
	card(ctx, 330, 110, 60, 60);
	drawIcon(ctx, 'lfo.saw', 338, 118);
	text(ctx, 'shape', 335, 182.5, 10, COLORS.white);
}
