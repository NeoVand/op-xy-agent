/**
 * What it takes to make sound, in one chunk the app loads on first use (`import()`), so the page's
 * first bundle carries none of the engine: the engine itself and the scheduler that plays the
 * sequencer through it.
 */
export { SoundEngine, type NoteRequest, type SoundEngineOptions } from './engine';
export {
	LOOKAHEAD,
	Scheduler,
	TICK_MS,
	type SchedulerOptions,
	type SchedulerSink
} from './scheduler';
