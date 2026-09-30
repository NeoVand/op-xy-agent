<script lang="ts">
	import './layout.css';
	import '@fontsource-variable/work-sans';
	import '@fontsource-variable/work-sans/wght-italic.css';
	import '@fontsource-variable/red-hat-mono';
	import workSansLatin from '@fontsource-variable/work-sans/files/work-sans-latin-wght-normal.woff2?url';
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { asset, resolve } from '$app/paths';
	import { page } from '$app/state';
	import { siteCommands, type ManualEntry, type SitePage } from '$lib/app/commands';
	import { PresetInbox, setPresetInbox } from '$lib/app/preset-inbox.svelte';
	import {
		AppSimulator,
		AppSound,
		DeviceSamples,
		ReplicaGuide,
		SimPersistence,
		createIdbSampleCache,
		createIdbSimStore,
		setAppSimulator,
		setAppSound,
		setDeviceSamples,
		setReplicaGuide,
		setSimPersistence
	} from '$lib/app';
	import {
		browserDeviceOptions,
		browserTimers,
		createDeviceStack,
		setDeviceStack
	} from '$lib/device';
	import type { SessionPhase } from '$lib/device';
	import { ReplicaState, setReplicaState } from '$lib/replica';
	import { setScreenFrameSource } from '$lib/replica/screen';
	import { describeFrame } from '$lib/sim/screen/render';
	import { Theme, setTheme } from '$lib/ui/theme.svelte';
	import AppHeader from '$lib/ui/shell/AppHeader.svelte';
	import CommandPalette from '$lib/ui/shell/CommandPalette.svelte';
	import { PaletteState, setPaletteState } from '$lib/ui/shell/palette-state.svelte';
	import StatusBar from '$lib/ui/shell/StatusBar.svelte';
	import { ShellStatus, setShellStatus, type MidiState } from '$lib/ui/shell/status.svelte';

	let { children } = $props();

	const theme = new Theme();
	setTheme(theme);

	const status = new ShellStatus();
	setShellStatus(status);

	// One device stack for the whole app. Building it touches no browser API (safe to prerender);
	// MIDI access is only requested when the user presses connect.
	const device = createDeviceStack(browserDeviceOptions());
	setDeviceStack(device);

	// One replica state for the whole app (drawn on the home page, animated by the agent).
	const replica = new ReplicaState();
	setReplicaState(replica);

	// Its virtual OP-XY: the simulator draws the replica's screen and LEDs, and follows a connected
	// device's tempo, transport and clock. It listens from onMount.
	const simulator = new AppSimulator({ replica, stack: device });
	setAppSimulator(simulator);
	setScreenFrameSource(simulator);

	// The agent's walkthroughs: the replica lights one step at a time until its screen gets there.
	const guide = new ReplicaGuide({
		replica,
		read: () => describeFrame(simulator.frame),
		timers: browserTimers
	});
	setReplicaGuide(guide);

	// Kits the agent makes wait here for the preset maker.
	setPresetInbox(new PresetInbox(resolve('/presets')));

	// Its sound while no OP-XY makes one: synthesized in the browser, silent while a device is
	// connected unless asked. Nothing is loaded or started until the first key press.
	const sound = new AppSound({ simulator, replica, stack: device });
	setAppSound(sound);

	// The samples a project names on the OP-XY's drive: read over USB with a project loaded from
	// the device, kept on this computer, and put back whenever a project names them again.
	const deviceSamples = new DeviceSamples({
		sim: simulator.sim,
		samples: sound.samples,
		cache: createIdbSampleCache()
	});
	setDeviceSamples(deviceSamples);

	// Its work survives reloads, as a device's survives power cycles: put back from IndexedDB on
	// mount, saved a moment after each change.
	const persistence = new SimPersistence({
		state: simulator.sim.state,
		replica,
		store: createIdbSimStore()
	});
	setSimPersistence(persistence);

	// The command palette (⌘K): the site's pages, the theme and the manual's pages here; the page
	// shown adds its own. The manual's titles come from a small prerendered file on first opening.
	const palette = new PaletteState();
	setPaletteState(palette);
	let manualIndex = $state.raw<readonly ManualEntry[] | null>(null);
	let manualAsked = false;
	palette.onShow(() => {
		if (manualAsked) return;
		manualAsked = true;
		fetch(resolve('/manual/index.json'))
			.then((response) => (response.ok ? (response.json() as Promise<ManualEntry[]>) : null))
			.then(
				(list) => (manualIndex = list),
				() => (manualAsked = false)
			);
	});

	function openPage(to: SitePage, tab: boolean): void {
		if (tab) {
			const href =
				to.to === '/manual/[id]' ? resolve('/manual/[id]', { id: to.id }) : resolve(to.to);
			window.open(href, '_blank', 'noopener');
		} else if (to.to === '/manual/[id]') {
			void goto(resolve('/manual/[id]', { id: to.id }));
		} else {
			void goto(resolve(to.to));
		}
	}

	palette.add((query) =>
		siteCommands(query, {
			route: page.route.id,
			dev,
			manual: manualIndex,
			theme: theme.current,
			open: openPage,
			toggleTheme: () => theme.toggle()
		})
	);

	const CONNECTING: readonly SessionPhase[] = [
		'requesting-access',
		'waiting-for-device',
		'opening',
		'identifying',
		'greeting'
	];

	// The status bar reflects the session: what is connected and what the device reported.
	const midi = $derived.by((): MidiState => {
		const { phase } = device.session;
		if (phase === 'ready') return 'connected';
		if (phase === 'error') return 'error';
		return CONNECTING.includes(phase) ? 'connecting' : 'idle';
	});
	const deviceName = $derived(
		device.session.phase === 'ready'
			? (device.session.info?.product?.toLowerCase() ?? 'op-xy')
			: null
	);
	const firmware = $derived(
		device.session.firmware?.osVersion ? `os ${device.session.firmware.osVersion}` : null
	);
	// "mirroring" only when device events (its clock) confirm what the app shows.
	const view = $derived(
		device.session.phase === 'ready' && device.mirror.clockOut ? 'mirroring' : 'simulated'
	);

	onMount(() => {
		theme.sync();
		status.detect();
		const stop = device.start();
		const stopSimulator = simulator.start();
		// after the simulator: the sound reads what the simulator made of each replica event
		const stopSound = sound.start();
		// kept samples come back as soon as the restored project (or any later one) names them
		const stopSamples = deviceSamples.start();
		// once saved work is back, the replica opens on track 3, a synth, so the keyboard plays notes
		// rather than drums (the owner); a new project on the device itself starts on track 1
		const saving = persistence.start().then((stop) => {
			simulator.sim.state.track = 2;
			return stop;
		});
		// development only (production builds drop it): the replica and its simulator for page
		// scripts, e.g. screenshots of states that take an answer to reach
		if (import.meta.env.DEV) {
			Object.assign(globalThis, { __opxy: { replica, simulator } });
		}
		return () => {
			void saving.then((stop) => stop());
			stopSamples();
			stopSound();
			stopSimulator();
			stop();
			void device.session.disconnect();
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={asset('/favicon.svg')} type="image/svg+xml" />
	<link rel="apple-touch-icon" href={asset('/apple-touch-icon.png')} />
	<link rel="preload" href={workSansLatin} as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

<a class="skip" href="#main">skip to content</a>

<div class="app">
	<AppHeader />
	<main id="main" class="main" tabindex="-1">
		{@render children()}
	</main>
	<StatusBar {midi} device={deviceName} {firmware} {view} webMidi={status.webMidi} />
</div>

<CommandPalette {palette} />

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	.main {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		outline: none;
	}

	/* Visually hidden until focused from the keyboard. */
	.skip {
		position: fixed;
		left: 0.75rem;
		top: 0.75rem;
		z-index: var(--xy-z-overlay);
		padding: 0.5rem 0.875rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-key-1-cap);
		color: var(--xy-key-1-legend);
		font-size: var(--xy-text-sm);
		text-decoration: none;
	}

	.skip:not(:focus) {
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
