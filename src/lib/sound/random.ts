/**
 * Seeded randomness: the same seed always gives the same numbers, so synthesized drums, the reverb's
 * impulse and a groove's feel are reproducible (and testable).
 */

/** mulberry32: a small, fast generator of numbers in [0, 1). */
export function random(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A seed from a few integers (FNV-1a over them), e.g. track, step and pass. */
export function seedOf(...parts: readonly number[]): number {
	let h = 2166136261;
	for (const part of parts) {
		h ^= Math.round(part) & 0xffffffff;
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
