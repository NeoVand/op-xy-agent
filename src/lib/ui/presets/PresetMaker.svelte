<!--
@component
Turns recordings into an OP-XY sample preset (docs/research/30-presets-samples.md): pick a drum
kit, a sliced loop, a multisample or a synth sampler, drop audio files, check where each lands (a
drum key, a slice, or a root note and its zone), and download the `.preset` folder zipped, ready for Field Kit or the
device's `presets/` folder over MTP, or install it on a connected OP-XY after the owner confirms
(`PresetInstall`). Everything runs in the browser; nothing is uploaded anywhere.
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
		equalSlices,
		findOnsets,
		noteFromName,
		noteName,
		safeStem,
		sliceAudio,
		zipPreset,
		type BuiltPreset,
		type LoopMode,
		type PcmAudio,
		type PresetKind
	} from '$lib/core/presets';
	import { decodeAudioFile } from './decode';
	import PresetInstall from './PresetInstall.svelte';
	import SliceView from './SliceView.svelte';

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

	/** What the page makes: a preset kind, or a loop sliced into a drum kit. */
	type Mode = PresetKind | 'slices';

	const KINDS: readonly { id: Mode; label: string; hint: string }[] = [
		{ id: 'drum', label: 'drum kit', hint: 'up to 24 hits on the keys f3–e5' },
		{ id: 'slices', label: 'sliced loop', hint: 'one loop cut into up to 24 slices, f3 upwards' },
		{ id: 'multisampler', label: 'multisample', hint: 'up to 24 notes of one instrument' },
		{ id: 'sampler', label: 'synth sampler', hint: 'one sound across the keyboard' }
	];
	const LOOPS: readonly { id: LoopMode; label: string }[] = [
		{ id: 'forever', label: 'loop forever' },
		{ id: 'release', label: 'loop until release' },
		{ id: 'off', label: 'no loop' }
	];
	/** Where a loop is cut: at its hits, or into equal parts. */
	const CUTS = [
		{ id: 'hits', label: 'at the hits' },
		{ id: '8', label: '8 equal slices' },
		{ id: '16', label: '16 equal slices' },
		{ id: '24', label: '24 equal slices' }
	] as const;
	/** Root notes a zone can take, A0 to C8 (the piano's range). */
	const NOTES = Array.from({ length: 88 }, (_, i) => 21 + i);

	let mode = $state<Mode>('drum');
	let cut = $state<(typeof CUTS)[number]['id']>('hits');
	let sensitivity = $state(50);
	let name = $state('');
	let trim = $state(true);
	let normalize = $state(false);
	let loop = $state<LoopMode>('forever');
	let items = $state<Item[]>([]);
	let busy = $state(false);
	let dragging = $state(false);
	let problems = $state<string[]>([]);
	let warnings = $state<string[]>([]);
	/** What sounds: `item-<id>` or `slice-<index>`. */
	let playing = $state<string | null>(null);
	let nextId = 0;

	const kind = $derived<PresetKind>(mode === 'slices' ? 'drum' : mode);
	const limit = $derived(
		mode === 'sampler' || mode === 'slices' ? 1 : mode === 'drum' ? DRUM_KEYS : MAX_ZONES
	);
	const keys = $derived(
		mode === 'drum'
			? drumKeys(items.map((item) => ({ name: item.name, key: item.key ?? undefined })))
			: []
	);
	/** A sliced loop: its first file, where it is cut, and the slices. */
	const looped = $derived(mode === 'slices' ? (items[0] ?? null) : null);
	const starts = $derived(
		looped
			? cut === 'hits'
				? findOnsets(looped.audio, { sensitivity: sensitivity / 100 })
				: equalSlices(looped.audio, Number(cut))
			: []
	);
	const slices = $derived(looped ? sliceAudio(looped.audio, starts) : []);
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
		if (playing === `item-${id}`) stop();
	}

	let context: AudioContext | null = null;
	let source: AudioBufferSourceNode | null = null;

	function stop() {
		source?.stop();
		source = null;
		playing = null;
	}

	function audition(id: string, audio: PcmAudio) {
		if (playing === id) return stop();
		stop();
		context ??= new AudioContext();
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
			if (playing === id) playing = null;
		};
		source.start();
		playing = id;
	}

	/** The preset from the samples and options as they stand; what was noticed goes to `warnings`. */
	async function build(): Promise<BuiltPreset | null> {
		if (items.length === 0) return null;
		busy = true;
		warnings = [];
		// let the page show that it is working before the samples are processed
		await new Promise((resolve) => setTimeout(resolve, 20));
		try {
			const samples = looped
				? slices.map((audio, i) => ({
						name: `${safeStem(looped.name, 8)}-${String(i + 1).padStart(2, '0')}`,
						audio,
						key: DRUM_FIRST_KEY + i
					}))
				: items.map((item) => ({
						name: item.name,
						audio: item.audio,
						root: item.root ?? undefined,
						key: item.key ?? undefined
					}));
			// slices choke each other, as the device's slicer sets them
			const built = buildPreset(samples, {
				kind,
				name: presetName,
				trim,
				normalize,
				loop,
				choke: mode === 'slices'
			});
			warnings = [...built.warnings];
			return built.patch.regions.length > 0 ? built : null;
		} finally {
			busy = false;
		}
	}

	async function download() {
		const built = await build();
		if (!built) return;
		const blob = new Blob([zipPreset(built) as Uint8Array<ArrayBuffer>], {
			type: 'application/zip'
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${built.folder}.zip`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
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
				<Button size="sm" pressed={mode === option.id} onclick={() => (mode = option.id)}
					>{option.label}</Button
				>
			{/each}
			<Legend size="xs" tone="muted">{KINDS.find((k) => k.id === mode)?.hint}</Legend>
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
							icon={playing === `item-${item.id}` ? 'stop' : 'play'}
							label={playing === `item-${item.id}` ? `stop ${item.name}` : `play ${item.name}`}
							onclick={() => audition(`item-${item.id}`, item.audio)}
						/>
						<span class="row__name" title={item.name}>{item.name}</span>
						<span class="row__meta">{seconds(item.audio)} s</span>
						{#if mode === 'slices'}
							<span class="row__meta">{i === 0 ? 'the loop' : 'only the first file is sliced'}</span
							>
						{:else if mode === 'drum'}
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
			{#if looped}
				<div class="cut">
					<label class="field">
						<Legend as="span" size="xs" tone="muted">cut</Legend>
						<select class="row__select" bind:value={cut}>
							{#each CUTS as option (option.id)}
								<option value={option.id}>{option.label}</option>
							{/each}
						</select>
					</label>
					{#if cut === 'hits'}
						<label class="field cut__range">
							<Legend as="span" size="xs" tone="muted">sensitivity {sensitivity}</Legend>
							<input type="range" min="0" max="100" bind:value={sensitivity} />
						</label>
					{/if}
					<Legend size="xs" tone="subtle">
						{slices.length} slices on {noteName(DRUM_FIRST_KEY)}–{noteName(
							DRUM_FIRST_KEY + Math.max(0, slices.length - 1)
						)}, each choking the last
					</Legend>
				</div>
				<SliceView
					audio={looped.audio}
					{starts}
					playing={playing?.startsWith('slice-') ? Number(playing.slice(6)) : null}
					onpick={(i) => audition(`slice-${i}`, slices[i])}
				/>
			{/if}
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

		<PresetInstall {build} disabled={items.length === 0 || busy} />

		<div class="help">
			<Legend as="h3" size="xs">copying it by hand</Legend>
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

	.cut {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem;
	}

	.cut__range input {
		width: 10rem;
		accent-color: var(--xy-fg);
	}
</style>
