<!--
The manual's frame: the contents sidebar every manual page shares, and the page beside it. On wide
screens the sidebar folds to a rail of icons (remembered, and applied before the first paint by
app.html); on narrow ones it is a drawer behind the contents button.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { Menu01Icon } from '@hugeicons/core-free-icons';
	import { HugeIcon } from '$lib/ui';
	import ManualSidebar from '$lib/ui/manual/ManualSidebar.svelte';
	import { unitSections } from '$lib/ui/manual/areas';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/** Must match the key app.html reads before the first paint. */
	const FOLD_KEY = 'opxy:manual-sidebar';

	const current = $derived(page.params.id ?? null);
	const unit = $derived(page.data.unit as Parameters<typeof unitSections>[0] | undefined);
	const sections = $derived(unit ? unitSections(unit) : []);

	let collapsed = $state(false);
	let mobileOpen = $state(false);

	function toggle(): void {
		if (matchMedia('(max-width: 56rem)').matches) {
			mobileOpen = !mobileOpen;
			return;
		}
		collapsed = !collapsed;
		document.documentElement.dataset.manualSidebar = collapsed ? 'collapsed' : 'expanded';
		try {
			localStorage.setItem(FOLD_KEY, collapsed ? 'collapsed' : 'expanded');
		} catch {
			// storage blocked: the fold lasts for this visit
		}
	}

	afterNavigate(() => {
		mobileOpen = false;
	});

	onMount(() => {
		collapsed = document.documentElement.dataset.manualSidebar === 'collapsed';
	});
</script>

<div class="docs">
	<ManualSidebar
		nav={data.nav}
		{current}
		{sections}
		{collapsed}
		{mobileOpen}
		shortcuts={current !== null}
		{toggle}
		closeMobile={() => (mobileOpen = false)}
	/>

	<div class="docs__page">
		<button
			type="button"
			class="docs__menu"
			aria-expanded={mobileOpen}
			aria-controls="manual-nav"
			onclick={toggle}
		>
			<HugeIcon icon={Menu01Icon} size="1.125rem" />
			<span>contents</span>
		</button>
		{@render children()}
	</div>
</div>

<style>
	:global(:root) {
		--manual-sidebar-open: 18rem;
		--manual-sidebar-rail: 4.25rem;
		--manual-sidebar: var(--manual-sidebar-open);
		--manual-motion: 200ms;
	}

	:global(:root[data-manual-sidebar='collapsed']) {
		--manual-sidebar: var(--manual-sidebar-rail);
	}

	@media (prefers-reduced-motion: reduce) {
		:global(:root) {
			--manual-motion: 0ms;
		}
	}

	/* the sidebar's column follows its width as it folds */
	.docs {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		width: 100%;
	}

	.docs__page {
		min-width: 0;
	}

	.docs__menu {
		display: none;
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
			border-radius: 0.625rem;
			background: none;
			color: var(--xy-fg-muted);
			font: inherit;
			font-size: var(--xy-text-sm);
			cursor: pointer;
		}
	}
</style>
