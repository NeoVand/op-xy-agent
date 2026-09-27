<!--
@component
One tool call as a compact row: an LED (blinking while it runs, red while a change is being written
to the device), the tool's name and what came of it. Opens to show the exact input and, for the
manual expert, the steps it took and its answer.
-->
<script lang="ts">
	import Led from '$lib/ui/Led.svelte';
	import type { LedState } from '$lib/ui/types';
	import type { ChatEntry } from '../chat';
	import { agentLabel } from '../agent-names';
	import MessageText from './MessageText.svelte';
	import Self from './ToolChip.svelte';

	type ToolEntry = Extract<ChatEntry, { kind: 'tool' }>;

	interface Props {
		entry: ToolEntry;
		/** Entries of a subagent running under this call (the `task` tool). */
		nested?: readonly ChatEntry[];
		onkeys?: (keys: string) => void;
	}

	let { entry, nested = [], onkeys }: Props = $props();

	const running = $derived(entry.status === 'pending' || entry.status === 'running');
	const writes = $derived(entry.toolKind === 'mutate');
	const led: LedState = $derived(
		running
			? writes
				? 'red'
				: 'white'
			: entry.status === 'ok'
				? writes
					? 'white'
					: 'dim'
				: 'off'
	);
	const statusWord = $derived(
		{
			pending: 'preparing',
			running: 'running',
			ok: '',
			error: 'failed',
			rejected: 'rejected',
			stopped: 'stopped'
		}[entry.status]
	);
	const input = $derived(
		entry.input === null || entry.input === undefined ? '' : JSON.stringify(entry.input, null, 1)
	);
	const nestedTools = $derived(nested.filter((e) => e.kind === 'tool'));
	const nestedText = $derived(
		nested
			.filter((e) => e.kind === 'text')
			.map((e) => (e.kind === 'text' ? e.text : ''))
			.join('\n\n')
	);
	const nestedProgress = $derived.by(() => {
		const notes = nested.filter((e) => e.kind === 'progress');
		const last = notes.at(-1);
		return last?.kind === 'progress' ? (last.text.trim().split('\n').at(-1) ?? '') : '';
	});
	const subagent = $derived.by(() => {
		const first = nested.find((e) => 'agent' in e);
		return first && 'agent' in first ? agentLabel(first.agent) : '';
	});
</script>

<details class={['chip', `chip--${entry.status}`]}>
	<summary class="chip__row">
		<Led state={led} blink={running ? 'fast' : false} size="sm" />
		<span class="chip__label">{entry.label}</span>
		{#if statusWord}<span class="chip__status">{statusWord}</span>{/if}
		{#if entry.summary && entry.summary !== statusWord}
			<span class="chip__summary">{entry.summary}</span>
		{:else if running && nestedProgress}
			<span class="chip__summary">{nestedProgress}</span>
		{/if}
	</summary>
	<div class="chip__detail">
		{#if input && input !== '{}'}
			<pre class="chip__input">{input}</pre>
		{/if}
		{#if nestedTools.length > 0}
			<div class="chip__nested" aria-label="{subagent} steps">
				{#each nestedTools as child (child.id)}
					{#if child.kind === 'tool'}<Self entry={child} {onkeys} />{/if}
				{/each}
			</div>
		{/if}
		{#if nestedText}
			<div class="chip__answer">
				<span class="chip__who">{subagent}</span>
				<MessageText text={nestedText} {onkeys} />
			</div>
		{/if}
	</div>
</details>

<style>
	.chip {
		border-radius: var(--xy-radius-tile);
	}

	.chip__row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		min-height: 1.75rem;
		padding: 0.3125rem 0.5rem;
		border-radius: var(--xy-radius-tile);
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		cursor: pointer;
		list-style: none;
	}

	.chip__row::-webkit-details-marker {
		display: none;
	}

	.chip__row:hover {
		background-color: var(--xy-hover);
	}

	.chip__row :global(.led) {
		align-self: center;
	}

	.chip__label {
		flex: none;
		color: var(--xy-fg);
		font-weight: 450;
	}

	.chip__status {
		flex: none;
		color: var(--xy-fg-subtle);
	}

	.chip--rejected .chip__status,
	.chip--error .chip__status {
		color: var(--xy-fg-muted);
	}

	.chip__summary {
		min-width: 0;
		overflow: hidden;
		color: var(--xy-fg-subtle);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chip[open] .chip__summary {
		white-space: normal;
	}

	.chip__detail {
		padding: 0.25rem 0.5rem 0.5rem 1.375rem;
	}

	.chip__input {
		margin: 0;
		max-height: 12rem;
		overflow: auto;
		padding: 0.5rem 0.625rem;
		border-radius: var(--xy-radius-card);
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg-muted);
		font-family: var(--xy-font-mono);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.chip__nested {
		margin-top: 0.375rem;
		padding-left: 0.5rem;
		border-left: 1px solid var(--xy-line);
	}

	.chip__answer {
		margin-top: 0.5rem;
		padding: 0.5rem 0.625rem;
		border-radius: var(--xy-radius-card);
		background-color: var(--xy-surface-sunken);
	}

	.chip__who {
		display: block;
		margin-bottom: 0.25rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
	}
</style>
