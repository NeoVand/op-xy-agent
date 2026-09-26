<!--
@component
One of our own UI icons (see `icons.ts`). Decorative by default; pass `label` when the icon is the
only thing that carries meaning.
-->
<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import { icons, type IconName, type IconShape } from './icons';

	interface Props extends Omit<SVGAttributes<SVGSVGElement>, 'children'> {
		/** Which icon to draw. */
		name: IconName;
		/** Rendered size; any CSS length. Defaults to 1em so icons follow the text size. */
		size?: string;
		/** Accessible name. Without it the icon is hidden from assistive technology. */
		label?: string;
		/** Stroke width in grid units (the grid is 24 wide). */
		weight?: number;
	}

	let { name, size = '1em', label, weight = 1.6, ...rest }: Props = $props();

	const shapes: IconShape[] = $derived(icons[name]);
</script>

<svg
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill="none"
	stroke="currentColor"
	stroke-width={weight}
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	focusable="false"
	{...rest}
>
	{#each shapes as shape (shape.d)}
		<path
			d={shape.d}
			fill={shape.fill ? 'currentColor' : 'none'}
			stroke={shape.fill ? 'none' : 'currentColor'}
			stroke-linecap={shape.cap}
			stroke-width={shape.width}
		/>
	{/each}
</svg>

<style>
	svg {
		flex: none;
		display: inline-block;
		vertical-align: middle;
	}
</style>
