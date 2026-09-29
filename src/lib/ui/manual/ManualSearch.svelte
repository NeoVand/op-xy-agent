<!--
@component
Search over the manual: type, and the best units appear under the field with the passage that
matched; arrow keys move through them, enter opens one, escape closes. The manual and its index load
the first time the field is used, not with the page. `/` focuses the field from anywhere on the page
that is not a text field.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Search01Icon } from '@hugeicons/core-free-icons';
	import type { AreaId, ManualSearchResult } from '$lib/manual';
	import { unitTitle } from '$lib/manual/titles';
	import HugeIcon from '../HugeIcon.svelte';
	import { AREA_ICONS } from './areas';

	interface Props {
		/** `sm` for the sidebar, `lg` for the landing page. */
		size?: 'sm' | 'lg';
	}

	let { size = 'sm' }: Props = $props();

	const uid = $props.id();
	let field: HTMLInputElement | null = null;
	let query = $state('');
	let results = $state<ManualSearchResult[]>([]);
	let open = $state(false);
	let active = $state(0);
	let loading: Promise<typeof import('$lib/manual')> | null = null;
	/** Answers only the latest query, however the searches finish. */
	let asked = 0;

	const load = () => (loading ??= import('$lib/manual'));

	async function search(): Promise<void> {
		const ticket = ++asked;
		const text = query.trim();
		if (text.length < 2) {
			results = [];
			return;
		}
		const manual = await load();
		if (ticket !== asked) return;
		results = manual.searchManual(text, { limit: 8 });
		active = 0;
		open = true;
	}

	const hrefOf = (result: ManualSearchResult) =>
		`${resolve('/manual/[id]', { id: result.id })}${result.fact ? `#${result.fact}` : ''}`;

	function choose(result: ManualSearchResult): void {
		open = false;
		query = '';
		results = [];
		field?.blur();
		// resolved in hrefOf, then the fact's anchor added
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(hrefOf(result));
	}

	function onkeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			open = false;
			field?.blur();
		} else if (event.key === 'ArrowDown' && results.length > 0) {
			event.preventDefault();
			open = true;
			active = (active + 1) % results.length;
		} else if (event.key === 'ArrowUp' && results.length > 0) {
			event.preventDefault();
			active = (active - 1 + results.length) % results.length;
		} else if (event.key === 'Enter' && open && results[active]) {
			event.preventDefault();
			choose(results[active]);
		}
	}

	/** `/` anywhere but a text field focuses the search. */
	function onWindowKeydown(event: KeyboardEvent): void {
		if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
		event.preventDefault();
		field?.focus();
	}

	const snippetOf = (result: ManualSearchResult) => result.snippet.replaceAll('`', '');
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div
	class={['search', `search--${size}`]}
	onfocusout={(event) => {
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) open = false;
	}}
