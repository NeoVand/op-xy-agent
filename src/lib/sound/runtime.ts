/**
 * What it takes to make sound, in one chunk the app loads on first use (`import()`), so the page's
 * first bundle carries none of the engine: the engine itself, the scheduler that plays the
 * sequencer through it, and the worklets of the synth core and the punch-in processor (their
 * modules' URLs; the worklets load them).
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
export { PunchHost } from './punch/host';
export { default as punchWorklet } from './punch/worklet?worker&url';
