/**
 * Small path builders for the replica's own drawings (knurling, turn arrows). Millimetres, SVG
 * angles (0° = 3 o'clock, clockwise positive because y points down).
 */

const f = (n: number) => Number(n.toFixed(3));
const polar = (r: number, deg: number): [number, number] => {
	const a = (deg * Math.PI) / 180;
	return [f(r * Math.cos(a)), f(r * Math.sin(a))];
};

/** Radial ridges between radius `r1` and `r2`: the knurled edge of a knob seen from above. */
export function knurlPath(r1: number, r2: number, count: number): string {
	let d = '';
	for (let i = 0; i < count; i++) {
		const deg = (360 * i) / count;
		const [x1, y1] = polar(r1, deg);
		const [x2, y2] = polar(r2, deg);
		d += `M${x1} ${y1}L${x2} ${y2}`;
	}
	return d;
}

/**
 * One arc over the top of a knob with its arrowhead at the clockwise end: the way it is turning.
 * Mirror with `scale(-1 1)` for counter-clockwise. (A pair of arcs, as TE draws rotation, reads as
 * both directions at once.)
 */
export function turnArrowPath(radius: number, spanDeg = 110, head = 1): string {
	const a0 = -90 - spanDeg / 2;
	const a1 = -90 + spanDeg / 2;
	const [x0, y0] = polar(radius, a0);
	const [x1, y1] = polar(radius, a1);
	let d = `M${x0} ${y0}A${radius} ${radius} 0 0 1 ${x1} ${y1}`;
	// the head: two short strokes back along the tangent at the clockwise end
	const tangent = a1 + 90;
	const [bx, by] = polar(head, tangent + 180 - 28);
	const [cx, cy] = polar(head, tangent + 180 + 28);
	d += `M${f(x1 + bx)} ${f(y1 + by)}L${x1} ${y1}L${f(x1 + cx)} ${f(y1 + cy)}`;
	return d;
}
