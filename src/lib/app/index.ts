/**
 * The app layer: what connects the replica to the device and presents it on the home page. The
 * simulator is the replica's virtual OP-XY (screen, LEDs, transport) and the sound its voice when no
 * device makes one, and persistence keeps its work across reloads; the bridge maps replica input to MIDI (through the transport) and mirrors the
 * device back onto the replica; hints explain what cannot be done remotely; the caption shows them,
 * rate-limited; the guide walks the user through the agent's steps on the replica; the device
 * samples are the audio of the samples a project names on the OP-XY's drive, read over USB and kept;
 * the play readout names what the keyboard plays, and the scale guide lights a scale on it; the
 * large screen is the replica's display drawn big over the device; now playing is the line under it
 * of what plays (tempo, bar, the song, each track's meter and mute).
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
	getSimPersistence,
	setSimPersistence,
	applySaved,
	captureSim,
	createIdbSimStore,
	createMemorySimStore,
	type SavedSim,
	type SimPersistenceOptions,
	type SimStore
} from './persistence';
export {
	DeviceSamples,
	getDeviceSamples,
	setDeviceSamples,
	type DeviceSamplesOptions
} from './device-samples.svelte';
export {
	createIdbSampleCache,
	createMemorySampleCache,
	describeSamples,
	heldSamples,
	mtpPathOf,
	type SampleCache,
	type SampleReport,
	type SampleSink
} from './device-samples';
export { default as StageHint } from './StageHint.svelte';
export {
	GUIDE_DONE_MS,
	ReplicaGuide,
	getReplicaGuide,
	setReplicaGuide,
	type GuideStatus,
	type GuideStep,
	type ReplicaGuideOptions
} from './guide.svelte';
export { default as GuideCard } from './GuideCard.svelte';
export { default as LargeScreen } from './LargeScreen.svelte';
export { default as NowPlaying } from './NowPlaying.svelte';
export { barBeat, nowPlaying, type NowPlayingView, type SongBlock } from './now-playing';
export {
	PlayReadout,
	readKeys,
	type PlayReading,
	type PlayReadoutOptions
} from './play-readout.svelte';
export {
	GUIDE_SCALES,
	ROOT_NAMES,
	ScaleGuide,
	scaleMarks,
	type GuideScale,
	type ScaleGuideOptions
} from './scale-guide.svelte';
