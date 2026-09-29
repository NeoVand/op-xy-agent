<!--
@component
The workbench's keyboard: the OP-XY's 24 keys, F3 to E5, laid out as the device lays them out
(fourteen naturals below, ten accidentals above in their gaps), each a `KeyTile` showing what it
plays. For instruments, a strip above draws the multisample's zones over the whole keyboard (A0 to
C8), the 24 keys' window marked where the keyboard's octave puts it.
-->
<script lang="ts">
	import { KEYBOARD_NOTE_NAMES } from '$lib/core/opxy';
	import { DRUM_FIRST_KEY, TE_SLOT_NAMES, noteName } from '$lib/core/presets';
	import type { Workbench } from './bench.svelte';
	import KeyTile from './KeyTile.svelte';

	interface Props {
		bench: Workbench;
		/** Keys sounding now. */
		lit: ReadonlySet<number>;
		/** Files are being dragged over the page. */
		receiving?: boolean;
		onpress: (key: number) => void;
		onrelease: (key: number) => void;
		onfiles: (key: number, files: File[]) => void;
	}

	let { bench, lit, receiving = false, onpress, onrelease, onfiles }: Props = $props();

	/** The keys in order, with their place in the two rows (half-key columns, as on the device). */
	const LAYOUT = (() => {
		let natural = 0;
		return KEYBOARD_NOTE_NAMES.map((name, i) => {
			const accidental = name.includes('s');
			const column = accidental ? 2 * natural : 2 * natural + 1;
			if (!accidental) natural++;
			return { note: DRUM_FIRST_KEY + i, accidental, column };
		});
	})();

	const instrument = $derived(bench.mode === 'multisampler' || bench.mode === 'sampler');

	const seconds = (frames: number) => {
		const s = frames / 44100;
		return s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(s < 10 ? 2 : 1)} s`;
	};

	/** What each key shows. */
	const tiles = $derived(
		LAYOUT.map(({ note, accidental, column }) => {
			const slot = note - DRUM_FIRST_KEY;
			const base = {
				note,
				accidental,
				column,
				zone: null as null | { root: boolean; odd: boolean; offset: number }
			};
			if (!instrument) {
				const sound = bench.keys[slot];
				return {
					...base,
					legend: noteName(note),
					sound,
					name: sound?.name ?? null,
					kind: sound ? (sound.kind ?? (bench.mode === 'slices' ? `slice ${slot + 1}` : '')) : null,
					detail: sound ? seconds(sound.edit.end - sound.edit.start) : null,
					peaks: sound?.peaks ?? null,
					why: sound ? `${sound.name}: ${sound.reason || sound.kind || ''}` : '',
					placeholder: bench.mode === 'drum' ? TE_SLOT_NAMES[slot] : '',
					movable: Boolean(sound) && bench.mode === 'drum',
					selected: sound !== null && sound.id === bench.selected
				};
			}
			const played = bench.noteOf(note);
			const zones = bench.zoneMap;
			const zi = zones.findIndex((z) => played >= z.low && played <= z.high);
			const zone = zi >= 0 ? zones[zi] : null;
			const sound =
				zone && bench.mode === 'multisampler'
					? (bench.zones.find((z) => z.root === zone.root) ?? null)
					: zone
						? bench.one
						: null;
			const isRoot = zone !== null && zone.root === played;
			return {
				...base,
				legend: noteName(played),
				sound,
				zone: zone ? { root: isRoot, odd: zi % 2 === 1, offset: played - zone.root } : null,
				name: isRoot && sound ? sound.name : null,
				kind: isRoot && sound ? 'root' : null,
				detail: isRoot && sound ? seconds(sound.edit.end - sound.edit.start) : null,
				peaks: isRoot && sound ? sound.peaks : null,
				why: sound
					? `${noteName(played)} plays ${sound.name} (root ${noteName(zone?.root ?? 60)})`
					: '',
				placeholder: sound ? `${sound.name}` : 'drop a note',
				movable: false,
				selected: sound !== null && sound.id === bench.selected && (isRoot || bench.key === note)
			};
		})
	);

	/** The zone strip: every zone over A0–C8 as shares of the strip. */
	const LOW = 21;
	const HIGH = 108;
	const span = HIGH - LOW + 1;
	const pos = (note: number) => ((Math.min(HIGH + 1, Math.max(LOW, note)) - LOW) / span) * 100;
	const windowLow = $derived(bench.noteOf(DRUM_FIRST_KEY));
</script>

<div class={['bench', instrument && 'is-instrument']}>
	{#if instrument}
		<div class="zones" aria-label="zones over the whole keyboard">
			<span class="zones__label">zones</span>
			<div class="zones__strip">
				{#each bench.zoneMap as zone, i (zone.root)}
					{@const sound =
						bench.mode === 'multisampler'
							? bench.zones.find((z) => z.root === zone.root)
							: bench.one}
					<button
						type="button"
						class={[
							'zones__zone',
							i % 2 === 1 && 'is-odd',
							sound && sound.id === bench.selected && 'is-selected'
						]}
						style:left="{pos(zone.low)}%"
						style:width="{pos(zone.high + 1) - pos(zone.low)}%"
						aria-label={`zone ${noteName(zone.low)} to ${noteName(zone.high)}, root ${noteName(zone.root)}`}
						onclick={() => sound && (bench.selected = sound.id)}
					>
						<span
							class="zones__root"
							style:left="{((zone.root - zone.low + 0.5) / (zone.high - zone.low + 1)) * 100}%"
						></span>
					</button>
				{/each}
				<span
					class="zones__window"
					style:left="{pos(windowLow)}%"
					style:width="{pos(windowLow + 24) - pos(windowLow)}%"
					aria-hidden="true"
				></span>
			</div>
			<span class="zones__label">{noteName(windowLow)}–{noteName(windowLow + 23)}</span>
		</div>
	{/if}
	<div class="keys" role="group" aria-label="the 24 keys">
		{#each tiles as tile (tile.note)}
			<div
				class={['keys__cell', tile.accidental ? 'is-upper' : 'is-lower']}
				style:grid-column="{tile.column} / span 2"
			>
				<KeyTile
					note={tile.note}
					legend={tile.legend}
					accidental={tile.accidental}
					name={tile.name}
					kind={tile.kind}
					detail={tile.detail}
					peaks={tile.peaks}
					why={tile.why}
					placeholder={tile.placeholder}
					zone={tile.zone}
					selected={tile.selected}
					lit={lit.has(tile.note)}
					{receiving}
					movable={tile.movable}
					{onpress}
					{onrelease}
					{onfiles}
					onmove={(from, to) => bench.move(from, to)}
				/>
			</div>
		{/each}
	</div>
</div>

<style>
	.bench {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.keys {
		display: grid;
		grid-template-columns: repeat(28, minmax(0, 1fr));
		grid-template-rows: repeat(2, 5.25rem);
		gap: 0.3125rem 0.3125rem;
	}

	.keys__cell {
		display: flex;
		min-width: 0;
	}

	.keys__cell.is-upper {
		grid-row: 1;
	}

	.keys__cell.is-lower {
		grid-row: 2;
	}

	.zones {
		display: grid;
		grid-template-columns: 3rem minmax(0, 1fr) 4.5rem;
		align-items: center;
		gap: 0.75rem;
	}

	.zones__label {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		font-variant-numeric: tabular-nums;
	}

	.zones__label:last-child {
		text-align: right;
	}

	.zones__strip {
		position: relative;
		height: 1rem;
		border-radius: 0.1875rem;
		background-color: #000000;
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
	}

	.zones__zone {
		position: absolute;
		top: 0.1875rem;
		bottom: 0.1875rem;
		padding: 0;
		border: 0;
		border-right: 1px solid #000000;
		background-color: rgb(247 245 245 / 0.3);
		cursor: pointer;
		transition: background-color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.zones__zone.is-odd {
		background-color: rgb(247 245 245 / 0.16);
	}

	.zones__zone:hover {
		background-color: rgb(247 245 245 / 0.45);
	}

	.zones__zone.is-selected {
		background-color: rgb(247 245 245 / 0.85);
	}

	.zones__root {
		position: absolute;
		top: 50%;
		width: 0.3125rem;
		height: 0.3125rem;
		margin: -0.15625rem 0 0 -0.15625rem;
		border-radius: 50%;
		background-color: #ffffff;
		box-shadow: 0 0 0 1px #000000;
	}

	.zones__window {
		position: absolute;
		top: -0.125rem;
		bottom: -0.125rem;
		border: 1px solid rgb(247 245 245 / 0.75);
		border-radius: 0.1875rem;
		pointer-events: none;
		transition:
			left var(--xy-dur-base) var(--xy-ease-standard),
			width var(--xy-dur-base) var(--xy-ease-standard);
	}
</style>
