<!--
@component
What a phone gets instead of the app, which needs a large screen, a computer keyboard and USB: the
screen recording from the README playing in a frame, a plain note that the app is for desktop
browsers, and the page's link to share with a computer.

app.html marks a phone before the first paint (`data-device="phone"` on <html>), and the root layout
then renders this alone. Every prerendered page carries it, shown by CSS only on a phone, so a phone
sees it at the first paint, well before the app's code arrives. The poster is lazy, so a computer,
where it is hidden, never fetches it; the video and the link come once the code runs.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { asset } from '$app/paths';
	import Button from '../Button.svelte';
	import Divider from '../Divider.svelte';
	import Led from '../Led.svelte';
	import BrandMark from './BrandMark.svelte';

	const POSTER = asset('/preview/demo.jpg');
	const VIDEO = asset('/preview/demo.mp4');
	const COPIED_MS = 2000;

	/** The page's own address, known once the code runs. */
	let url = $state<string | null>(null);
	let canShare = $state(false);
	/** Motion kept down: the recording waits for a tap on the player's own play key. */
	let calm = $state(false);
	/** The player's controls: with motion kept down, or when the phone refuses to autoplay. */
	let controls = $state(false);
	/** The recording is moving, covering the poster under it. */
	let playing = $state(false);
	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;
	let address = $state<HTMLElement>();

	const shownUrl = $derived(url?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '');

	onMount(() => {
		calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
		controls = calm;
		canShare = typeof navigator.share === 'function';
		url = location.href;
		return () => clearTimeout(copiedTimer);
	});

	function autoplay(video: HTMLVideoElement): void {
		// a phone autoplays only a muted video, and checks the property, not the attribute
		video.muted = true;
		if (calm) return;
		// low power mode or data saver refuse it: the player's play key takes over
		video.play().catch(() => (controls = true));
	}

	async function share(): Promise<void> {
		if (!url) return;
		try {
			await navigator.share({ title: 'OP-XY Agent', url });
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			await copy();
		}
	}

	async function copy(): Promise<void> {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copied = false), COPIED_MS);
		} catch {
			// no clipboard: select the address, so it can be copied by hand
			if (address) getSelection()?.selectAllChildren(address);
		}
	}
</script>

