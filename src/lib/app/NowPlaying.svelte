<!--
@component
What plays, in a line under the replica (`now-playing.ts`): the tempo and the bar and beat of the
scene playing; the song as its scenes, the one playing lit and filling as it goes and a cued one
ringed (while the song plays a click on another cues it, as shift + [-] / [+] does); and the eight
instrument tracks, each with a light that is its meter: off when muted (as the track keys show it
in mix mode), dim while silent, brighter as it plays louder here. A click mutes or unmutes a track
on the replica; while the OP-XY is connected its mutes are its own.

```svelte
<NowPlaying {simulator} levels={sound.trackLevels} onchange={() => persistence.markDirty()} />
```
-->
<script lang="ts">
	import { cueSongAt } from '$lib/sim/areas/arrange/model';
	import { tooltip } from '$lib/ui/tooltip';
	import { nowPlaying } from './now-playing';
	import type { AppSimulator } from './simulator.svelte';

	interface Props {
		simulator: AppSimulator;
		/** Each instrument track's level here, 0–1 (`AppSound.trackLevels`). */
		levels: readonly number[];
		/** A tempo to show instead of the replica's (the connected OP-XY's, as measured). */
		bpm?: string | null;
		/** The OP-XY is connected: its mutes are set on it, not here. */
		live?: boolean;
		/** The strip changed the replica (a mute, a cue), for saving. */
		onchange?: () => void;
	}

	let { simulator, levels, bpm = null, live = false, onchange }: Props = $props();

	/** The most song entries drawn; the rest are counted. */
	const BLOCKS = 16;

	const view = $derived(nowPlaying(simulator.sim.state));
	const blocks = $derived(view.song.slice(0, BLOCKS));

	function cue(index: number): void {
		cueSongAt(simulator.sim.state, index);
		onchange?.();
	}

	function toggleMute(track: number): void {
		const mix = simulator.sim.state.tracks[track]?.mix;
		if (!mix || live) return;
		mix.muted = !mix.muted;
		onchange?.();
	}

	function muteTip(track: number, muted: boolean): string {
		if (live) return `track ${track + 1}: mute it on the op-xy, instrument + its track key`;
		return muted ? `track ${track + 1} is muted: unmute` : `mute track ${track + 1}`;
	}
</script>

