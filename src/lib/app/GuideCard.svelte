<!--
@component
The walkthrough's card under the replica: which step of how many, the keys to press (keycaps; a
turn says which way and how many detents) and what the screen will show once it is done. It moves
on by itself when the replica's screen gets there; skip passes a step, the close key ends it. A
tiny black screen in both themes, like the stage hint; nothing shows while no walkthrough runs.

```svelte
<GuideCard guide={getReplicaGuide()} />
```
-->
<script lang="ts">
	import { formatKeys, targetIds, tryParseKeys } from '$lib/core/opxy';
	import Icon from '$lib/ui/Icon.svelte';
	import KeyCombo from '$lib/replica/glyphs/KeyCombo.svelte';
	import { COMPUTER_KEYS } from '$lib/replica/keyboard';
	import type { ReplicaGuide } from './guide.svelte';

	interface Props {
		guide: ReplicaGuide | null;
	}

	let { guide }: Props = $props();

	const step = $derived(guide?.current ?? null);
	// a turn to a value: which way from where it reads now, so an overshoot says to come back
	const live = $derived(guide?.turn ?? null);
	const turn = $derived(
		live
			? `${live.label} ${live.now} → ${live.target}: turn ${live.way}`
			: step?.clicks
				? `${Math.abs(step.clicks)} ${Math.abs(step.clicks) === 1 ? 'detent' : 'detents'} ${step.clicks > 0 ? 'clockwise' : 'counter-clockwise'}`
				: null
	);
	/**
	 * How to hold the keys a step holds, with one mouse: ⌥-click latches a key down until it is
	 * clicked again; a key the computer plays (G3 is X) or shift (the computer's Shift) can be
	 * held there instead.
	 */
	const hold = $derived.by(() => {
		const parsed = step ? tryParseKeys(step.keys) : null;
		const chord = parsed?.ok ? parsed.value.chords[0] : null;
		if (!chord || chord.terms.length < 2) return null;
		const ways = chord.terms.slice(0, -1).map((term) => {
			const id = targetIds(term.target)[0];
			const name = formatKeys({ chords: [{ keepHeld: false, terms: [term] }] });
			const computer =
				id === 'key.shift'
					? 'Shift'
					: COMPUTER_KEYS[id as keyof typeof COMPUTER_KEYS]?.split(' ')[0];
			return computer ? `${name} (or hold ${computer})` : name;
		});
		return `⌥-click to hold ${ways.join(', ')}`;
	});
</script>

<div class="guide" role="status" aria-live="polite" aria-atomic="true">
	{#if guide && guide.status === 'running' && step}
		{#key guide.index}
			<div
				class="card"
				data-theme="dark"
				data-turn-way={live?.way}
				data-turn-detents={live?.detents}
			>
				<span class="card__count">{guide.index + 1}/{guide.steps.length}</span>
				<KeyCombo keys={step.keys} size="sm" class="card__keys" />
				<p class="card__what">
					{#if turn}<span class="card__turn">{turn}</span>{/if}
					{#if hold}<span class="card__turn">{hold}</span>{/if}
					<span class="card__screen"><span aria-hidden="true">→ </span>{step.screen}</span>
				</p>
				<div class="card__actions">
					<button class="card__skip" type="button" onclick={() => guide.skip()}>skip</button>
					<button
						class="card__close"
						type="button"
						aria-label="end the walkthrough"
						onclick={() => guide.stop()}
					>
						<Icon name="close" size="1rem" />
					</button>
				</div>
			</div>
		{/key}
	{:else if guide && guide.status === 'done'}
		<div class="card card--done" data-theme="dark">
			<Icon name="check" size="1rem" />
			<p class="card__what">done: {guide.goal}</p>
		</div>
	{/if}
</div>

<style>
	.guide {
		display: flex;
		justify-content: center;
		min-height: 0;
	}

	.card {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr) auto;
		align-items: center;
		column-gap: 0.625rem;
		width: fit-content;
		max-width: 100%;
		padding: 0.375rem 0.375rem 0.375rem 0.625rem;
		border-radius: var(--xy-radius-card);
		background: var(--xy-scr-bg);
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 0.08),
			0 8px 24px -6px rgb(0 0 0 / 0.6);
		color: var(--xy-scr-fg);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		animation: card-in var(--xy-dur-quick) var(--xy-ease-standard) both;
	}

	.card--done {
		grid-template-columns: auto minmax(0, 1fr);
		padding-right: 0.75rem;
		color: var(--xy-scr-fg);
	}

	.card__count {
		color: var(--xy-scr-muted);
		font-size: var(--xy-text-xs);
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--xy-tracking-label);
	}

	.card :global(.card__keys) {
		font-size: 0.8125rem;
	}

	.card__what {
		display: flex;
		gap: 0.5rem;
		min-width: 0;
		margin: 0;
	}

	.card__turn {
		white-space: nowrap;
	}

	/* What the screen will show: one line, cut where the card ends. */
	.card__screen {
		overflow: hidden;
		color: var(--xy-scr-muted);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card__actions {
		display: flex;
		align-items: center;
		gap: 0.125rem;
	}

	.card__skip,
	.card__close {
		display: grid;
		place-items: center;
		height: 1.75rem;
		padding: 0 0.375rem;
		border: 0;
		border-radius: var(--xy-radius-tile);
		background: transparent;
		color: var(--xy-scr-muted);
		font: inherit;
		font-size: var(--xy-text-xs);
		letter-spacing: var(--xy-tracking-label);
		cursor: pointer;
		transition:
			color var(--xy-dur-quick) var(--xy-ease-standard),
			background-color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.card__close {
		width: 1.75rem;
		padding: 0;
	}

	.card__skip:hover,
	.card__skip:focus-visible,
	.card__close:hover,
	.card__close:focus-visible {
		color: var(--xy-scr-fg);
		background-color: rgb(255 255 255 / 0.08);
	}

	.card__skip:focus-visible,
	.card__close:focus-visible {
		outline: 2px solid var(--xy-scr-fg);
		outline-offset: 1px;
	}

	@keyframes card-in {
		from {
			opacity: 0;
			translate: 0 0.25rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.card {
			animation: none;
		}
	}
</style>
