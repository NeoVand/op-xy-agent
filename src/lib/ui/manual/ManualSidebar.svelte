<!--
@component
The manual's contents, the way the owner's general-relativity reader does it: a column of areas,
each an icon, a name and a few words, that opens smoothly onto its units; the unit being read is
tinted, and it can open onto its own sections. On wide screens it folds to a rail of icons (only
the outer edge moves, every icon keeps its column) and hovering an icon there shows that area's
units beside it. On narrow screens it is a drawer. Open areas and the fold are remembered.
-->
<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		ArrowDown01Icon,
		Home01Icon,
		CommandIcon,
		KeyboardIcon,
		LinkSquare02Icon,
		SidebarLeftIcon,
		SlidersVerticalIcon
	} from '@hugeicons/core-free-icons';
	import type { IconSvgElement } from '@hugeicons/svelte';
	import type { AreaId } from '$lib/manual';
	import HugeIcon from '../HugeIcon.svelte';
	import { tooltip } from '../tooltip';
	import ManualSearch from './ManualSearch.svelte';
	import { AREA_DETAILS, AREA_ICONS, areaName, type UnitSection } from './areas';
	import { KEYS_PAGE } from './keys';

	interface NavArea {
		readonly id: string;
		readonly title: string;
		readonly units: readonly { readonly id: string; readonly title: string }[];
	}

	interface Props {
		nav: readonly NavArea[];
		/** The unit being read, if any (or the keys page, `KEYS_PAGE`). */
		current: string | null;
		/** The sections of the unit being read. */
		sections: readonly UnitSection[];
		/** Folded to a rail of icons (wide screens). */
		collapsed: boolean;
		/** Open as a drawer (narrow screens). */
		mobileOpen: boolean;
		/** Whether `/` and ⌘K focus this search (the landing page's own search takes them there). */
		shortcuts?: boolean;
		toggle: () => void;
		closeMobile: () => void;
	}

	let {
		nav,
		current,
		sections,
		collapsed,
		mobileOpen,
		shortcuts = true,
		toggle,
		closeMobile
	}: Props = $props();

	const GROUPS_KEY = 'opxy:manual-groups';

	const containsCurrent = (area: NavArea) => area.units.some((unit) => unit.id === current);

	/** Open areas: the one being read, and any opened by hand (remembered). */
	let expanded = $state<Record<string, boolean>>(
		untrack(() => Object.fromEntries(nav.map((area) => [area.id, containsCurrent(area)])))
	);
	let outline = $state(false);
	let narrow = $state(false);
	let flyout = $state('');
	let flyoutTop = $state(0);
	let flyoutTrigger: HTMLElement | undefined;
	let hoverTimer: ReturnType<typeof setTimeout> | undefined;
	let suppressPreview = false;
	let scroller: HTMLElement | undefined;

	const isRail = $derived(collapsed && !narrow);
	/** The fold key: in the drawer (narrow screens) it closes the drawer. */
	const toggleLabel = $derived(
		narrow ? 'close contents' : isRail ? 'expand contents' : 'collapse contents'
	);
	const preview = $derived(nav.find((area) => area.id === flyout));

	interface Resource {
		readonly label: string;
		readonly icon: IconSvgElement;
		readonly href: string;
		readonly current: boolean;
		readonly external?: boolean;
	}

	const resources = $derived<Resource[]>([
		{ label: 'overview', icon: Home01Icon, href: resolve('/manual'), current: current === null },
		{
			label: 'which key is which',
			icon: KeyboardIcon,
			href: resolve('/manual/keys'),
			current: current === KEYS_PAGE
		},
		{
			label: 'key notation',
			icon: CommandIcon,
			href: resolve('/manual/[id]', { id: 'basics.key-notation' }),
			current: current === 'basics.key-notation'
		},
		{
			label: 'MIDI CC chart',
			icon: SlidersVerticalIcon,
			href: resolve('/manual/[id]', { id: 'com.midi-cc-reference' }),
			current: current === 'com.midi-cc-reference'
		},
		{
			label: 'TE’s guide',
			icon: LinkSquare02Icon,
			href: 'https://teenage.engineering/guides/op-xy',
			current: false,
			external: true
		}
	]);

	const number = (i: number) => String(i + 1).padStart(2, '0');

	function remember(): void {
		try {
			localStorage.setItem(GROUPS_KEY, JSON.stringify(expanded));
		} catch {
			// storage blocked: the open areas last for this page only
		}
	}

	function openPreview(id: string, element: HTMLElement): void {
		clearTimeout(hoverTimer);
		if (suppressPreview || !isRail) return;
		flyoutTrigger = element;
		const top = element.getBoundingClientRect().top - 8;
		flyoutTop = Math.max(64, Math.min(top, innerHeight - 440));
		flyout = id;
	}

	function leavePreview(): void {
		hoverTimer = setTimeout(() => (flyout = ''), 180);
	}

	async function selectArea(id: string, element: HTMLElement, keyboard: boolean): Promise<void> {
		if (isRail) {
			openPreview(id, element);
			if (keyboard) {
				await tick();
				document.querySelector<HTMLAnchorElement>('.flyout a')?.focus();
			}
		} else {
			expanded[id] = !expanded[id];
			remember();
		}
	}

	/** Searching from the rail unfolds it first, so the field and its results can be seen. */
	function onSearchFocus(): void {
		if (isRail) toggle();
	}

	/**
	 * Scrolls the contents (never the page) to where the reader is: the unit being read, centred if
	 * it is out of view; in the rail, its area's icon with as much of the top shown as it allows.
	 */
	function revealCurrent(): void {
		const item = scroller?.querySelector<HTMLElement>(
			isRail ? '.area--current > .area__head' : '.unit[aria-current="page"]'
		);
		if (!scroller || !item) return;
		const box = scroller.getBoundingClientRect();
		const at = item.getBoundingClientRect();
		if (isRail) {
			const bottom = at.bottom - box.top + scroller.scrollTop;
			scroller.scrollTop = Math.max(0, bottom - scroller.clientHeight + 8);
			return;
		}
		if (at.top >= box.top && at.bottom <= box.bottom) return;
		scroller.scrollTop += at.top - box.top - (box.height - at.height) / 2;
	}

	// folding or unfolding changes what the contents can show: once it has moved, find the reader
	$effect(() => {
		void isRail;
		const timer = setTimeout(revealCurrent, 240);
		return () => clearTimeout(timer);
	});

	afterNavigate(({ type }) => {
		flyout = '';
		outline = false;
		const area = nav.find(containsCurrent);
		if (area) expanded[area.id] = true;
		// after the area has opened, when it had to
		setTimeout(revealCurrent, type === 'enter' ? 0 : 240);
	});

	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}') as Record<string, boolean>;
			expanded = Object.fromEntries(
				nav.map((area) => [area.id, containsCurrent(area) || saved[area.id] === true])
			);
		} catch {
			// nothing saved, or storage blocked
		}
		const media = matchMedia('(max-width: 56rem)');
		const resize = () => {
			narrow = media.matches;
			flyout = '';
		};
		resize();
		media.addEventListener('change', resize);
		return () => {
			media.removeEventListener('change', resize);
			clearTimeout(hoverTimer);
		};
	});
