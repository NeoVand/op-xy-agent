<!--
@component
Switches between the dark ("anodised") and light ("guide") themes. Reads the shared Theme from context.
-->
<script lang="ts">
	import IconButton from '../IconButton.svelte';
	import { getTheme } from '../theme.svelte';

	interface Props {
		size?: 'sm' | 'md';
	}

	let { size = 'sm' }: Props = $props();

	const theme = getTheme();
	const label = $derived(
		theme.current === 'dark' ? 'switch to light theme' : 'switch to dark theme'
	);
</script>

<IconButton {label} icon="contrast" variant="ghost" {size} onclick={() => theme.toggle()} />
