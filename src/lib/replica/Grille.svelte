<!--
@component
The speaker tile with its 147-hole grille exactly as TE draws it (rows 5, 11, 11, 13 × 7, 11, 11,
7 on a 2 mm pitch). All holes are one path, drawn twice: a faint lower lip, then the dark hole.
Static.
-->
<svelte:options namespace="svg" />

<script lang="ts">
	import { SPEAKER_PART } from './geometry';

	const { x, y, tile, art, colors } = SPEAKER_PART;
	const r = art.holeRadius;
	// One subpath per hole: two half-circle arcs.
	const holes = art.holes
		.map(
			([hx, hy]) =>
				`M${(hx - r).toFixed(3)} ${hy.toFixed(3)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`
		)
		.join('');
</script>

<g class="grille" transform="translate({x} {y})" aria-hidden="true">
	<rect x={tile.x} y={tile.y} width={tile.w} height={tile.h} rx={tile.r} fill={colors.tile} />
	<rect
		x={tile.x}
		y={tile.y}
		width={tile.w}
		height={tile.h}
		rx={tile.r}
		fill="url(#rx-tile-shade)"
		stroke="url(#rx-tile-rim)"
		stroke-width="0.14"
	/>
	<path d={holes} transform="translate(0 0.07)" fill="#ffffff" fill-opacity="0.09" />
	<path d={holes} fill={colors.hole} />
</g>
