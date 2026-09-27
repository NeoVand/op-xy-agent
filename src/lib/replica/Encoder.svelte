<!--
@component
One of the four endless encoders: a tall knurled knob with a coloured cap (dark, mid, light grey,
white) in a recessed round dish, sized from TE's drawing. The real knob has no pointer, so the
replica shows rotation with the knurled edge and an arrow over the knob pointing the way it turns,
lit while it turns and fading after — clearer than the device without being different.

Input: vertical drag or the wheel turns it (6 px per detent); a tap clicks it; alt-drag turns
with the click held (fine adjustment); arrow keys and Page Up/Down turn, Enter/Space clicks. With
the computer's Shift down a drag is `shift + turn` (Replica.svelte holds the replica's shift).
-->
<svelte:options namespace="svg" />

<script lang="ts">
	import type { EncoderPart } from './geometry';
	import { capturePointer, dragSteps, wheel, wheelSteps } from './input';
	import { knurlPath, turnArrowPath } from './shapes';
	import type { ReplicaState } from './state.svelte';

	interface Props {
		part: EncoderPart;
		replica: ReplicaState;
	}

	let { part, replica }: Props = $props();

	const art = $derived(part.art);
	const turns = $derived(replica.turns(part.id));
	const angle = $derived(replica.angle(part.id));
	const pressed = $derived(replica.isPressed(part.id));
	const highlight = $derived(replica.highlight(part.id));
	const hint = $derived(replica.turnHint(part.id));
	const lastTurn = $derived(replica.lastTurn(part.id));
	const knurl = $derived(knurlPath(art.top + 0.12, 4.95, 40));
	const arrow = $derived(turnArrowPath(art.dish + 1.3));

	/** True between pointer down and up on a tap, for the push animation. */
	let pushing = $state(false);
	let drag: {
		pointer: number;
		startY: number;
		lastY: number;
		moved: boolean;
		fine: boolean;
	} | null = null;
	const dragAcc = { value: 0 };
	const wheelAcc = { value: 0 };
	let keyboardClick = false;

	function turnBy(steps: number, fine = false) {
		if (steps !== 0) replica.turn(part.id, steps, { source: drag ? 'pointer' : 'keyboard', fine });
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		capturePointer(event);
		// alt-drag is push-turn (fine); Shift is the OP-XY's shift, held by Replica.svelte
		const fine = event.altKey;
		drag = {
			pointer: event.pointerId,
			startY: event.clientY,
			lastY: event.clientY,
			moved: false,
			fine
		};
		dragAcc.value = 0;
		if (fine) replica.press(part.id, 'pointer');
		else pushing = true;
	}

	function onpointermove(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointer) return;
		const dy = drag.lastY - event.clientY;
		drag.lastY = event.clientY;
		if (Math.abs(event.clientY - drag.startY) > 3) {
			drag.moved = true;
			pushing = false;
		}
		turnBy(dragSteps(dy, dragAcc), drag.fine);
	}

	function onpointerup(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointer) return;
		const { moved, fine } = drag;
		drag = null;
		pushing = false;
		if (fine) {
			replica.release(part.id, 'pointer');
		} else if (!moved && event.type === 'pointerup') {
			replica.press(part.id, 'pointer');
			replica.release(part.id, 'pointer');
			replica.click(part.id, 'pointer');
		}
	}

	function onwheel(event: WheelEvent) {
		event.preventDefault();
		const steps = wheelSteps(event, wheelAcc);
		if (steps !== 0) replica.turn(part.id, steps, { source: 'pointer' });
	}

	function onkeydown(event: KeyboardEvent) {
		const steps: Record<string, number> = {
			ArrowUp: 1,
			ArrowRight: 1,
			ArrowDown: -1,
			ArrowLeft: -1,
			PageUp: 5,
			PageDown: -5
		};
		if (event.key in steps) {
			event.preventDefault();
			turnBy(steps[event.key], replica.isPressed(part.id));
		} else if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
			event.preventDefault();
			keyboardClick = true;
			replica.press(part.id, 'keyboard');
		}
	}

	function onkeyup(event: KeyboardEvent) {
		if ((event.key === 'Enter' || event.key === ' ') && keyboardClick) {
			event.preventDefault();
			keyboardClick = false;
			replica.release(part.id, 'keyboard');
			replica.click(part.id, 'keyboard');
		}
	}

	function onblur() {
		if (keyboardClick) {
			keyboardClick = false;
			replica.release(part.id, 'keyboard');
		}
	}
</script>

<g
	class="enc"
	transform="translate({part.x} {part.y})"
	data-id={part.id}
	data-hl={highlight}
	data-pushed={pressed || pushing || undefined}
	role="spinbutton"
	tabindex="0"
	aria-label={part.control.label}
	aria-valuenow={turns}
	aria-valuetext="{turns} detents"
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	onpointercancel={onpointerup}
	onlostpointercapture={onpointerup}
	{onkeydown}
	{onkeyup}
	{onblur}
	{@attach wheel(onwheel)}
