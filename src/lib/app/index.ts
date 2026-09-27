/**
 * The app layer: what connects the replica to the device and presents it on the home page. The
 * simulator is the replica's virtual OP-XY (screen, LEDs, transport) and the sound its voice when no
 * device makes one, and persistence keeps its work across reloads; the bridge maps replica input to MIDI (through the transport) and mirrors the
 * device back onto the replica; hints explain what cannot be done remotely; the caption shows them,
 * rate-limited.
 */
export { BridgeError, ReplicaBridge, type ReplicaBridgeOptions } from './bridge.svelte';
export { HINT_REPEAT_MS, HintCaption, type HintCaptionOptions } from './caption.svelte';
export {
	comboHint,
	comboName,
	controlName,
	controlPurpose,
	controlSubject,
	notRemoteHint,
	offlineHint,
	sendFailedHint,
	type BridgeHint,
	type HintAction,
	type HintKind
} from './hints';
export { sweepSteps, type SweepOptions } from './intro';
export {
	AppSimulator,
	getAppSimulator,
	setAppSimulator,
	type AppSimulatorOptions,
	type FrameClock
} from './simulator.svelte';
export {
	isKeyboardKey,
	isRemoteControl,
	remoteRoute,
	TRACK_SELECT_CC,
	type RemoteRoute
} from './mapping';
export {
	AppSound,
	getAppSound,
	setAppSound,
	SOUND_STORAGE_KEY,
	type AppSoundOptions,
	type SoundRuntime
} from './sound.svelte';
export {
	SimPersistence,
	applySaved,
	captureSim,
	createIdbSimStore,
	createMemorySimStore,
	type SavedSim,
	type SimPersistenceOptions,
	type SimStore
} from './persistence';
export { default as StageHint } from './StageHint.svelte';
