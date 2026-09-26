<!--
@component
Small label text in the device's voice: the printed legends on keys, the labels on the screen, form
labels, captions. Write the text in lowercase yourself (TE copy is lowercase); the component never
transforms case, so names like "OP-XY" or "M1" survive when you need them.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes, HTMLLabelAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLAttributes<HTMLElement> & HTMLLabelAttributes, 'children'> {
		/** Element to render. Use `label` (with `for`) for form labels. */
		as?: 'span' | 'p' | 'div' | 'label' | 'dt' | 'dd' | 'figcaption' | 'legend' | 'h2' | 'h3';
		/** 11 px, 12 px or 14 px. */
		size?: '2xs' | 'xs' | 'sm';
		/**
		 * `muted` everyday labels, `subtle` quieter captions, `print` the warm off-white of key legends,
		 * `fg` full strength, `accent` red (only for live or destructive states).
		 */
		tone?: 'fg' | 'muted' | 'subtle' | 'print' | 'accent';
		children: Snippet;
	}

	let {
		as = 'span',
		size = 'xs',
		tone = 'muted',
		class: className,
		children,
		...rest
	}: Props = $props();
</script>

<svelte:element
	this={as}
	class={['legend', `legend--${size}`, `legend--${tone}`, className]}
	{...rest}
>
	{@render children()}
</svelte:element>

<style>
	.legend {
		margin: 0;
		font-family: var(--xy-font-sans);
		font-weight: var(--xy-weight-regular);
		letter-spacing: var(--xy-tracking-label);
	}

	.legend--2xs {
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		/* A touch heavier so 11 px stays crisp on dark backgrounds. */
		font-weight: 450;
	}

	.legend--xs {
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: 450;
	}

	.legend--sm {
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		letter-spacing: 0;
	}

	.legend--fg {
		color: var(--xy-fg);
	}

	.legend--muted {
		color: var(--xy-fg-muted);
	}

	.legend--subtle {
		color: var(--xy-fg-subtle);
	}

	.legend--print {
		color: var(--xy-key-legend);
	}

	.legend--accent {
		color: var(--xy-accent-text);
	}
</style>
