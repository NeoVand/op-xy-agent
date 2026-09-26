<!--
@component
The agent's surface: a header with its status light, the conversation, and the composer. Until the
agent lands (M3) it shows what you will be able to ask, with the composer switched off.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconButton from '../IconButton.svelte';
	import Kbd from '../Kbd.svelte';
	import Led from '../Led.svelte';
	import Panel from '../Panel.svelte';

	interface Props {
		/** Whether an agent is connected and can take messages. */
		online?: boolean;
		/** Called with the message text when the composer is submitted. */
		onsubmit?: (message: string) => void;
		/** The conversation. Without it the panel shows its empty state. */
		children?: Snippet;
		class?: string;
	}

	let { online = false, onsubmit, children, class: className }: Props = $props();

	let draft = $state('');
	const uid = $props.id();
	const canSend = $derived(online && draft.trim().length > 0);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSend) return;
		onsubmit?.(draft.trim());
		draft = '';
	}

	function onKeyDown(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			event.currentTarget.form?.requestSubmit();
		}
	}
</script>

<Panel as="section" variant="plate" padding="none" class={['agent', className]} aria-label="agent">
	{#snippet header()}
		<div class="agent__id">
			<Led state={online ? 'white' : 'off'} size="sm" />
			<h2 class="agent__title">agent</h2>
		</div>
		<span class="agent__state">{online ? 'ready' : 'offline'}</span>
	{/snippet}

	<div class="agent__body">
		<div class="agent__log" aria-live="polite">
			{#if children}
				{@render children()}
			{:else}
				<div class="empty">
					<h3 class="empty__title">ask about your <span class="whitespace-nowrap">op-xy</span></h3>
					<p class="empty__text">
						It answers from the manual, shows you which keys to press on the replica, and can
						program the device for you.
					</p>
					<ul class="empty__examples" aria-label="things you can ask">
						<li>what does <Kbd combo="shift + M1" size="sm" /> do?</li>
						<li>program a four-on-the-floor kick on track 1</li>
						<li>turn this loop into a song with four scenes</li>
						<li>how do I record automation for the filter?</li>
					</ul>
				</div>
			{/if}
		</div>

		<form class="composer" onsubmit={submit}>
			<label class="sr-only" for="{uid}-message">message to the agent</label>
			<textarea
				id="{uid}-message"
				class="composer__field"
				rows="1"
				placeholder="ask about a key, a page or a workflow"
				disabled={!online}
				bind:value={draft}
				onkeydown={onKeyDown}></textarea>
			<IconButton
				type="submit"
				label="send"
				icon="arrow-up"
				variant={canSend ? 'primary' : 'key'}
				size="sm"
				disabled={!canSend}
			/>
		</form>
		<p class="agent__foot">
			{#if online}
				Changes to your device always wait for your approval.
			{:else}
				Not switched on yet. The agent will run in your browser with your own Anthropic key.
			{/if}
		</p>
	</div>
</Panel>

<style>
	.agent__id {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.agent__title {
		margin: 0;
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		font-weight: var(--xy-weight-regular);
	}

	.agent__state {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		padding-right: 0.25rem;
	}

	.agent__body {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.agent__log {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 1.5rem 1.25rem 1rem;
	}

	.empty__title {
		margin: 0;
		font-size: var(--xy-text-xl);
		line-height: var(--xy-leading-xl);
		font-weight: var(--xy-weight-light);
		color: var(--xy-fg);
	}

	.empty__text {
		margin: 0.625rem 0 0;
		max-width: 30rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}

	.empty__examples {
		margin: 1.5rem 0 0;
		padding: 0;
		list-style: none;
	}

	.empty__examples li {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.375rem;
		min-height: 2.5rem;
		padding-block: 0.5rem;
		border-top: 1px solid var(--xy-line);
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}

	.composer {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		margin: 0 0.75rem;
		padding: 0.375rem 0.375rem 0.375rem 0.875rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		box-shadow:
			var(--xy-shadow-recess),
			0 0 0 1px var(--xy-line-control);
	}

	.composer:focus-within {
		box-shadow:
			var(--xy-shadow-recess),
			0 0 0 1px var(--xy-fg-muted);
	}

	.composer__field {
		flex: 1;
		min-height: 2.25rem;
		max-height: 10rem;
		padding: 0.5rem 0;
		border: 0;
		background: none;
		color: var(--xy-fg);
		font: inherit;
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		resize: none;
		field-sizing: content;
	}

	.composer__field:focus {
		outline: none;
	}

	.composer__field::placeholder {
		color: var(--xy-fg-faint);
	}

	.composer__field:disabled {
		cursor: not-allowed;
	}

	.agent__foot {
		margin: 0;
		padding: 0.625rem 1rem 0.875rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}
</style>
