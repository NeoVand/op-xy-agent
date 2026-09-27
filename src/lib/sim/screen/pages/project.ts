/**
 * The project page (guide art project-003/004): the pen-nib pictogram, the project's name in
 * 40 px type, system-usage indicators in the top right when voices, CPU or sample memory run high,
 * and soft labels new / save / rename / config.
 */
import type { ScreenCtx } from '../context';
import { softLabels, text } from '../draw';
import { screenFont } from '../font';
import type { ProjectFrame } from '../frame';
import { drawIcon } from '../icons';
import { COLORS } from '../palette';

/** Draws the project page. */
export function drawProject(ctx: ScreenCtx, frame: ProjectFrame): void {
	drawIcon(ctx, 'project.nib', 0, 84);
	const size = screenFont.fit(frame.name, 300, 40, 20);
	text(ctx, frame.name, 173.5, 120, size, COLORS.white);
	if (frame.usage.voices) drawIcon(ctx, 'usage.voices', 365, 19);
	if (frame.usage.cpu) drawIcon(ctx, 'usage.cpu', 403, 16);
	if (frame.usage.memory) drawIcon(ctx, 'usage.memory', 444, 19);
	softLabels(ctx, frame.soft);
}
