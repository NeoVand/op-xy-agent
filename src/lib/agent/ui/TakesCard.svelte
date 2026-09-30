<!--
@component
The takes a lab run offered (`lab.offer`): a key each, which puts that take on the replica to hear
it with the loop (the one on before goes back first; the same key again puts none on), and keep,
which leaves it on. Once one is kept: which, and a key to ask for more like it. The takes can be
heard only in the page session that made them; after a reload the card says what was offered.

```svelte
<TakesCard display={entry.display} on={1} onhear={(take) => hear(take)} onkeep={keep} />
```
-->
<script lang="ts">
	import type { TakesDisplay } from '../types';

	interface Props {
		display: TakesDisplay;
		/** The take on the replica now, or null. */
		on?: number | null;
		/** Puts a take on the replica (or none); false when the takes can no longer be heard. */
		onhear?: (take: number | null) => boolean;
		/** The take on stays; false when none is on. */
		onkeep?: () => boolean;
		/** Asks the agent something (more like the kept take). */
		onreply?: (text: string) => void;
		/** The agent is still at work: the takes wait until its answer is written. */
		busy?: boolean;
	}

	let { display, on = null, onhear, onkeep, onreply, busy = false }: Props = $props();

	/** The takes cannot be heard any more (another page session made them). */
	let gone = $state(false);
	const letter = (i: number) => String.fromCharCode(65 + i);
	const kept = $derived(display.kept === undefined ? null : display.kept);
	const shown = $derived(on === null ? null : display.takes[on]);

	function hear(index: number): void {
		const next = on === index ? null : index;
		if (onhear && !onhear(next)) gone = true;
	}
</script>

<div class="takes" data-theme="dark" role="group" aria-label="takes to hear">
	{#if kept !== null}
		<p class="takes__line">
			<span class="takes__kept">kept {letter(kept)}</span>
			<span class="takes__label">{display.takes[kept]?.label}</span>
			{#if onreply}
				<button
					type="button"
					class="takes__more"
					onclick={() =>
						onreply(`more like take ${letter(kept)} (${display.takes[kept]?.label ?? ''})`)}
					>more like this</button
				>
			{/if}
		</p>
	{:else}
		<p class="takes__line">
			<span class="takes__count">{display.takes.length} takes</span>
			<span class="takes__hint">
				{#if gone || !onhear}
					offered in an earlier visit: ask again to hear them
				{:else if busy}
					to hear once the answer is written
				{:else if on === null}
					tap one to hear it with the loop
				{:else}
					take {letter(on)} is on the replica
				{/if}
			</span>
		</p>
		<div class="takes__keys">
			{#each display.takes as take, i (i)}
				<button
					type="button"
					class="take"
					aria-pressed={on === i}
					disabled={gone || !onhear || busy}
					onclick={() => hear(i)}
				>
					<span class="take__letter">{letter(i)}</span>
					<span class="take__label">{take.label}</span>
				</button>
			{/each}
			{#if onkeep && !gone}
				<button
					type="button"
					class="takes__keep"
					disabled={on === null || busy}
					onclick={() => onkeep()}>keep</button
				>
			{/if}
		</div>
		{#if shown}
			<ul class="takes__changes" aria-label="what take {letter(on ?? 0)} changes">
				{#each shown.changes.slice(0, 3) as change, i (i)}
					<li>{change}</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<style>
	.takes {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem 0.625rem 0.625rem;
		border-radius: var(--xy-radius-card);
		background-color: var(--xy-scr-bg, #000000);
		box-shadow: 0 0 0 1px rgb(255 255 255 / 0.06);
		color: var(--xy-ramp-5);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}

	.takes__line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.5rem;
		margin: 0;
	}

	.takes__count,
	.takes__kept {
		color: var(--xy-ramp-7);
	}

	.takes__label {
		color: var(--xy-ramp-6);
	}

	.takes__keys {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	/* a take: a small key with its letter, lit while it is on the replica */
	.take {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		max-width: 100%;
		padding: 0.25rem 0.5rem 0.25rem 0.375rem;
		border: 1px solid var(--xy-ramp-2);
		border-radius: var(--xy-radius-tile);
		color: var(--xy-ramp-6);
		cursor: pointer;
		transition:
			border-color var(--xy-dur-quick) var(--xy-ease-standard),
			color var(--xy-dur-quick) var(--xy-ease-standard),
			background-color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.take:hover:not(:disabled) {
		border-color: var(--xy-ramp-4);
		color: var(--xy-ramp-7);
	}

	.take[aria-pressed='true'] {
		border-color: var(--xy-ramp-6);
		background-color: var(--xy-ramp-1);
		color: var(--xy-ramp-7);
	}

	.take:disabled {
		cursor: default;
		opacity: 0.6;
	}

	.take__letter {
		display: inline-grid;
		place-items: center;
		width: 1rem;
		height: 1rem;
		border-radius: 0.1875rem;
		background-color: var(--xy-ramp-2);
		color: var(--xy-ramp-7);
		font-size: var(--xy-text-2xs);
		line-height: 1;
	}

	.take[aria-pressed='true'] .take__letter {
		background-color: var(--xy-ramp-7);
		color: var(--xy-ramp-0);
	}

	.take__label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.takes__keep,
	.takes__more {
		padding: 0.25rem 0.625rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-ramp-7);
		color: var(--xy-ramp-0);
		cursor: pointer;
	}

	.takes__more {
		margin-left: auto;
		background-color: transparent;
		border: 1px solid var(--xy-ramp-3);
		color: var(--xy-ramp-7);
	}

	.takes__keep:disabled {
		background-color: var(--xy-ramp-2);
		color: var(--xy-ramp-5);
		cursor: default;
	}

	.takes__changes {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		margin: 0;
		padding: 0 0 0 1rem;
		color: var(--xy-ramp-5);
		font-family: var(--xy-font-mono);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
	}
</style>