<div class="now" role="group" aria-label="now playing">
	<div class="now__transport">
		<span class="now__value">{bpm ?? view.bpm}</span>
		<span class="now__unit">bpm</span>
		<span class="now__unit now__bar">bar</span>
		<span class="now__value now__position">{view.position}</span>
	</div>

	<div class="now__song" role="group" aria-label="song">
		<span class="now__unit">song</span>
		<div class="song">
			{#each blocks as block, i (i)}
				{#if view.songPlaying && !block.playing}
					<button
						type="button"
						class={['block', block.cued && 'block--cued']}
						aria-label="cue scene {block.scene}, entry {i + 1}"
						onclick={() => cue(i)}
						{@attach tooltip(
							block.cued ? `scene ${block.scene} is next` : `play scene ${block.scene} next`,
							{
								describe: false
							}
						)}>{block.scene}</button
					>
				{:else}
					<span
						class={['block', block.playing && 'block--playing']}
						style:--progress={block.progress ?? 0}
						aria-label="scene {block.scene}{block.playing ? ', playing' : ''}"
					>
						{#if block.playing}<span class="block__fill"></span>{/if}
						<span class="block__scene">{block.scene}</span>
					</span>
				{/if}
			{/each}
			{#if view.song.length > BLOCKS}
				<span class="now__unit">+{view.song.length - BLOCKS}</span>
			{/if}
		</div>
	</div>

	<div class="now__tracks" role="group" aria-label="tracks">
		{#each view.muted as muted, t (t)}
			<button
				type="button"
				class="track"
				aria-pressed={muted}
				aria-label="mute track {t + 1}"
				disabled={live}
				onclick={() => toggleMute(t)}
				{@attach tooltip(muteTip(t, muted), { describe: false })}
			>
				<span
					class={['track__light', muted && 'track__light--muted']}
					style:--level={muted ? 0 : (levels[t] ?? 0)}
				></span>
				<span class="track__number">{t + 1}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.now {
		display: flex;
		align-items: center;
		gap: 0.75rem 1.75rem;
		min-width: 0;
		min-height: 1.75rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		font-variant-numeric: tabular-nums;
	}

	.now__transport,
	.now__song,
	.now__tracks {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-width: 0;
	}

	.now__value {
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		letter-spacing: normal;
	}

	.now__bar {
		margin-left: 0.625rem;
	}

	.now__position {
		/* bar and beat hold their width as they count */
		min-width: 2.5ch;
		color: var(--xy-fg-muted);
	}

	.now__unit {
		color: var(--xy-fg-subtle);
	}

	.song {
		display: flex;
		align-items: center;
		gap: 0.1875rem;
	}

	/* a scene of the song: a small dark tile with its number, as the song page draws them (the
	   device's own tones, in both themes) */
	.block {
		position: relative;
		display: inline-grid;
		place-items: center;
		min-width: 1.375rem;
		height: 1.125rem;
		padding: 0 0.25rem;
		overflow: hidden;
		border: 1px solid var(--xy-ramp-2);
		border-radius: 0.25rem;
		background-color: var(--xy-ramp-1);
		color: var(--xy-ramp-5);
		font-size: var(--xy-text-2xs);
		line-height: 1;
	}

	button.block {
		cursor: pointer;
		transition:
			border-color var(--xy-dur-quick) var(--xy-ease-standard),
			color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	button.block:hover {
		border-color: var(--xy-ramp-5);
		color: var(--xy-ramp-7);
	}

	.block--playing {
		border-color: var(--xy-ramp-5);
		color: var(--xy-ramp-7);
	}

	/* how far the scene playing has got */
	.block__fill {
		position: absolute;
		inset: 0 auto 0 0;
		width: calc(var(--progress) * 100%);
		background-color: var(--xy-ramp-3);
		transition: width 120ms linear;
	}

	.block__scene {
		position: relative;
	}

	.block--cued {
		border-color: var(--xy-ramp-6);
		color: var(--xy-ramp-7);
	}

	.now__tracks {
		gap: 0.125rem;
		margin-left: auto;
	}

	.track {
		display: inline-flex;
		align-items: center;
		gap: 0.3125rem;
		padding: 0.25rem 0.375rem;
		border-radius: var(--xy-radius-tile);
		color: var(--xy-fg-muted);
		cursor: pointer;
		transition:
			background-color var(--xy-dur-quick) var(--xy-ease-standard),
			color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.track:hover:not(:disabled) {
		background-color: var(--xy-hover);
		color: var(--xy-fg);
	}

	.track:disabled {
		cursor: default;
	}

	.track[aria-pressed='true'] .track__number {
		color: var(--xy-fg-subtle);
	}

	.track:focus-visible,
	button.block:focus-visible {
		outline: 1.5px solid var(--xy-focus);
		outline-offset: 1px;
	}

	/* the track's light is its meter: dim while silent, toward white as it plays louder, off when
	   muted; it rises at once and falls away as the level does */
	.track__light {
		flex: none;
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 50%;
		background-color: color-mix(
			in oklab,
			var(--xy-led-white) calc(var(--level) * 100%),
			var(--xy-led-dim)
		);
		box-shadow:
			inset 0 0.5px 1px var(--xy-led-ring),
			0 0 calc(var(--level) * 0.375rem) rgb(255 255 255 / calc(var(--level) * 0.5));
		transition:
			background-color var(--xy-dur-led-off) var(--xy-ease-decay),
			box-shadow var(--xy-dur-led-off) var(--xy-ease-decay);
	}

	.track__light--muted {
		background-color: var(--xy-led-off);
		box-shadow: inset 0 0.5px 1px var(--xy-led-ring);
	}
</style>
