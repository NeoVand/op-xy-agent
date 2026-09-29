<!--
@component
A quiet round icon button for the site around the replica (the caption line's switches, a menu's
opener): no tile, no LED, no label. A switch shows its state by brightness alone: bright while on,
faint while off. The `label` names it for assistive technology and, with `tip`, explains it on
hover.

```svelte
<ToolButton icon={KeyboardIcon} label="computer keyboard" pressed={on} onclick={flip} />
```
-->
<script lang="ts">
	import type { IconSvgElement } from '@hugeicons/svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import HugeIcon from './HugeIcon.svelte';
	import { tooltip } from './tooltip';

	interface Props extends Omit<HTMLButtonAttributes, 'children' | 'aria-label'> {
		icon: IconSvgElement;
		/** What it is, in a few lowercase words. */
		label: string;
		/** A longer explanation on hover and focus; defaults to the label. */
		tip?: string;
		/** A switch's state: bright when on, faint when off. Leave out for a plain button. */
		pressed?: boolean;
	}

	let { icon, label, tip, pressed, class: className, ...rest }: Props = $props();
</script>

<button
	type="button"
	class={['tool', pressed === false && 'tool--off', className]}
	aria-label={label}
	aria-pressed={pressed}
	{@attach tooltip(tip ?? label)}
	{...rest}
>
	<HugeIcon {icon} size="1.0625rem" strokeWidth={1.7} />
</button>

<style>
	.tool {
		display: inline-grid;
		place-items: center;
		width: 1.875rem;
		height: 1.875rem;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--xy-fg-muted);
		cursor: pointer;
		transition:
			color var(--xy-dur-quick, 120ms) var(--xy-ease-standard, ease),
			background-color var(--xy-dur-quick, 120ms) var(--xy-ease-standard, ease);
	}

	.tool[aria-pressed='true'],
	.tool[aria-expanded='true'] {
		color: var(--xy-fg);
	}

	.tool--off {
		color: var(--xy-fg-faint);
	}

	.tool:hover {
		background-color: var(--xy-hover);
		color: var(--xy-fg);
	}

	.tool:focus-visible {
		outline: 1.5px solid var(--xy-fg-muted);
		outline-offset: 1px;
	}

	.tool:disabled {
		cursor: not-allowed;
		color: var(--xy-fg-faint);
		background: none;
	}
</style>
