<!--
@component
What a turn changed on the replica, once it ends: one quiet line with a count that opens into the
list the agent was given (docs/AGENT-V2.md, grounding), so what the answer says and what happened can
be compared at a glance. Beside it, while this page session can: undo, which takes the turn back
(what the user changed since stays), and then put back.
-->
<script lang="ts">
	import Led from '$lib/ui/Led.svelte';

	interface Props {
		lines: readonly string[];
		/** `ready` offers undo, `undone` put back; absent offers neither. */
		undo?: 'ready' | 'undone';
		onundo?: () => void;
	}

	let { lines, undo, onundo }: Props = $props();
</script>

<div class={['changes', undo === 'undone' && 'changes--undone']}>
	<details class="changes__details">
		<summary class="changes__head">
			<Led state={undo === 'undone' ? 'off' : 'white'} size="sm" />
			<span>{undo === 'undone' ? 'taken back on the replica' : 'changed on the replica'}</span>
			<span class="changes__count">{lines.length}</span>
		</summary>
		<ul class="changes__list">
			{#each lines as line, i (i)}
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
