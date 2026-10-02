/**
 * Scenes as a write names them, each filled out with what its other tracks had in that scene
 * (pattern 1 in a new scene), so a scene changes track by track: write_arrangement and the lab's
 * writeArrangement alike (a lab program resting one track in a drop's scene reset every other track
 * there to pattern 1, and the agent said the drop was back as it was).
 */
export interface SceneWrite {
	readonly scene: number;
	readonly patterns: readonly { readonly track: number; readonly pattern: number }[] | null;
}

/**
 * `scenes` with each named scene's left-out tracks kept from `had` (scene → every track's pattern,
 * as readArrangement gives them); a scene cleared (null) starts from pattern 1 for what follows in
 * the same write.
 */
export function keepUnnamed<S extends SceneWrite>(
	scenes: readonly S[] | undefined,
	had: ReadonlyMap<number, readonly number[]>
): (S & { patterns: readonly { track: number; pattern: number }[] | null })[] | undefined {
	const now = new Map(had);
	return scenes?.map((write) => {
		if (write.patterns === null) {
			now.delete(write.scene);
			return write;
		}
		const named = new Set(write.patterns.map((p) => p.track));
		const kept = (now.get(write.scene) ?? []).flatMap((pattern, i) =>
			named.has(i + 1) || pattern === 1 ? [] : [{ track: i + 1, pattern }]
		);
		const all = [...write.patterns, ...kept];
		now.set(
			write.scene,
			Array.from({ length: 16 }, (_, i) => all.find((p) => p.track === i + 1)?.pattern ?? 1)
		);
		return { ...write, patterns: all };
	});
}
