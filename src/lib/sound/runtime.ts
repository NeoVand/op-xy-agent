/**
 * What it takes to make sound, in one chunk the app loads on first use (`import()`), so the page's
 * first bundle carries none of the engine: the engine itself, the scheduler that plays the
 * sequencer through it, and the synth core's worklet (its module's URL; the worklet loads it).
 */
export { SoundEngine, type NoteRequest, type SoundEngineOptions } from './engine';
export {
	LOOKAHEAD,
	Scheduler,
	TICK_MS,
	type SchedulerOptions,
	type SchedulerSink
} from './scheduler';
export { SynthHost } from './synth/host';
export { CORE_ENGINES } from './synth/protocol';
export { default as synthWorklet } from './synth/worklet?worker&url';
