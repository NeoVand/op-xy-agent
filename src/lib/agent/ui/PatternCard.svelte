<!--
@component
A pattern the agent wrote, live on the replica (`pattern-card.ts`): a drum grid with a row per
sound, or a small piano roll with a row per pitch, sixteen steps a bar in beats of four, the chords
where they start. While the track plays it the step under the playhead lights and the card shows
its bar (the bar keys pick one while it does not). A click on a cell adds a note there or takes away the one sounding; a drag up or down on
a note sets how hard it plays; a sound's or a chord's name plays it. Keys: one Tab stop, the arrows
move, Enter or Space toggles. A tiny black screen in both themes, as the walkthrough's card is.

```svelte
<PatternCard host={patterns} track={1} pattern={1} />
```
-->
<script lang="ts">
	import {
		BAR,
		chordMarks,
		gridRows,
		noteAt,
		toggleNote,
		withVelocity,
		type PatternHost
	} from './pattern-card';
	import type { VirtualNote } from '../virtual-opxy';

	interface Props {
		host: PatternHost;
		/** Track 1–8. */
		track: number;
		/** Pattern 1–16. */
		pattern: number;
	}

	let { host, track, pattern }: Props = $props();

	const live = $derived(host.read(track, pattern));
	const drums = $derived(host.drums(track));
	/** Rows seen once stay while the card lives (bookkeeping, read only through `rows`). */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const seen = new Map<number, string>();
	const rows = $derived.by(() => {
		if (!live) return [];
		const list = gridRows(live, drums, seen);
		for (const row of list) if (!seen.has(row.note)) seen.set(row.note, row.label);
		return list;
	});
	const playhead = $derived(host.playhead(track, pattern));
	const bars = $derived(live?.bars ?? 1);

	/** The bar picked by hand, shown while the track does not play; while it plays, its bar. */
	let picked = $state(0);
	const bar = $derived(
		Math.min(bars - 1, playhead !== null ? Math.floor((playhead - 1) / BAR) : picked)
	);
	const steps = $derived(Array.from({ length: BAR }, (_, i) => bar * BAR + i + 1));
	const chords = $derived(
		drums || !live ? [] : chordMarks(live.notes).filter((c) => steps.includes(c.step))
	);

	/** A note being dragged for its velocity: where the drag began and what it shows now. */
	let drag = $state.raw<{
		target: VirtualNote;
		y: number;
		from: number;
		velocity: number;
		moved: boolean;
	} | null>(null);
	/** The keyboard's cell: row and step index in the bar. */
	let cursor = $state({ row: 0, step: 0 });
	let focused = $state(false);

	function write(notes: readonly VirtualNote[]): void {
		host.write(track, pattern, notes);
	}

	function toggle(step: number, note: number): void {
		if (!live || step > live.length) return;
		const had = noteAt(live.notes, step, note);
		write(toggleNote(live.notes, step, note));
		if (!had) host.preview(track, [note]);
	}

	function onpointerdown(event: PointerEvent, step: number, note: number): void {
		if (event.button !== 0 || !live) return;
		const target = noteAt(live.notes, step, note);
		if (!target) return;
		event.preventDefault();
		try {
			(event.currentTarget as Element).setPointerCapture(event.pointerId);
		} catch {
			// a pointer the browser no longer tracks: the drag works without the capture
		}
		drag = {
			target,
			y: event.clientY,
			from: target.velocity,
			velocity: target.velocity,
			moved: false
		};
	}

	function onpointermove(event: PointerEvent): void {
		if (!drag) return;
		const dy = drag.y - event.clientY;
		if (!drag.moved && Math.abs(dy) < 3) return;
		drag = {
			...drag,
			moved: true,
			velocity: Math.max(1, Math.min(127, Math.round(drag.from + dy * 1.5)))
		};
	}

	function onpointerup(step: number, note: number): void {
		const was = drag;
		drag = null;
		if (!live) return;
		if (was?.moved) {
			write(withVelocity(live.notes, was.target, was.velocity));
			return;
		}
		toggle(step, note);
	}

	function velocityOf(n: VirtualNote): number {
		return drag && drag.target.step === n.step && drag.target.note === n.note
			? drag.velocity
			: n.velocity;
	}

	function onkeydown(event: KeyboardEvent): void {
		const moves: Record<string, [number, number]> = {
			ArrowUp: [-1, 0],
			ArrowDown: [1, 0],
			ArrowLeft: [0, -1],
			ArrowRight: [0, 1]
		};
		const move = moves[event.key];
		if (move) {
			event.preventDefault();
			cursor = {
				row: Math.max(0, Math.min(rows.length - 1, cursor.row + move[0])),
				step: Math.max(0, Math.min(BAR - 1, cursor.step + move[1]))
			};
		} else if ((event.key === 'Enter' || event.key === ' ') && rows[cursor.row]) {
			event.preventDefault();
			toggle(steps[cursor.step], rows[cursor.row].note);
		}
	}
</script>

