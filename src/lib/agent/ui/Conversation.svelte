<!--
@component
The conversation: your messages, the agent's answers (streamed, with keycaps you can click to see a
combo on the replica), its tool calls, approval records and notices. Stays pinned to the newest
message while you are at the bottom; scrolling up to read stops the pinning.
-->
<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import Button from '$lib/ui/Button.svelte';
	import Led from '$lib/ui/Led.svelte';
	import type { ChatEntry } from '../chat';
	import MessageText, { type CitationTarget } from './MessageText.svelte';
	import ToolChip from './ToolChip.svelte';

	interface Props {
		entries: readonly ChatEntry[];
		/** A run is in progress. */
		running?: boolean;
		/** The agent waits for an approval. */
		waiting?: boolean;
		onkeys?: (keys: string) => void;
		/** Resolves manual citations in answers. */
		cite?: (ref: string) => CitationTarget | null;
		/** Re-runs the last turn after an error. */
		onretry?: () => void;
		/** Opens the settings (for key errors). */
		onsettings?: () => void;
	}

	let {
		entries,
		running = false,
		waiting = false,
		onkeys,
		cite,
		onretry,
		onsettings
	}: Props = $props();

	const top = $derived(entries.filter((e) => !('parent' in e) || e.parent === null));
	const lastIndex = $derived(top.length - 1);
	const thinking = $derived(
		running && !waiting && (top.at(-1)?.kind === 'user' || top.length === 0)
	);

	function nested(id: string): ChatEntry[] {
		return entries.filter((e) => 'parent' in e && e.parent === id);
	}

	function lastLine(text: string): string {
		const lines = text.trim().split('\n').filter(Boolean);
		return lines.at(-1) ?? '';
	}

	/** Keeps the log scrolled to the bottom while the user has not scrolled up. */
	const pinToBottom: Attachment<HTMLElement> = (node) => {
		const scroller = node.parentElement;
		if (!scroller) return;
		let pinned = true;
		const onScroll = () => {
			pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
		};
		const observer = new MutationObserver(() => {
			if (pinned) scroller.scrollTop = scroller.scrollHeight;
		});
		scroller.addEventListener('scroll', onScroll, { passive: true });
		observer.observe(node, { childList: true, subtree: true, characterData: true });
		scroller.scrollTop = scroller.scrollHeight;
		return () => {
			observer.disconnect();
			scroller.removeEventListener('scroll', onScroll);
		};
	};
</script>

<ol class="conv" {@attach pinToBottom}>
	{#each top as entry, i (entry.id)}
		<li class={['conv__item', `conv__item--${entry.kind}`]}>
			{#if entry.kind === 'user'}
				<p class="conv__user">{entry.text}</p>
			{:else if entry.kind === 'text'}
				<MessageText text={entry.text} citations={entry.citations} {onkeys} {cite} />
			{:else if entry.kind === 'tool'}
				<ToolChip {entry} nested={entry.name === 'task' ? nested(entry.id) : []} {onkeys} />
			{:else if entry.kind === 'progress'}
				{#if running && i === lastIndex}
					<p class="conv__progress">
						<Led state="white" blink="slow" size="sm" />
						<span>{lastLine(entry.text)}</span>
					</p>
				{/if}
			{:else if entry.kind === 'approval'}
				<p class="conv__approval">
					<Led
						state={entry.outcome === 'approved' || entry.outcome === 'allowed' ? 'white' : 'off'}
						size="sm"
					/>
					<span>
						{entry.outcome === 'allowed' ? 'approved for this session' : entry.outcome}:
						{entry.labels.join(', ')}{entry.note ? ` (“${entry.note}”)` : ''}
					</span>
				</p>
			{:else if entry.kind === 'notice'}
				<div class={['conv__notice', `conv__notice--${entry.tone}`]}>
					<Led state={entry.tone === 'error' ? 'red' : 'dim'} size="sm" />
					<p>{entry.text}</p>
					{#if entry.tone === 'error' && i === lastIndex && !running}
						<div class="conv__notice-actions">
							{#if entry.code === 'auth' || entry.code === 'permission'}
								<Button size="sm" onclick={() => onsettings?.()}>check your key</Button>
							{:else if entry.code !== 'refusal' && entry.code !== 'context'}
								<Button size="sm" onclick={() => onretry?.()}>try again</Button>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</li>
	{/each}
	{#if thinking}
		<li class="conv__item">
			<p class="conv__progress">
				<Led state="white" blink="fast" size="sm" />
				<span>thinking</span>
			</p>
		</li>
	{/if}
</ol>

<style>
	.conv {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.conv__item--tool + .conv__item--tool {
		margin-top: -0.625rem;
	}

	.conv__user {
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.conv__progress,
	.conv__approval {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin: 0;
		padding: 0 0.5rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.conv__progress :global(.led),
	.conv__approval :global(.led) {
		flex: none;
		align-self: center;
	}

	.conv__progress span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.conv__notice {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: baseline;
		gap: 0.25rem 0.5rem;
		padding: 0.5rem 0.625rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.conv__notice p {
		margin: 0;
		color: var(--xy-fg-muted);
	}

	.conv__notice--error p {
		color: var(--xy-fg);
	}

	.conv__notice :global(.led) {
		align-self: center;
	}

	.conv__notice-actions {
		grid-column: 2;
		display: flex;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}
</style>
