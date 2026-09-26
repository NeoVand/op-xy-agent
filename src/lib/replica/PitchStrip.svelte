<!--
@component
The pressure-sensitive pitch-bend pad on the front edge (a rubber pill; from above only a sliver
shows below the body, exactly as TE draws it). Press left of centre to bend down, right to bend
up; it springs back on release. The replica adds a light cue along the edge while bending. The
hit area extends onto the front margin so the pad is easy to reach.

Keyboard: hold ← or → to bend.
-->
<svelte:options namespace="svg" />

<script lang="ts">
	import { PANEL_ART } from './art.generated';
	import { capturePointer } from './input';
	import type { ReplicaState } from './state.svelte';

	interface Props {
		replica: ReplicaState;
	}

	let { replica }: Props = $props();

	const { d, box } = PANEL_ART.pitchBend;
	const cx = box.x + box.w / 2;
	const half = box.w / 2 - 0.8;
	const hit = { x: box.x, y: box.y - 3.6, w: box.w, h: box.h + 6.6 };

	const bend = $derived(replica.bend);
	const highlight = $derived(replica.highlight('strip.pitchbend'));

	let pointer: number | null = null;
	let key: string | null = null;

	function bendAt(event: PointerEvent) {
		const rect = (event.currentTarget as Element).getBoundingClientRect();
		const value = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		replica.setBend(Math.min(1, Math.max(-1, Math.round(value * 100) / 100)), 'pointer');
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		pointer = event.pointerId;
		capturePointer(event);
		bendAt(event);
	}

	function onpointermove(event: PointerEvent) {
		if (event.pointerId === pointer) bendAt(event);
	}

	function end(event: PointerEvent) {
		if (event.pointerId !== pointer) return;
		pointer = null;
		replica.setBend(0, 'pointer');
	}

	function onkeydown(event: KeyboardEvent) {
		if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.repeat) {
			event.preventDefault();
			key = event.key;
			replica.setBend(event.key === 'ArrowLeft' ? -0.6 : 0.6, 'keyboard');
		}
	}

	function onkeyup(event: KeyboardEvent) {
		if (event.key === key) {
			key = null;
			replica.setBend(0, 'keyboard');
		}
	}
</script>

<g
	class="bend"
	data-hl={highlight}
	data-active={bend !== 0 || undefined}
	role="slider"
	tabindex="0"
	aria-label="pitch bend"
	aria-valuemin={-100}
	aria-valuemax={100}
	aria-valuenow={Math.round(bend * 100)}
	{onpointerdown}
	{onpointermove}
	onpointerup={end}
	onpointercancel={end}
	onlostpointercapture={end}
	{onkeydown}
	{onkeyup}
	onblur={() => key && replica.setBend(0, 'keyboard')}
>
	<path {d} fill="url(#rx-rubber)" />
	<path {d} fill="none" stroke="#0b0c0e" stroke-width="0.1" />
	<g class="bend__cue" transform="translate({cx} {box.y - 0.15})">
		<rect
			class="bend__bar"
			x="0"
			y="-0.16"
			width={half}
			height="0.32"
			rx="0.16"
			style:--bend={bend}
		/>
	</g>
	<rect
		class="bend__ring"
		x={box.x - 0.4}
		y={box.y - 0.6}
		width={box.w + 0.8}
		height={box.h + 1}
		rx="0.6"
	/>
	<rect class="bend__hit" x={hit.x} y={hit.y} width={hit.w} height={hit.h} />
</g>

<style>
	.bend {
		cursor: ew-resize;
		outline: none;
		touch-action: none;
		-webkit-tap-highlight-color: transparent;
	}

	.bend__hit {
		fill: transparent;
	}

	.bend__bar {
		fill: var(--rx-led-white, #ffffff);
		opacity: 0;
		transform-box: fill-box;
		transform-origin: left center;
		transform: scaleX(var(--bend));
		transition:
			transform 260ms var(--rx-ease-release, ease-out),
			opacity 260ms ease-out;
	}

	.bend[data-active] .bend__bar {
		opacity: 0.85;
		transition-duration: 40ms;
	}

	.bend__ring {
		fill: none;
		stroke: var(--rx-ring, #f7f5f5);
		stroke-width: 0.28;
		opacity: 0;
		pointer-events: none;
	}

	.bend:focus-visible .bend__ring,
	.bend[data-hl] .bend__ring {
		opacity: 1;
	}
</style>