{#if live}
	<div class="card" data-theme="dark" role="group" aria-label="track {track} pattern {pattern}">
		<div class="card__head">
			<span class="card__title">
				T{track} <span class="card__dim">pattern {pattern}</span>
			</span>
			{#if bars > 1}
				<span class="card__bars" role="group" aria-label="bars">
					{#each Array.from({ length: bars }, (_, i) => i) as index (index)}
						<button
							type="button"
							class="card__bar"
							aria-pressed={index === bar}
							disabled={playhead !== null}
							onclick={() => (picked = index)}>{index + 1}</button
						>
					{/each}
				</span>
			{/if}
		</div>

		{#if chords.length > 0}
			<div class="card__chords" aria-label="chords">
				{#each chords as chord (chord.step)}
					<button
						type="button"
						class="card__chord"
						style:--at={(chord.step - 1) % BAR}
						onclick={() => host.preview(track, chord.notes)}>{chord.name}</button
					>
				{/each}
			</div>
		{/if}

		<!-- one Tab stop; the arrows move the cursor, Enter or Space toggles its cell -->
		<div
			class={['grid', drums ? 'grid--drums' : 'grid--roll']}
			role="grid"
			aria-label="steps {steps[0]}–{steps[BAR - 1]}"
			tabindex="0"
			{onkeydown}
			onfocus={() => (focused = true)}
			onblur={() => (focused = false)}
		>
			{#each rows as row, r (row.note)}
				<div class="grid__row" role="row">
					<button
						type="button"
						class="grid__label"
						tabindex="-1"
						title={row.label}
						onclick={() => host.preview(track, [row.note])}>{row.label}</button
					>
					{#each steps as step, i (step)}
						{@const note = noteAt(live.notes, step, row.note)}
						<button
							type="button"
							role="gridcell"
							tabindex="-1"
							class={[
								'cell',
								note && (note.step === step ? 'cell--on' : 'cell--held'),
								step === playhead && 'cell--playing',
								i % 4 === 0 && i > 0 && 'cell--beat',
								step > live.length && 'cell--out',
								focused && cursor.row === r && cursor.step === i && 'cell--cursor'
							]}
							style:--velocity={note ? velocityOf(note) / 127 : 0}
							aria-label="step {step}, {row.label}{note ? `, velocity ${note.velocity}` : ''}"
							aria-selected={note !== null}
							disabled={step > live.length}
							onpointerdown={(event) => onpointerdown(event, step, row.note)}
							{onpointermove}
							onpointerup={() => onpointerup(step, row.note)}
							onpointercancel={() => (drag = null)}
						></button>
					{/each}
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.card {
		--label-w: 4.75rem;
		--cell-h: 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.5rem 0.625rem 0.625rem;
		border-radius: var(--xy-radius-card);
		background-color: var(--xy-scr-bg, #000000);
		box-shadow: 0 0 0 1px rgb(255 255 255 / 0.06);
		color: var(--xy-ramp-5);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}

	.card__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		min-height: 1.125rem;
	}

	.card__title {
		color: var(--xy-ramp-7);
		font-size: var(--xy-text-xs);
	}

	.card__dim {
		color: var(--xy-ramp-5);
	}

	.card__bars {
		display: flex;
		gap: 0.125rem;
	}

	.card__bar {
		min-width: 1.125rem;
		padding: 0 0.25rem;
		border-radius: 0.1875rem;
		color: var(--xy-ramp-5);
		cursor: pointer;
	}

	.card__bar[aria-pressed='true'] {
		background-color: var(--xy-ramp-2);
		color: var(--xy-ramp-7);
	}

	/* chord names over the steps where they start */
	.card__chords {
		position: relative;
		height: 1rem;
		margin-left: var(--label-w);
	}

	.card__chord {
		position: absolute;
		left: calc(var(--at) * 100% / 16);
		padding: 0 0.1875rem;
		border-radius: 0.1875rem;
		color: var(--xy-ramp-7);
		cursor: pointer;
	}

	.card__chord:hover {
		background-color: var(--xy-ramp-2);
	}

	.grid {
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-radius: 0.25rem;
		outline: none;
	}

	.grid--drums {
		--cell-h: 1rem;
	}

	.grid__row {
		display: grid;
		grid-template-columns: var(--label-w) repeat(16, minmax(0, 1fr));
		gap: 2px;
		align-items: center;
	}

	.grid__label {
		overflow: hidden;
		padding-right: 0.375rem;
		color: var(--xy-ramp-5);
		text-align: left;
		text-overflow: ellipsis;
		white-space: nowrap;
		cursor: pointer;
	}

	.grid__label:hover {
		color: var(--xy-ramp-7);
	}

	/* a step: dark when empty; a note lights by how hard it plays, a held one dimmer */
	.cell {
		position: relative;
		height: var(--cell-h);
		padding: 0;
		border-radius: 2px;
		background-color: var(--xy-ramp-1);
		cursor: pointer;
		touch-action: none;
	}

	.cell--beat {
		margin-left: 3px;
	}

	.cell--on {
		background-color: color-mix(
			in oklab,
			var(--xy-ramp-7) calc(35% + var(--velocity) * 65%),
			var(--xy-ramp-1)
		);
	}

	.cell--held {
		background-color: color-mix(
			in oklab,
			var(--xy-ramp-5) calc(30% + var(--velocity) * 40%),
			var(--xy-ramp-1)
		);
	}

	.cell--playing::after {
		content: '';
		position: absolute;
		inset: -1px;
		border-radius: 3px;
		box-shadow: 0 0 0 1px var(--xy-ramp-6);
	}

	.cell--out {
		opacity: 0.3;
		cursor: default;
	}

	.cell--cursor {
		outline: 1.5px solid var(--xy-ramp-6);
		outline-offset: 1px;
	}

	.cell:not(.cell--out):hover {
		box-shadow: inset 0 0 0 1px var(--xy-ramp-4);
	}
</style>
