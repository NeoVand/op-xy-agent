<!--
@component
A surface. Panels differ by material, not by decoration:
- `plate`: the anodised panel that carries controls (hairline edge, tile radius).
- `screen`: black glass with warm-white type, like the device display (same in both themes).
- `card`: the screen's white card, for the one thing that needs attention (an approval, a result).
- `sunken`: a recess, for inputs, logs and wells.
- `device`: the replica's own anodised aluminium (its gradient, rim catch-light and dark outline),
  for a panel that sits beside the replica as part of the instrument, its text the legend print; in
  the light theme, the same slab in the guide's paper and ink.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { PanelVariant } from './types';

	interface Props extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> {
		variant?: PanelVariant;
		/** Landmark or plain box. */
		as?: 'section' | 'div' | 'aside' | 'article';
		/** Header title (lowercase). */
		title?: string;
		/** Heading level for `title`. */
		titleLevel?: 2 | 3 | 4;
		/** Replaces the default header content (title). */
		header?: Snippet;
		/** Right side of the header: small keys, status. */
		actions?: Snippet;
		/** Inner padding of the body. */
		padding?: 'none' | 'sm' | 'md' | 'lg';
		children?: Snippet;
	}

	let {
		variant = 'plate',
		as = 'section',
		title,
		titleLevel = 2,
		header,
		actions,
		padding = 'md',
		class: className,
		children,
		...rest
	}: Props = $props();

	const uid = $props.id();
	const titleId = `${uid}-title`;
	const hasHeader = $derived(Boolean(title || header || actions));
</script>

<svelte:element
	this={as}
	class={['panel', `panel--${variant}`, className]}
	aria-labelledby={title && !rest['aria-label'] ? titleId : undefined}
	{...rest}
>
	{#if hasHeader}
		<header class="panel__head">
			{#if header}
				{@render header()}
			{:else if title}
				<svelte:element this={`h${titleLevel}`} id={titleId} class="panel__title">
					{title}
				</svelte:element>
			{/if}
			{#if actions}
				<div class="panel__actions">{@render actions()}</div>
			{/if}
		</header>
	{/if}
	{#if children}
		<div class={['panel__body', `panel__body--${padding}`]}>
			{@render children()}
		</div>
	{/if}
</svelte:element>

<style>
	.panel {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		border-radius: var(--xy-radius-tile);
	}

	.panel--plate {
		background-color: var(--xy-surface);
		box-shadow: var(--xy-shadow-plate);
		color: var(--xy-fg);
	}

	.panel--screen {
		background-color: var(--xy-scr-bg);
		border-radius: var(--xy-radius-screen);
		color: var(--xy-scr-fg);
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 0.07),
			0 0 0 3px var(--xy-mat-glass);
		overflow: hidden;
	}

	/* A faint reflection across the glass. Never over the pixels' own contrast. */
	.panel--screen::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: linear-gradient(160deg, rgb(255 255 255 / 0.045), transparent 38%);
		pointer-events: none;
	}

	.panel--card {
		background-color: var(--xy-scr-card);
		color: var(--xy-scr-card-fg);
		border-radius: var(--xy-radius-card);
		--xy-fg: var(--xy-ink);
		--xy-fg-muted: var(--xy-ramp-2);
		--xy-fg-subtle: var(--xy-ramp-3);
		--xy-line: #dcdada;
	}

	/* On paper the card is drawn the way the guide draws it: an ink outline. */
	:global([data-theme='light']) .panel--card {
		background-color: #ffffff;
		box-shadow:
			0 0 0 1px var(--xy-ink),
			0 2px 8px rgb(15 14 18 / 0.08);
	}

	/* The chassis of the replica (see ReplicaDefs' rx-body and rx-rim), in its darkest anodising:
	 * lit along the back edge, a faint catch-light along the front, a dark outline where it meets the
	 * desk. Dark theme only; the light theme's slab is below. */
	:global([data-theme='dark']) .panel--device {
		--xy-fg: var(--xy-mat-legend);
		--xy-fg-muted: #b9b8b5;
		--xy-fg-subtle: #909195;
		--xy-fg-faint: #6c6e73;
		--xy-line: rgb(0 0 0 / 0.55);
		--xy-hover: rgb(255 255 255 / 0.045);
		--xy-surface: #1d1e21;
		--xy-surface-raised: #1d1e21;
		/* its wells (the composer, your messages, fields) sit a step below the slab */
		--xy-surface-sunken: #0b0b0d;
		border-radius: 1rem;
		background: linear-gradient(to bottom, #17181b, #151619 45%, #131417);
		color: var(--xy-fg);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.08),
			inset 0 -1px 0 rgb(255 255 255 / 0.035),
			0 0 0 1px #0a0b0d,
			0 1.5rem 3rem -1.5rem rgb(0 0 0 / 0.6);
	}

	/* the header sits on a groove, like the gap between the replica's tiles */
	:global([data-theme='dark']) .panel--device .panel__head {
		border-bottom-color: rgb(0 0 0 / 0.6);
		box-shadow: 0 1px 0 rgb(255 255 255 / 0.03);
	}

	/* on paper: the same slab, white with a soft edge, its wells the page's paper */
	:global([data-theme='light']) .panel--device {
		--xy-surface-sunken: var(--xy-bg);
		border-radius: 1rem;
		background: linear-gradient(to bottom, #ffffff, #fbfaf9 45%, #f5f4f3);
		color: var(--xy-fg);
		box-shadow:
			inset 0 1px 0 #ffffff,
			0 0 0 1px #dcdad8,
			0 1.5rem 3rem -1.5rem rgb(15 14 18 / 0.16);
	}

	.panel--sunken {
		background-color: var(--xy-surface-sunken);
		box-shadow: var(--xy-shadow-recess);
		color: var(--xy-fg);
	}

	.panel__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 2.5rem;
		padding: 0.5rem 0.75rem 0.5rem 1rem;
		border-bottom: 1px solid var(--xy-line);
	}

	.panel--screen .panel__head {
		border-bottom-color: var(--xy-ramp-1);
	}

	.panel__title {
		margin: 0;
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		font-weight: var(--xy-weight-regular);
		color: inherit;
	}

	.panel__actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.panel__body {
		flex: 1;
		min-height: 0;
	}

	.panel__body--sm {
		padding: 0.75rem;
	}

	.panel__body--md {
		padding: 1rem;
	}

	.panel__body--lg {
		padding: 1.5rem;
	}
</style>
