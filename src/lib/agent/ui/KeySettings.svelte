<!--
@component
Agent settings, the way settings usually look: an API key box per provider (Anthropic for the
agent, OpenAI for voice), the model, the voice model, and the privacy and cost notes folded away.
A saved key shows only its hint (`sk-ant-…a1b2`) with a way to remove it.
-->
<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import { detectProvider, type KeyProvider, type KeyStore } from '../keys.svelte';
	import type { ModelOption, RealtimeModelProfile } from '../models';

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
		/** Voice (M8): the realtime models, the chosen one, and how to choose. */
		voiceModels?: readonly RealtimeModelProfile[];
		voiceModel?: string;
		onvoicemodel?: (id: string) => void;
	}

	let {
		keys,
		models,
		model,
		onmodel,
		onclose,
		onchange,
		keyStatus = 'unchecked',
		voiceModels = [],
		voiceModel,
		onvoicemodel
	}: Props = $props();

	const uid = $props.id();
	let drafts = $state<Record<KeyProvider, string>>({ anthropic: '', openai: '' });
	let problems = $state<Record<KeyProvider, string | null>>({ anthropic: null, openai: null });

	const STATUS: Record<NonNullable<Props['keyStatus']>, string> = {
		unchecked: 'saved',
		checking: 'checking…',
		valid: 'connected',
		invalid: 'rejected by anthropic'
	};

	const BOXES: Record<KeyProvider, { title: string; placeholder: string; link: string }> = {
		anthropic: {
			title: 'anthropic api key',
			placeholder: 'sk-ant-…',
			link: 'https://console.anthropic.com/settings/keys'
		},
		openai: {
			title: 'openai api key',
			placeholder: 'sk-…',
			link: 'https://platform.openai.com/api-keys'
		}
	};

	function save(event: SubmitEvent, provider: KeyProvider): void {
		event.preventDefault();
		const draft = drafts[provider];
		const other = detectProvider(draft);
		if (other && other !== provider) {
			problems[provider] =
				other === 'openai'
					? 'That is an OpenAI key: it goes in the voice box.'
					: 'That is an Anthropic key: it goes in the box above.';
			return;
		}
		const result = keys.save(draft);
		if (!result.ok) {
			problems[provider] = result.message;
			return;
		}
		problems[provider] = null;
		drafts[provider] = '';
		onchange?.(result.provider);
	}

	function remove(provider: KeyProvider): void {
		keys.remove(provider);
		onchange?.(provider);
	}
</script>

