<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { HintCaption, ReplicaBridge, StageHint, sweepSteps } from '$lib/app';
	import { browserClock, browserTimers, getDeviceStack, type SessionPhase } from '$lib/device';
	import { getReplicaState, Replica } from '$lib/replica';
	import { Button, Led, Readout } from '$lib/ui';
	import AgentPanel from '$lib/ui/shell/AgentPanel.svelte';
	import DeviceStage from '$lib/ui/shell/DeviceStage.svelte';
	import { getShellStatus } from '$lib/ui/shell/status.svelte';

	const status = getShellStatus();
	const stack = getDeviceStack();
	const { session, mirror } = stack;
	const replica = getReplicaState();

	// Replica ⇄ device: while connected the replica's keys play the OP-XY, and what the device sends
	// back lights the replica. Building it has no side effects; it listens from onMount.
	const bridge = new ReplicaBridge({ replica, stack, clock: browserClock, timers: browserTimers });
	// What the device can't take remotely, said under the replica now and then.
	const caption = new HintCaption({ clock: browserClock, timers: browserTimers });

	onMount(() => {
		const stopBridge = bridge.start();
		const stopHints = bridge.onHint((hint) => caption.show(hint));
		// The page's one orchestrated moment: a playhead sweeps the step row once.
		const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const stopSweep = calm || bridge.live ? null : sweepSteps(replica, browserTimers);
		return () => {
			stopSweep?.();
			stopHints();
			stopBridge();
			caption.dispose();
		};
	});

	// A held note must never hang: let go of everything when the page loses focus or goes away.
	// (The tab hiding comes before pagehide, while the port is still open.)
	function releaseNotes(): void {
		bridge.releaseAll();
	}

	function onvisibilitychange(): void {
		if (document.visibilityState === 'hidden') bridge.releaseAll();
	}

	const PHASE_TEXT: Record<SessionPhase, string> = {
		idle: 'not connected',
		'requesting-access': 'waiting for midi permission',
		'waiting-for-device': 'waiting for the op-xy',
		opening: 'opening the op-xy',
		identifying: 'identifying',
		greeting: 'reading device info',
		ready: 'connected',
		disconnected: 'disconnected',
		error: 'not connected'
	};

	// Once the user has asked to connect, the stage shows the connection instead of the invitation.
	const engaged = $derived(session.phase !== 'idle');
	const bpm = $derived(mirror.measuredBpm ?? mirror.tempoSent);
	const bpmLabel = $derived(mirror.measuredBpm !== null ? 'tempo' : 'tempo (last set)');

	function connect(): void {
		void session.connect();
	}

	function disconnect(): void {
		// Notes off first, while the port is still open.
		void bridge.disconnect();
	}
</script>

<svelte:window onblur={releaseNotes} onpagehide={releaseNotes} />
<svelte:document {onvisibilitychange} />

<svelte:head>
	<title>OP-XY Agent</title>
	<meta
		name="description"
		content="Learn, play and program the OP-XY with a replica of the instrument and an agent that knows its manual."
	/>
</svelte:head>

<div class="home">
	<section class="home__stage" aria-label="device">
		<DeviceStage
			webMidi={status.webMidi}
			onconnect={connect}
			plate={engaged ? connection : undefined}
			caption={hints}
		>
			<Replica {replica} />
		</DeviceStage>
	</section>
	<AgentPanel class="home__agent" />
</div>

{#snippet connection()}
	<div class="conn">
		<div class="conn__head">
			<h1 class="conn__title">
				<Led
					state={session.phase === 'ready' ? 'white' : session.phase === 'error' ? 'red' : 'dim'}
					blink={session.phase !== 'ready' &&
					session.phase !== 'error' &&
					session.phase !== 'disconnected'
						? 'fast'
						: false}
					size="lg"
				/>
				op-xy {PHASE_TEXT[session.phase]}
			</h1>
			{#if session.phase === 'error' && session.problem}
				<p class="conn__text">{session.problem.detail} {session.problem.action}</p>
			{:else if session.notice && session.phase !== 'ready'}
				<p class="conn__text">{session.notice}</p>
			{:else if session.phase === 'ready' && !mirror.clockOut}
				<p class="conn__text">
					To mirror play state and tempo, set com → system settings → midi → clock to “both” on the
					device.
				</p>
			{/if}
		</div>

		{#if session.phase === 'ready'}
			<div class="conn__readouts">
				<Readout variant="cell" label="firmware" value={session.firmware?.osVersion ?? '–'} />
				<Readout
					variant="cell"
					label="transport"
					value={mirror.playState === 'unknown' ? '–' : mirror.playState}
				/>
				<Readout
					variant="cell"
					label={bpmLabel}
					value={bpm === null ? '–' : bpm.toFixed(1)}
					unit={bpm === null ? undefined : 'bpm'}
				/>
				<Readout variant="cell" label="notes" value="ch {bridge.channel + 1}" />
			</div>
		{/if}

		<div class="conn__actions">
			{#if session.phase === 'error' || session.phase === 'disconnected'}
				<Button variant="primary" onclick={connect}>try again</Button>
			{/if}
			{#if session.phase !== 'error'}
				<Button variant="ghost" onclick={disconnect}>disconnect</Button>
			{/if}
			<a class="conn__lab" href={resolve('/lab')}>open the device lab →</a>
		</div>
	</div>
{/snippet}

{#snippet hints()}
	<StageHint {caption}>
		{#snippet idle()}
			<p class="line">
				{#if bridge.live}
					<Led state="white" size="sm" />
					<span class="line__state">live</span>
					<span>the keyboard, play, stop and track keys play the op-xy</span>
				{:else}
					<Led state="dim" size="sm" />
					<span class="line__state">simulated</span>
					<span>the keys move, nothing is sent</span>
				{/if}
			</p>
		{/snippet}
	</StageHint>
{/snippet}

<style>
	.home {
		flex: 1;
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--xy-agent-w);
		min-height: 0;
	}

	.home__stage {
		display: grid;
		align-content: center;
		min-width: 0;
		padding: clamp(2rem, 5vh, 4rem) clamp(1rem, 4vw, 4rem);
	}

	.home :global(.home__agent) {
		margin: 0.75rem 0.75rem 0.75rem 0;
	}

	/* The status line under the replica, shown while no hint is up. */
	.line {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		margin: 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}

	.line__state {
		color: var(--xy-fg-muted);
	}

	.conn {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1.25rem 2rem;
		width: 100%;
	}

	.conn__head {
		max-width: 34rem;
	}

	.conn__title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0;
		font-size: var(--xy-text-2xl);
		line-height: var(--xy-leading-2xl);
		font-weight: var(--xy-weight-light);
		letter-spacing: var(--xy-tracking-display);
		color: var(--xy-fg);
	}

	.conn__text {
		margin: 0.5rem 0 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-base);
		line-height: var(--xy-leading-base);
	}

	.conn__readouts {
		display: flex;
		gap: 0.5rem;
	}

	.conn__actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.conn__lab {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-sm);
		text-decoration: none;
	}

	.conn__lab:hover,
	.conn__lab:focus-visible {
		color: var(--xy-fg);
	}

	/* Desktop: the page is exactly one screen; the conversation scrolls inside its panel. */
	@media (min-width: 68.75rem) {
		.home {
			height: calc(100dvh - var(--xy-header-h) - var(--xy-status-h));
			min-height: 36rem;
		}
	}

	@media (max-width: 68.6875rem) {
		.home {
			grid-template-columns: minmax(0, 1fr);
		}

		.home :global(.home__agent) {
			min-height: 30rem;
			margin: 0 1rem 1rem;
		}
	}
</style>
