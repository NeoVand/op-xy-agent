/**
 * Typed errors for the OP-XY data layer. Everything here throws instead of guessing: a bad control
 * id, an unknown CC parameter or a malformed knowledge file must surface, never be patched over.
 */

/** Base class of every error thrown by `core/opxy`. */
export class OpxyError extends Error {
	name = 'OpxyError';
}

/** A committed knowledge file (`knowledge/**.json`) failed validation. Thrown at import time. */
export class KnowledgeValidationError extends OpxyError {
	name = 'KnowledgeValidationError';

	/**
	 * @param file repo-relative path of the offending file
	 * @param issues one human-readable line per problem (`path: message`)
	 */
	constructor(
		readonly file: string,
		readonly issues: readonly string[]
	) {
		super(`${file} is invalid (${issues.length} issue(s)):\n  ${issues.join('\n  ')}`);
	}
}

/** A control id or name that the inventory does not know. */
export class UnknownControlError extends OpxyError {
	name = 'UnknownControlError';
}

/** A key-combo string that does not follow the grammar in `keys.ts`. */
export class KeyParseError extends OpxyError {
	name = 'KeyParseError';

	/**
	 * @param message what is wrong, phrased for the author of the combo (human or agent)
	 * @param input the complete string being parsed
	 * @param offset character offset of the problem in `input`
	 */
	constructor(
		message: string,
		readonly input: string,
		readonly offset: number
	) {
		super(message);
	}
}

/** A CC lookup or value conversion that cannot be answered from the CC map. */
export class CcMapError extends OpxyError {
	name = 'CcMapError';
}

/** A remote-key (CC106/107) lookup that does not map to a front-panel control. */
export class RemoteKeyError extends OpxyError {
	name = 'RemoteKeyError';
}

/** A firmware version string that is not `major.minor.patch`. */
export class FirmwareVersionError extends OpxyError {
	name = 'FirmwareVersionError';
}
