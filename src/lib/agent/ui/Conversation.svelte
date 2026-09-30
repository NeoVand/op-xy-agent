<!--
@component
The conversation: your messages (with the files you sent), the agent's answers (streamed, with a caret while they are being
written and keycaps you can click to see a combo on the replica), its tool calls (a subagent's work
shows live under its chip), approval records and notices. A pattern the agent wrote shows under
its chip as a card to play with, live on the replica (`patterns`; on its latest write only). Under
the last answer, with `onreply`, two or three things to say next, sent with a click
(`quick-replies.ts`). With voice on, what the mic heard and
what the voice said are lines of their own, and a request the voice handed to Claude is marked.

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
	import AttachmentChip from './AttachmentChip.svelte';
	import ChangesNote from './ChangesNote.svelte';
	import PatternCard from './PatternCard.svelte';
	import type { PatternHost } from './pattern-card';
	import QuickReplies from './QuickReplies.svelte';
	import { quickReplies } from '../quick-replies';
	import type { ControlId } from '$lib/core/opxy';
	import MessageText, { type CitationTarget } from './MessageText.svelte';
	import ToolChip from './ToolChip.svelte';

	interface Props {
		entries: readonly ChatEntry[];
		/** A run is in progress (streaming, running tools or waiting for an approval). */
		running?: boolean;
		/** What the agent is doing right now, for the status line; null when idle. */
		activity?: Activity | null;
		onkeys?: (keys: string) => void;
		/** The controls of the keys pointed at in an answer (null when none): ring them. */
		onpoint?: (ids: readonly ControlId[] | null) => void;
		/** Resolves manual citations in answers. */
		cite?: (ref: string) => CitationTarget | null;
		/** Re-runs the last turn after an error. */
		onretry?: () => void;
		/** Takes back (or puts back) what a turn changed on the replica, by its changes note. */
		onundochanges?: (id: string) => void;
		/** A changes note's "before" key went down or came up: hear the turn by comparison. */
		onholdchanges?: (id: string, holding: boolean) => void;
		/** A changes note is pointed at (its entry id), or none is any more (null). */
		onpointchanges?: (id: string | null) => void;
		/** Sends a quick reply as the user's message (without it none are offered). */
		onreply?: (text: string) => void;
		/** The replica's patterns, for the cards of the patterns the agent wrote. */
		patterns?: PatternHost;
		/** Opens the settings (for key errors). */
		onsettings?: () => void;
	}

	let {
		entries,
		running = false,
		activity = null,
		onkeys,
		onpoint,
		cite,
		onretry,
		onundochanges,
		onholdchanges,
		onpointchanges,
		onreply,
		patterns,
		onsettings
	}: Props = $props();

	// Progress notes are not rows: the status line shows the latest one while the agent works.
	const top = $derived(
		entries.filter((e) => e.kind !== 'progress' && (!('parent' in e) || e.parent === null))
	);
	const lastIndex = $derived(top.length - 1);
	/** A written pattern's track and pattern, from its call's input (instrument tracks only). */
	function writtenPattern(entry: ChatEntry): { track: number; pattern: number } | null {
		if (entry.kind !== 'tool' || entry.name !== 'write_pattern' || entry.status !== 'ok')
			return null;
		const input = entry.input as { track?: unknown; pattern?: unknown } | null;
		const track = typeof input?.track === 'number' ? input.track : null;
		const pattern = typeof input?.pattern === 'number' ? input.pattern : 1;
		return track !== null && track >= 1 && track <= 8 ? { track, pattern } : null;
	}

	/** The calls that show a pattern card: the latest write of each pattern. */
	const cards = $derived.by(() => {
		if (!patterns) return [];
		const latest: Record<string, string> = {};
		for (const entry of entries) {
			const written = writtenPattern(entry);
			if (written) latest[`${written.track}:${written.pattern}`] = entry.id;
		}
		return Object.values(latest);
	});

	/** What to say next, once the last answer is written. */
	const replies = $derived(onreply && !running ? quickReplies(entries) : []);
	/** The answer block being written right now (it gets the caret). */
	const streaming = $derived(activity?.phase === 'writing' ? activity.key : null);

	/** Following the newest line: true until the user scrolls up. */
	let pinned = $state(true);
	let scroller: HTMLElement | null = null;

	function nested(id: string): ChatEntry[] {
		return entries.filter((e) => 'parent' in e && e.parent === id);
	}

	/** "approved", "approved for this session", "rejected by voice"… */
	function outcomeWords(entry: Extract<ChatEntry, { kind: 'approval' }>): string {
		const words = entry.outcome === 'allowed' ? 'approved for this session' : entry.outcome;
		return entry.via === 'voice' ? `${words} by voice` : words;
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
				{#if entry.kind === 'voice'}
					<p
						class={['conv__voice', `conv__voice--${entry.role}`]}
						{@attach entry.role === 'user' ? reveal : null}
					>
						<Icon name={entry.role === 'user' ? 'mic' : 'sine'} class="conv__voice-glyph" />
						<span class="sr-only">{entry.role === 'user' ? 'you said:' : 'the voice said:'}</span>
						<span class="conv__voice-text">
							{entry.text || '…'}{#if entry.interrupted}<span class="conv__cut">cut off</span>{/if}
						</span>
						{#if entry.live}<Led state="white" blink="breathe" size="sm" />{/if}
					</p>
				{:else if entry.kind === 'user' && entry.via === 'voice'}
					<p class="conv__asked" {@attach reveal}>
						<span class="conv__asked-label">asked claude</span>
						<span class="conv__asked-text">{entry.text}</span>
					</p>
				{:else if entry.kind === 'user'}
					<div class="conv__user" {@attach reveal}>
						{#if entry.attachments && entry.attachments.length > 0}
							<ul class="conv__files" aria-label="files sent">
								{#each entry.attachments as file (file.id)}
									<li>
										<AttachmentChip
											name={file.name}
											kind={file.kind}
											detail={file.detail}
											thumb={file.thumb}
											variant="message"
										/>
									</li>
								{/each}
							</ul>
						{/if}
						{#if entry.text}<p class="conv__text">{entry.text}</p>{/if}
					</div>
				{:else if entry.kind === 'text'}
					<MessageText
						text={entry.text}
						citations={entry.citations}
						streaming={entry.id === streaming}
						{onkeys}
						{onpoint}
						{cite}
					/>
				{:else if entry.kind === 'tool'}
					<ToolChip
						{entry}
						nested={entry.name === 'task' ? nested(entry.id) : []}
						{onkeys}
						{onpoint}
					/>
					{@const written = patterns && cards.includes(entry.id) ? writtenPattern(entry) : null}
					{#if patterns && written}
						<div class="conv__card">
							<PatternCard host={patterns} track={written.track} pattern={written.pattern} />
						</div>
					{/if}
				{:else if entry.kind === 'changes'}
					<ChangesNote
						lines={entry.lines}
						changes={entry.changes}
						undo={entry.undo}
						onundo={onundochanges ? () => onundochanges(entry.id) : undefined}
						onhold={onholdchanges ? (holding) => onholdchanges(entry.id, holding) : undefined}
						onpoint={onpointchanges ? (on) => onpointchanges(on ? entry.id : null) : undefined}
					/>
				{:else if entry.kind === 'approval'}
					<p class="conv__approval">
						<Led
							state={entry.outcome === 'approved' || entry.outcome === 'allowed' ? 'white' : 'off'}
							size="sm"
						/>
						<span>
							{outcomeWords(entry)}:
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
		{#if onreply && replies.length > 0}
			<li class="conv__item conv__item--replies">
				<QuickReplies {replies} {onreply} />
			</li>
		{/if}
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

	.conv__card {
		margin: 0.5rem 0 0.25rem;
	}

	.conv__user {
		padding: 0.5rem 0.75rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}

	.conv__text {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.conv__files {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0.125rem -0.25rem 0;
		padding: 0;
		list-style: none;
	}

	.conv__files:has(+ .conv__text) {
		margin-bottom: 0.5rem;
	}

	/* Voice lines: what the mic heard reads like your messages, with a mic glyph; what the voice
	 * said is a quieter line with a wave. */
	.conv__voice {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin: 0;
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}

	.conv__voice--user {
		padding: 0.5rem 0.75rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg);
	}

	.conv__voice--assistant {
		padding: 0 0.5rem;
		color: var(--xy-fg-muted);
	}

	.conv__voice :global(.conv__voice-glyph) {
		flex: none;
		align-self: center;
		color: var(--xy-fg-subtle);
	}

	.conv__voice :global(.led) {
		flex: none;
		align-self: center;
		margin-left: auto;
	}

	.conv__voice-text {
		min-width: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.conv__cut {
		margin-left: 0.375rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}

	/* A request the voice handed to Claude: what Claude was asked, exactly. */
	.conv__asked {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin: 0;
		padding: 0 0.5rem;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.conv__asked-label {
		flex: none;
		color: var(--xy-fg-subtle);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}

	.conv__asked-text {
		min-width: 0;
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
