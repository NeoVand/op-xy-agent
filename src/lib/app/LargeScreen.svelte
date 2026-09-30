<!--
@component
The replica's display, large: its glass tile at the device's own proportions, the pixels drawn big
and crisp from the same frames as the replica's display (the page's frame source). It sits over the
device (DeviceStage's `above`), its left edge on the small display's, grows out of that corner and
goes back into it; a click on it puts it away. The page sets its height, the glass tile's, with
`--large-screen-h` (the room it has above the device).

```svelte
<DeviceStage above={large ? display : undefined}>…</DeviceStage>

{#snippet display()}
	<LargeScreen {replica} onclose={() => (large = false)} />
{/snippet}
```
-->
<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import type { TransitionConfig } from 'svelte/transition';
	import type { ReplicaState } from '$lib/replica';
	import { PANEL_W, SCREEN_PART } from '$lib/replica/geometry';
	import Screen from '$lib/replica/Screen.svelte';
	import { tooltip } from '$lib/ui';

	interface Props {
		replica: ReplicaState;
		/** Puts the display away (a click on it). */
		onclose: () => void;
	}

	let { replica, onclose }: Props = $props();

	/** How long it takes to grow out of the small display and to go back, ms. */
	const GROW_MS = 420;

	const { tile, active } = SCREEN_PART;
	/** The glass tile's corner on the panel, millimetres. */
	const tileX = SCREEN_PART.x + tile.x;
	const tileY = SCREEN_PART.y + tile.y;
	const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(4)}%`;
	const glass = {
		left: pct(tileX, PANEL_W),
		ratio: (tile.w / tile.h).toFixed(4),
		radius: `${pct(tile.r, tile.w)} / ${pct(tile.r, tile.h)}`
	};
	const pixels = {
		left: pct(active.x - tileX, tile.w),
		top: pct(active.y - tileY, tile.h),
		width: pct(active.w, tile.w),
		height: pct(active.h, tile.h),
		radius: `${pct(active.r, active.w)} / ${pct(active.r, active.h)}`
	};

	/** Grows out of its lower left corner, over the small display, and shrinks back into it. */
	function grow(node: Element): TransitionConfig {
		const calm = node.ownerDocument.defaultView?.matchMedia(
			'(prefers-reduced-motion: reduce)'
		).matches;
		return {
			duration: calm ? 0 : GROW_MS,
			easing: cubicOut,
			css: (t) => `transform: scale(${0.35 + 0.65 * t}); opacity: ${Math.min(1, t * 1.6)};`
		};
	}
</script>

<div class="large" style:--glass-left={glass.left} style:--glass-ratio={glass.ratio}>
	<div class="large__glass" style:border-radius={glass.radius} transition:grow>
		<div
			class="large__pixels"
			style:left={pixels.left}
			style:top={pixels.top}
			style:width={pixels.width}
			style:height={pixels.height}
			style:border-radius={pixels.radius}
		>
			<Screen lines={replica.screen.lines} speak={false} />
		</div>
		<button
			type="button"
			class="large__close"
			aria-label="put the large display away"
			onclick={onclose}
			{@attach tooltip('put it back · esc', { describe: false })}
		></button>
	</div>
</div>

<style>
	.large {
		--h: var(--large-screen-h, 13rem);
		display: flex;
	}

	/* the device's black glass tile, magnified; its sheen under the pixels, as on the device */
	.large__glass {
		position: relative;
		flex: none;
		height: var(--h);
		aspect-ratio: var(--glass-ratio);
		/* on the small display's left edge, as far as the stage leaves room */
		margin-left: max(0px, min(var(--glass-left), 100% - var(--h) * var(--glass-ratio)));
		transform-origin: 0 100%;
		background:
			linear-gradient(
				160deg,
				rgb(255 255 255 / 0.07) 0%,
				rgb(255 255 255 / 0.015) 35%,
				rgb(255 255 255 / 0) 70%
			),
			#141517;
		box-shadow:
			0 0 0 1px rgb(0 0 0 / 0.6),
			0 0.25rem 0.75rem rgb(0 0 0 / 0.35),
			0 1.25rem 2.5rem -0.75rem rgb(0 0 0 / 0.5);
	}

	.large__pixels {
		position: absolute;
		overflow: hidden;
		background: #000000;
	}

	.large__close {
		position: absolute;
		inset: 0;
		padding: 0;
		border: 0;
		border-radius: inherit;
		background: transparent;
		cursor: zoom-out;
	}

	.large__close:focus-visible {
		outline: 1.5px solid var(--xy-focus);
		outline-offset: 3px;
	}
</style>
