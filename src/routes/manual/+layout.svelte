<!--
The manual's frame: a sidebar every manual page shares (search, then each area with its icon and
units, the area being read open and the unit being read marked), and the page beside it. On narrow
screens the sidebar folds behind a menu button.
-->
<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ArrowDown01Icon, Menu01Icon } from '@hugeicons/core-free-icons';
	import type { AreaId } from '$lib/manual';
	import { HugeIcon } from '$lib/ui';
	import ManualSearch from '$lib/ui/manual/ManualSearch.svelte';
	import { AREA_ICONS, areaName } from '$lib/ui/manual/areas';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const current = $derived(page.params.id ?? null);
	const currentArea = $derived(
		data.nav.find((area) => area.units.some((unit) => unit.id === current))?.id ?? null
	);
	/** Areas opened or closed by hand; the others follow the page being read. */
	let toggled = $state<Record<string, boolean>>({});
	let menuOpen = $state(false);

	const isOpen = (id: string) => toggled[id] ?? id === currentArea;

	// a new page closes the narrow screen's menu
	afterNavigate(() => {
		menuOpen = false;
	});
</script>

<div class="docs">
	<button
		type="button"
		class="docs__menu"
		aria-expanded={menuOpen}
		aria-controls="manual-nav"
		onclick={() => (menuOpen = !menuOpen)}
	>
		<HugeIcon icon={Menu01Icon} size="1.125rem" />
		<span>contents</span>
	</button>

	<aside class={['side', menuOpen && 'side--open']} id="manual-nav" aria-label="manual contents">
		<div class="side__inner">
			<a class="side__title" href={resolve('/manual')}>op-xy manual</a>
			<ManualSearch />
			<nav class="side__nav">
				{#each data.nav as area (area.id)}
					{@const open = isOpen(area.id)}
					<div class="area">
						<button
							type="button"
							class={['area__head', area.id === currentArea && 'area__head--current']}
							aria-expanded={open}
							onclick={() => (toggled[area.id] = !open)}
						>
							<HugeIcon icon={AREA_ICONS[area.id as AreaId]} size="1rem" />
							<span class="area__name">{areaName(area.id as AreaId, area.title)}</span>
							<span class={['area__chevron', open && 'area__chevron--open']}>
								<HugeIcon icon={ArrowDown01Icon} size="0.875rem" />
							</span>
						</button>
						<!-- closed areas stay findable: the browser's find opens the one holding a match -->
						<ul
							class="area__units"
							hidden={open ? undefined : 'until-found'}
							onbeforematch={() => (toggled[area.id] = true)}
						>
							{#each area.units as unit (unit.id)}
								<li>
									<a
										class="unit"
										href={resolve('/manual/[id]', { id: unit.id })}
										aria-current={unit.id === current ? 'page' : undefined}>{unit.title}</a
									>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</nav>
		</div>
	</aside>

	<div class="docs__page">
		{@render children()}
	</div>
</div>

<style>
	.docs {
		display: grid;
		grid-template-columns: 17rem minmax(0, 1fr);
		width: 100%;
		max-width: 96rem;
		margin: 0 auto;
	}

	.docs__menu {
		display: none;
	}

	.side {
		position: sticky;
		top: 0;
		align-self: start;
		height: 100dvh;
		border-right: 1px solid var(--xy-line);
	}

	.side__inner {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		height: 100%;
		padding: 1.5rem 1rem 2rem;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
	}

	.side__title {
		padding: 0 0.25rem;
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		font-weight: var(--xy-weight-medium, 500);
		text-decoration: none;
	}

	.side__nav {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.area__head {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.4375rem 0.5rem;
		border: 0;
		border-radius: 0.5rem;
		background: none;
		color: var(--xy-fg-muted);
		font: inherit;
		font-size: var(--xy-text-sm);
		text-align: left;
		cursor: pointer;
	}

	.area__head:hover {
		background-color: var(--xy-hover);
		color: var(--xy-fg);
	}

	.area__head--current {
		color: var(--xy-fg);
	}

	.area__name {
		flex: 1;
	}

	.area__chevron {
		display: inline-flex;
		color: var(--xy-fg-faint);
		transform: rotate(-90deg);
		transition: transform var(--xy-dur-quick, 120ms) ease;
	}

	.area__chevron--open {
		transform: none;
	}

	.area__units {
		display: flex;
		flex-direction: column;
		margin: 0.125rem 0 0.5rem 1.125rem;
		padding: 0 0 0 0.75rem;
		border-left: 1px solid var(--xy-line);
		list-style: none;
	}

	.unit {
		display: block;
		margin-left: -0.8125rem;
		padding: 0.3125rem 0.5rem 0.3125rem 0.75rem;
		border-left: 1px solid transparent;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		text-decoration: none;
	}

	.unit:hover {
		color: var(--xy-fg);
	}

	.unit[aria-current='page'] {
		border-left-color: var(--xy-fg);
		color: var(--xy-fg);
	}

	.docs__page {
		min-width: 0;
	}

	@media (max-width: 56rem) {
		.docs {
			grid-template-columns: minmax(0, 1fr);
		}

		.docs__menu {
			display: inline-flex;
			align-items: center;
			gap: 0.5rem;
			margin: 1rem 1rem 0;
			padding: 0.5rem 0.75rem;
			border: 1px solid var(--xy-line);
			border-radius: 0.5rem;
			background: none;
			color: var(--xy-fg-muted);
			font: inherit;
			font-size: var(--xy-text-sm);
			cursor: pointer;
			justify-self: start;
		}

		.side {
			position: static;
			display: none;
			height: auto;
			border-right: 0;
			border-bottom: 1px solid var(--xy-line);
		}

		.side--open {
			display: block;
		}
	}
</style>
