/**
 * Typed errors of the `.xy` codec. A file without the structure the firmware writes is an
 * {@link XyFormatError}; a model the writer cannot turn into a coherent project (the firmware asserts
 * instead of validating, so an incoherent file can crash it) is an {@link XyModelError}.
 */

/** Base class of every error raised by `src/lib/xy`. */
export class XyError extends Error {
	name = 'XyError';
}

/** Bytes that are not a project the firmware could have written: bad magic, RLE, counts or sizes. */
export class XyFormatError extends XyError {
	name = 'XyFormatError';
}

/** A project model the writer refuses: a value out of range, too many notes, a missing pattern… */
export class XyModelError extends XyError {
	name = 'XyModelError';
}
