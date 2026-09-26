<!--
@component
The OP-XY replica: an SVG in millimetres (`viewBox="0 0 285 102"`, the body without the switch
tab) built from TE's own panel drawing and `knowledge/opxy/controls.json`, with the display as a
480 × 222 canvas laid exactly over the active screen area. It fills the width of its container;
the power-switch tab and the pitch-bend pad reach just outside that box, as on the device.

Everything reactive lives in the `ReplicaState` you pass in. Keys share one Tab stop (arrow keys
move between them); encoders, the volume knob and the pitch bend each have their own.

```svelte
<script lang="ts">
	const replica = new ReplicaState({ onPress: (e) => console.log(e.id) });
</script>

<Replica {replica} />
```
-->
<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { ClassValue } from 'svelte/elements';
	import type { KeyId } from '$lib/core/opxy';
	import Body from './Body.svelte';
	import Encoder from './Encoder.svelte';
	import Grille from './Grille.svelte';
	import Key from './Key.svelte';
	import LevelMeter from './LevelMeter.svelte';
	import PitchStrip from './PitchStrip.svelte';
	import ReplicaDefs from './ReplicaDefs.svelte';
	import Screen from './Screen.svelte';
	import VolumeKnob from './VolumeKnob.svelte';
	import { BODY_RADIUS, ENCODER_PARTS, KEY_PARTS, PANEL_H, PANEL_W, SCREEN_PART } from './geometry';
	import type { ReplicaState } from './state.svelte';

	interface Props {
		replica: ReplicaState;
		/** Accessible name of the instrument. */
		label?: string;
		/** A barely perceptible satin grain over the body (off = perfectly smooth). */
		grain?: boolean;
		class?: ClassValue;
	}

	let { replica, label = 'OP-XY replica', grain = true, class: className }: Props = $props();

	/** The key that holds the keys' single Tab stop. */
	let focusKey = $state<KeyId>('key.play');
	let svg: SVGSVGElement | null = null;

	const active = SCREEN_PART.active;
	const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(4)}%`;
	const screenBox = {
		left: pct(active.x, PANEL_W),
		top: pct(active.y, PANEL_H),
		width: pct(active.w, PANEL_W),
		height: pct(active.h, PANEL_H),
		radius: `${pct(active.r, active.w)} / ${pct(active.r, active.h)}`
	};
	const bodyRadius = `${pct(BODY_RADIUS, PANEL_W)} / ${pct(BODY_RADIUS, PANEL_H)}`;

	const keepSvg: Attachment<SVGSVGElement> = (element) => {
		svg = element;
		return () => {
			svg = null;
		};
	};

	/** Moves focus to the nearest key in a direction, preferring keys in line. */
	function navigate(from: KeyId, dx: number, dy: number) {
		const origin = KEY_PARTS.find((k) => k.id === from);
		if (!origin) return;
		let best: KeyId | null = null;
		let bestScore = Infinity;
		for (const k of KEY_PARTS) {
			const ex = k.x - origin.x;
			const ey = k.y - origin.y;
			const along = ex * dx + ey * dy;
			if (along < 1) continue;
			const score = along + 2.5 * Math.abs(ex * dy - ey * dx);
			if (score < bestScore) {
				bestScore = score;
				best = k.id;
			}
		}
		if (!best) return;
		focusKey = best;
		svg?.querySelector<SVGGElement>(`[data-id="${best}"]`)?.focus();
	}
</script>

<div
	class={['replica', className]}
	role="group"
	aria-label={label}
	style:--rx-body-radius={bodyRadius}
>
	<svg
		class="replica__svg"
		viewBox="0 0 {PANEL_W} {PANEL_H}"
		xmlns="http://www.w3.org/2000/svg"
		{@attach keepSvg}
	>
		<ReplicaDefs />
		<Body />
		<Grille />
		<VolumeKnob {replica} />
		{#each ENCODER_PARTS as part (part.id)}
			<Encoder {part} {replica} />
		{/each}
		<g role="group" aria-label="keys">
			{#each KEY_PARTS as part (part.id)}
				<Key
					{part}
					{replica}
					tabbable={part.id === focusKey}
					onfocuskey={(id) => (focusKey = id)}
					onnavigate={navigate}
				/>
			{/each}
		</g>
		<LevelMeter level={replica.meter} />
		<PitchStrip {replica} />
		{#if grain}
			<rect
				class="replica__grain"
				width={PANEL_W}
				height={PANEL_H}
				rx={BODY_RADIUS}
				fill="url(#rx-grain)"
			/>
		{/if}
	</svg>
	<div
		class="replica__screen"
		style:left={screenBox.left}
		style:top={screenBox.top}
		style:width={screenBox.width}
		style:height={screenBox.height}
		style:border-radius={screenBox.radius}
	>
		<Screen lines={replica.screen.lines} />
	</div>
</div>

<style>
	.replica {
		/* device materials and motion, local to the replica (the design tokens where they exist) */
		--rx-led-white: #ffffff;
		--rx-led-red: var(--xy-red, #ff4d00);
		--rx-led-dim: #8a8a93;
		--rx-led-off: #0a0a0c;
		--rx-ring: var(--xy-ramp-7, #f7f5f5);
		--rx-focus: var(--xy-focus, #f7f5f5);
		--rx-press: var(--xy-dur-press, 50ms);
		--rx-release: var(--xy-dur-release, 140ms);
		--rx-ease-press: var(--xy-ease-press, cubic-bezier(0.3, 0, 0.1, 1));
		--rx-ease-release: var(--xy-ease-release, cubic-bezier(0.25, 1.45, 0.5, 1));
		--rx-led-attack: var(--xy-dur-led-on, 30ms);
		--rx-led-decay: var(--xy-dur-led-off, 260ms);
		--rx-ease-decay: var(--xy-ease-decay, cubic-bezier(0, 0, 0.2, 1));

		position: relative;
		width: 100%;
		aspect-ratio: 285 / 102;
		container-type: inline-size;
		user-select: none;
		-webkit-user-select: none;
	}

	/* the device's shadow on the desk, as a composited layer outside the SVG */
	.replica::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: var(--rx-body-radius);
		box-shadow:
			0 0.5cqw 1cqw rgb(0 0 0 / 0.45),
			0 2.2cqw 5cqw rgb(0 0 0 / 0.5);
		pointer-events: none;
	}

	.replica__svg {
		position: relative;
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}

	/* barely perceptible at normal zoom: a satin finish, not a texture */
	.replica__grain {
		opacity: 0.12;
		pointer-events: none;
	}

	.replica__screen {
		position: absolute;
		overflow: hidden;
		pointer-events: none;
	}
</style>
