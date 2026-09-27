/**
 * Draws a {@link ScreenFrame} onto a screen context in design pixels (480 × 220), clipped to the
 * display's rounded corners like TE's art, and describes it in words for screen readers.
 */
import { describeAreaFrame, drawAreaFrame } from './areas';
import type { ScreenCtx } from './context';
import { roundRectPath } from './draw';
import type { ScreenFrame } from './frame';
import { drawCom } from './pages/com';
import { drawDrum } from './pages/drum';
import { drawEnvelopes, drawPlayMode } from './pages/envelope';
import { drawFilter, drawSends } from './pages/filter';
import { drawLfo } from './pages/lfo';
import { drawList, drawMidi, drawText } from './pages/misc';
import { drawMix } from './pages/mix';
import { drawProject } from './pages/project';
import { drawSynth } from './pages/synth';
import { drawTempo } from './pages/tempo';
import { COLORS, SCREEN, SCREEN_CORNER_RADIUS } from './palette';

/** Options for {@link renderFrame}. */
export interface RenderOptions {
	/** Animation step for pages that move on their own (dissolve's noise). */
	readonly tick?: number;
}

/** Clears the screen to black and draws the frame inside the rounded display area. */
export function renderFrame(ctx: ScreenCtx, frame: ScreenFrame, options: RenderOptions = {}): void {
	ctx.save();
	ctx.fillStyle = COLORS.black;
	ctx.fillRect(0, 0, SCREEN.width, SCREEN.height);
	ctx.beginPath();
	roundRectPath(ctx, 0, 0, SCREEN.width, SCREEN.height, SCREEN_CORNER_RADIUS);
	ctx.clip();
	ctx.globalAlpha = 1;
	switch (frame.page) {
		case 'tempo':
			drawTempo(ctx, frame);
			break;
		case 'synth':
			drawSynth(ctx, frame, options.tick ?? 0);
			break;
		case 'drum':
			drawDrum(ctx, frame);
			break;
		case 'midi':
			drawMidi(ctx, frame);
			break;
		case 'envelope':
			drawEnvelopes(ctx, frame);
			break;
		case 'playmode':
			drawPlayMode(ctx, frame);
			break;
		case 'filter':
			drawFilter(ctx, frame);
			break;
		case 'sends':
			drawSends(ctx, frame);
			break;
		case 'lfo':
			drawLfo(ctx, frame);
			break;
		case 'mix':
			drawMix(ctx, frame);
			break;
		case 'project':
			drawProject(ctx, frame);
			break;
		case 'com':
			drawCom(ctx, frame);
			break;
		case 'list':
			drawList(ctx, frame);
			break;
		case 'text':
			drawText(ctx, frame);
			break;
		default:
			drawAreaFrame(ctx, frame, options);
	}
	ctx.restore();
}

const pct = (v: number) => `${Math.round(v * 100)}`;

/** A short spoken description of what the screen shows (for `aria-live`). */
export function describeFrame(frame: ScreenFrame): string {
	switch (frame.page) {
		case 'tempo':
			return `tempo ${frame.bpm} bpm, groove ${frame.groove}, metronome ${frame.metronome.on ? 'on' : 'off'}`;
		case 'synth':
			return `${frame.engine}: ${frame.header.map((c) => `${c.label} ${c.value}`).join(', ')}`;
		case 'drum':
			return `drum key ${frame.key}: tune ${frame.tune}, play mode ${frame.playMode}`;
		case 'midi':
			return `midi: channel ${frame.channel}, bank ${frame.bank ?? 'none'}, program ${frame.program}`;
		case 'envelope': {
			const e = frame.selected === 'amp' ? frame.amp : frame.filter;
			return `${frame.selected} envelope: attack ${pct(e.attack)}, decay ${pct(e.decay)}, sustain ${pct(e.sustain)}, release ${pct(e.release)}`;
		}
		case 'playmode':
			return `play mode ${frame.values[0]}, portamento ${frame.values[1]}, bend ${frame.values[2]}, volume ${frame.values[3]}`;
		case 'filter':
			return `${frame.type} filter: cutoff ${pct(frame.cutoff)}, resonance ${pct(frame.resonance)}`;
		case 'sends':
			return `sends: aux ${frame.values[0]}, tape ${frame.values[1]}, fx I ${frame.values[2]}, fx II ${frame.values[3]}`;
		case 'lfo':
			return `${frame.type} lfo: amount ${frame.amount}, destination ${frame.destination.label}`;
		case 'mix':
			return `mix, ${frame.bank} track ${frame.selected + 1}`;
		case 'project':
			return `project ${frame.name}`;
		case 'com':
			return `com: multi-out ${frame.multiOut}${frame.advertising ? ', bluetooth advertising' : ''}`;
		case 'list':
			return frame.columns
				.map((c) => (c.selected === null ? '' : c.items[c.selected]))
				.filter(Boolean)
				.join(', ');
		case 'text':
			return [frame.title, ...frame.lines].join(', ');
		default:
			return describeAreaFrame(frame);
	}
}
