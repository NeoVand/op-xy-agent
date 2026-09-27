/**
 * The virtual OP-XY's sound: Web Audio synthesis for the replica when no device makes the sound.
 * Pure parts (mappings, grooves, the scheduler's timeline, voice allocation, envelopes, the
 * synthesized kit) are tested in Node; the engine renders offline in the browser tests.
 *
 * The app loads the engine lazily through `runtime.ts` and imports the sample registry from
 * `samples.ts` directly; importing from here pulls in everything.
 */
export { VOICE_LIMIT, busyAt, victim, type VoiceSlot } from './allocator';
export { SoundEngine, type NoteRequest, type SoundEngineOptions } from './engine';
export { SoundError } from './errors';
export { Envelope, type EnvelopeRange, type ParamLike } from './envelope';
export { createEffect, DELAY_SIXTEENTHS, type SendEffect } from './fx';
export { grooveJitter, grooveTime, grooveVelocity, maxEarlyShift, type Groove } from './groove';
export {
	DRUM_SOUNDS,
	FIRST_DRUM_NOTE,
	renderClick,
	renderDrum,
	renderImpulse,
	type DrumSound
} from './kit';
export * from './mapping';
export { Resources } from './resources';
export {
	SampleRegistry,
	type Sample,
	type SampleData,
	type SampleSource,
	type SampleZone
} from './samples';
export {
	LOOKAHEAD,
	Scheduler,
	TICK_MS,
	firstIndex,
	plainStepEvents,
	positionAt,
	sequencerStepEvents,
	sixteenthSeconds,
	timeAt,
	toEvents,
	type Anchor,
	type ClickEvent,
	type NoteEvent,
	type SchedulerOptions,
	type SchedulerSink,
	type StepEvent,
	type StepEventsFn
} from './scheduler';
export { bufferSource, synthSource, type BufferPlay, type SourceGraph } from './synths';
export { Voice, type VoiceFilter, type VoiceModulation, type VoiceSpec } from './voice';
