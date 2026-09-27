/**
 * The OP-XY screen renderer (decision D10): pure drawing functions onto any canvas-like context, in
 * the 480 × 220 design pixels of TE's guide art, using the screen font and pictograms extracted from
 * that art. The simulator produces {@link ScreenFrame}s; `renderFrame` draws them.
 */
export type { ScreenCtx } from './context';
export * from './palette';
export * from './frame';
export { renderFrame, describeFrame, type RenderOptions } from './render';
export {
	screenFont,
	ScreenFont,
	FALLBACK_FAMILY,
	type ScreenFontData,
	type TextLayout,
	type TextOptions,
	type TextAlign
} from './font';
export {
	drawIcon,
	drawPattern,
	icon,
	ICONS,
	PATTERNS,
	type CellPattern,
	type IconData,
	type IconName,
	type IconOptions
} from './icons';
export { compilePath, tracePath, PathDataError, type PathOps } from './paths';
export {
	header,
	softLabels,
	card,
	encoderDot,
	amountRuler,
	hatch,
	listColumn,
	roundRectPath,
	type HeaderCell,
	type SoftLabel,
	type SoftTone
} from './draw';
export { RecordingContext, type RecordedOp } from './recording';
export { SvgContext, frameToSvg } from './svg';
export { DESTINATIONS } from './pages/lfo';
export { MULTI_OUT_STOPS } from './pages/com';
export { freqToX, cutoffX } from './pages/filter';
