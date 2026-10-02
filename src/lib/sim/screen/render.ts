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

/**
 * An LFO's envelope as the agent reads it: −99…99 from steady at 0, "fades in" below and "fades
 * out" above (the manual counts 64 steady on its 0–127 scale; an agent could not tell the sign).
 */
function envelopeText(envelope: number | undefined): string {
	if (envelope === undefined) return '';
	const v = Math.round(envelope * 99);
	// a few either side of 0 is steady still (a preset's −2)
	return `, envelope ${v}${v <= -5 ? ' (fades in)' : v >= 5 ? ' (fades out)' : ''}`;
}

/** A short spoken description of what the screen shows (for `aria-live`). */
export function describeFrame(frame: ScreenFrame): string {
	switch (frame.page) {
		case 'tempo': {
			// the swing and the metronome's level are drawn (a slider's thumb, speaker waves), never
			// written; said here on their lanes, so a reader can tell where they stand (an agent set
			// a swing it could not see)
			const level = Math.round(frame.metronome.level * 99);
			const metronome = frame.metronome.on ? `on at level ${level}` : 'off';
			return `tempo ${frame.bpm} bpm, groove ${frame.groove}, swing ${Math.round(frame.swing * 99)}, metronome ${metronome}`;
		}
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
			// the envelope amount and key tracking as their lanes read: the page draws them as the
			// curve's hatched ghost and the arrow (an agent described E3 and E4 without their values)
			return `${frame.type} filter${frame.off ? ' off' : ''}: cutoff ${lane(frame.cutoff)}, resonance ${lane(frame.resonance)}, envelope amount ${lane(frame.envAmount)}, key tracking ${lane(frame.keyTracking)}`;
		case 'sends':
			return `sends: aux ${frame.values[0]}, tape ${frame.values[1]}, fx I ${frame.values[2]}, fx II ${frame.values[3]}`;
		case 'lfo':
			if (frame.type === 'duck') {
				const kind = frame.sourceAudio === false ? 'notes' : 'audio';
				// hold and release are drawn as the pulse's length and knee: read on their 0–99 lanes
				const shape =
					frame.hold === undefined || frame.release === undefined
						? ''
						: `, hold ${Math.round(frame.hold * 99)}, release ${Math.round(frame.release * 99)}`;
				return `duck lfo${frame.off ? ' off' : ''}: source ${frame.source} (${kind}), amount ${Math.round(frame.amount)}${shape}`;
			}
			if (frame.type === 'tremolo') {
				// wired to pitch and volume, with no destination card: its four values as the page
				// names them (a generic reading once gave it a destination it does not have)
				const speed = frame.speed.synced
					? `sync ${frame.speed.label}`
					: `free ${Math.round(frame.speed.position * 99)}`;
				const envelope = envelopeText(frame.envelope);
				return `tremolo lfo${frame.off ? ' off' : ''}: speed ${speed}, amount ${Math.round(frame.amount)} (pitch), volume ${Math.round(frame.volume)}${envelope}`;
			}
			return (
				`${frame.type} lfo${frame.off ? ' off' : ''}: ` +
				(frame.type === 'element' ? `source ${frame.source}, ` : '') +
				// the speed: a count of sixteenths when synced to the tempo ("sync 32", as the key planner
				// takes it: a bare 32 was read as the free dial's), else the free dial (drawn, on its lane)
				`speed ${frame.speed.synced ? `sync ${frame.speed.label}` : `free ${Math.round(frame.speed.position * 99)}`}, ` +
				`amount ${Math.round(frame.amount)}, destination ${frame.destination.label}` +
				(frame.type === 'random' ? envelopeText(frame.envelope) : '')
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
