<!--
@component
DEVELOPMENT ONLY: replays saved agent evals (`evals/agent/quality.mjs` writes them to
`evals/agent/out/`) in the real chat, beside the live replica, so an answer can be read the way the
user reads it. Open `/?transcripts=1` under `vite dev`. The agent panel imports this component only
inside an `import.meta.env.DEV` branch, so production builds drop it and the runs it lists.

Pick a run and a case: its checks, lints and the judge's scores sit above the chat it produced.
-->
<script lang="ts">
	import type { ControlId } from '$lib/core/opxy';
	import type { ChatEntry } from '../chat';
	import Conversation from './Conversation.svelte';
	import type { CitationTarget } from './MessageText.svelte';

	interface Props {
		onkeys?: (keys: string) => void;
		onpoint?: (ids: readonly ControlId[] | null) => void;
		cite?: (ref: string) => CitationTarget | null;
	}

	let { onkeys, onpoint, cite }: Props = $props();

	interface Scores {
		readonly score: number;
		readonly why: string;
	}
	interface Result {
		readonly id: string;
		readonly category: string;
		readonly run: number;
		readonly pass: boolean;
		readonly fails: readonly string[];
		readonly lints: readonly { code: string; severity: string; detail: string }[];
		readonly rubric: { scores: (Record<string, Scores> & { issues: string[] }) | null } | null;
		readonly entries: readonly ChatEntry[];
		readonly seconds: number;
		readonly usd: number;
		/** What the replica played when the agent was done. */
		readonly heard?: { readonly text: string; readonly flags: readonly string[] } | null;
	}
	interface Saved {
		readonly model: string;
		readonly judge: string;
		readonly results: readonly Result[];
	}

	const AXES = ['correct', 'helpful', 'clear', 'concise', 'tone', 'tools'];
	const files = import.meta.glob<Saved>('/evals/agent/out/*.json', { import: 'default' });
	const names = Object.keys(files).sort().reverse();

	let file = $state(names[0] ?? '');
	/** The case picked in each run (by file). */
	let choices = $state<Record<string, number>>({});
	let failing = $state(false);

	const loading = $derived(files[file] ? files[file]() : Promise.resolve(null));
	const label = (name: string) => name.replace('/evals/agent/out/', '').replace(/\.json$/, '');
	const visible = (saved: Saved | null) =>
		(saved?.results ?? []).filter((r) => !failing || !r.pass);
</script>

<div class="viewer">
	<div class="viewer__bar">
		<select bind:value={file} aria-label="run">
			{#each names as name (name)}
				<option value={name}>{label(name)}</option>
			{/each}
		</select>
		<label class="viewer__toggle"><input type="checkbox" bind:checked={failing} /> failing</label>
	</div>
	{#if names.length === 0}
		<p class="viewer__note">
			No saved runs yet: <code>node evals/agent/quality.mjs</code> writes them.
		</p>
	{:else}
		{#await loading then saved}
			{@const shown = visible(saved)}
			{@const picked = Math.min(choices[file] ?? 0, Math.max(0, shown.length - 1))}
			{@const result = shown[picked] ?? null}
			<div class="viewer__bar">
				<select
					value={picked}
					aria-label="case"
					onchange={(e) => (choices[file] = Number(e.currentTarget.value))}
				>
					{#each shown as r, i (`${r.id}#${r.run}`)}
						<option value={i}
							>{r.pass ? '✓' : '✗'} {r.category} · {r.id}{r.run ? ` #${r.run + 1}` : ''}</option
						>
					{/each}
				</select>
			</div>
			{#if result}
				<div class="viewer__score">
					<p class="viewer__axes">
						<span>{saved?.model} · {result.seconds.toFixed(0)} s · ${result.usd.toFixed(3)}</span>
						{#if result.rubric?.scores}
							{#each AXES as axis (axis)}
								<span title={result.rubric.scores[axis]?.why}
									>{axis} {result.rubric.scores[axis]?.score}</span
								>
							{/each}
						{/if}
					</p>
					{#each result.fails as fail, i (i)}<p class="viewer__fail">✗ {fail}</p>{/each}
					{#each result.lints as l, i (i)}
						<p class={l.severity === 'error' ? 'viewer__fail' : 'viewer__warn'}>
							{l.code}: {l.detail}
						</p>
					{/each}
					{#each result.rubric?.scores?.issues ?? [] as issue, i (i)}
						<p class="viewer__issue">~ {issue}</p>
					{/each}
					{#if result.heard}
						<details class="viewer__heard">
							<summary>what the replica played at the end</summary>
							<pre>{result.heard.text}</pre>
						</details>
					{/if}
				</div>
				<Conversation entries={result.entries} {onkeys} {onpoint} {cite} />
			{/if}
		{/await}
	{/if}
</div>

<style>
	.viewer {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 0;
	}

	.viewer__bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--xy-line);
		font-size: var(--xy-text-xs);
	}

	.viewer__bar select {
		max-width: 100%;
		padding: 0.2rem 0.4rem;
		border: 1px solid var(--xy-line);
		border-radius: 0.3rem;
		background: transparent;
		color: inherit;
		font: inherit;
	}

	.viewer__toggle {
		display: inline-flex;
		gap: 0.25rem;
		align-items: center;
	}

	.viewer__score {
		max-height: 30%;
		overflow: auto;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--xy-line);
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
	}

	.viewer__score p {
		margin: 0.1rem 0;
	}

	.viewer__axes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.6rem;
	}

	.viewer__fail {
		color: #ff6a4d;
	}

	.viewer__warn {
		color: #e0b050;
	}

	.viewer__issue {
		color: var(--xy-fg-faint);
	}

	.viewer__heard pre {
		margin: 0.2rem 0 0;
		white-space: pre-wrap;
		font-size: var(--xy-text-2xs);
	}

	.viewer__note {
		padding: 1rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
	}
</style>
