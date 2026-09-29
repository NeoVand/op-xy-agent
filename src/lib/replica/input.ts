/**
 * Input helpers shared by the replica's knobs: a non-passive wheel listener (so the page does not
 * scroll while a knob turns) and conversions from wheel and drag distances to whole detents.
 */
import type { Attachment } from 'svelte/attachments';

/** Attaches a wheel listener that may call `preventDefault` (Svelte's own handler is passive). */
export function wheel(handler: (event: WheelEvent) => void): Attachment<Element> {
	return (element) => {
		const listener = (event: Event) => handler(event as WheelEvent);
		element.addEventListener('wheel', listener, { passive: false });
		return () => element.removeEventListener('wheel', listener);
	};
}

/**
 * Routes a pointer's later events to the element it went down on, so a drag or a hold survives
 * leaving the control. A pointer that is no longer active (or a synthetic one) cannot be
 * captured; the gesture then simply ends at the element's edge.
 */
export function capturePointer(event: PointerEvent): void {
	try {
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
	} catch {
		// not capturable: nothing to do
	}
}

/** Pixels of wheel travel per detent (a mouse notch is about 100 px, a trackpad flick more). */
export const WHEEL_PX_PER_STEP = 40;
/** Pixels of drag per detent. */
export const DRAG_PX_PER_STEP = 6;

/**
 * Adds a wheel event to an accumulator and returns the whole steps it completes (positive when
 * scrolling up, which turns a knob clockwise); the remainder stays in `acc`. With Shift held,
 * browsers and macOS send the wheel sideways (deltaX, deltaY 0): that counts the same, so
 * `shift + turn` works from the wheel too.
 */
export function wheelSteps(
	event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode'>,
	acc: { value: number }
): number {
	const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
	const px = event.deltaMode === 1 ? delta * 40 : event.deltaMode === 2 ? delta * 400 : delta;
	acc.value -= px;
	const steps = Math.trunc(acc.value / WHEEL_PX_PER_STEP);
	acc.value -= steps * WHEEL_PX_PER_STEP;
	return steps;
}

/**
 * How far a pointer move of (`dx`, `dy`) screen pixels (y down) turns a knob clockwise, the way a
 * real knob turns under a finger: grabbed on its right half, pulling down turns it clockwise; on
 * its left half, pulling down turns it back. Where the knob gives no clear answer (its top and
 * middle for up and down, everywhere but its bottom for sideways) the usual rule holds: up or right
 * turns it clockwise. (`ux`, `uy`) is the unit vector from the knob's centre to where it was
 * grabbed, or (0, 0) for a grab near the centre.
 */
export function clockwisePx(dx: number, dy: number, ux: number, uy: number): number {
	const vertical = ux > 0.2 ? dy : -dy;
	const horizontal = uy > 0.2 ? -dx : dx;
	return vertical + horizontal;
}

/** Same for a drag of `px` pixels clockwise (see {@link clockwisePx}). */
export function dragSteps(px: number, acc: { value: number }): number {
	acc.value += px;
	const steps = Math.trunc(acc.value / DRAG_PX_PER_STEP);
	acc.value -= steps * DRAG_PX_PER_STEP;
	return steps;
}
