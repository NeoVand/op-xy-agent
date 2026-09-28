<!--
@component
The replica's project as the device's own `.xy` file (M6, `app/project-transfer`): a small
"project" key on the caption line opens a card to open a `.xy` from disk, download the project as
one, load the project the OP-XY has open over USB, or add the replica's project to the OP-XY. The
last one writes to the device, so it says what it will add and waits for a second click.
-->
<script lang="ts">
	import { Button, IconButton, Led, Legend } from '$lib/ui';
	import { getAppSimulator } from '$lib/app';
	import { PROJECT_NAME, ProjectTransfer } from '$lib/app/project-transfer.svelte';
	import { browserUsb } from '$lib/device';
	import blankUrl from '$lib/core/xy/fixtures/blank-1.1.4.xy?url';

	const simulator = getAppSimulator();
	const transfer = simulator
		? new ProjectTransfer({
				sim: simulator.sim,
				usb: browserUsb(),
				blank: async () => new Uint8Array(await (await fetch(blankUrl)).arrayBuffer())
			})
		: null;

	let open = $state(false);
	let saving = $state(false);
	let name = $state('');
	const nameOk = $derived(PROJECT_NAME.test(name));
	const projectName = $derived(simulator?.sim.state.project.name ?? '');

	function openFile() {
		const picker = document.createElement('input');
		picker.type = 'file';
		picker.accept = '.xy';
		picker.onchange = () => {
			const file = picker.files?.[0];
			if (file) void transfer?.openFile(file);
		};
		picker.click();
	}

	async function download() {
		const file = await transfer?.download();
		if (!file) return;
		const url = URL.createObjectURL(new Blob([file.bytes as Uint8Array<ArrayBuffer>]));
		const link = document.createElement('a');
		link.href = url;
		link.download = file.name;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function startSave() {
		name = projectName
			.toLowerCase()
			.replace(/[^a-z0-9 #()_-]+/g, ' ')
			.trim()
			.slice(0, 24);
		saving = true;
	}

	async function save() {
		if (await transfer?.saveToDevice(name)) saving = false;
	}
</script>

{#if transfer}
	<div class="project">
		<button
			type="button"
			class="project__key"
			aria-expanded={open}
			aria-controls="project-card"
			onclick={() => (open = !open)}
		>
			<Led state={open ? 'white' : 'off'} size="sm" />
			project
		</button>
		{#if open}
			<div class="project__card" id="project-card" role="group" aria-label="project file">
				<div class="project__head">
					<Legend size="xs" tone="fg">{projectName || 'project'}</Legend>
					<IconButton
						size="sm"
						variant="ghost"
						icon="close"
						label="close"
						onclick={() => (open = false)}
					/>
				</div>
				<div class="project__row">
					<Button size="sm" busy={transfer.busy} onclick={openFile}>open .xy…</Button>
					<Button size="sm" disabled={transfer.busy} onclick={download}>download .xy</Button>
				</div>
				{#if transfer.usbAvailable}
					<Legend as="p" size="2xs" tone="subtle">
						over usb: first put the op-xy in mtp mode (com, then M4)
					</Legend>
					<div class="project__row">
						<Button size="sm" disabled={transfer.busy} onclick={() => transfer.loadFromDevice()}
							>load from the op-xy</Button
						>
						<Button size="sm" disabled={transfer.busy} onclick={startSave}
							>save to the op-xy…</Button
						>
					</div>
					{#if saving}
						<label class="project__field">
							<Legend as="span" size="2xs" tone="muted">name on the device</Legend>
							<input class="project__input" bind:value={name} maxlength="24" spellcheck="false" />
						</label>
						<Legend as="p" size="2xs" tone="muted">
							Adds <code>projects/user/{name || '…'}.xy</code> to your OP-XY, written over the project
							it has open, so its sounds stay. Nothing on the device is replaced. Not yet tried on a unit:
							back your projects up first.
						</Legend>
						<div class="project__row">
							<Button size="sm" busy={transfer.busy} disabled={!nameOk} onclick={save}>save</Button>
							<Button size="sm" variant="ghost" onclick={() => (saving = false)}>cancel</Button>
						</div>
					{/if}
				{/if}
				{#if transfer.message}
					<div class="project__row">
						<Legend size="2xs" tone="fg">{transfer.message}</Legend>
						{#if transfer.canUndo}
							<Button size="sm" variant="ghost" onclick={() => transfer.undo()}>undo</Button>
						{/if}
					</div>
				{/if}
				{#if transfer.error}
					<Legend as="p" size="2xs" tone="accent">{transfer.error}</Legend>
				{/if}
				{#if transfer.skipped.length > 0}
					<details class="project__skipped">
						<summary
							>{transfer.skipped.length}
							{transfer.skipped.length === 1 ? 'thing' : 'things'} the file and the replica do not share</summary
						>
						<ul>
							{#each transfer.skipped as line (line)}
								<li>{line}</li>
							{/each}
						</ul>
					</details>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.project {
		position: relative;
	}

	.project__key {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		margin: -0.125rem -0.25rem;
		padding: 0.125rem 0.25rem;
		border: 0;
		border-radius: var(--xy-radius-tile);
		background: none;
		color: inherit;
		font: inherit;
		letter-spacing: inherit;
		cursor: pointer;
	}

	.project__key:hover,
	.project__key:focus-visible,
	.project__key[aria-expanded='true'] {
		color: var(--xy-fg);
	}

	.project__key:focus-visible {
		outline: 2px solid var(--xy-focus);
		outline-offset: 1px;
	}

	.project__card {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.5rem);
		z-index: var(--xy-z-overlay);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 22rem;
		padding: 0.75rem;
		border: 1px solid var(--xy-line);
		border-radius: var(--xy-radius-card);
		background-color: var(--xy-surface-raised);
		box-shadow: var(--xy-shadow-float);
		color: var(--xy-fg-muted);
		letter-spacing: normal;
	}

	.project__head,
	.project__row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.project__head {
		justify-content: space-between;
	}

	.project__field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.project__input {
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--xy-line-control);
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg);
		font: inherit;
		font-size: var(--xy-text-sm);
	}

	.project__input:focus-visible {
		outline: 2px solid var(--xy-focus);
		outline-offset: 1px;
	}

	.project__skipped {
		font-size: var(--xy-text-2xs);
	}

	.project__skipped summary {
		cursor: pointer;
	}

	.project__skipped ul {
		margin: 0.375rem 0 0;
		padding-left: 1rem;
		max-height: 8rem;
		overflow: auto;
	}

	code {
		font-family: var(--xy-font-mono);
	}
</style>
