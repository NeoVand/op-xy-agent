/**
 * Where every part of the replica goes on the 285 × 102 mm panel. Identity, colours and centres
 * come from `knowledge/opxy/controls.json`; shapes and legends from TE's drawing (`art.generated.ts`),
 * placed at `centre + offset` so they sit exactly as drawn. Pure data, computed once at import.
 */
import {
	CONTROLS,
	PANEL,
	colorHex,
	getControl,
	type Control,
	type EncoderId,
	type KeyId
} from '$lib/core/opxy';
import {
	ENCODER_ART,
	GRILLE_ART,
	KEY_ART,
	PANEL_ART,
	SCREEN_ART,
	VOLUME_ART
} from './art.generated';
import type { ArtPath, ArtRect, EncoderArt, KeyArt } from './art.types';

/** Panel size in millimetres: the replica's SVG viewBox is `0 0 PANEL_W PANEL_H`. */
export const PANEL_W = PANEL.body.width;
export const PANEL_H = PANEL.body.height;
export const BODY_RADIUS = PANEL.body.cornerRadius;

/** Half the dark gap between neighbouring tiles. */
export const TILE_INSET = (PANEL.grid.pitch - PANEL.grid.tileSize) / 2;
/** Corner radius of a visible tile. */
export const TILE_RADIUS = PANEL.grid.tileCornerRadius;

/** A rectangle in millimetres with a corner radius. */
export interface Rect {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly r: number;
}

/** The visible tile inside a drawn pitch cell (local coordinates stay local). */
export function visibleTile(cell: ArtRect): Rect {
	return {
		x: cell.x + TILE_INSET,
		y: cell.y + TILE_INSET,
		w: cell.w - 2 * TILE_INSET,
		h: cell.h - 2 * TILE_INSET,
		r: TILE_RADIUS
	};
}

/** A key, ready to draw: position, colours and art. */
export interface KeyPart {
	readonly id: KeyId;
	readonly control: Control;
	/** Drawn keycap centre in panel millimetres. */
	readonly x: number;
	readonly y: number;
	readonly art: KeyArt;
	/** Visible tile, keycap-local. */
	readonly tile: Rect;
	readonly capLegend: readonly ArtPath[];
	readonly tileLegend: readonly ArtPath[];
	readonly colors: { readonly tile: string; readonly cap: string; readonly legend: string };
	/** True for the light step keys, which need darker shading than the black keys. */
	readonly light: boolean;
}

/** An encoder, ready to draw. */
export interface EncoderPart {
	readonly id: EncoderId;
	readonly control: Control;
	readonly x: number;
	readonly y: number;
	readonly art: EncoderArt;
	readonly tile: Rect;
	readonly colors: {
		readonly tile: string;
		readonly cap: string;
		readonly dish: string;
		readonly body: string;
	};
	/** Where this encoder's colour sits on the grey ramp: 0 dark … 3 white. */
	readonly tone: number;
}

const token = (control: Control, role: string, fallback: string): string => {
	const name = (control.colors as Record<string, string | undefined>)[role];
	return colorHex(name ?? fallback);
};

/** Relative luminance (0–1) of a #rrggbb colour, to pick shading for light parts. */
export function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
	const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** The 68 keys in panel reading order. */
export const KEY_PARTS: readonly KeyPart[] = CONTROLS.filter((c) => c.kind === 'key').map(
	(control) => {
		const id = control.id as KeyId;
		const art = KEY_ART[id];
		const tileColor = token(control, 'tile', 'tile');
		return {
			id,
			control,
			x: control.geometry.center.x + art.offset.x,
			y: control.geometry.center.y + art.offset.y,
			art,
			tile: visibleTile(art.tile),
			capLegend: art.legend.filter((p) => p.part === 'cap'),
			tileLegend: art.legend.filter((p) => p.part === 'tile'),
			colors: {
				tile: tileColor,
				cap: token(control, 'cap', 'keycap'),
				legend: token(control, 'legend', 'legend')
			},
			light: luminance(tileColor) > 0.12
		};
	}
);

/** The four encoders, left to right. */
export const ENCODER_PARTS: readonly EncoderPart[] = CONTROLS.filter(
	(c) => c.kind === 'encoder'
).map((control, index) => {
	const id = control.id as EncoderId;
	const art = ENCODER_ART[id];
	return {
		id,
		control,
		x: control.geometry.center.x + art.offset.x,
		y: control.geometry.center.y + art.offset.y,
		art,
		tile: visibleTile(art.tile),
		colors: {
			tile: colorHex('tile'),
			cap: token(control, 'cap', 'encoder-cap-dark'),
			dish: token(control, 'dish', 'encoder-dish'),
			body: token(control, 'body', 'knob-body')
		},
		tone: index
	};
});

