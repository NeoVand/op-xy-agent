<!--
The preset maker: your own samples as an OP-XY drum kit, multisample or synth sampler preset,
built in the browser and downloaded as a zipped `.preset` folder (src/lib/presets).
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
	import { Button, HugeIcon, Legend } from '$lib/ui';
	import PresetMaker from '$lib/ui/presets/PresetMaker.svelte';
</script>

<svelte:head>
	<title>OP-XY Agent preset maker</title>
	<meta
		name="description"
		content="Turn your own samples into an OP-XY drum kit, multisample or synth sampler preset, in the browser."
	/>
</svelte:head>

<div class="presets">
	<header class="presets__head">
		<div>
			<h1 class="presets__title">preset maker</h1>
			<Legend as="p" size="sm" tone="subtle">
				Your own samples as an OP-XY drum kit, multisample or synth sampler, written the way the
				device writes its presets.
			</Legend>
		</div>
		<Button href={resolve('/')} variant="ghost" size="sm">
			{#snippet icon()}<HugeIcon icon={ArrowLeft01Icon} />{/snippet}
			back to the app
		</Button>
	</header>

	<PresetMaker />
</div>

<style>
	.presets {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		width: 100%;
		max-width: 72rem;
		margin: 0 auto;
		padding: 1.5rem 1rem 3rem;
	}

	.presets__head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
	}

	.presets__title {
		margin: 0 0 0.25rem;
		font-size: var(--xy-text-2xl);
		font-weight: var(--xy-weight-light);
		line-height: var(--xy-leading-2xl);
	}
</style>
