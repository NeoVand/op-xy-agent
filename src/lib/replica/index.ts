/**
 * The OP-XY replica (milestone M2): an SVG digital twin in millimetres built from Teenage
 * Engineering's own panel drawing (decision D9, wordmarks left out per D6) and
 * `knowledge/opxy/controls.json`; its live state; and the key-combo animations the agent uses to
 * show a procedure ("shift + M1") on it.
 */
export { default as Replica } from './Replica.svelte';
export {
	DRAWN_VOLUME,
	ReplicaError,
	ReplicaState,
	VOLUME_TRAVEL,
	type AnimateOptions,
	type AnimationHandle,
	type BendEvent,
	type ClickEvent,
	type InputSource,
	type KeyLedState,
	type LastTurn,
	type PressableId,
	type PressEvent,
	type ReplicaEvent,
	type ReplicaEventType,
	type ReplicaStateOptions,
	type ScreenContent,
	type Timers,
	type TurnableId,
	type TurnEvent
} from './state.svelte';
export {
	DEFAULT_TIMING,
	planAnimation,
	type AnimationPlan,
	type AnimationTiming,
	type HighlightKind,
	type PickControl,
	type PlanStep
} from './animation';
export { ART_SOURCE } from './art.generated';
export type * from './art.types';