</script>

<svelte:document
	onpointerdown={(event) => {
		if (event.target instanceof Element && !event.target.closest('.flyout, .area__head')) {
			flyout = '';
		}
	}}
/>

<svelte:window
	onkeydown={(event) => {
		if (event.key !== 'Escape') return;
		if (flyout && document.activeElement?.closest('.flyout')) {
			suppressPreview = true;
			flyoutTrigger?.focus();
			suppressPreview = false;
		}
		flyout = '';
		if (mobileOpen) closeMobile();
	}}
/>

{#if mobileOpen}
	<button type="button" class="backdrop" aria-label="close contents" onclick={closeMobile}></button>
{/if}

<aside
	id="manual-nav"
	class={['side', isRail && 'side--rail', mobileOpen && 'side--open']}
	aria-label="manual contents"
	inert={narrow && !mobileOpen}
>
	<div class="side__inner">
		<button
			type="button"
			class="row row--toggle"
			aria-label={toggleLabel}
			aria-expanded={narrow ? mobileOpen : !isRail}
			aria-controls="manual-areas"
			{@attach tooltip(narrow ? '' : toggleLabel, { describe: false })}
			onclick={() => {
				flyout = '';
				toggle();
			}}
		>
			<span class="glyph"><HugeIcon icon={SidebarLeftIcon} size="1.125rem" /></span>
			<span class="copy copy--title">op-xy manual</span>
		</button>

		<div class="side__search" onfocusin={onSearchFocus}>
			<ManualSearch {shortcuts} />
		</div>

		<nav
			class="side__scroll"
			id="manual-areas"
			aria-label="areas"
			{@attach (element: HTMLElement) => {
				scroller = element;
				return () => (scroller = undefined);
			}}
		>
			{#each nav as area (area.id)}
				{@const open = !isRail && expanded[area.id] === true}
				{@const here = containsCurrent(area)}
				<section class={['area', here && 'area--current']}>
					<button
						type="button"
						class="row area__head"
						aria-label={areaName(area.id as AreaId, area.title)}
						aria-expanded={isRail ? flyout === area.id : open}
						aria-controls="area-{area.id}"
						onpointerenter={(event) => openPreview(area.id, event.currentTarget)}
						onpointerleave={leavePreview}
						onfocus={(event) => openPreview(area.id, event.currentTarget)}
						onclick={(event) => void selectArea(area.id, event.currentTarget, event.detail === 0)}
					>
						<span class="glyph"
							><HugeIcon icon={AREA_ICONS[area.id as AreaId]} size="1.125rem" /></span
						>
						<span class="copy">
							<span class="copy__name">{areaName(area.id as AreaId, area.title)}</span>
							<small class="copy__detail">{AREA_DETAILS[area.id as AreaId]}</small>
						</span>
						<span class={['caret', open && 'caret--open']}>
							<HugeIcon icon={ArrowDown01Icon} size="0.75rem" />
						</span>
					</button>
					<div id="area-{area.id}" class={['reveal', open && 'reveal--shown']} inert={!open}>
						<div class="reveal__clip">
							<ul class="units">
								{#each area.units as unit, i (unit.id)}
									{@const reading = unit.id === current}
									<li>
										<div class="unit__row">
											<a
												class="unit"
												href={resolve('/manual/[id]', { id: unit.id })}
												aria-current={reading ? 'page' : undefined}
												onclick={closeMobile}
											>
												<small class="unit__n" aria-hidden="true">{number(i)}</small>
												<span>{unit.title}</span>
											</a>
											{#if reading && sections.length > 0}
												<button
													type="button"
													class={['unit__more', outline && 'unit__more--open']}
													aria-label="sections of this page"
													aria-expanded={outline}
													onclick={() => (outline = !outline)}
												>
													<HugeIcon icon={ArrowDown01Icon} size="0.75rem" />
												</button>
											{/if}
										</div>
										{#if reading && outline}
											<nav class="outline" aria-label="sections of this page">
												{#each sections as section (section.id)}
													<a href="#{section.id}" onclick={closeMobile}>{section.title}</a>
												{/each}
											</nav>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					</div>
				</section>
			{/each}
		</nav>

		<nav class="side__resources" aria-label="references">
			<!-- the manual's pages are resolved above; TE's guide is external -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			{#each resources as item (item.label)}
				<a
					class="row resource"
					href={item.href}
					aria-current={item.current ? 'page' : undefined}
					target={item.external ? '_blank' : undefined}
					rel={item.external ? 'noopener noreferrer' : undefined}
					{@attach tooltip(isRail ? item.label : '', { describe: false })}
					onclick={closeMobile}
				>
					<span class="glyph"><HugeIcon icon={item.icon} size="1.0625rem" /></span>
					<span class="copy copy--small">{item.label}</span>
				</a>
			{/each}
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</nav>
	</div>
</aside>

{#if isRail && preview}
	<nav
		class="flyout"
		style:top="{flyoutTop}px"
		style:max-height="calc(100dvh - {flyoutTop + 16}px)"
		aria-label="{areaName(preview.id as AreaId, preview.title)} units"
		onpointerenter={() => clearTimeout(hoverTimer)}
		onpointerleave={leavePreview}
	>
		<p class="flyout__title">
			<HugeIcon icon={AREA_ICONS[preview.id as AreaId]} size="1rem" />
			{areaName(preview.id as AreaId, preview.title)}
		</p>
		{#each preview.units as unit, i (unit.id)}
			<a
				class="unit"
				href={resolve('/manual/[id]', { id: unit.id })}
				aria-current={unit.id === current ? 'page' : undefined}
				onclick={() => (flyout = '')}
			>
				<small class="unit__n" aria-hidden="true">{number(i)}</small>
				<span>{unit.title}</span>
			</a>
		{/each}
	</nav>
{/if}

<style>
	/* Only the outer edge moves: the inside keeps its full width, so labels never rewrap and every
	 * icon stays in its column while the sidebar folds. */
	.side {
		position: sticky;
		top: var(--xy-header-h);
		align-self: start;
		width: var(--manual-sidebar);
		height: calc(100dvh - var(--xy-header-h));
		overflow: clip;
		border-right: 1px solid var(--xy-line);
		background-color: var(--xy-bg);
		transition: width var(--manual-motion) ease-out;
	}

	.side__inner {
		display: flex;
		flex-direction: column;
		width: var(--manual-sidebar-open);
		height: 100%;
		padding: 0.75rem 0.625rem 1rem;
	}

	/* A row: its hover shape follows the visible width, down to the icon's column in the rail. */
	.row {
		display: flex;
		align-items: center;
		flex: none;
		width: calc(var(--manual-sidebar) - 1.25rem);
		padding: 0;
		border: 0;
		border-radius: 0.625rem;
		background: none;
		color: var(--xy-fg-muted);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition:
			width var(--manual-motion) ease-out,
			background-color var(--xy-dur-quick, 120ms) ease,
			color var(--xy-dur-quick, 120ms) ease;
	}

	.row:hover {
		background-color: var(--xy-hover);
		color: var(--xy-fg);
	}

	.glyph {
		display: inline-grid;
		flex: 0 0 3rem;
		place-items: center;
		width: 3rem;
		height: 2.25rem;
		border-radius: 0.625rem;
	}

	.copy {
		display: flex;
		flex: 0 0 12.25rem;
		flex-direction: column;
		min-width: 0;
		white-space: nowrap;
		opacity: 1;
		visibility: visible;
		transition:
			opacity var(--manual-motion) ease-out,
			visibility 0s;
	}

	.copy__name {
		overflow: hidden;
		color: inherit;
		font-size: var(--xy-text-sm);
		line-height: 1.3;
		text-overflow: ellipsis;
	}

	.copy__detail {
		overflow: hidden;
		margin-top: 0.125rem;
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-2xs);
		line-height: 1.35;
		text-overflow: ellipsis;
	}

	.copy--title {
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		font-weight: var(--xy-weight-medium, 500);
	}

	.copy--small {
		font-size: var(--xy-text-xs);
	}

	.row--toggle {
		height: 2.75rem;
		margin-bottom: 0.25rem;
	}

	.side__search {
		flex: none;
		width: calc(var(--manual-sidebar) - 1.25rem);
		margin-bottom: 0.75rem;
		transition: width var(--manual-motion) ease-out;
	}

	.side__scroll {
		flex: 1;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		overflow-anchor: none;
		overscroll-behavior: contain;
		scrollbar-width: thin;
	}

	.area__head {
		height: 3rem;
	}

	.caret {
		display: inline-flex;
		flex: none;
		margin-left: auto;
		padding: 0 0.625rem;
		color: var(--xy-fg-faint);
		opacity: 1;
		visibility: visible;
		transition:
			opacity var(--manual-motion) ease-out,
			visibility 0s,
			transform var(--manual-motion) ease-out;
	}

	.caret--open {
		transform: rotate(180deg);
	}

	/* the area being read: its name and icon lit, nothing boxed; the others' icons a step dimmer */
	.area__head .glyph {
		color: var(--xy-fg-subtle);
		transition: color var(--xy-dur-quick, 120ms) ease;
	}

	.area__head:hover .glyph,
	.area--current > .area__head,
	.area--current > .area__head .glyph {
		color: var(--xy-fg);
	}

	/* opening and closing an area: its height eases, its units fade */
	.reveal {
		display: grid;
		grid-template-rows: 0fr;
		opacity: 0;
		visibility: hidden;
		transition:
			grid-template-rows var(--manual-motion) ease-out,
			opacity var(--manual-motion) ease-out,
			visibility 0s linear var(--manual-motion);
	}

	.reveal--shown {
		grid-template-rows: 1fr;
		opacity: 1;
		visibility: visible;
		transition-delay: 0s;
	}

	.reveal__clip {
		min-height: 0;
		overflow: hidden;
	}

	.units {
		margin: 0;
		padding: 0.125rem 0 0.5rem 0.5rem;
		list-style: none;
	}

	.unit__row {
		position: relative;
	}

	.unit {
		display: flex;
		gap: 0.75rem;
		padding: 0.5rem 1.75rem 0.5rem 0.75rem;
		border-radius: 0.625rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: 1.5;
		text-decoration: none;
		transition:
			background-color var(--xy-dur-quick, 120ms) ease,
			color var(--xy-dur-quick, 120ms) ease;
	}

	.unit:hover {
		background-color: var(--xy-hover);
		color: var(--xy-fg);
	}

	.unit[aria-current='page'] {
		background-color: var(--xy-surface-raised);
		color: var(--xy-fg);
	}

	.unit__n {
		flex: none;
		min-width: 1.125rem;
		margin-top: 0.0625rem;
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-2xs);
		font-variant-numeric: tabular-nums;
	}

	.unit__more {
		position: absolute;
		top: 0.4375rem;
		right: 0.25rem;
		display: inline-grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		border: 0;
		border-radius: 0.375rem;
		background: none;
		color: var(--xy-fg-muted);
		cursor: pointer;
		transition: transform var(--manual-motion) ease-out;
	}

	.unit__more:hover {
		color: var(--xy-fg);
	}

	.unit__more--open {
		transform: rotate(180deg);
	}

	.outline {
		display: flex;
		flex-direction: column;
		margin: 0.25rem 0.5rem 0.625rem 1.625rem;
		padding-left: 0.75rem;
		border-left: 1px solid var(--xy-line);
	}

	.outline a {
		padding: 0.3125rem 0.375rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		text-decoration: none;
	}

	.outline a:hover {
		color: var(--xy-fg);
	}

	.side__resources {
		display: flex;
		flex: none;
		flex-direction: column;
		padding-top: 0.75rem;
		border-top: 1px solid var(--xy-line);
	}

	.resource {
		height: 2.25rem;
		color: var(--xy-fg-subtle);
	}

	.resource[aria-current='page'] {
		color: var(--xy-fg);
	}

	/* the rail: labels and carets fade, then hide; the icons stay where they were */
	.side--rail .copy,
	.side--rail .caret {
		opacity: 0;
		visibility: hidden;
		transition:
			opacity var(--manual-motion) ease-out,
			visibility 0s linear var(--manual-motion);
	}

	/* the search keeps its magnifier in the icon column; the field fades away round it */
	.side--rail .side__search :global(.search__field) {
		border-color: transparent;
		background-color: transparent;
		cursor: pointer;
	}

	.side--rail .side__search :global(.search__field::placeholder),
	.side--rail .side__search :global(.search__kbd) {
		opacity: 0;
	}

	.flyout {
		position: fixed;
		left: calc(var(--manual-sidebar-rail) + 0.5rem);
		z-index: var(--xy-z-overlay);
		width: 18rem;
		overflow: auto;
		padding: 0.5rem;
		border: 1px solid var(--xy-line-float);
		border-radius: 0.875rem;
		background-color: var(--xy-surface-float);
		box-shadow: 0 12px 40px rgb(0 0 0 / 0.35);
	}

	.flyout__title {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin: 0;
		padding: 0.375rem 0.75rem 0.625rem;
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
	}

	.flyout .unit[aria-current='page'] {
		background-color: var(--xy-hover-float);
	}

	.backdrop {
		display: none;
	}

	/* narrow screens: a drawer over the page */
	@media (max-width: 56rem) {
		.side {
			position: fixed;
			top: var(--xy-header-h);
			bottom: 0;
			left: 0;
			z-index: var(--xy-z-overlay);
			--manual-sidebar: var(--manual-sidebar-open);
			/* stretched between top and bottom: an aligned box would take its content's height */
			align-self: auto;
			width: var(--manual-sidebar-open);
			height: auto;
			transform: translateX(-100%);
			transition: transform var(--manual-motion) ease-out;
		}

		.side--open {
			transform: none;
		}

		.backdrop {
			position: fixed;
			inset: var(--xy-header-h) 0 0;
			z-index: calc(var(--xy-z-overlay) - 1);
			display: block;
			border: 0;
			background: rgb(0 0 0 / 0.35);
		}
	}
</style>
