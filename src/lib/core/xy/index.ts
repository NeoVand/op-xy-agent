/**
 * The OP-XY's native project files (`.xy`, milestone M6), ported from kmorrill/xy-format (MIT):
 * the container and RLE, the decoded project model, a reader and a template-based writer
 * (docs/research/10-xy-format.md). All of it is pure: no DOM, no simulator. The compiler from the
 * simulator's state, which does depend on `sim/`, lives in `$lib/sim/xy`.
 */
export { XyError, XyFormatError, XyModelError } from './errors';
export { rleDecode, rleEncode } from './rle';
export {
	MAPPED_FAMILIES,
	TRACK_BASE_BY_FAMILY,
	XY_HEADER_LENGTH,
	XY_MAGIC,
	decodeXy,
	encodeXy,
	trackBase,
	type XyContainer
} from './container';
export {
	MAX_NOTES,
	MAX_PATTERNS,
	MAX_SONG_LENGTH,
	SCENES,
	SCENE_SLOTS,
	SONGS,
	STEPS,
	TICKS_PER_STEP,
	TRACKS,
	laneCounts,
	walkProject,
	type PatternSpan,
	type SongSpan,
	type XyLayout
} from './layout';
export * from './model';
export { readProject } from './read';
export { writeProject } from './write';
