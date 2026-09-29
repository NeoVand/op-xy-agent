/**
 * The anodised finish's bead-blast grain, drawn in screen pixels. TE's top-down photo shows it on
 * every flat surface as noise of about 7–10 % of the light that is uncorrelated from one 0.17 mm
 * photo pixel to the next. Drawn in the SVG's millimetres it swelled into blotches when zoomed in
 * and averaged away into haze when zoomed out; one noise tile laid at one texel per device pixel
 * (`Replica.svelte`, in an overlay blend, where mid-grey changes nothing) stays that fine at any
 * size, and leaves pure white (lit LEDs) and pure black (the gaps) alone.
 */

/** Side of the noise tile, in device pixels. */
export const GRAIN_TILE = 256;

/** A tiny seeded generator (mulberry32), so tests can check the noise. */
export function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** RGBA pixels of grey noise round mid-grey: normal, with `spread` levels of standard deviation. */
export function grainPixels(
	size = GRAIN_TILE,
	spread = 24,
	random: () => number = Math.random
): Uint8ClampedArray<ArrayBuffer> {
	const data = new Uint8ClampedArray(size * size * 4);
	for (let i = 0; i < data.length; i += 4) {
		// Box–Muller: one normal deviate per pixel
		const n = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
		const grey = Math.round(128 + spread * n);
		data[i] = grey;
		data[i + 1] = grey;
		data[i + 2] = grey;
		data[i + 3] = 255;
	}
	return data;
}

/** The noise tile as a PNG data URL (browser only), or null where there is no 2D canvas. */
export function grainTile(size = GRAIN_TILE): string | null {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const context = canvas.getContext('2d');
	if (!context) return null;
	context.putImageData(new ImageData(grainPixels(size), size, size), 0, 0);
	return canvas.toDataURL('image/png');
}
