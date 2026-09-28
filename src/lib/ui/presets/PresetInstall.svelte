<!--
@component
Puts the built preset on a connected OP-XY over USB (MTP through WebUSB, Chrome and Edge). Two
steps: the page first says exactly what will be added and where (`presets/<folder>/<name>.preset`)
and waits for the owner's click; only then does it connect and write. It only adds: a preset already
there is refused, nothing is deleted or replaced (`core/mtp` policy). Closing the session sends the
OP-XY back to MIDI by itself.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Button, Legend } from '$lib/ui';
	import { PRESET_FOLDER, installPreset, type PresetFiles } from '$lib/core/mtp';
	import { MtpConnection, browserUsb } from '$lib/device';

	interface Props {
		/** Builds the preset to install (null when there is nothing to build). */
		build: () => Promise<PresetFiles | null>;
		disabled?: boolean;
	}

	let { build, disabled = false }: Props = $props();

	const usb = browserUsb();

	let step = $state<'idle' | 'confirm' | 'working' | 'done'>('idle');
	let folder = $state('mine');
	let pending = $state.raw<PresetFiles | null>(null);
	let progress = $state('');
	let installed = $state('');
	let error = $state<string | null>(null);
	let connection: MtpConnection | null = null;

	onDestroy(() => void connection?.close());

	const folderOk = $derived(PRESET_FOLDER.test(folder));
	const total = $derived(pending ? pending.files.reduce((n, f) => n + f.bytes.length, 0) : 0);

	async function prepare() {
		error = null;
		pending = await build();
		if (pending) step = 'confirm';
	}

	async function install() {
		if (!usb || !pending) return;
		step = 'working';
		error = null;
		progress = 'connecting';
		try {
			// the first await: the browser's device prompt needs this click
			connection = await MtpConnection.request(usb);
			await connection.session.open();
			connection.session.allowWrites();
			installed = await installPreset(connection.session, pending, folder, (p) => {
				progress = p.file ? `writing ${p.file} (${p.done + 1} of ${p.total})` : 'finishing';
			});
			step = 'done';
			pending = null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			step = 'confirm';
		} finally {
			const closing = connection;
			connection = null;
			await closing?.close().catch(() => {});
		}
	}

	function cancel() {
		step = 'idle';
		pending = null;
		error = null;
	}

	const kilobytes = (bytes: number) =>
		bytes < 1024 * 1024
			? `${Math.ceil(bytes / 1024)} KB`
			: `${(bytes / 1024 / 1024).toFixed(1)} MB`;
</script>

{#if usb}
	<div class="install">
		<Legend as="h3" size="xs">install over usb</Legend>
		{#if step === 'idle' || step === 'done'}
			{#if step === 'done'}
				<Legend as="p" size="xs" tone="fg">
					Installed as <code>{installed}</code>. The OP-XY is back in MIDI mode, and the preset is
					in its preset browser under “{folder}”.
				</Legend>
			{/if}
			<Button size="sm" {disabled} onclick={prepare}>install on the op-xy…</Button>
		{:else if pending}
			<Legend as="p" size="xs" tone="muted">
				Adds {pending.files.length} files ({kilobytes(total)}) as
				<code>presets/{folder}/{pending.folder}</code>. Nothing on the device is deleted or
				replaced. First put the OP-XY in MTP mode: <code>com</code>, then <code>M4</code>.
			</Legend>
			<label class="field">
				<Legend as="span" size="xs" tone="muted">folder on the device</Legend>
				<input
					class="field__input"
					bind:value={folder}
					maxlength="7"
					spellcheck="false"
					disabled={step === 'working'}
				/>
			</label>
			{#if !folderOk}
				<Legend size="xs" tone="accent">up to 7 lowercase letters, digits, spaces or dashes</Legend>
			{/if}
			<div class="install__actions">
				<Button size="sm" busy={step === 'working'} disabled={!folderOk} onclick={install}
					>install</Button
				>
				<Button size="sm" variant="ghost" disabled={step === 'working'} onclick={cancel}
					>cancel</Button
				>
			</div>
			{#if step === 'working'}
				<Legend size="xs" tone="subtle">{progress}</Legend>
			{/if}
		{/if}
		{#if error}
			<Legend as="p" size="xs" tone="accent">{error}</Legend>
		{/if}
	</div>
{/if}

<style>
	.install,
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field {
		gap: 0.25rem;
	}

	.field__input {
		min-width: 0;
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--xy-line-control);
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg);
		font: inherit;
		font-size: var(--xy-text-sm);
	}

	.field__input:focus-visible {
		outline: 2px solid var(--xy-focus);
		outline-offset: 1px;
	}

	.install__actions {
		display: flex;
		gap: 0.5rem;
	}

	code {
		font-family: var(--xy-font-mono);
	}
</style>
