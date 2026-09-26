/**
 * Edit distance counting insertions, deletions, substitutions and adjacent transpositions
 * ("shfit" → "shift" is one edit): the optimal-string-alignment variant of Damerau–Levenshtein.
 */
export function editDistance(a: string, b: string): number {
	const rows = Array.from({ length: a.length + 1 }, (_, i) =>
		Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
	);
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
			}
		}
	}
	return rows[a.length][b.length];
}

/**
 * The candidate closest to `input` (case-insensitive), so error messages can say "did you mean …?"
 * to a human or an agent. Short inputs allow fewer edits (none below 3 characters) to avoid noise.
 */
export function closestMatch(
	input: string,
	candidates: Iterable<string>,
	maxDistance = Math.min(2, Math.floor(input.length / 3))
): string | undefined {
	const needle = input.toLowerCase();
	let best: string | undefined;
	let bestDistance = maxDistance + 1;
	for (const candidate of candidates) {
		const distance = editDistance(needle, candidate.toLowerCase());
		if (distance < bestDistance) {
			best = candidate;
			bestDistance = distance;
		}
	}
	return best;
}
