<!--
@component
What a turn changed on the replica, once it ends: one quiet line with a count that opens into the
list the agent was given (docs/AGENT-V2.md, grounding), so what the answer says and what happened can
be compared at a glance.
-->
<script lang="ts">
	import Led from '$lib/ui/Led.svelte';

	interface Props {
		lines: readonly string[];
	}

	let { lines }: Props = $props();
</script>

<details class="changes">
	<summary class="changes__head">
		<Led state="white" size="sm" />
		<span>changed on the replica</span>
		<span class="changes__count">{lines.length}</span>
	</summary>
	<ul class="changes__list">
		{#each lines as line, i (i)}
			<li>{line}</li>
		{/each}
	</ul>
</details>

<style>
	.changes {
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
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
