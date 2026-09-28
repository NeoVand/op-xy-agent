<!--
@component
Turns recordings into an OP-XY sample preset (docs/research/30-presets-samples.md): pick a drum
kit, a multisample or a synth sampler, drop audio files, check where each lands (a drum key, or a
root note and its zone), and download the `.preset` folder zipped, ready for Field Kit or the
device's `presets/` folder over MTP. Everything runs in the browser; nothing is uploaded or sent to
a device.
-->
<script lang="ts">
	import { Button, IconButton, Legend, Switch } from '$lib/ui';
	import {
		DRUM_FIRST_KEY,
		DRUM_KEYS,
		DRUM_LAYOUT,
		MAX_ZONES,
		buildPreset,
		detectNote,
		drumKeys,
		noteFromName,
		noteName,
		zipPreset,
		type LoopMode,
		type PcmAudio,
		type PresetKind
	} from '$lib/core/presets';
	import { decodeAudioFile } from './decode';

	interface Item {
		readonly id: number;
		readonly name: string;
		readonly audio: PcmAudio;
		/** The root found in the file (smpl, name or pitch), before any change by the user. */
		readonly found: number | null;
		/** The user's root note, over the found one. */
		root: number | null;
		/** The user's drum key, over the automatic layout. */
		key: number | null;
	}

	const KINDS: readonly { id: PresetKind; label: string; hint: string }[] = [
		{ id: 'drum', label: 'drum kit', hint: 'up to 24 hits on the keys f3–e5' },
		{ id: 'multisampler', label: 'multisample', hint: 'up to 24 notes of one instrument' },
		{ id: 'sampler', label: 'synth sampler', hint: 'one sound across the keyboard' }
	];
	const LOOPS: readonly { id: LoopMode; label: string }[] = [
		{ id: 'forever', label: 'loop forever' },
		{ id: 'release', label: 'loop until release' },
		{ id: 'off', label: 'no loop' }
	];
	/** Root notes a zone can take, A0 to C8 (the piano's range). */
	const NOTES = Array.from({ length: 88 }, (_, i) => 21 + i);

	let kind = $state<PresetKind>('drum');
	let name = $state('');
	let trim = $state(true);
	let normalize = $state(false);
	let loop = $state<LoopMode>('forever');
	let items = $state<Item[]>([]);
	let busy = $state(false);
	let dragging = $state(false);
	let problems = $state<string[]>([]);
	let warnings = $state<string[]>([]);
	let playing = $state<number | null>(null);
	let nextId = 0;

	const limit = $derived(kind === 'sampler' ? 1 : kind === 'drum' ? DRUM_KEYS : MAX_ZONES);
	const keys = $derived(
		kind === 'drum'
			? drumKeys(items.map((item) => ({ name: item.name, key: item.key ?? undefined })))
			: []
	);
	/** Samplers: the root each sample plays at, the user's over the found one. */
	const roots = $derived(kind === 'drum' ? [] : items.map((item) => item.root ?? item.found));
	const presetName = $derived(name.trim() || (items[0]?.name.replace(/\.[^.]+$/, '') ?? ''));

	async function add(files: FileList | File[]) {
		problems = [];
		warnings = [];
		busy = true;
		try {
			for (const file of Array.from(files)) {
				try {
					const audio = await decodeAudioFile(file);
					const found = audio.root ?? noteFromName(file.name) ?? detectNote(audio);
					items.push({ id: nextId++, name: file.name, audio, found, root: null, key: null });
				} catch {
					problems.push(`${file.name}: not an audio file this browser can read`);
				}
			}
		} finally {
			busy = false;
		}
	}

	function remove(id: number) {
		items = items.filter((item) => item.id !== id);
		if (playing === id) stop();
	}

	let context: AudioContext | null = null;
	let source: AudioBufferSourceNode | null = null;

	function stop() {
		source?.stop();
		source = null;
		playing = null;
	}

	function audition(item: Item) {
		if (playing === item.id) return stop();
		stop();
		context ??= new AudioContext();
		const { audio } = item;
		const buffer = context.createBuffer(
			audio.channels.length,
			audio.channels[0].length,
			audio.sampleRate
		);
		audio.channels.forEach((channel, c) => buffer.copyToChannel(new Float32Array(channel), c));
		source = context.createBufferSource();
		source.buffer = buffer;
		source.connect(context.destination);
		source.onended = () => {
			if (playing === item.id) playing = null;
		};
		source.start();
		playing = item.id;
	}

	async function download() {
		busy = true;
		warnings = [];
		// let the page show that it is working before the samples are processed
		await new Promise((resolve) => setTimeout(resolve, 20));
		try {
			const built = buildPreset(
				items.map((item) => ({
					name: item.name,
					audio: item.audio,
					root: item.root ?? undefined,
					key: item.key ?? undefined
				})),
				{ kind, name: presetName, trim, normalize, loop }
			);
			warnings = [...built.warnings];
			const blob = new Blob([zipPreset(built) as Uint8Array<ArrayBuffer>], {
				type: 'application/zip'
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `${built.folder}.zip`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} finally {
			busy = false;
		}
	}

	/** Opens the system's file picker (a detached input, so the page keeps none around). */
	function choose() {
		const picker = document.createElement('input');
		picker.type = 'file';
		picker.accept = 'audio/*,.wav,.aif,.aiff';
		picker.multiple = true;
		picker.onchange = () => {
			if (picker.files?.length) void add(picker.files);
		};
		picker.click();
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (event.dataTransfer?.files.length) void add(event.dataTransfer.files);
	}

	const seconds = (audio: PcmAudio) => (audio.channels[0].length / audio.sampleRate).toFixed(2);
</script>

<div class="maker">
	<section class="maker__main" aria-label="the preset">
		<div class="kinds" role="group" aria-label="preset type">
			{#each KINDS as option (option.id)}
				<Button size="sm" pressed={kind === option.id} onclick={() => (kind = option.id)}
					>{option.label}</Button
				>
			{/each}
			<Legend size="xs" tone="muted">{KINDS.find((k) => k.id === kind)?.hint}</Legend>
		</div>

		<label class="field">
			<Legend as="span" size="xs" tone="muted">name</Legend>
			<input
				class="field__input"
				bind:value={name}
				maxlength="24"
				placeholder={presetName || 'my preset'}
				spellcheck="false"
			/>
		</label>

		<div
			class={['drop', dragging && 'is-dragging']}
			role="region"
			aria-label="drop audio files here"
			ondragover={(event) => {
				event.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={drop}
		>
			<Legend size="sm" tone="muted">drop wav or aiff files here, or</Legend>
			<Button size="sm" {busy} onclick={choose}>choose files</Button>
		</div>

		{#if items.length > 0}
			<ol class="list" aria-label="samples">
				{#each items as item, i (item.id)}
					<li class={['row', i >= limit && 'is-out']}>
						<IconButton
							size="sm"
							variant="ghost"
							icon={playing === item.id ? 'stop' : 'play'}
							label={playing === item.id ? `stop ${item.name}` : `play ${item.name}`}
							onclick={() => audition(item)}
						/>
						<span class="row__name" title={item.name}>{item.name}</span>
						<span class="row__meta">{seconds(item.audio)} s</span>
						{#if kind === 'drum'}
							{#if keys[i] !== null && keys[i] !== undefined}
								<select
									class="row__select"
									aria-label={`key for ${item.name}`}
									value={keys[i]}
									onchange={(event) => (item.key = Number(event.currentTarget.value))}
								>
									{#each DRUM_LAYOUT as slot, k (k)}
										<option value={DRUM_FIRST_KEY + k}
											>{noteName(DRUM_FIRST_KEY + k)} · {slot.kind}</option
										>
									{/each}
								</select>
							{:else}
								<span class="row__meta">left out (24 keys)</span>
							{/if}
						{:else}
							<select
								class="row__select"
								aria-label={`root note of ${item.name}`}
								value={item.root ?? item.found ?? ''}
								onchange={(event) => (item.root = Number(event.currentTarget.value))}
							>
								{#if (item.root ?? item.found) === null}
									<option value="" disabled>pick a root</option>
								{/if}
								{#each NOTES as note (note)}
									<option value={note}>{noteName(note)}</option>
								{/each}
							</select>
						{/if}
						<IconButton
							size="sm"
							variant="ghost"
							icon="close"
							label={`remove ${item.name}`}
							onclick={() => remove(item.id)}
						/>
					</li>
				{/each}
			</ol>
			{#if kind === 'multisampler' && roots.some((r, i) => r !== null && roots.indexOf(r) !== i)}
				<Legend size="xs" tone="accent"
					>two samples share a root note: only the first is kept</Legend
				>
			{/if}
		{/if}
	</section>

	<aside class="maker__side" aria-label="options">
		<div class="options">
			<Switch checked={trim} label="trim silence" onchange={(on) => (trim = on)} />
			<Switch checked={normalize} label="normalize to −1 dB" onchange={(on) => (normalize = on)} />
			{#if kind !== 'drum'}
				<label class="field">
					<Legend as="span" size="xs" tone="muted">loop</Legend>
					<select class="row__select" bind:value={loop}>
						{#each LOOPS as option (option.id)}
							<option value={option.id}>{option.label}</option>
						{/each}
					</select>
				</label>
			{/if}
		</div>

		<Button variant="primary" {busy} disabled={items.length === 0} onclick={download}>
			download {presetName ? `${presetName.toLowerCase()}.preset` : 'preset'}
		</Button>

		{#each problems as problem (problem)}
			<Legend size="xs" tone="accent">{problem}</Legend>
		{/each}
		{#each warnings as warning (warning)}
			<Legend size="xs" tone="accent">{warning}</Legend>
		{/each}

		<div class="help">
			<Legend as="h3" size="xs">putting it on your op-xy</Legend>
			<Legend as="p" size="xs" tone="muted">
				Unzip the download. Put the OP-XY in MTP mode (<code>com</code>, then <code>M4</code>; a Mac
				needs TE's field kit app) and copy the <code>.preset</code> folder into a folder of your own
				inside <code>presets</code>, with a short name such as <code>mine</code> (7 characters at most
				keeps every sample path short enough for projects). The preset then shows up in the preset browser
				under that folder.
			</Legend>
			<Legend as="p" size="xs" tone="muted">
				Samples are written as the device writes them: 16-bit WAV at 44.1 kHz with the root note
				inside, at most 20 s each. Nothing leaves this browser.
			</Legend>
		</div>
	</aside>
</div>

<style>
	.maker {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 20rem;
		gap: 1.5rem;
		align-items: start;
	}

	@media (max-width: 56rem) {
		.maker {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.maker__main,
	.maker__side,
	.options,
	.help {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.kinds {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field__input,
	.row__select {
		min-width: 0;
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--xy-line-control);
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg);
		font: inherit;
		font-size: var(--xy-text-sm);
	}

	.field__input:focus-visible,
	.row__select:focus-visible {
		outline: 2px solid var(--xy-focus);
		outline-offset: 1px;
	}

	.drop {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		min-height: 5.5rem;
		padding: 1rem;
		border: 1px dashed var(--xy-line-strong);
		border-radius: var(--xy-radius-card);
		background-color: var(--xy-surface);
		transition: background-color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.drop.is-dragging {
		background-color: var(--xy-hover);
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto 12rem auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.375rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface);
	}

	.row.is-out {
		opacity: 0.45;
	}

	.row__name {
		overflow: hidden;
		font-size: var(--xy-text-sm);
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.row__meta {
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		font-variant-numeric: tabular-nums;
	}

	.help code {
		font-family: var(--xy-font-mono);
	}
</style>
