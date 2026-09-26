<!--
@component
The level meter in the right margin: a column of small LEDs along the line TE draws, lit from the
bottom, crossed by the printed hairline. Segment count (13) and hairline come from TE's product
render; both are unverified on hardware. Only the lit count is reactive.
-->
<svelte:options namespace="svg" />

<script lang="ts">
	import { colorHex } from '$lib/core/opxy';
	import { METER_PART, METER_SEGMENTS } from './geometry';

	interface Props {
		/** Level 0–1. */
		level: number;
	}

	let { level }: Props = $props();

	const lit = $derived(Math.round(Math.min(1, Math.max(0, level)) * METER_SEGMENTS));
	const { x, segments, hairline } = METER_PART;
	const legend = colorHex('legend');
	const W = 0.5;
	const H = 0.62;
</script>

<g class="meter" aria-hidden="true">
	<g stroke={legend} stroke-opacity="0.55" stroke-width="0.09">
		<line x1={hairline.x1} y1={hairline.y} x2={x - hairline.gap} y2={hairline.y} />
		<line x1={x + hairline.gap} y1={hairline.y} x2={hairline.x2} y2={hairline.y} />
	</g>
	{#each segments as segment (segment.index)}
		<g class="meter__led" data-lit={segment.index < lit || undefined}>
			<circle class="meter__glow" cx={x} cy={segment.y} r="1" />
			<rect x={x - W / 2} y={segment.y - H / 2} width={W} height={H} rx="0.16" />
		</g>
	{/each}
</g>

<style>
	.meter__led rect {
		fill: #101114;
		transition: fill 180ms ease-out;
	}

	.meter__glow {
		fill: url(#rx-glow-white);
		opacity: 0;
		transition: opacity 180ms ease-out;
	}

	.meter__led[data-lit] rect {
		fill: var(--rx-led-white, #ffffff);
		transition-duration: 20ms;
	}

	.meter__led[data-lit] .meter__glow {
		opacity: 0.7;
		transition-duration: 20ms;
	}
</style>
