<!--
@component
The one thing that needs a decision: the changes the agent wants to make to the OP-XY. Drawn as the
screen's white card. Approve, reject (optionally with a note the agent reads), or approve and stop
asking for these kinds of change until the page reloads.
-->
<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import Led from '$lib/ui/Led.svelte';
	import type { ApprovalDecision, ApprovalRequest } from '../types';

	interface Props {
		request: ApprovalRequest;
		ondecide: (decision: ApprovalDecision) => void;
	}

	let { request, ondecide }: Props = $props();

	let note = $state('');
	let noting = $state(false);
	const uid = $props.id();
	const count = $derived(request.actions.length);
	const kinds = $derived([...new Set(request.actions.map((a) => a.toolLabel))].join(' and '));

	function reject(): void {
		if (!noting) {
			noting = true;
			return;
		}
		ondecide({ kind: 'reject', note: note.trim() || undefined });
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			ondecide({ kind: 'reject' });
		}
	}
</script>

<div
	class="sheet"
	data-theme="light"
	role="alertdialog"
	aria-labelledby="{uid}-title"
	aria-describedby="{uid}-list"
	tabindex="-1"
	onkeydown={onKeyDown}
>
	<div class="sheet__head">
		<Led state="red" blink="breathe" size="sm" />
		<h3 class="sheet__title" id="{uid}-title">
			{count === 1 ? 'change your op-xy?' : `make ${count} changes to your op-xy?`}
		</h3>
	</div>
	<ul class="sheet__list" id="{uid}-list">
		{#each request.actions as action (action.toolCallId)}
			<li class="sheet__action">
				<span class="sheet__label">{action.preview.label}</span>
				{#if action.preview.before !== undefined || action.preview.after}
					<span class="sheet__diff">
						<span>now {action.preview.before ?? 'unknown'}</span>
						{#if action.preview.after}<span>after {action.preview.after}</span>{/if}
					</span>
				{/if}
				{#if action.preview.note}<span class="sheet__note">{action.preview.note}</span>{/if}
			</li>
		{/each}
	</ul>
	{#if noting}
		<label class="sheet__field">
			<span class="sheet__field-label">tell the agent why (optional)</span>
			<!-- svelte-ignore a11y_autofocus -->
			<textarea
				rows="2"
				bind:value={note}
				placeholder="e.g. keep it at 120"
				autofocus
				onkeydown={(event) => {
					if (event.key === 'Enter' && !event.shiftKey) {
						event.preventDefault();
						reject();
					}
				}}></textarea>
		</label>
	{/if}
	<div class="sheet__actions">
		<Button variant="primary" size="sm" onclick={() => ondecide({ kind: 'approve' })}
			>approve</Button
		>
		<Button size="sm" onclick={reject}>{noting ? 'send rejection' : 'reject'}</Button>
		<Button variant="ghost" size="sm" onclick={() => ondecide({ kind: 'allow-session' })}>
			allow {kinds} until reload
		</Button>
	</div>
	<p class="sheet__foot">Nothing is sent to the device until you approve.</p>
</div>

<style>
	/* The screen's white card, re-themed as "guide" (light) so its keys read on paper. */
	.sheet {
		padding: 0.875rem 0.875rem 0.75rem;
		border-radius: var(--xy-radius-card);
		background-color: var(--xy-scr-card);
		color: var(--xy-ink);
		box-shadow:
			0 0 0 1px var(--xy-ink),
			var(--xy-shadow-float);
	}

	.sheet:focus {
		outline: none;
	}

	.sheet__head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.sheet__title {
		margin: 0;
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		font-weight: var(--xy-weight-medium);
	}

	.sheet__list {
		margin: 0.625rem 0 0;
		padding: 0;
		list-style: none;
	}

	.sheet__action {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding: 0.5rem 0;
		border-top: 1px solid var(--xy-line);
	}

	.sheet__label {
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}

	.sheet__diff {
		display: flex;
		gap: 0.75rem;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-variant-numeric: tabular-nums;
	}

	.sheet__note {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.sheet__field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-top: 0.25rem;
	}

	.sheet__field-label {
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
	}

	.sheet__field textarea {
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--xy-ramp-5);
		border-radius: var(--xy-radius-tile);
		background: #ffffff;
		color: var(--xy-ink);
		font: inherit;
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		resize: vertical;
	}

	.sheet__field textarea:focus-visible {
		outline: 2px solid var(--xy-ink);
		outline-offset: 1px;
	}

	.sheet__actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.sheet__foot {
		margin: 0.5rem 0 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
	}
</style>
