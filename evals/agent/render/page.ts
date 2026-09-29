/**
 * The eval's ears, the browser half (headless Chromium, driven by `render/index.ts`): renders what
 * the replica plays from a simulator state through the app's own sound — the synth core in its
 * worklet, the drum kits (the agent's own made kits included), the channel strips, FX I and II,
 * the punch-in processor and the metronome — offline, from the transport's position, and hands
 * back the master bus, which is where the app's listening taps the replica.
 *
 * The scheduler is ticked once over the whole window, so everything due in it is laid down before
 * rendering starts; the scenes do not move on (the simulator in Node does not run its clock), which
 * a few seconds of listening rarely reaches.
 */
import { restore } from '$lib/sim/areas/system/projects';
import { defaultState } from '$lib/sim/params';
import {
	CORE_ENGINES,
	PunchHost,
	Scheduler,
	SoundEngine,
	SynthHost,
	punchWorklet,
	synthWorklet
} from '$lib/sound/runtime';
import { SampleRegistry } from '$lib/sound/samples';
import { fromBase64, toBase64, type RenderReply, type RenderRequest } from './protocol';

/** Silence before the first note, so the worklets' messages arrive before they are needed (s). */
const LEAD = 0.25;

async function render(request: RenderRequest): Promise<RenderReply> {
	const state = defaultState();
	restore(state, request.project, 'eval');
	state.transport = { ...request.transport };
	state.track = request.track;
	state.mode = request.mode;
	const samples = new SampleRegistry();
	for (const file of request.files) {
		samples.setFile(file.id, {
			sampleRate: file.sampleRate,
			channels: file.channels.map(fromBase64)
		});
	}
	const sampleRate = request.sampleRate;
	const context = new OfflineAudioContext(
		2,
		Math.round(sampleRate * (LEAD + request.seconds)),
		sampleRate
	);
	const master = context.createGain();
	master.connect(context.destination);
	const engine = new SoundEngine({ context, samples, destination: master });
	const synth = await SynthHost.create(context, synthWorklet);
	if (synth) engine.useSynth(synth, CORE_ENGINES);
	const punch = await PunchHost.create(context, punchWorklet);
	if (punch) engine.usePunch(punch, 0);
	engine.sync(state, 0);
	const scheduler = new Scheduler({ state: () => state, now: () => LEAD, sink: engine.sink });
	scheduler.tick(request.seconds);
	// an offline context renders faster than the worklets' ports deliver
	await new Promise((resolve) => setTimeout(resolve, 150));
	const buffer = await context.startRendering();
	engine.dispose();
	synth?.dispose();
	punch?.dispose();
	const skip = Math.round(sampleRate * LEAD);
	return {
		sampleRate,
		channels: [0, 1].map((c) => toBase64(buffer.getChannelData(c).slice(skip)))
	};
}

declare global {
	interface Window {
		renderReplica?: typeof render;
	}
}

window.renderReplica = render;
