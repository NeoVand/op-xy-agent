<!--
@component
Lights a scale on the replica's keyboard (`app/scale-guide`): a small key on the caption line opens
a card with a one-octave keyboard to pick the root and a key for each scale; the scale's keys then
show dim under their LEDs, the root with a faint ring. Off turns it back off.
-->
<script lang="ts">
	import { MusicNote02Icon } from '@hugeicons/core-free-icons';
	import { GUIDE_SCALES, type ScaleGuide } from '$lib/app';
	import { Button, IconButton, Legend, ToolButton } from '$lib/ui';

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

	function pickRoot(pc: number): void {
		guide.set(pc, guide.scale ?? GUIDE_SCALES[0]);
	}
</script>

<div class="scale">
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
				<IconButton
					size="sm"
					variant="ghost"
					icon="close"
					label="close"
					onclick={() => (open = false)}
				/>
			</div>

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

			<div class="scale__foot">
				<Legend as="p" size="2xs" tone="subtle">
					{#if drums && guide.scale}
						a drum track's keys are sounds: pick a melodic track to see the scale
					{:else}
						its keys light dim, the root with a ring
					{/if}
				</Legend>
				{#if guide.scale}
					<Button size="sm" variant="ghost" onclick={() => guide.set(guide.root, null)}>off</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.scale {
		position: relative;
	}

	.scale__card {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.5rem);
		z-index: var(--xy-z-overlay);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 19.5rem;
		padding: 0.75rem;
		border: 1px solid var(--xy-line-float);
		border-radius: var(--xy-radius-card);
		background-color: var(--xy-surface-float);
		box-shadow: var(--xy-shadow-float);
		color: var(--xy-fg-muted);
		letter-spacing: normal;
	}

	.scale__head,
	.scale__foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.scale__list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.125rem;
	}

	/* one octave: seven white keys in a row, the black keys over the gaps between them */
	.octave {
		--w: 2.25rem;
		position: relative;
		height: 4.25rem;
		width: calc(var(--w) * 7);
		margin-inline: auto;
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
