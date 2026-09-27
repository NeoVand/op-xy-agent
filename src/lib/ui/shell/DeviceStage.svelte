<!--
@component
The device stage: the area framed at the device body's exact 285:102 aspect where the replica mounts
(pass it as `children`; without it an abstract placeholder stands in). Under the device sits the
plate: an honest invitation to connect, unless `plate` replaces it (with the connected device's
card, for example). The connect key stays disabled, marked "coming soon", until the Web MIDI layer
provides `onconnect`. `caption` is a line of its own right under the device, for a status line and
short notes about what the replica just did.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from '../Button.svelte';
	import Icon from '../Icon.svelte';
	import DevicePlaceholder from './DevicePlaceholder.svelte';

	interface Props {
		/** The replica. When absent the stage shows its placeholder. */
		children?: Snippet;
		/** Connect handler from the device layer. Without it the connect key is disabled ("coming soon"). */
		onconnect?: () => void;
		/** Whether this browser can talk Web MIDI at all; `unknown` before hydration. */
		webMidi?: 'unknown' | 'available' | 'unavailable';
		/** Replaces the connect copy under the device, e.g. with the connected device's card. */
		plate?: Snippet;
		/** A line right under the device: a status line, and hints from the replica. */
		caption?: Snippet;
	}

	let { children, onconnect, webMidi = 'unknown', plate, caption }: Props = $props();

	const uid = $props.id();
	const canConnect = $derived(Boolean(onconnect) && webMidi !== 'unavailable');
</script>

<div class="stage">
	<div class="stage__device">
		{#if children}
			{@render children()}
		{:else}
			<DevicePlaceholder />
		{/if}
	</div>

	{#if caption}
		<div class="stage__caption">{@render caption()}</div>
	{/if}

	{#if plate}
		<div class="stage__plate">{@render plate()}</div>
	{:else}
		<div class="stage__plate">
			<div class="stage__copy">
				<h1 class="stage__title">connect your <span class="whitespace-nowrap">op-xy</span></h1>
				<p class="stage__text">
					{#if webMidi === 'unavailable'}
						This browser has no Web MIDI. Open the app in Chrome, Edge or Firefox to connect.
					{:else if onconnect}
						Plug it in with a <span class="whitespace-nowrap">USB-C</span> cable to play it from the replica,
						see what it plays, and let the agent drive it.
					{:else}
						The USB connection is being built right now. Then you plug in with
						<span class="whitespace-nowrap">USB-C</span>, the replica plays the device and shows
						what it plays, and the agent can drive it.
					{/if}
				</p>
			</div>
			<div class="stage__cta">
				<Button
					variant={canConnect ? 'primary' : 'key'}
					size="lg"
					onclick={onconnect}
					disabled={webMidi === 'unavailable'}
					aria-disabled={!onconnect && webMidi !== 'unavailable' ? 'true' : undefined}
					aria-describedby={onconnect ? undefined : `${uid}-soon`}
					class="stage__connect"
				>
					{#snippet icon()}<Icon name="usb" />{/snippet}
					connect
				</Button>
				{#if !onconnect}
					<span class="stage__soon" id="{uid}-soon">coming soon</span>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.stage {
		--stage-gap: clamp(1.25rem, 3vw, 2.25rem);
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--stage-gap);
		width: 100%;
		max-width: 76rem;
		margin-inline: auto;
	}

	/* A pool of light under the device, like the studio shots: depth without a frame. */
	.stage::before {
		content: '';
		position: absolute;
		inset: -12% -6% 20%;
		background: radial-gradient(closest-side, rgb(247 245 245 / 0.035), transparent);
		pointer-events: none;
	}

	:global([data-theme='light']) .stage::before {
		background: radial-gradient(closest-side, rgb(255 255 255 / 0.9), transparent);
	}

	.stage__device {
		position: relative;
		width: 100%;
		aspect-ratio: var(--xy-body-aspect);
	}

	/* A line of its own between the device and the plate, on the device's tile grid, tall enough for
	 * a two-line note; the stage gap around it is halved so it reads as part of the device. Whatever
	 * grows past it floats over the plate (z-index) instead of pushing it down. */
	.stage__caption {
		position: relative;
		z-index: var(--xy-z-raised);
		display: grid;
		min-height: 3.5rem;
		margin-block: calc(var(--stage-gap) / -2);
		padding-inline: calc(100% * 4.41 / 285) calc(100% * 17.09 / 285);
	}

	/* The caption plate aligns with the device's own tile grid: it starts 4.41 mm from the left edge
	 * and ends 17.09 mm from the right (the right margin holds the mic and level meter). */
	.stage__plate {
		position: relative;
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1.5rem 2rem;
		padding-inline: calc(100% * 4.41 / 285) calc(100% * 17.09 / 285);
	}

	.stage__copy {
		max-width: 36rem;
	}

	.stage__title {
		margin: 0;
		font-size: var(--xy-text-2xl);
		line-height: var(--xy-leading-2xl);
		font-weight: var(--xy-weight-light);
		letter-spacing: var(--xy-tracking-display);
		color: var(--xy-fg);
	}

	.stage__text {
		margin: 0.5rem 0 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-base);
		line-height: var(--xy-leading-base);
	}

	.stage__cta {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		flex: none;
	}

	.stage__soon {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}

	@media (max-width: 40rem) {
		.stage__plate {
			flex-direction: column;
			align-items: stretch;
		}

		.stage__title {
			font-size: var(--xy-text-xl);
			line-height: var(--xy-leading-xl);
		}

		.stage__cta {
			align-items: stretch;
			text-align: center;
		}

		.stage__cta :global(.stage__connect) {
			width: 100%;
		}
	}
</style>
