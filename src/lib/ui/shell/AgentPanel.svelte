<!--
@component
The agent's surface: a header with its status light, the conversation, the plan, the approval sheet,
the changes it sent (with undo), the composer and the cost meter.

The agent runs in this browser with the user's own Anthropic key (saved in local storage, sent only
to api.anthropic.com). Its code (the SDK, tools, manual index and conductor) loads lazily, once a key
is present. It reads the app's device stack and replica from context: without a connected OP-XY it
still teaches and animates the replica, and says plainly that device tools need a connection.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Conductor } from '$lib/agent/conductor.svelte';
	import { KeyStore, type KeyProvider } from '$lib/agent/keys.svelte';
	import { DEFAULT_CONDUCTOR_MODEL, modelOptions, profileFor } from '$lib/agent/models';
	import ApprovalSheet from '$lib/agent/ui/ApprovalSheet.svelte';
	import Conversation from '$lib/agent/ui/Conversation.svelte';
	import CostMeter from '$lib/agent/ui/CostMeter.svelte';
	import KeySettings from '$lib/agent/ui/KeySettings.svelte';
	import PlanView from '$lib/agent/ui/PlanView.svelte';
	import RevisionList from '$lib/agent/ui/RevisionList.svelte';
	import { getDeviceStack } from '$lib/device/context';
	import type { DeviceStack } from '$lib/device/stack';
	import { getReplicaState } from '$lib/replica/context';
	import type { ReplicaState } from '$lib/replica/state.svelte';
	import Button from '../Button.svelte';
	import IconButton from '../IconButton.svelte';
	import Kbd from '../Kbd.svelte';
	import Led from '../Led.svelte';
	import Panel from '../Panel.svelte';
	import type { LedState } from '../types';

	interface Props {
		class?: string;
	}

	let { class: className }: Props = $props();

	/** Context from the root layout; absent in isolated renders (then the agent is headless). */
	function fromContext<T>(get: () => T): T | null {
		try {
			return get();
		} catch {
			return null;
		}
	}

	const device: DeviceStack | null = fromContext(getDeviceStack);
	const replica: ReplicaState | null = fromContext(getReplicaState);
	const keys = new KeyStore();
	const uid = $props.id();

	let conductor = $state.raw<Conductor | null>(null);
	let booting = $state(false);
	let bootError = $state<string | null>(null);
	let settingsOpen = $state(false);
	let keyStatus = $state<'unchecked' | 'checking' | 'valid' | 'invalid'>('unchecked');
	let draft = $state('');
	let undoing = $state<number | null>(null);
	let composer: HTMLTextAreaElement | null = null;

	/** Remembers the composer so closing the settings can return focus to it. */
	function trackComposer(node: HTMLTextAreaElement): () => void {
		composer = node;
		return () => {
			composer = null;
		};
	}

	const hasKey = $derived(keys.loaded && keys.has('anthropic'));
	const status = $derived(conductor?.status ?? 'idle');
	const busy = $derived(conductor?.busy ?? false);
	const canSend = $derived(conductor !== null && !busy && draft.trim().length > 0);
	const modelLabel = $derived(profileFor(conductor?.model ?? DEFAULT_CONDUCTOR_MODEL).label);
	const connected = $derived(device?.session.phase === 'ready');
	const firmware = $derived(device?.session.firmware?.osVersion ?? null);

	const led: LedState = $derived(
		!hasKey
			? 'off'
			: booting || status === 'running'
				? 'white'
				: status === 'approval' || status === 'error' || bootError
					? 'red'
					: conductor
						? 'white'
						: 'dim'
	);
	const ledBlink = $derived(
		booting || status === 'running' ? 'fast' : status === 'approval' ? 'slow' : false
	);
	const stateText = $derived(
		!keys.loaded
			? ''
			: !hasKey
				? 'needs a key'
				: booting
					? 'starting'
					: bootError
						? 'failed to start'
						: status === 'running'
							? 'working'
							: status === 'approval'
								? 'waiting for you'
								: status === 'error'
									? 'error'
									: 'ready'
	);

	const EXAMPLES = [
		'what does shift + M1 do?',
		'how do I record automation for the filter?',
		'set the tempo to 96 and mute track 2',
		'play a C minor chord on track 3'
	];

	onMount(() => {
		keys.load();
		if (keys.has('anthropic')) void boot();
		return () => conductor?.dispose();
	});

	async function boot(): Promise<void> {
		const apiKey = keys.get('anthropic');
		if (!apiKey) return;
		booting = true;
		bootError = null;
		keyStatus = 'unchecked';
		try {
			const { createBrowserConductor } = await import('$lib/agent/runtime');
			conductor?.dispose();
			conductor = null;
			const next = await createBrowserConductor({ apiKey, device, replica });
			conductor = next;
			booting = false;
			keyStatus = 'checking';
			const ok = await next.loadModels();
			keyStatus = ok ? 'valid' : next.lastError?.code === 'auth' ? 'invalid' : 'unchecked';
		} catch (error) {
			bootError = error instanceof Error ? error.message : String(error);
		} finally {
			booting = false;
		}
	}

	function onKeyChange(provider: KeyProvider): void {
		if (provider !== 'anthropic') return;
		if (keys.has('anthropic')) {
			settingsOpen = false;
			void boot();
		} else {
			conductor?.dispose();
			conductor = null;
			keyStatus = 'unchecked';
		}
	}

	function send(text: string): void {
		if (!conductor || conductor.busy || !text.trim()) return;
		void conductor.send(text);
	}

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		if (!canSend) return;
		const text = draft;
		draft = '';
		send(text);
	}

	function onKeyDown(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }): void {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			event.currentTarget.form?.requestSubmit();
		} else if (event.key === 'Escape' && busy) {
			event.preventDefault();
			conductor?.stop();
		}
	}

	function showKeys(combo: string): void {
		try {
			replica?.animate(combo);
		} catch {
			// Not a combo the replica can play; the chip stays as text.
		}
	}

	async function undo(rev: number): Promise<void> {
		if (!conductor || undoing !== null) return;
		undoing = rev;
		try {
			await conductor.undo(rev);
		} finally {
			undoing = null;
		}
	}

	function openSettings(): void {
		settingsOpen = true;
	}

	function closeSettings(): void {
		settingsOpen = false;
		queueMicrotask(() => composer?.focus());
	}
