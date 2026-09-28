/**
 * Draws a {@link ScreenFrame} onto a screen context in design pixels (480 × 220), clipped to the
 * display's rounded corners like TE's art, and describes it in words for screen readers.
 */
import { describeAreaFrame, drawAreaFrame } from './areas';
import type { ScreenCtx } from './context';
import { fillBox, roundRectPath, strokeBox, text } from './draw';
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
import { two } from '../params';

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
			dimmedIfOff(ctx, frame.off, () => drawFilter(ctx, frame));
			break;
		case 'sends':
			drawSends(ctx, frame);
			break;
		case 'lfo':
			dimmedIfOff(ctx, frame.off, () => drawLfo(ctx, frame, options.tick ?? 0));
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

/** A 0–1 view of a 0–99 lane as the device writes the lane ("00"…"99"), the number a lock shows. */
const lane = (v: number) => two(v * 99);

/** The sampler engines' M1 page (the drum frame): what the key, the root or the zone holds. */
function describeSampler(frame: Extract<ScreenFrame, { page: 'drum' }>): string {
	const engine = frame.sampler?.engine ?? 'drum';
	const layer = frame.shift ? ' (shift)' : '';
	const empty = frame.sampler && !frame.sampler.waves ? ', empty' : '';
	if (engine === 'sampler') {
		return `sampler, root ${frame.sampler?.root}${layer}: tune ${frame.tune}${empty}`;
	}
	if (engine === 'multisampler') {
		return `multisampler zone ${frame.key}${layer}: tune ${frame.tune}${empty}`;
	}
	return `drum key ${frame.key}${layer}: tune ${frame.tune}, play mode ${frame.playMode}${empty}`;
}

/**
 * A module switched off (the filter, the LFO) as the device shows it: the page at 40 % under "off"
 * in a black box, the same box as a player that is off (research 59 §2.3, §2.7).
 */
function dimmedIfOff(ctx: ScreenCtx, off: boolean | undefined, draw: () => void): void {
	if (!off) {
		draw();
		return;
	}
	ctx.save();
	ctx.globalAlpha = 0.4;
	draw();
	ctx.restore();
	fillBox(ctx, 210.5, 90.5, 60, 40, COLORS.black, 4);
	strokeBox(ctx, 210.5, 90.5, 60, 40, COLORS.white, 1.5, 4);
	text(ctx, 'off', 240.5, 121, 30, COLORS.white, 'center', 0, true);
}

/** A short spoken description of what the screen shows (for `aria-live`). */
export function describeFrame(frame: ScreenFrame): string {
	switch (frame.page) {
		case 'tempo':
			return `tempo ${frame.bpm} bpm, groove ${frame.groove}, metronome ${frame.metronome.on ? 'on' : 'off'}`;
		case 'synth':
			return `${frame.engine}: ${frame.header.map((c) => `${c.label} ${c.value}`.trim()).join(', ')}`;
		case 'drum':
			return describeSampler(frame);
		case 'midi':
			return `midi: channel ${frame.channel}, bank ${frame.bank ?? 'none'}, program ${frame.program}`;
		case 'envelope': {
			const e = frame.selected === 'amp' ? frame.amp : frame.filter;
			return `${frame.selected} envelope: attack ${lane(e.attack)}, decay ${lane(e.decay)}, sustain ${lane(e.sustain)}, release ${lane(e.release)}`;
		}
		case 'playmode':
			return `play mode ${frame.values[0]}, portamento ${frame.values[1]}, bend ${frame.values[2]}, volume ${frame.values[3]}`;
		case 'filter':
			return `${frame.type} filter${frame.off ? ' off' : ''}: cutoff ${lane(frame.cutoff)}, resonance ${lane(frame.resonance)}`;
		case 'sends':
			return `sends: aux ${frame.values[0]}, tape ${frame.values[1]}, fx I ${frame.values[2]}, fx II ${frame.values[3]}`;
		case 'lfo':
			if (frame.type === 'duck') {
				const kind = frame.sourceAudio === false ? 'notes' : 'audio';
				return `duck lfo${frame.off ? ' off' : ''}: source ${frame.source} (${kind}), amount ${Math.round(frame.amount)}`;
			}
			return (
				`${frame.type} lfo${frame.off ? ' off' : ''}: ` +
				(frame.type === 'element' ? `source ${frame.source}, ` : '') +
				`amount ${Math.round(frame.amount)}, destination ${frame.destination.label}`
			);
		case 'mix': {
			// the selected strip's values, which the page draws as a level bar and a pan dot and never
			// as numbers: level on its 0–99 lane, pan −100…100
			const strip = frame.strips[frame.selected];
			const values = strip
				? `: level ${Math.round(strip.level * 99)}, pan ${Math.round(strip.pan * 100)}${strip.muted ? ', muted' : ''}`
				: '';
			return `mix, ${frame.bank} track ${frame.selected + 1}${values}`;
		}
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
