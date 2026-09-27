<!--
@component
Agent settings: paste or remove your own API keys (the provider is detected from the key), pick the
conductor's model, and read plainly where the key is kept, where it is sent and what it costs.
-->
<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import Led from '$lib/ui/Led.svelte';
	import {
		detectProvider,
		KEY_STORAGE_ENTRY,
		type KeyProvider,
		type KeyStore
	} from '../keys.svelte';
	import type { ModelOption } from '../models';

	interface Props {
		keys: KeyStore;
		models: readonly ModelOption[];
		model: string;
		onmodel: (id: string) => void;
		onclose: () => void;
		/** A key was saved or removed. */
		onchange?: (provider: KeyProvider) => void;
		/** What the Models API said about the saved Anthropic key. */
		keyStatus?: 'unchecked' | 'checking' | 'valid' | 'invalid';
		/** Which manual the agent answers from. */
		manualLabel?: string | null;
	}

	let {
		keys,
		models,
		model,
		onmodel,
		onclose,
		onchange,
		keyStatus = 'unchecked',
		manualLabel = null
	}: Props = $props();

	let draft = $state('');
	let problem = $state<string | null>(null);
	const uid = $props.id();
	const detected = $derived(draft.trim() ? detectProvider(draft) : null);
	const selected = $derived(models.find((m) => m.id === model) ?? null);
	const statusText = $derived(
		{
			unchecked: 'saved',
			checking: 'checking with anthropic…',
			valid: 'saved, accepted by anthropic',
			invalid: 'saved, but anthropic rejected it'
		}[keyStatus]
	);

	function save(event: SubmitEvent): void {
		event.preventDefault();
		const result = keys.save(draft);
		if (!result.ok) {
			problem = result.message;
			return;
		}
		problem = null;
		draft = '';
		onchange?.(result.provider);
	}

	function remove(provider: KeyProvider): void {
		keys.remove(provider);
		onchange?.(provider);
	}
</script>

<section class="settings" aria-labelledby="{uid}-title">
	<header class="settings__head">
		<h3 class="settings__title" id="{uid}-title">agent settings</h3>
		<Button size="sm" variant="ghost" onclick={onclose}>done</Button>
	</header>

	<div class="settings__group">
		<h4 class="settings__label">api keys</h4>
		{#if keys.has('anthropic')}
			<div class="settings__key">
				<Led
					state={keyStatus === 'invalid' ? 'red' : keyStatus === 'valid' ? 'white' : 'dim'}
					blink={keyStatus === 'checking' ? 'breathe' : false}
					size="sm"
				/>
				<span class="settings__key-text">
					<span class="settings__mono">{keys.hint('anthropic')}</span>
					<span class="settings__muted">anthropic, {statusText}</span>
				</span>
				<Button size="sm" variant="ghost" onclick={() => remove('anthropic')}>remove</Button>
			</div>
		{/if}
		{#if keys.has('openai')}
			<div class="settings__key">
				<Led state="dim" size="sm" />
				<span class="settings__key-text">
					<span class="settings__mono">{keys.hint('openai')}</span>
					<span class="settings__muted">openai, kept for voice (coming soon)</span>
				</span>
				<Button size="sm" variant="ghost" onclick={() => remove('openai')}>remove</Button>
			</div>
		{/if}
		<form class="settings__form" onsubmit={save}>
			<label class="sr-only" for="{uid}-key">api key</label>
			<input
				id="{uid}-key"
				class="settings__input"
				type="password"
				autocomplete="off"
				spellcheck="false"
				placeholder={keys.has('anthropic')
					? 'paste a new key to replace it'
					: 'paste your anthropic key (sk-ant-…)'}
				bind:value={draft}
				aria-describedby="{uid}-detected {uid}-problem"
			/>
			<Button type="submit" size="sm" variant="secondary" disabled={!draft.trim()}>save</Button>
		</form>
		<p class="settings__hint" id="{uid}-detected" aria-live="polite">
			{#if detected === 'anthropic'}
				anthropic key detected
			{:else if detected === 'openai'}
				openai key detected: it is kept for realtime voice, which is coming later
			{:else if draft.trim()}
				not a key we recognise
			{/if}
		</p>
		{#if problem}
			<p class="settings__problem" id="{uid}-problem"><Led state="red" size="sm" />{problem}</p>
		{/if}
		<ul class="settings__facts">
			<li>
				Your key stays in this browser: it is saved in this device's local storage (the
				<span class="settings__mono">{KEY_STORAGE_ENTRY}</span> entry) and sent only to api.anthropic.com,
				directly from this page. There is no server in between.
			</li>
			<li>
				Anyone who can use this browser profile can read it, so remove it on a shared computer. A
				key from a dedicated Anthropic workspace with a spend limit is safest.
			</li>
			<li>
				Usage is billed to your Anthropic account. With opus 5.5 the first question of a session
				costs roughly $0.30 to $0.60, because the whole manual is written into the prompt cache;
				follow-ups read it from the cache and cost a few cents. After five idle minutes the cache
				expires and the next question costs as much as the first. The meter under the chat shows the
				running total.
			</li>
		</ul>
	</div>

	<div class="settings__group">
		<label class="settings__label" for="{uid}-model">model</label>
		<select
			id="{uid}-model"
			class="settings__select"
			value={model}
			onchange={(event) => onmodel(event.currentTarget.value)}
		>
			{#each models as option (option.id)}
				<option value={option.id}>{option.label}{option.price ? ` (${option.price})` : ''}</option>
			{/each}
		</select>
		<p class="settings__hint">
			{#if selected}
				{selected.role}{selected.price
					? `: ${selected.price} per million input / output tokens.`
					: ': price unknown, so the meter shows a lower bound.'}
			{/if}
			Changing the model starts a fresh prompt cache, so the next question costs a little more.
		</p>
	</div>

	{#if manualLabel}
		<div class="settings__group">
			<h4 class="settings__label">manual</h4>
			<p class="settings__muted">{manualLabel}</p>
		</div>
	{/if}
</section>

<style>
	.settings {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.settings__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.settings__title {
		margin: 0;
		font-size: var(--xy-text-xl);
		line-height: var(--xy-leading-xl);
		font-weight: var(--xy-weight-light);
	}

	.settings__group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.settings__label {
		margin: 0;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}

	.settings__key {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.375rem 0.25rem 0.375rem 0.625rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
	}

	.settings__key-text {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.settings__mono {
		font-family: var(--xy-font-mono);
		font-size: var(--xy-text-xs);
	}

	.settings__muted {
		margin: 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.settings__form {
		display: flex;
		gap: 0.5rem;
	}

	.settings__input,
	.settings__select {
		flex: 1;
		min-width: 0;
		height: 2.25rem;
		padding: 0 0.75rem;
		border: 0;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		box-shadow:
			var(--xy-shadow-recess),
			0 0 0 1px var(--xy-line-control);
		color: var(--xy-fg);
		font: inherit;
		font-size: var(--xy-text-sm);
	}

	.settings__input::placeholder {
		color: var(--xy-fg-faint);
	}

	.settings__input:focus-visible,
	.settings__select:focus-visible {
		outline: 2px solid var(--xy-focus);
		outline-offset: 2px;
	}

	.settings__hint {
		min-height: 1rem;
		margin: 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
	}

	.settings__problem {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		color: var(--xy-fg);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.settings__facts {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin: 0.25rem 0 0;
		padding: 0 0 0 1rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}
</style>
