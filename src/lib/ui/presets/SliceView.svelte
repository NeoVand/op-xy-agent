<!--
@component
A loop's waveform with its slices: each slice shaded in turn, its start marked and its key named
(f3 upwards, as the kit will play it). Every slice is a real button over the drawing, so a click or
a key plays it.
-->
<script lang="ts">
	import { DRUM_FIRST_KEY, noteName, type PcmAudio } from '$lib/core/presets';

	interface Props {
		audio: PcmAudio;
		/** Slice starts in frames, ascending. */
		starts: readonly number[];
		/** The slice sounding now, if any. */
		playing?: number | null;
		onpick?: (index: number) => void;
	}

	let { audio, starts, playing = null, onpick }: Props = $props();

	const HEIGHT = 112;

	let width = $state(0);
	const frames = $derived(audio.channels[0]?.length ?? 0);
	const spans = $derived(
		starts.map((start, i) => ({ start, end: i + 1 < starts.length ? starts[i + 1] : frames }))
	);

	/** The lowest and highest sample under each pixel column, the channels mixed. */
	function columns(n: number): Float32Array {
		const [left, right] = audio.channels;
		const out = new Float32Array(n * 2);
		for (let c = 0; c < n; c++) {
			const from = Math.floor((c * frames) / n);
			const to = Math.max(from + 1, Math.floor(((c + 1) * frames) / n));
			let low = 0;
			let high = 0;
			for (let i = from; i < to && i < frames; i++) {
				const v = right ? (left[i] + right[i]) / 2 : left[i];
				if (v < low) low = v;
				if (v > high) high = v;
			}
			out[2 * c] = low;
			out[2 * c + 1] = high;
		}
		return out;
	}

	function observe(canvas: HTMLCanvasElement) {
		const observer = new ResizeObserver(([entry]) => (width = entry.contentRect.width));
		observer.observe(canvas);
		return () => observer.disconnect();
	}

	function paint(canvas: HTMLCanvasElement) {
		const n = Math.round(width);
		const context = canvas.getContext('2d');
		if (!context || n === 0 || frames === 0) return;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = n * ratio;
		canvas.height = HEIGHT * ratio;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		const style = getComputedStyle(canvas);
		const color = (name: string) => style.getPropertyValue(name).trim() || '#888';
		const x = (frame: number) => (frame / frames) * n;
		context.clearRect(0, 0, n, HEIGHT);
		spans.forEach(({ start, end }, i) => {
			context.fillStyle = i === playing ? color('--xy-selection') : color('--xy-surface');
			if (i % 2 === 1 || i === playing) context.fillRect(x(start), 0, x(end) - x(start), HEIGHT);
		});
		const peaks = columns(n);
		const middle = HEIGHT / 2 + 6;
		const scale = HEIGHT / 2 - 10;
		context.fillStyle = color('--xy-fg-muted');
		for (let c = 0; c < n; c++) {
			const top = middle - peaks[2 * c + 1] * scale;
			const bottom = middle - peaks[2 * c] * scale;
			context.fillRect(c, top, 1, Math.max(1, bottom - top));
		}
		context.fillStyle = color('--xy-fg');
		context.font = `10px ${style.getPropertyValue('--xy-font-mono') || 'monospace'}`;
		spans.forEach(({ start }, i) => {
			context.fillRect(Math.round(x(start)), 0, 1, HEIGHT);
			context.fillText(noteName(DRUM_FIRST_KEY + i), Math.round(x(start)) + 3, 10);
		});
	}
</script>

<div class="slices" style:height="{HEIGHT}px">
	<canvas class="slices__wave" aria-hidden="true" {@attach observe} {@attach paint}></canvas>
	{#each spans as span, i (i)}
		<button
			type="button"
			class="slices__hit"
			style:left="{(span.start / frames) * 100}%"
			style:width="{((span.end - span.start) / frames) * 100}%"
			aria-label={`play slice ${i + 1} (${noteName(DRUM_FIRST_KEY + i)})`}
			aria-pressed={playing === i}
			onclick={() => onpick?.(i)}
		></button>
	{/each}
</div>

<style>
	.slices {
		position: relative;
		overflow: hidden;
		border-radius: var(--xy-radius-card);
		background-color: var(--xy-surface-sunken);
	}

	.slices__wave {
		display: block;
		width: 100%;
		height: 100%;
	}

	.slices__hit {
		position: absolute;
		top: 0;
		bottom: 0;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.slices__hit:hover {
		background-color: var(--xy-hover);
	}

	.slices__hit:focus-visible {
		outline: 2px solid var(--xy-focus);
		outline-offset: -2px;
	}
</style>
