/**
 * The home page's one orchestrated moment (docs/DESIGN.md §7): a playhead sweeps the replica's step
 * row once. Each step LED snaps on for one step and its CSS decay leaves the trail by itself, the
 * way a chase looks on the device. The replica tokens collapse the decay under reduced motion; the
 * page skips the sweep entirely then.
 */
import type { StepKeyId } from '$lib/core/opxy';
import type { Timers } from '$lib/device';
import type { KeyLedState, ReplicaState } from '$lib/replica';

/** Timing of the sweep. */
export interface SweepOptions {
	/** Wait before the first step, in ms (default 500, like the placeholder it replaces). */
	readonly delayMs?: number;
	/** One step, in ms (default 55, `--xy-dur-step`). */
	readonly stepMs?: number;
}

/**
 * Sweeps a playhead across steps 1–16 once. LEDs that were lit before are put back as they were.
 * Returns a function that stops the sweep early (and puts the current LED back).
 */
export function sweepSteps(
	replica: ReplicaState,
	timers: Timers,
	options: SweepOptions = {}
): () => void {
	const delayMs = options.delayMs ?? 500;
	const stepMs = options.stepMs ?? 55;
	const handles: unknown[] = [];
	let lit: { id: StepKeyId; saved: KeyLedState } | null = null;

	const restore = () => {
		// Only undo our own light: something else may have taken the LED over meanwhile.
		if (lit && replica.led(lit.id) === 'white') replica.setLed(lit.id, lit.saved);
		lit = null;
	};

	for (let step = 0; step <= 16; step++) {
		handles.push(
			timers.setTimeout(
				() => {
					restore();
					if (step === 16) return;
					const id = `step.${step + 1}` as StepKeyId;
					lit = { id, saved: replica.led(id) };
					replica.setLed(id, 'white');
				},
				delayMs + step * stepMs
			)
		);
	}

	return () => {
		for (const handle of handles) timers.clearTimeout(handle);
		restore();
	};
}
