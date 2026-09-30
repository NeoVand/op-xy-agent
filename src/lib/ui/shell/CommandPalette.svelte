<!--
@component
The command palette: ⌘K (ctrl K) anywhere opens it over the page, a field and the commands that
match what is typed, the best first (`palette.ts`); ↑ ↓ choose, enter runs, esc or a click outside
closes. The commands come from the site and from the page shown (`PaletteState`); on the home page
what is typed can go to the agent as it is. Focus goes back where it was, unless the command took
it somewhere.

```svelte
<CommandPalette palette={getPaletteState()} />
```
-->
<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import type { TransitionConfig } from 'svelte/transition';
	import { Search01Icon } from '@hugeicons/core-free-icons';
	import HugeIcon from '../HugeIcon.svelte';
	import type { PaletteCommand } from './palette';
	import type { PaletteState } from './palette-state.svelte';

	interface Props {
		palette: PaletteState;
	}

	let { palette }: Props = $props();
	const uid = $props.id();

	const rows = $derived(palette.open ? palette.commands(palette.query) : []);
	const current = $derived(Math.min(palette.active, Math.max(0, rows.length - 1)));

	/**
	 * ⌘K anywhere; and while open, esc wherever focus is (before the page's own esc, which would
	 * put the large display away too).
	 */
	function onWindowKey(event: KeyboardEvent): void {
		if (palette.open && event.key === 'Escape' && !event.isComposing) {
			event.preventDefault();
			event.stopPropagation();
			palette.hide();
			return;
		}
		const k = event.key.toLowerCase() === 'k';
		if (!k || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
		event.preventDefault();
		palette.toggle();
	}

	function run(command: PaletteCommand): void {
		palette.hide();
		command.run();
	}

	function onkeydown(event: KeyboardEvent): void {
		if (event.isComposing) return;
		const n = rows.length;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (n > 0) palette.active = (current + (event.key === 'ArrowDown' ? 1 : n - 1)) % n;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (rows[current]) run(rows[current]);
		} else if (event.key === 'Tab') {
			// the field is the palette's one stop: focus stays in it while it is open
			event.preventDefault();
		}
	}

	/** Takes focus into the field, and gives it back on closing unless a command moved it. */
	function holdFocus(node: HTMLElement): () => void {
		const doc = node.ownerDocument;
		const was = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
		node.querySelector('input')?.focus();
		return () => {
			const now = doc.activeElement;
			if (now === null || now === doc.body || node.contains(now)) {
				if (was?.isConnected) was.focus({ preventScroll: true });
			}
		};
	}

	function outside(event: PointerEvent): void {
		if (event.target === event.currentTarget) palette.hide();
	}

	const calm = (node: Element) =>
		node.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;

	/** The card comes down a little as it fades in; with less motion, it only fades. */
	function drop(node: Element, { out = false } = {}): TransitionConfig {
		const still = calm(node);
		return {
			duration: out ? 110 : 180,
			easing: cubicOut,
			css: (t) =>
				still
					? `opacity: ${t}`
					: `opacity: ${t}; transform: translateY(${(1 - t) * -6}px) scale(${0.985 + t * 0.015})`
		};
	}

	function shade(node: Element, { out = false } = {}): TransitionConfig {
		return { duration: out ? 110 : 180, easing: cubicOut, css: (t) => `opacity: ${t}` };
	}
</script>

<svelte:window onkeydowncapture={onWindowKey} />

