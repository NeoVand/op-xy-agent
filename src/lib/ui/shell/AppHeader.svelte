<!--
@component
The app header: the name in plain text (no logos, see DECISIONS D6), the manual, the preset maker,
the command palette's key (⌘K) and the theme switch. The developer pages (styleguide, replica, lab)
are linked only in local development, never on the published site.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		AudioWave01Icon,
		BookOpen01Icon,
		ColorsIcon,
		ComputerIcon,
		TestTube01Icon
	} from '@hugeicons/core-free-icons';
	import type { IconSvgElement } from '@hugeicons/svelte';
	import HugeIcon from '../HugeIcon.svelte';
	import { tooltip } from '../tooltip';
	import { getPaletteState } from './palette-state.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	interface NavLink {
		readonly id: '/manual' | '/presets' | '/styleguide' | '/replica' | '/lab';
		readonly label: string;
		readonly icon: IconSvgElement;
	}

	const LINKS: readonly NavLink[] = [
		{ id: '/manual', label: 'manual', icon: BookOpen01Icon },
		{ id: '/presets', label: 'preset maker', icon: AudioWave01Icon }
	];
	const DEV_LINKS: readonly NavLink[] = [
		{ id: '/styleguide', label: 'styleguide', icon: ColorsIcon },
		{ id: '/replica', label: 'replica', icon: ComputerIcon },
		{ id: '/lab', label: 'lab', icon: TestTube01Icon }
	];
	const links = dev ? [...LINKS, ...DEV_LINKS] : LINKS;

	/** The command palette (root layout); absent in isolated renders. */
	const palette = (() => {
		try {
			return getPaletteState();
		} catch {
			return null;
		}
	})();
	/** The palette's modifier as this computer's keyboard names it. */
	let mod = $state('⌘');
	onMount(() => {
		if (!/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)) mod = 'ctrl';
	});
</script>

<header class="header">
	<a class="brand" href={resolve('/')} aria-label="op-xy agent, home">
		<svg class="mark" viewBox="0 0 20 20" aria-hidden="true">
			<rect x="0.5" y="0.5" width="19" height="19" rx="2.5" class="mark__tile" />
			<circle cx="10" cy="10" r="5.8" class="mark__cap" />
			<circle cx="10" cy="6.6" r="1.15" class="mark__led" />
		</svg>
		<span class="name">op-xy agent</span>
	</a>

	<nav class="nav" aria-label="primary">
		{#each links as link (link.id)}
			{@const current = page.route.id === link.id || page.route.id?.startsWith(`${link.id}/`)}
			<a
				class={['nav__link', current && 'is-current']}
				href={resolve(link.id)}
				aria-current={current ? 'page' : undefined}
				><HugeIcon icon={link.icon} /><span class="nav__label">{link.label}</span></a
			>
		{/each}
		{#if palette}
			<button
				type="button"
				class="palette-key"
				aria-label="commands"
				aria-keyshortcuts="Meta+K Control+K"
				aria-expanded={palette.open}
				onclick={() => palette.toggle()}
				{@attach tooltip('ask, play, undo, open a manual page', { describe: false })}
			>
				<kbd class="palette-key__cap">{mod}</kbd><kbd class="palette-key__cap">K</kbd>
			</button>
		{/if}
		<ThemeToggle />
	</nav>
</header>

<style>
	/* it stays at the top while a long page scrolls (the manual's sidebar sits right under it) */
	.header {
		position: sticky;
		top: 0;
		z-index: var(--xy-z-header);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		height: var(--xy-header-h);
		padding-inline: 1rem 0.625rem;
		border-bottom: 1px solid var(--xy-line);
		background-color: var(--xy-bg);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.25rem 0.375rem 0.25rem 0.25rem;
		margin-left: -0.25rem;
		border-radius: var(--xy-radius-tile);
		color: var(--xy-fg);
		text-decoration: none;
	}

	.mark {
		width: 1.25rem;
		height: 1.25rem;
		flex: none;
	}

	.mark__tile {
		fill: var(--xy-key-tile);
		stroke: var(--xy-line-strong);
		stroke-width: 1;
	}

	.mark__cap {
		fill: var(--xy-key-cap);
		stroke: rgb(0 0 0 / 0.35);
		stroke-width: 1;
	}

	.mark__led {
		fill: var(--xy-led-white);
		filter: drop-shadow(0 0 1.5px rgb(255 255 255 / 0.9));
	}

	:global([data-theme='light']) .mark__led {
		fill: var(--xy-ink);
		filter: none;
	}

	.name {
		white-space: nowrap;
		font-size: var(--xy-text-base);
		line-height: 1;
		font-weight: var(--xy-weight-regular);
		letter-spacing: 0.005em;
		padding-top: 0.08em;
	}

	.nav {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.nav__link {
		display: inline-flex;
		align-items: center;
		gap: 0.4375rem;
		padding: 0.5rem 0.625rem;
		border-radius: var(--xy-radius-tile);
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-sm);
		line-height: 1;
		white-space: nowrap;
		text-decoration: none;
		transition: color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.nav__link:hover,
	.nav__link.is-current {
		color: var(--xy-fg);
	}

	/* the command palette's key, as its two keys */
	.palette-key {
		display: inline-flex;
		align-items: center;
		gap: 0.1875rem;
		height: 2rem;
		margin-inline: 0.25rem 0.125rem;
		padding: 0 0.375rem;
		border: 0;
		border-radius: var(--xy-radius-tile);
		background: none;
		color: var(--xy-fg-subtle);
		cursor: pointer;
		transition: color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.palette-key__cap {
		min-width: 1.25rem;
		padding: 0.0625rem 0.3125rem;
		border: 1px solid var(--xy-line-strong);
		border-radius: 0.25rem;
		font-family: inherit;
		font-size: var(--xy-text-2xs);
		line-height: 1.4;
		text-align: center;
		transition: border-color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.palette-key:hover,
	.palette-key[aria-expanded='true'] {
		color: var(--xy-fg);
	}

	.palette-key:hover .palette-key__cap,
	.palette-key[aria-expanded='true'] .palette-key__cap {
		border-color: var(--xy-line-control);
	}

	/* no keyboard to press it on */
	@media (hover: none) {
		.palette-key {
			display: none;
		}
	}

	/* a phone's width: the icons alone, the names kept for screen readers */
	@media (max-width: 40rem) {
		.nav__label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}
</style>
