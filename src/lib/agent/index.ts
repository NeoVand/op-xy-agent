/**
 * The agent layer (milestone M3): our own small harness on `@anthropic-ai/sdk` (decision D4).
 * The panel loads `runtime.ts` lazily; import from the specific modules in UI code so the SDK stays
 * out of the initial bundle.
 */
export * from './types';
export * from './models';
export * from './chat';
export {
	Conductor,
	type ConductorOptions,
	type ConductorStatus,
	type PreferenceStore
} from './conductor.svelte';
export {
	createAnthropicClient,
	ANTHROPIC_API_URL,
	type ModelClient,
	type ModelStream
} from './client';
export { KeyStore, checkKey, detectProvider, keyHint, type KeyProvider } from './keys.svelte';
export {
	combineSources,
	loadManualSource,
	NO_MANUAL,
	type ManualEntry,
	type ManualHit,
	type ManualOrigin,
	type ManualSource,
	type ManualUnit
} from './manual-source';
export {
	createIdbThreadStore,
	createMemoryThreadStore,
	type ThreadStore,
	type ThreadRecord
} from './threads';
export { runLoop, buildRequest, renderMessages, type LoopConfig, type LoopResult } from './loop';
