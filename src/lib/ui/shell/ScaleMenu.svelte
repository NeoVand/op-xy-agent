<!--
@component
Lights a scale on the replica's keyboard (`app/scale-guide`): a small key on the caption line opens
a card with a one-octave keyboard to pick the root and a key for each scale; the scale's keys then
light up, the root brightest with a ring. While one is lit its name sits beside the key, with an ×
that turns it off.

The card opens under the caption line, over the strip below the device, so it never covers the
keys it lights, and it keeps one size whatever is picked (its off key is always there, dim while
nothing is lit). It is placed against the nearest positioned ancestor, the caption row (the home
page makes it one), and is at most as wide. Esc or its × closes it; picking goes on while the
replica plays.
-->
<script lang="ts">
	import { MusicNote02Icon } from '@hugeicons/core-free-icons';
	import { GUIDE_SCALES, type ScaleGuide } from '$lib/app';
	import { Button, Legend, ToolButton, tooltip } from '$lib/ui';

	interface Props {
		guide: ScaleGuide;
		/** A drum track is selected: its keys are sounds, so nothing is lit now. */
		drums?: boolean;
	}

	let { guide, drums = false }: Props = $props();

	let open = $state(false);

	/** One octave as a keyboard draws it: the white keys, then the black ones between them. */
	const WHITE = [0, 2, 4, 5, 7, 9, 11];
	const BLACK = [
		{ pc: 1, after: 0 },
		{ pc: 3, after: 1 },
		{ pc: 6, after: 3 },
		{ pc: 8, after: 4 },
		{ pc: 10, after: 5 }
	];

	const tip = $derived(
		guide.label ? `${guide.label} is lit on the keys` : 'light a scale on the keys'
	);
	const note = $derived(
		drums && guide.scale
			? 'a drum track’s keys are sounds: pick a melodic track to see it'
			: 'its keys light up, the root brightest'
	);

	function pickRoot(pc: number): void {
		guide.set(pc, guide.scale ?? GUIDE_SCALES[0]);
	}

	function off(): void {
		guide.set(guide.root, null);
	}

	/** Esc closes the card, before the page's own esc (which puts the large display away). */
	function onkeydown(event: KeyboardEvent): void {
		if (!open || event.key !== 'Escape' || event.defaultPrevented) return;
		event.preventDefault();
		event.stopPropagation();
		open = false;
	}
</script>

<svelte:window onkeydowncapture={onkeydown} />