{#if palette.open}
	<div
		class="palette"
		role="presentation"
		onpointerdown={outside}
		in:shade
		out:shade={{ out: true }}
	>
		<div
			class="palette__card"
			role="dialog"
			aria-modal="true"
			aria-label="commands"
			in:drop
			out:drop={{ out: true }}
			{@attach holdFocus}
		>
			<div class="palette__field">
				<span class="palette__icon"
					><HugeIcon icon={Search01Icon} size="1.0625rem" strokeWidth={1.8} /></span
				>
				<input
					class="palette__input"
					type="text"
					role="combobox"
					aria-label="command or question"
					aria-expanded="true"
					aria-controls="{uid}-rows"
					aria-autocomplete="list"
					aria-activedescendant={rows.length > 0 ? `${uid}-row-${current}` : undefined}
					autocomplete="off"
					spellcheck="false"
					placeholder="ask the agent, or find a command"
					bind:value={palette.query}
					oninput={() => (palette.active = 0)}
					{onkeydown}
				/>
				<kbd class="kbd" aria-hidden="true">esc</kbd>
			</div>
			{#if rows.length > 0}
				<ul class="palette__rows" id="{uid}-rows" role="listbox" aria-label="commands">
					{#each rows as row, i (row.id)}
						<li
							id="{uid}-row-{i}"
							class="row"
							role="option"
							tabindex="-1"
							aria-selected={i === current}
							onpointermove={() => (palette.active = i)}
							onpointerdown={(event) => event.preventDefault()}
							onclick={() => run(row)}
							{onkeydown}
						>
							<span class="row__text">
								<span class="row__label">{row.label}</span>
								{#if row.detail}<span class="row__detail">{row.detail}</span>{/if}
							</span>
							{#if row.hint}<kbd class="kbd">{row.hint}</kbd>{/if}
							<span class="row__group">{row.group}</span>
						</li>
					{/each}
				</ul>
			{:else if palette.query.trim()}
				<p class="palette__none">nothing for “{palette.query.trim()}”</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.palette {
		position: fixed;
		inset: 0;
		z-index: calc(var(--xy-z-tooltip) + 1);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: max(4.5rem, 14vh) 1rem 1rem;
		background-color: rgb(0 0 0 / 0.38);
	}

	:global([data-theme='light']) .palette {
		background-color: rgb(15 14 18 / 0.14);
	}

	.palette__card {
		display: flex;
		flex-direction: column;
		width: min(37.5rem, 100%);
		overflow: hidden;
		border: 1px solid var(--xy-line);
		border-radius: 0.5rem;
		background-color: var(--xy-surface-raised);
		box-shadow: var(--xy-shadow-float);
		transform-origin: 50% 0;
	}

	.palette__field {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		height: 3rem;
		padding: 0 0.75rem 0 0.9375rem;
		border-bottom: 1px solid var(--xy-line);
	}

	.palette__icon {
		display: inline-flex;
		flex: none;
		color: var(--xy-fg-subtle);
	}

	.palette__input {
		flex: 1;
		min-width: 0;
		height: 100%;
		padding: 0;
		border: 0;
		background: none;
		color: var(--xy-fg);
		font: inherit;
		font-size: var(--xy-text-base);
		caret-color: var(--xy-fg);
	}

	.palette__input:focus,
	.palette__input:focus-visible {
		outline: none;
	}

	.palette__input::placeholder {
		color: var(--xy-fg-faint);
	}

	.palette__rows {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0.375rem;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		height: 2.25rem;
		padding: 0 0.625rem;
		border-radius: 0.3125rem;
		cursor: pointer;
		transition: background-color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.row[aria-selected='true'] {
		background-color: var(--xy-surface-sunken);
	}

	.row__text {
		display: flex;
		flex: 1;
		align-items: baseline;
		gap: 0.5rem;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
	}

	.row__label {
		flex: none;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}

	.row__detail {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.row__group {
		flex: none;
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
	}

	.kbd {
		flex: none;
		min-width: 1.25rem;
		padding: 0.0625rem 0.3125rem;
		border: 1px solid var(--xy-line-strong);
		border-radius: 0.25rem;
		color: var(--xy-fg-subtle);
		font-family: inherit;
		font-size: var(--xy-text-2xs);
		line-height: 1.4;
		text-align: center;
	}

	.palette__none {
		margin: 0;
		padding: 0.875rem 1rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}
</style>
