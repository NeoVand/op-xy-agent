<!--
@component
A separator. `hairline` is a 1 px line; `groove` is the machined recess between tiles: a dark cut
with a faint highlight on its lower lip.
-->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		orientation?: 'horizontal' | 'vertical';
		variant?: 'hairline' | 'groove';
		/** Purely visual (the default) or a real separator announced to assistive technology. */
		decorative?: boolean;
	}

	let {
		orientation = 'horizontal',
		variant = 'hairline',
		decorative = true,
		class: className,
		...rest
	}: Props = $props();
</script>

<div
	class={['divider', `divider--${orientation}`, `divider--${variant}`, className]}
	role={decorative ? 'presentation' : 'separator'}
	aria-orientation={decorative ? undefined : orientation}
	{...rest}
></div>

<style>
	.divider {
		flex: none;
	}

	.divider--horizontal {
		width: 100%;
		height: 1px;
	}

	.divider--vertical {
		align-self: stretch;
		width: 1px;
		min-height: 1em;
	}

	.divider--hairline {
		background-color: var(--xy-line);
	}

	.divider--horizontal.divider--groove {
		height: 2px;
		background: linear-gradient(to bottom, var(--xy-mat-gap) 50%, rgb(255 255 255 / 0.05) 50%);
	}

	.divider--vertical.divider--groove {
		width: 2px;
		background: linear-gradient(to right, var(--xy-mat-gap) 50%, rgb(255 255 255 / 0.05) 50%);
	}

	:global([data-theme='light']) .divider--groove.divider--horizontal {
		background: linear-gradient(to bottom, rgb(15 14 18 / 0.16) 50%, rgb(255 255 255 / 0.9) 50%);
	}

	:global([data-theme='light']) .divider--groove.divider--vertical {
		background: linear-gradient(to right, rgb(15 14 18 / 0.16) 50%, rgb(255 255 255 / 0.9) 50%);
	}
</style>
