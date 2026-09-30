<!--
@component
Things to say next, under the last answer (`quick-replies.ts`): a short row of keys, each sent as
your message with a click. They come in softly, one after another, once the answer is written.

```svelte
<QuickReplies replies={['make it busier', 'teach me to do that']} onreply={(text) => send(text)} />
```
-->
<script lang="ts">
	interface Props {
		replies: readonly string[];
		onreply: (text: string) => void;
	}

	let { replies, onreply }: Props = $props();
</script>

{#if replies.length > 0}
	<div class="replies" role="group" aria-label="quick replies">
		{#each replies as reply, i (reply)}
			<button type="button" class="reply" style:--i={i} onclick={() => onreply(reply)}>
				{reply}
			</button>
		{/each}
	</div>
{/if}

<style>
	.replies {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.reply {
		padding: 0.25rem 0.625rem;
		border: 1px solid var(--xy-line-strong);
		border-radius: var(--xy-radius-tile);
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		cursor: pointer;
		transition:
			color var(--xy-dur-quick) var(--xy-ease-standard),
			border-color var(--xy-dur-quick) var(--xy-ease-standard),
			background-color var(--xy-dur-quick) var(--xy-ease-standard);
		animation: reply-in var(--xy-dur-slow) var(--xy-ease-standard) calc(120ms + var(--i) * 70ms)
			both;
	}

	.reply:hover {
		border-color: var(--xy-line-control);
		background-color: var(--xy-hover);
		color: var(--xy-fg);
	}

	.reply:focus-visible {
		outline: 1.5px solid var(--xy-focus);
		outline-offset: 1px;
	}

	@keyframes reply-in {
		from {
			opacity: 0;
			transform: translateY(0.25rem);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.reply {
			animation: none;
		}
	}
</style>
