<!--
@component
An LED window, the device's only status light. States follow the hardware: `off`, `dim`, `white`,
`red`, optionally blinking with a hard on/off square wave (device-accurate) or breathing smoothly
(`breathe`, for app activity rather than device state). LEDs snap on and decay off.

Colour is never the only cue: pair an LED with text, or give it a `label`.
-->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { LedState } from './types';

	interface Props extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
		/** What the LED shows. */
		state?: LedState;
		/** Blink the lit state: `slow` (1 s) or `fast` (0.5 s) square waves, or `breathe` (soft pulse). */
		blink?: false | 'slow' | 'fast' | 'breathe';
		/** Window size: `sm` 6 px, `md` 7 px (true to tile scale), `lg` 10 px. */
		size?: 'sm' | 'md' | 'lg';
		/** Accessible name; without it the LED is decorative. */
		label?: string;
	}

	let {
		state = 'off',
		blink = false,
		size = 'md',
		label,
		class: className,
		...rest
	}: Props = $props();
</script>

<span
	class={['led', `led--${size}`, className]}
	data-state={state}
	data-blink={blink || undefined}
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	{...rest}
></span>

<style>
	.led {
		--size: var(--xy-led-size);
		display: inline-block;
		flex: none;
		width: var(--size);
		height: var(--size);
		border-radius: 50%;
		background-color: var(--xy-led-off);
		box-shadow: inset 0 0.5px 1px var(--xy-led-ring);
		/* The off state owns the slow decay; lit states override with an instant attack. */
		transition:
			background-color var(--xy-dur-led-off) var(--xy-ease-decay),
			box-shadow var(--xy-dur-led-off) var(--xy-ease-decay);
	}

	.led--sm {
		--size: 0.375rem;
	}

	.led--lg {
		--size: 0.625rem;
	}

	.led[data-state='dim'] {
		background-color: var(--xy-led-dim);
	}

	.led[data-state='white'] {
		background-color: var(--xy-led-white);
		box-shadow: var(--xy-glow-white);
		transition-duration: var(--xy-dur-led-on);
	}

	.led[data-state='red'] {
		background-color: var(--xy-led-red);
		box-shadow: var(--xy-glow-red);
		transition-duration: var(--xy-dur-led-on);
	}

	.led[data-blink='slow'] {
		animation: led-blink 1s steps(1, end) infinite;
	}

	.led[data-blink='fast'] {
		animation: led-blink 0.5s steps(1, end) infinite;
	}

	/* A soft glow in and out: for "working" indicators, where a hard blink reads as nervous. */
	.led[data-blink='breathe'] {
		animation: led-breathe 1.6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
	}

	@keyframes led-breathe {
		0%,
		100% {
			opacity: 0.35;
		}
		50% {
			opacity: 1;
		}
	}

	@keyframes led-blink {
		50% {
			background-color: var(--xy-led-off);
			box-shadow: inset 0 0.5px 1px var(--xy-led-ring);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.led[data-blink] {
			animation: none;
		}
	}
</style>
