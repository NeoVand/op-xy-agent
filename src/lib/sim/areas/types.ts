/**
 * The contract between the simulator's core and its areas (decision D10; research 55 §6). The core
 * keeps the modes, overlays, tracks, steps, keyboard, transport and the pages drawn first (tempo,
 * project, COM, the instrument pages, mixer M1). Every other part of the interface is an area with
 * its own folder under `areas/`: its state slice (`state.ts`), frame types (`frames.ts`), frame
 * builder and input handling (`sim.ts`), drawing (`draw.ts`) and the states that reproduce TE's
 * guide art (`scenarios.ts`). Areas never edit each other's files.
 */
import type { KeyId } from '$lib/core/opxy';
import type { KeyLedState } from '$lib/replica/state.svelte';
import type { SimInput } from '../input';
import type { SimState } from '../params';
import type { ScreenFrame } from '../screen/frame';

/** The areas, one folder each. */
export type AreaId = 'auxiliary' | 'arrange' | 'mixer' | 'sample' | 'system' | 'sequencer';

/** LED windows by key. */
export type LedMap = Partial<Record<KeyId, KeyLedState>>;

/** What an area works with besides the state. */
export interface AreaContext {
	readonly state: SimState;
	/** Whether a key or encoder push is held right now. */
	isHeld(id: string): boolean;
	/** Milliseconds clock (tap timing, long presses). */
	now(): number;
}

/** A part of the OP-XY's interface. */
export interface SimArea {
	readonly id: AreaId;
	/** Whether this area decides what the screen shows now (asked in registry order). */
	owns(state: SimState): boolean;
	/** What the screen shows while the area owns it. */
	frame(state: SimState): ScreenFrame;
	/**
	 * Sees every input before anyone else, owner or not (held keys are already recorded); return
	 * true to consume it. For gestures that start anywhere, such as holding `bar`.
	 */
	claim?(ctx: AreaContext, input: SimInput): boolean;
	/** A key press while the area owns the screen; return true when handled (the core then skips it). */
	press?(ctx: AreaContext, id: string): boolean;
	/** A key release while the area owns the screen; return true when handled. */
	release?(ctx: AreaContext, id: string): boolean;
	/** An encoder turn while the area owns the screen (whole detents; `fine` = pushed while turning). */
	turn?(ctx: AreaContext, encoder: number, delta: number, fine: boolean): void;
	/** An encoder click while the area owns the screen. */
	click?(ctx: AreaContext, encoder: number): void;
	/** LED windows while the area owns the screen: change `leds` (the core's map) in place. */
	leds?(state: SimState, leds: LedMap): void;
	/** Time passing, always (recording counters, animations). */
	advance?(state: SimState, ms: number): void;
}