<div class="scale">
	{#if guide.label}
		<!-- what is lit, and the way to turn it off, in view whenever a scale is on -->
		<span class={['lit', drums && 'lit--idle']}>
			<button
				type="button"
				class="lit__name"
				aria-expanded={open}
				aria-controls="scale-card"
				onclick={() => (open = !open)}
				{@attach tooltip(drums ? 'lit on a melodic track' : 'change the scale', {
					describe: false
				})}>{guide.label}</button
			>
			<button
				type="button"
				class="lit__off"
				aria-label="turn the scale off"
				onclick={off}
				{@attach tooltip('turn it off', { describe: false })}
			>
				<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5l5 5m0-5-5 5" /></svg>
			</button>
		</span>
	{/if}
	<ToolButton
		icon={MusicNote02Icon}
		label="scale"
		{tip}
		pressed={guide.scale !== null}
		aria-expanded={open}
		aria-controls="scale-card"
		onclick={() => (open = !open)}
	/>
	{#if open}
		<div class="scale__card" id="scale-card" role="group" aria-label="light a scale">
			<div class="scale__head">
				<Legend size="xs" tone="fg">{guide.label ?? 'light a scale'}</Legend>
				<span class="scale__note" title={note}
					><Legend size="2xs" tone="subtle">{note}</Legend></span
				>
				<button type="button" class="small" disabled={guide.scale === null} onclick={off}
					>off</button
				>
				<button
					type="button"
					class="small small--icon"
					aria-label="close"
					onclick={() => (open = false)}
				>
					<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5l5 5m0-5-5 5" /></svg>
				</button>
			</div>

			<div class="scale__body">
				<div class="octave" role="radiogroup" aria-label="root">
					{#each WHITE as pc, i (pc)}
						<button
							type="button"
							class="octave__key octave__key--white"
							style:--i={i}
							role="radio"
							aria-checked={guide.root === pc}
							aria-label={guide.names[pc]}
							onclick={() => pickRoot(pc)}
						>
							<span class="octave__name">{guide.names[pc]}</span>
						</button>
					{/each}
					{#each BLACK as key (key.pc)}
						<button
							type="button"
							class="octave__key octave__key--black"
							style:--after={key.after}
							role="radio"
							aria-checked={guide.root === key.pc}
							aria-label={guide.names[key.pc]}
							onclick={() => pickRoot(key.pc)}
						></button>
					{/each}
				</div>

				<div class="scale__list" role="radiogroup" aria-label="scale">
					{#each GUIDE_SCALES as scale (scale.name)}
						<Button
							size="sm"
							variant="ghost"
							pressed={guide.scale?.name === scale.name}
							onclick={() => guide.set(guide.root, scale)}>{scale.name}</Button
						>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* not positioned: the card sits against the caption row it is on */
	.scale {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	/* the card's own small keys: off, and close */
	.small {
		display: inline-grid;
		place-items: center;
		flex: none;
		min-width: 1.5rem;
		height: 1.5rem;
		padding: 0 0.5rem;
		border: 1px solid var(--xy-line-strong);
		border-radius: var(--xy-radius-tile);
		background: none;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-2xs);
		line-height: 1;
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		cursor: pointer;
		transition:
			color var(--xy-dur-quick) var(--xy-ease-standard),
			border-color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.small:hover:not(:disabled) {
		border-color: var(--xy-line-control);
		color: var(--xy-fg);
	}

	.small:disabled {
		color: var(--xy-fg-faint);
		cursor: default;
		opacity: 0.6;
	}

	.small--icon {
		padding: 0;
		border-color: transparent;
	}

	.small svg {
		width: 0.625rem;
		height: 0.625rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.3;
		stroke-linecap: round;
	}

	/* the lit scale beside the key: its name (the card again) and an × that turns it off */
	.lit {
		display: inline-flex;
		align-items: center;
		height: 1.5rem;
		border: 1px solid var(--xy-line-strong);
		border-radius: var(--xy-radius-tile);
		color: var(--xy-fg);
		font-size: var(--xy-text-2xs);
		line-height: 1;
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		white-space: nowrap;
	}

	.lit--idle {
		color: var(--xy-fg-subtle);
	}

	.lit__name {
		height: 100%;
		padding: 0 0.25rem 0 0.5rem;
		border: 0;
		background: none;
		color: inherit;
		cursor: pointer;
	}

	.lit__off {
		display: inline-grid;
		place-items: center;
		width: 1.375rem;
		height: 100%;
		padding: 0;
		border: 0;
		border-radius: 0 var(--xy-radius-tile) var(--xy-radius-tile) 0;
		background: none;
		color: var(--xy-fg-subtle);
		cursor: pointer;
		transition: color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.lit__off svg {
		width: 0.625rem;
		height: 0.625rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.3;
		stroke-linecap: round;
	}

	.lit__name:hover,
	.lit__off:hover {
		color: var(--xy-fg);
	}

	/* under the caption line, over the strip below the device: never over the keys it lights */
	.scale__card {
		position: absolute;
		right: 0;
		top: calc(100% + 0.25rem);
		z-index: var(--xy-z-overlay);
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		width: min(43rem, 100%);
		padding: 0.5rem 0.75rem 0.625rem;
		border: 1px solid var(--xy-line-float);
		border-radius: var(--xy-radius-card);
		background-color: var(--xy-surface-float);
		box-shadow: var(--xy-shadow-float);
		color: var(--xy-fg-muted);
		letter-spacing: normal;
	}

	.scale__head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	/* one line, whatever it says, so the card keeps its size */
	.scale__note {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.scale__body {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
	}

	.scale__list {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		align-content: flex-start;
		gap: 0.125rem;
		min-width: 0;
	}

	/* the scale keys a little shorter than a small key, so four rows fit under the device */
	.scale__list :global(.key) {
		--h: 1.5rem;
	}

	/* one octave: seven white keys in a row, the black keys over the gaps between them */
	.octave {
		--w: 1.875rem;
		position: relative;
		flex: none;
		height: 3.75rem;
		width: calc(var(--w) * 7);
	}

	.octave__key {
		position: absolute;
		top: 0;
		padding: 0;
		border: 1px solid var(--xy-line-control);
		cursor: pointer;
		transition:
			background-color var(--xy-dur-quick, 120ms) var(--xy-ease-standard, ease),
			border-color var(--xy-dur-quick, 120ms) var(--xy-ease-standard, ease);
	}

	.octave__key--white {
		left: calc(var(--w) * var(--i));
		width: calc(var(--w) - 2px);
		height: 100%;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 0.3rem;
		border-radius: 0 0 var(--xy-radius-tile) var(--xy-radius-tile);
		/* lighter than the black keys over them, in both themes, as on a keyboard */
		background-color: var(--xy-ramp-2);
		border-color: var(--xy-ramp-3);
	}

	.octave__key--black {
		left: calc(var(--w) * (var(--after) + 1) - var(--w) * 0.3);
		z-index: 1;
		width: calc(var(--w) * 0.6);
		height: 58%;
		border-radius: 0 0 0.25rem 0.25rem;
		background-color: var(--xy-ramp-0);
		border-color: var(--xy-ramp-1);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.45);
	}

	.octave__name {
		color: var(--xy-ramp-6);
		font-size: var(--xy-text-2xs);
		line-height: 1;
		font-weight: 450;
	}

	.octave__key:hover {
		border-color: var(--xy-ramp-5);
	}

	.octave__key:focus-visible {
		outline: 1.5px solid var(--xy-fg-muted);
		outline-offset: 1px;
	}

	/* the chosen root lights, as a key on the device does */
	.octave__key[aria-checked='true'] {
		background-color: var(--xy-ramp-7);
		border-color: var(--xy-ramp-7);
	}

	.octave__key--white[aria-checked='true'] .octave__name {
		color: var(--xy-ramp-0);
	}
</style>
