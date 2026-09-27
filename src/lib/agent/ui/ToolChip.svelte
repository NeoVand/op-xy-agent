<!--
@component
One tool call as a compact row: an LED (blinking while it runs, red while a change is being written
to the device), the tool's name, its state and a short summary: what it was asked while it runs
(the input shows as the model writes it), what came of it when done. Opens to show the exact input.

A `task` call (the manual expert) opens by itself while the subagent works, showing its steps and
the line it is writing, and closes to its summary when it is done; open it again for the steps and
the full answer.
-->
<script lang="ts">
	import Led from '$lib/ui/Led.svelte';
	import type { LedState } from '$lib/ui/types';
	import { inputSummary, lastLine, subagentLabel } from '../activity';
	import type { ChatEntry } from '../chat';
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
	/** A subagent at work: the chip stays open on its live steps. */
	const live = $derived(entry.name === 'task' && entry.status === 'running');
	const led: LedState = $derived(
		running
			? writes && entry.status === 'running'
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
	const asked = $derived(inputSummary(entry.name, entry.input));
	/** What it was asked while it runs; what came of it once it is done. */
	const summary = $derived(running ? asked : entry.summary || asked);
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
	const subagent = $derived.by(() => {
		const first = nested.find((e) => 'agent' in e);
		if (first && 'agent' in first) return subagentLabel(first.agent);
		const type =
			entry.input !== null && typeof entry.input === 'object'
				? (entry.input as Record<string, unknown>).subagent_type
				: undefined;
		return typeof type === 'string' ? subagentLabel(type) : '';
	});
	/** The subagent's newest note or line of its answer, while that is the newest thing it did. */
	const now = $derived.by(() => {
		const last = nested.at(-1);
		if (last?.kind === 'text') return { text: lastLine(last.text), writing: true };
		if (last?.kind === 'progress') return { text: lastLine(last.text), writing: false };
		return null;
	});
</script>

<details class={['chip', `chip--${entry.status}`, live && 'chip--live']} open={live}>
	<summary class="chip__row">
		<Led state={led} blink={running ? 'fast' : false} size="sm" />
		<span class="chip__label">{entry.label}</span>
		{#if statusWord}<span class="chip__status">{statusWord}</span>{/if}
		{#if summary && summary !== statusWord}<span class="chip__summary">{summary}</span>{/if}
	</summary>
	<div class="chip__detail">
		{#if live}
			{#if nestedTools.length > 0}
				<div class="chip__nested" aria-label="{subagent} steps">
					{#each nestedTools as child (child.id)}
						{#if child.kind === 'tool'}<Self entry={child} {onkeys} />{/if}
					{/each}
				</div>
			{/if}
			{#if now?.text}
				<p class={['chip__now', now.writing && 'chip__now--writing']}>
					<span class="chip__who">{subagent}</span>
					<span class="chip__line">{now.text}</span>
				</p>
			{/if}
		{:else}
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

	.chip[open]:not(.chip--live) .chip__summary {
		white-space: normal;
	}

	.chip__detail {
		padding: 0.25rem 0.5rem 0.5rem 1.375rem;
	}

	.chip--live .chip__detail {
		padding-top: 0;
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

	.chip--live .chip__nested {
		margin-top: 0;
	}

	/* The subagent's newest line, on the same rail as its steps. */
	.chip__now {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin: 0;
		padding: 0.3125rem 0.5rem 0.125rem 1rem;
		border-left: 1px solid var(--xy-line);
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.chip__now .chip__who {
		flex: none;
		margin: 0;
	}

	.chip__line {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chip__now--writing .chip__line {
		color: var(--xy-fg-muted);
	}

	/* The caret of the line being written. */
	.chip__now--writing::after {
		content: '';
		flex: none;
		align-self: center;
		width: 0.375rem;
		height: 0.75rem;
		margin-left: -0.375rem;
		background-color: var(--xy-fg-subtle);
		animation: caret 1s steps(1, end) infinite;
	}

	@keyframes caret {
		50% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.chip__now--writing::after {
			animation: none;
		}
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
