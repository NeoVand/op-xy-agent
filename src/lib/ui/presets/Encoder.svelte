<!--
@component
One of the preset maker's four encoders, drawn as the OP-XY's: a black knob in its dish with a
coloured cap (dark grey, mid grey, light grey, white, as encoders 1–4) and a line that turns with
the value. Drag up or down (shift for fine), scroll, or use the arrow keys; double-click puts it
back. Its label and value sit under it, as the screen's header shows them; `field` names the
patch.json field it writes (in the tooltip).
-->
<script lang="ts">
	import { tooltip } from '$lib/ui';

	interface Props {
		/** 1 dark grey … 4 white. */
		encoder: 1 | 2 | 3 | 4;
		label: string;
		value: number;
		min: number;
		max: number;
		/** The smallest change (arrow keys, a slow drag). */
		step?: number;
		/** What the value reads as ("−6 db", "c4"). */
		display?: string;
		/** The patch.json field it writes, for the tooltip. */
		field?: string;
		/** Double-click goes back to this. */
		reset?: number;
		disabled?: boolean;
		onchange: (value: number) => void;
	}

	let {
		encoder,
		label,
		value,
		min,
		max,
		step = 1,
		display,
		field,
		reset,
		disabled = false,
		onchange
	}: Props = $props();

	/** How far the line turns: from seven to five o'clock, like a pot. */
	const SWEEP = 270;
	const share = $derived(max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0);
	const angle = $derived(-SWEEP / 2 + share * SWEEP);
	const text = $derived(display ?? String(Math.round(value * 100) / 100));

	let dragging = $state(false);
	let origin = 0;
	let start = 0;

	function set(v: number) {
		const snapped = Math.round(v / step) * step;
		const next = Math.min(max, Math.max(min, Number(snapped.toFixed(6))));
		if (next !== value) onchange(next);
	}

	function onpointerdown(event: PointerEvent) {
		if (disabled || event.button !== 0) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		(event.currentTarget as HTMLElement).focus();
		dragging = true;
		origin = event.clientY;
		start = value;
	}

	function onpointermove(event: PointerEvent) {
		if (!dragging) return;
		// 200 px of travel turns the whole range; shift turns it ten times finer
		const span = (max - min) * (event.shiftKey ? 0.1 : 1);
		set(start + ((origin - event.clientY) / 200) * span);
	}

	function onpointerup(event: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	}

	function onwheel(event: WheelEvent) {
		if (disabled) return;
		event.preventDefault();
		const ticks =
			Math.sign(-event.deltaY) *
			(event.shiftKey ? 1 : Math.max(1, Math.round((max - min) / step / 100)));
		set(value + ticks * step);
	}

	function onkeydown(event: KeyboardEvent) {
		if (disabled) return;
		const big = Math.max(step, (max - min) / 10);
		const moves: Record<string, number> = {
			ArrowUp: step,
			ArrowRight: step,
			ArrowDown: -step,
			ArrowLeft: -step,
			PageUp: big,
			PageDown: -big
		};
		if (event.key in moves) {
			event.preventDefault();
			// keep the arrows off the page's keyboard (they are not notes here)
			event.stopPropagation();
			set(value + moves[event.key] * (event.shiftKey ? 10 : 1));
		} else if (event.key === 'Home') {
			event.preventDefault();
			set(min);
		} else if (event.key === 'End') {
			event.preventDefault();
			set(max);
		}
	}
</script>

<div
	class={['encoder', disabled && 'is-disabled', dragging && 'is-turning']}
	data-encoder={encoder}
>
	<div
		class="encoder__knob"
		role="slider"
		tabindex={disabled ? -1 : 0}
		aria-label={label}
		aria-valuemin={min}
		aria-valuemax={max}
		aria-valuenow={value}
		aria-valuetext={text}
		aria-disabled={disabled || undefined}
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		onpointercancel={onpointerup}
		{onwheel}
		{onkeydown}
		ondblclick={() => reset !== undefined && !disabled && set(reset)}
		{@attach tooltip(field ? `${label}: ${field}` : label, { describe: false })}
	>
		<svg viewBox="-20 -20 40 40" aria-hidden="true">
			<circle class="encoder__dish" r="19.5" />
			<circle class="encoder__body" r="16" />
			<circle class="encoder__cap" r="11.5" />
			<circle class="encoder__sheen" r="11.5" />
			<g style:transform="rotate({angle}deg)" class="encoder__turn">
				<line class="encoder__mark" x1="0" y1="-6" x2="0" y2="-11" />
			</g>
		</svg>
	</div>
	<span class="encoder__label">{label}</span>
	<span class="encoder__value">{disabled ? '—' : text}</span>
</div>

<style>
	.encoder {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.125rem;
		min-width: 0;
		user-select: none;
		-webkit-user-select: none;
	}

	.encoder__knob {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 50%;
		cursor: ns-resize;
		touch-action: none;
		outline: none;
	}

	.encoder__knob:focus-visible {
		box-shadow: 0 0 0 1.5px var(--xy-focus);
	}

	.encoder svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.encoder__dish {
		fill: #121315;
		stroke: rgb(255 255 255 / 0.06);
		stroke-width: 0.6;
	}

	.encoder__body {
		fill: #070708;
		filter: drop-shadow(0 1.2px 1.2px rgb(0 0 0 / 0.7));
	}

	.encoder__cap {
		fill: var(--cap);
		transition: fill var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.encoder__sheen {
		fill: url(#none);
		fill: rgb(255 255 255 / 0.06);
		stroke: rgb(255 255 255 / 0.18);
		stroke-width: 0.5;
		mix-blend-mode: soft-light;
	}

	.encoder__turn {
		transition: transform 90ms var(--xy-ease-standard);
	}

	.encoder.is-turning .encoder__turn {
		transition: none;
	}

	.encoder__mark {
		stroke: var(--mark);
		stroke-width: 1.6;
		stroke-linecap: round;
	}

	[data-encoder='1'] {
		--cap: var(--xy-mat-enc-1);
		--mark: #f2f1ee;
	}

	[data-encoder='2'] {
		--cap: var(--xy-mat-enc-2);
		--mark: #f7f6f3;
	}

	[data-encoder='3'] {
		--cap: var(--xy-mat-enc-3);
		--mark: #1d1f22;
	}

	[data-encoder='4'] {
		--cap: var(--xy-mat-enc-4);
		--mark: #1d1f22;
	}

	.encoder__label {
		margin-top: 0.125rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: 1;
		letter-spacing: var(--xy-tracking-label);
		white-space: nowrap;
	}

	.encoder__value {
		color: var(--xy-fg);
		font-size: var(--xy-text-xs);
		line-height: 1.25;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.is-disabled .encoder__knob {
		cursor: default;
		opacity: 0.45;
	}

	.is-disabled .encoder__value {
		color: var(--xy-fg-faint);
	}
</style>
