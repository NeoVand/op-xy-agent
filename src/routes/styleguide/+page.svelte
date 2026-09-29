<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Button,
		Divider,
		EncoderDot,
		Icon,
		IconButton,
		Led,
		Legend,
		Panel,
		Readout,
		Switch,
		getTheme,
		icons,
		tooltip,
		type IconName
	} from '$lib/ui';
	import { KeyCombo } from '$lib/replica';
	import Section from './Section.svelte';
	import Swatch from './Swatch.svelte';

	const theme = getTheme();

	const sections = [
		{ id: 'principles', title: 'principles' },
		{ id: 'colour', title: 'colour' },
		{ id: 'type', title: 'type' },
		{ id: 'space', title: 'space' },
		{ id: 'shape', title: 'shape and depth' },
		{ id: 'motion', title: 'motion' },
		{ id: 'keys', title: 'keys' },
		{ id: 'surfaces', title: 'surfaces' },
		{ id: 'screen', title: 'screen language' },
		{ id: 'text', title: 'legends and combos' },
		{ id: 'indicators', title: 'indicators' }
	] as const;

	const principles = [
		{
			term: 'eight greys, one red',
			detail:
				'The device’s grey ramp is the entire neutral system. Red means live: recording, writing to the device, destroying something. Never decoration, never a link.'
		},
		{
			term: 'the tile is the unit',
			detail:
				'One tile is the 15.5 mm key pitch, 4rem on screen. Spacing, key sizes and radii are fractions of it, so the app and the instrument share one rhythm.'
		},
		{
			term: 'keys, not buttons',
			detail:
				'Controls are flat tiles carrying raised caps. They travel when pressed and snap back. Emphasis climbs the ramp from dark keys to the light key.'
		},
		{
			term: 'light means state',
			detail:
				'LEDs are off, dim, white or red. They snap on and decay off. The black screen is glass, used for values and anything the device itself would show.'
		}
	];

	const ramp = [
		{ hex: '#16161e', role: 'panels' },
		{ hex: '#2f2f37', role: 'keys, hairlines' },
		{ hex: '#484850', role: 'strong lines' },
		{ hex: '#616169', role: 'decorative' },
		{ hex: '#7a7a82', role: 'large faint text' },
		{ hex: '#96969b', role: 'subtle text' },
		{ hex: '#afafb4', role: 'muted text' },
		{ hex: '#f7f5f5', role: 'text, light key' }
	];

	const materials = [
		{ token: '--xy-mat-body', name: 'anodised body', hex: '#26282c' },
		{ token: '--xy-mat-rim', name: 'rim highlight', hex: '#45484f' },
		{ token: '--xy-mat-gap', name: 'tile gap', hex: '#08090b' },
		{ token: '--xy-mat-tile', name: 'tile', hex: '#2e2f32' },
		{ token: '--xy-mat-cap', name: 'keycap', hex: '#2b2c2f' },
		{ token: '--xy-mat-legend', name: 'legend print', hex: '#ecebe7' },
		{ token: '--xy-mat-glass', name: 'screen bezel', hex: '#141517' },
		{ token: '--xy-mat-switch', name: 'power switch', hex: '#d0cecb' }
	];

	const stepTones = [
		'#434448',
		'#5a6066',
		'#707479',
		'#8e9698',
		'#9a9fa3',
		'#afafaf',
		'#b7b5b3',
		'#cecbc9'
	];
	const encoderCaps = [
		{ n: 1, name: 'dark grey', hex: '#45484c' },
		{ n: 2, name: 'mid grey', hex: '#7c828c' },
		{ n: 3, name: 'light grey', hex: '#b5b5b6' },
		{ n: 4, name: 'white', hex: '#e9e9ea' }
	] as const;

	const semantic = [
		{ token: '--xy-bg', note: 'page' },
		{ token: '--xy-surface', note: 'panels' },
		{ token: '--xy-surface-raised', note: 'raised controls' },
		{ token: '--xy-surface-sunken', note: 'inputs, wells' },
		{ token: '--xy-line', note: 'hairlines' },
		{ token: '--xy-line-strong', note: 'emphasised lines' },
		{ token: '--xy-line-control', note: 'input borders, 3:1' },
		{ token: '--xy-fg', note: 'primary text' },
		{ token: '--xy-fg-muted', note: 'secondary text' },
		{ token: '--xy-fg-subtle', note: 'captions, min. for small text' },
		{ token: '--xy-fg-faint', note: 'large or disabled only' },
		{ token: '--xy-accent', note: 'red: live, record, destructive' },
		{ token: '--xy-focus', note: 'focus ring' }
	];

	const typeScale = [
		{ name: '5xl', size: 96, lead: 96, weight: 250, sample: '120' },
		{ name: '4xl', size: 72, lead: 72, weight: 250, sample: '16 steps' },
		{ name: '3xl', size: 48, lead: 52, weight: 250, sample: 'tempo 118' },
		{ name: '2xl', size: 36, lead: 40, weight: 300, sample: 'connect your op-xy' },
		{ name: 'xl', size: 24, lead: 32, weight: 300, sample: 'four scenes, one song' },
		{ name: 'lg', size: 18, lead: 28, weight: 400, sample: 'the device screen’s body size' },
		{
			name: 'base',
			size: 16,
			lead: 24,
			weight: 400,
			sample: 'Reading text: answers from the agent and pages of the manual.'
		},
		{ name: 'sm', size: 14, lead: 20, weight: 400, sample: 'keys, inputs, lists and panel titles' },
		{ name: 'xs', size: 12, lead: 16, weight: 450, sample: 'labels and legends' },
		{ name: '2xs', size: 11, lead: 16, weight: 450, sample: 'status bar and captions' }
	];

	const spacing = [
		{ n: 1, px: 4, tile: '1/16, the key gap' },
		{ n: 2, px: 8, tile: '1/8' },
		{ n: 3, px: 12, tile: '3/16' },
		{ n: 4, px: 16, tile: '1/4' },
		{ n: 6, px: 24, tile: '3/8' },
		{ n: 8, px: 32, tile: '1/2' },
		{ n: 12, px: 48, tile: '3/4' },
		{ n: 16, px: 64, tile: '1 tile' },
		{ n: 24, px: 96, tile: '1½, a wide accidental tile' },
		{ n: 32, px: 128, tile: '2, an encoder tile' }
	];

	const radii = [
		{ token: '--xy-radius-card', name: 'card', px: '4px', from: 'screen cards' },
		{ token: '--xy-radius-tile', name: 'tile', px: '5px', from: '1.25 mm tile corner' },
		{ token: '--xy-radius-screen', name: 'screen', px: '8px', from: 'display corners' },
		{ token: '--xy-radius-body', name: 'body', px: '20px', from: '5 mm body corner' },
		{ token: '--xy-radius-cap', name: 'cap', px: 'round', from: 'keycaps' }
	];

	const elevations = [
		{ token: '--xy-shadow-plate', name: 'plate', note: 'panels: a hairline edge' },
		{ token: '--xy-shadow-tile', name: 'tile', note: 'raised 2.4 mm, gap outline' },
		{ token: '--xy-shadow-cap', name: 'cap', note: 'raised 2 mm more' },
		{ token: '--xy-shadow-cap-pressed', name: 'cap, pressed', note: 'travel spent' },
		{ token: '--xy-shadow-recess', name: 'recess', note: 'inputs, slots' },
		{ token: '--xy-shadow-float', name: 'float', note: 'menus, popovers' }
	];

	const durations = [
		{ token: '--xy-dur-press', ms: 50, use: 'key goes down' },
		{ token: '--xy-dur-release', ms: 140, use: 'key comes back, small rebound' },
		{ token: '--xy-dur-led-on', ms: 30, use: 'LED attack' },
		{ token: '--xy-dur-led-off', ms: 260, use: 'LED decay' },
		{ token: '--xy-dur-step', ms: 55, use: 'one step of a chase' },
		{ token: '--xy-dur-quick', ms: 120, use: 'hover, colour' },
		{ token: '--xy-dur-base', ms: 200, use: 'small UI changes' },
		{ token: '--xy-dur-slow', ms: 360, use: 'panels opening' }
	];

	const combos = [
		'shift + M1',
		'record + play → play',
		'shift + steps → + natural 3',
		'T3 + M3',
		'step n + turn E1…E4',
		'hold com',
		'[-]/[+]',
		'key F#3'
	];

	const legendTones = [
		{ tone: 'fg', use: 'full strength' },
		{ tone: 'muted', use: 'everyday labels' },
		{ tone: 'subtle', use: 'captions' },
		{ tone: 'print', use: 'key legends' },
		{ tone: 'accent', use: 'recording, destructive' }
	] as const;

	const iconNames = Object.keys(icons) as IconName[];

	// Interactive demos
	let latched = $state(false);
	let trackLit = $state(true);
	let metronome = $state(true);
	let midiThru = $state(false);
	let ledDemo = $state(false);
	let chaseAt = $state(-1);
	let chaseTimer: ReturnType<typeof setInterval> | undefined;

	function runChase() {
		clearInterval(chaseTimer);
		chaseAt = 0;
		chaseTimer = setInterval(() => {
			chaseAt += 1;
			if (chaseAt > 16) {
				clearInterval(chaseTimer);
				chaseAt = -1;
			}
		}, 55);
	}

	onMount(() => () => clearInterval(chaseTimer));
