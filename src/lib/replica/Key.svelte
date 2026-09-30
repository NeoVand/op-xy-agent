<!--
@component
One of the 68 keys: its tile, the round keycap with TE's legend, the LED window (off, dim, white or
red, optionally blinking, with a glow), the press animation, and a ring for keyboard focus and for
teaching highlights. The whole tile is the hit area. Pointer, touch and keyboard input go to the
ReplicaState; an alt- or ⌘-click latches the key for single-pointer combos (Shift is the OP-XY's
shift: see Replica.svelte).

Only four values are reactive (pressed, LED, blink, highlight); they flip data attributes and CSS
does the rest, so a key press never re-renders the legend paths.
-->
<svelte:options namespace="svg" />

<script lang="ts" module>
	/**
	 * An unlit LED window is a small black hole in the cap, on the pale step keys as on the dark
	 * ones (TE's top-down photo: #1c1e21–#252221 unlit, #fcfeff lit), so a lit one, pure white,
	 * stands out from every cap.
	 */
	const UNLIT_WINDOW = '#1d1f22';
</script>

<script lang="ts">
	import type { KeyId } from '$lib/core/opxy';
	import type { KeyPart } from './geometry';
	import { capturePointer } from './input';
	import type { ReplicaState } from './state.svelte';

	interface Props {
		part: KeyPart;
		replica: ReplicaState;
		/** The computer keys that press it (`aria-keyshortcuts`), when the keyboard plays the replica. */
		shortcut?: string;
		/** The key that currently takes Tab focus (roving tabindex across the keys). */
		tabbable?: boolean;
		onfocuskey?: (id: KeyId) => void;
		/** Arrow keys: move focus toward (dx, dy). */
		onnavigate?: (id: KeyId, dx: number, dy: number) => void;
	}

	let { part, replica, shortcut, tabbable = false, onfocuskey, onnavigate }: Props = $props();

	const pressed = $derived(replica.isPressed(part.id));
	const led = $derived(part.art.led ? replica.shownLed(part.id) : 'off');
	const guided = $derived(part.art.led ? replica.guide(part.id) !== undefined : false);
	const root = $derived(guided && replica.guide(part.id) === 'root');
	const blinking = $derived(part.art.led !== null && replica.isBlinking(part.id));
	const highlight = $derived(replica.highlight(part.id));

	/** The computer key shown on the tile while the pointer is over the keyboard (its first key). */
	const hint = $derived.by(() => {
		const first = shortcut?.split(' ')[0];
		return first === 'Space' ? '␣' : (first ?? null);
	});

	const label = $derived(
		part.control.track
			? `${part.control.label} (${part.control.track.auxiliary.name})`
			: part.control.label
	);
	const tile = $derived(part.tile);
	const cell = $derived(part.art.tile);
	const capR = $derived(part.art.capRadius);
	const ledArt = $derived(part.art.led);
	/** The unlit window's colour; the lit core fades back to it. Pale = the light half of the step ramp. */

	/** Pointer that pressed the key (so another finger's release does not lift it). */
	let pointer: number | null = null;
	let keyboardDown = false;

	const ARROWS: Record<string, [number, number]> = {
		ArrowLeft: [-1, 0],
		ArrowRight: [1, 0],
		ArrowUp: [0, -1],
		ArrowDown: [0, 1]
	};

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		if (event.altKey || event.metaKey) {
			replica.toggleLatch(part.id, 'pointer');
			return;
		}
		if (replica.isLatched(part.id)) {
			replica.release(part.id, 'pointer');
			return;
		}
		pointer = event.pointerId;
		capturePointer(event);
		replica.press(part.id, 'pointer');
	}

	function lift(event: PointerEvent) {
		if (event.pointerId !== pointer) return;
		pointer = null;
		if (!replica.isLatched(part.id)) replica.release(part.id, 'pointer');
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			if (!event.repeat) {
				keyboardDown = true;
				replica.press(part.id, 'keyboard');
			}
			return;
		}
		const direction = ARROWS[event.key];
		if (direction && onnavigate) {
			event.preventDefault();
			onnavigate(part.id, direction[0], direction[1]);
		}
	}

	function onkeyup(event: KeyboardEvent) {
		if ((event.key === ' ' || event.key === 'Enter') && keyboardDown) {
			event.preventDefault();
			keyboardDown = false;
			replica.release(part.id, 'keyboard');
		}
	}

	function onblur() {
		if (keyboardDown) {
			keyboardDown = false;
			replica.release(part.id, 'keyboard');
		}
	}
</script>

