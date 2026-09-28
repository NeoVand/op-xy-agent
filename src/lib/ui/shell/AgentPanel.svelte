<!--
@component
The agent's surface: a header with its status light, the conversation, the plan, the approval sheet,
the changes it sent (with undo), the composer and the cost meter.

The agent runs in this browser with the user's own Anthropic key (saved in local storage, sent only
to api.anthropic.com). Its code (the SDK, tools, manual index and conductor) loads lazily, once a key
is present. It reads the app's device stack and replica from context: without a connected OP-XY it
still teaches and animates the replica, and says plainly that device tools need a connection.

The panel is a fixed-height column: the conversation scrolls inside it and the composer always
stays in view. Files go to the agent from the [+] key (the device's own plus), by pasting (a
screenshot, say) or by dropping them anywhere on the page; they are read in the browser
(`attachments.ts`) and wait in a row above the composer until they go with the message.

In development builds `?demo=1` plays a scripted run without a key (`demo.dev.ts`; `?demo=idle`
waits for you to ask); production builds drop that code.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { getReplicaGuide } from '$lib/app/guide.svelte';
	import { getPresetInbox } from '$lib/app/preset-inbox.svelte';
	import { getSimPersistence } from '$lib/app/persistence';
	import { getAppSimulator } from '$lib/app/simulator.svelte';
	import { getAppSound } from '$lib/app/sound.svelte';
	import {
		ATTACHMENT_ACCEPT,
		ATTACHMENT_LIMITS,
		AttachmentError,
		attachmentId,
		attachmentKind,
		prepareAttachment,
		type AttachmentKind,
		type PreparedAttachment
	} from '$lib/agent/attachments';
	import type { Conductor } from '$lib/agent/conductor.svelte';
	import { KeyStore, type KeyProvider } from '$lib/agent/keys.svelte';
	import { DEFAULT_CONDUCTOR_MODEL, modelOptions, profileFor } from '$lib/agent/models';
	import ApprovalSheet from '$lib/agent/ui/ApprovalSheet.svelte';
	import AttachmentChip from '$lib/agent/ui/AttachmentChip.svelte';
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
	const simulator = fromContext(getAppSimulator);
	const sound = fromContext(getAppSound);
	const persistence = fromContext(getSimPersistence);
	const guide = fromContext(getReplicaGuide);
	const presets = fromContext(getPresetInbox);
	const keys = new KeyStore();
	const uid = $props.id();

	let conductor = $state.raw<Conductor | null>(null);
	let booting = $state(false);
	let bootError = $state<string | null>(null);
	let settingsOpen = $state(false);
	let keyStatus = $state<'unchecked' | 'checking' | 'valid' | 'invalid'>('unchecked');
	let draft = $state('');
	let undoing = $state<number | null>(null);
	/** A scripted demo run instead of the API (development builds only: always false otherwise). */
	let demo = $state(false);
	let composer: HTMLTextAreaElement | null = null;

	/** A file in the composer: being read, ready to go, or refused. */
	interface PendingFile {
		readonly key: string;
		readonly name: string;
		readonly kind: AttachmentKind | null;
		readonly status: 'reading' | 'ready' | 'error';
		readonly detail?: string;
		readonly thumb?: string;
		readonly error?: string;
	}

	let files = $state.raw<PendingFile[]>([]);
	/** What the ready files send (kept out of reactive state: it holds the file data). */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const prepared = new Map<string, PreparedAttachment>();
	/** A problem with the files as a whole (too many, conversation too large…). */
	let fileNote = $state<string | null>(null);
	/** Files are being dragged over the page. */
	let dragging = $state(false);
	let dragDepth = 0;
	let picker: HTMLInputElement | null = null;

	/** Remembers the hidden file input behind the [+] key. */
	function trackPicker(node: HTMLInputElement): () => void {
		picker = node;
		return () => {
			picker = null;
		};
	}

	/** Remembers the composer so closing the settings can return focus to it. */
	function trackComposer(node: HTMLTextAreaElement): () => void {
		composer = node;
		return () => {
			composer = null;
		};
	}

	const hasKey = $derived((import.meta.env.DEV && demo) || (keys.loaded && keys.has('anthropic')));
	const status = $derived(conductor?.status ?? 'idle');
	const busy = $derived(conductor?.busy ?? false);
	const reading = $derived(files.some((file) => file.status === 'reading'));
	const readyCount = $derived(files.filter((file) => file.status === 'ready').length);
	const canSend = $derived(
		conductor !== null && !busy && !reading && (draft.trim().length > 0 || readyCount > 0)
	);
	const canAttach = $derived(conductor !== null && !settingsOpen);
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
		booting || status === 'running' ? 'breathe' : status === 'approval' ? 'slow' : false
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
		'walk me through setting the filter cutoff on track 3',
		'make the bass pump with the kick',
		'build a little house loop and play it'
	];

	onMount(() => {
		keys.load();
		const demoMode = import.meta.env.DEV ? new URLSearchParams(location.search).get('demo') : null;
		if (demoMode !== null) void bootDemo(demoMode !== 'idle');
		else if (keys.has('anthropic')) void boot();
		return () => conductor?.dispose();
	});

	/** Development only: a conductor on a paced fake API, optionally asking its question at once. */
	async function bootDemo(autoplay: boolean): Promise<void> {
		// Keep the import inside this `if`: Vite replaces import.meta.env.DEV with false in production
		// builds, which drops the branch and the demo module with it.
		if (import.meta.env.DEV) {
			demo = true;
			booting = true;
			bootError = null;
			try {
				const { createDemoConductor, DEMO_QUESTION } = await import('$lib/agent/demo.dev');
				conductor?.dispose();
				conductor = await createDemoConductor(replica);
				keyStatus = 'valid';
				if (autoplay) void conductor.send(DEMO_QUESTION);
			} catch (error) {
				bootError = error instanceof Error ? error.message : String(error);
			} finally {
				booting = false;
			}
		}
	}

	async function boot(): Promise<void> {
		const apiKey = keys.get('anthropic');
		if (!apiKey) return;
		demo = false;
		booting = true;
		bootError = null;
		keyStatus = 'unchecked';
		try {
			const { createBrowserConductor } = await import('$lib/agent/runtime');
			conductor?.dispose();
			conductor = null;
			const next = await createBrowserConductor({
				apiKey,
				device,
				replica,
				simulator,
				sound,
				persistence,
				guide,
				presets
			});
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
		if (!canSend || !conductor) return;
		const attachments = files.flatMap((file) => {
			const ready = file.status === 'ready' ? prepared.get(file.key) : undefined;
			return ready ? [ready] : [];
		});
		const problem = conductor.attachmentProblem(attachments);
		if (problem) {
			fileNote = problem;
			return;
		}
		const text = draft;
		draft = '';
		files = [];
		prepared.clear();
		fileNote = null;
		void conductor.send(text, attachments);
	}

	function updateFile(key: string, changes: Partial<PendingFile>): void {
		files = files.map((file) => (file.key === key ? { ...file, ...changes } : file));
	}

	/** Reads files into the composer (at most the per-message limit). */
	function addFiles(list: Iterable<File>): void {
		if (!canAttach) return;
		fileNote = null;
		let incoming = [...list];
		const room = ATTACHMENT_LIMITS.perMessage - files.length;
		if (incoming.length > room) {
			fileNote = `Up to ${ATTACHMENT_LIMITS.perMessage} files per message.`;
			incoming = incoming.slice(0, Math.max(0, room));
		}
		for (const file of incoming) {
			const key = attachmentId();
			const name = file.name || 'pasted image';
			files = [...files, { key, name, kind: attachmentKind(name, file.type), status: 'reading' }];
			prepareAttachment(file, key).then(
				(ready) => {
					if (!files.some((f) => f.key === key)) return; // removed while it was read
					prepared.set(key, ready);
					updateFile(key, { status: 'ready', detail: ready.view.detail, thumb: ready.view.thumb });
				},
				(error: unknown) => {
					updateFile(key, {
						status: 'error',
						error: error instanceof AttachmentError ? error.message : `${name} could not be read.`
					});
				}
			);
		}
		composer?.focus();
	}

	function removeFile(key: string): void {
		files = files.filter((file) => file.key !== key);
		prepared.delete(key);
		fileNote = null;
		composer?.focus();
	}

	function onPick(event: Event & { currentTarget: HTMLInputElement }): void {
		const input = event.currentTarget;
		if (input.files) addFiles(input.files);
		input.value = ''; // so the same file can be picked again
	}

	/** A pasted picture (a screenshot, say) becomes an attachment; pasted text stays text. */
	function onPaste(event: ClipboardEvent): void {
		const pasted = [...(event.clipboardData?.files ?? [])];
		if (pasted.length === 0) return;
		if (!event.clipboardData?.types.includes('text/plain')) event.preventDefault();
		addFiles(pasted);
	}

	const draggingFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

	// Files dropped anywhere on the page go to the agent; a stray drop never navigates away.
	function onDragEnter(event: DragEvent): void {
		if (!draggingFiles(event)) return;
		event.preventDefault();
		dragDepth++;
		dragging = canAttach;
	}

	function onDragOver(event: DragEvent): void {
		if (!draggingFiles(event)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = canAttach ? 'copy' : 'none';
	}

	function onDragLeave(event: DragEvent): void {
		if (!draggingFiles(event)) return;
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) dragging = false;
	}

	function onDrop(event: DragEvent): void {
		if (!draggingFiles(event)) return;
		event.preventDefault();
		dragDepth = 0;
		dragging = false;
		if (canAttach && event.dataTransfer) addFiles(event.dataTransfer.files);
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

<svelte:window
	ondragenter={onDragEnter}
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
/>

<Panel as="section" variant="plate" padding="none" class={['agent', className]} aria-label="agent">
	{#snippet header()}
		<div class="agent__id">
			<Led state={led} blink={ledBlink} size="sm" />
			<h2 class="agent__title">agent</h2>
			<!-- The literal DEV check lets production builds drop this branch entirely. -->
			{#if import.meta.env.DEV && demo}
				<span class="agent__model">demo run</span>
			{:else if hasKey}
				<span class="agent__model">{modelLabel}</span>
			{/if}
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
				<div class="agent__scroll">
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
				</div>
			{:else if conductor && conductor.entries.length > 0}
				<Conversation
					entries={conductor.entries}
					running={busy}
					activity={conductor.activity}
					onkeys={replica ? showKeys : undefined}
					cite={(ref) => conductor?.citation(ref) ?? null}
					onretry={() => void conductor?.retry()}
					onsettings={openSettings}
				/>
			{:else}
				<div class="agent__scroll empty">
					<h3 class="empty__title">ask about your <span class="whitespace-nowrap">op-xy</span></h3>
					<p class="empty__text">
						It answers from the manual, shows you which keys to press on the replica, and can
						program the device for you. Changes to the device wait for your approval. Give it a
						photo of sheet music, a PDF score or a MIDI file and it can play it for you.
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
							<Led state="white" blink="breathe" size="sm" /> starting the agent
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

		{#if files.length > 0 || fileNote}
			<div class="files">
				{#if files.length > 0}
					<ul class="files__list" aria-label="files to send">
						{#each files as file (file.key)}
							<li>
								<AttachmentChip
									name={file.name}
									kind={file.kind}
									detail={file.detail}
									thumb={file.thumb}
									status={file.status}
									error={file.error}
									onremove={() => removeFile(file.key)}
								/>
							</li>
						{/each}
					</ul>
				{/if}
				{#if fileNote}
					<p class="files__note" role="status"><Led state="red" size="sm" /> {fileNote}</p>
				{/if}
			</div>
		{/if}
		<form class="composer" onsubmit={submit}>
			<div class="composer__row">
				<IconButton
					type="button"
					label="attach files"
					icon="plus"
					size="sm"
					disabled={!canAttach}
					onclick={() => picker?.click()}
				/>
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
								: files.length > 0
									? 'say what to do with it, or just send'
									: 'ask about a key, a page or a workflow'}
					disabled={!conductor || settingsOpen}
					bind:value={draft}
					{@attach trackComposer}
					onkeydown={onKeyDown}
					onpaste={onPaste}></textarea>
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
			</div>
			<input
				{@attach trackPicker}
				class="sr-only"
				type="file"
				multiple
				accept={ATTACHMENT_ACCEPT}
				tabindex="-1"
				aria-hidden="true"
				onchange={onPick}
			/>
		</form>
		{#if dragging}
			<div class="agent__drop" aria-hidden="true">
				<span><Led state="white" blink="breathe" size="sm" /> drop files for the agent</span>
			</div>
		{/if}
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

	/* A column of fixed height (the panel's): only the log in the middle scrolls. */
	.agent__body {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	/* While files are dragged over the page: the whole panel is the target. */
	.agent__drop {
		position: absolute;
		inset: 0.5rem;
		z-index: var(--xy-z-overlay);
		display: grid;
		place-items: center;
		border: 1px dashed var(--xy-fg-muted);
		border-radius: var(--xy-radius-tile);
		background-color: color-mix(in srgb, var(--xy-surface) 90%, transparent);
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		pointer-events: none;
	}

	.agent__drop span {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* The log takes the room left; what it shows scrolls by itself (the conversation is its own
	 * scroll area, so it can pin its status line and "latest" key to the bottom). */
	.agent__log {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.agent__scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 1.25rem 1rem 1rem;
		overscroll-behavior: contain;
	}

	/* Plan, approval and changes stay above the composer; past half the panel they scroll. */
	.agent__dock {
		display: flex;
		flex-direction: column;
		flex: none;
		gap: 0.5rem;
		max-height: 50%;
		overflow-y: auto;
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

	/* Files waiting to go, in a row above the composer (it wraps; it never scrolls). */
	.files {
		display: flex;
		flex: none;
		flex-direction: column;
		gap: 0.375rem;
		margin: 0 0.75rem 0.5rem;
	}

	.files__list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Two tiles to a row. */
	.files__list li {
		flex: 0 0 calc(50% - 0.1875rem);
		min-width: 0;
	}

	.files__note {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin: 0;
		padding: 0 0.25rem;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.files__note :global(.led) {
		flex: none;
		align-self: center;
	}

	.composer {
		display: flex;
		flex: none;
		flex-direction: column;
		margin: 0 0.75rem;
		padding: 0.375rem;
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

	.composer__row {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.composer__field {
		flex: 1;
		min-height: 2.25rem;
		max-height: 10rem;
		padding: 0.5rem 0.125rem;
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
		flex: none;
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