{#snippet keyBox(provider: KeyProvider)}
	{@const box = BOXES[provider]}
	<div class="field">
		<div class="field__head">
			<label class="field__label" for="{uid}-{provider}">{box.title}</label>
			{#if provider === 'anthropic' && keys.has('anthropic')}
				<span class={['field__status', `field__status--${keyStatus}`]} aria-live="polite">
					{STATUS[keyStatus]}
				</span>
			{/if}
		</div>
		{#if keys.has(provider)}
			<div class="field__line">
				<input
					id="{uid}-{provider}"
					class="input input--saved"
					value={keys.hint(provider)}
					readonly
					aria-label="{box.title}, saved"
				/>
				<Button size="sm" variant="ghost" onclick={() => remove(provider)}>remove</Button>
			</div>
		{:else}
			<form class="field__line" onsubmit={(event) => save(event, provider)}>
				<input
					id="{uid}-{provider}"
					class="input"
					type="password"
					autocomplete="off"
					spellcheck="false"
					placeholder={box.placeholder}
					bind:value={drafts[provider]}
					aria-describedby="{uid}-{provider}-note"
				/>
				<Button type="submit" size="sm" variant="secondary" disabled={!drafts[provider].trim()}>
					save
				</Button>
			</form>
		{/if}
		{#if problems[provider]}
			<p class="field__note field__note--problem" id="{uid}-{provider}-note">
				{problems[provider]}
			</p>
		{:else if !keys.has(provider)}
			<p class="field__note" id="{uid}-{provider}-note">
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={box.link} target="_blank" rel="noopener noreferrer">get a key</a>
			</p>
		{/if}
	</div>
{/snippet}

<section class="settings" aria-labelledby="{uid}-title">
	<header class="settings__head">
		<h3 class="settings__title" id="{uid}-title">settings</h3>
		<Button size="sm" variant="ghost" onclick={onclose}>done</Button>
	</header>

	<div class="group">
		{@render keyBox('anthropic')}
		<div class="field">
			<label class="field__label" for="{uid}-model">model</label>
			<select
				id="{uid}-model"
				class="input"
				value={model}
				onchange={(event) => onmodel(event.currentTarget.value)}
			>
				{#each models as option (option.id)}
					<option value={option.id}>{option.label}{option.price ? ` (${option.price})` : ''}</option
					>
				{/each}
			</select>
		</div>
	</div>

	<div class="group">
		<h4 class="group__title">voice</h4>
		{@render keyBox('openai')}
		{#if voiceModels.length > 0 && onvoicemodel}
			<div class="field">
				<label class="field__label" for="{uid}-voice">voice model</label>
				<select
					id="{uid}-voice"
					class="input"
					value={voiceModel}
					onchange={(event) => onvoicemodel(event.currentTarget.value)}
				>
					{#each voiceModels as option (option.id)}
						<option value={option.id}>{option.label}</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	<details class="about">
		<summary>privacy and cost</summary>
		<p>
			Keys stay in this browser and go straight to Anthropic or OpenAI; there is no server in
			between. Remove them on a shared computer.
		</p>
		<p>
			Usage is billed to your own account. The first question of a session costs roughly $0.30–0.60
			(the manual is cached with it), follow-ups a few cents; the meter under the chat keeps the
			total.
		</p>
	</details>
</section>

<style>
	.settings {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.settings__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.settings__title {
		margin: 0;
		font-size: var(--xy-text-lg);
		line-height: var(--xy-leading-lg);
		font-weight: var(--xy-weight-regular);
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.group__title {
		margin: 0;
		padding-top: 1rem;
		border-top: 1px solid var(--xy-line);
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		font-weight: var(--xy-weight-regular);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.field__head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.field__label {
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		letter-spacing: var(--xy-tracking-label);
	}

	.field__status {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		letter-spacing: var(--xy-tracking-label);
	}

	.field__status--valid {
		color: var(--xy-fg-muted);
	}

	.field__status--invalid {
		color: var(--xy-red, #ff4d00);
	}

	.field__line {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.input {
		flex: 1;
		min-width: 0;
		height: 2.25rem;
		padding: 0 0.75rem;
		border: 1px solid var(--xy-line-control);
		border-radius: 0.5rem;
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg);
		font: inherit;
		font-size: var(--xy-text-sm);
		transition: border-color var(--xy-dur-quick, 120ms) ease;
	}

	/* a field of its own row: its height stays (flex would squash it in the column), and its
	 * chevron is drawn to match the panel's grey text rather than the browser's */
	select.input {
		flex: none;
		width: 100%;
		padding-right: 2rem;
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23909195' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.75rem center;
		background-size: 0.875rem;
		cursor: pointer;
	}

	.input::placeholder {
		color: var(--xy-fg-faint);
	}

	.input:focus,
	.input:focus-visible {
		outline: none;
		border-color: var(--xy-fg-subtle);
	}

	.input--saved {
		color: var(--xy-fg-muted);
		font-family: var(--xy-font-mono);
		font-size: var(--xy-text-xs);
	}

	.field__note {
		margin: 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
	}

	.field__note a {
		color: var(--xy-fg-muted);
	}

	.field__note--problem {
		color: var(--xy-red, #ff4d00);
	}

	.about {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.about summary {
		color: var(--xy-fg-muted);
		cursor: pointer;
		letter-spacing: var(--xy-tracking-label);
	}

	.about p {
		margin: 0.5rem 0 0;
	}
</style>
