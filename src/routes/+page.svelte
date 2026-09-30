<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		getAppSimulator,
		getAppSound,
		getReplicaGuide,
		getSimPersistence,
		GuideCard,
		HintCaption,
		LargeScreen,
		NowPlaying,
		PlayReadout,
		ReplicaBridge,
		ScaleGuide,
		StageHint,
		sweepSteps
	} from '$lib/app';
	import { homeCommands, type AgentPalette, type ReplicaPalette } from '$lib/app/commands';
	import { fileName, saveFile, songMidi } from '$lib/app/export';
	import { browserClock, browserTimers, getDeviceStack, type SessionPhase } from '$lib/device';
	import { getReplicaState, Replica } from '$lib/replica';
	import { isTyping } from '$lib/replica/modifiers';
	import { KeyboardIcon, VolumeHighIcon, VolumeOffIcon } from '@hugeicons/core-free-icons';
	import { Button, Led, Readout, ToolButton, tooltip } from '$lib/ui';
	import AgentPanel from '$lib/ui/shell/AgentPanel.svelte';
	import DeviceStage from '$lib/ui/shell/DeviceStage.svelte';
	import ProjectMenu from '$lib/ui/shell/ProjectMenu.svelte';
	import { getPaletteState } from '$lib/ui/shell/palette-state.svelte';
	import ScaleMenu from '$lib/ui/shell/ScaleMenu.svelte';
	import { isDrumTrack } from '$lib/sim/areas/sequencer/model';
	import { getShellStatus } from '$lib/ui/shell/status.svelte';

	const status = getShellStatus();
	const stack = getDeviceStack();
	const { session, mirror } = stack;
	const replica = getReplicaState();
	// The replica's virtual OP-XY (root layout): whether its transport runs, for Space.
	const simulator = getAppSimulator();
	// The replica's own sound (root layout): on while simulated, off while the OP-XY plays.
	const sound = getAppSound();
	// What the replica keeps across reloads (root layout): the strip's mutes are saved with it.
	const persistence = getSimPersistence();

	// Choices remembered in this browser: the computer keyboard plays the replica's keys (on unless
	// turned off), and the display shows large over the device (off until asked for).
	const KEYS_STORE = 'opxy.computer-keys';
	const LARGE_STORE = 'opxy.large-display';
	let computerKeys = $state(readChoice(KEYS_STORE, true));
	let largeScreen = $state(readChoice(LARGE_STORE, false));

	function readChoice(store: string, fallback: boolean): boolean {
		try {
			const saved = globalThis.localStorage?.getItem(store);
			return saved === 'on' ? true : saved === 'off' ? false : fallback;
		} catch {
			return fallback;
		}
	}

	function keepChoice(store: string, on: boolean): void {
		try {
			localStorage.setItem(store, on ? 'on' : 'off');
		} catch {
			// private windows and blocked storage: the choice lasts until the page closes
		}
	}

	function toggleKeys(): void {
		computerKeys = !computerKeys;
		keepChoice(KEYS_STORE, computerKeys);
	}

	/** The device eases to its new size while the large display comes and goes (not on resizes). */
	let moving = $state(false);
	let movingTimer: ReturnType<typeof setTimeout> | undefined;

	function showLarge(on: boolean): void {
		if (largeScreen === on) return;
		largeScreen = on;
		keepChoice(LARGE_STORE, on);
		moving = true;
		clearTimeout(movingTimer);
		movingTimer = setTimeout(() => (moving = false), 600);
	}

	function onkeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !largeScreen || event.defaultPrevented) return;
		if (isTyping(event.target)) return;
		showLarge(false);
	}

	const keysTip = $derived(
		computerKeys
			? 'your keyboard plays the replica: the z and q rows, - and = for the octave, space to play and stop'
			: 'your keyboard does not play the replica'
	);
	const soundTip = $derived(
		!sound.available
			? 'this browser cannot make sound'
			: sound.enabled
				? 'sound on'
				: sound.connected
					? 'the op-xy makes the sound; switch on to hear the replica here too'
					: 'sound off'
	);

	// Replica ⇄ device: while connected the replica's keys play the OP-XY, and what the device sends
	// back lights the replica. Building it has no side effects; it listens from onMount.
	// The simulator (root layout) runs the playhead, on the device's clock when it sends one.
	const bridge = new ReplicaBridge({
		replica,
		stack,
		clock: browserClock,
		timers: browserTimers,
		playhead: false
	});
	// What the device can't take remotely, said under the replica now and then.
	const caption = new HintCaption({ clock: browserClock, timers: browserTimers });
	// The agent's walkthrough takes the caption line while it runs.
	const guide = getReplicaGuide();
	// A scale lit on the keyboard, and what the keys being played make (on the caption line).
	const scale = simulator ? new ScaleGuide({ replica, sim: () => simulator.sim.state }) : null;
	const readout = simulator
		? new PlayReadout({
				replica,
				sim: () => simulator.sim.state,
				timers: browserTimers,
				flats: () => scale?.flats ?? false
			})
		: null;
	const drumTrack = $derived(simulator ? isDrumTrack(simulator.sim.state) : false);

	// The command palette (⌘K, root layout): this page adds the replica's commands and the agent's.
	const palette = getPaletteState();
	let panel = $state<ReturnType<typeof AgentPanel>>();

	function pressKey(id: 'key.play' | 'key.stop'): void {
		replica.press(id, 'pointer');
		replica.release(id, 'pointer');
	}

	function replicaPalette(): ReplicaPalette {
		const s = simulator?.sim.state;
		return {
			playing: s?.transport.playing ?? false,
			live: bridge.live,
			bpm: s?.tempo.bpm ?? 120,
			metronome: s?.tempo.metronome.on ?? false,
			keys: computerKeys,
			large: largeScreen,
			sound: { available: sound.available, on: sound.enabled && sound.available },
			scale: scale ? { root: scale.root, lit: scale.label } : null,
			play: () => pressKey(s?.transport.playing ? 'key.stop' : 'key.play'),
			setTempo: (bpm) => {
				simulator?.sim.setTempo(bpm);
				persistence.markDirty();
			},
			setMetronome: (on) => {
				if (s) s.tempo.metronome.on = on;
				persistence.markDirty();
			},
			lightScale: (root, lit) => scale?.set(root, lit),
			showLarge,
			toggleSound: () => sound.toggle(),
			toggleKeys,
			downloadSong: () => {
				if (s) saveFile(songMidi(s), fileName(s, 'song', 'mid'), 'audio/midi');
			}
		};
	}

	function agentPalette(): AgentPalette | null {
		const agent = panel;
		if (!agent) return null;
		return {
			state: agent.paletteState(),
			ask: agent.ask,
			stop: agent.stopAgent,
			toggleLastChanges: agent.toggleLastChanges,
			newConversation: agent.newConversation,
			settings: agent.openSettings,
			watch: agent.watchExample,
			back: agent.leaveExample
		};
	}

	onMount(() => {
		const stopBridge = bridge.start();
		const stopScale = scale?.start();
		const stopReadout = readout?.start();
		const stopHints = bridge.onHint((hint) => caption.show(hint));
		// The page's one orchestrated moment: a playhead sweeps the step row once.
		const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const stopSweep = calm || bridge.live ? null : sweepSteps(replica, browserTimers);
		const stopPalette = palette.add(
			(query) => homeCommands(query, replicaPalette(), agentPalette()),
			true
		);
		return () => {
			stopPalette();
			stopSweep?.();
			stopHints();
			stopReadout?.();
			stopScale?.();
			stopBridge();
			caption.dispose();
			clearTimeout(movingTimer);
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
	// The channels the device's tracks send notes on (a track needs one before its notes go out).
	const notesIn = $derived(
		mirror.noteChannels.length === 0
			? '–'
			: `ch ${mirror.noteChannels
					.slice(0, 3)
					.map((channel) => channel + 1)
					.join(' ')}${mirror.noteChannels.length > 3 ? ' +' : ''}`
	);

	function connect(): void {
		void session.connect();
	}

	function disconnect(): void {
		// Notes off first, while the port is still open.
		void bridge.disconnect();
	}
</script>

<svelte:window onblur={releaseNotes} onpagehide={releaseNotes} {onkeydown} />
<svelte:document {onvisibilitychange} />

<svelte:head>
	<title>OP-XY Agent</title>
	<meta
		name="description"
		content="Learn, play and program the OP-XY with a replica of the instrument and an agent that knows its manual."
	/>
</svelte:head>

<div class="home">
	<section
		class={[
			'home__stage',
			engaged && 'home__stage--engaged',
			largeScreen && 'home__stage--large',
			moving && 'home__stage--moving'
		]}
		aria-label="device"
	>
		<DeviceStage
			webMidi={status.webMidi}
			onconnect={connect}
			plate={engaged ? connection : undefined}
			caption={hints}
			strip={simulator ? playing : undefined}
			above={largeScreen ? largeDisplay : undefined}
		>
			<Replica
				{replica}
				keys={computerKeys}
				playing={() => simulator?.sim.state.transport.playing ?? false}
				overScreen={screenKey}
			/>
		</DeviceStage>
	</section>
	<AgentPanel bind:this={panel} class="home__agent" />
</div>

{#snippet playing()}
	{#if simulator}
		<NowPlaying
			{simulator}
			levels={sound.trackLevels}
			bpm={bridge.live && mirror.measuredBpm !== null ? mirror.measuredBpm.toFixed(1) : null}
			live={bridge.live}
			onchange={() => persistence.markDirty()}
		/>
	{/if}
{/snippet}

{#snippet largeDisplay()}
	<LargeScreen {replica} onclose={() => showLarge(false)} />
{/snippet}

<!-- over the replica's display: a click shows it large above the device, another puts it back -->
{#snippet screenKey()}
	<button
		type="button"
		class="screen-key"
		aria-label="show the display large"
		aria-pressed={largeScreen}
		onclick={() => showLarge(!largeScreen)}
		{@attach tooltip(largeScreen ? 'put the large display back' : 'show the display large', {
			describe: false
		})}
	></button>
{/snippet}

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
			{:else if session.phase === 'ready' && mirror.noteChannels.length === 0}
				<p class="conn__text">
					To see what you play light up here, give the track a MIDI channel on the device: project →
					M4, then turn E1 to the midi page, E2 to the track and E3 to a channel.
				</p>
			{/if}
		</div>

		{#if session.phase === 'ready'}
			<div class="conn__readouts">
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
				<Readout variant="cell" label="notes in" value={notesIn} />
				<Readout variant="cell" label="notes out" value="ch {bridge.channel + 1}" />
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
	<div class="hints">
		<div class="hints__main">
			{#if guide && guide.status !== 'idle'}
				<GuideCard {guide} />
			{:else}
				{@render caption_line()}
			{/if}
		</div>
		<!-- beside the line, not in it: a hint taking the line must not close the project card -->
		<div class="hints__tools">
			{#if scale}
				<ScaleMenu guide={scale} drums={drumTrack} />
			{/if}
			<ToolButton
				icon={KeyboardIcon}
				label="computer keyboard"
				tip={keysTip}
				pressed={computerKeys}
				onclick={toggleKeys}
			/>
			<ToolButton
				icon={sound.enabled && sound.available ? VolumeHighIcon : VolumeOffIcon}
				label="sound"
				tip={soundTip}
				pressed={sound.enabled && sound.available}
				disabled={!sound.available}
				onclick={() => sound.toggle()}
			/>
			<ProjectMenu />
		</div>
	</div>
{/snippet}

{#snippet caption_line()}
	<StageHint {caption}>
		{#snippet idle()}
			<!-- what the keys make takes the status line's place while they play, and eases back -->
			<div class="lines">
				<p class={['line', readout?.reading && 'line--away']}>
					{#if bridge.live}
						<span class="line__state">live</span>
						<span>the keyboard, play, stop and track keys play the op-xy</span>
					{:else}
						<span class="line__state">simulated</span>
						<span>the replica works like an op-xy; nothing is sent</span>
					{/if}
				</p>
				<p class={['line', 'line--reading', !readout?.reading && 'line--away']} aria-hidden="true">
					{#if readout?.reading}
						<span class="line__chord">{readout.reading.name}</span>
						{#if readout.reading.detail}<span>{readout.reading.detail}</span>{/if}
					{/if}
				</p>
			</div>
		{/snippet}
	</StageHint>
{/snippet}

<style>
	.home {
		flex: 1;
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--xy-agent-w);
		/* One row that never grows with its content: the stage and the agent panel both fit it, and
		 * each scrolls inside itself (the conversation always; the stage only as a last resort). */
		grid-template-rows: minmax(0, 1fr);
		min-height: 0;
	}

	.home__stage {
		/* the display, large, over the device: its glass tile's height, and the gap under it */
		--large-screen-h: min(13rem, 42vw);
		--stage-above-gap: 1rem;
		display: grid;
		align-content: safe center;
		min-width: 0;
		min-height: 0;
		padding: clamp(2rem, 5vh, 4rem) clamp(1rem, 4vw, 4rem);
	}

	/* the key over the replica's display: a faint ring round it on hover */
	.screen-key {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		padding: 0;
		border: 0;
		border-radius: inherit;
		background: transparent;
		cursor: zoom-in;
		transition: box-shadow var(--xy-dur-base) var(--xy-ease-standard);
	}

	.screen-key[aria-pressed='true'] {
		cursor: zoom-out;
	}

	.screen-key:hover {
		box-shadow: 0 0 0 0.3cqw rgb(247 245 245 / 0.2);
	}

	.screen-key:focus-visible {
		outline: 1.5px solid var(--xy-focus);
		outline-offset: 0.3cqw;
	}

	.home :global(.home__agent) {
		min-height: 0;
		margin: 0.75rem 0.75rem 0.75rem 0;
	}

	/* The status line under the replica, shown while no hint is up; the scale menu's card opens
	 * against it. */
	.hints {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}

	.hints__main {
		flex: 1;
		min-width: 0;
	}

	.hints__tools {
		display: flex;
		flex: none;
		align-items: center;
		gap: 0.125rem;
		margin-block: -0.375rem;
	}

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

	/* the status line and the reading share one place, crossfading */
	.lines {
		display: grid;
	}

	.lines > .line {
		grid-area: 1 / 1;
		transition: opacity var(--xy-dur-slow, 240ms) var(--xy-ease-standard, ease);
	}

	.line--away {
		opacity: 0;
		pointer-events: none;
	}

	.line__chord {
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		font-weight: 500;
		letter-spacing: normal;
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

	/* Desktop: the page is exactly one screen; the conversation scrolls inside its panel. The
	 * height must be the flex basis (`flex: none`): with `flex: 1` the column above has no definite
	 * height, the basis falls back to the content, and a long conversation made the page taller. */
	@media (min-width: 68.75rem) {
		.home {
			flex: none;
			height: calc(100dvh - var(--xy-header-h) - var(--xy-status-h));
			min-height: 30rem;
		}

		/* The stage fits the height it gets: the device is only as wide as leaves room for the
		 * caption and the plate under it (the device body is 285 : 102). Past that, it scrolls. */
		.home__stage {
			container-type: size;
			/* Vertical only; the faint light pool around the device may spill sideways, clipped. */
			overflow: hidden auto;
			/* the caption, the strip under it and the plate, with their gaps */
			--stage-reserve: 14rem;
			/* the widest the device gets with the caption and the plate under it */
			--stage-fit-w: min(76rem, calc((100cqh - var(--stage-reserve)) * 285 / 102));
			--stage-max-w: var(--stage-fit-w);
			/* the display, large: as tall as the room over the device at that width (8–16.5rem) */
			--large-screen-h: clamp(
				8rem,
				calc(
					100cqh - var(--stage-reserve) - min(100cqw, var(--stage-fit-w)) * 102 / 285 -
						var(--stage-above-gap)
				),
				16.5rem
			);
		}

		.home__stage--engaged {
			--stage-reserve: 16.5rem;
		}

		/* With the display large the stage's own margins give it room, and the device gets smaller
		 * only when what is left is under the display's least. */
		.home__stage--large {
			padding-block: 1rem;
			--stage-max-w: min(
				76rem,
				calc(
					(100cqh - var(--stage-reserve) - var(--large-screen-h) - var(--stage-above-gap)) * 285 /
						102
				)
			);
		}

		.home__stage--moving :global(.stage) {
			transition: max-width 420ms cubic-bezier(0.33, 1, 0.68, 1);
		}
	}

	/* One column: the page scrolls from the stage down to the panel, which has a height of its own
	 * so its conversation still scrolls inside it with the composer in view. */
	@media (max-width: 68.6875rem) {
		.home {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto;
		}

		.home :global(.home__agent) {
			height: 80dvh;
			min-height: 24rem;
			margin: 0 1rem 1rem;
		}
	}
</style>