<g
	class={['key', part.light && 'key--light']}
	transform="translate({part.x} {part.y})"
	data-id={part.id}
	data-led={led}
	data-hl={highlight}
	data-root={root || undefined}
	data-guide={guided || undefined}
	data-pressed={pressed || undefined}
	data-blink={blinking || undefined}
	role="button"
	tabindex={tabbable ? 0 : -1}
	aria-label={label}
	aria-keyshortcuts={shortcut}
	data-hint={hint ? '' : undefined}
	aria-pressed={pressed}
	{onpointerdown}
	onpointerup={lift}
	onpointercancel={lift}
	onlostpointercapture={lift}
	{onkeydown}
	{onkeyup}
	{onblur}
	onfocus={() => onfocuskey?.(part.id)}
>
	<rect
		class="key__tile"
		x={tile.x}
		y={tile.y}
		width={tile.w}
		height={tile.h}
		rx={tile.r}
		fill={part.colors.tile}
	/>
	<rect
		x={tile.x}
		y={tile.y}
		width={tile.w}
		height={tile.h}
		rx={tile.r}
		fill="url(#rx-tile-shade)"
		stroke="url(#rx-tile-rim)"
		stroke-width="0.14"
	/>
	{#each part.tileLegend as art (art.d)}
		<path d={art.d} fill={part.colors.legend} fill-rule={art.rule} />
	{/each}

	<!-- the cap stands 2 mm proud: the tile's collar catching light behind it, a short hard shadow
	     in front and a crisp dark edge all round where it leaves the tile (TE's top-down photo) -->
	<circle
		r={capR + 2.4}
		fill={part.light ? 'url(#rx-collar-light)' : 'url(#rx-collar)'}
		mask="url(#rx-back)"
	/>
	<circle
		class="key__shadow"
		cx="0.15"
		cy="0.7"
		r={capR + 1.3}
		fill={part.light ? 'url(#rx-cap-shadow-light)' : 'url(#rx-cap-shadow)'}
	/>
	<circle cy="0.05" r={capR + 0.18} fill="#000000" fill-opacity={part.light ? 0.36 : 0.56} />
	<g class="key__cap">
		<circle r={capR} fill={part.colors.cap} />
		<circle r={capR} fill={part.light ? 'url(#rx-cap-shade-light)' : 'url(#rx-cap-shade)'} />
		<!-- one stroke for the edge: catching light at the back, dark toward the front -->
		<circle
			r={capR - 0.09}
			fill="none"
			stroke={part.light ? 'url(#rx-cap-rim-light)' : 'url(#rx-cap-rim)'}
			stroke-width="0.2"
		/>
		{#each part.capLegend as art (art.d)}
			<path
				d={art.d}
				fill={art.stroke ? 'none' : part.colors.legend}
				stroke={art.stroke ? part.colors.legend : undefined}
				stroke-width={art.stroke}
				fill-rule={art.rule}
			/>
		{/each}
		{#if ledArt}
			<!-- the window's lower rim catching the light, barely -->
			<circle cx={ledArt.x} cy={ledArt.y + 0.06} r={ledArt.r} fill="#ffffff" fill-opacity="0.07" />
			<circle class="key__led" cx={ledArt.x} cy={ledArt.y} r={ledArt.r} fill={UNLIT_WINDOW} />
			<!-- one core per colour, each with a fixed fill, so a light decays in its own colour -->
			<circle class="key__core key__core--white" cx={ledArt.x} cy={ledArt.y} r={ledArt.r} />
			<circle class="key__core key__core--red" cx={ledArt.x} cy={ledArt.y} r={ledArt.r} />
		{/if}
		<circle class="key__state" r={capR} />
	</g>
	{#if ledArt}
		<circle class="key__glow key__glow--white" cx={ledArt.x} cy={ledArt.y} r={ledArt.r * 2.6} />
		<circle class="key__glow key__glow--red" cx={ledArt.x} cy={ledArt.y} r={ledArt.r * 2.6} />
	{/if}

	{#if hint}
		<text
			class="key__hint"
			x={tile.x + tile.w - 0.7}
			y={tile.y + tile.h - 0.7}
			text-anchor="end"
			fill={part.colors.legend}
			aria-hidden="true">{hint}</text
		>
	{/if}

	{#if highlight === 'hold' || highlight === 'press'}
		<rect
			class="key__halo"
			x={tile.x - 0.3}
			y={tile.y - 0.3}
			width={tile.w + 0.6}
			height={tile.h + 0.6}
			rx={tile.r + 0.3}
		/>
	{/if}
	<rect
		class="key__ring"
		x={tile.x - 0.3}
		y={tile.y - 0.3}
		width={tile.w + 0.6}
		height={tile.h + 0.6}
		rx={tile.r + 0.3}
	/>
	<rect class="key__hit" x={cell.x} y={cell.y} width={cell.w} height={cell.h} />
</g>

<style>
	/* the computer's key, faint on each tile while the pointer is over any key it plays */
	.key__hint {
		font-family: var(--xy-font-mono, ui-monospace, monospace);
		font-size: 2.5px;
		font-weight: 600;
		opacity: 0;
		transition: opacity 220ms var(--rx-ease-decay, ease-out);
		pointer-events: none;
	}

	:global(.replica:has(.key[data-hint]:hover)) .key__hint {
		opacity: 0.7;
	}

	.key {
		cursor: pointer;
		outline: none;
		touch-action: none;
		-webkit-tap-highlight-color: transparent;
	}

	.key__hit {
		fill: transparent;
	}

	/* press: the cap sinks toward its tile, so its shadow tightens */
	.key__cap,
	.key__shadow {
		transform-box: fill-box;
		transform-origin: center;
		transition: transform var(--rx-release, 140ms) var(--rx-ease-release, ease-out);
	}

	.key__shadow {
		transition-property: transform, opacity;
	}

	.key[data-pressed] .key__cap {
		transform: scale(0.955) translateY(0.1px);
		transition-duration: var(--rx-press, 50ms);
		transition-timing-function: var(--rx-ease-press, ease-in);
	}

	.key[data-pressed] .key__shadow {
		opacity: 0.55;
		transform: translateY(-0.2px) scale(0.96);
		transition-duration: var(--rx-press, 50ms);
	}

	/* one overlay for hover (a touch lighter) and press (a pressed cap sits lower, in shade) */
	.key__state {
		fill: #ffffff;
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--rx-release, 140ms) ease-out;
	}

	@media (hover: hover) {
		.key:hover .key__state {
			opacity: 0.045;
		}

		.key--light:hover .key__state {
			opacity: 0.08;
		}
	}

	.key[data-pressed] .key__state {
		fill: #000000;
		opacity: 0.22;
		transition-duration: var(--rx-press, 50ms);
	}

	.key--light[data-pressed] .key__state {
		opacity: 0.12;
	}

	/* LED window: a black hole in the cap when off. A lit core snaps on over it and decays back to
	 * it in its own colour; each colour has its own core and glow with a fixed fill, so nothing ever
	 * falls back to SVG's default black while fading. */
	.key__core,
	.key__glow {
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--rx-led-decay, 260ms) var(--rx-ease-decay, ease-out);
	}

	.key__core--white {
		fill: var(--rx-led-white, #ffffff);
	}

	.key__core--red {
		fill: var(--rx-led-red, #ff4d00);
	}

	.key__glow--white {
		fill: url(#rx-glow-white);
	}

	.key__glow--red {
		fill: url(#rx-glow-red);
	}

	.key[data-led='white'] .key__core--white,
	.key[data-led='white'] .key__glow--white,
	.key[data-led='red'] .key__core--red,
	.key[data-led='red'] .key__glow--red {
		opacity: 1;
		transition-duration: var(--rx-led-attack, 30ms);
	}

	/* dim: the same white light, faintly (brighter than the unlit window on every cap) */
	.key[data-led='dim'] .key__core--white {
		opacity: 0.42;
		transition-duration: var(--rx-led-attack, 30ms);
	}

	.key[data-led='dim'] .key__glow--white {
		opacity: 0.2;
		transition-duration: var(--rx-led-attack, 30ms);
	}

	.key[data-blink] .key__core,
	.key[data-blink] .key__glow {
		animation: key-blink 0.5s steps(1, end) infinite;
	}

	/* focus and teaching rings */
	.key__ring,
	.key__halo {
		fill: none;
		stroke: var(--rx-ring, #f7f5f5);
		opacity: 0;
		pointer-events: none;
		transition: opacity 160ms ease-out;
	}

	.key__ring {
		stroke-width: 0.32;
	}

	.key__halo {
		stroke-width: 1.2;
	}

	.key:focus-visible .key__ring {
		opacity: 1;
		stroke: var(--rx-focus, #f7f5f5);
	}

	.key[data-hl='hold'] .key__ring,
	.key[data-hl='turn'] .key__ring {
		opacity: 1;
		stroke-width: 0.45;
	}

	.key__halo {
		opacity: 0.16;
	}

	.key[data-hl='press'] .key__ring {
		opacity: 1;
		animation: key-pulse 0.9s ease-in-out infinite;
	}

	/* a guide's keys (a scale lit on the keyboard) light a little brighter than the device's dim,
	 * so they read at a glance; the device's own light still wins */
	.key[data-guide][data-led='dim'] .key__core--white {
		opacity: 0.62;
	}

	.key[data-guide][data-led='dim'] .key__glow--white {
		opacity: 0.3;
	}

	/* a guide's root: a faint, steady ring */
	.key[data-root] .key__ring {
		opacity: 0.32;
	}

	.key[data-hl='candidate'] .key__ring {
		opacity: 0.45;
		stroke-dasharray: 0.9 0.7;
	}

	@keyframes key-blink {
		50% {
			opacity: 0;
		}
	}

	@keyframes key-pulse {
		50% {
			opacity: 0.35;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.key__cap,
		.key__shadow {
			transition: none;
		}

		.key[data-hl='press'] .key__ring {
			animation: none;
		}
	}
</style>
