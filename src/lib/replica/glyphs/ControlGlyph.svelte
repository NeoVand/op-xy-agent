<!--
@component
One control drawn as the replica draws it, small enough for a line of text (`glyphs/art.ts`): a key
as its cap with TE's legend and LED window on a square of its tile, an encoder as its coloured cap
on the black knob in its dish (arrows round it when it is turned), the volume pot in its hole, the
pitch-bend pill or the power switch. `stacked` draws a key twice, one behind the other ("one or
more"). Its height follows the text (`--glyph-size`, 1.7em unless set); `name` is what it is
announced as.
-->
<script lang="ts">
	import { ENCODER_HALF, KEY_HALF, type GlyphArt, type KeyGlyphArt } from './art';

	interface Props {
		art: GlyphArt;
		/** What the control is called (announced; the tooltip is the combo's). */
		name: string;
		/** Draw a second key behind the first: one or more of a group. */
		stacked?: boolean;
		/** Draw arrows round an encoder or the volume knob: turn it. */
		turn?: boolean;
	}

	let { art, name, stacked = false, turn = false }: Props = $props();

	const uid = $props.id();
	const url = (part: string) => `url(#${uid}-${part})`;

	/** How far the second key of a stack sits behind the first, up and to the right. */
	const STACK = 1.7;
	const TILE_R = 1.1;

	/** A point on a circle of radius `r`, `deg` degrees clockwise from twelve o'clock. */
	function polar(r: number, deg: number): [number, number] {
		const a = (deg * Math.PI) / 180;
		return [Math.sin(a) * r, -Math.cos(a) * r];
	}

	/** An arc over the top, from `from` to `to` degrees (clockwise), for highlights and arrows. */
	function arc(r: number, from: number, to: number): string {
		const [x0, y0] = polar(r, from);
		const [x1, y1] = polar(r, to);
		const large = (((to - from) % 360) + 360) % 360 > 180 ? 1 : 0;
		return `M${x0.toFixed(3)} ${y0.toFixed(3)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
	}

	/** An arrowhead on the circle at `deg`, pointing clockwise (`dir` 1) or anticlockwise (-1). */
	function head(r: number, deg: number, dir: 1 | -1, size = 0.5): string {
		const [tx, ty] = polar(r, deg + dir * 11);
		const [ox, oy] = polar(r + size, deg);
		const [ix, iy] = polar(r - size, deg);
		return `M${tx.toFixed(3)} ${ty.toFixed(3)}L${ox.toFixed(3)} ${oy.toFixed(3)}L${ix.toFixed(3)} ${iy.toFixed(3)}Z`;
	}

	/** Turn either way: an arc over the top with a head at each end. */
	function turnArrows(r: number) {
		return { arc: arc(r, -46, 46), heads: [head(r, 46, 1), head(r, -46, -1)] };
	}

	const box = $derived.by(() => {
		switch (art.kind) {
			case 'key': {
				const h = KEY_HALF;
				return stacked
					? `${-h} ${-h - STACK} ${2 * h + STACK} ${2 * h + STACK}`
					: `${-h} ${-h} ${2 * h} ${2 * h}`;
			}
			case 'encoder':
				return `${-ENCODER_HALF} ${-ENCODER_HALF} ${2 * ENCODER_HALF} ${2 * ENCODER_HALF}`;
			case 'volume':
				return `${-KEY_HALF} ${-KEY_HALF} ${2 * KEY_HALF} ${2 * KEY_HALF}`;
			case 'pitchbend':
				return '-7.6 -3.1 15.2 6.2';
			case 'power':
				return '-6.2 -3.1 12.4 6.2';
		}
	});
</script>

{#snippet tile(h: number)}
	<rect x={-h} y={-h} width={2 * h} height={2 * h} rx={TILE_R} fill="currentColor" />
	<rect x={-h} y={-h} width={2 * h} height={2 * h} rx={TILE_R} fill={url('tile')} />
	<rect
		x={-h + 0.14}
		y={-h + 0.14}
		width={2 * h - 0.28}
		height={2 * h - 0.28}
		rx={TILE_R - 0.14}
		fill="none"
		stroke={url('rim')}
		stroke-width="0.28"
	/>
{/snippet}

{#snippet key(k: KeyGlyphArt)}
	<g style:color={k.colors.tile}>{@render tile(KEY_HALF)}</g>
	<circle cx="0.1" cy="0.55" r={k.capR + 0.5} fill="#000000" fill-opacity={k.light ? 0.3 : 0.55} />
	<circle r={k.capR} fill={k.colors.cap} />
	<circle r={k.capR} fill={url(k.light ? 'sheen-light' : 'sheen')} />
	<circle
		r={k.capR - 0.1}
		fill="none"
		stroke={url(k.light ? 'edge-light' : 'edge')}
		stroke-width="0.22"
	/>
	{#each k.legend as path (path.d)}
		<path
			d={path.d}
			fill={path.stroke ? 'none' : k.colors.legend}
			stroke={path.stroke ? k.colors.legend : undefined}
			stroke-width={path.stroke}
			fill-rule={path.rule}
		/>
	{/each}
	{#if k.led}
		<circle cx={k.led.x} cy={k.led.y + 0.06} r={k.led.r} fill="#ffffff" fill-opacity="0.08" />
		<circle cx={k.led.x} cy={k.led.y} r={k.led.r} fill="#1d1f22" />
	{/if}
	{#if k.mark}
		<text
			class="glyph__mark"
			y={k.led ? 2.35 : 1.35}
			text-anchor="middle"
			fill={k.light ? '#1d1f22' : '#f2f1ee'}
			fill-opacity={k.light ? 0.62 : 0.78}>{k.mark}</text
		>
	{/if}
{/snippet}

<svg
	class={['glyph', `glyph--${art.kind}`]}
	viewBox={box}
	role="img"
	aria-label={name}
	xmlns="http://www.w3.org/2000/svg"
>
	<defs>
		<linearGradient id="{uid}-tile" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#ffffff" stop-opacity="0.05" />
			<stop offset="0.5" stop-color="#ffffff" stop-opacity="0" />
			<stop offset="1" stop-color="#000000" stop-opacity="0.16" />
		</linearGradient>
		<!-- the tile's chamfer: light along the back and left, dark along the front -->
		<linearGradient id="{uid}-rim" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#ffffff" stop-opacity="0.22" />
			<stop offset="0.45" stop-color="#ffffff" stop-opacity="0.06" />
			<stop offset="0.6" stop-color="#000000" stop-opacity="0.12" />
			<stop offset="1" stop-color="#000000" stop-opacity="0.5" />
		</linearGradient>
		<radialGradient id="{uid}-sheen" cx="0.42" cy="0.3" r="0.78">
			<stop offset="0" stop-color="#ffffff" stop-opacity="0.08" />
			<stop offset="0.55" stop-color="#ffffff" stop-opacity="0.015" />
			<stop offset="0.85" stop-color="#000000" stop-opacity="0.06" />
			<stop offset="1" stop-color="#000000" stop-opacity="0.18" />
		</radialGradient>
		<radialGradient id="{uid}-sheen-light" cx="0.42" cy="0.3" r="0.78">
			<stop offset="0" stop-color="#ffffff" stop-opacity="0.14" />
			<stop offset="0.55" stop-color="#ffffff" stop-opacity="0.02" />
			<stop offset="0.85" stop-color="#000000" stop-opacity="0.04" />
			<stop offset="1" stop-color="#000000" stop-opacity="0.12" />
		</radialGradient>
		<linearGradient id="{uid}-edge" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#ffffff" stop-opacity="0.3" />
			<stop offset="0.25" stop-color="#ffffff" stop-opacity="0.05" />
			<stop offset="0.45" stop-color="#000000" stop-opacity="0.2" />
			<stop offset="1" stop-color="#000000" stop-opacity="0.62" />
		</linearGradient>
		<linearGradient id="{uid}-edge-light" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#ffffff" stop-opacity="0.6" />
			<stop offset="0.28" stop-color="#ffffff" stop-opacity="0.08" />
			<stop offset="0.5" stop-color="#000000" stop-opacity="0.08" />
			<stop offset="1" stop-color="#000000" stop-opacity="0.34" />
		</linearGradient>
		<linearGradient id="{uid}-side" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#ffffff" stop-opacity="0.26" />
			<stop offset="0.3" stop-color="#ffffff" stop-opacity="0.04" />
			<stop offset="0.6" stop-color="#000000" stop-opacity="0.1" />
			<stop offset="1" stop-color="#000000" stop-opacity="0.42" />
		</linearGradient>
		<linearGradient id="{uid}-face" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#ffffff" stop-opacity="0.07" />
			<stop offset="0.55" stop-color="#ffffff" stop-opacity="0" />
			<stop offset="1" stop-color="#000000" stop-opacity="0.12" />
		</linearGradient>
		<!-- a cap's rounded edge rolling away from the eye -->
		<radialGradient id="{uid}-fillet" cx="0.5" cy="0.5" r="0.5">
			<stop offset="0.8" stop-color="#000000" stop-opacity="0" />
			<stop offset="1" stop-color="#000000" stop-opacity="0.3" />
		</radialGradient>
		<linearGradient id="{uid}-rubber" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#58606c" />
			<stop offset="0.35" stop-color="#363c45" />
			<stop offset="1" stop-color="#1c1f24" />
		</linearGradient>
		<linearGradient id="{uid}-switch" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0" stop-color="#9c9a97" />
			<stop offset="0.35" stop-color="#d9d7d4" />
			<stop offset="1" stop-color="#b3b1ae" />
		</linearGradient>
	</defs>

	{#if art.kind === 'key'}
		{#if stacked}
			<g transform="translate({STACK} {-STACK})" opacity="0.55">{@render key(art)}</g>
		{/if}
		{@render key(art)}
	{:else if art.kind === 'encoder'}
		<!-- the dish with its groove, the knob's shadow, its side lit at the back, the coloured cap
		     with a rounded edge -->
		<circle r="6.45" fill={art.colors.dish} />
		<circle r="6.3" fill="none" stroke="#000000" stroke-opacity="0.6" stroke-width="0.28" />
		<circle cx="0.15" cy="0.75" r="5.35" fill="#000000" fill-opacity="0.5" />
		<circle r="5" fill={art.colors.body} />
		<circle r="5" fill={url('side')} />
		<circle r={art.top + 0.1} fill="#000000" fill-opacity="0.55" />
		<circle r={art.top} fill={art.colors.cap} />
		<circle r={art.top} fill={url('face')} />
		<circle r={art.top} fill={url('fillet')} />
		<path
			d={arc(art.top - 0.28, -48, 48)}
			fill="none"
			stroke="#ffffff"
			stroke-opacity={art.tone >= 2 ? 0.55 : 0.3}
			stroke-width="0.34"
			stroke-linecap="round"
		/>
		{#if turn}
			{@const arrows = turnArrows(5.72)}
			<g class="glyph__turn">
				<path d={arrows.arc} fill="none" stroke-width="0.4" stroke-linecap="round" />
				{#each arrows.heads as d (d)}<path {d} />{/each}
			</g>
		{/if}
	{:else if art.kind === 'volume'}
		<g style:color={art.colors.tile}>{@render tile(KEY_HALF)}</g>
		<circle r="5.65" fill="#000000" fill-opacity="0.72" />
		<circle r="5.1" fill={art.colors.tile} />
		<circle r="5.1" fill={url('side')} opacity="0.5" />
		<circle r="3.95" fill="#000000" fill-opacity="0.45" />
		<circle r="3.85" fill={art.colors.body} />
		<circle r="3.85" fill={url('face')} />
		<circle cy={-art.dimple.reach + 0.06} r={art.dimple.r} fill="#ffffff" fill-opacity="0.14" />
		<circle cy={-art.dimple.reach} r={art.dimple.r} fill="#070708" />
		{#if turn}
			{@const arrows = turnArrows(4.55)}
			<g class="glyph__turn">
				<path d={arrows.arc} fill="none" stroke-width="0.4" stroke-linecap="round" />
				{#each arrows.heads as d (d)}<path {d} />{/each}
			</g>
		{/if}
	{:else if art.kind === 'pitchbend'}
		<rect x="-7.2" y="-2.5" width="14.4" height="5" rx="2.5" fill={url('rubber')} />
		<rect
			x="-0.25"
			y="-1.9"
			width="0.5"
			height="3.8"
			rx="0.25"
			fill="#000000"
			fill-opacity="0.35"
		/>
	{:else if art.kind === 'power'}
		<rect
			x="-5.6"
			y="-2.3"
			width="11.2"
			height="4.6"
			rx="1.2"
			fill={url('switch')}
			stroke="#8d8b88"
			stroke-width="0.2"
		/>
	{/if}
</svg>

<style>
	.glyph {
		display: inline-block;
		flex: none;
		height: var(--glyph-size, 1.7em);
		width: auto;
		overflow: visible;
		vertical-align: middle;
	}

	.glyph__mark {
		font-family: var(--xy-font-sans, system-ui, sans-serif);
		font-size: 3.7px;
		font-weight: 500;
	}

	/* arrows on the dark dish: always light, whatever the page's colour */
	.glyph__turn {
		fill: #f4f3f1;
		stroke: #f4f3f1;
		opacity: 0.92;
	}
</style>
