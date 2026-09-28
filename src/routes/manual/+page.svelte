<!--
Our OP-XY manual: every unit by area, and a search over all of them. The units are our own
rewording of TE's guide, checked against a unit (knowledge/manual/units); the agent answers from
the same text and cites these pages.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ManualSearchResult } from '$lib/manual';
	import { Search01Icon } from '@hugeicons/core-free-icons';
	import { HugeIcon, Legend } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const STATUS: Record<string, string> = {
		'outdated-in-guide': 'newer than TE’s guide',
		'changelog-only': 'from the changelog',
		unverified: 'unverified'
	};

	let query = $state('');
	let results = $state<ManualSearchResult[]>([]);
	let searching: Promise<typeof import('$lib/manual')> | null = null;
	/** Answers only the latest query, however the searches finish. */
	let asked = 0;

	async function search(text: string): Promise<void> {
		const ticket = ++asked;
		if (text.trim().length < 2) {
			results = [];
			return;
		}
		// the manual and its index load on the first search, not with the page
		searching ??= import('$lib/manual');
		const manual = await searching;
		if (ticket === asked) results = manual.searchManual(text, { limit: 12 });
	}
</script>

<svelte:head>
	<title>OP-XY manual · OP-XY Agent</title>
	<meta
		name="description"
		content="Our own OP-XY manual: every page, key and parameter, reworded from TE's guide and checked on a unit."
	/>
</svelte:head>

<div class="manual">
	<header class="manual__head">
		<h1 class="manual__title">manual</h1>
		<Legend as="p" size="sm" tone="subtle">
			The OP-XY in {data.stats.units} short units: {data.stats.facts} facts, {data.stats.verified} of
			them checked on a unit running OS {data.firmware}. Reworded from TE’s guide ({data.guide}) and
			the changelog; the agent answers from the same text.
		</Legend>
	</header>

	<search class="find">
		<label class="sr-only" for="manual-search">search the manual</label>
		<div class="find__box">
			<HugeIcon icon={Search01Icon} class="find__icon" />
			<input
				id="manual-search"
				class="find__field"
				type="search"
				placeholder="search: parameter locks, song mode, tape, midi clock…"
				autocomplete="off"
				bind:value={query}
				oninput={() => void search(query)}
			/>
		</div>
		{#if query.trim().length >= 2}
			{#if results.length === 0}
				<p class="find__none">nothing found for “{query.trim()}”</p>
			{:else}
				<!-- each link is resolved, then its fact's anchor added -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<ol class="find__results">
					{#each results as result (result.id)}
						<li>
							<a
								class="hit"
								href={resolve('/manual/[id]', { id: result.id }) +
									(result.fact ? `#${result.fact}` : '')}
							>
								<span class="hit__title">{result.title}</span>
								<span class="hit__area">{result.area}</span>
								<span class="hit__snippet">{result.snippet.replaceAll('`', '')}</span>
							</a>
						</li>
					{/each}
				</ol>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		{/if}
	</search>

	<div class="areas">
		{#each data.areas as area (area.id)}
			<section class="area" aria-labelledby="area-{area.id}">
				<h2 class="area__title" id="area-{area.id}">{area.title.toLowerCase()}</h2>
				<p class="area__text">{area.description}</p>
				<ul class="area__units">
					{#each area.units as unit (unit.id)}
						<li>
							<a class="unit" href={resolve('/manual/[id]', { id: unit.id })}>
								<span class="unit__title">{unit.title}</span>
								{#if STATUS[unit.status]}<span class="unit__status">{STATUS[unit.status]}</span
									>{/if}
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</div>

<style>
	.manual {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		width: 100%;
		max-width: 72rem;
		margin: 0 auto;
		padding: 1.5rem 1rem 3rem;
	}

	.manual__title {
		margin: 0 0 0.25rem;
		font-size: var(--xy-text-2xl);
		font-weight: var(--xy-weight-light);
		line-height: var(--xy-leading-2xl);
	}

	.manual__head :global(p) {
		max-width: 46rem;
	}

	.find {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.find__box {
		position: relative;
		max-width: 46rem;
		color: var(--xy-scr-muted);
	}

	.find__box :global(.find__icon) {
		position: absolute;
		top: 50%;
		left: 1rem;
		transform: translateY(-50%);
		pointer-events: none;
	}

	.find__field {
		width: 100%;
		padding: 0.75rem 1rem 0.75rem 2.75rem;
		border: 0;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-scr-bg);
		color: var(--xy-scr-fg);
		font: inherit;
		font-size: var(--xy-text-base);
		box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06);
	}

	.find__field::placeholder {
		color: var(--xy-scr-muted);
	}

	.find__field:focus-visible {
		outline: 2px solid var(--xy-focus);
		outline-offset: 2px;
	}

	.find__none {
		margin: 0;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-sm);
	}

	.find__results {
		display: flex;
		flex-direction: column;
		max-width: 46rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.hit {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.125rem 1rem;
		padding: 0.625rem 0.75rem;
		border-radius: var(--xy-radius-tile);
		color: var(--xy-fg);
		text-decoration: none;
	}

	.hit:hover,
	.hit:focus-visible {
		background-color: var(--xy-hover);
	}

	.hit__title {
		font-size: var(--xy-text-sm);
		font-weight: var(--xy-weight-medium, 500);
	}

	.hit__area {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		letter-spacing: var(--xy-tracking-label);
	}

	.hit__snippet {
		grid-column: 1 / -1;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.areas {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
		gap: 1rem;
	}

	.area {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface);
		box-shadow: var(--xy-shadow-plate);
	}

	.area__title {
		margin: 0;
		font-size: var(--xy-text-lg);
		font-weight: var(--xy-weight-regular);
		line-height: var(--xy-leading-lg);
	}

	.area__text {
		margin: 0;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.area__units {
		display: flex;
		flex-direction: column;
		margin: 0.25rem 0 0;
		padding: 0;
		list-style: none;
	}

	.unit {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.3125rem 0.5rem;
		margin-inline: -0.5rem;
		border-radius: var(--xy-radius-sm, 4px);
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		text-decoration: none;
	}

	.unit:hover,
	.unit:focus-visible {
		background-color: var(--xy-hover);
	}

	.unit__status {
		flex: none;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		letter-spacing: var(--xy-tracking-label);
	}
</style>
