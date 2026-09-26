<!--
@component
A key combo drawn as little OP-XY keys, the way TE's guide draws them: `shift + M1` becomes two
keycaps joined by a plus. Accepts the notation of `parseCombo` (`+` hold-and-press, `→` then,
leading verbs like `hold` or `turn`). Sizes follow the surrounding text, so it sits inline in prose.
-->
<script lang="ts">
	import type { ClassValue } from 'svelte/elements';
	import EncoderDot from './EncoderDot.svelte';
	import Icon from './Icon.svelte';
	import { parseCombo } from './kbd';

	interface Props {
		/** Combo notation, e.g. `shift + M1` or `hold record + play`. */
		combo: string;
		/** `sm` for dense UI, `md` inline with text. */
		size?: 'sm' | 'md';
		class?: ClassValue;
	}

	let { combo, size = 'md', class: className }: Props = $props();

	const parts = $derived(parseCombo(combo));
</script>

<kbd class={['combo', `combo--${size}`, className]}>
	{#each parts as part (part.id)}
		{#if part.kind === 'word'}
			<span class="combo__word">{part.text}</span>
		{:else if part.kind === 'join'}
			{#if part.op === '+'}
				<span class="combo__join">+</span>
			{:else}
				<span class="combo__join" aria-hidden="true">→</span><span class="sr-only">then</span>
			{/if}
		{:else if part.encoder}
			<kbd class="combo__knob" title={part.legend}>
				<EncoderDot encoder={part.encoder} size="0.5em" />
				<span class="sr-only">{part.legend}</span>
			</kbd>
		{:else}
			<kbd class="combo__key">
				<span class="combo__cap">
					{#if part.glyph}
						<Icon
							name={part.glyph}
							size="1.5em"
							weight={2}
							class={part.glyph === 'record' ? 'combo__glyph--record' : undefined}
						/>
						<span class="sr-only">{part.legend}</span>
					{:else}
						{part.legend}
					{/if}
				</span>
			</kbd>
		{/if}
	{/each}
</kbd>

<style>
	.combo {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		font-family: var(--xy-font-sans);
		font-size: inherit;
		line-height: 1;
		vertical-align: middle;
		white-space: nowrap;
	}

	.combo--sm {
		font-size: 0.875em;
	}

	.combo__key {
		display: inline-flex;
		align-items: stretch;
		height: 1.7em;
		padding: 0.18em;
		border-radius: 0.24em;
		background-color: var(--xy-key-tile);
		box-shadow: var(--xy-shadow-tile);
		font: inherit;
	}

	.combo__cap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.34em;
		padding: 0.06em 0.5em 0;
		border-radius: var(--xy-radius-cap);
		background-color: var(--xy-key-cap);
		box-shadow: var(--xy-shadow-cap);
		color: var(--xy-key-legend);
		font-size: 0.72em;
		font-weight: 450;
		letter-spacing: 0.01em;
	}

	.combo__cap:has(:global(svg)) {
		padding: 0 0.2em;
	}

	.combo__cap :global(.combo__glyph--record) {
		color: var(--xy-red);
	}

	.combo__knob {
		display: inline-grid;
		place-items: center;
		width: 1.7em;
		height: 1.7em;
		border-radius: 50%;
		background: radial-gradient(circle, #1a1a1f 0 0.42em, var(--xy-key-cap) 0.44em);
		box-shadow: var(--xy-shadow-cap);
		font: inherit;
	}

	.combo__join,
	.combo__word {
		color: var(--xy-fg-subtle);
		font-size: 0.85em;
	}

	.combo__word {
		font-weight: 450;
	}
</style>
