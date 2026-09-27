/**
 * The two send effects. A new project loads delay on FX I and reverb on FX II (`TRACKS` in
 * `$lib/core/opxy`, from decoded project files), and those are the two we build: a tempo-synced
 * ping-pong delay whose repeats darken as they fade, and a convolution reverb on a synthesized
 * impulse (a medium hall, about 2.2 s). Their M1 parameters are not in the simulator yet, so each
 * runs one tasteful setting. Chorus, distortion, lofi and phaser are not built; a slot holding one
 * returns nothing rather than pretending.
 */
import type { FxEngineId } from '$lib/core/opxy';
import type { Resources } from './resources';

/** A send effect: tracks feed `input`, `output` returns to the mix. */
export interface SendEffect {
	readonly kind: FxEngineId;
	readonly input: AudioNode;
	readonly output: AudioNode;
	/** Follows the tempo (the delay's repeats are in sixteenths). */
	setTempo(bpm: number, time: number): void;
}

/** The delay's repeat spacing in sixteenths: a dotted eighth. */
export const DELAY_SIXTEENTHS = 3;
/** How much of each repeat comes back. */
const FEEDBACK = 0.38;

/** A ping-pong delay: left, then right, then left again, each repeat a little darker. */
function delay(context: BaseAudioContext, bpm: number): SendEffect {
	const input = context.createGain();
	// everything that is sent is summed to mono first, so the repeats bounce evenly
	input.channelCount = 1;
	input.channelCountMode = 'explicit';
	const seconds = (tempo: number) => Math.min(1.9, (DELAY_SIXTEENTHS * 15) / tempo);
	const left = context.createDelay(2);
	const right = context.createDelay(2);
	left.delayTime.value = seconds(bpm);
	right.delayTime.value = seconds(bpm);
	const feedback = context.createGain();
	feedback.gain.value = FEEDBACK;
	const lowCut = context.createBiquadFilter();
	lowCut.type = 'highpass';
	lowCut.frequency.value = 180;
	const highCut = context.createBiquadFilter();
	highCut.type = 'lowpass';
	highCut.frequency.value = 3200;
	const merge = context.createChannelMerger(2);
	const output = context.createGain();
	output.gain.value = 0.7;
	input.connect(left);
	left.connect(merge, 0, 0);
	left.connect(right);
	right.connect(merge, 0, 1);
	right.connect(feedback);
	feedback.connect(lowCut);
	lowCut.connect(highCut);
	highCut.connect(left);
	merge.connect(output);
	return {
		kind: 'delay',
		input,
		output,
		setTempo(tempo, time) {
			// a short glide, like tape: the repeats bend into the new tempo instead of clicking
			for (const d of [left, right]) d.delayTime.setTargetAtTime(seconds(tempo), time, 0.05);
		}
	};
}

/** A convolution reverb on the synthesized hall impulse. */
function reverb(context: BaseAudioContext, resources: Resources): SendEffect {
	const input = context.createGain();
	// take a little of the top off what goes in: a softer, less splashy tail
	const tone = context.createBiquadFilter();
	tone.type = 'lowpass';
	tone.frequency.value = 7000;
	const convolver = context.createConvolver();
	convolver.buffer = resources.impulse;
	const output = context.createGain();
	output.gain.value = 0.9;
	input.connect(tone);
	tone.connect(convolver);
	convolver.connect(output);
	return { kind: 'reverb', input, output, setTempo() {} };
}

/** Whatever is loaded but not built: takes the send and returns silence. */
function silent(context: BaseAudioContext, kind: FxEngineId): SendEffect {
	const input = context.createGain();
	const output = context.createGain();
	return { kind, input, output, setTempo() {} };
}

/** Builds the effect `kind` for a slot. */
export function createEffect(
	kind: FxEngineId,
	context: BaseAudioContext,
	resources: Resources,
	bpm: number
): SendEffect {
	if (kind === 'delay') return delay(context, bpm);
	if (kind === 'reverb') return reverb(context, resources);
	return silent(context, kind);
}
