/**
 * An in-place radix-2 FFT, shared by the synth core (band-limited tables, measurements) and the
 * pure analysis in `core` (onsets for the slicer). Plain TypeScript: it runs in Node, the browser
 * and an AudioWorklet.
 */

/** cos and sin of 2πk/n for k < n/2, per FFT size (built once: the tables' builds reuse them). */
const twiddles = new Map<number, { readonly cos: Float64Array; readonly sin: Float64Array }>();

function twiddlesFor(n: number) {
	let t = twiddles.get(n);
	if (!t) {
		const cos = new Float64Array(n / 2);
		const sin = new Float64Array(n / 2);
		for (let k = 0; k < n / 2; k++) {
			cos[k] = Math.cos((2 * Math.PI * k) / n);
			sin[k] = Math.sin((2 * Math.PI * k) / n);
		}
		t = { cos, sin };
		twiddles.set(n, t);
	}
	return t;
}

/** In-place radix-2 FFT (`re` and `im` of the same power-of-two length); `inverse` scales by 1/n. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
	const n = re.length;
	if (n !== im.length || (n & (n - 1)) !== 0) throw new Error('fft: length must be a power of two');
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			const r = re[i];
			re[i] = re[j];
			re[j] = r;
			const m = im[i];
			im[i] = im[j];
			im[j] = m;
		}
	}
	const { cos, sin } = twiddlesFor(n);
	const sign = inverse ? 1 : -1;
	for (let size = 2; size <= n; size <<= 1) {
		const half = size >> 1;
		const stride = n / size;
		for (let start = 0; start < n; start += size) {
			for (let k = 0; k < half; k++) {
				const wr = cos[k * stride];
				const wi = sign * sin[k * stride];
				const a = start + k;
				const b = a + half;
				const tr = re[b] * wr - im[b] * wi;
				const ti = re[b] * wi + im[b] * wr;
				re[b] = re[a] - tr;
				im[b] = im[a] - ti;
				re[a] += tr;
				im[a] += ti;
			}
		}
	}
	if (inverse) {
		for (let i = 0; i < n; i++) {
			re[i] /= n;
			im[i] /= n;
		}
	}
}
