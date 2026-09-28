/**
 * A synth engine's M1 page: the eight-cell header with the four parameters, and under it the
 * engine's picture as the device draws it, each measured off the owner's unit by camera
 * (docs/research/59-screen-profiling.md §2.5) in its own module under `engines/`. An engine without
 * one falls back to TE's guide drawing (synth-engines-007 … 084).
 */
import type { ScreenCtx } from '../context';
import { header } from '../draw';
import type { SynthFrame } from '../frame';
import { ICONS, drawIcon } from '../icons';
import { drawAxis } from './engines/axis';
import { drawDissolve } from './engines/dissolve';
import { drawEpiano } from './engines/epiano';
import { drawHardsync } from './engines/hardsync';
import { drawOrgan } from './engines/organ';
import { drawPrism } from './engines/prism';
import { drawSimple } from './engines/simple';
import { drawWavetable } from './engines/wavetable';

/** Pictures rebuilt from the device, by engine. */
const PICTURES: Readonly<
	Record<string, (ctx: ScreenCtx, frame: SynthFrame, tick: number) => void>
> = {
	axis: drawAxis,
	dissolve: drawDissolve,
	epiano: drawEpiano,
	hardsync: drawHardsync,
	organ: drawOrgan,
	prism: drawPrism,
	simple: drawSimple,
	wavetable: drawWavetable
};

/** Draws a synth engine's M1 page (`tick`: the screen's animation step, when the frame has no clock). */
export function drawSynth(ctx: ScreenCtx, frame: SynthFrame, tick = 0): void {
	const picture = PICTURES[frame.engine];
	const art = `engine.${frame.engine}`;
	if (picture) picture(ctx, frame, tick);
	else if (art in ICONS) drawIcon(ctx, art, -1, 20.5);
	if (NO_HEADER.has(frame.engine)) return;
	header(ctx, frame.header, PLAIN_HEADERS.has(frame.engine) ? 'plain' : 'ramp');
}

/** Engines whose page has no top bar at all: organ's drawbars run up to the edge (research 59 §2.5). */
const NO_HEADER: ReadonlySet<string> = new Set(['organ']);

/** Engines whose top bar the device draws without the grey cells (research 59 §2.5). */
const PLAIN_HEADERS: ReadonlySet<string> = new Set(['simple', 'axis']);
