<!--
The manual's landing page: what it is, a search over everything, where to start, the areas as cards
and every recipe. Our own rewording of TE's guide, checked against a unit (knowledge/manual/units);
the agent answers from the same text and cites these pages.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
	import type { AreaId } from '$lib/manual';
	import { HugeIcon } from '$lib/ui';
	import ManualSearch from '$lib/ui/manual/ManualSearch.svelte';
	import { AREA_ICONS, areaName } from '$lib/ui/manual/areas';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const areas = $derived(data.areas.filter((area) => area.id !== 'howto'));
	const recipesText = $derived(data.areas.find((area) => area.id === 'howto')?.description);
</script>

<svelte:head>
	<title>OP-XY manual · OP-XY Agent</title>
	<meta
		name="description"
		content="The OP-XY in short units: every page, key and parameter, reworded from TE's guide and checked on a unit."
	/>
</svelte:head>

<div class="landing">
	<header class="hero">
		<p class="hero__eyebrow">for os {data.firmware}</p>
		<h1 class="hero__title">The OP-XY manual</h1>
		<p class="hero__lead">
			Every page, key and parameter in {data.stats.units} short units, reworded from TE’s guide and checked
			on a real unit. The agent answers from the same text.
		</p>
		<div class="hero__search"><ManualSearch size="lg" /></div>
		<p class="hero__stats">
			{data.stats.facts} facts · {data.stats.verified} checked on a unit · TE’s guide {data.guide}
		</p>
	</header>

	{#if data.start.length > 0}
		<section class="block" aria-labelledby="start">
			<h2 class="block__title" id="start">start here</h2>
			<ol class="steps">
				{#each data.start as recipe, i (recipe.id)}
					<li>
						<a class="step" href={resolve('/manual/[id]', { id: recipe.id })}>
							<span class="step__n">{i + 1}</span>
							<span class="step__title">{recipe.title}</span>
							<span class="step__go"><HugeIcon icon={ArrowRight01Icon} size="1rem" /></span>
						</a>
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	<section class="block" aria-labelledby="areas">
		<h2 class="block__title" id="areas">the instrument, area by area</h2>
		<div class="cards">
			{#each areas as area (area.id)}
				{#if area.first}
					<a class="card" href={resolve('/manual/[id]', { id: area.first })}>
						<span class="card__icon">
							<HugeIcon icon={AREA_ICONS[area.id as AreaId]} size="1.25rem" strokeWidth={1.6} />
						</span>
						<span class="card__body">
							<span class="card__name">{areaName(area.id as AreaId, area.title)}</span>
							<span class="card__text">{area.description}</span>
							<span class="card__count">{area.count} units</span>
						</span>
					</a>
				{/if}
			{/each}
		</div>
	</section>

	{#if data.recipes.length > 0}
		<section class="block" aria-labelledby="recipes">
			<div class="block__head">
				<h2 class="block__title" id="recipes">recipes</h2>
				{#if recipesText}<p class="block__text">{recipesText}</p>{/if}
			</div>
			<ul class="recipes">
				{#each data.recipes as recipe (recipe.id)}
					<li>
						<a class="recipe" href={resolve('/manual/[id]', { id: recipe.id })}>{recipe.title}</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.landing {
		display: flex;
		flex-direction: column;
		gap: 3.5rem;
		max-width: 64rem;
		padding: 3.5rem 2.5rem 5rem;
	}

	.hero {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 42rem;
	}

	.hero__eyebrow {
		margin: 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		letter-spacing: var(--xy-tracking-label);
	}

	.hero__title {
		margin: 0;
		font-size: clamp(2rem, 4vw, 2.75rem);
		font-weight: var(--xy-weight-light);
		line-height: 1.1;
		letter-spacing: -0.01em;
	}

	.hero__lead {
		margin: 0;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-base);
		line-height: var(--xy-leading-base);
	}

	.hero__search {
		margin-top: 0.75rem;
	}

	.hero__stats {
		margin: 0;
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-xs);
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.block__title {
		margin: 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		font-weight: var(--xy-weight-regular);
		letter-spacing: var(--xy-tracking-label);
	}

	.steps {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.step {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		height: 100%;
		padding: 0.875rem 1rem;
		border: 1px solid var(--xy-line);
		border-radius: 0.75rem;
		color: var(--xy-fg);
		text-decoration: none;
		transition:
			border-color var(--xy-dur-quick, 120ms) ease,
			background-color var(--xy-dur-quick, 120ms) ease;
	}

	.step:hover {
		border-color: var(--xy-line-control);
		background-color: var(--xy-hover);
	}

	.step__n {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		background-color: var(--xy-surface-raised);
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-2xs);
		font-variant-numeric: tabular-nums;
	}

	.step__title {
		flex: 1;
		min-width: 0;
		font-size: var(--xy-text-sm);
	}

	.step__go {
		display: inline-flex;
		color: var(--xy-fg-faint);
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
		gap: 0.75rem;
	}

	.card {
		display: flex;
		gap: 0.875rem;
		padding: 1.125rem;
		border: 1px solid var(--xy-line);
		border-radius: 0.875rem;
		background-color: var(--xy-surface);
		color: var(--xy-fg);
		text-decoration: none;
		transition: border-color var(--xy-dur-quick, 120ms) ease;
	}

	.card:hover {
		border-color: var(--xy-line-control);
	}

	.card__icon {
		display: inline-grid;
		flex: none;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.625rem;
		background-color: var(--xy-surface-raised);
		color: var(--xy-fg);
	}

	.card__body {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 0;
	}

	.card__name {
		font-size: var(--xy-text-base);
		line-height: 2.25rem;
		margin-bottom: -0.375rem;
	}

	.card__text {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.card__count {
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-2xs);
		letter-spacing: var(--xy-tracking-label);
	}

	.block__head {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.block__text {
		max-width: 42rem;
		margin: 0;
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.recipes {
		margin: 0;
		padding: 0;
		list-style: none;
		columns: 3 16rem;
		column-gap: 2rem;
	}

	.recipes li {
		break-inside: avoid;
	}

	.recipe {
		display: block;
		padding: 0.5625rem 0.125rem;
		border-bottom: 1px solid var(--xy-line);
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-sm);
		text-decoration: none;
		transition: color var(--xy-dur-quick, 120ms) ease;
	}

	.recipe:hover {
		color: var(--xy-fg);
	}

	@media (max-width: 40rem) {
		.landing {
			padding: 2rem 1rem 4rem;
		}
	}
</style>
