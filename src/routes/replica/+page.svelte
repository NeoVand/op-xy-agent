<!--
Dev page for the replica (M2): the replica large, plus a bench to show key combos with
`animate()`, drive LEDs, the screen and the level meter, and watch the outbound events. The UI
simulator (M2.5, `$lib/sim`) listens to the replica and drives its screen and LEDs; in dev a
card compares a simulated page with TE's guide picture of it. Nothing here talks to a MIDI device.
-->
<script lang="ts">
	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { KeyParseError, LED_KEYS, normalizeKeys, type KeyId } from '$lib/core/opxy';
	import {
		ART_SOURCE,
		Replica,
		ReplicaState,
		type AnimationHandle,
		type KeyLedState,
		type ReplicaEvent
	} from '$lib/replica';
	import { setScreenFrameSource } from '$lib/replica/screen';
	import { OpxySim } from '$lib/sim/opxy-sim.svelte';
	import { SCENARIOS } from '$lib/sim/scenarios';
	import { SCREEN_OFFSET_Y, renderFrame } from '$lib/sim/screen';
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface LoggedEvent {
		readonly n: number;
		readonly at: number;
		readonly text: string;
		readonly source: string;
	}

	let events = $state.raw<LoggedEvent[]>([]);
	let eventCount = 0;
	const started = typeof performance === 'undefined' ? 0 : performance.now();

	function log(event: ReplicaEvent) {
		const detail =
			event.type === 'turn'
				? ` ${event.delta > 0 ? '+' : ''}${Number(event.delta.toFixed(3))} → ${Number(event.value.toFixed(3))}${event.fine ? ' (fine)' : ''}`
				: event.type === 'bend'
					? ` ${event.value.toFixed(2)}`
					: '';
		const entry: LoggedEvent = {
			n: ++eventCount,
			at: Math.round(performance.now() - started),
			text: `${event.type} ${event.id}${detail}`,
			source: event.source
		};
		events = [entry, ...events].slice(0, 40);
	}

	const replica = new ReplicaState({
		onPress: log,
		onRelease: log,
		onTurn: log,
		onClick: log,
		onBend: log,
		screen: ['tempo', '120.0']
	});

	// ── simulator: replica input in, screen frames and LEDs out
	const sim = new OpxySim();
	let simulate = $state(true);

	replica.subscribe((event) => {
		if (simulate) sim.input(event);
	});

	setScreenFrameSource({
		get frame() {
			return simulate ? sim.frame : null;
		},
		get tick() {
			const t = sim.state.transport;
			return t.playing ? Math.floor(t.position) : 0;
		}
	});

	$effect(() => {
		if (simulate) replica.setLeds(sim.leds);
		else replica.clearLeds();
	});

	// the transport: while playing, time moves the playhead
	$effect(() => {
		if (!simulate || !sim.state.transport.playing) return;
		let last = performance.now();
		let raf = requestAnimationFrame(function step(now) {
			sim.advance(now - last);
			last = now;
			raf = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(raf);
	});

	const status = $derived.by(() => {
		const s = sim.state;
		const where = s.overlay ?? `${s.mode} M${s.mode === 'arrange' ? '' : s.pages[s.mode]}`;
		const track = s.active === 'instrument' ? `T${s.track + 1}` : `aux T${s.auxTrack + 1}`;
		return `${where} · ${track} ${s.tracks[s.track].engine} · ${s.tempo.bpm} bpm${s.shift ? ' · shift' : ''}${s.transport.playing ? ' · playing' : ''}`;
	});

	function resetSim() {
		sim.reset();
		scenarioId = '';
	}

	// ── dev: a simulated page beside TE's guide picture of it
	const initialGuide = untrack(() => data.guide?.id ?? '');
	let scenarioId = $state(initialGuide);
	let difference = $state(false);
	const scenario = $derived(SCENARIOS.find((s) => s.id === scenarioId));

	function applyScenario(id: string) {
		const next = SCENARIOS.find((s) => s.id === id);
		if (!next) return;
		simulate = true;
		sim.reset();
		next.setup(sim);
		// the same page with a query (the dev picture to load); resolve() takes no query string
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${resolve('/replica')}?guide=${encodeURIComponent(id)}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	if (initialGuide) SCENARIOS.find((s) => s.id === initialGuide)?.setup(sim);

	/** Our render at the guide pictures' scale: 480 × 222 (TE's 220 rows centred), doubled. */
	const ours: Attachment<HTMLCanvasElement> = (canvas) => {
		const ctx = canvas.getContext('2d');
		$effect(() => {
			if (!ctx) return;
			ctx.setTransform(2, 0, 0, 2, 0, 0);
			ctx.fillStyle = '#000000';
			ctx.fillRect(0, 0, 480, 222);
			ctx.translate(0, SCREEN_OFFSET_Y);
			renderFrame(ctx, sim.frame);
		});
	};

	// ── combos
	const PRESETS = [
		'shift + M1',
		'step 5 + turn E2',
		'record + play → play',
		'hold M1',
		'bar + step 16',
		'shift + step n',
		'T3 + M4',
		'click E3',
		'shift + step 1 → + natural 5',
		'turn volume'
	];
	let combo = $state('shift + M1');
	let comboError = $state<{ message: string; offset: number } | null>(null);
	let shown = $state('');
	let running: AnimationHandle | null = null;

	function show(input = combo) {
		combo = input;
		try {
			shown = normalizeKeys(input);
			running = replica.animate(input);
			comboError = null;
		} catch (error) {
			if (!(error instanceof KeyParseError)) throw error;
			comboError = { message: error.message, offset: error.offset };
			shown = '';
		}
	}

	function stop() {
		running?.cancel();
		running = null;
	}

	// ── LEDs
	const LED_STATES: KeyLedState[] = ['off', 'dim', 'white', 'red'];
	let ledKey = $state<KeyId>('track.1');
	let chase = $state(false);
	const steps = Array.from({ length: 16 }, (_, i) => `step.${i + 1}` as KeyId);

	function pattern() {
		replica.clearLeds();
		replica.setLeds({
			'track.1': 'white',
			'step.1': 'white',
			'step.5': 'white',
			'step.9': 'white',
			'step.13': 'white'
		});
	}

	function auxTrack() {
		replica.clearLeds();
		replica.setLeds({ 'track.7': 'red', 'step.3': 'red', 'step.11': 'red' });
	}

	function chord() {
		replica.setLeds({ 'keyboard.c4': 'white', 'keyboard.e4': 'white', 'keyboard.g4': 'white' });
	}

	function countIn() {
		replica.setLed('step.1', 'red', { blink: true });
	}

	function allOff() {
		chase = false;
		replica.clearLeds();
	}

	// A playhead chasing over the pattern: the previous LED goes back to what the pattern had.
	$effect(() => {
		if (!chase) return;
		let position = 0;
		let saved: KeyLedState = 'off';
		const timer = setInterval(() => {
			const previous = steps[(position + 15) % 16];
			if (replica.led(previous) === 'white' && saved !== 'white') replica.setLed(previous, saved);
			const current = steps[position];
			saved = replica.led(current);
			replica.setLed(current, 'white');
			position = (position + 1) % 16;
		}, 125);
		return () => {
			clearInterval(timer);
			replica.setLed(steps[(position + 15) % 16], saved);
		};
	});

	// ── screen and meter
	let screenText = $state('tempo\n120.0');
	let level = $state(0);
	let liveMeter = $state(false);

	$effect(() => {
		if (!liveMeter) return;
		let t = 0;
		const timer = setInterval(() => {
			t += 1;
			const beat = Math.max(0, Math.sin((t / 8) * Math.PI));
			replica.setMeter(Math.min(1, 0.25 + 0.6 * beat ** 3 + Math.random() * 0.12));
		}, 60);
		return () => {
			clearInterval(timer);
			replica.setMeter(level);
		};
	});

	const fit = ART_SOURCE.residual;
	const coverage = ART_SOURCE.coverage;
</script>

<svelte:head>
	<title>Replica · OP-XY Agent</title>
</svelte:head>

<div class="bench">
	<header class="bench__head">
		<p class="eyebrow">dev · milestone M2</p>
		<h1>replica</h1>
		<p class="lede">
			Built from TE's panel drawing: {coverage.legendKeys} legends, {ART_SOURCE.measured
				.grilleHoles}
			grille holes, fitted to controls.json within {fit.rms} mm rms ({fit.max} mm max). Click, drag, scroll
			and tab through it; alt-click latches a key.
		</p>
		<a class="back" href={resolve('/')}>← app</a>
	</header>

	<section class="stage" aria-label="replica">
		<Replica {replica} />
	</section>

	<section class="controls">
		<div class="card">
			<h2>simulator</h2>
			<p class="hint mono" aria-live="polite">{simulate ? status : 'off: the screen shows text'}</p>
			<div class="chips">
				<button
					class="chip"
					type="button"
					aria-pressed={simulate}
					onclick={() => (simulate = !simulate)}
				>
					drive screen + LEDs
				</button>
				<button class="chip" type="button" onclick={resetSim}>new project</button>
				<button class="chip" type="button" onclick={() => sim.press('key.play')}>
					{sim.state.transport.playing ? 'pause' : 'play'}
				</button>
			</div>
			<p class="hint">
				Press keys and turn encoders on the replica: mode keys, M1–M4, T1–T8, shift layers, tempo /
				project / com. The LED buttons below are overwritten while the simulator drives.
			</p>
		</div>

		{#if dev}
			<div class="card card--compare">
				<h2>screen vs guide art <span class="count">dev</span></h2>
				<div class="row">
					<select
						class="field"
						bind:value={scenarioId}
						onchange={() => applyScenario(scenarioId)}
						aria-label="guide picture"
					>
						<option value="" disabled>choose a guide picture…</option>
						{#each SCENARIOS as s (s.id)}
							<option value={s.id}>{s.title}</option>
						{/each}
					</select>
					<label class="row check">
						<input type="checkbox" bind:checked={difference} />
						<span>difference</span>
					</label>
				</div>
				<div class="compare" class:compare--difference={difference}>
					<figure>
						<canvas width="960" height="444" {@attach ours}></canvas>
						<figcaption>ours (live)</figcaption>
					</figure>
					<figure>
						{#if data.guide?.src && data.guide.id === scenarioId}
							<img src={data.guide.src} alt="TE's guide picture of {scenario?.title}" />
						{:else if scenarioId}
							<p class="hint">
								No picture: the research input is missing (scripts/fetch-research.sh).
							</p>
						{/if}
						<figcaption>TE's guide</figcaption>
					</figure>
				</div>
				{#if scenario?.note}
					<p class="hint">{scenario.note}</p>
				{/if}
			</div>
		{/if}

		<div class="card">
			<h2>show a combo</h2>
			<form
				class="row"
				onsubmit={(event) => {
					event.preventDefault();
					show();
				}}
			>
				<input
					class="field mono"
					bind:value={combo}
					aria-label="key combo"
					aria-invalid={comboError !== null}
					spellcheck="false"
					autocomplete="off"
				/>
				<button class="btn btn--primary" type="submit">show</button>
				<button class="btn" type="button" onclick={stop}>stop</button>
			</form>
			{#if comboError}
				<p class="error mono" role="alert">
					<span
						>{combo.slice(0, comboError.offset)}<mark>{combo.slice(comboError.offset) || ' '}</mark
						></span
					>
					<span>{comboError.message}</span>
				</p>
			{:else if shown}
				<p class="hint mono">{shown}</p>
			{/if}
			<div class="chips">
				{#each PRESETS as preset (preset)}
					<button class="chip mono" type="button" onclick={() => show(preset)}>{preset}</button>
				{/each}
			</div>
		</div>

		<div class="card">
			<h2>LEDs</h2>
			<div class="chips">
				<button class="chip" type="button" onclick={pattern}>instrument pattern</button>
				<button class="chip" type="button" onclick={auxTrack}>aux track (red)</button>
				<button class="chip" type="button" onclick={chord}>C major chord</button>
				<button class="chip" type="button" onclick={countIn}>count-in blink</button>
				<button class="chip" type="button" aria-pressed={chase} onclick={() => (chase = !chase)}>
					playhead chase
				</button>
				<button class="chip" type="button" onclick={allOff}>all off</button>
			</div>
			<div class="row">
				<select class="field" bind:value={ledKey} aria-label="LED key">
					{#each LED_KEYS as key (key.id)}
						<option value={key.id}>{key.label}</option>
					{/each}
				</select>
				{#each LED_STATES as state (state)}
					<button class="btn" type="button" onclick={() => replica.setLed(ledKey, state)}
						>{state}</button
					>
				{/each}
			</div>
		</div>

		<div class="card">
			<h2>screen · meter</h2>
			<textarea
				class="field mono"
				rows="3"
				bind:value={screenText}
				oninput={() => replica.setScreen(screenText)}
				aria-label="screen text"></textarea>
			<label class="row slider">
				<span>level</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					bind:value={level}
					oninput={() => replica.setMeter(level)}
					disabled={liveMeter}
				/>
			</label>
			<label class="row check">
				<input type="checkbox" bind:checked={liveMeter} />
				<span>simulate audio</span>
			</label>
			<p class="hint">
				shift {replica.shift ? 'held' : 'up'} · volume {Math.round(replica.volume * 100)} · bend
				{replica.bend.toFixed(2)}
				{#if replica.pressed.length}· down: {replica.pressed.join(', ')}{/if}
			</p>
		</div>

		<div class="card card--log">
			<h2>events <span class="count">{events.length ? events[0].n : ''}</span></h2>
			{#if events.length === 0}
				<p class="hint">Press, turn or bend something. Animations emit nothing.</p>
			{:else}
				<ol class="log mono">
					{#each events as event (event.n)}
						<li>
							<span class="log__at">{event.at}</span>
							<span>{event.text}</span>
							<span class="log__src">{event.source}</span>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</section>
</div>

<style>
	.bench {
		--bench-gap: clamp(1rem, 2.5vw, 2rem);
		display: grid;
		gap: var(--bench-gap);
		width: min(100%, 96rem);
		margin: 0 auto;
		padding: var(--bench-gap) clamp(1rem, 4vw, 3.5rem) calc(var(--bench-gap) * 2);
		color: var(--xy-fg, #f7f5f5);
		font-family: var(--xy-font-sans, system-ui, sans-serif);
	}

	.bench__head {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: end;
		column-gap: 1rem;
	}

	.eyebrow {
		grid-column: 1 / -1;
		margin: 0;
		color: var(--xy-fg-subtle, #96969b);
		font-size: var(--xy-text-xs, 0.75rem);
		letter-spacing: 0.04em;
	}

	h1 {
		margin: 0.25rem 0 0.5rem;
		font-size: var(--xy-text-2xl, 2.25rem);
		font-weight: var(--xy-weight-light, 300);
		letter-spacing: var(--xy-tracking-display, -0.012em);
	}

	.lede {
		grid-column: 1;
		max-width: 46rem;
		margin: 0;
		color: var(--xy-fg-muted, #afafb4);
		font-size: var(--xy-text-sm, 0.875rem);
		line-height: 1.5;
	}

	.back {
		grid-row: 2 / span 2;
		grid-column: 2;
		align-self: start;
		color: var(--xy-fg-muted, #afafb4);
		font-size: var(--xy-text-sm, 0.875rem);
		text-decoration: none;
	}

	.back:hover,
	.back:focus-visible {
		color: var(--xy-fg, #f7f5f5);
	}

	/* room for the switch tab and the pitch-bend pad, which sit just outside the body */
	.stage {
		padding: clamp(0.5rem, 2vw, 2rem) clamp(0.75rem, 2vw, 2rem) clamp(1.5rem, 3vw, 3rem);
	}

	.card--compare {
		grid-column: 1 / -1;
	}

	.compare {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
		gap: 1rem;
	}

	.compare figure {
		display: grid;
		gap: 0.375rem;
		margin: 0;
	}

	.compare canvas,
	.compare img {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 0.5rem;
		background: #000000;
	}

	.compare figcaption {
		color: var(--xy-fg-subtle, #96969b);
		font-size: var(--xy-text-xs, 0.75rem);
	}

	/* difference: TE's picture over ours; matching pixels go black */
	.compare--difference {
		grid-template-columns: 1fr;
	}

	.compare--difference figure {
		grid-area: 1 / 1;
	}

	.compare--difference figure + figure img {
		mix-blend-mode: difference;
	}

	.compare--difference figcaption {
		display: none;
	}

	.controls {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
		gap: 1rem;
	}

	.card {
		display: grid;
		align-content: start;
		gap: 0.75rem;
		min-width: 0;
		padding: 1rem 1.125rem 1.125rem;
		border: 1px solid var(--xy-line, #2f2f37);
		border-radius: var(--xy-radius-tile, 0.3125rem);
		background: var(--xy-surface, #16161e);
	}

	h2 {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		margin: 0;
		color: var(--xy-fg-muted, #afafb4);
		font-size: var(--xy-text-sm, 0.875rem);
		font-weight: var(--xy-weight-regular, 400);
	}

	.count {
		color: var(--xy-fg-faint, #7a7a82);
		font-size: var(--xy-text-xs, 0.75rem);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.mono {
		font-family: var(--xy-font-mono, ui-monospace, monospace);
	}

	.field {
		flex: 1;
		min-width: 0;
		padding: 0.5rem 0.625rem;
		border: 1px solid var(--xy-line-strong, #484850);
		border-radius: var(--xy-radius-tile, 0.3125rem);
		background: var(--xy-surface-sunken, #0a0a0d);
		color: inherit;
		font-size: var(--xy-text-sm, 0.875rem);
	}

	textarea.field {
		resize: vertical;
	}

	.field:focus-visible,
	.btn:focus-visible,
	.chip:focus-visible {
		outline: 2px solid var(--xy-focus, #f7f5f5);
		outline-offset: 2px;
	}

	.btn,
	.chip {
		padding: 0.4375rem 0.75rem;
		border: 1px solid var(--xy-line-strong, #484850);
		border-radius: var(--xy-radius-tile, 0.3125rem);
		background: var(--xy-surface-raised, #2f2f37);
		color: inherit;
		font: inherit;
		font-size: var(--xy-text-sm, 0.875rem);
		cursor: pointer;
	}

	.btn:hover,
	.chip:hover {
		background: var(--xy-ramp-2, #484850);
	}

	.btn--primary {
		border-color: transparent;
		background: var(--xy-ramp-7, #f7f5f5);
		color: var(--xy-ink, #0f0e12);
	}

	.btn--primary:hover {
		background: #ffffff;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.chip {
		padding: 0.3125rem 0.625rem;
		border-radius: 999px;
		font-size: var(--xy-text-xs, 0.75rem);
	}

	.chip[aria-pressed='true'] {
		border-color: var(--xy-ramp-7, #f7f5f5);
		background: var(--xy-ramp-2, #484850);
	}

	.hint {
		margin: 0;
		color: var(--xy-fg-subtle, #96969b);
		font-size: var(--xy-text-xs, 0.75rem);
		line-height: 1.5;
	}

	.error {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		color: var(--xy-accent-text, #ff4d00);
		font-size: var(--xy-text-xs, 0.75rem);
	}

	.error mark {
		background: none;
		color: inherit;
		text-decoration: underline wavy;
	}

	.slider input {
		flex: 1;
		accent-color: var(--xy-ramp-7, #f7f5f5);
	}

	.slider span,
	.check span {
		color: var(--xy-fg-muted, #afafb4);
		font-size: var(--xy-text-sm, 0.875rem);
	}

	.check input {
		accent-color: var(--xy-ramp-7, #f7f5f5);
	}

	.log {
		display: grid;
		gap: 0.125rem;
		max-height: 13rem;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
		font-size: var(--xy-text-xs, 0.75rem);
	}

	.log li {
		display: grid;
		grid-template-columns: 4.5rem 1fr auto;
		gap: 0.5rem;
	}

	.log li:first-child {
		color: var(--xy-fg, #f7f5f5);
	}

	.log li:not(:first-child) {
		color: var(--xy-fg-muted, #afafb4);
	}

	.log__at {
		color: var(--xy-fg-faint, #7a7a82);
		text-align: right;
	}

	.log__src {
		color: var(--xy-fg-faint, #7a7a82);
	}
</style>
