<!--
@component
The thin status bar along the bottom of the app: MIDI connection, device firmware, whether the replica
mirrors the device or simulates it, and browser support. Built as cells, like the screen's header,
instead of one run-on line.
-->
<script lang="ts">
	import Led from '../Led.svelte';
	import type { LedState } from '../types';

	/** Connection state as the device layer reports it. */
	type MidiState = 'idle' | 'connecting' | 'connected' | 'live' | 'error';

	interface Props {
		midi?: MidiState;
		/** Device name once identified. */
		device?: string | null;
		/** Firmware version once known, e.g. "1.1.33". */
		firmware?: string | null;
		/** `mirroring` only when device events confirm what the replica shows. */
		view?: 'simulated' | 'mirroring';
		webMidi?: 'unknown' | 'available' | 'unavailable';
	}

	let {
		midi = 'idle',
		device = null,
		firmware = null,
		view = 'simulated',
		webMidi = 'unknown'
	}: Props = $props();

	const led: LedState = $derived(
		({ idle: 'off', connecting: 'white', connected: 'white', live: 'red', error: 'red' } as const)[
			midi
		]
	);

	const midiText = $derived(
		{
			idle: 'no device',
			connecting: 'connecting',
			connected: device ?? 'connected',
			live: 'writing to device',
			error: 'connection lost'
		}[midi]
	);

	const supportText = $derived(
		{ unknown: '', available: 'web midi ready', unavailable: 'web midi not supported here' }[
			webMidi
		]
	);
</script>

<footer class="status" aria-label="status">
	<div class="cell cell--midi" role="status">
		<Led state={led} blink={midi === 'connecting' ? 'fast' : false} size="sm" />
		<span class="value">{midiText}</span>
	</div>
	<div class="cell cell--optional">
		<span class="key">os</span>
		<span class="value">{firmware ?? '–'}</span>
	</div>
	<div class="cell cell--optional">
		<span class="key">view</span>
		<span class="value">{view}</span>
	</div>
	<div class="spacer"></div>
	{#if supportText}
		<div class="cell cell--support">
			<span class={['value', webMidi === 'unavailable' && 'warn']}>{supportText}</span>
		</div>
	{/if}
</footer>

<style>
	.status {
		display: flex;
		align-items: stretch;
		height: var(--xy-status-h);
		border-top: 1px solid var(--xy-line);
		background-color: var(--xy-bg);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		color: var(--xy-fg-subtle);
		overflow: hidden;
	}

	.cell {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-inline: 0.875rem;
		border-right: 1px solid var(--xy-line);
		white-space: nowrap;
	}

	.cell--midi {
		padding-left: 1rem;
		min-width: 8.5rem;
	}

	.cell--support {
		border-right: 0;
		border-left: 1px solid var(--xy-line);
	}

	.spacer {
		flex: 1;
	}

	.key {
		color: var(--xy-fg-faint);
	}

	.value {
		color: var(--xy-fg-muted);
		font-variant-numeric: tabular-nums;
	}

	.warn {
		color: var(--xy-accent-text);
	}

	@media (max-width: 40rem) {
		.cell--optional {
			display: none;
		}

		.cell--midi {
			border-right: 0;
		}
	}
</style>
