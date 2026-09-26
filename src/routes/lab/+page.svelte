<!--
The device lab: a developer console for the OP-XY connection (not linked from the app yet).
Connecting asks for Web MIDI with SysEx, then runs the read-only probe (identity request, GREET).
Everything sent from here goes through the device transport and its safety policy.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { Button, Led, Legend, Panel, Readout, type LedState } from '$lib/ui';
	import type { MidiMessage } from '$lib/core/midi/messages';
	import {
		CC80_TEMPO_RANGE,
		encodeCcValue,
		REFERENCE_FIRMWARE,
		resolveCc,
		tempoToCc,
		type CcTarget
	} from '$lib/core/opxy';
	import {
		browserDeviceOptions,
		createDeviceStack,
		type PlaySource,
		type ProbeStatus,
		type SessionPhase
	} from '$lib/device';
	import LabFiles from './LabFiles.svelte';
	import LabMonitor from './LabMonitor.svelte';

	// Safe during prerendering: building the stack touches no browser API and requests nothing.
	// MIDI access is only requested when the connect key is pressed.
	const stack = createDeviceStack(browserDeviceOptions());
	const { access, session, mirror, monitor, transport } = stack;

	onMount(() => {
		const stop = stack.start();
		return () => {
			stop();
			void session.disconnect();
		};
	});

	const TRACKS = [1, 2, 3, 4, 5, 6, 7, 8];
	const tempoTarget = resolveCc({ param: 'global.tempo' });
	const selectTarget = resolveCc({ param: 'track.select' });
	const muteTargets = TRACKS.map((track) => resolveCc({ track, param: 'mute' }));

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

	const PROBE_TEXT: Record<ProbeStatus, string> = {
		unknown: 'not probed yet',
		ok: 'ok',
		'no-reply': 'no reply',
		failed: 'failed',
		skipped: 'skipped',
		halted: 'halted'
	};

	const PLAY_SOURCE_TEXT: Record<PlaySource, string> = {
		device: 'reported by the device',
		echo: 'relayed back by the device',
		app: 'sent by the app, not confirmed'
	};

	let tempo: number | null = $state(120);
	let lastError: string | null = $state(null);

	const connecting = $derived(
		session.phase === 'requesting-access' ||
			session.phase === 'opening' ||
			session.phase === 'identifying' ||
			session.phase === 'greeting'
	);
	const phaseLed: LedState = $derived(
		session.phase === 'ready'
			? 'white'
			: connecting || session.phase === 'disconnected'
				? 'dim'
				: 'off'
	);
	const problem = $derived(session.problem ?? access.problem);
	const caps = $derived(session.capabilities);
	/** The device card. The serial number is never shown, only whether the device reported one. */
	const facts = $derived.by(() => {
		const info = session.info;
		return [
			{ label: 'product', value: info?.product ?? null, mono: false },
			{ label: 'os', value: info?.osVersion ?? null, mono: true },
			{ label: 'hw rev', value: info?.hwRev ?? null, mono: true },
			{ label: 'sku', value: info?.sku ?? session.identity?.sku ?? null, mono: true },
			{ label: 'mode', value: info?.mode ?? null, mono: false },
			{ label: 'serial', value: info?.serialReported ? 'hidden' : null, mono: false },
			{ label: 'reference', value: REFERENCE_FIRMWARE, mono: true }
		];
	});

	function ccMessage(target: CcTarget, value: number): MidiMessage {
		return { type: 'controlChange', channel: target.channel, controller: target.cc, value };
	}

	function attempt(action: () => void) {
		try {
			action();
			lastError = null;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
	}

	function send(message: MidiMessage, cause: string) {
		attempt(() => transport.send(message, { source: 'user', cause }));
	}

	function setTempo(event: SubmitEvent) {
		event.preventDefault();
		attempt(() => {
			if (tempo === null) throw new Error('enter a tempo in BPM');
			transport.send(ccMessage(tempoTarget, tempoToCc(tempo)), {
				source: 'user',
				cause: 'lab:tempo'
			});
		});
	}

	function selectTrack(track: number) {
		send(ccMessage(selectTarget, encodeCcValue(selectTarget, track)), 'lab:track-select');
	}

	function toggleMute(track: number) {
		const target = muteTargets[track - 1];
		const muted = mirror.mutes[track - 1] === true;
		send(ccMessage(target, encodeCcValue(target, !muted)), 'lab:mute');
	}

	function panic() {
		attempt(() => transport.panic({ source: 'user', cause: 'lab:panic' }));
	}

	async function connect() {
		lastError = null;
		await session.connect();
	}

	async function disconnect() {
		lastError = null;
		await session.disconnect();
	}
</script>

<svelte:head>
	<title>OP-XY Agent device lab</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="lab">
	<header class="lab__head">
		<div>
			<h1 class="lab__title">device lab</h1>
			<Legend as="p" size="sm" tone="subtle">
				A developer console for the USB connection. Everything sent from here passes the device
				transport's safety policy.
			</Legend>
		</div>
		<Button href={resolve('/')} variant="ghost" size="sm">back to the app</Button>
	</header>

	<div class="lab__grid">
		<Panel title="connection" class="lab__connection">
			<div class="stack">
				<p class="status">
					<Led state={phaseLed} blink={connecting ? 'slow' : false} />
					<span>{PHASE_TEXT[session.phase]}</span>
				</p>
				<div class="row">
					{#if session.phase === 'ready' || session.phase === 'disconnected' || session.phase === 'waiting-for-device'}
						<Button onclick={disconnect}>disconnect</Button>
					{:else}
						<Button
							variant="primary"
							busy={connecting}
							disabled={!access.supported || connecting}
							onclick={connect}
						>
							connect op-xy
						</Button>
					{/if}
				</div>
				<Legend as="p" size="xs" tone="subtle">
					Connecting asks for MIDI with SysEx ("control and reprogram your MIDI devices"), then
					sends the read-only identity request and TE's GREET.
				</Legend>
				{#if problem}
					<div class="note" role="alert">
						<p class="note__title">{problem.title}</p>
						<p>{problem.detail}</p>
						<p>{problem.action}</p>
					</div>
				{/if}
				{#if session.notice}
					<p class="note">{session.notice}</p>
				{/if}
				{#each access.hints as hint (hint)}
					{#if hint !== session.notice}<p class="note">{hint}</p>{/if}
				{/each}
				{#each session.allWarnings as warning (warning)}
					<p class="note">{warning}</p>
				{/each}
				<Legend as="p" size="2xs" tone="subtle">
					midi permission: {access.permission}. SysEx: {access.sysex ? 'granted' : 'not granted'}.
				</Legend>
			</div>
		</Panel>

		<Panel title="device" variant="screen" class="lab__device">
			<dl class="facts">
				{#each facts as fact (fact.label)}
					<dt>{fact.label}</dt>
					<dd class={[fact.mono && fact.value !== null && 'mono']}>{fact.value ?? '—'}</dd>
				{/each}
			</dl>
		</Panel>

		<Panel title="capabilities" class="lab__caps">
			<ul class="caps">
				<li>
					<Led state={caps.identity === 'ok' ? 'white' : 'off'} />
					<span>identity request: {PROBE_TEXT[caps.identity]}</span>
				</li>
				<li>
					<Led state={caps.teProtocol === 'ok' ? 'white' : 'off'} />
					<span>TE protocol (GREET): {PROBE_TEXT[caps.teProtocol]}</span>
				</li>
				<li>
					<Led state={caps.files === 'ok' ? 'white' : 'off'} />
					<span>files over SysEx: {PROBE_TEXT[caps.files]}</span>
				</li>
				<li>
					<Led state={caps.clockOut === 'observed' ? 'white' : 'off'} />
					<span>
						{caps.clockOut === 'observed'
							? 'clock out observed'
							: 'no clock from the device (set com → clock to both to follow play state and tempo)'}
					</span>
				</li>
				<li>
					<Led state="off" />
					<span>
						remote keys: unsupported on OS 1.1.33. CC106/107 have no effect on that firmware, so
						this console never sends them.
					</span>
				</li>
			</ul>
			{#if session.firmware && caps.remoteKeys.status !== 'unsupported'}
				<Legend as="p" size="xs" tone="subtle">{caps.remoteKeys.note}</Legend>
			{/if}
		</Panel>

		<Panel title="control" class="lab__control">
			<div class="stack">
				<section class="control" aria-labelledby="lab-transport">
					<Legend as="h3" size="xs" tone="subtle" id="lab-transport">transport</Legend>
					<div class="row">
						<Button disabled={!session.ready} onclick={() => send({ type: 'start' }, 'lab:play')}>
							play
						</Button>
						<Button disabled={!session.ready} onclick={() => send({ type: 'stop' }, 'lab:stop')}>
							stop
						</Button>
						<p class="status">
							<Led state={mirror.playState === 'playing' ? 'white' : 'off'} />
							<span>
								{mirror.playState === 'unknown' ? 'play state unknown' : mirror.playState}
								{#if mirror.playSource}({PLAY_SOURCE_TEXT[mirror.playSource]}){/if}
							</span>
						</p>
					</div>
				</section>

				<section class="control" aria-labelledby="lab-tempo">
					<Legend as="h3" size="xs" tone="subtle" id="lab-tempo">tempo</Legend>
					<div class="row">
						<form class="row" onsubmit={setTempo}>
							<label class="field">
								<span class="sr-only">tempo in BPM</span>
								<input
									type="number"
									min={CC80_TEMPO_RANGE.min}
									max={CC80_TEMPO_RANGE.max}
									step="2"
									bind:value={tempo}
								/>
								<span class="field__unit">bpm</span>
							</label>
							<Button type="submit" disabled={!session.ready}>set tempo</Button>
						</form>
						<Readout
							label="measured"
							value={mirror.measuredBpm === null ? '—' : mirror.measuredBpm.toFixed(1)}
							unit="bpm"
							size="sm"
						/>
						<p class="status">
							<Led state={mirror.clockOut ? 'white' : 'off'} />
							<span>{mirror.clockOut ? 'clock out' : 'no clock'}</span>
						</p>
					</div>
					<Legend as="p" size="2xs" tone="subtle">
						CC80 sets BPM = 2 × value (40–220, even numbers).
						{mirror.tempoSent === null ? '' : `Last set by the app: ${mirror.tempoSent} bpm.`}
					</Legend>
				</section>

				<section class="control" aria-labelledby="lab-tracks">
					<Legend as="h3" size="xs" tone="subtle" id="lab-tracks">track select (CC102)</Legend>
					<div class="row">
						{#each TRACKS as track (track)}
							<Button
								size="sm"
								disabled={!session.ready}
								pressed={mirror.selectedTrack === track}
								onclick={() => selectTrack(track)}
							>
								{track}
							</Button>
						{/each}
					</div>
					<Legend as="p" size="2xs" tone="subtle">
						Last set by the app; the device does not report selection changes made by hand.
					</Legend>
				</section>

				<section class="control" aria-labelledby="lab-mutes">
					<Legend as="h3" size="xs" tone="subtle" id="lab-mutes">mute (CC9)</Legend>
					<div class="row">
						{#each TRACKS as track (track)}
							<Button
								size="sm"
								disabled={!session.ready}
								pressed={mirror.mutes[track - 1] === true}
								aria-label={`mute track ${track}`}
								onclick={() => toggleMute(track)}
							>
								{track}
							</Button>
						{/each}
					</div>
					<Legend as="p" size="2xs" tone="subtle">
						Sent-state: what the app last sent. Mutes changed on the device are not reported.
					</Legend>
				</section>

				<section class="control" aria-labelledby="lab-panic">
					<Legend as="h3" size="xs" tone="subtle" id="lab-panic">panic</Legend>
					<div class="row">
						<Button variant="secondary" disabled={!session.ready} onclick={panic}>panic</Button>
						<Legend size="2xs" tone="subtle">
							Note-offs, then sustain off, All Notes Off and All Sound Off on channels 1–16.
						</Legend>
					</div>
				</section>

				{#if lastError}
					<p class="note" role="alert">{lastError}</p>
				{/if}
			</div>
		</Panel>

		<Panel title="files" class="lab__files">
			<LabFiles {session} available={session.ready && caps.teProtocol === 'ok'} />
		</Panel>

		<Panel title="monitor" class="lab__monitor">
			<LabMonitor {monitor} />
		</Panel>
	</div>
</div>

<style>
	.lab {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		width: 100%;
		max-width: 80rem;
		margin: 0 auto;
		padding: 1.5rem 1rem 3rem;
	}

	.lab__head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
	}

	.lab__title {
		margin: 0 0 0.25rem;
		font-size: var(--xy-text-2xl);
		font-weight: var(--xy-weight-light);
		line-height: var(--xy-leading-2xl);
	}

	.lab__grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
	}

	.lab__grid :global(.lab__control),
	.lab__grid :global(.lab__monitor) {
		grid-column: 1 / -1;
	}

	.lab__grid :global(.lab__files) {
		grid-column: 1 / -1;
	}

	@media (max-width: 60rem) {
		.lab__grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-sm);
	}

	.note {
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-left: 2px solid var(--xy-line-strong);
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-sm);
	}

	.note p {
		margin: 0;
	}

	.note__title {
		color: var(--xy-fg);
	}

	.facts {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 0.375rem 1rem;
		margin: 0;
		font-size: var(--xy-text-sm);
	}

	.facts dt {
		color: var(--xy-scr-muted);
	}

	.facts dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.mono {
		font-family: var(--xy-font-mono);
	}

	.caps {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0 0 0.75rem;
		padding: 0;
		list-style: none;
		font-size: var(--xy-text-sm);
		color: var(--xy-fg-muted);
	}

	.caps li {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.control {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
	}

	.field input {
		width: 5rem;
		height: 2.5rem;
		padding: 0 0.625rem;
		border: 1px solid var(--xy-line-control);
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg);
		font: inherit;
		font-variant-numeric: tabular-nums;
	}

	.field input:focus-visible {
		outline: 2px solid var(--xy-focus);
		outline-offset: 2px;
	}

	.field__unit {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-sm);
	}
</style>
