/**
 * What it takes to make sound, in one chunk the app loads on first use (`import()`), so the page's
 * first bundle carries none of the engine: the engine itself, the scheduler and its step semantics.
 */
export { SoundEngine, type NoteRequest, type SoundEngineOptions } from './engine';
export {
	LOOKAHEAD,
	Scheduler,
	TICK_MS,
	plainStepEvents,
	sequencerStepEvents,
	type SchedulerOptions,
	type SchedulerSink,
	type StepEventsFn
} from './scheduler';
