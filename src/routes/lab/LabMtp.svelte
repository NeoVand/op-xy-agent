<!--
@component
Read-only browser for the OP-XY's storage over MTP (WebUSB): put the unit in MTP mode (com → M4),
connect, walk its folders and download any file (a project, a sample, a preset's patch.json).
Nothing here writes to the device; disconnecting closes the session and the OP-XY returns to MIDI
by itself (docs/research/90-device-probe.md, session 1).
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Button, Legend } from '$lib/ui';
	import { ROOT, type DeviceInfo, type MtpEntry, type StorageInfo } from '$lib/core/mtp';
	import { MtpConnection, browserUsb } from '$lib/device';

	interface Folder {
		readonly handle: number;
		readonly name: string;
	}

	const usb = browserUsb();

	let connection = $state.raw<MtpConnection | null>(null);
	let info = $state.raw<DeviceInfo | null>(null);
	let storage = $state.raw<{ id: number; info: StorageInfo } | null>(null);
	let path = $state.raw<Folder[]>([]);
	let entries = $state.raw<MtpEntry[]>([]);
	let busy = $state(false);
	let error = $state<string | null>(null);

	// leaving the page ends the session, so the OP-XY goes back to MIDI
	onDestroy(() => void connection?.close());

	async function run(task: () => Promise<void>) {
		if (busy) return;
		busy = true;
		error = null;
		try {
			await task();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	const connect = () =>
		run(async () => {
			if (!usb) return;
			const next = await MtpConnection.request(usb);
			try {
				info = await next.session.deviceInfo();
				await next.session.open();
				const [id] = await next.session.storageIds();
				storage = { id, info: await next.session.storageInfo(id) };
				connection = next;
				await list([{ handle: ROOT, name: info.model || 'OP-XY' }]);
			} catch (e) {
				await next.close();
				throw e;
			}
		});

	async function list(trail: Folder[]) {
		if (!connection || !storage) return;
		entries = await connection.session.list(storage.id, trail.at(-1)?.handle ?? ROOT);
		path = trail;
	}

	const open = (trail: Folder[]) => run(() => list(trail));

	const download = (entry: MtpEntry) =>
		run(async () => {
			if (!connection) return;
			const bytes = await connection.session.read(entry.handle);
			const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>]));
			const link = document.createElement('a');
			link.href = url;
			link.download = entry.name;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		});

	const disconnect = () =>
		run(async () => {
			const closing = connection;
			connection = null;
			path = [];
			entries = [];
			await closing?.close();
		});

	function size(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
	}

	const sorted = $derived(
		[...entries].sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name))
	);
</script>

<div class="mtp">
	<div class="mtp__bar">
		{#if connection}
			<Button size="sm" {busy} onclick={disconnect}>disconnect</Button>
			<Legend size="xs" tone="subtle">
				{info?.manufacturer}
				{info?.model}
				{info?.deviceVersion} · {storage?.info.description}
				{storage ? `${size(storage.info.free)} free of ${size(storage.info.capacity)}` : ''}
			</Legend>
		{:else}
			<Button size="sm" disabled={!usb} {busy} onclick={connect}>connect over mtp</Button>
			<Legend size="xs" tone="subtle">
				{usb
					? 'First put the OP-XY in MTP mode: com, then M4. Its MIDI connection drops until you disconnect.'
					: 'This browser has no WebUSB (use Chrome or Edge).'}
			</Legend>
		{/if}
	</div>

	{#if error}
		<p class="mtp__error" role="alert">{error}</p>
	{/if}

	{#if connection && path.length > 0}
		<nav class="mtp__path" aria-label="folder path">
			{#each path as folder, i (folder.handle)}
				{#if i > 0}<span aria-hidden="true">/</span>{/if}
				<button
					type="button"
					class="mtp__link"
					aria-current={i === path.length - 1 ? 'location' : undefined}
					onclick={() => open(path.slice(0, i + 1))}>{folder.name}</button
				>
			{/each}
		</nav>
		{#if sorted.length === 0}
			<Legend as="p" size="sm" tone="subtle">This folder is empty.</Legend>
		{:else}
			<ul class="mtp__list">
				{#each sorted as entry (entry.handle)}
					<li>
						{#if entry.folder}
							<button
								type="button"
								class="mtp__link"
								onclick={() => open([...path, { handle: entry.handle, name: entry.name }])}
								>{entry.name}/</button
							>
						{:else}
							<button type="button" class="mtp__link" onclick={() => download(entry)}
								>{entry.name}</button
							>
							<span class="mtp__meta">{size(entry.size)}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<Legend as="p" size="2xs" tone="subtle">
		Read-only: device info, storage, listings and downloads. Nothing is written to the device.
	</Legend>
</div>

<style>
	.mtp {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.mtp__bar,
	.mtp__path {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem 0.75rem;
	}

	.mtp__path {
		gap: 0.375rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-sm);
	}

	.mtp__link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--xy-fg);
		font: inherit;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
		text-decoration-color: var(--xy-line-strong);
	}

	.mtp__link[aria-current='location'] {
		text-decoration: none;
		cursor: default;
	}

	.mtp__link:focus-visible {
		outline: 1.5px solid var(--xy-focus);
		outline-offset: 2px;
	}

	.mtp__list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--xy-text-sm);
	}

	.mtp__list li {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	.mtp__meta {
		color: var(--xy-fg-subtle);
		font-family: var(--xy-font-mono);
		font-size: var(--xy-text-xs);
	}

	.mtp__error {
		margin: 0;
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
	}
</style>
