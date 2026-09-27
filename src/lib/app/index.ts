/**
 * The app layer: what connects the replica to the device and presents it on the home page. The
 * bridge maps replica input to MIDI (through the transport) and mirrors the device back onto the
 * replica; hints explain what cannot be done remotely; the caption shows them, rate-limited.
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
	isKeyboardKey,
	isRemoteControl,
	remoteRoute,
	TRACK_SELECT_CC,
	type RemoteRoute
} from './mapping';
export { default as StageHint } from './StageHint.svelte';
