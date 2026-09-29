import { describe, expect, it } from 'vitest';
import { clockwisePx, dragSteps, wheelSteps } from './input';

describe('turning a knob by dragging it', () => {
	// screen pixels, y down; the grab is a unit vector from the knob's centre
	const RIGHT = [1, 0] as const;
	const LEFT = [-1, 0] as const;
	const TOP = [0, -1] as const;
	const BOTTOM = [0, 1] as const;
	const MIDDLE = [0, 0] as const;

	it('turns clockwise when the right half is pulled down, as a real knob would', () => {
		expect(clockwisePx(0, 10, ...RIGHT)).toBe(10);
		expect(clockwisePx(0, -10, ...RIGHT)).toBe(-10);
	});

	it('turns back when the left half is pulled down', () => {
		expect(clockwisePx(0, 10, ...LEFT)).toBe(-10);
		expect(clockwisePx(0, -10, ...LEFT)).toBe(10);
	});

	it('keeps the usual rule where the knob gives no clear answer: up or right is clockwise', () => {
		expect(clockwisePx(0, -10, ...MIDDLE)).toBe(10);
		expect(clockwisePx(10, 0, ...MIDDLE)).toBe(10);
		expect(clockwisePx(0, -10, ...TOP)).toBe(10);
		expect(clockwisePx(10, 0, ...TOP)).toBe(10);
	});

	it('turns clockwise when the bottom is pulled left', () => {
		expect(clockwisePx(-10, 0, ...BOTTOM)).toBe(10);
		expect(clockwisePx(10, 0, ...BOTTOM)).toBe(-10);
	});

	it('follows the knob round from the top right: down or right is clockwise', () => {
		const grab = [Math.SQRT1_2, -Math.SQRT1_2] as const;
		expect(clockwisePx(0, 10, ...grab)).toBeGreaterThan(0);
		expect(clockwisePx(10, 0, ...grab)).toBeGreaterThan(0);
	});

	it('counts whole detents and keeps the rest for the next move', () => {
		const acc = { value: 0 };
		expect(dragSteps(4, acc)).toBe(0);
		expect(dragSteps(4, acc)).toBe(1);
		expect(dragSteps(-14, acc)).toBe(-2);
	});

	it('takes the wheel sent sideways, as it comes with Shift held', () => {
		const acc = { value: 0 };
		// scrolling up with Shift down arrives as deltaX < 0, deltaY 0: clockwise, like plain up
		expect(wheelSteps({ deltaX: -80, deltaY: 0, deltaMode: 0 }, acc)).toBe(2);
		expect(wheelSteps({ deltaX: 0, deltaY: -40, deltaMode: 0 }, acc)).toBe(1);
	});
});
