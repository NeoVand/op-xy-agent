/**
 * Voice (M8): OpenAI's realtime model over WebRTC as a front end that hands every OP-XY question
 * or action to the Claude conductor (`ask_claude`), with push-to-talk, hands-free, barge-in and
 * spoken approvals. The protocol itself is pure and lives in `$lib/core/voice`. See
 * docs/research/71-voice.md.
 */
export {
	ClaudeBridge,
	answerOf,
	changesOf,
	describeAction,
	type ClaudeBridgeOptions,
	type SpokenEvidence,
	type VoiceConductor
} from './bridge';
export {
	browserRealtimeEnvironment,
	connectRealtime,
	exchangeSdp,
	mintClientSecret,
	openMicrophone,
	voiceSupported,
	type AudioOutLike,
	type DataChannelLike,
	type PeerConnectionLike,
	type RealtimeConnectOptions,
	type RealtimeEnvironment,
	type RealtimeLink,
	type StreamLike,
	type TrackLike
} from './rtc';
export {
	VOICE_MODEL_PREFERENCE,
	VOICE_MODE_PREFERENCE,
	VoiceSession,
	type VoiceSessionOptions
} from './session.svelte';
export { MORE_ON_SCREEN, SPOKEN_MAX_CHARS, speakable, spokenCombo } from './speech';
