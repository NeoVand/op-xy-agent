<!--
@component
A styleguide section: heading, one line of intent, content. Local to the styleguide route.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		title: string;
		intro?: string;
		children: Snippet;
	}

	let { id, title, intro, children }: Props = $props();
</script>

<section class="section" {id} aria-labelledby="{id}-title">
	<header class="section__head">
		<h2 class="section__title" id="{id}-title">{title}</h2>
		{#if intro}<p class="section__intro">{intro}</p>{/if}
	</header>
	{@render children()}
</section>

<style>
	.section {
		scroll-margin-top: 1.5rem;
		padding-block: 3rem;
		border-top: 1px solid var(--xy-line);
	}

	.section__head {
		margin-bottom: 1.75rem;
	}

	.section__title {
		margin: 0;
		font-size: var(--xy-text-2xl);
		line-height: var(--xy-leading-2xl);
		font-weight: var(--xy-weight-light);
		letter-spacing: var(--xy-tracking-display);
	}

	.section__intro {
		margin: 0.5rem 0 0;
		max-width: 38rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-base);
		line-height: var(--xy-leading-base);
	}
</style>
