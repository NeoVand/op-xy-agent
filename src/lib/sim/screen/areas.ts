/**
 * Drawing the areas' frames (see `../areas/types.ts`): each area registers a drawer and a spoken
 * description per frame page in its own `draw.ts`; the renderer asks here for any page the core
 * does not draw.
 */
import type { AreaFrame } from '../areas/frames';
import type { ScreenCtx } from './context';
import type { RenderOptions } from './render';
import { drawers as auxiliary } from '../areas/auxiliary/draw';
import { drawers as arrange } from '../areas/arrange/draw';
import { drawers as mixer } from '../areas/mixer/draw';
import { drawers as sample } from '../areas/sample/draw';
import { drawers as system } from '../areas/system/draw';
import { drawers as sequencer } from '../areas/sequencer/draw';

/** One page of an area: how to draw it and how to say it. */
export interface AreaPage<F> {
	draw(ctx: ScreenCtx, frame: F, options: RenderOptions): void;
	describe(frame: F): string;
}

/** An area's pages, one entry per frame page. */
export type AreaDrawers<F extends { readonly page: string }> = {
	readonly [P in F['page']]: AreaPage<Extract<F, { readonly page: P }>>;
};

const PAGES = {
	...auxiliary,
	...arrange,
	...mixer,
	...sample,
	...system,
	...sequencer
} as Readonly<Record<string, AreaPage<AreaFrame> | undefined>>;

/** The page name of any frame (while no area draws yet, `AreaFrame` is empty). */
const pageOf = (frame: AreaFrame) => (frame as { readonly page: string }).page;

/** Draws an area's frame. */
export function drawAreaFrame(ctx: ScreenCtx, frame: AreaFrame, options: RenderOptions): void {
	PAGES[pageOf(frame)]?.draw(ctx, frame, options);
}

/** A short spoken description of an area's frame. */
export function describeAreaFrame(frame: AreaFrame): string {
	return PAGES[pageOf(frame)]?.describe(frame) ?? pageOf(frame);
}
