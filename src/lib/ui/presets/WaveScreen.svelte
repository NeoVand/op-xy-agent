<!--
@component
The preset maker's screen: black glass in the device's screen language. Its header is the engine
header bar's four cells (the four encoders' values, dark to light); below, the sound being edited,
drawn whole, with its region bright and the rest dim. Its handles are the patch fields: drag the
region's edges (`sample.start`, `sample.end`), the fades at its top corners, and for the samplers
the loop's ends along the bottom (`loop.start`, `loop.end`, snapped to rising zero crossings unless
alt is held) over its crossfade. A sliced loop shows its cuts instead: drag one to move it,
double-click to add one, alt-click one to take it away, click a slice to hear it. A line runs along
with what plays.
-->
<script lang="ts">
	import { Readout } from '$lib/ui';
	import {
		nearestZero,
		overview,
		noteName,
		DRUM_FIRST_KEY,
		type BenchMode,
		type SoundEdit
	} from '$lib/core/presets';
	import type { BenchSound } from './bench.svelte';

	/** What is sounding, to draw the playhead. */
	interface Playhead {
		/** `performance.now()` when it started. */
		readonly t0: number;
		/** Frames per second of the sound's own frames (its rate times the pitch ratio). */
		readonly speed: number;
		readonly from: number;
		readonly to: number;
		readonly reverse: boolean;
		readonly loop: { readonly start: number; readonly end: number } | null;
	}

	interface Cell {
		readonly label: string;
		readonly value: string;
		readonly encoder: 1 | 2 | 3 | 4;
	}

	interface Props {
		mode: BenchMode;
		sound: BenchSound | null;
		cuts?: readonly number[];
		slice?: number | null;
		cells: readonly Cell[];
		title: string;
		subtitle: string;
		info: string;
		message?: string | null;
		playing?: Playhead | null;
		onedit: (change: Partial<SoundEdit>) => void;
		onmovecut?: (index: number, frame: number) => void;
		onaddcut?: (frame: number) => void;
		onremovecut?: (index: number) => void;
		onpickslice?: (index: number) => void;
		/** The empty screen's content. */
		empty?: import('svelte').Snippet;
	}

	let {
		mode,
		sound,
		cuts = [],
		slice = null,
		cells,
		title,
		subtitle,
		info,
		message = null,
		playing = null,
		onedit,
		onmovecut,
		onaddcut,
		onremovecut,
		onpickslice,
		empty
	}: Props = $props();

	const HEIGHT = 168;
	let width = $state(0);
	let wave: HTMLElement | null = null;

	const frames = $derived(sound?.audio.channels[0]?.length ?? 0);
	const edit = $derived(sound?.edit ?? null);
	const sampler = $derived(mode === 'multisampler' || mode === 'sampler');
	const slices = $derived(mode === 'slices');
	/** Share of the width at a frame. */
	const at = (frame: number) => (frames > 0 ? (frame / frames) * 100 : 0);

	/** Overviews per sound and width, made once. */
	const cache = new WeakMap<object, { n: number; peaks: Float32Array }>();
	const peaks = $derived.by(() => {
		if (!sound || width < 2) return null;
		const n = Math.round(width);
		const hit = cache.get(sound.audio);
		if (hit && hit.n === n) return hit.peaks;
		const made = overview(sound.audio, n);
		cache.set(sound.audio, { n, peaks: made });
		return made;
	});

	/** The wave's box: its width, and where pointers land on it. */
	function observe(node: HTMLElement) {
		wave = node;
		const observer = new ResizeObserver(([entry]) => (width = entry.contentRect.width));
		observer.observe(node);
		return () => {
			observer.disconnect();
			wave = null;
		};
	}

	function paint(canvas: HTMLCanvasElement) {
		const n = Math.round(width);
		const context = canvas.getContext('2d');
		if (!context || n === 0) return;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = n * ratio;
		canvas.height = HEIGHT * ratio;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, n, HEIGHT);
		if (!peaks || !edit || frames === 0) return;
		let peak = 0;
		for (const v of peaks) peak = Math.max(peak, Math.abs(v));
		const middle = HEIGHT / 2;
		const scale = peak > 0 ? (HEIGHT / 2 - 6) / peak : 0;
		const x = (frame: number) => (frame / frames) * n;
		const inside = (c: number) => {
			if (slices) return true;
			const f = ((c + 0.5) / n) * frames;
			return f >= edit.start && f < edit.end;
		};
		// the envelope the fades write: 1 inside the region, falling to 0 at its edges
		const gainAt = (c: number) => {
			if (slices) return 1;
			const f = ((c + 0.5) / n) * frames;
			if (edit.fadeIn > 0 && f < edit.start + edit.fadeIn)
				return Math.max(0, (f - edit.start) / edit.fadeIn);
			if (edit.fadeOut > 0 && f > edit.end - edit.fadeOut)
				return Math.max(0, (edit.end - f) / edit.fadeOut);
			return 1;
		};
		// the slice being played or picked, lit
		if (slices && slice !== null && cuts.length > 0) {
			const a = cuts[slice] ?? 0;
			const b = cuts[slice + 1] ?? frames;
			context.fillStyle = 'rgba(247, 245, 245, 0.09)';
			context.fillRect(x(a), 0, x(b) - x(a), HEIGHT);
		}
		if (sampler && edit.loop.mode !== 'off') {
			context.fillStyle = 'rgba(247, 245, 245, 0.07)';
			context.fillRect(x(edit.loop.start), 0, x(edit.loop.end) - x(edit.loop.start), HEIGHT);
			if (edit.loop.crossfade > 0) {
				const from = x(edit.loop.end - edit.loop.crossfade);
				const gradient = context.createLinearGradient(from, 0, x(edit.loop.end), 0);
				gradient.addColorStop(0, 'rgba(247, 245, 245, 0)');
				gradient.addColorStop(1, 'rgba(247, 245, 245, 0.16)');
				context.fillStyle = gradient;
				context.fillRect(from, 0, x(edit.loop.end) - from, HEIGHT);
			}
		}
		for (let c = 0; c < n; c++) {
			const g = gainAt(c);
			const top = middle - peaks[2 * c + 1] * scale * g;
			const bottom = middle - peaks[2 * c] * scale * g;
			context.fillStyle = inside(c) ? '#f7f5f5' : '#3d3d44';
			context.fillRect(c, top, 1, Math.max(1, bottom - top));
		}
		// the centre line, faint
		context.fillStyle = 'rgba(247, 245, 245, 0.12)';
		context.fillRect(0, middle, n, 1);
		if (!slices) {
			// the fade envelope, as a line over the region
			context.strokeStyle = 'rgba(247, 245, 245, 0.55)';
			context.lineWidth = 1;
			context.beginPath();
			context.moveTo(x(edit.start), HEIGHT - 1);
			context.lineTo(x(edit.start + edit.fadeIn), 1);
			context.lineTo(x(edit.end - edit.fadeOut), 1);
			context.lineTo(x(edit.end), HEIGHT - 1);
			context.stroke();
		}
	}

	/**
	 * The playhead: a line moved along with what plays, frame by frame of the display, straight on
	 * the element (it is motion, not state), gone when the sound is.
	 */
	function follow(p: Playhead) {
		return (node: HTMLElement) => {
			let frame = 0;
			const step = () => {
				let pos = ((performance.now() - p.t0) / 1000) * p.speed;
				if (p.loop && pos > p.loop.end - p.from) {
					const length = Math.max(1, p.loop.end - p.loop.start);
					pos = p.loop.start - p.from + ((pos - (p.loop.end - p.from)) % length);
				}
				if (!p.loop && pos > p.to - p.from) {
					node.style.opacity = '0';
					return;
				}
				node.style.opacity = '1';
				node.style.left = `${at(p.reverse ? p.to - pos : p.from + pos)}%`;
				frame = requestAnimationFrame(step);
			};
			frame = requestAnimationFrame(step);
			return () => cancelAnimationFrame(frame);
		};
	}

	/** Where a pointer is, in frames. */
	function frameAt(clientX: number): number {
		const box = wave?.getBoundingClientRect();
		if (!box || box.width === 0) return 0;
		return Math.round(((clientX - box.left) / box.width) * frames);
	}

	type Handle = 'start' | 'end' | 'fadeIn' | 'fadeOut' | 'loopStart' | 'loopEnd';
	let held = $state<Handle | { cut: number } | null>(null);

	function grab(event: PointerEvent, handle: Handle | { cut: number }) {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		if (typeof handle === 'object' && event.altKey) {
			onremovecut?.(handle.cut);
			return;
		}
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		held = handle;
	}

	function drag(event: PointerEvent) {
		if (!held || !edit || !sound) return;
		const f = frameAt(event.clientX);
		const snap = (v: number) =>
			event.altKey ? v : nearestZero(sound.audio, v, Math.round(0.005 * sound.audio.sampleRate));
		if (typeof held === 'object') {
			onmovecut?.(held.cut, event.altKey ? f : snap(f));
			return;
		}
		switch (held) {
			case 'start':
				onedit({ start: Math.min(f, edit.end - 88) });
				break;
			case 'end':
				onedit({ end: Math.max(f, edit.start + 88) });
				break;
			case 'fadeIn':
				onedit({ fadeIn: Math.max(0, f - edit.start) });
				break;
			case 'fadeOut':
				onedit({ fadeOut: Math.max(0, edit.end - f) });
				break;
			case 'loopStart':
				onedit({ loop: { ...edit.loop, start: snap(Math.min(f, edit.loop.end - 88)) } });
				break;
			case 'loopEnd':
				onedit({ loop: { ...edit.loop, end: snap(Math.max(f, edit.loop.start + 88)) } });
				break;
		}
	}

	function drop(event: PointerEvent) {
		if (!held) return;
		held = null;
		(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
	}

	/** Arrow keys nudge a handle by a millisecond (shift: ten). */
	function nudge(event: KeyboardEvent, handle: Handle) {
		if (!edit || !sound) return;
		const ms = Math.round(sound.audio.sampleRate / 1000) * (event.shiftKey ? 10 : 1);
		const d =
			event.key === 'ArrowLeft' || event.key === 'ArrowDown'
				? -ms
				: event.key === 'ArrowRight' || event.key === 'ArrowUp'
					? ms
					: 0;
		if (d === 0) return;
		event.preventDefault();
		event.stopPropagation();
		const values: Record<Handle, () => Partial<SoundEdit>> = {
			start: () => ({ start: edit.start + d }),
			end: () => ({ end: edit.end + d }),
			fadeIn: () => ({ fadeIn: edit.fadeIn + d }),
			fadeOut: () => ({ fadeOut: edit.fadeOut - d }),
			loopStart: () => ({ loop: { ...edit.loop, start: edit.loop.start + d } }),
			loopEnd: () => ({ loop: { ...edit.loop, end: edit.loop.end + d } })
		};
		onedit(values[handle]());
	}

	function sliceAt(frame: number): number {
		let index = 0;
		for (let i = 0; i < cuts.length; i++) if (cuts[i] <= frame) index = i;
		return index;
	}

	const ms = (f: number) => {
		const s = f / (sound?.audio.sampleRate ?? 44100);
		return s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(2)} s`;
	};
</script>

<div class="screen">
	{#if sound && edit}
		<div class="screen__cells" aria-label="the encoders' values">
			{#each cells as cell (cell.label + cell.encoder)}
				<Readout variant="cell" label={cell.label} value={cell.value} encoder={cell.encoder} />
			{/each}
			{#each Array.from({ length: Math.max(0, 4 - cells.length) }, (_, i) => i) as i (i)}
				<Readout
					variant="cell"
					label=""
					value=""
					encoder={(cells.length + i + 1) as 1 | 2 | 3 | 4}
				/>
			{/each}
		</div>
		<div class="screen__title">
			<span class="screen__key">{title}</span>
			<span class="screen__name">{subtitle}</span>
			{#if message}
				<span class="screen__message">{message}</span>
			{/if}
		</div>
		<div
			class={['screen__wave', held && 'is-dragging']}
			{@attach observe}
			role="presentation"
			onpointermove={drag}
			onpointerup={drop}
			onpointercancel={drop}
			ondblclick={(event) => slices && onaddcut?.(frameAt(event.clientX))}
			onpointerdown={(event) => {
				if (slices && event.button === 0) onpickslice?.(sliceAt(frameAt(event.clientX)));
			}}
		>
			<canvas class="screen__canvas" style:height="{HEIGHT}px" aria-hidden="true" {@attach paint}
			></canvas>

			{#if slices}
				{#each cuts as cut, i (i)}
					<div
						class={['cut', i === slice && 'is-picked']}
						style:left="{at(cut)}%"
						role="slider"
						tabindex="0"
						aria-label={`cut ${i + 1} (${noteName(DRUM_FIRST_KEY + i)})`}
						aria-valuemin={0}
						aria-valuemax={frames}
						aria-valuenow={cut}
						aria-valuetext={ms(cut)}
						onpointerdown={(event) => grab(event, { cut: i })}
						onkeydown={(event) => {
							const d = event.key === 'ArrowLeft' ? -441 : event.key === 'ArrowRight' ? 441 : 0;
							if (d !== 0) {
								event.preventDefault();
								event.stopPropagation();
								onmovecut?.(i, cut + d * (event.shiftKey ? 10 : 1));
							} else if (event.key === 'Backspace' || event.key === 'Delete') {
								event.preventDefault();
								onremovecut?.(i);
							}
						}}
					>
						<span class="cut__flag">{noteName(DRUM_FIRST_KEY + i)}</span>
					</div>
				{/each}
			{:else}
				<!-- the region's edges, full height -->
				{#each [['start', edit.start], ['end', edit.end]] as const as [handle, frame] (handle)}
					<div
						class={['edge', `edge--${handle}`, held === handle && 'is-held']}
						style:left="{at(frame)}%"
						role="slider"
						tabindex="0"
						aria-label={handle === 'start' ? 'region start handle' : 'region end handle'}
						aria-valuemin={0}
						aria-valuemax={frames}
						aria-valuenow={frame}
						aria-valuetext={ms(frame)}
						onpointerdown={(event) => grab(event, handle)}
						onkeydown={(event) => nudge(event, handle)}
					>
						<span class="edge__grip"></span>
					</div>
				{/each}
				<!-- the fades, at the region's top corners -->
				{#each [['fadeIn', edit.start + edit.fadeIn], ['fadeOut', edit.end - edit.fadeOut]] as const as [handle, frame] (handle)}
					<div
						class={['fade', held === handle && 'is-held']}
						style:left="{at(frame)}%"
						role="slider"
						tabindex="0"
						aria-label={handle === 'fadeIn' ? 'fade in handle' : 'fade out handle'}
						aria-valuemin={0}
						aria-valuemax={frames}
						aria-valuenow={handle === 'fadeIn' ? edit.fadeIn : edit.fadeOut}
						aria-valuetext={ms(handle === 'fadeIn' ? edit.fadeIn : edit.fadeOut)}
						onpointerdown={(event) => grab(event, handle)}
						onkeydown={(event) => nudge(event, handle)}
					></div>
				{/each}
				{#if sampler && edit.loop.mode !== 'off'}
					{#each [['loopStart', edit.loop.start], ['loopEnd', edit.loop.end]] as const as [handle, frame] (handle)}
						<div
							class={['loop', `loop--${handle}`, held === handle && 'is-held']}
							style:left="{at(frame)}%"
							role="slider"
							tabindex="0"
							aria-label={handle === 'loopStart' ? 'loop start handle' : 'loop end handle'}
							aria-valuemin={0}
							aria-valuemax={frames}
							aria-valuenow={frame}
							aria-valuetext={ms(frame)}
							onpointerdown={(event) => grab(event, handle)}
							onkeydown={(event) => nudge(event, handle)}
						>
							<span class="loop__flag">{handle === 'loopStart' ? '[' : ']'}</span>
						</div>
					{/each}
				{/if}
			{/if}

			{#if playing}
				{#key playing}
					<div class="head" aria-hidden="true" {@attach follow(playing)}></div>
				{/key}
			{/if}
		</div>
		<div class="screen__info">
			<span>{info}</span>
			<span class="screen__hint">
				{#if slices}
					drag a cut, double-click to add one, alt-click to remove it
				{:else if sampler}
					drag the edges, the fades and the loop; alt-drag off the zero crossings
				{:else}
					drag the edges to trim, the top corners to fade
				{/if}
			</span>
		</div>
	{:else}
		<div class="screen__empty">
			{@render empty?.()}
		</div>
	{/if}
</div>

<style>
	.screen {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
		padding: 0.625rem 0.75rem 0.5rem;
		border-radius: var(--xy-radius-screen);
		background-color: #000000;
		color: var(--xy-scr-fg);
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 0.07),
			0 0 0 3px var(--xy-mat-glass),
			inset 0 0 2rem rgb(0 0 0 / 0.6);
		overflow: hidden;
	}

	/* a faint reflection across the glass */
	.screen::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: linear-gradient(160deg, rgb(255 255 255 / 0.04), transparent 35%);
		pointer-events: none;
	}

	.screen__cells {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.screen__cells :global(.readout--cell) {
		min-width: 0;
		height: 2.25rem;
	}

	.screen__cells :global(.readout--cell .value) {
		font-size: var(--xy-text-xl);
	}

	.screen__title {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		min-width: 0;
		height: 1.5rem;
	}

	.screen__key {
		color: var(--xy-scr-muted);
		font-size: var(--xy-text-sm);
		font-variant-numeric: tabular-nums;
	}

	.screen__name {
		overflow: hidden;
		font-size: var(--xy-text-lg);
		font-weight: var(--xy-weight-light);
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.screen__message {
		overflow: hidden;
		margin-left: auto;
		color: var(--xy-scr-muted);
		font-size: var(--xy-text-xs);
		white-space: nowrap;
		text-overflow: ellipsis;
		animation: message-in var(--xy-dur-slow) var(--xy-ease-standard);
	}

	@keyframes message-in {
		from {
			opacity: 0;
		}
	}

	.screen__wave {
		position: relative;
		touch-action: none;
	}

	.screen__wave.is-dragging {
		cursor: ew-resize;
	}

	.screen__canvas {
		display: block;
		width: 100%;
	}

	.screen__info {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		color: var(--xy-scr-muted);
		font-size: var(--xy-text-2xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.screen__hint {
		overflow: hidden;
		color: var(--xy-ramp-4);
		text-overflow: ellipsis;
	}

	.screen__empty {
		display: flex;
		flex: 1;
		min-height: 13.5rem;
	}

	/* handles: thin lines with a grip, wide enough to catch */
	.edge,
	.fade,
	.loop,
	.cut {
		position: absolute;
		top: 0;
		width: 0.875rem;
		margin-left: -0.4375rem;
		cursor: ew-resize;
		touch-action: none;
		outline: none;
	}

	.edge,
	.cut {
		bottom: 0;
	}

	.edge::before,
	.cut::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 1px;
		background-color: #ffffff;
	}

	.edge__grip {
		position: absolute;
		bottom: 0;
		left: 50%;
		width: 0.5rem;
		height: 0.875rem;
		margin-left: -0.25rem;
		border-radius: 0.125rem;
		background-color: #ffffff;
		transition: transform var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.edge:hover .edge__grip,
	.edge.is-held .edge__grip,
	.edge:focus-visible .edge__grip {
		transform: scaleY(1.3);
	}

	.edge:focus-visible::before,
	.fade:focus-visible,
	.loop:focus-visible .loop__flag,
	.cut:focus-visible .cut__flag {
		box-shadow: 0 0 0 1.5px var(--xy-focus);
	}

	.fade {
		top: -0.125rem;
		height: 0.75rem;
	}

	.fade::before {
		content: '';
		position: absolute;
		top: 0;
		left: 50%;
		width: 0.5rem;
		height: 0.5rem;
		margin-left: -0.25rem;
		border: 1px solid #ffffff;
		border-radius: 50%;
		background-color: #000000;
		transition: transform var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.fade:hover::before,
	.fade.is-held::before {
		transform: scale(1.3);
		background-color: #ffffff;
	}

	.loop {
		top: auto;
		bottom: 0;
		height: 100%;
	}

	.loop::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 1px;
		background-image: linear-gradient(to bottom, rgb(255 255 255 / 0.6) 50%, transparent 50%);
		background-size: 1px 4px;
	}

	.loop__flag {
		position: absolute;
		bottom: 0.25rem;
		left: 50%;
		padding: 0 0.1875rem;
		border-radius: 0.125rem;
		background-color: #ffffff;
		color: #000000;
		font-size: 0.625rem;
		line-height: 0.875rem;
		transform: translateX(-50%);
	}

	.cut__flag {
		position: absolute;
		top: 0;
		left: 50%;
		padding: 0 0.1875rem;
		border-radius: 0 0.125rem 0.125rem 0;
		background-color: rgb(255 255 255 / 0.85);
		color: #000000;
		font-size: 0.5625rem;
		line-height: 0.75rem;
		white-space: nowrap;
	}

	.cut.is-picked .cut__flag {
		background-color: #ffffff;
	}

	.head {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: 1px;
		opacity: 0;
		background-color: #ffffff;
		box-shadow: 0 0 0.375rem rgb(255 255 255 / 0.7);
		pointer-events: none;
	}
</style>