>
	<label class="sr-only" for="{uid}-q">search the manual</label>
	<span class="search__icon"><HugeIcon icon={Search01Icon} size="1em" strokeWidth={1.8} /></span>
	<input
		id="{uid}-q"
		class="search__field"
		type="search"
		placeholder={size === 'lg' ? 'Search the manual: song mode, parameter locks, tape…' : 'Search'}
		autocomplete="off"
		spellcheck="false"
		role="combobox"
		aria-expanded={open && results.length > 0}
		aria-controls="{uid}-list"
		aria-activedescendant={open && results[active] ? `${uid}-r${active}` : undefined}
		{@attach (element: HTMLInputElement) => {
			field = element;
			return () => (field = null);
		}}
		bind:value={query}
		oninput={() => void search()}
		onfocus={() => {
			void load();
			if (results.length > 0) open = true;
		}}
		{onkeydown}
	/>
	<kbd class="search__kbd" aria-hidden="true">/</kbd>
	{#if open && query.trim().length >= 2}
		<div class="search__panel">
			{#if results.length === 0}
				<p class="search__none">Nothing found for “{query.trim()}”.</p>
			{:else}
				<!-- each link is resolved in hrefOf, then its fact's anchor added -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<ul class="search__list" id="{uid}-list" role="listbox" aria-label="results">
					{#each results as result, i (result.id)}
						<li role="option" id="{uid}-r{i}" aria-selected={i === active}>
							<a
								class={['hit', i === active && 'hit--active']}
								href={hrefOf(result)}
								onmouseenter={() => (active = i)}
								onclick={(event) => {
									event.preventDefault();
									choose(result);
								}}
							>
								<span class="hit__icon">
									<HugeIcon icon={AREA_ICONS[result.area as AreaId]} size="1rem" />
								</span>
								<span class="hit__text">
									<span class="hit__title">{unitTitle(result.title)}</span>
									<span class="hit__snippet">{snippetOf(result)}</span>
								</span>
							</a>
						</li>
					{/each}
				</ul>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</div>
	{/if}
</div>

<style>
	.search {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search__icon {
		position: absolute;
		left: 0.75rem;
		display: inline-flex;
		color: var(--xy-fg-subtle);
		pointer-events: none;
	}

	.search__field {
		width: 100%;
		height: 2.25rem;
		padding: 0 2.25rem 0 2.25rem;
		border: 1px solid var(--xy-line);
		border-radius: 0.5rem;
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg);
		font: inherit;
		font-size: var(--xy-text-sm);
		transition:
			border-color var(--xy-dur-quick, 120ms) ease,
			background-color var(--xy-dur-quick, 120ms) ease;
	}

	.search__field::-webkit-search-cancel-button {
		display: none;
	}

	.search__field::placeholder {
		color: var(--xy-fg-faint);
	}

	.search__field:hover {
		border-color: var(--xy-line-control);
	}

	.search__field:focus,
	.search__field:focus-visible {
		outline: none;
		border-color: var(--xy-line-strong);
	}

	.search__kbd {
		position: absolute;
		right: 0.625rem;
		min-width: 1.25rem;
		padding: 0.0625rem 0.3125rem;
		border: 1px solid var(--xy-line);
		border-radius: 0.3125rem;
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-2xs);
		line-height: 1.4;
		text-align: center;
		pointer-events: none;
	}

	.search__field:focus ~ .search__kbd {
		visibility: hidden;
	}

	.search--lg .search__icon {
		left: 1.125rem;
		font-size: 1.125rem;
	}

	.search--lg .search__field {
		height: 3.25rem;
		padding-left: 3rem;
		border-radius: 0.875rem;
		font-size: var(--xy-text-base);
	}

	.search--lg .search__kbd {
		right: 1rem;
	}

	/* no keyboard to press `/` on */
	@media (hover: none), (max-width: 40rem) {
		.search__kbd {
			display: none;
		}

		.search__field,
		.search--lg .search__field {
			padding-right: 0.75rem;
		}
	}

	.search__panel {
		position: absolute;
		top: calc(100% + 0.375rem);
		left: 0;
		right: 0;
		z-index: var(--xy-z-overlay, 50);
		min-width: 18rem;
		padding: 0.375rem;
		border: 1px solid var(--xy-line);
		border-radius: 0.75rem;
		background-color: var(--xy-surface-raised);
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
	}

	.search__none {
		margin: 0;
		padding: 0.75rem;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-sm);
	}

	.search__list {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.hit {
		display: flex;
		gap: 0.75rem;
		padding: 0.5rem 0.625rem;
		border-radius: 0.5rem;
		color: var(--xy-fg);
		text-decoration: none;
	}

	.hit--active {
		background-color: var(--xy-hover);
	}

	.hit__icon {
		display: inline-flex;
		flex: none;
		margin-top: 0.125rem;
		color: var(--xy-fg-subtle);
	}

	.hit__text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.hit__title {
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}

	.hit__snippet {
		display: -webkit-box;
		overflow: hidden;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}
</style>
