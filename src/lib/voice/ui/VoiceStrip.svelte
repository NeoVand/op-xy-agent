<!--
@component
One row above the composer while voice is on: its LED and what it is doing in words, the
hands-free switch, what the call has cost and the key that ends it. When voice cannot start (no
OpenAI key, the microphone blocked, the call dropped) the row says so and offers the way out.
-->
<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Led from '$lib/ui/Led.svelte';
	import Switch from '$lib/ui/Switch.svelte';
	import { tooltip } from '$lib/ui/tooltip';
	import type { LedState } from '$lib/ui/types';
	import type { VoiceSession } from '../session.svelte';

	interface Props {
		voice: VoiceSession;
		/** Claude is working (a request the voice handed over, or one typed). */
		claudeBusy?: boolean;
		/** Opens the agent settings (to add or check a key). */
		onsettings?: () => void;
	}

	let { voice, claudeBusy = false, onsettings }: Props = $props();

	const problem = $derived(voice.problem);
	const keyProblem = $derived(
		problem?.code === 'no-key' ||
			problem?.code === 'auth' ||
			problem?.code === 'permission' ||
			problem?.code === 'quota' ||
			problem?.code === 'no-claude'
	);
	const text = $derived.by(() => {
		if (problem) return problem.message;
		if (voice.hint) return voice.hint;
		switch (voice.phase) {
			case 'connecting':
				return 'connecting';
			case 'listening':
				return voice.mode === 'push-to-talk'
					? claudeBusy
						? 'claude is on it; hold the mic key to talk'
						: 'hold the mic key to talk'
					: voice.muted
						? 'mic muted'
						: 'listening';
			case 'user-speaking':
				return 'listening to you';
			case 'thinking':
				return claudeBusy ? 'claude is on it' : 'thinking';
			case 'speaking':
				return 'speaking';
			default:
				return '';
		}
	});
	const led: LedState = $derived(
		problem?.fatal
			? 'red'
			: voice.phase === 'user-speaking' ||
				  (voice.mode === 'hands-free' && voice.phase === 'listening' && !voice.muted)
				? 'red'
				: voice.phase === 'listening'
					? 'dim'
					: 'white'
	);
	const blink = $derived(
		!problem && (voice.phase === 'connecting' || voice.phase === 'thinking')
			? ('breathe' as const)
			: false
	);
	const cost = $derived(
		voice.usd <= 0 ? null : voice.usd < 0.01 ? '< $0.01' : `$${voice.usd.toFixed(2)}`
	);
	const settingsLabel = $derived(
		problem?.code === 'no-key' || problem?.code === 'no-claude' ? 'add key' : 'check key'
	);
</script>

<div class="strip" role="group" aria-label="voice">
	<span
		class="strip__state"
		{@attach tooltip(voice.microphone ? `microphone: ${voice.microphone}` : null)}
	>
		<Led state={led} {blink} size="sm" />
		<span class="strip__text" role="status" aria-live="polite">{text}</span>
	</span>
	<span class="strip__actions">
		{#if problem}
			{#if keyProblem && onsettings}
				<Button size="sm" variant="secondary" onclick={onsettings}>{settingsLabel}</Button>
			{/if}
			<IconButton
				size="sm"
				variant="ghost"
				icon="close"
				label="dismiss"
				onclick={() => voice.dismiss()}
			/>
		{:else}
			<Switch
				class="strip__switch"
				checked={voice.mode === 'hands-free'}
				onchange={(on) => voice.setMode(on ? 'hands-free' : 'push-to-talk')}
			>
				<span class="strip__switch-label">hands-free</span>
			</Switch>
			{#if cost}<span
					class="strip__cost"
					{@attach tooltip('what this voice call has cost so far (openai)')}>{cost}</span
				>{/if}
			{#if voice.active}
				<Button size="sm" variant="ghost" onclick={() => voice.disconnect()}>end</Button>
			{:else if voice.hint}
				<IconButton
					size="sm"
					variant="ghost"
					icon="close"
					label="dismiss"
					onclick={() => voice.dismiss()}
				/>
			{/if}
		{/if}
	</span>
</div>

<style>
	.strip {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		min-height: 2.25rem;
		margin: 0 0.75rem 0.5rem;
		padding: 0 0.25rem 0 0.625rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
	}

	.strip__state {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	/* A problem can take two lines; it is never cut short. */
	.strip__text {
		padding-block: 0.375rem;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		overflow-wrap: anywhere;
	}

	.strip__actions {
		display: flex;
		flex: none;
		align-items: center;
		gap: 0.375rem;
	}

	/* The switch sits in a row of small print: centred, its label at label size. */
	.strip__actions :global(.strip__switch) {
		align-items: center;
		gap: 0.375rem;
	}

	.strip__switch-label {
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		white-space: nowrap;
	}

	.strip__cost {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		font-variant-numeric: tabular-nums;
	}
</style>
