<!--
@component
The lab's MIDI monitor: the newest messages in and out (capped by the monitor, clock hidden by
default), with direction and text filters. GREET replies show their header only; the monitor never
displays serial numbers.
-->
<script lang="ts">
	import { Button, Legend, Switch } from '$lib/ui';
	import type { DirectionFilter, MidiMonitor } from '$lib/device';

	interface Props {
		monitor: MidiMonitor;
	}

	let { monitor }: Props = $props();

	const directions: { value: DirectionFilter; label: string }[] = [
		{ value: 'all', label: 'all' },
		{ value: 'in', label: 'in' },
		{ value: 'out', label: 'out' }
	];

	let selected: number | null = $state(null);

	const rows = $derived(monitor.rows);
	const detail = $derived(selected === null ? null : monitor.detail(selected));

	function seconds(time: number): string {
		return (time / 1000).toFixed(3);
	}
</script>

<div class="monitor">
	<div class="monitor__controls">
		<Switch label="hide clock" bind:checked={monitor.hideClock} />
		<div class="monitor__group" role="group" aria-label="direction">
			{#each directions as direction (direction.value)}
				<Button
					size="sm"
					pressed={monitor.direction === direction.value}
					onclick={() => (monitor.direction = direction.value)}
				>
					{direction.label}
				</Button>
			{/each}
		</div>
		<label class="monitor__search">
			<span class="sr-only">filter messages</span>
			<input type="search" placeholder="filter" bind:value={monitor.search} />
		</label>
		<Button size="sm" toggle bind:pressed={monitor.paused}>pause</Button>
		<Button size="sm" onclick={() => monitor.clear()}>clear</Button>
		<Legend size="2xs" tone="subtle" class="monitor__count">
			{rows.length} shown, {monitor.total} seen
		</Legend>
	</div>

	{#if detail}
		<p class="monitor__detail" aria-live="polite">{detail}</p>
	{/if}

	<div class="monitor__scroll">
		<table class="monitor__table">
			<thead>
				<tr>
					<th scope="col">t (s)</th>
					<th scope="col">dir</th>
					<th scope="col">source</th>
					<th scope="col">bytes</th>
					<th scope="col">message</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.id)}
					<tr class={[row.direction === 'out' && 'is-out', row.echo && 'is-echo']}>
						<td class="mono">{seconds(row.time)}</td>
						<td>{row.direction === 'in' ? '← in' : '→ out'}</td>
						<td>
							{row.source}
							{#if row.cause}<span class="cause">{row.cause}</span>{/if}
						</td>
						<td class="mono bytes">{row.hex}</td>
						<td>
							<button
								type="button"
								class="monitor__label"
								aria-pressed={selected === row.id}
								onclick={() => (selected = selected === row.id ? null : row.id)}
							>
								{row.label}
							</button>
							{#if row.echo}<span class="echo">echo</span>{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5" class="monitor__empty">
							Nothing yet. Messages to and from the OP-XY appear here.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.monitor {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-width: 0;
	}

	.monitor__controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
	}

	.monitor__group {
		display: flex;
		gap: var(--xy-gap);
	}

	.monitor__search input {
		width: 9rem;
		height: 2rem;
		padding: 0 0.625rem;
		border: 1px solid var(--xy-line-control);
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg);
		font: inherit;
		font-size: var(--xy-text-sm);
	}

	.monitor__search input:focus-visible {
		outline: 2px solid var(--xy-focus);
		outline-offset: 2px;
	}

	:global(.monitor__count) {
		margin-left: auto;
	}

	.monitor__detail {
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-sm);
	}

	.monitor__scroll {
		max-height: 28rem;
		overflow: auto;
		border: 1px solid var(--xy-line);
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
	}

	.monitor__table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--xy-text-xs);
		font-variant-numeric: tabular-nums;
	}

	th {
		position: sticky;
		top: 0;
		padding: 0.375rem 0.625rem;
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg-subtle);
		font-weight: var(--xy-weight-regular);
		text-align: left;
		white-space: nowrap;
		box-shadow: inset 0 -1px 0 var(--xy-line);
	}

	td {
		padding: 0.25rem 0.625rem;
		color: var(--xy-fg-muted);
		vertical-align: top;
		white-space: nowrap;
	}

	tr.is-out td {
		color: var(--xy-fg);
	}

	.mono {
		font-family: var(--xy-font-mono);
	}

	.bytes {
		white-space: normal;
		min-width: 12rem;
		overflow-wrap: anywhere;
	}

	.monitor__label {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.monitor__label:hover,
	.monitor__label[aria-pressed='true'] {
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.monitor__label:focus-visible {
		outline: 2px solid var(--xy-focus);
		outline-offset: 2px;
	}

	.echo {
		margin-left: 0.5rem;
		padding: 0 0.375rem;
		border: 1px solid var(--xy-line-strong);
		border-radius: var(--xy-radius-tile);
		color: var(--xy-fg-subtle);
	}

	.monitor__empty {
		padding: 1rem 0.625rem;
		white-space: normal;
		color: var(--xy-fg-subtle);
	}

	.cause {
		display: block;
		color: var(--xy-fg-subtle);
	}
</style>
