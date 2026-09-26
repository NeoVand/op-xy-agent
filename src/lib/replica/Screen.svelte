<!--
@component
The display: a canvas with a 480 × 222 logical resolution (the device's), drawn by the placeholder
renderer in `screen.ts`. Its backing store follows the on-screen size × devicePixelRatio so text
stays crisp at any zoom; it redraws only when the content or the size changes. A faint glass
sheen sits on top. The lines are also exposed as text for screen readers.

Place it over the replica's active screen area (Replica does this with a positioned overlay).
-->
<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { SCREEN_RESOLUTION } from './geometry';
	import { drawScreen } from './screen';

	interface Props {
		/** Lines to show; the first is a small title when there are several. */
		lines: readonly string[];
	}

	let { lines }: Props = $props();

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

		// Redraws when the lines or the backing size change; resizing clears, so size first.
		$effect(() => {
			if (!ctx) return;
			if (canvas.width !== backing.w) canvas.width = backing.w;
			if (canvas.height !== backing.h) canvas.height = backing.h;
			ctx.setTransform(backing.w / width, 0, 0, backing.h / height, 0, 0);
			drawScreen(ctx, lines, { width, height });
		});

		return () => observer.disconnect();
	};
</script>

<div class="screen">
	<canvas {width} {height} aria-hidden="true" {@attach display}></canvas>
	<div class="screen__glass"></div>
	<p class="screen__text" aria-live="polite">{lines.join(', ')}</p>
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
