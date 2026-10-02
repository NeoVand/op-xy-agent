/**
 * The replica's sound, rendered offline: what a saved project plays from its transport's position,
 * through the app's own engine (the synth core in its worklet, the drum kits and sample files, the
 * channel strips, FX I and II, the punch-in processor, the metronome), into an
 * `OfflineAudioContext`, as fast as the machine renders. The lab listens to its forks with it, and
 * the eval's ears render the agent's work with it in headless Chromium. Browser only.
 *
 * The scheduler is ticked once over the whole window, so everything due in it is laid down before
 * rendering starts; the scenes do not move on while it renders (nothing runs the simulator's
 * clock), which a few seconds of listening rarely reaches.
 */
import { restore } from '$lib/sim/areas/system/projects';
import { defaultState, type SimState } from '$lib/sim/params';
import {
	CORE_ENGINES,
	PunchHost,
	Scheduler,
	SoundEngine,
	SynthHost,
	punchWorklet,
	synthWorklet
} from './runtime';
import type { SampleRegistry } from './samples';
import type { SchedulerSink } from './scheduler';

/** What to render. */
export interface OfflineRender {
	/** The project (`snapshot(state)`: tracks, aux, tempo, patterns, scenes, songs, mixer…). */
	readonly project: string;
	readonly transport: SimState['transport'];
	/** The active track and mode (the arpeggio and a few others read them). */
	readonly track: number;
	readonly mode: SimState['mode'];
	readonly seconds: number;
	/**
	 * The seconds whose notes play (default all of them): after it the sound only rings out, so a
	 * scene rendered with a tail does not start over in it.
	 */
	readonly notes?: number;
	readonly sampleRate: number;
}

/** The master bus, where the app's listening taps it (before the volume knob). */
export interface OfflineAudio {
	readonly sampleRate: number;
	readonly channels: Float32Array[];
}

/** Silence before the first note, so the worklets' messages arrive before they are needed (s). */
const LEAD = 0.25;

/** Renders what the replica plays from `request`, with the audio of `samples`' files. */
export async function renderOffline(
	request: OfflineRender,
	samples: SampleRegistry
): Promise<OfflineAudio> {
	const state = defaultState();
	restore(state, request.project, 'offline');
	state.transport = { ...request.transport };
	state.track = request.track;
	state.mode = request.mode;
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
	try {
		engine.sync(state, 0);
		// notes (and clicks) starting after `notes` are dropped at the sink: the scheduler lays a
		// step down half a step early for its groove, so its lookahead alone let the next one in
		const end = request.notes === undefined ? Infinity : LEAD + request.notes;
		const sink: SchedulerSink = {
			...engine.sink,
			note: (event, settings) => {
				if (event.time < end) engine.sink.note(event, settings);
			},
			click: (event) => {
				if (event.time < end) engine.sink.click(event);
			}
		};
		const scheduler = new Scheduler({ state: () => state, now: () => LEAD, sink });
		scheduler.tick(request.seconds);
		// an offline context renders faster than the worklets' ports deliver
		await new Promise((resolve) => setTimeout(resolve, 150));
		const buffer = await context.startRendering();
		const skip = Math.round(sampleRate * LEAD);
		return { sampleRate, channels: [0, 1].map((c) => buffer.getChannelData(c).slice(skip)) };
	} finally {
		engine.dispose();
		synth?.dispose();
		punch?.dispose();
	}
}
