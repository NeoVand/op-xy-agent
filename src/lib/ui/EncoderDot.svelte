<!--
@component
The screen's encoder dot: a small disc in the colour of the encoder that edits a value
(1 dark grey, 2 mid grey, 3 light grey, 4 white). It is how the device links on-screen values to
physical knobs, so use it wherever a value maps to an encoder.
-->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { EncoderNumber } from './types';

	interface Props extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
		/** Which encoder (1 dark grey, 2 mid grey, 3 light grey, 4 white). */
		encoder: EncoderNumber;
		/** Diameter; any CSS length. */
		size?: string;
		/** Announce the encoder name instead of hiding the dot. */
		labelled?: boolean;
	}

	let { encoder, size = '0.625rem', labelled = false, class: className, ...rest }: Props = $props();

	/** The official encoder names, in order. */
	const names = ['dark grey', 'mid grey', 'light grey', 'white'] as const;
	const label = $derived(`${names[encoder - 1]} encoder`);
</script>

<span
	class={['dot', className]}
	data-encoder={encoder}
	style:--dot-size={size}
	role={labelled ? 'img' : undefined}
	aria-label={labelled ? label : undefined}
	aria-hidden={labelled ? undefined : 'true'}
	{...rest}
></span>

<style>
	.dot {
		display: inline-block;
		flex: none;
		width: var(--dot-size);
		height: var(--dot-size);
		border-radius: 50%;
		/* A neutral ring keeps the dark dot visible on black and the white dot visible on paper. */
		box-shadow: 0 0 0 1px rgb(128 128 134 / 0.55);
		vertical-align: middle;
	}

	.dot[data-encoder='1'] {
		background-color: var(--xy-mat-enc-1);
	}

	.dot[data-encoder='2'] {
		background-color: var(--xy-mat-enc-2);
	}

	.dot[data-encoder='3'] {
		background-color: var(--xy-mat-enc-3);
	}

	.dot[data-encoder='4'] {
		background-color: var(--xy-mat-enc-4);
	}
</style>