const volumeControl = getControl('knob.volume');
/** The volume pot: knob centre, tile (knob-local) and art. */
export const VOLUME_PART = {
	control: volumeControl,
	x: volumeControl.geometry.center.x + VOLUME_ART.offset.x,
	y: volumeControl.geometry.center.y + VOLUME_ART.offset.y,
	art: VOLUME_ART,
	tile: visibleTile(VOLUME_ART.tile),
	colors: { tile: colorHex('tile'), body: colorHex('knob-body') }
} as const;

const speakerControl = getControl('speaker.internal');
/** The speaker: tile centre, holes (tile-local) and art. */
export const SPEAKER_PART = {
	control: speakerControl,
	x: speakerControl.geometry.center.x + GRILLE_ART.offset.x,
	y: speakerControl.geometry.center.y + GRILLE_ART.offset.y,
	art: GRILLE_ART,
	tile: visibleTile(GRILLE_ART.tile),
	colors: { tile: colorHex('tile'), hole: colorHex('tile-gap') }
} as const;

const screenControl = getControl('screen.main');
const screenShape = screenControl.geometry.shape;
if (screenShape.type !== 'screen')
	throw new Error('controls.json: screen.main has no screen shape');
const screenX = screenControl.geometry.center.x + SCREEN_ART.offset.x;
const screenY = screenControl.geometry.center.y + SCREEN_ART.offset.y;
/** Display resolution in pixels (the canvas backing store is a multiple of it). */
export const SCREEN_RESOLUTION = {
	width: screenShape.resolution.width,
	height: screenShape.resolution.height
} as const;
/** The display: glass tile and active area in panel millimetres. */
export const SCREEN_PART = {
	control: screenControl,
	x: screenX,
	y: screenY,
	tile: visibleTile(SCREEN_ART.tile),
	/** Active area, panel millimetres; the canvas covers it exactly. */
	active: {
		x: screenX - screenShape.activeWidth / 2,
		y: screenY - screenShape.activeHeight / 2,
		w: screenShape.activeWidth,
		h: screenShape.activeHeight,
		r: (screenShape.cornerRadiusPx * screenShape.activeWidth) / screenShape.resolution.width
	},
	colors: { glass: colorHex('screen-bezel') }
} as const;

/** The dark well the tiles sit in: every drawn pitch cell, united, in panel millimetres. */
export const GRID_WELL: Rect = (() => {
	const cells = [
		...KEY_PARTS.map((k) => ({
			x: k.x + k.art.tile.x,
			y: k.y + k.art.tile.y,
			w: k.art.tile.w,
			h: k.art.tile.h
		})),
		...ENCODER_PARTS.map((e) => ({
			x: e.x + e.art.tile.x,
			y: e.y + e.art.tile.y,
			w: e.art.tile.w,
			h: e.art.tile.h
		}))
	];
	const x0 = Math.min(...cells.map((c) => c.x));
	const y0 = Math.min(...cells.map((c) => c.y));
	const x1 = Math.max(...cells.map((c) => c.x + c.w));
	const y1 = Math.max(...cells.map((c) => c.y + c.h));
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, r: TILE_RADIUS + TILE_INSET };
})();

/**
 * Level-meter segments along the drawn LED column. TE's product render shows 13 small LEDs and a
 * printed hairline crossing between the 4th and 5th; the count is unverified on hardware.
 */
export const METER_SEGMENTS = 13;
const meter = PANEL_ART.meter;
/** Segment centres (panel millimetres), bottom first, plus the printed hairline. */
export const METER_PART = {
	x: meter.x,
	y1: meter.y1,
	y2: meter.y2,
	pitch: (meter.y2 - meter.y1) / METER_SEGMENTS,
	segments: Array.from({ length: METER_SEGMENTS }, (_, i) => ({
		index: i,
		y: meter.y2 - ((i + 0.5) * (meter.y2 - meter.y1)) / METER_SEGMENTS
	})),
	/** The hairline measured on TE's render: 8.2 mm wide at y ≈ 38.9 mm, broken around the LEDs. */
	hairline: { y: 38.9, x1: meter.x - 4.1, x2: meter.x + 4.1, gap: 0.45 }
} as const;

/** Every control the replica draws, by id, for hit tests and callouts. */
export const PART_CENTERS: ReadonlyMap<string, { x: number; y: number }> = new Map([
	...KEY_PARTS.map((k) => [k.id, { x: k.x, y: k.y }] as const),
	...ENCODER_PARTS.map((e) => [e.id, { x: e.x, y: e.y }] as const),
	['knob.volume', { x: VOLUME_PART.x, y: VOLUME_PART.y }],
	['screen.main', { x: SCREEN_PART.x, y: SCREEN_PART.y }],
	['speaker.internal', { x: SPEAKER_PART.x, y: SPEAKER_PART.y }]
]);
