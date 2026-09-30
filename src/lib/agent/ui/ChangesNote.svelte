<!--
@component
What a turn changed on the replica, once it ends: one quiet line with a count that opens into the
list the agent was given (docs/AGENT-V2.md, grounding), each change said briefly (only the values
that differ), so what the answer says and what happened can be compared at a glance. Beside it,
while this page session can: undo, which takes the turn back (what the user changed since stays),
and then put back. Pointing at it (`onpoint`) lights on the replica the keys that lead to each change.
-->
<script lang="ts">
	import Led from '$lib/ui/Led.svelte';
	import type { ReplicaChange } from '../virtual-opxy';

	interface Props {
		/** The agent's lines (shown when there are no `changes`, as in older threads). */
		lines: readonly string[];
		/** The same changes, briefly, with their keys. */
		changes?: readonly ReplicaChange[];
		/** `ready` offers undo, `undone` put back; absent offers neither. */
		undo?: 'ready' | 'undone';
		onundo?: () => void;
		/** The pointer or focus came onto the note (true) or left it (false). */
		onpoint?: (on: boolean) => void;
	}

	let { lines, changes, undo, onundo, onpoint }: Props = $props();

	/** Most changes the list names; the rest are counted, as the agent's lines are. */
	const SHOWN = 40;
	const shown = $derived.by(() => {
		if (!changes || changes.length === 0) return lines;
		const briefs = changes.slice(0, SHOWN).map((change) => change.brief);
		if (changes.length > SHOWN) briefs.push(`… and ${changes.length - SHOWN} more changes`);
		return briefs;
	});
	const count = $derived(changes && changes.length > 0 ? changes.length : lines.length);
</script>

<div
	class={['changes', undo === 'undone' && 'changes--undone']}
	role="group"
	aria-label="what the answer changed on the replica"
	onpointerenter={() => onpoint?.(true)}
	onpointerleave={() => onpoint?.(false)}
	onfocusin={() => onpoint?.(true)}
	onfocusout={() => onpoint?.(false)}
>
	<details class="changes__details">
		<summary class="changes__head">
			<Led state={undo === 'undone' ? 'off' : 'white'} size="sm" />
			<span>{undo === 'undone' ? 'taken back on the replica' : 'changed on the replica'}</span>
			<span class="changes__count">{count}</span>
		</summary>
		<ul class="changes__list">
			{#each shown as line, i (i)}
				<li>{line}</li>
			{/each}
		</ul>
	</details>
	{#if undo && onundo}
		<button type="button" class="changes__undo" onclick={onundo}>
			{undo === 'undone' ? 'put back' : 'undo'}
		</button>
	{/if}
</div>

<style>
	.changes {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.changes__details {
		min-width: 0;
	}

	.changes__head {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		list-style: none;
		border-radius: var(--xy-radius-tile);
		padding: 0.125rem 0.25rem;
		margin-left: -0.25rem;
		transition: color 120ms ease;
	}

	.changes__head::-webkit-details-marker {
		display: none;
	}

	.changes__head:hover,
	.changes__head:focus-visible {
		color: var(--xy-fg);
	}

	.changes__count {
		font-variant-numeric: tabular-nums;
		color: var(--xy-fg-subtle);
	}

	.changes--undone .changes__list {
		text-decoration: line-through;
		text-decoration-color: var(--xy-fg-subtle);
	}

	.changes__undo {
		border-radius: var(--xy-radius-tile);
		padding: 0.125rem 0.375rem;
		color: var(--xy-fg-subtle);
		transition:
			color 120ms ease,
			background-color 120ms ease;
	}

	.changes__undo:hover,
	.changes__undo:focus-visible {
		color: var(--xy-fg);
		background-color: var(--xy-hover);
	}

	.changes__list {
		margin: 0.375rem 0 0;
		padding: 0 0 0 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-family: var(--xy-font-mono);
		overflow-wrap: anywhere;
	}
</style>
