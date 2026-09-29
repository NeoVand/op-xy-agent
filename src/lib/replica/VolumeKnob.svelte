<!--
@component
The analog volume pot in the left half of its 2 × 1 tile: a knob with a pointer dimple, standing
in a round hole, sized and placed from TE's drawing and shaded as TE's top-down photo shows it. It
starts in the middle, its dimple straight up, and sets the app's output level (AppSound;
`volumeGain`). Its travel (300°) is unverified on hardware.

Input: a drag turns it the way it would turn under a finger (as the encoders: `clockwisePx`), the
wheel, arrow keys / Page Up/Down / Home / End.
-->
<svelte:options namespace="svg" />

<script lang="ts">
	import { VOLUME_PART } from './geometry';
	import { capturePointer, clockwisePx, wheel, wheelSteps } from './input';
	import { VOLUME_TRAVEL, type ReplicaState } from './state.svelte';

	interface Props {
		replica: ReplicaState;
	}

	let { replica }: Props = $props();

	const { art, tile, colors } = VOLUME_PART;
	/** Distance of the dimple from the knob centre, as drawn. */
	const reach = Math.hypot(art.dimple.x, art.dimple.y);
	/** The knob inside its hole, and its flat top (TE's top-down photo; the drawing's outer circle
	 * is the hole). */
	const KNOB_R = art.outer - 0.4;
	const TOP_R = 3.85;
	/** Drag distance (px) for the whole travel. */
	const DRAG_RANGE = 160;
	const STEP = 0.02;

	const volume = $derived(replica.volume);
	const angle = $derived(-VOLUME_TRAVEL / 2 + VOLUME_TRAVEL * volume);
	const highlight = $derived(replica.highlight('knob.volume'));
	const hint = $derived(replica.turnHint('knob.volume'));

	let drag: { pointer: number; lastX: number; lastY: number; ux: number; uy: number } | null = null;
	const wheelAcc = { value: 0 };

	const set = (value: number, source: 'pointer' | 'keyboard') =>
		replica.setVolume(Math.min(1, Math.max(0, value)), source);

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		capturePointer(event);
		// where on the knob it was grabbed (its centre is this group's origin), for the turn's sense
		const m = (event.currentTarget as SVGGElement).getScreenCTM();
		let ux = 0;
		let uy = 0;
		if (m) {
			const rx = event.clientX - m.e;
			const ry = event.clientY - m.f;
			const r = Math.hypot(rx, ry);
			if (r > 0.35 * art.outer * Math.hypot(m.a, m.b)) {
				ux = rx / r;
				uy = ry / r;
			}
		}
		drag = { pointer: event.pointerId, lastX: event.clientX, lastY: event.clientY, ux, uy };
	}

	function onpointermove(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointer) return;
		const px = clockwisePx(
			event.clientX - drag.lastX,
			event.clientY - drag.lastY,
			drag.ux,
			drag.uy
		);
		drag.lastX = event.clientX;
		drag.lastY = event.clientY;
		if (px !== 0) set(replica.volume + px / DRAG_RANGE, 'pointer');
	}

	function end(event: PointerEvent) {
		if (drag?.pointer === event.pointerId) drag = null;
	}

	function onwheel(event: WheelEvent) {
		event.preventDefault();
		const steps = wheelSteps(event, wheelAcc);
		if (steps !== 0) set(replica.volume + steps * STEP, 'pointer');
	}

	function onkeydown(event: KeyboardEvent) {
		const moves: Record<string, (v: number) => number> = {
			ArrowUp: (v) => v + STEP,
			ArrowRight: (v) => v + STEP,
			ArrowDown: (v) => v - STEP,
			ArrowLeft: (v) => v - STEP,
			PageUp: (v) => v + 5 * STEP,
			PageDown: (v) => v - 5 * STEP,
			Home: () => 0,
			End: () => 1
		};
		const move = moves[event.key];
		if (move) {
			event.preventDefault();
			set(move(replica.volume), 'keyboard');
		}
	}
</script>

<g
	class="vol"
	transform="translate({VOLUME_PART.x} {VOLUME_PART.y})"
	data-id="knob.volume"
	data-hl={highlight}
	role="slider"
	tabindex="0"
	aria-label="volume"
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={Math.round(volume * 100)}
	{onpointerdown}
	{onpointermove}
	onpointerup={end}
	onpointercancel={end}
	onlostpointercapture={end}
	{onkeydown}
	{@attach wheel(onwheel)}
>
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

	<!-- TE's top-down photo, measured through the centre: the knob (about 10.2 mm, the encoders'
	     size) stands in a round hole whose black rim shows all round it (the drawing's 11 mm is the
	     hole), and its shadow falls onto the tile in front. The knob is the body's own grey (only
	     the photo's lights make its side look bright): a rounded shoulder catching a little light
	     at the back and dark at the front, a thin dark step, and the flat top, its edge rounded -->
	<circle cx="0.1" cy="0.9" r={art.outer + 1.1} fill="url(#rx-enc-shadow)" />
	<circle r={art.outer + 0.15} fill="#000000" fill-opacity="0.72" />
	<circle r={KNOB_R} fill={colors.tile} />
	<circle r={KNOB_R} fill="url(#rx-vol-side)" />
	<circle r={KNOB_R} fill="url(#rx-roll)" mask="url(#rx-back)" />
	<circle r={KNOB_R - 0.05} fill="none" stroke="#000000" stroke-opacity="0.5" stroke-width="0.1" />
	<circle r={TOP_R + 0.1} fill="#000000" fill-opacity="0.45" />
	<circle r={TOP_R} fill={colors.body} />
	<circle r={TOP_R} fill="url(#rx-enc-face)" />
	<circle r={TOP_R} fill="url(#rx-fillet-edge)" />
	<circle r={TOP_R} fill="url(#rx-fillet-dark)" mask="url(#rx-front)" />
	<circle r={TOP_R} fill="url(#rx-fillet-light)" mask="url(#rx-back)" />
	<g class="vol__turning" style:transform="rotate({angle}deg)">
		<circle r={art.outer} fill="none" />
		<circle cy={-reach + 0.06} r={art.dimple.r} fill="#ffffff" fill-opacity="0.14" />
		<circle cy={-reach} r={art.dimple.r} fill="#070708" />
	</g>

	{#if hint}
		<circle class="vol__ring" r={art.outer + 0.9} />
	{/if}
	<circle class="vol__focus" r={art.outer + 0.5} />
	<rect class="vol__hit" x={tile.x} y={tile.y} width={tile.w / 2} height={tile.h} />
</g>

<style>
	.vol {
		cursor: grab;
		outline: none;
		touch-action: none;
		-webkit-tap-highlight-color: transparent;
	}

	.vol__hit {
		fill: transparent;
	}

	.vol__turning {
		transform-box: fill-box;
		transform-origin: center;
		transition: transform 90ms ease-out;
	}

	.vol__ring,
	.vol__focus {
		fill: none;
		stroke: var(--rx-ring, #f7f5f5);
		stroke-width: 0.32;
		pointer-events: none;
	}

	.vol__focus {
		opacity: 0;
		transition: opacity 160ms ease-out;
	}

	.vol:focus-visible .vol__focus,
	.vol[data-hl] .vol__focus {
		opacity: 1;
	}

	.vol__ring {
		stroke-dasharray: 0.9 0.7;
		opacity: 0.6;
	}

	@media (prefers-reduced-motion: reduce) {
		.vol__turning {
			transition: none;
		}
	}
</style>
