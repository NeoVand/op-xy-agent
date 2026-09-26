<!--
@component
The static chassis of the replica: the anodised slab with its chamfered rim, the dark well the
tiles sit in, the screen's glass tile, the mic hole, the front tick and the power-switch tab.
Positions come from TE's drawing (`PANEL_ART`) and controls.json; the logo area stays blank (D6).
Nothing here is reactive.
-->
<svelte:options namespace="svg" />

<script lang="ts">
	import { colorHex } from '$lib/core/opxy';
	import { PANEL_ART } from './art.generated';
	import { BODY_RADIUS, GRID_WELL, PANEL_H, PANEL_W, SCREEN_PART } from './geometry';

	const { mic, tick, powerSwitch } = PANEL_ART;
	const glass = SCREEN_PART.colors.glass;
	const tile = {
		...SCREEN_PART.tile,
		x: SCREEN_PART.x + SCREEN_PART.tile.x,
		y: SCREEN_PART.y + SCREEN_PART.tile.y
	};
	const active = SCREEN_PART.active;
	const gap = colorHex('tile-gap');
	const legend = colorHex('legend');
</script>

<g class="body" aria-hidden="true">
	<!-- power switch tab, sticking out of the right edge (drawn first: the body covers its root) -->
	<path d={powerSwitch.d} fill="url(#rx-switch)" stroke="#8d8b88" stroke-width="0.12" />

	<rect width={PANEL_W} height={PANEL_H} rx={BODY_RADIUS} fill="url(#rx-body)" />
	<rect
		x="0.22"
		y="0.22"
		width={PANEL_W - 0.44}
		height={PANEL_H - 0.44}
		rx={BODY_RADIUS - 0.22}
		fill="none"
		stroke="url(#rx-rim)"
		stroke-width="0.44"
	/>
	<rect
		width={PANEL_W}
		height={PANEL_H}
		rx={BODY_RADIUS}
		fill="none"
		stroke="#0b0c0e"
		stroke-width="0.12"
	/>

	<!-- the well: its dark floor shows as the gap between tiles -->
	<rect
		x={GRID_WELL.x}
		y={GRID_WELL.y}
		width={GRID_WELL.w}
		height={GRID_WELL.h}
		rx={GRID_WELL.r}
		fill={gap}
	/>
	<rect
		x={GRID_WELL.x}
		y={GRID_WELL.y}
		width={GRID_WELL.w}
		height={GRID_WELL.h}
		rx={GRID_WELL.r}
		fill="url(#rx-well-shade)"
	/>

	<!-- screen: a flush black glass tile; the canvas overlays the active area -->
	<rect x={tile.x} y={tile.y} width={tile.w} height={tile.h} rx={tile.r} fill={glass} />
	<rect x={active.x} y={active.y} width={active.w} height={active.h} rx={active.r} fill="#000000" />
	<rect
		x={tile.x}
		y={tile.y}
		width={tile.w}
		height={tile.h}
		rx={tile.r}
		fill="url(#rx-glass)"
		stroke="#000000"
		stroke-opacity="0.6"
		stroke-width="0.12"
	/>

	<!-- mic: a small hole, its lower lip catching the light -->
	<circle cx={mic.x} cy={mic.y + 0.07} r={mic.r} fill="#ffffff" fill-opacity="0.12" />
	<circle cx={mic.x} cy={mic.y} r={mic.r} fill="#060607" />

	<!-- the white tick on the front margin -->
	<rect x={tick.x} y={tick.y} width={tick.w} height={tick.h} fill={legend} />
</g>
