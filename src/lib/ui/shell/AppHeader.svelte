<!--
@component
The app header: the name in plain text (no logos, see DECISIONS D6), navigation and the theme switch.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ThemeToggle from './ThemeToggle.svelte';

	const onStyleguide = $derived(page.route.id === '/styleguide');
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
		<a
			class={['nav__link', onStyleguide && 'is-current']}
			href={resolve('/styleguide')}
			aria-current={onStyleguide ? 'page' : undefined}>styleguide</a
		>
		<ThemeToggle />
	</nav>
</header>

<style>
	.header {
		position: relative;
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
		padding: 0.5rem 0.625rem;
		border-radius: var(--xy-radius-tile);
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-sm);
		line-height: 1;
		text-decoration: none;
		transition: color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.nav__link:hover,
	.nav__link.is-current {
		color: var(--xy-fg);
	}
</style>
