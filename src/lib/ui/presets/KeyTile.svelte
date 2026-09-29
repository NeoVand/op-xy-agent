<!--
@component
One of the OP-XY's 24 keys on the preset maker's workbench: a tile in the device's material with
its note printed in the corner and its LED window lit like the device's (dim when it holds a sound,
white while selected or sounding, snapping on and decaying off). It shows the sound's name, a
mini waveform on a strip of black glass and what the sound is; an empty key names what TE's
factory kits keep there. Press it to hear it (and edit it); drag it onto another key to swap them;
drop files on it to put them right there.
-->
<script lang="ts">
	import { tooltip } from '$lib/ui';

	/** How a key belongs to a multisample zone. */
	interface ZoneMark {
		/** The zone's root is this key. */
		readonly root: boolean;
		/** Alternate zones alternate shades. */
		readonly odd: boolean;
		/** Semitones from the root. */
		readonly offset: number;
	}

	interface Props {
		/** The key's note (53–76). */
		note: number;
		/** What is printed in its corner ("f3", or the note it plays at the keyboard's octave). */
		legend: string;
		/** A black key (the upper row). */
		accidental: boolean;
		/** The sound's name, what it is, how long, and its overview (null for an empty key). */
		name?: string | null;
		kind?: string | null;
		detail?: string | null;
		peaks?: Float32Array | null;
		/** Why it is taken for what it is (the tooltip). */
		why?: string;
		/** What an empty key is for (TE's layout), or a hint. */
		placeholder?: string;
		zone?: ZoneMark | null;
		selected?: boolean;
		/** Sounding now: the LED flashes. */
		lit?: boolean;
		/** Files are being dragged over the page: the key shows it takes them. */
		receiving?: boolean;
		/** It can be dragged onto another key. */
		movable?: boolean;
		onpress: (note: number) => void;
		onrelease: (note: number) => void;
		onfiles: (note: number, files: File[]) => void;
		onmove: (from: number, to: number) => void;
	}

	let {
		note,
		legend,
		accidental,
		name = null,
		kind = null,
		detail = null,
		peaks = null,
		why = '',
		placeholder = '',
		zone = null,
		selected = false,
		lit = false,
		receiving = false,
		movable = false,
		onpress,
		onrelease,
		onfiles,
		onmove
	}: Props = $props();

	const MIME = 'application/x-opxy-key';

	let over = $state(false);
	let down = $state(false);

	/** The overview as a filled path, 64 columns across a 64 × 16 box. */
	const wave = $derived.by(() => {
		if (!peaks || peaks.length < 2) return '';
		const n = peaks.length / 2;
		let peak = 0;
		for (const v of peaks) peak = Math.max(peak, Math.abs(v));
		const scale = peak > 0 ? 7.5 / peak : 0;
		let top = '';
		let bottom = '';
		for (let c = 0; c < n; c++) {
			const x = ((c + 0.5) / n) * 64;
			const hi = 8 - Math.max(0.35, peaks[2 * c + 1] * scale);
			const lo = 8 - Math.min(-0.35, peaks[2 * c] * scale);
			top += `${c === 0 ? 'M' : 'L'}${x.toFixed(2)} ${hi.toFixed(2)}`;
			bottom = `L${x.toFixed(2)} ${lo.toFixed(2)}` + bottom;
		}
		return `${top}${bottom}Z`;
	});

	const led = $derived(lit ? 'lit' : selected ? 'on' : name ? 'dim' : 'off');
	const label = $derived(
		name
			? `${legend}: ${name}${kind ? `, ${kind}` : ''}`
			: `${legend}: empty${placeholder ? ` (${placeholder})` : ''}`
	);

	function press(event: PointerEvent) {
		if (event.button !== 0) return;
		down = true;
		onpress(note);
	}

	function lift() {
		if (!down) return;
		down = false;
		onrelease(note);
	}

	function ondragstart(event: DragEvent) {
		if (!movable || !event.dataTransfer) return;
		event.dataTransfer.setData(MIME, String(note));
		event.dataTransfer.effectAllowed = 'move';
		lift();
	}

	function ondragover(event: DragEvent) {
		const types = event.dataTransfer?.types ?? [];
		if (!types.includes(MIME) && !types.includes('Files')) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = types.includes(MIME) ? 'move' : 'copy';
		over = true;
	}

	function ondrop(event: DragEvent) {
		over = false;
		const data = event.dataTransfer;
		if (!data) return;
		event.preventDefault();
		// the page's own drop would place the files automatically: this key takes them
		event.stopPropagation();
		const from = data.getData(MIME);
		if (from) onmove(Number(from), note);
		else if (data.files.length > 0) onfiles(note, Array.from(data.files));
	}

	function onkeydown(event: KeyboardEvent) {
		if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
			event.preventDefault();
			down = true;
			onpress(note);
		}
	}

	function onkeyup(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') lift();
	}
