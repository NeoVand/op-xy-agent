<!--
@component
A value in the device's screen language.
- `screen`: black glass, a small label with its encoder dot, a large light numeral.
- `cell`: one label/value pair of the engine header bar. Four cells (encoders 1 to 4) in a row make
  the full 8-tone header, dark to light. Place cells on a screen surface (black), as on the device:
  the first cell is black and the last is paper, so on a page they would lose their edges.
Numerals are tabular so changing values don't jitter.
-->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import EncoderDot from './EncoderDot.svelte';
	import type { EncoderNumber } from './types';

	interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		/** What the value is (lowercase): "tempo", "cutoff". */
		label: string;
		/** Pre-formatted value. */
		value: string | number;
		/** Unit after the value: "bpm", "%". */
		unit?: string;
		/** The encoder that edits it; shows its dot (screen) or picks its ramp pair (cell). */
		encoder?: EncoderNumber;
		variant?: 'screen' | 'cell';
		/** Numeral size for the screen variant: 36, 48 or 72 px. */
		size?: 'sm' | 'md' | 'lg';
		/** Announce value changes politely (use for values that change rarely). */
		live?: boolean;
	}

	let {
		label,
		value,
		unit,
		encoder,
		variant = 'screen',
		size = 'md',
		live = false,
		class: className,
		...rest
	}: Props = $props();

	const uid = $props.id();
	const labelId = `${uid}-label`;
</script>

{#snippet reading()}
	<span class="value">{value}</span>
	{#if unit}<span class="unit">{unit}</span>{/if}
{/snippet}

<div
	class={['readout', `readout--${variant}`, `readout--${size}`, className]}
	data-encoder={encoder ?? 1}
	role="group"
	aria-labelledby={labelId}
	{...rest}
>
	<span class="label" id={labelId}>
		{#if encoder && variant === 'screen'}
			<EncoderDot {encoder} size="0.5625rem" />
		{/if}
		{label}
	</span>
	{#if live}
		<output class="reading" aria-live="polite">{@render reading()}</output>
	{:else}
		<span class="reading">{@render reading()}</span>
	{/if}
</div>

<style>
	.readout {
		font-variant-numeric: tabular-nums;
	}

	.label {
		display: inline-flex;
		align-items: center;
		gap: 0.4375rem;
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}

	.reading {
		display: flex;
		align-items: baseline;
		gap: 0.3em;
	}

	.value {
		font-weight: var(--xy-weight-thin);
		letter-spacing: -0.02em;
	}

	.unit {
		font-size: var(--xy-text-sm);
		font-weight: var(--xy-weight-regular);
	}

	/* ---------- screen */
	.readout--screen {
		position: relative;
		display: inline-flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.5rem;
		min-width: 9rem;
		padding: 0.75rem 1rem 0.625rem;
		border-radius: var(--xy-radius-screen);
		background-color: var(--xy-scr-bg);
		color: var(--xy-scr-fg);
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 0.07),
			0 0 0 3px var(--xy-mat-glass);
	}

	.readout--screen .label,
	.readout--screen .unit {
		color: var(--xy-scr-muted);
	}

	.readout--sm .value {
		font-size: var(--xy-text-2xl);
		line-height: var(--xy-leading-2xl);
	}

	.readout--md .value {
		font-size: var(--xy-text-3xl);
		line-height: var(--xy-leading-3xl);
	}

	.readout--lg .value {
		font-size: var(--xy-text-4xl);
		line-height: var(--xy-leading-4xl);
	}

	/* ---------- cell: [label | value] on the ramp pair of its encoder */
	.readout--cell {
		--label-bg: var(--xy-black);
		--value-bg: var(--xy-ramp-1);
		--label-fg: var(--xy-paper);
		--value-fg: var(--xy-paper);
		display: inline-grid;
		grid-template-columns: 1fr 1fr;
		min-width: 9rem;
		height: 2.5rem;
	}

	.readout--cell .label {
		align-items: flex-start;
		padding: 0.25rem 0.5rem;
		background-color: var(--label-bg);
		color: var(--label-fg);
	}

	.readout--cell .reading {
		align-items: flex-end;
		padding: 0 0.5rem 0.0625rem;
		background-color: var(--value-bg);
		color: var(--value-fg);
		overflow: hidden;
	}

	.readout--cell .value {
		font-size: var(--xy-text-2xl);
		line-height: 1;
		font-weight: var(--xy-weight-light);
	}

	.readout--cell .unit {
		font-size: var(--xy-text-2xs);
		margin-bottom: 0.25rem;
	}

	/* Ramp pairs from the device's engine header. Text flips to ink where paper would fall below
	 * 4.5:1 (small labels) or 3:1 (large numerals). */
	.readout--cell[data-encoder='2'] {
		--label-bg: var(--xy-ramp-2);
		--value-bg: var(--xy-ramp-3);
	}

	.readout--cell[data-encoder='3'] {
		--label-bg: var(--xy-ramp-4);
		--value-bg: var(--xy-ramp-5);
		--label-fg: var(--xy-ink);
		--value-fg: var(--xy-ink);
	}

	.readout--cell[data-encoder='4'] {
		--label-bg: var(--xy-ramp-6);
		--value-bg: var(--xy-ramp-7);
		--label-fg: var(--xy-ink);
		--value-fg: var(--xy-ink);
	}
</style>
