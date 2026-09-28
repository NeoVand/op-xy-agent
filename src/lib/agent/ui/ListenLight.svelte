<!--
@component
While the agent listens: a breathing red LED (the device's record colour), what it hears, the seconds
left, and a row of four small LEDs that follow the level, the way the replica's meter does (off
below −48 dBFS, the last one red near full scale). LEDs snap on and decay off, so the row moves
smoothly; the clock ticks five times a second, only while the light is on screen.
-->
<script lang="ts">
	import { createSubscriber } from 'svelte/reactivity';
	import type { ListenActivity } from '$lib/device/listen/capture.svelte';
	import Led from '$lib/ui/Led.svelte';
	import type { LedState } from '$lib/ui/types';

	interface Props {
		activity: ListenActivity;
		/** The latest peak, 0–1. */
		level: number;
	}

	let { activity, level }: Props = $props();

	const tick = createSubscriber((update) => {
		const timer = setInterval(update, 200);
		return () => clearInterval(timer);
	});

	function left(): number {
		tick();
		return Math.max(0, Math.ceil(activity.seconds - (Date.now() - activity.since) / 1000));
	}

	/** How many of the four LEDs the level lights (−48 dBFS to full scale). */
	const lit = $derived.by(() => {
		const db = level > 0 ? 20 * Math.log10(level) : -Infinity;
		return Math.round(Math.min(1, Math.max(0, (db + 48) / 48)) * 4);
	});

	const meter = $derived<LedState[]>(
		[0, 1, 2, 3].map((i) => (i >= lit ? 'dim' : i === 3 ? 'red' : 'white'))
	);
</script>

<span class="listen" role="status">
	<Led state="red" blink="breathe" size="sm" />
	<span class="listen__text">
		listening to the {activity.source === 'device' ? 'op-xy' : 'replica'}
		<span class="listen__time">{left()} s</span>
	</span>
	<span class="listen__meter" aria-hidden="true">
		{#each meter as state, i (i)}<Led {state} size="sm" />{/each}
	</span>
</span>

<style>
	.listen {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding-right: 0.25rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		white-space: nowrap;
	}

	.listen__time {
		font-variant-numeric: tabular-nums;
	}

	.listen__meter {
		display: inline-flex;
		gap: 0.1875rem;
	}
</style>
