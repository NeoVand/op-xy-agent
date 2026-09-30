<!--
@component
The display: a canvas with a 480 × 222 logical resolution (the device's). With a simulator frame
(the `frame` prop, or a frame source an enclosing page set with `setScreenFrameSource`) it draws
that page the way TE's guide art shows it (`$lib/sim/screen`, loaded on first use); otherwise it
shows `lines` with the placeholder text renderer in `screen.ts`. Its backing store follows the
on-screen size × devicePixelRatio so it stays crisp at any zoom; it redraws only when the content
or the size changes. A faint glass sheen sits on top. The content is also exposed as text for
screen readers (unless `speak` is off: a second copy of the display on a page should be quiet).

Place it over the replica's active screen area (Replica does this with a positioned overlay).
-->
<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { ScreenFrame } from '$lib/sim/screen/frame';
	import { SCREEN_RESOLUTION } from './geometry';
	import { drawScreen, getScreenFrameSource } from './screen';

	interface Props {
		/** Lines to show when there is no frame; the first is a small title when there are several. */
		lines: readonly string[];
		/** A simulator frame to draw instead of the lines (overrides the page's frame source). */
		frame?: ScreenFrame | null;
		/** Animation step for pages that move on their own. */
		tick?: number;
		/** Whether screen readers hear what it shows (one display on a page should). */
		speak?: boolean;
	}

	let { lines, frame = null, tick, speak = true }: Props = $props();

	const source = getScreenFrameSource();
	const shown = $derived(frame ?? source?.frame ?? null);
	const step = $derived(tick ?? source?.tick ?? 0);

	/** The page renderer, fetched the first time there is a frame to draw (text-only pages skip it). */
	type Renderer = typeof import('$lib/sim/screen');
	let renderer = $state.raw<Renderer | null>(null);
	let loading: Promise<void> | null = null;

	function loadRenderer() {
		loading ??= import('$lib/sim/screen').then((module) => {
			renderer = module;
		});
	}

	$effect(() => {
		if (shown) loadRenderer();
	});

	const spoken = $derived(
		!speak ? '' : shown && renderer ? renderer.describeFrame(shown) : lines.join(', ')
	);

	const { width, height } = SCREEN_RESOLUTION;
	/** Backing-store size in device pixels, never below the logical resolution. */
	let backing = $state({ w: width, h: height });

	const display: Attachment<HTMLCanvasElement> = (canvas) => {
		const ctx = canvas.getContext('2d');
		const observer = new ResizeObserver(([entry]) => {
			const box = entry.devicePixelContentBoxSize?.[0];
			const dpr = window.devicePixelRatio || 1;
			const w = Math.max(width, Math.round(box ? box.inlineSize : entry.contentRect.width * dpr));
			const h = Math.max(height, Math.round(box ? box.blockSize : entry.contentRect.height * dpr));
			if (w !== backing.w || h !== backing.h) backing = { w, h };
		});
		try {
			observer.observe(canvas, { box: 'device-pixel-content-box' });
		} catch {
			observer.observe(canvas);
		}

		// Redraws when the content or the backing size change; resizing clears, so size first.
		$effect(() => {
			if (!ctx) return;
			if (canvas.width !== backing.w) canvas.width = backing.w;
			if (canvas.height !== backing.h) canvas.height = backing.h;
			ctx.setTransform(backing.w / width, 0, 0, backing.h / height, 0, 0);
			if (shown) {
				// TE drew the pages 220 rows tall; the panel has 222, a blank row above and below
				ctx.fillStyle = '#000000';
				ctx.fillRect(0, 0, width, height);
				// the page renderer is still loading: stay black rather than flash the text lines
				if (!renderer) return;
				ctx.translate(0, renderer.SCREEN_OFFSET_Y);
				renderer.renderFrame(ctx, shown, { tick: step });
			} else {
				drawScreen(ctx, lines, { width, height });
			}
		});

		return () => observer.disconnect();
	};
</script>

<div class="screen" aria-hidden={speak ? undefined : 'true'}>
	<canvas {width} {height} aria-hidden="true" {@attach display}></canvas>
	<div class="screen__glass"></div>
	{#if speak}
		<p class="screen__text" aria-live="polite">{spoken}</p>
	{/if}
</div>

<style>
	.screen {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		border-radius: inherit;
		background: #000000;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	/* a faint reflection across the glass; never blur the pixels */
	.screen__glass {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(
			160deg,
			rgb(255 255 255 / 0.07) 0%,
			rgb(255 255 255 / 0.02) 38%,
			rgb(255 255 255 / 0) 60%
		);
	}

	.screen__text {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
