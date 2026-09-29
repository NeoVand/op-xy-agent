<!--
@component
A key combo in the manual's key grammar (`core/opxy` keys.ts), or a knob named on its own (`E1`),
drawn as the OP-XY's own keys
(`glyphs/art.ts`): `shift + M1` is the shift key, a plus and the key printed 1 under the screen;
`turn E2` the mid-grey knob with arrows; `Tn` a track key marked n. Gesture words (hold, turn,
click) stay words, `+` and `→` join the keys, `…` spans a range and `/` separates alternatives.
Each key tells its name on hover (the manual's name: "M3", "T5 · track 5"); screen readers hear the
combo as the manual writes it ("record + play, then play").
`onpoint` hears which controls the pointer is over — one key's, or all of them over the rest of
the combo — so a page can ring them on its replica. A combo that does not parse shows as code.

```svelte
<KeyCombo keys="shift + M1" onpoint={replicaPointer(replica)} />
```
-->
<script lang="ts">
	import type { ClassValue } from 'svelte/elements';
	import type { ControlId } from '$lib/core/opxy';
	import { tooltip } from '$lib/ui/tooltip';
	import ControlGlyph from './ControlGlyph.svelte';
	import { comboPieces, parseCombo } from './art';

	interface Props {
		/** A combo in the key grammar, e.g. `shift + M1`, `step n + turn E1…E4`. */
		keys: string;
		/** `md` in running text, `sm` in dense rows (tables, cards). */
		size?: 'sm' | 'md';
		/** The controls under the pointer (null when it leaves): one key's, or the whole combo's. */
		onpoint?: (ids: readonly ControlId[] | null) => void;
		class?: ClassValue;
	}

	let { keys, size = 'md', onpoint, class: className }: Props = $props();

	const parsed = $derived(parseCombo(keys));
	const pieces = $derived(parsed ? comboPieces(parsed.sequence, parsed.mention) : []);
	const all = $derived([
		...new Set(pieces.flatMap((piece) => (piece.kind === 'glyph' ? piece.ids : [])))
	]);
	/** The combo as the manual writes it, with its arrows said. */
	const spoken = $derived(
		keys
			.replace(/\s*(?:→|->)\s*\+\s*/g, ', then, still holding, ')
			.replace(/\s*(?:→|->)\s*/g, ', then ')
	);

	let pointed: readonly ControlId[] | null = null;

	function point(ids: readonly ControlId[] | null) {
		if (ids === pointed) return;
		pointed = ids;
		onpoint?.(ids);
	}

	function over(event: PointerEvent) {
		if (!onpoint) return;
		const glyph = (event.target as Element | null)?.closest?.('[data-piece]');
		const piece = glyph ? pieces[Number(glyph.getAttribute('data-piece'))] : undefined;
		point(piece?.kind === 'glyph' ? piece.ids : all);
	}
</script>

{#if parsed}
	<span
		class={['combo', `combo--${size}`, className]}
		role="img"
		aria-label={spoken}
		onpointerover={over}
		onpointerleave={() => point(null)}
	>
		{#each pieces as piece, i (i)}
			{#if piece.kind === 'glyph'}
				<span
					class="combo__key"
					data-piece={i}
					aria-hidden="true"
					{@attach tooltip(piece.name, { describe: false, delay: 250 })}
				>
					{#if piece.art}
						<ControlGlyph
							art={piece.art}
							name={piece.name}
							stacked={piece.stacked}
							turn={piece.turn}
						/>
					{:else}
						<span class="combo__text">{piece.name}</span>
					{/if}
				</span>
			{:else if piece.kind === 'join'}
				<span class="combo__join" aria-hidden="true">{piece.op}</span>
			{:else if piece.kind === 'word'}
				<span class="combo__word" aria-hidden="true">{piece.text}</span>
			{:else}
				<span class="combo__sep" aria-hidden="true">{piece.text}</span>
			{/if}
		{/each}
	</span>
{:else}
	<code class={className}>{keys}</code>
{/if}

<style>
	.combo {
		--glyph-size: 1.7em;
		display: inline-flex;
		align-items: center;
		gap: 0.22em;
		/* the keys stand a little taller than the line: they do not push the lines apart */
		margin-block: -0.3em;
		font-family: var(--xy-font-sans);
		line-height: 1;
		vertical-align: middle;
		white-space: nowrap;
	}

	.combo--sm {
		--glyph-size: 1.55em;
		gap: 0.2em;
	}

	.combo__key {
		display: inline-flex;
		border-radius: 0.2em;
	}

	.combo__text {
		padding: 0.2em 0.45em;
		border-radius: 0.3em;
		background-color: var(--xy-key-cap, #212225);
		color: var(--xy-key-legend, #f2f1ee);
		font-size: 0.8em;
	}

	.combo__join,
	.combo__sep,
	.combo__word {
		color: var(--xy-fg-subtle);
		font-size: 0.85em;
	}

	.combo__word {
		font-weight: 450;
	}
</style>
