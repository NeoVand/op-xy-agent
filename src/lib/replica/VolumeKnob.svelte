<!--
@component
The analog volume pot in the left half of its 2 × 1 tile: a tall knurled knob with a pointer
dimple, sized and placed from TE's drawing. At rest the dimple sits where TE draws it. Its
travel (300°) is unverified on hardware.

Input: vertical drag, the wheel, arrow keys / Page Up/Down / Home / End.
-->
<svelte:options namespace="svg" />

<script lang="ts">
	import { VOLUME_PART } from './geometry';
	import { capturePointer, wheel, wheelSteps } from './input';
	import { knurlPath } from './shapes';
	import { VOLUME_TRAVEL, type ReplicaState } from './state.svelte';

	interface Props {
		replica: ReplicaState;
	}

	let { replica }: Props = $props();

	const { art, tile, colors } = VOLUME_PART;
	/** Distance of the dimple from the knob centre, as drawn. */
	const reach = Math.hypot(art.dimple.x, art.dimple.y);
	const knurl = knurlPath(art.top + 0.25, art.outer - 0.06, 48);
	/** Drag distance (px) for the whole travel. */
	const DRAG_RANGE = 160;
	const STEP = 0.02;

	const volume = $derived(replica.volume);
	const angle = $derived(-VOLUME_TRAVEL / 2 + VOLUME_TRAVEL * volume);
	const highlight = $derived(replica.highlight('knob.volume'));
	const hint = $derived(replica.turnHint('knob.volume'));

	let drag: { pointer: number; lastY: number } | null = null;
	const wheelAcc = { value: 0 };

	const set = (value: number, source: 'pointer' | 'keyboard') =>
		replica.setVolume(Math.min(1, Math.max(0, value)), source);

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		capturePointer(event);
		drag = { pointer: event.pointerId, lastY: event.clientY };
	}

	function onpointermove(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointer) return;
		const dy = drag.lastY - event.clientY;
		drag.lastY = event.clientY;
		if (dy !== 0) set(replica.volume + dy / DRAG_RANGE, 'pointer');
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

	<circle cy="1.35" r={art.outer + 1.4} fill="url(#rx-knob-shadow)" />
	<circle r={art.outer} fill={colors.body} />
	<g class="vol__turning" style:transform="rotate({angle}deg)">
		<path d={knurl} stroke="#ffffff" stroke-opacity="0.12" stroke-width="0.12" />
	</g>
	<circle r={art.outer} fill="url(#rx-knob-shade)" />
	<circle
		r={art.outer - 0.06}
		fill="none"
		stroke="#000000"
		stroke-opacity="0.5"
		stroke-width="0.12"
	/>
	<circle r={art.top} fill="url(#rx-knob-top)" />
	<circle r={art.top - 0.07} fill="none" stroke="url(#rx-knob-rim)" stroke-width="0.16" />
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
		cursor: ns-resize;
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
