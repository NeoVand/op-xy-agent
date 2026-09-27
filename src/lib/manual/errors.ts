/**
 * Typed errors for the manual layer. Authoring problems are collected as {@link ManualIssue}s so one
 * build run reports every broken unit at once; these classes are for failures that stop the caller.
 */

/** Base class of every error thrown by `src/lib/manual`. */
export class ManualError extends Error {
	name = 'ManualError';
}

/** Front-matter that is not in the supported YAML subset (see `yaml.ts`). */
export class YamlError extends ManualError {
	name = 'YamlError';

	/**
	 * @param reason what is wrong, phrased for the author of the file
	 * @param line 1-based line in the file being parsed
	 * @param column 1-based column
	 */
	constructor(
		readonly reason: string,
		readonly line: number,
		readonly column: number
	) {
		super(`${line}:${column}: ${reason}`);
	}
}

/** The committed build artefacts (`knowledge/manual/build/`) are missing or fail validation. */
export class ManualDataError extends ManualError {
	name = 'ManualDataError';
}