</script>

<svelte:head>
	<title>OP-XY Agent styleguide</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="guide">
	<nav class="toc" aria-label="styleguide sections">
		<p class="toc__title">styleguide</p>
		<ol class="toc__list">
			{#each sections as s (s.id)}
				<li><a href="#{s.id}">{s.title}</a></li>
			{/each}
		</ol>
		<div class="toc__theme">
			<Switch
				label="dark theme"
				checked={theme.current === 'dark'}
				onchange={(dark) => theme.set(dark ? 'dark' : 'light')}
			/>
		</div>
	</nav>

	<div class="content">
		<header class="intro">
			<h1 class="intro__title">design system v0</h1>
			<p class="intro__lead">
				The OP-XY in the browser: black anodised panels, a ramp of eight greys, one red, round caps
				on square tiles, light lowercase type. Tokens live in <code>src/lib/ui/tokens.css</code>,
				the rules in <code>docs/DESIGN.md</code>.
			</p>
		</header>

		<Section id="principles" title="principles">
			<dl class="principles">
				{#each principles as p (p.term)}
					<div class="principle">
						<dt>{p.term}</dt>
						<dd>{p.detail}</dd>
					</div>
				{/each}
			</dl>
		</Section>

		<Section
			id="colour"
			title="colour"
			intro="The ramp does the work of a whole neutral palette. Emphasis climbs it: panels at the dark end, text at the light end."
		>
			<div class="ramp" role="list" aria-label="the grey ramp">
				{#each ramp as tone, i (tone.hex)}
					<div
						class="ramp__tile"
						role="listitem"
						style:background-color="var(--xy-ramp-{i})"
						data-light={i >= 5 || undefined}
					>
						<span class="ramp__name">ramp-{i}</span>
						<code class="ramp__hex">{tone.hex}</code>
						<span class="ramp__role">{tone.role}</span>
					</div>
				{/each}
			</div>

			<div class="colour-grid">
				<div class="colour-block">
					<h3 class="h3">signal</h3>
					<div class="swatches">
						<Swatch token="--xy-red" name="red" hex="#ff4d00" note="LEDs, record, live" />
						<Swatch token="--xy-red-screen" name="screen red" hex="#e5371b" note="on the display" />
						<Swatch
							token="--xy-red-text-on-paper"
							name="red on paper"
							hex="#c42e0f"
							note="text, light theme"
						/>
					</div>
				</div>
				<div class="colour-block">
					<h3 class="h3">ink and paper</h3>
					<div class="swatches">
						<Swatch token="--xy-ink" name="ink" hex="#0f0e12" note="dark page, light text" />
						<Swatch token="--xy-paper" name="paper" hex="#f7f5f5" note="light page, dark text" />
						<Swatch
							token="--xy-black"
							name="screen black"
							hex="#000000"
							note="display glass only"
						/>
					</div>
				</div>
			</div>

			<h3 class="h3">device materials</h3>
			<p class="note">
				Tones of the physical object, for the replica. They never change with the theme.
			</p>
			<div class="swatches swatches--wide">
				{#each materials as m (m.token)}
					<Swatch token={m.token} name={m.name} hex={m.hex} />
				{/each}
			</div>

			<div class="colour-grid">
				<div class="colour-block">
					<h3 class="h3">step tiles, in pairs</h3>
					<div class="steps" aria-label="step tile tones">
						{#each stepTones as hex, i (hex)}
							<span
								class="steps__tile"
								style:background-color={hex}
								title="steps {i * 2 + 1}–{i * 2 + 2}: {hex}"
							></span>
						{/each}
					</div>
				</div>
				<div class="colour-block">
					<h3 class="h3">encoder caps</h3>
					<div class="encoders">
						{#each encoderCaps as e (e.n)}
							<div class="encoders__item">
								<span class="encoders__dish"
									><span class="encoders__cap" style:background-color={e.hex}></span></span
								>
								<span class="encoders__name">{e.name}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<h3 class="h3">semantic tokens <span class="h3__aside">current theme</span></h3>
			<div class="swatches swatches--wide">
				{#each semantic as t (t.token)}
					<Swatch token={t.token} name={t.token.replace('--xy-', '')} note={t.note} />
				{/each}
			</div>
		</Section>

		<Section
			id="type"
			title="type"
			intro="Work Sans stands in for the device’s light Univers-style face. Red Hat Mono appears only where content is code: bytes, hex, versions."
		>
			<div class="families">
				<div class="family">
					<p class="family__specimen">aA gG yY tT 1234567890</p>
					<p class="family__meta">
						<span>Work Sans</span><span>variable 100–900, OFL 1.1</span>
					</p>
				</div>
				<div class="family family--mono">
					<p class="family__specimen">F0 00 20 76 01 F7</p>
					<p class="family__meta">
						<span>Red Hat Mono</span><span>variable 300–700, OFL 1.1</span>
					</p>
				</div>
			</div>

			<ol class="scale">
				{#each typeScale as t (t.name)}
					<li class="scale__row">
						<span class="scale__meta">
							<span class="scale__name">{t.name}</span>
							<span>{t.size}/{t.lead}</span>
							<span>weight {t.weight}</span>
						</span>
						<span
							class="scale__sample"
							style:font-size="var(--xy-text-{t.name})"
							style:line-height="var(--xy-leading-{t.name})"
							style:font-weight={t.weight}
							style:letter-spacing={t.size >= 36 ? 'var(--xy-tracking-display)' : undefined}
						>
							{t.sample}
						</span>
					</li>
				{/each}
			</ol>

			<div class="voice">
				<div>
					<h3 class="h3">voice</h3>
					<p class="note">
						Labels, keys and headings are lowercase, like the device. Full sentences keep sentence
						case. No bold: emphasis is size, tone or weight 500 at most.
					</p>
				</div>
				<div class="voice__examples">
					<Legend size="xs" tone="subtle">label</Legend>
					<p class="voice__heading">four scenes, one song</p>
					<p class="voice__body">Hold the scene key and press a step to copy it.</p>
				</div>
			</div>
		</Section>

		<Section
			id="space"
			title="space"
			intro="One tile is the 15.5 mm key pitch. The spacing scale is made of its sixteenths, so a 4px step is the gap between two keys."
		>
			<ol class="spacing">
				{#each spacing as sp (sp.n)}
					<li class="spacing__row">
						<code class="spacing__token">{sp.n}</code>
						<span class="spacing__bar" style:width="{sp.px}px"></span>
						<span class="spacing__meta">{sp.px}px <span class="spacing__tile">{sp.tile}</span></span
						>
					</li>
				{/each}
			</ol>
			<p class="note">
				In Tailwind: <code>p-4</code> is a quarter tile, <code>gap-1</code> the key gap and
				<code>size-pitch</code> one full tile.
			</p>
		</Section>

		<Section
			id="shape"
			title="shape and depth"
			intro="Every radius and shadow comes from a physical part, so hierarchy is built in: caps are round, tiles barely rounded, only the body is soft."
		>
			<div class="radii">
				{#each radii as r (r.token)}
					<div class="radii__item">
						<span class="radii__box" style:border-radius="var({r.token})"></span>
						<span class="radii__name">{r.name} <span class="radii__px">{r.px}</span></span>
						<span class="radii__from">{r.from}</span>
					</div>
				{/each}
			</div>
			<div class="depth">
				{#each elevations as e (e.token)}
					<div class="depth__item">
						<span class="depth__sample" style:box-shadow="var({e.token})"></span>
						<span class="radii__name">{e.name}</span>
						<span class="radii__from">{e.note}</span>
					</div>
				{/each}
			</div>
		</Section>

		<Section
			id="motion"
			title="motion"
			intro="Mechanical, not springy. Keys go down at once and come back with a small rebound; LEDs snap on and decay off. With reduced motion everything still changes state, instantly."
		>
			<div class="motion">
				<div class="motion__demo">
					<div class="chase" aria-hidden="true">
						{#each { length: 16 }, i}
							<span class="chase__step" style:background-color={stepTones[Math.floor(i / 2)]}>
								<Led state={chaseAt === i ? 'white' : 'off'} />
							</span>
						{/each}
					</div>
					<div class="motion__keys">
						<Button onclick={runChase}>run the playhead</Button>
						<Button toggle bind:pressed={ledDemo}>led {ledDemo ? 'on' : 'off'}</Button>
						<Led state={ledDemo ? 'white' : 'off'} size="lg" label={ledDemo ? 'lit' : 'off'} />
					</div>
				</div>
				<table class="table">
					<thead>
						<tr><th scope="col">token</th><th scope="col">ms</th><th scope="col">use</th></tr>
					</thead>
					<tbody>
						{#each durations as d (d.token)}
							<tr><td><code>{d.token}</code></td><td class="num">{d.ms}</td><td>{d.use}</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Section>

		<Section
			id="keys"
			title="keys"
			intro="Button, IconButton and Switch. A key is a tile holding a cap; text stretches the round cap into a stadium. Use one light key per view at most."
		>
			<div class="demo-grid">
				<div class="demo">
					<Legend as="h3" size="xs" tone="subtle">emphasis</Legend>
					<div class="row">
						<Button variant="primary">save</Button>
						<Button variant="secondary">duplicate</Button>
						<Button>rename</Button>
						<Button variant="ghost">cancel</Button>
					</div>
				</div>
				<div class="demo">
					<Legend as="h3" size="xs" tone="subtle">sizes</Legend>
					<div class="row row--end">
						<Button size="sm">small</Button>
						<Button>medium</Button>
						<Button size="lg">large</Button>
					</div>
				</div>
				<div class="demo">
					<Legend as="h3" size="xs" tone="subtle">states</Legend>
					<div class="row">
						<Button toggle bind:pressed={latched}>latch</Button>
						<Button busy>sending</Button>
						<Button disabled>disabled</Button>
						<Button>
							{#snippet icon()}<Icon name="record" class="red" />{/snippet}
							record
						</Button>
					</div>
				</div>
				<div class="demo">
					<Legend as="h3" size="xs" tone="subtle">icon keys, true to scale at lg</Legend>
					<div class="row row--end">
						<IconButton label="play" icon="play" size="lg" />
						<IconButton label="stop" icon="stop" size="lg" />
						<IconButton label="record" size="lg">
							<Icon name="record" class="red" />
						</IconButton>
						<IconButton label="track 1" size="lg" toggle bind:pressed={trackLit}>
							<span class="digit">1</span>
						</IconButton>
						<IconButton label="instrument" icon="sine" size="md" />
						<IconButton label="add" icon="plus" size="sm" variant="secondary" />
						<IconButton label="close" icon="close" size="sm" variant="ghost" />
					</div>
				</div>
				<div class="demo">
					<Legend as="h3" size="xs" tone="subtle">switch</Legend>
					<div class="stack">
						<Switch label="metronome" bind:checked={metronome} />
						<Switch
							label="send midi clock"
							description="Other gear follows the OP-XY’s tempo."
							bind:checked={midiThru}
						/>
						<Switch label="unavailable" disabled />
					</div>
				</div>
				<div class="demo">
					<Legend as="h3" size="xs" tone="subtle">tooltip</Legend>
					<div class="row">
						<Button {@attach tooltip('clears notes and parameter locks on this track')}
							>clear track</Button
						>
						<IconButton label="about this panel" icon="info" variant="ghost" />
					</div>
				</div>
			</div>
		</Section>

		<Section
			id="surfaces"
			title="surfaces"
			intro="Panel variants differ by material, not decoration: the anodised plate, black screen glass, the white card, and the recess."
		>
			<div class="surfaces">
				<Panel title="plate" variant="plate">
					<p class="surface-text">Carries controls. A hairline edge, the tile radius.</p>
				</Panel>
				<Panel title="screen" variant="screen">
					<p class="surface-text surface-text--screen">
						Black glass in both themes, for values and anything the device shows.
					</p>
				</Panel>
				<Panel title="card" variant="card">
					<p class="surface-text">
						The screen’s white card. Reserve it for the one thing that needs a decision.
					</p>
				</Panel>
				<Panel title="sunken" variant="sunken">
					<p class="surface-text">A recess for inputs, logs and wells.</p>
				</Panel>
			</div>
			<div class="dividers">
				<Legend size="xs" tone="subtle">hairline</Legend>
				<Divider />
				<Legend size="xs" tone="subtle">groove</Legend>
				<Divider variant="groove" />
			</div>
		</Section>

		<Section
			id="screen"
			title="screen language"
			intro="Readouts use the display’s grammar: warm white on black, tabular light numerals, and the encoder dot that ties a value to its knob."
		>
			<div class="header-bar" aria-label="engine header, four encoders">
				<Readout variant="cell" encoder={1} label="tone" value="42" />
				<Readout variant="cell" encoder={2} label="ratio" value="18" />
				<Readout variant="cell" encoder={3} label="shape" value="67" />
				<Readout variant="cell" encoder={4} label="tremolo" value="05" />
			</div>
			<div class="readouts">
				<Readout label="tempo" value="118.0" unit="bpm" size="lg" encoder={1} />
				<Readout label="cutoff" value="64" unit="%" encoder={2} />
				<Readout label="swing" value="12" size="sm" encoder={3} />
				<Readout label="level" value="-6.0" unit="dB" size="sm" encoder={4} />
			</div>
		</Section>

		<Section
			id="text"
			title="legends and combos"
			intro="Legend is the small text of the device. KeyCombo draws a key combo in the manual's grammar as the device's own keys, from the replica's art: + (hold, then press), → (then), and a name on hover."
		>
			<div class="demo-grid">
				<div class="demo">
					<Legend as="h3" size="xs" tone="subtle">legend tones</Legend>
					<div class="stack stack--tight">
						{#each legendTones as l (l.tone)}
							<div class="tone-row">
								<Legend tone={l.tone}>{l.tone}</Legend>
								<span class="tone-row__use">{l.use}</span>
							</div>
						{/each}
					</div>
				</div>
				<div class="demo">
					<Legend as="h3" size="xs" tone="subtle">combos</Legend>
					<ul class="combos">
						{#each combos as c (c)}
							<li><KeyCombo keys={c} /><code>{c}</code></li>
						{/each}
					</ul>
				</div>
			</div>
			<p class="prose-sample">
				Press <KeyCombo keys="shift + M1" /> to open the preset browser, then turn <KeyCombo
					keys="E1"
				/> to scroll the list.
			</p>
		</Section>

		<Section
			id="indicators"
			title="indicators"
			intro="LEDs and encoder dots. An LED is never the only cue: pair it with text or give it a label. On paper, LEDs are drawn the way TE’s guide draws them: lit is an ink dot, dim is grey."
		>
			<div class="demo-grid">
				<div class="demo">
					<Legend as="h3" size="xs" tone="subtle">led states</Legend>
					<div class="leds">
						<span class="leds__item"><Led state="off" size="lg" />off</span>
						<span class="leds__item"><Led state="dim" size="lg" />dim</span>
						<span class="leds__item"><Led state="white" size="lg" />white</span>
						<span class="leds__item"><Led state="red" size="lg" />red</span>
						<span class="leds__item"><Led state="white" size="lg" blink="slow" />blink</span>
					</div>
				</div>
				<div class="demo">
					<Legend as="h3" size="xs" tone="subtle">encoder dots</Legend>
					<div class="leds">
						{#each encoderCaps as e (e.n)}
							<span class="leds__item"
								><EncoderDot encoder={e.n} size="0.75rem" labelled />{e.name}</span
							>
						{/each}
					</div>
				</div>
				<div class="demo demo--span">
					<Legend as="h3" size="xs" tone="subtle">icons, 24-unit grid</Legend>
					<div class="icons">
						{#each iconNames as name (name)}
							<span class="icons__item"><Icon {name} size="1.5rem" /><code>{name}</code></span>
						{/each}
					</div>
				</div>
			</div>
		</Section>
	</div>
</div>

<style>
	.guide {
		display: grid;
		grid-template-columns: 11rem minmax(0, 1fr);
		gap: 3.5rem;
		width: 100%;
		max-width: 82rem;
		margin-inline: auto;
		padding: 2.5rem clamp(1rem, 4vw, 3rem) 5rem;
	}

	/* ---------- table of contents */
	.toc {
		position: sticky;
		top: 1.5rem;
		align-self: start;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.toc__title {
		margin: 0;
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
	}

	.toc__list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
	}

	.toc__list a {
		display: block;
		padding: 0.3125rem 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		text-decoration: none;
		transition: color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.toc__list a:hover {
		color: var(--xy-fg);
	}

	.toc__theme {
		padding-top: 1rem;
		border-top: 1px solid var(--xy-line);
	}

	/* ---------- intro */
	.intro {
		padding-bottom: 3rem;
	}

	.intro__title {
		margin: 0;
		font-size: var(--xy-text-3xl);
		line-height: var(--xy-leading-3xl);
		font-weight: var(--xy-weight-thin);
		letter-spacing: var(--xy-tracking-display);
	}

	.intro__lead {
		margin: 1rem 0 0;
		max-width: 40rem;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-lg);
		line-height: var(--xy-leading-lg);
	}

	code {
		color: var(--xy-fg-muted);
	}

	.h3 {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		margin: 2.25rem 0 1rem;
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		font-weight: var(--xy-weight-regular);
		color: var(--xy-fg);
	}

	.h3__aside,
	.note {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}

	.note {
		margin: -0.5rem 0 1.25rem;
		max-width: 40rem;
	}

	/* ---------- principles */
	.principles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 1px;
		margin: 0;
		background-color: var(--xy-line);
		border: 1px solid var(--xy-line);
		border-radius: var(--xy-radius-tile);
		overflow: hidden;
	}

	.principle {
		padding: 1.25rem 1.25rem 1.5rem;
		background-color: var(--xy-bg);
	}

	.principle dt {
		font-size: var(--xy-text-lg);
		line-height: var(--xy-leading-lg);
		font-weight: var(--xy-weight-light);
	}

	.principle dd {
		margin: 0.5rem 0 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}

	/* ---------- colour */
	.ramp {
		display: grid;
		grid-template-columns: repeat(8, minmax(0, 1fr));
		gap: var(--xy-gap);
		padding: var(--xy-gap);
		border-radius: calc(var(--xy-radius-tile) + var(--xy-gap));
		background-color: var(--xy-mat-gap);
	}

	.ramp__tile {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 0.125rem;
		min-height: 8.5rem;
		padding: 0.625rem;
		border-radius: var(--xy-radius-tile);
		color: var(--xy-paper);
	}

	.ramp__tile[data-light] {
		color: var(--xy-ink);
	}

	.ramp__name {
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}

	.ramp__hex,
	.ramp__role {
		color: inherit;
		opacity: 0.78;
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
	}

	.colour-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 0 3rem;
	}

	.swatches {
		display: grid;
		gap: 0.875rem;
	}

	.swatches--wide {
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: 1rem 1.5rem;
	}

	.steps {
		display: flex;
		gap: var(--xy-gap);
	}

	.steps__tile {
		flex: 1;
		height: 2.75rem;
		border-radius: var(--xy-radius-tile);
	}

	.encoders {
		display: flex;
		gap: 1.25rem;
	}

	.encoders__item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.encoders__dish {
		display: grid;
		place-items: center;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 50%;
		background-color: var(--xy-mat-tile);
		box-shadow:
			inset 0 1px 2px rgb(0 0 0 / 0.5),
			0 0 0 1px var(--xy-mat-gap);
	}

	.encoders__cap {
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 50%;
		box-shadow:
			0 0 0 3px #16161a,
			0 2px 4px 3px rgb(0 0 0 / 0.5),
			inset 0 1px 0 rgb(255 255 255 / 0.35);
	}

	.encoders__name {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
	}

	/* ---------- type */
	.families {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: var(--xy-gap);
		margin-bottom: 2rem;
	}

	.family {
		padding: 1.5rem 1.25rem 1rem;
		border-radius: var(--xy-radius-tile);
		box-shadow: var(--xy-shadow-plate);
		background-color: var(--xy-surface);
	}

	.family__specimen {
		margin: 0;
		font-size: var(--xy-text-2xl);
		line-height: var(--xy-leading-2xl);
		font-weight: var(--xy-weight-light);
	}

	.family--mono .family__specimen {
		font-family: var(--xy-font-mono);
		font-size: var(--xy-text-xl);
		font-weight: var(--xy-weight-light);
	}

	.family__meta {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin: 1rem 0 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
	}

	.family__meta span:first-child {
		color: var(--xy-fg);
	}

	.scale {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.scale__row {
		display: grid;
		grid-template-columns: 8rem minmax(0, 1fr);
		align-items: baseline;
		gap: 1.5rem;
		padding-block: 0.75rem;
		border-top: 1px solid var(--xy-line);
	}

	.scale__meta {
		display: flex;
		flex-direction: column;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-variant-numeric: tabular-nums;
	}

	.scale__name {
		color: var(--xy-fg);
	}

	.scale__sample {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.voice {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1rem 3rem;
		margin-top: 1rem;
	}

	.voice__examples {
		padding: 1.25rem;
		border-radius: var(--xy-radius-tile);
		box-shadow: var(--xy-shadow-plate);
		background-color: var(--xy-surface);
	}

	.voice__heading {
		margin: 0.25rem 0 0;
		font-size: var(--xy-text-xl);
		line-height: var(--xy-leading-xl);
		font-weight: var(--xy-weight-light);
	}

	.voice__body {
		margin: 0.375rem 0 0;
		color: var(--xy-fg-muted);
	}

	/* ---------- space */
	.spacing {
		margin: 0 0 1.5rem;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.spacing__row {
		display: grid;
		grid-template-columns: 2rem 8.5rem minmax(0, 1fr);
		align-items: center;
		gap: 1rem;
	}

	.spacing__token {
		text-align: right;
		font-size: var(--xy-text-xs);
	}

	.spacing__bar {
		height: 0.75rem;
		border-radius: 2px;
		background-color: var(--xy-ramp-5);
	}

	.spacing__meta {
		color: var(--xy-fg);
		font-size: var(--xy-text-xs);
		font-variant-numeric: tabular-nums;
	}

	.spacing__tile {
		margin-left: 0.5rem;
		color: var(--xy-fg-subtle);
	}

	/* ---------- shape + depth */
	.radii,
	.depth {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
		gap: 1.5rem;
	}

	.depth {
		margin-top: 2.5rem;
	}

	.radii__item,
	.depth__item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.radii__box {
		width: 5rem;
		height: 5rem;
		margin-bottom: 0.5rem;
		background-color: var(--xy-surface-raised);
		box-shadow: inset 0 0 0 1px var(--xy-line-strong);
	}

	.depth__sample {
		width: 5rem;
		height: 5rem;
		margin-bottom: 0.5rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-key-tile);
	}

	.radii__name {
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
	}

	.radii__px,
	.radii__from {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
	}

	/* ---------- motion */
	.motion {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
		gap: 2rem 3rem;
		align-items: start;
	}

	.motion__demo {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.chase {
		display: grid;
		grid-template-columns: repeat(16, minmax(0, 1fr));
		gap: 3px;
		padding: 3px;
		border-radius: 7px;
		background-color: var(--xy-mat-gap);
	}

	.chase__step {
		display: grid;
		place-items: start center;
		aspect-ratio: 1;
		padding-top: 18%;
		border-radius: 3px;
	}

	.motion__keys {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}

	.table th {
		padding: 0 0 0.5rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		font-weight: 450;
		text-align: left;
	}

	.table td {
		padding: 0.4375rem 0.75rem 0.4375rem 0;
		border-top: 1px solid var(--xy-line);
		color: var(--xy-fg-muted);
	}

	.table td code {
		font-size: var(--xy-text-xs);
	}

	.num {
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	/* ---------- demos */
	.demo-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
		gap: var(--xy-gap);
	}

	.demo {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface);
		box-shadow: var(--xy-shadow-plate);
	}

	.demo--span {
		grid-column: 1 / -1;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.625rem;
	}

	.row--end {
		align-items: flex-end;
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.stack--tight {
		gap: 0.5rem;
	}

	.digit {
		font-size: 1em;
		font-weight: var(--xy-weight-light);
		line-height: 1;
	}

	:global(.red) {
		color: var(--xy-red);
	}

	.surfaces {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 1.25rem;
	}

	.surface-text {
		margin: 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}

	.surface-text--screen {
		color: var(--xy-scr-muted);
	}

	.dividers {
		display: grid;
		gap: 0.75rem;
		max-width: 30rem;
		margin-top: 2.5rem;
	}

	/* The header bar lives at the top of the black screen, so show it on a strip of glass. */
	.header-bar {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		max-width: 40rem;
		padding-bottom: 2.5rem;
		border-radius: var(--xy-radius-screen);
		background-color: var(--xy-scr-bg);
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 0.07),
			0 0 0 3px var(--xy-mat-glass);
		overflow: hidden;
	}

	.header-bar :global(.readout--cell) {
		min-width: 0;
	}

	.readouts {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 1.25rem;
		margin-top: 2rem;
	}

	.combos {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.combos li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.combos code {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
	}

	.prose-sample {
		margin: 1.5rem 0 0;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-base);
		line-height: 2rem;
	}

	.tone-row {
		display: grid;
		grid-template-columns: 4rem minmax(0, 1fr);
		align-items: baseline;
		gap: 1rem;
	}

	.tone-row__use {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
	}

	.leds {
		display: flex;
		flex-wrap: wrap;
		gap: 1.25rem;
	}

	.leds__item {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-sm);
	}

	.icons {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
		gap: 1rem;
	}

	.icons__item {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		color: var(--xy-fg);
	}

	.icons__item code {
		font-size: var(--xy-text-xs);
		color: var(--xy-fg-subtle);
	}

	@media (max-width: 56rem) {
		.guide {
			grid-template-columns: minmax(0, 1fr);
			gap: 1.5rem;
		}

		.toc {
			position: static;
		}

		.toc__list {
			flex-direction: row;
			flex-wrap: wrap;
			gap: 0 1rem;
		}
	}

	@media (max-width: 40rem) {
		.intro__title {
			font-size: var(--xy-text-2xl);
			line-height: var(--xy-leading-2xl);
		}

		.ramp {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}

		.ramp__tile {
			min-height: 6.5rem;
		}

		.scale__row {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.25rem;
		}

		.spacing__row {
			grid-template-columns: 1.5rem 5rem minmax(0, 1fr);
		}

		.spacing__bar {
			max-width: 5rem;
		}
	}
</style>
