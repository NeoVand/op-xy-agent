<!--
@component
The agent's surface: a header with its status light, the conversation, the plan, the approval sheet,
the changes it sent (with undo), the composer and the cost meter.

The agent runs in this browser with the user's own Anthropic key (saved in local storage, sent only
to api.anthropic.com). Its code (the SDK, tools, manual index and conductor) loads lazily, once a key
is present. It reads the app's device stack and replica from context: without a connected OP-XY it
still teaches and animates the replica, and says plainly that device tools need a connection.

Each answer's changes light on the replica (`ChangeGlow`): the keys that lead to them breathe as
the answer ends, and pointing at its changes note holds them lit.

The panel is a fixed-height column: the conversation scrolls inside it and the composer always
stays in view. Files go to the agent from the [+] key (the device's own plus), by pasting (a
screenshot, say) or by dropping them anywhere on the page; they are read in the browser
(`attachments.ts`) and wait in a row above the composer until they go with the message.

In development builds `?transcripts=1` replays saved eval runs in the chat (`TranscriptViewer.dev.svelte`);
`?demo=1` plays a scripted run without a key (`demo.dev.ts`; `?demo=idle`
waits for you to ask); production builds drop that code.

Voice (M8): the mic key beside send talks to the agent through OpenAI's realtime model, with the
user's own OpenAI key; the voice hands every request to this conductor (`$lib/voice`). A strip
above the composer says what voice is doing while it is on.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		ArrowUp02Icon,
		PencilEdit02Icon,
		PlusSignIcon,
		Settings02Icon,
		StopIcon
	} from '@hugeicons/core-free-icons';
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
	import type { ProjectHost } from '$lib/agent/tools/define';
	import { ProjectTransfer } from '$lib/app/project-transfer.svelte';
	import blankUrl from '$lib/core/xy/fixtures/blank-1.1.4.xy?url';
	import { browserTimers, browserUsb } from '$lib/device';
	import { KeyStore, type KeyProvider } from '$lib/agent/keys.svelte';
	import { DEFAULT_CONDUCTOR_MODEL, modelOptions, profileFor } from '$lib/agent/models';
	import ApprovalSheet from '$lib/agent/ui/ApprovalSheet.svelte';
	import AttachmentChip from '$lib/agent/ui/AttachmentChip.svelte';
	import Conversation from '$lib/agent/ui/Conversation.svelte';
	import CostMeter from '$lib/agent/ui/CostMeter.svelte';
	import KeySettings from '$lib/agent/ui/KeySettings.svelte';
	import type { CitationTarget } from '$lib/agent/ui/MessageText.svelte';
	import ListenLight from '$lib/agent/ui/ListenLight.svelte';
	import PlanView from '$lib/agent/ui/PlanView.svelte';
	import RevisionList from '$lib/agent/ui/RevisionList.svelte';
	import { getDeviceStack } from '$lib/device/context';
	import type { AudioCapture } from '$lib/device/listen/capture.svelte';
	import type { DeviceStack } from '$lib/device/stack';
	import { getReplicaState } from '$lib/replica/context';
	import KeyCombo from '$lib/replica/glyphs/KeyCombo.svelte';
	import { ChangeGlow } from '$lib/replica/change-glow';
	import { replicaPointer } from '$lib/replica/glyphs/pointing';
	import type { ReplicaState } from '$lib/replica/state.svelte';
	import { VoiceSession } from '$lib/voice/session.svelte';
	import VoiceKey from '$lib/voice/ui/VoiceKey.svelte';
	import VoiceStrip from '$lib/voice/ui/VoiceStrip.svelte';
	import Button from '../Button.svelte';
	import HugeIcon from '../HugeIcon.svelte';
	import ToolButton from '../ToolButton.svelte';
	import { tooltip } from '../tooltip';
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
	/** Rings on the replica the keys the reader points at in an answer. */
	const pointer = replica ? replicaPointer(replica) : undefined;
	/** Lights on the replica what each answer changed. */
	const glow = replica ? new ChangeGlow({ replica, timers: browserTimers }) : null;
	const simulator = fromContext(getAppSimulator);
	const sound = fromContext(getAppSound);
	const persistence = fromContext(getSimPersistence);
	const guide = fromContext(getReplicaGuide);
	const presets = fromContext(getPresetInbox);
	/** The replica's project to the OP-XY over USB, for send_project (its own transfer, as the project key has). */
	const projects = ((): ProjectHost | null => {
		if (!simulator) return null;
		const transfer = new ProjectTransfer({
			sim: simulator.sim,
			usb: browserUsb(),
			blank: async () => new Uint8Array(await (await fetch(blankUrl)).arrayBuffer()),
			changed: () => persistence?.markDirty()
		});
		return {
			usb: transfer.usbAvailable,
			async saveToDevice(name) {
				const path = await transfer.saveToDevice(name);
				return path
					? { path, skipped: [...transfer.skipped] }
					: { error: transfer.error ?? 'the OP-XY did not take it' };
			}
		};
	})();
	const keys = new KeyStore();
	const uid = $props.id();

	let conductor = $state.raw<Conductor | null>(null);
	// The voice front end hands everything to whichever conductor is running. Nothing starts until
	// the mic key is pressed.
	const voice = new VoiceSession({ apiKey: () => keys.get('openai'), conductor: () => conductor });
	/** The agent's ears (the OP-XY's USB audio or the replica's sound); made with the agent's chunk. */
	let capture = $state.raw<AudioCapture | null>(null);
	let booting = $state(false);
	let bootError = $state<string | null>(null);
	let settingsOpen = $state(false);
	let keyStatus = $state<'unchecked' | 'checking' | 'valid' | 'invalid'>('unchecked');
	let draft = $state('');
	let undoing = $state<number | null>(null);
	/** A scripted demo run instead of the API (development builds only: always false otherwise). */
	let demo = $state(false);
	/** Saved eval runs replayed in the chat instead of it (development builds only). */
	let transcripts = $state(false);
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
				? ''
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
									: ''
	);

	/** A first taste of each thing the agent does: the manual, a walkthrough, a kit, a sound, a groove. */
	const EXAMPLES = [
		'what does shift + M1 do?',
		'walk me through setting the filter cutoff on track 3',
		'make a punchy 909 kit and play a house beat with it',
		'why does track 3 sound so dark?',
		'make the bass pump with the kick'
	];

	onMount(() => {
		keys.load();
		voice.load();
		const demoMode = import.meta.env.DEV ? new URLSearchParams(location.search).get('demo') : null;
		if (import.meta.env.DEV) transcripts = new URLSearchParams(location.search).has('transcripts');
		if (demoMode !== null) void bootDemo(demoMode !== 'idle');
		else if (keys.has('anthropic')) void boot();
		const stopGlow = glow?.start();
		return () => {
			stopGlow?.();
			voice.dispose();
			conductor?.dispose();
		};
	});

	// the last answer's changes breathe on the replica as it ends; a new message puts them out
	$effect(() => {
		const lit = conductor?.litChanges ?? null;
		untrack(() => (lit ? glow?.show(lit.changes) : glow?.clear()));
	});

	/** A changes note pointed at: its keys held lit on the replica (none for a taken-back turn). */
	function pointChanges(id: string | null): void {
		const entry = id ? conductor?.entries.find((e) => e.kind === 'changes' && e.id === id) : null;
		const live = entry?.kind === 'changes' && entry.undo !== 'undone';
		glow?.point(live ? (entry.changes ?? null) : null);
	}

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

	// a walkthrough the user finished: the agent says what they did and what comes next
	$effect(() => {
		const agent = conductor;
		if (!guide || !agent) return;
		return guide.onDone((goal, screen) => {
			void agent.followUp(
				`The user followed your walkthrough on the replica to its end (${goal}); its screen now shows: ${screen}. In a sentence or two, tell them what they just did and what it does, and offer one next step. Do not repeat the steps.`,
				`walkthrough done: ${goal}`
			);
		});
	});

	async function boot(): Promise<void> {
		const apiKey = keys.get('anthropic');
		if (!apiKey) return;
		demo = false;
		booting = true;
		bootError = null;
		keyStatus = 'unchecked';
		try {
			const { createBrowserConductor, createBrowserCapture } = await import('$lib/agent/runtime');
			conductor?.dispose();
			conductor = null;
			capture ??= createBrowserCapture(() => sound?.listenTap() ?? null);
			const next = await createBrowserConductor({
				apiKey,
				device,
				replica,
				simulator,
				sound,
				persistence,
				guide,
				presets,
				projects,
				listen: capture,
				samples: sound?.samples ?? null
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
		if (provider === 'openai') {
			// A new key clears "voice needs your key"; a removed one ends the call.
			if (keys.has('openai')) voice.dismiss();
			else voice.disconnect();
			return;
		}
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

	/**
	 * A manual citation as a link to our manual's page for the unit (and the fact), opened in a new
	 * tab so the conversation keeps its place.
	 */
	function manualCitation(ref: string): CitationTarget | null {
		const found = conductor?.citation(ref);
		if (!found) return null;
		const [unit, fact] = ref.trim().toLowerCase().split('#');
		const page = resolve('/manual/[id]', { id: unit });
		return { title: found.title, href: fact ? `${page}#${fact}` : page };
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

<Panel as="section" variant="device" padding="none" class={['agent', className]} aria-label="agent">
	{#snippet header()}
		<div class="agent__id">
			<!-- lit only while something happens: idle, the header stays quiet -->
			{#if ledBlink || led === 'red'}<Led state={led} blink={ledBlink} size="sm" />{/if}
			<h2 class="agent__title">agent</h2>
			<!-- The literal DEV check lets production builds drop this branch entirely. -->
			{#if import.meta.env.DEV && demo}
				<span class="agent__model">demo run</span>
			{:else if hasKey}
				<span class="agent__model">{modelLabel}</span>
			{/if}
		</div>
		<div class="agent__actions">
			{#if capture?.active}
				<ListenLight activity={capture.active} level={capture.level} />
			{:else if stateText}<span class="agent__state" aria-live="polite">{stateText}</span>{/if}
			{#if conductor && conductor.entries.length > 0 && !settingsOpen}
				<ToolButton
					icon={PencilEdit02Icon}
					label="new conversation"
					onclick={() => void conductor?.newThread()}
				/>
			{/if}
			<ToolButton
				icon={Settings02Icon}
				label="settings"
				aria-expanded={settingsOpen}
				aria-controls="{uid}-body"
				onclick={() => (settingsOpen ? closeSettings() : openSettings())}
			/>
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
						voiceModels={voice.models}
						voiceModel={voice.model}
						onvoicemodel={(id) => voice.setModel(id)}
					/>
				</div>
			{:else if import.meta.env.DEV && transcripts}
				<!-- The literal DEV check lets production builds drop the viewer and the runs it lists. -->
				{#await import('$lib/agent/ui/TranscriptViewer.dev.svelte') then viewer}
					<viewer.default
						onkeys={replica ? showKeys : undefined}
						onpoint={pointer}
						cite={manualCitation}
					/>
				{/await}
			{:else if conductor && conductor.entries.length > 0}
				<Conversation
					entries={conductor.entries}
					running={busy}
					activity={conductor.activity}
					onkeys={replica ? showKeys : undefined}
					onpoint={pointer}
					cite={manualCitation}
					onretry={() => void conductor?.retry()}
					onundochanges={(id) => void conductor?.undoTurn(id)}
					onpointchanges={glow ? pointChanges : undefined}
					onsettings={openSettings}
				/>
			{:else}
				<div class="agent__scroll empty">
					<h3 class="empty__title">ask about your <span class="whitespace-nowrap">op-xy</span></h3>
					<p class="empty__text">
						Answers from the manual, shows the keys on the replica, and programs your device when
						you say so. Sheet music and MIDI files work too.
					</p>
					{#if keys.loaded && !hasKey}
						<div class="empty__cta">
							<Button variant="secondary" onclick={openSettings}>add your anthropic key</Button>
							<p class="empty__note">Your key stays in this browser and goes only to Anthropic.</p>
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
											what does <KeyCombo keys="shift + M1" size="sm" onpoint={pointer} /> do?
										{:else}
											{example}
										{/if}
									</button>
								{:else if example.includes('shift + M1')}
									what does <KeyCombo keys="shift + M1" size="sm" onpoint={pointer} /> do?
								{:else}
									{example}
								{/if}
							</li>
						{/each}
					</ul>
					{#if conductor}
						<p class="empty__meta">
							{connected
								? `op-xy connected${firmware ? ` · os ${firmware}` : ''}`
								: 'no op-xy connected'}
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

		<!-- the deck: the panel's whole bottom as the device's black glass, typed into, with full
		     keys for attaching, speaking and sending -->
		<div class="deck">
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
			{#if voice.visible && !settingsOpen}
				<VoiceStrip {voice} claudeBusy={busy} onsettings={openSettings} />
			{/if}
			<form class="composer" onsubmit={submit}>
				<label class="sr-only" for="{uid}-message">message to the agent</label>
				<textarea
					id="{uid}-message"
					class="composer__field"
					rows="1"
					placeholder={busy
						? 'Working… (esc to stop)'
						: files.length > 0
							? 'Say what to do with it, or just send'
							: 'Ask anything'}
					disabled={!conductor || settingsOpen}
					bind:value={draft}
					{@attach trackComposer}
					onkeydown={onKeyDown}
					onpaste={onPaste}></textarea>
				<div class="composer__bar">
					<button
						type="button"
						class="round"
						aria-label="attach files"
						disabled={!canAttach}
						onclick={() => picker?.click()}
						{@attach tooltip('attach a photo, a PDF or a MIDI file')}
					>
						<HugeIcon icon={PlusSignIcon} size="1.125rem" strokeWidth={1.7} />
					</button>
					<span class="composer__gap"></span>
					<VoiceKey {voice} variant="round" disabled={!conductor || settingsOpen} />
					{#if busy}
						<button
							type="button"
							class="round round--solid"
							aria-label="stop"
							onclick={() => conductor?.stop()}
						>
							<HugeIcon icon={StopIcon} size="1rem" strokeWidth={2} />
						</button>
					{:else}
						<button type="submit" class="round round--solid" aria-label="send" disabled={!canSend}>
							<HugeIcon icon={ArrowUp02Icon} size="1.125rem" strokeWidth={2} />
						</button>
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
			{#if conductor && conductor.usage.calls > 0}
				<div class="deck__cost"><CostMeter usage={conductor.usage} /></div>
			{/if}
		</div>
		{#if dragging}
			<div class="agent__drop" aria-hidden="true">
				<span><Led state="white" blink="breathe" size="sm" /> drop files for the agent</span>
			</div>
		{/if}
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
		margin: 1rem 0 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
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

	/* The foot of the panel: attachments, the voice strip and the composer. */
	.deck {
		display: flex;
		flex: none;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem 0.75rem;
	}

	.deck .files {
		margin: 0;
	}

	.deck__cost {
		display: flex;
		justify-content: flex-end;
	}

	/* One rounded well in the panel, the app's background colour: typed into, its keys inside it. */
	.composer {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem 0.5rem 0.4375rem;
		border-radius: 1.25rem;
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg);
		box-shadow: inset 0 0 0 1px var(--xy-line);
		transition: box-shadow var(--xy-dur-quick, 120ms) ease;
	}

	.composer:focus-within {
		box-shadow: inset 0 0 0 1px var(--xy-line-strong);
	}

	.composer__field {
		width: 100%;
		min-height: 2.25rem;
		max-height: 12rem;
		padding: 0.375rem 0.5rem;
		border: 0;
		background: none;
		color: var(--xy-fg);
		font: inherit;
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		resize: none;
		field-sizing: content;
		caret-color: var(--xy-fg);
	}

	.composer__field:focus,
	.composer__field:focus-visible {
		outline: none;
	}

	.composer__field::placeholder {
		color: var(--xy-fg-subtle);
	}

	.composer__field:disabled {
		cursor: not-allowed;
	}

	.composer__bar {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.composer__gap {
		flex: 1;
	}

	.round {
		display: inline-grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--xy-fg-subtle);
		cursor: pointer;
		transition:
			color var(--xy-dur-quick, 120ms) ease,
			background-color var(--xy-dur-quick, 120ms) ease;
	}

	.round:hover:not(:disabled) {
		background-color: var(--xy-hover);
		color: var(--xy-fg);
	}

	/* send and stop: the one solid key, warm white on the black */
	.round--solid {
		background-color: var(--xy-fg);
		color: var(--xy-bg);
	}

	.round--solid:hover:not(:disabled) {
		background-color: #ffffff;
		color: var(--xy-bg);
	}

	.round:focus-visible {
		outline: 1.5px solid var(--xy-focus);
		outline-offset: 1px;
	}

	.round:disabled {
		cursor: not-allowed;
		opacity: 0.35;
	}
</style>
