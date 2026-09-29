/**
 * How the manual's areas look: an icon each (Hugeicons' free set, MIT), used by the manual's
 * sidebar, its landing page and anywhere an area is named.
 */
import {
	AudioWave01Icon,
	BookOpen01Icon,
	CpuIcon,
	Folder01Icon,
	GridViewIcon,
	Idea01Icon,
	Layers01Icon,
	MagicWand01Icon,
	MetronomeIcon,
	MusicNote01Icon,
	PlayCircleIcon,
	Plug01Icon,
	SlidersHorizontalIcon,
	UsbIcon
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/svelte';
import type { AreaId } from '$lib/manual';

export const AREA_ICONS: Readonly<Record<AreaId, IconSvgElement>> = {
	basics: BookOpen01Icon,
	hardware: CpuIcon,
	sequencer: GridViewIcon,
	players: PlayCircleIcon,
	instrument: MusicNote01Icon,
	sampler: AudioWave01Icon,
	auxiliary: Plug01Icon,
	fx: MagicWand01Icon,
	arrange: Layers01Icon,
	mix: SlidersHorizontalIcon,
	project: Folder01Icon,
	tempo: MetronomeIcon,
	com: UsbIcon,
	howto: Idea01Icon
};

/** An area's name as the manual shows it ("how-to" rather than "howto"). */
export const areaName = (id: AreaId, title: string): string =>
	id === 'howto' ? 'recipes' : title.toLowerCase();