>
	<rect
		x={part.tile.x}
		y={part.tile.y}
		width={part.tile.w}
		height={part.tile.h}
		rx={part.tile.r}
		fill={part.colors.tile}
	/>
	<rect
		x={part.tile.x}
		y={part.tile.y}
		width={part.tile.w}
		height={part.tile.h}
		rx={part.tile.r}
		fill="url(#rx-tile-shade)"
		stroke="url(#rx-tile-rim)"
		stroke-width="0.14"
	/>

	<!-- the recessed dish: a crisp groove at its edge, light caught on its front wall -->
	<circle r={art.dish} fill="url(#rx-dish)" />
	<circle r={art.dish - 0.45} fill="none" stroke="url(#rx-dish-catch)" stroke-width="0.6" />
	<circle r={art.dish - 0.1} fill="none" stroke="url(#rx-dish-lip)" stroke-width="0.24" />

	<!-- the knob: a tall knurled body casting a soft shadow, a darker top face, the coloured cap -->
	<circle cy="1.2" r="7" fill="url(#rx-knob-shadow)" />
	<g class="enc__knob">
		<circle r="5" fill={part.colors.body} />
		<g class="enc__knurl" style:transform="rotate({angle}deg)">
			<path d={knurl} stroke="#ffffff" stroke-opacity="0.13" stroke-width="0.11" />
		</g>
		<circle r="5" fill="url(#rx-knob-shade)" />
		<circle r={art.top} fill="url(#rx-knob-top)" />
		<circle r={art.top - 0.07} fill="none" stroke="url(#rx-knob-rim)" stroke-width="0.14" />
		<circle r={art.cap} fill={part.colors.cap} />
		<circle r={art.cap} fill="url(#rx-enc-cap-shade)" />
		<circle r={art.cap - 0.06} fill="none" stroke="url(#rx-cap-rim)" stroke-width="0.12" />
	</g>

	<!-- motion cue: one arrow the way it turns, while an animation turns it or after each detent -->
	{#if hint}
		<path class="enc__arrow" d={arrow} transform={hint < 0 ? 'scale(-1 1)' : undefined} />
	{:else if lastTurn}
		{#key lastTurn.count}
			<path
				class="enc__arrow enc__arrow--flash"
				d={arrow}
				transform={lastTurn.direction < 0 ? 'scale(-1 1)' : undefined}
			/>
		{/key}
	{/if}

	<circle class="enc__ring" r={art.dish + 0.45} />
	<rect class="enc__hit" x={part.tile.x} y={part.tile.y} width={part.tile.w} height={part.tile.h} />
</g>

<style>
	.enc {
		cursor: ns-resize;
		outline: none;
		touch-action: none;
		-webkit-tap-highlight-color: transparent;
	}

	.enc__hit {
		fill: transparent;
	}

	.enc__knob,
	.enc__knurl {
		transform-box: fill-box;
		transform-origin: center;
	}

	.enc__knob {
		transition: transform var(--rx-release, 140ms) var(--rx-ease-release, ease-out);
	}

	.enc__knurl {
		transition: transform 90ms ease-out;
	}

	.enc[data-pushed] .enc__knob {
		transform: scale(0.965);
		transition-duration: var(--rx-press, 50ms);
	}

	.enc__arrow {
		fill: none;
		stroke: var(--rx-ring, #f7f5f5);
		stroke-width: 0.42;
		stroke-linecap: round;
		stroke-linejoin: round;
		pointer-events: none;
	}

	.enc__arrow--flash {
		animation: enc-flash 900ms ease-out forwards;
	}

	.enc__ring {
		fill: none;
		stroke: var(--rx-ring, #f7f5f5);
		stroke-width: 0.32;
		opacity: 0;
		pointer-events: none;
		transition: opacity 160ms ease-out;
	}

	.enc:focus-visible .enc__ring {
		opacity: 1;
		stroke: var(--rx-focus, #f7f5f5);
	}

	.enc[data-hl] .enc__ring {
		opacity: 1;
	}

	.enc[data-hl='candidate'] .enc__ring {
		opacity: 0.45;
		stroke-dasharray: 0.9 0.7;
	}

	.enc[data-hl='press'] .enc__ring {
		animation: enc-pulse 0.9s ease-in-out infinite;
	}

	/* full while detents keep coming (each restarts it), then a slow fade */
	@keyframes enc-flash {
		0%,
		45% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	@keyframes enc-pulse {
		50% {
			opacity: 0.35;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.enc__knob,
		.enc__knurl {
			transition: none;
		}

		.enc__arrow--flash,
		.enc[data-hl='press'] .enc__ring {
			animation: none;
		}
	}
</style>
