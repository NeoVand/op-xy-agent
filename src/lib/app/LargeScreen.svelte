<!--
@component
The replica's display, large: its pixels at the display's own proportions in a thin frame, drawn
big and crisp from the same frames as the replica's display (the page's frame source). It sits over
the device (DeviceStage's `above`), its left edge on the small display's, grows out of that corner
and goes back into it; a click on it puts it away. The page sets its height with
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

	const { active } = SCREEN_PART;
	const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(4)}%`;
	/** The pixels' place on the panel (their left edge), their proportions and their corners. */
	const pixels = {
		left: pct(active.x, PANEL_W),
		ratio: (active.w / active.h).toFixed(4),
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

<div class="large" style:--pixels-left={pixels.left} style:--pixels-ratio={pixels.ratio}>
	<div class="large__frame" transition:grow>
		<div class="large__pixels" style:border-radius={pixels.radius}>
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

	/* the pixels in a thin frame: a band of the device's glass, lit a little at its edge; the
	 * pixels keep the display's proportions (the ratio is the content box's), all of it --h tall */
	.large__frame {
		--band: 3px;
		position: relative;
		flex: none;
		box-sizing: content-box;
		height: calc(var(--h) - 2 * var(--band));
		aspect-ratio: var(--pixels-ratio);
		/* the pixels on the small display's left edge, as far as the stage leaves room */
		margin-left: max(
			0px,
			min(
				var(--pixels-left) - var(--band),
				100% - (var(--h) - 2 * var(--band)) * var(--pixels-ratio) - 2 * var(--band)
			)
		);
		padding: var(--band);
		border-radius: 0.5rem;
		transform-origin: 0 100%;
		background-color: #141517;
		box-shadow:
			inset 0 0 0 1px rgb(255 255 255 / 0.07),
			0 0 0 1px rgb(0 0 0 / 0.6),
			0 1rem 2rem -0.75rem rgb(0 0 0 / 0.5);
	}

	:global([data-theme='light']) .large__frame {
		box-shadow:
			inset 0 0 0 1px rgb(255 255 255 / 0.07),
			0 0 0 1px rgb(15 14 18 / 0.35),
			0 1rem 2rem -0.75rem rgb(15 14 18 / 0.3);
	}

	.large__pixels {
		width: 100%;
		height: 100%;
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
