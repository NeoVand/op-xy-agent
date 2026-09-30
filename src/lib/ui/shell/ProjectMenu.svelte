<!--
@component
The replica's project as the device's own `.xy` file (M6, `app/project-transfer`): a small
"project" key on the caption line opens a card to start a new project with the default sounds,
open a `.xy` from disk, load the project the OP-XY has open over USB (with the samples its tracks
use, `app/device-samples`), or add the replica's project to the OP-XY. The last one writes to the
device, so it says what it will add and waits for a second click. Its export row takes what you
made elsewhere (`app/export`): the song as a WAV, rendered through the replica's own sound, or as
MIDI for a DAW, and the project as the device's `.xy`.
-->
<script lang="ts">
	import { Folder01Icon } from '@hugeicons/core-free-icons';
	import { Button, IconButton, Legend, ToolButton } from '$lib/ui';
	import { getAppSimulator, getAppSound, getDeviceSamples, getSimPersistence } from '$lib/app';
	import { fileName, saveFile, songMidi, songScenes, songWav } from '$lib/app/export';
	import { PROJECT_NAME, ProjectTransfer } from '$lib/app/project-transfer.svelte';
	import { browserUsb } from '$lib/device';
	import blankUrl from '$lib/core/xy/fixtures/blank-1.1.4.xy?url';

	/** A context the app sets, or null outside it. */
	function optional<T>(get: () => T): T | null {
		try {
			return get();
		} catch {
			return null;
		}
	}

	const simulator = getAppSimulator();
	/** Saves the replica's work soon after a project change (absent outside the app). */
	const persistence = optional(getSimPersistence);
	/** The samples a project uses, read from the device with it (absent outside the app). */
	const samples = optional(getDeviceSamples);
	/** The replica's sound, whose samples a WAV renders with (absent outside the app). */
	const sound = optional(getAppSound);
	const transfer = simulator
		? new ProjectTransfer({
				sim: simulator.sim,
				usb: browserUsb(),
				blank: async () => new Uint8Array(await (await fetch(blankUrl)).arrayBuffer()),
				changed: () => persistence?.markDirty(),
				samples
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
		if (file) saveFile(file.bytes, file.name, 'application/octet-stream');
	}

	/** The WAV being rendered: how far it has got, or an error. */
	let rendering = $state<{ done: number; of: number } | null>(null);
	let exportError = $state<string | null>(null);

	function downloadMidi() {
		if (!simulator) return;
		const s = simulator.sim.state;
		saveFile(songMidi(s), fileName(s, 'song', 'mid'), 'audio/midi');
	}

	async function downloadWav() {
		if (!simulator || !sound || rendering) return;
		exportError = null;
		const s = simulator.sim.state;
		rendering = { done: 0, of: songScenes(s).length };
		try {
			const { renderOffline } = await import('$lib/sound/offline');
			const bytes = await songWav(s, (request) => renderOffline(request, sound.samples), {
				onProgress: (done, of) => (rendering = { done, of })
			});
			saveFile(bytes, fileName(s, 'song', 'wav'), 'audio/wav');
		} catch (error) {
			exportError = `could not render the song: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			rendering = null;
		}
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
		<ToolButton
			icon={Folder01Icon}
			label="project file"
			tip="project: new, open, download the song as audio or midi, load from or save to the op-xy"
			aria-expanded={open}
			aria-controls="project-card"
			onclick={() => (open = !open)}
		/>
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
					<Button size="sm" disabled={transfer.busy} onclick={() => transfer.newProject()}
						>new project</Button
					>
					<Button size="sm" busy={transfer.busy} onclick={openFile}>open .xy…</Button>
				</div>
				<!-- what you made, to take elsewhere -->
				<Legend as="p" size="2xs" tone="subtle">download what you made</Legend>
				<div class="project__row" role="group" aria-label="download">
					<Button
						size="sm"
						busy={rendering !== null}
						disabled={!sound?.available || rendering !== null}
						onclick={downloadWav}>song .wav</Button
					>
					<Button size="sm" onclick={downloadMidi}>song .mid</Button>
					<Button size="sm" disabled={transfer.busy} onclick={download}>project .xy</Button>
				</div>
				{#if rendering}
					<Legend as="p" size="2xs" tone="muted">
						rendering the song through the replica’s sound: scene {Math.min(
							rendering.done + 1,
							rendering.of
						)} of {rendering.of}
					</Legend>
				{/if}
				{#if exportError}
					<Legend as="p" size="2xs" tone="accent">{exportError}</Legend>
				{/if}
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
							<Button
								size="sm"
								variant="ghost"
								disabled={transfer.busy}
								onclick={() => transfer.undo()}>undo</Button
							>
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
		border: 1px solid var(--xy-line-float);
		border-radius: var(--xy-radius-card);
		background-color: var(--xy-surface-float);
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
		outline: none;
		border-color: var(--xy-fg-subtle);
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