</script>

<Panel as="section" variant="plate" padding="none" class={['agent', className]} aria-label="agent">
	{#snippet header()}
		<div class="agent__id">
			<Led state={led} blink={ledBlink} size="sm" />
			<h2 class="agent__title">agent</h2>
			{#if hasKey}<span class="agent__model">{modelLabel}</span>{/if}
		</div>
		<div class="agent__actions">
			{#if stateText}<span class="agent__state" aria-live="polite">{stateText}</span>{/if}
			{#if conductor && conductor.entries.length > 0 && !settingsOpen}
				<Button size="sm" variant="ghost" onclick={() => void conductor?.newThread()}>new</Button>
			{/if}
			<Button
				size="sm"
				variant="ghost"
				aria-expanded={settingsOpen}
				aria-controls="{uid}-body"
				onclick={() => (settingsOpen ? closeSettings() : openSettings())}
			>
				settings
			</Button>
		</div>
	{/snippet}

	<div class="agent__body" id="{uid}-body">
		<div class="agent__log">
			{#if settingsOpen}
				<KeySettings
					{keys}
					models={conductor?.models ?? modelOptions(null)}
					model={conductor?.model ?? DEFAULT_CONDUCTOR_MODEL}
					onmodel={(id) => conductor?.setModel(id)}
					onclose={closeSettings}
					onchange={onKeyChange}
					{keyStatus}
					manualLabel={conductor ? `${conductor.manualLabel}` : null}
				/>
			{:else if conductor && conductor.entries.length > 0}
				<Conversation
					entries={conductor.entries}
					running={busy}
					waiting={status === 'approval'}
					onkeys={replica ? showKeys : undefined}
					cite={(ref) => conductor?.citation(ref) ?? null}
					onretry={() => void conductor?.retry()}
					onsettings={openSettings}
				/>
			{:else}
				<div class="empty">
					<h3 class="empty__title">ask about your <span class="whitespace-nowrap">op-xy</span></h3>
					<p class="empty__text">
						It answers from the manual, shows you which keys to press on the replica, and can
						program the device for you. Changes to the device wait for your approval.
					</p>
					{#if keys.loaded && !hasKey}
						<div class="empty__cta">
							<Button variant="secondary" onclick={openSettings}>add your anthropic key</Button>
							<p class="empty__note">
								The agent runs in this browser with your own key. It is kept on this device and sent
								only to Anthropic.
							</p>
						</div>
					{:else if booting}
						<p class="empty__status">
							<Led state="white" blink="fast" size="sm" /> starting the agent
						</p>
					{:else if bootError}
						<p class="empty__status">
							<Led state="red" size="sm" /> The agent could not start: {bootError}
						</p>
					{/if}
					<ul class="empty__examples" aria-label="things you can ask">
						{#each EXAMPLES as example (example)}
							<li>
								{#if conductor}
									<button type="button" class="empty__example" onclick={() => send(example)}>
										{#if example.includes('shift + M1')}
											what does <Kbd combo="shift + M1" size="sm" /> do?
										{:else}
											{example}
										{/if}
									</button>
								{:else if example.includes('shift + M1')}
									what does <Kbd combo="shift + M1" size="sm" /> do?
								{:else}
									{example}
								{/if}
							</li>
						{/each}
					</ul>
					{#if conductor}
						<p class="empty__meta">
							<span
								><Led state={connected ? 'white' : 'off'} size="sm" />
								{connected
									? `op-xy connected${firmware ? `, os ${firmware}` : ''}`
									: 'no op-xy connected: answers only until you connect it'}</span
							>
							<span>manual: {conductor.manualLabel}</span>
						</p>
					{/if}
				</div>
			{/if}
		</div>

		{#if conductor && !settingsOpen}
			<div class="agent__dock">
				{#if conductor.todos.length > 0}<PlanView todos={conductor.todos} />{/if}
				{#if conductor.approval}
					<ApprovalSheet
						request={conductor.approval}
						ondecide={(decision) => conductor?.decide(decision)}
					/>
				{/if}
				{#if conductor.revisions.length > 0}
					<RevisionList
						revisions={conductor.revisions}
						blocker={(rev) => conductor?.undoBlocker(rev) ?? null}
						onundo={(rev) => void undo(rev)}
						{undoing}
					/>
				{/if}
			</div>
		{/if}

		<form class="composer" onsubmit={submit}>
			<label class="sr-only" for="{uid}-message">message to the agent</label>
			<textarea
				id="{uid}-message"
				class="composer__field"
				rows="1"
				placeholder={!keys.loaded
					? 'ask about a key, a page or a workflow'
					: !hasKey
						? 'add your anthropic key in settings to start'
						: busy
							? 'working… (escape to stop)'
							: 'ask about a key, a page or a workflow'}
				disabled={!conductor || settingsOpen}
				bind:value={draft}
				{@attach trackComposer}
				onkeydown={onKeyDown}></textarea>
			{#if busy}
				<IconButton
					type="button"
					label="stop"
					icon="stop"
					size="sm"
					onclick={() => conductor?.stop()}
				/>
			{:else}
				<IconButton
					type="submit"
					label="send"
					icon="arrow-up"
					variant={canSend ? 'primary' : 'key'}
					size="sm"
					disabled={!canSend}
				/>
			{/if}
		</form>
		<div class="agent__foot">
			<p class="agent__note">
				{#if !hasKey}
					Runs in your browser with your own Anthropic key.
				{:else if !connected}
					No OP-XY connected: device tools will ask you to connect it.
				{:else}
					Changes to your device always wait for your approval.
				{/if}
			</p>
			{#if conductor && conductor.usage.calls > 0}<CostMeter usage={conductor.usage} />{/if}
		</div>
	</div>
</Panel>

<style>
	.agent__id {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.agent__title {
		margin: 0;
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		font-weight: var(--xy-weight-regular);
	}

	.agent__model {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		white-space: nowrap;
	}

	.agent__actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.agent__state {
		padding-right: 0.25rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		white-space: nowrap;
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
		padding: 1.25rem 1rem 1rem;
		overscroll-behavior: contain;
	}

	.agent__dock {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0 0.75rem 0.5rem;
	}

	.agent__dock:empty {
		display: none;
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

	.empty__cta {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.625rem;
		margin-top: 1.25rem;
	}

	.empty__note,
	.empty__status {
		margin: 0;
		max-width: 30rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.empty__status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1.25rem;
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

	.empty__example {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.375rem;
		width: 100%;
		margin: -0.5rem -0.5rem;
		padding: 0.5rem;
		border: 0;
		border-radius: var(--xy-radius-tile);
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.empty__example:hover {
		background-color: var(--xy-hover);
		color: var(--xy-fg);
	}

	.empty__meta {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 1rem 0 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}

	.empty__meta span {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
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
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 0.75rem;
		padding: 0.625rem 1rem 0.875rem;
	}

	.agent__note {
		margin: 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}
</style>
