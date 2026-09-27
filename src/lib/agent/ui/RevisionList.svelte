<!--
@component
Every change the agent sent to the OP-XY in this conversation, newest first, with undo where the
previous state is known. An undone change says so; an undo is itself a change and can be undone.
-->
<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import Led from '$lib/ui/Led.svelte';
	import type { Revision } from '../types';

	interface Props {
		revisions: readonly Revision[];
		/** Why a revision cannot be undone, or null when it can. */
		blocker: (rev: number) => string | null;
		onundo: (rev: number) => void;
		/** The revision whose undo is being sent. */
		undoing?: number | null;
	}

	let { revisions, blocker, onundo, undoing = null }: Props = $props();

	const newestFirst = $derived([...revisions].reverse());
	const uid = $props.id();

	function time(at: number): string {
		return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<details class="revs">
	<summary class="revs__summary" id="{uid}-title">
		changes sent <span class="revs__count">{revisions.length}</span>
	</summary>
	<ol class="revs__list" aria-labelledby="{uid}-title">
		{#each newestFirst as revision (revision.rev)}
			{@const why = blocker(revision.rev)}
			<li class={['revs__item', revision.undoneBy !== null && 'revs__item--undone']}>
				<Led state={revision.undoneBy !== null ? 'off' : 'dim'} size="sm" />
				<span class="revs__text">
					<span class="revs__label">
						{revision.undoes !== null ? 'undo: ' : ''}{revision.label}
					</span>
					<span class="revs__meta">
						<span>{time(revision.at)}</span>
						{#if revision.undoneBy !== null}<span>undone</span>{/if}
						{#if revision.inverse?.assumed}<span>undo assumes the earlier state</span>{/if}
					</span>
				</span>
				{#if revision.undoneBy === null}
					<Button
						size="sm"
						variant="ghost"
						busy={undoing === revision.rev}
						aria-disabled={why !== null || undoing !== null}
						title={why ?? revision.inverse?.label ?? undefined}
						onclick={() => onundo(revision.rev)}
					>
						undo
					</Button>
				{/if}
			</li>
		{/each}
	</ol>
</details>

<style>
	.revs__summary {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.25rem;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		cursor: pointer;
	}

	.revs__summary:hover {
		color: var(--xy-fg);
	}

	.revs__count {
		color: var(--xy-fg-subtle);
		font-variant-numeric: tabular-nums;
	}

	.revs__list {
		margin: 0.25rem 0 0;
		padding: 0;
		max-height: 11rem;
		overflow-y: auto;
		list-style: none;
	}

	.revs__item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.25rem;
		border-top: 1px solid var(--xy-line);
	}

	.revs__text {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}

	.revs__label {
		color: var(--xy-fg);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.revs__item--undone .revs__label {
		color: var(--xy-fg-subtle);
		text-decoration: line-through;
		text-decoration-color: var(--xy-fg-faint);
	}

	.revs__meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.625rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-variant-numeric: tabular-nums;
	}
</style>
