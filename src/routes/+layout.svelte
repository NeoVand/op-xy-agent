<script lang="ts">
	import './layout.css';
	import '@fontsource-variable/work-sans';
	import '@fontsource-variable/work-sans/wght-italic.css';
	import '@fontsource-variable/red-hat-mono';
	import workSansLatin from '@fontsource-variable/work-sans/files/work-sans-latin-wght-normal.woff2?url';
	import { onMount } from 'svelte';
	import { asset } from '$app/paths';
	import { Theme, setTheme } from '$lib/ui/theme.svelte';
	import AppHeader from '$lib/ui/shell/AppHeader.svelte';
	import StatusBar from '$lib/ui/shell/StatusBar.svelte';
	import { ShellStatus, setShellStatus } from '$lib/ui/shell/status.svelte';

	let { children } = $props();

	const theme = new Theme();
	setTheme(theme);

	const status = new ShellStatus();
	setShellStatus(status);

	onMount(() => {
		theme.sync();
		status.detect();
	});
</script>

<svelte:head>
	<link rel="icon" href={asset('/favicon.svg')} type="image/svg+xml" />
	<link rel="apple-touch-icon" href={asset('/apple-touch-icon.png')} />
	<link rel="preload" href={workSansLatin} as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

<a class="skip" href="#main">skip to content</a>

<div class="app">
	<AppHeader />
	<main id="main" class="main" tabindex="-1">
		{@render children()}
	</main>
	<StatusBar
		midi={status.midi}
		device={status.device}
		firmware={status.firmware}
		view={status.view}
		webMidi={status.webMidi}
	/>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	.main {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		outline: none;
	}

	/* Visually hidden until focused from the keyboard. */
	.skip {
		position: fixed;
		left: 0.75rem;
		top: 0.75rem;
		z-index: var(--xy-z-overlay);
		padding: 0.5rem 0.875rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-key-1-cap);
		color: var(--xy-key-1-legend);
		font-size: var(--xy-text-sm);
		text-decoration: none;
	}

	.skip:not(:focus) {
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