</script>

<button
	type="button"
	class={[
		'tile',
		accidental && 'tile--accidental',
		name && 'has-sound',
		selected && 'is-selected',
		down && 'is-down',
		over && 'is-over',
		receiving && 'is-receiving',
		zone && 'in-zone'
	]}
	draggable={movable}
	aria-label={label}
	aria-pressed={selected}
	data-note={note}
	onpointerdown={press}
	onpointerup={lift}
	onpointerleave={lift}
	onpointercancel={lift}
	{onkeydown}
	{onkeyup}
	{ondragstart}
	{ondragover}
	ondragleave={() => (over = false)}
	{ondrop}
	{@attach tooltip(why || label, { describe: false, delay: 700 })}
>
	<span class="tile__head">
		<span class="tile__legend">{legend}</span>
		<span class="tile__led" data-led={led}></span>
	</span>
	{#if name}
		<span class="tile__name">{name}</span>
		<span class="tile__glass">
			<svg viewBox="0 0 64 16" preserveAspectRatio="none" aria-hidden="true">
				<path d={wave} />
			</svg>
		</span>
		<span class="tile__foot">
			<span class="tile__kind">{kind ?? ''}</span>
			<span class="tile__detail">{detail ?? ''}</span>
		</span>
	{:else}
		<span class="tile__empty">
			{#if zone}
				<span class="tile__offset">{zone.offset > 0 ? '+' : ''}{zone.offset}</span>
			{:else}
				<span class="tile__plus" aria-hidden="true"></span>
			{/if}
			<span class="tile__slot">{over ? 'drop here' : placeholder}</span>
		</span>
	{/if}
	{#if zone}
		<span class={['tile__zone', zone.odd && 'is-odd', zone.root && 'is-root']} aria-hidden="true"
		></span>
	{/if}
</button>

<style>
	.tile {
		--tile: var(--xy-mat-tile);
		--legend: var(--xy-mat-legend);
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.1875rem;
		width: 100%;
		height: 100%;
		min-width: 0;
		padding: 0.375rem 0.4375rem 0.4375rem;
		border: 0;
		border-radius: var(--xy-radius-tile);
		background:
			linear-gradient(to bottom, rgb(255 255 255 / 0.035), transparent 40%, rgb(0 0 0 / 0.12)),
			var(--tile);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.07),
			inset 0 -1px 0 rgb(0 0 0 / 0.35),
			0 0 0 1px var(--xy-mat-gap),
			0 1px 2px rgb(0 0 0 / 0.45);
		color: var(--legend);
		font: inherit;
		text-align: left;
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		touch-action: manipulation;
		/* release: back up with the key's small rebound */
		transition:
			transform var(--xy-dur-release) var(--xy-ease-release),
			box-shadow var(--xy-dur-release) var(--xy-ease-release),
			background-color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.tile--accidental {
		--tile: #1a1b1e;
	}

	.tile:hover {
		--tile: #2a2b2f;
	}

	.tile--accidental:hover {
		--tile: #222326;
	}

	.tile.is-down {
		transform: translateY(1px);
		box-shadow:
			inset 0 1px 2px rgb(0 0 0 / 0.5),
			0 0 0 1px var(--xy-mat-gap);
		transition-duration: var(--xy-dur-press);
		transition-timing-function: var(--xy-ease-press);
	}

	.tile.is-selected {
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.09),
			inset 0 -1px 0 rgb(0 0 0 / 0.35),
			0 0 0 1px var(--xy-mat-gap),
			0 0 0 2px rgb(247 245 245 / 0.55),
			0 1px 2px rgb(0 0 0 / 0.45);
	}

	.tile.is-receiving {
		box-shadow:
			inset 0 0 0 1px rgb(247 245 245 / 0.14),
			0 0 0 1px var(--xy-mat-gap);
	}

	.tile.is-over {
		--tile: #34353a;
		box-shadow:
			inset 0 0 0 1.5px rgb(247 245 245 / 0.7),
			0 0 0 1px var(--xy-mat-gap);
	}

	.tile:focus-visible {
		outline: 1.5px solid var(--xy-focus);
		outline-offset: 2px;
	}

	.tile__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem;
		line-height: 1;
	}

	.tile__legend {
		color: rgb(236 235 231 / 0.62);
		font-size: var(--xy-text-2xs);
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--xy-tracking-label);
	}

	/* the LED window: an unlit hole, dim, or lit white with its glow; on fast, off slowly */
	.tile__led {
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 50%;
		background-color: #1d1f22;
		box-shadow: inset 0 0.5px 1px rgb(0 0 0 / 0.8);
		transition:
			background-color var(--xy-dur-led-off) var(--xy-ease-decay),
			box-shadow var(--xy-dur-led-off) var(--xy-ease-decay);
	}

	.tile__led[data-led='dim'] {
		background-color: #55565c;
	}

	.tile__led[data-led='on'],
	.tile__led[data-led='lit'] {
		background-color: #ffffff;
		box-shadow: var(--xy-glow-white);
		transition-duration: var(--xy-dur-led-on);
	}

	.tile__led[data-led='on'] {
		background-color: #d8d8dc;
		box-shadow: 0 0 0.125rem rgb(255 255 255 / 0.45);
	}

	.tile__name {
		overflow: hidden;
		color: var(--legend);
		font-size: var(--xy-text-xs);
		line-height: 1.15;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.tile__glass {
		display: block;
		flex: 1;
		min-height: 0.875rem;
		padding: 0.125rem 0.1875rem;
		border-radius: 0.1875rem;
		background-color: #000000;
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.05);
	}

	.tile__glass svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.tile__glass path {
		fill: rgb(247 245 245 / 0.78);
	}

	.is-selected .tile__glass path {
		fill: #ffffff;
	}

	.tile__foot {
		display: flex;
		justify-content: space-between;
		gap: 0.25rem;
		color: rgb(236 235 231 / 0.55);
		font-size: 0.625rem;
		line-height: 1;
		white-space: nowrap;
	}

	.tile__kind {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tile__detail {
		font-variant-numeric: tabular-nums;
	}

	.tile__empty {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		min-height: 0;
	}

	.tile__slot {
		overflow: hidden;
		max-width: 100%;
		color: rgb(236 235 231 / 0.34);
		font-size: 0.625rem;
		line-height: 1;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.is-over .tile__slot {
		color: var(--legend);
	}

	/* the device's [+]: two thin strokes, faint until the key could take something */
	.tile__plus {
		position: relative;
		width: 0.625rem;
		height: 0.625rem;
		opacity: 0.22;
		transition: opacity var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.tile__plus::before,
	.tile__plus::after {
		content: '';
		position: absolute;
		background-color: var(--legend);
	}

	.tile__plus::before {
		top: 50%;
		left: 0;
		width: 100%;
		height: 1px;
	}

	.tile__plus::after {
		top: 0;
		left: 50%;
		width: 1px;
		height: 100%;
	}

	.tile:hover .tile__plus,
	.is-receiving .tile__plus {
		opacity: 0.55;
	}

	.tile__offset {
		color: rgb(236 235 231 / 0.4);
		font-size: var(--xy-text-2xs);
		font-variant-numeric: tabular-nums;
	}

	/* a multisample zone: a bar along the bottom, alternate zones in alternate shades */
	.tile__zone {
		position: absolute;
		right: 0.4375rem;
		bottom: 0.25rem;
		left: 0.4375rem;
		height: 0.125rem;
		border-radius: 1px;
		background-color: rgb(247 245 245 / 0.32);
		pointer-events: none;
	}

	.tile__zone.is-odd {
		background-color: rgb(247 245 245 / 0.14);
	}

	.tile__zone.is-root::after {
		content: '';
		position: absolute;
		top: -0.125rem;
		left: 50%;
		width: 0.4375rem;
		height: 0.4375rem;
		margin-left: -0.21875rem;
		border-radius: 50%;
		background-color: #ffffff;
	}

	.in-zone .tile__foot {
		margin-bottom: 0.25rem;
	}
</style>
