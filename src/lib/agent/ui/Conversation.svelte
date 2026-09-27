<!--
@component
The conversation: your messages, the agent's answers (streamed, with a caret while they are being
written and keycaps you can click to see a combo on the replica), its tool calls (a subagent's work
shows live under its chip), approval records and notices.

It is its own scroll area. It follows the newest line while you are at the bottom and stops when you
scroll up to read; a "latest" key brings you back. While the agent works, a status line at its foot
says what it is doing and for how long.
-->
<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import Button from '$lib/ui/Button.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import Led from '$lib/ui/Led.svelte';
	import type { Activity } from '../activity';
	import type { ChatEntry } from '../chat';
	import ActivityLine from './ActivityLine.svelte';
	import MessageText, { type CitationTarget } from './MessageText.svelte';
	import ToolChip from './ToolChip.svelte';

	interface Props {
		entries: readonly ChatEntry[];
		/** A run is in progress (streaming, running tools or waiting for an approval). */
		running?: boolean;
		/** What the agent is doing right now, for the status line; null when idle. */
		activity?: Activity | null;
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
		activity = null,
		onkeys,
		cite,
		onretry,
		onsettings
	}: Props = $props();

	// Progress notes are not rows: the status line shows the latest one while the agent works.
	const top = $derived(
		entries.filter((e) => e.kind !== 'progress' && (!('parent' in e) || e.parent === null))
	);
	const lastIndex = $derived(top.length - 1);
	/** The answer block being written right now (it gets the caret). */
	const streaming = $derived(activity?.phase === 'writing' ? activity.key : null);

	/** Following the newest line: true until the user scrolls up. */
	let pinned = $state(true);
	let scroller: HTMLElement | null = null;

	function nested(id: string): ChatEntry[] {
		return entries.filter((e) => 'parent' in e && e.parent === id);
	}

	function toEnd(): void {
		if (scroller) scroller.scrollTop = scroller.scrollHeight;
	}

	function jumpToLatest(): void {
		pinned = true;
		toEnd();
	}

	/**
	 * Makes the element the scroll area and keeps it at the end while pinned. Sizes are watched
	 * rather than mutations, so reflows count too: streamed text, a chip opening, the status line
	 * appearing, the viewport itself shrinking when the dock grows.
	 */
	const follow: Attachment<HTMLElement> = (node) => {
		scroller = node;
		let lastTop = node.scrollTop;
		// Only moving up unpins: by the time the scroll event of our own jump to the end arrives,
		// more text may have streamed in, so "not at the end" alone would unpin by mistake.
		const onScroll = () => {
			const top = node.scrollTop;
			if (node.scrollHeight - top - node.clientHeight < 32) pinned = true;
			else if (top < lastTop) pinned = false;
			lastTop = top;
		};
		const resize = new ResizeObserver(() => {
			if (pinned) toEnd();
		});
		resize.observe(node);
		for (const child of node.children) resize.observe(child);
		node.addEventListener('scroll', onScroll, { passive: true });
		toEnd();
		return () => {
			resize.disconnect();
			node.removeEventListener('scroll', onScroll);
			scroller = null;
		};
	};

	/** A message you send brings the view back to the end. */
	const reveal: Attachment<HTMLElement> = () => {
		jumpToLatest();
	};
</script>

<div class="conv" {@attach follow}>
	<ol class="conv__list">
		{#each top as entry, i (entry.id)}
			<li class={['conv__item', `conv__item--${entry.kind}`]}>
				{#if entry.kind === 'user'}
					<p class="conv__user" {@attach reveal}>{entry.text}</p>
				{:else if entry.kind === 'text'}
					<MessageText
						text={entry.text}
						citations={entry.citations}
						streaming={entry.id === streaming}
						{onkeys}
						{cite}
					/>
				{:else if entry.kind === 'tool'}
					<ToolChip {entry} nested={entry.name === 'task' ? nested(entry.id) : []} {onkeys} />
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
	</ol>
	<div class="conv__foot">
		{#if !pinned}
			<div class="conv__latest">
				<Button size="sm" onclick={jumpToLatest} aria-label="jump to the latest message">
					{#snippet icon()}<Icon name="arrow-up" style="transform: rotate(180deg)" />{/snippet}
					latest
				</Button>
			</div>
		{/if}
		{#if running && activity}
			<div class="conv__status"><ActivityLine {activity} /></div>
		{/if}
	</div>
</div>

<style>
	.conv {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		/* No bottom padding: the foot sits flush with the bottom edge when it sticks. */
		padding: 1.25rem 1rem 0;
	}

	.conv__list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0;
		padding: 0 0 1rem;
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

	.conv__approval :global(.led) {
		flex: none;
		align-self: center;
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

	/* Sticks to the bottom of the scroll area when the conversation is taller than it. */
	.conv__foot {
		position: sticky;
		bottom: 0;
		z-index: var(--xy-z-raised);
	}

	.conv__latest {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.5rem);
	}

	.conv__status {
		margin: 0 -0.5rem;
		border-top: 1px solid var(--xy-line);
		background-color: var(--xy-surface);
	}
</style>
