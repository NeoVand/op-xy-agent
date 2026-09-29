<!--
@component
Read-only browser for the files the OP-XY exposes over TE SysEx (FILE INIT once, then FILE LIST;
on OS 1.1.33 the root holds `drum/` and `synth/`). Nothing here writes to the device.
-->
<script lang="ts">
	import { Button, Legend } from '$lib/ui';
	import { fileFlagNames, TE_FILE_NODE_FLAG, type TeFileEntry } from '$lib/core/te';
	import type { DeviceSession } from '$lib/device';

	interface Props {
		session: DeviceSession;
		/** False until the device answered GREET. */
		available: boolean;
	}

	let { session, available }: Props = $props();

	interface Folder {
		readonly id: number;
		readonly name: string;
	}

	/** Open folders from the root down; empty until the first listing. */
	let path: Folder[] = $state([]);
	let entries: TeFileEntry[] = $state([]);
	let busy = $state(false);
	let error: string | null = $state(null);

	const isDir = (entry: TeFileEntry) => (entry.flags & TE_FILE_NODE_FLAG.DIR) !== 0;

	async function open(trail: Folder[]) {
		const folder = trail.at(-1);
		if (!folder || busy) return;
		busy = true;
		error = null;
		try {
			entries = await session.listFiles(folder.id, { source: 'user' });
			path = trail;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function size(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<div class="files">
	<div class="files__bar">
		<Button size="sm" disabled={!available} {busy} onclick={() => open([{ id: 0, name: 'root' }])}>
			{path.length === 0 ? 'list files' : 'refresh root'}
		</Button>
		{#if path.length > 0}
			<nav class="files__path" aria-label="folder path">
				{#each path as folder, i (folder.id)}
					{#if i > 0}<span aria-hidden="true">/</span>{/if}
					<button
						type="button"
						class="files__crumb"
						aria-current={i === path.length - 1 ? 'location' : undefined}
						onclick={() => open(path.slice(0, i + 1))}
					>
						{folder.name}
					</button>
				{/each}
			</nav>
		{/if}
	</div>

	{#if error}
		<p class="files__error" role="alert">{error}</p>
	{/if}

	{#if path.length > 0}
		{#if entries.length === 0}
			<Legend as="p" size="sm" tone="subtle">This folder is empty.</Legend>
		{:else}
			<ul class="files__list">
				{#each entries as entry (entry.id)}
					<li>
						{#if isDir(entry)}
							<button
								type="button"
								class="files__dir"
								onclick={() => open([...path, { id: entry.id, name: entry.name }])}
							>
								{entry.name}/
							</button>
						{:else}
							<span>{entry.name}</span>
							<span class="files__meta">{size(entry.size)}</span>
						{/if}
						<span class="files__meta">id {entry.id}, {fileFlagNames(entry.flags).join(' ')}</span>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<Legend as="p" size="2xs" tone="subtle">
		Read-only: FILE INIT and FILE LIST. Nothing is written to the device.
	</Legend>
</div>

<style>
	.files {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.files__bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}

	.files__path {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-sm);
	}

	.files__crumb,
	.files__dir {
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

	.files__crumb[aria-current='location'] {
		text-decoration: none;
		cursor: default;
	}

	.files__crumb:focus-visible,
	.files__dir:focus-visible {
		outline: 1.5px solid var(--xy-focus);
		outline-offset: 2px;
	}

	.files__list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--xy-text-sm);
	}

	.files__list li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
	}

	.files__meta {
		color: var(--xy-fg-subtle);
		font-family: var(--xy-font-mono);
		font-size: var(--xy-text-xs);
	}

	.files__error {
		margin: 0;
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
	}
</style>
