<!--
@component
What this conversation has cost, in the device's screen language: a small strip of black glass with
one cell per value (dollars, tokens, share served from the prompt cache). Honest about unknowns: a
model without a known price shows its dollars as a lower bound.
-->
<script lang="ts">
	import type { UsageTotals } from '../chat';
	import { cacheHitRate } from '../models';

	interface Props {
		usage: UsageTotals;
	}

	let { usage }: Props = $props();

	const tokens = $derived(usage.input + usage.output + usage.cacheRead + usage.cacheWrite);
	const hit = $derived(cacheHitRate(usage));

	function compact(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
		return String(n);
	}

	function dollars(usd: number): string {
		if (usd === 0) return '$0';
		if (usd < 0.01) return `$${usd.toFixed(4)}`;
		return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
	}
</script>

<div class="meter" role="group" aria-label="usage for this conversation">
	<div class="meter__cell">
		<span class="meter__label">cost</span>
		<span class="meter__value">{usage.unknownCost ? '≥ ' : ''}{dollars(usage.usd)}</span>
	</div>
	<div class="meter__cell">
		<span class="meter__label">tokens</span>
		<span class="meter__value">{compact(tokens)}</span>
	</div>
	<div class="meter__cell">
		<span class="meter__label">cached</span>
		<span class="meter__value">{hit === null ? '–' : `${Math.round(hit * 100)}%`}</span>
	</div>
</div>

<style>
	.meter {
		display: inline-grid;
		grid-auto-flow: column;
		gap: 1px;
		overflow: hidden;
		border-radius: var(--xy-radius-card);
		background-color: var(--xy-surface-sunken);
		box-shadow: 0 0 0 1px var(--xy-line);
		font-variant-numeric: tabular-nums;
	}

	.meter__cell {
		display: flex;
		align-items: baseline;
		gap: 0.375rem;
		padding: 0.1875rem 0.5rem;
		background-color: var(--xy-surface-sunken);
	}

	.meter__cell + .meter__cell {
		box-shadow: -1px 0 0 var(--xy-line);
	}

	.meter__label {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}

	.meter__value {
		color: var(--xy-fg);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: var(--xy-weight-regular);
	}
</style>
