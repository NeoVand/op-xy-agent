<!--
@component
A deliberately abstract stand-in for the device until the interactive replica lands (M2): the body
outline at its exact 285 x 102 mm proportions and the silhouette of its tile grid (17 x 6 tiles at the
15.5 mm pitch, with the real spans), drawn as hairlines. No caps, knobs, legends or screen content,
so it can never read as an inaccurate replica. The step row carries the grey ramp, the instrument's
signature, and a single playhead sweep runs across it on first paint.
-->
<script lang="ts" module>
	/* Millimetres, origin at the body's top-left (docs/research/50-hardware-ui.md §1.1, §1.4). */
	const PITCH = 15.5;
	const GAP = 0.9;
	const X0 = 4.41;
	const Y0 = 4.39;

	interface Tile {
		id: string;
		x: number;
		y: number;
		w: number;
		h: number;
		/** Index 0-15 for step tiles, which carry the ramp. */
		step?: number;
		kind?: 'screen';
	}

	function tile(id: string, c: number, r: number, w = 1, h = 1, extra: Partial<Tile> = {}): Tile {
		return {
			id,
			x: X0 + PITCH * c + GAP / 2,
			y: Y0 + PITCH * r + GAP / 2,
			w: PITCH * w - GAP,
			h: PITCH * h - GAP,
			...extra
		};
	}

	const tiles: Tile[] = [
		tile('speaker', 0, 0, 2, 2),
		tile('volume', 2, 0, 2, 1),
		tile('project', 2, 1),
		tile('tempo', 3, 1),
		tile('screen', 4, 0, 4, 2, { kind: 'screen' }),
		tile('enc1', 8, 0, 2, 2),
		tile('enc2', 10, 0, 2, 2),
		tile('enc3', 12, 0, 2, 2),
		tile('enc4', 14, 0, 2, 2),
		tile('sample', 16, 0),
		tile('com', 16, 1)
	];
	for (let c = 0; c < 17; c++) {
		tiles.push(
			tile(`r2-${c}`, c, 2),
			tile(`r3-${c}`, c, 3, 1, 1, c < 16 ? { step: c } : {}),
			tile(`r5-${c}`, c, 5)
		);
	}
	for (let c = 0; c < 3; c++) tiles.push(tile(`r4-${c}`, c, 4));
	// The accidental row splits into 1 and 1.5 tile widths.
	const splits = [3, 4.5, 5.5, 7, 8.5, 10, 11.5, 12.5, 14, 15.5, 17];
	for (let k = 0; k < splits.length - 1; k++) {
		tiles.push(tile(`acc-${k}`, splits[k], 4, splits[k + 1] - splits[k]));
	}

	const steps = tiles.filter((t) => t.step !== undefined);
</script>

<script lang="ts">
	interface Props {
		/** Short note shown on the dark screen tile. */
		note?: string;
		/** Accessible description of the placeholder. */
		label?: string;
	}

	let {
		note = 'replica arrives in M2',
		label = 'Placeholder outline of the OP-XY’s key grid. The interactive replica arrives in M2.'
	}: Props = $props();
</script>

<div class="placeholder">
	<svg viewBox="0 0 285 102" role="img" aria-label={label}>
		<rect class="body" x="0.5" y="0.5" width="284" height="101" rx="5" />

		{#each tiles as t (t.id)}
			<rect
				x={t.x}
				y={t.y}
				width={t.w}
				height={t.h}
				rx="1.25"
				class={[
					'tile',
					t.step !== undefined && 'tile--step',
					t.kind === 'screen' && 'tile--screen'
				]}
				style:fill={t.step !== undefined
					? `var(--xy-mat-step-${Math.floor(t.step / 2) + 1})`
					: undefined}
			/>
		{/each}

		<!-- one playhead sweep across the steps: each tile flashes and decays, like LEDs -->
		<g class="sweep" aria-hidden="true">
			{#each steps as t (t.id)}
				<rect
					x={t.x}
					y={t.y}
					width={t.w}
					height={t.h}
					rx="1.25"
					class="sweep__tile"
					style:--i={t.step}
				/>
			{/each}
		</g>
	</svg>
	<!-- Sits over the 4 x 2 screen tile; HTML so it stays legible at any stage size. -->
	<p class="placeholder__note" aria-hidden="true">{note}</p>
</div>

<style>
	.placeholder {
		position: relative;
		width: 100%;
		aspect-ratio: var(--xy-body-aspect);
		container-type: inline-size;
		--ink: var(--xy-ramp-2);
		--ink-soft: var(--xy-ramp-1);
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	/* The screen tile spans x 66.86-127.96 mm and y 4.84-34.94 mm of the 285 x 102 body. */
	.placeholder__note {
		position: absolute;
		left: calc(100% * 66.86 / 285);
		top: calc(100% * 4.84 / 102);
		width: calc(100% * 61.1 / 285);
		height: calc(100% * 30.1 / 102);
		display: grid;
		place-items: center;
		margin: 0;
		padding: 0.25rem;
		color: var(--xy-scr-muted);
		font-size: clamp(0.625rem, 1.35cqi, 0.8125rem);
		line-height: 1.25;
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		text-align: center;
	}

	@container (max-width: 30rem) {
		.placeholder__note {
			display: none;
		}
	}

	:global([data-theme='light']) .placeholder {
		--ink: rgb(15 14 18 / 0.3);
		--ink-soft: rgb(15 14 18 / 0.14);
	}

	.body {
		fill: rgb(255 255 255 / 0.012);
		stroke: var(--ink);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.tile {
		fill: none;
		stroke: var(--ink-soft);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.tile--screen {
		fill: rgb(0 0 0 / 0.35);
	}

	:global([data-theme='light']) .tile--screen {
		fill: rgb(15 14 18 / 0.05);
	}

	.tile--step {
		stroke: none;
	}

	.sweep__tile {
		fill: #fff;
		opacity: 0;
	}

	@media (prefers-reduced-motion: no-preference) {
		.sweep__tile {
			animation: sweep 1.1s calc(var(--i) * var(--xy-dur-step) + 500ms) both;
		}
	}

	@keyframes sweep {
		0%,
		100% {
			opacity: 0;
		}
		4%,
		10% {
			opacity: 0.55;
		}
		40% {
			opacity: 0;
		}
	}
</style>
