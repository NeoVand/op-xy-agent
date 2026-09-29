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

/** A few words under each area's name in the sidebar: what is in it, at a glance. */
export const AREA_DETAILS: Readonly<Record<AreaId, string>> = {
	basics: 'modes, pages and notation',
	hardware: 'panel, power and sockets',
	sequencer: 'steps, locks and components',
	players: 'arpeggio, chords and hold',
	instrument: 'engines, filter and LFO',
	sampler: 'sampling and slices',
	auxiliary: 'brain, tape, CV and sends',
	fx: 'the two send effects',
	arrange: 'patterns, scenes and songs',
	mix: 'levels, EQ and the master',
	project: 'saving, loading, templates',
	tempo: 'bpm, groove and metronome',
	com: 'MIDI, USB and sync',
	howto: 'step-by-step walkthroughs'
};

/** A heading of a unit's page, for its outlines ("on this page", the sidebar). */
export interface UnitSection {
	readonly id: string;
	readonly title: string;
}

/** The sections a unit's page has, in page order. */
export function unitSections(unit: {
	readonly procedures: readonly unknown[];
	readonly facts: readonly unknown[];
	readonly parameters: readonly unknown[];
	readonly related: readonly unknown[];
}): UnitSection[] {
	const sections: UnitSection[] = [];
	if (unit.procedures.length > 0) sections.push({ id: 'how-to', title: 'How to' });
	if (unit.facts.length > 0) sections.push({ id: 'details', title: 'Details' });
	if (unit.parameters.length > 0) sections.push({ id: 'parameters', title: 'Parameters' });
	if (unit.related.length > 0) sections.push({ id: 'related', title: 'Related' });
	return sections;
}

/** An area's name as the manual shows it ("how-to" rather than "howto"). */
export const areaName = (id: AreaId, title: string): string =>
	id === 'howto' ? 'recipes' : title.toLowerCase();
