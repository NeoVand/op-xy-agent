/**
 * Our own UI icon set, drawn on a 24-unit grid in the spirit of the OP-XY's key legends: few strokes,
 * crisp geometry, filled where the device fills (record, play). No third-party or TE artwork.
 */

/** One path of an icon. Stroked with `currentColor` unless `fill` is set. */
export interface IconShape {
	/** SVG path data in the 24 x 24 grid. */
	d: string;
	/** Fill the path instead of stroking it. */
	fill?: boolean;
	/** Stroke end style; the device's plus and minus legends use flat ends. */
	cap?: 'round' | 'butt';
	/** Stroke width for this path, overriding the icon's weight (grid units). */
	width?: number;
}

/** Diagonal hatching clipped to a square, like the device's stop legend. */
function hatch(x0: number, y0: number, size: number, spacing: number): string {
	const x1 = x0 + size;
	const y1 = y0 + size;
	const parts: string[] = [];
	// Lines of constant x + y, walked from the top-left corner to the bottom-right one.
	for (let c = x0 + y0 + spacing / 2; c < x1 + y1; c += spacing) {
		const ax = Math.max(x0, c - y1);
		const ay = c - ax;
		const bx = Math.min(x1, c - y0);
		const by = c - bx;
		parts.push(`M${ax.toFixed(2)} ${ay.toFixed(2)}L${bx.toFixed(2)} ${by.toFixed(2)}`);
	}
	return parts.join('');
}

/** Every icon, by name. */
export const icons = {
	'arrow-up': [{ d: 'M12 19.5V5M6 11l6-6 6 6' }],
	'arrow-right': [{ d: 'M4.5 12H19M13 6l6 6-6 6' }],
	plus: [{ d: 'M4 12h16M12 4v16', cap: 'butt' }],
	minus: [{ d: 'M4 12h16', cap: 'butt' }],
	close: [{ d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }],
	check: [{ d: 'M5 12.5l4.5 4.5L19 7.5' }],
	/* A microphone: capsule, cradle and stem (the voice key). */
	mic: [
		{ d: 'M12 4a2.75 2.75 0 0 1 2.75 2.75v4.5a2.75 2.75 0 0 1-5.5 0v-4.5A2.75 2.75 0 0 1 12 4z' },
		{ d: 'M7 11.25a5 5 0 0 0 10 0M12 16.25V20' }
	],
	record: [{ d: 'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z', fill: true }],
	play: [{ d: 'M8.5 6.5v11l9-5.5-9-5.5z', fill: true }],
	stop: [{ d: hatch(6.5, 6.5, 11, 2.75), cap: 'butt', width: 1.25 }],
	contrast: [
		{ d: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z' },
		{ d: 'M12 4a8 8 0 0 0 0 16V4z', fill: true }
	],
	/* A USB-C port seen head-on: the stadium slot and its tongue. */
	usb: [{ d: 'M7.5 8h9a4 4 0 0 1 0 8h-9a4 4 0 0 1 0-8zM8.5 12h7' }],
	info: [
		{ d: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 11v5.5' },
		{ d: 'M12 7a1.1 1.1 0 1 1 0 2.2A1.1 1.1 0 0 1 12 7z', fill: true }
	],
	external: [
		{ d: 'M14 5h5v5M19 5l-8 8M17 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4.5' }
	],
	sine: [{ d: 'M3 12c2.4-7 6.6-7 9 0s6.6 7 9 0' }]
} satisfies Record<string, IconShape[]>;

/** Name of an icon in {@link icons}. */
export type IconName = keyof typeof icons;
