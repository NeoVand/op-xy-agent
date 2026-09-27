<!--
@component
The live status line at the foot of the conversation while the agent works: an LED, what it is
doing ("reading the manual and thinking", "calling set tempo", "manual expert", "writing"), the
detail (the latest progress note, a tool's input, the subagent's step, a word count) and how long
this phase has taken. The clock ticks five times a second, and only while the line is on screen.
-->
<script lang="ts">
	import { createSubscriber } from 'svelte/reactivity';
	import Led from '$lib/ui/Led.svelte';
	import { formatElapsed, type Activity } from '../activity';

	interface Props {
		activity: Activity;
	}

	let { activity }: Props = $props();

	// Runs only while something on screen reads it: the line exists only during a run.
	const tick = createSubscriber((update) => {
		const timer = setInterval(update, 200);
		return () => clearInterval(timer);
	});

	function elapsed(): string {
		tick();
		return formatElapsed(Date.now() - activity.since);
	}

	const alert = $derived(activity.phase === 'approval' || activity.writes);
</script>

<div class={['act', `act--${activity.phase}`]}>
	<Led state={alert ? 'red' : 'white'} blink="breathe" size="sm" />
	<span class="act__label" aria-live="polite">{activity.label}</span>
	{#if activity.detail}<span class="act__detail">{activity.detail}</span>{/if}
	<span class="act__time" aria-hidden="true">{elapsed()}</span>
</div>

<style>
	.act {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2rem;
		padding: 0.375rem 0.5rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}

	.act__label {
		flex: none;
		max-width: 65%;
		overflow: hidden;
		color: var(--xy-fg-muted);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.act--approval .act__label {
		color: var(--xy-fg);
	}

	.act__detail {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.act__time {
		flex: none;
		margin-left: auto;
		padding-left: 0.25rem;
		font-variant-numeric: tabular-nums;
	}
</style>
