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
/** Pixels of vertical drag per detent. */
export const DRAG_PX_PER_STEP = 6;

/**
 * Adds a wheel event to an accumulator and returns the whole steps it completes (positive when
 * scrolling up, which turns a knob clockwise); the remainder stays in `acc`.
 */
export function wheelSteps(
	event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>,
	acc: { value: number }
): number {
	const px =
		event.deltaMode === 1
			? event.deltaY * 40
			: event.deltaMode === 2
				? event.deltaY * 400
				: event.deltaY;
	acc.value -= px;
	const steps = Math.trunc(acc.value / WHEEL_PX_PER_STEP);
	acc.value -= steps * WHEEL_PX_PER_STEP;
	return steps;
}

/** Same for a vertical drag of `dy` pixels (up is positive). */
export function dragSteps(dy: number, acc: { value: number }): number {
	acc.value += dy;
	const steps = Math.trunc(acc.value / DRAG_PX_PER_STEP);
	acc.value -= steps * DRAG_PX_PER_STEP;
	return steps;
}