<div class="phone">
	<header class="phone__bar">
		<span class="brand">
			<BrandMark />
			<span class="brand__name">op-xy agent</span>
		</span>
		<span class="phone__state"><Led state="dim" />desktop only</span>
	</header>

	<main class="phone__body">
		<figure class="preview">
			<div class="preview__frame">
				<div class="preview__glass">
					<img
						class="preview__poster"
						src={POSTER}
						alt=""
						width="1280"
						height="738"
						loading="lazy"
						decoding="async"
					/>
					{#if url}
						<video
							class={['preview__video', (playing || controls) && 'is-shown']}
							src={VIDEO}
							poster={POSTER}
							muted
							loop
							playsinline
							preload={calm ? 'none' : 'auto'}
							{controls}
							disablepictureinpicture
							onplaying={() => (playing = true)}
							{@attach autoplay}
						></video>
					{/if}
				</div>
			</div>
			<figcaption class="preview__caption">
				the agent writes a song, track by track, and the replica plays it
			</figcaption>
		</figure>

		<div class="note">
			<h1 class="note__title">made for a desktop browser</h1>
			<p class="note__text">
				OP-XY Agent is a replica of the <span class="whitespace-nowrap">OP-XY</span> you can play, and
				an AI agent that teaches the instrument and programs it for you. It needs a big screen, a computer
				keyboard and a USB port, so it won’t work on a phone. Please open it in a desktop browser.
			</p>

			{#if url}
				<div class="send">
					<Divider variant="groove" />
					<p class="send__label">open it on your computer</p>
					<p class="send__url" bind:this={address}>{shownUrl}</p>
					<Button variant="primary" size="lg" class="send__key" onclick={canShare ? share : copy}>
						{copied ? 'copied' : canShare ? 'share the link' : 'copy the link'}
					</Button>
					<span class="send__status" role="status">{copied ? 'link copied' : ''}</span>
				</div>
			{/if}
		</div>
	</main>
</div>

<style>
	/* Only a phone shows it (app.html); everywhere else it is in the page but never drawn. */
	.phone {
		display: none;
	}

	:global(html[data-device='phone']) .phone {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		/* the light pool under the preview may spill past the screen's sides, never scrolling it */
		overflow-x: hidden;
		overflow-x: clip;
		/* clear of the notch and the home indicator, the page drawn edge to edge (viewport-fit) */
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
			env(safe-area-inset-left);
	}

	/* The app header's height and hairline, its name, and an LED with words where the nav was. */
	.phone__bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		height: var(--xy-header-h);
		flex: none;
		padding-inline: 1rem;
		border-bottom: 1px solid var(--xy-line);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		color: var(--xy-fg);
	}

	.brand__name {
		white-space: nowrap;
		font-size: var(--xy-text-base);
		line-height: 1;
		letter-spacing: 0.005em;
		padding-top: 0.08em;
	}

	.phone__state {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		white-space: nowrap;
	}

	.phone__body {
		display: flex;
		flex: 1;
		flex-direction: column;
		justify-content: center;
		gap: 2.5rem;
		width: 100%;
		max-width: 36rem;
		margin-inline: auto;
		padding: 2rem 1rem 2.5rem;
	}

	.preview {
		position: relative;
		margin: 0;
	}

	/* A pool of light under it, as under the device on the home page. */
	.preview::before {
		content: '';
		position: absolute;
		inset: -25% -10% -5%;
		background: radial-gradient(closest-side, rgb(247 245 245 / 0.06), transparent);
		pointer-events: none;
	}

	:global([data-theme='light']) .preview::before {
		background: radial-gradient(closest-side, rgb(255 255 255 / 0.95), transparent);
	}

	/* A computer's screen in the replica's anodised aluminium: a thin bezel, lit along the top edge,
	 * a dark outline where it meets the desk. Black in both themes: it is an object. */
	.preview__frame {
		--bezel: 0.3125rem;
		position: relative;
		padding: var(--bezel);
		border-radius: calc(var(--xy-radius-screen) + var(--bezel));
		background: linear-gradient(to bottom, #222327, #18191c 45%, #141518);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.1),
			inset 0 -1px 0 rgb(255 255 255 / 0.035),
			0 0 0 1px var(--xy-mat-gap),
			0 1.75rem 3rem -1.5rem rgb(0 0 0 / 0.75);
	}

	:global([data-theme='light']) .preview__frame {
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.1),
			inset 0 -1px 0 rgb(255 255 255 / 0.035),
			0 0 0 1px var(--xy-mat-gap),
			0 1.5rem 2.5rem -1.5rem rgb(15 14 18 / 0.3);
	}

	.preview__glass {
		position: relative;
		aspect-ratio: 1280 / 738;
		overflow: hidden;
		border-radius: var(--xy-radius-screen);
		background-color: var(--xy-black);
		box-shadow: 0 0 0 1px rgb(0 0 0 / 0.6);
	}

	/* the glass's faint reflection, over the picture (as on the screen panel) */
	.preview__glass::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: linear-gradient(160deg, rgb(255 255 255 / 0.05), transparent 38%);
		pointer-events: none;
	}

	.preview__poster,
	.preview__video {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* the video covers the poster once it moves (they share the first frame) */
	.preview__video {
		opacity: 0;
		transition: opacity var(--xy-dur-base) var(--xy-ease-standard);
	}

	.preview__video.is-shown {
		opacity: 1;
	}

	/* on the glass's edge, not the bezel's */
	.preview__caption {
		position: relative;
		margin-top: 1rem;
		padding-inline: 0.3125rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		text-wrap: pretty;
	}

	.note {
		position: relative;
		padding-inline: 0.3125rem;
	}

	.note__title {
		margin: 0;
		font-size: var(--xy-text-2xl);
		line-height: var(--xy-leading-2xl);
		font-weight: var(--xy-weight-light);
		letter-spacing: var(--xy-tracking-display);
		color: var(--xy-fg);
	}

	.note__text {
		margin: 0.75rem 0 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-base);
		line-height: var(--xy-leading-base);
	}

	.send {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 2rem;
	}

	.send__label {
		margin: 1.25rem 0 0;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}

	/* a well cut into the page; one tap selects the whole address */
	.send__url {
		margin: 0;
		padding: 0.75rem 1rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		box-shadow: var(--xy-shadow-recess);
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		overflow-wrap: anywhere;
		user-select: all;
		-webkit-user-select: all;
	}

	.send :global(.send__key) {
		width: 100%;
		margin-top: 0.25rem;
	}

	.send__status {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	/* Turned sideways: the recording beside the note, both in view. */
	@media (orientation: landscape) and (min-width: 34rem) {
		.phone__body {
			flex-direction: row;
			align-items: center;
			gap: 2rem;
			max-width: 64rem;
			padding: 1.5rem 1.5rem 1.75rem;
		}

		.preview {
			flex: 1.2;
			min-width: 0;
		}

		.note {
			flex: 1;
			min-width: 0;
		}

		.note__title {
			font-size: var(--xy-text-xl);
			line-height: var(--xy-leading-xl);
		}

		.note__text {
			margin-top: 0.5rem;
			font-size: var(--xy-text-sm);
			line-height: var(--xy-leading-sm);
		}

		.send {
			margin-top: 1.25rem;
		}

		.send__label {
			margin-top: 1rem;
		}
	}
</style>
