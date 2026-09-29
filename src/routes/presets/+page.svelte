<!--
The preset maker: your own samples, or kits made from numbers, as an OP-XY drum kit, sliced loop,
multisample or synth sampler, on a workbench of the device's 24 keys, written the way the device
writes its presets and downloaded or installed over USB (src/lib/ui/presets).
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
	import { Button, HugeIcon } from '$lib/ui';
	import PresetMaker from '$lib/ui/presets/PresetMaker.svelte';
</script>

<svelte:head>
	<title>OP-XY Agent preset maker</title>
	<meta
		name="description"
		content="Turn your own samples into an OP-XY drum kit, sliced loop, multisample or synth sampler preset, in the browser."
	/>
</svelte:head>

<div class="presets">
	<header class="presets__head">
		<h1 class="presets__title">preset maker</h1>
		<p class="presets__lead">
			your sounds on the op-xy’s 24 keys, written the way the device writes presets
		</p>
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
		gap: 0.875rem;
		width: 100%;
		max-width: 88rem;
		margin: 0 auto;
		padding: 1rem 1.5rem 1.5rem;
	}

	.presets__head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 1.25rem;
	}

	.presets__title {
		margin: 0;
		font-size: var(--xy-text-xl);
		font-weight: var(--xy-weight-light);
		line-height: var(--xy-leading-xl);
	}

	.presets__lead {
		margin: 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-sm);
	}

	.presets__head :global(.key) {
		margin-left: auto;
		align-self: center;
	}
</style>
