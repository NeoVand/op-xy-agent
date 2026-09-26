<!--
@component
A key. Like an OP-XY key it is a flat tile holding a raised cap: pressing moves the cap down and
collapses its shadow, releasing snaps it back. Text stretches the round cap into a stadium, the way
the device's wide accidental tiles still carry round caps.

Emphasis climbs the grey ramp, like the step row: `key` (dark, default), `secondary` (mid grey),
`primary` (the light key: at most one per view), `ghost` (legend only). Pass `href` to render a link;
build internal hrefs with `resolve()` from `$app/paths`.
Set `pressed` (optionally with `toggle`) for a latching key; its LED lights while pressed.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ClassValue, HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import Led from './Led.svelte';
	import type { KeySize, KeyVariant, LedState } from './types';

	interface Common {
		variant?: KeyVariant;
		size?: KeySize;
		/** Latched state. Renders `aria-pressed` and lights the LED. Bindable. */
		pressed?: boolean;
		/** Flip `pressed` on every click (a latching key). */
		toggle?: boolean;
		/** Force an LED window on the cap, independent of `pressed`. */
		led?: LedState;
		/** Working: the LED blinks and the key reports `aria-busy`. */
		busy?: boolean;
		/** Leading icon. */
		icon?: Snippet;
		children?: Snippet;
		class?: ClassValue;
	}

	type ButtonProps = Common &
		Omit<HTMLButtonAttributes, 'class' | 'children'> & { href?: undefined };
	type LinkProps = Common & Omit<HTMLAnchorAttributes, 'class' | 'children'> & { href: string };

	let {
		variant = 'key',
		size = 'md',
		pressed = $bindable(),
		toggle = false,
		led,
		busy = false,
		icon,
		children,
		class: className,
		href,
		onclick,
		...rest
	}: ButtonProps | LinkProps = $props();

	const ledState: LedState | undefined = $derived(
		led ?? (busy ? 'white' : pressed === undefined ? undefined : pressed ? 'white' : 'off')
	);
	const classes = $derived([
		'key',
		`key--${variant}`,
		`key--${size}`,
		pressed && 'is-pressed',
		className
	]);

	// aria-disabled keeps a key focusable (so it can explain itself) but it must not act.
	const inert = $derived(rest['aria-disabled'] === true || rest['aria-disabled'] === 'true');

	function handleClick(event: MouseEvent & { currentTarget: EventTarget & HTMLElement }) {
		if (inert) {
			event.preventDefault();
			return;
		}
		if (toggle) pressed = !pressed;
		// The handler type differs between <a> and <button>; both receive a MouseEvent.
		(onclick as ((e: MouseEvent) => void) | null | undefined)?.(event);
	}
</script>

{#snippet cap()}
	<span class="key__cap">
		{#if ledState}
			<Led state={ledState} blink={busy ? 'fast' : false} size="sm" class="key__led" />
		{/if}
		{#if icon}
			<span class="key__icon">{@render icon()}</span>
		{/if}
		{#if children}
			<span class="key__legend">{@render children()}</span>
		{/if}
	</span>
{/snippet}

{#if href !== undefined}
	<!-- The href is a pass-through prop: callers build it with resolve() (or use an external URL). -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		{href}
		class={classes}
		aria-busy={busy || undefined}
		onclick={handleClick}
		{...rest as Omit<HTMLAnchorAttributes, 'class' | 'children'>}
	>
		{@render cap()}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
	<button
		type="button"
		class={classes}
		aria-pressed={pressed}
		aria-busy={busy || undefined}
		onclick={handleClick}
		{...rest as Omit<HTMLButtonAttributes, 'class' | 'children'>}
	>
		{@render cap()}
	</button>
{/if}

<style>
	.key {
		/* geometry (overridden per size) */
		--h: 2.5rem;
		--inset: 0.3125rem;
		--pad: 0.875rem;
		--font: var(--xy-text-sm);
		/* material (overridden per variant) */
		--tile: var(--xy-key-tile);
		--cap: var(--xy-key-cap);
		--cap-hover: var(--xy-key-cap-hover);
		--cap-active: var(--xy-key-cap-active);
		--legend: var(--xy-key-legend);

		position: relative;
		display: inline-flex;
		align-items: stretch;
		height: var(--h);
		padding: var(--inset);
		border: 0;
		border-radius: var(--xy-radius-tile);
		background-color: var(--tile);
		box-shadow: var(--xy-shadow-tile);
		color: var(--legend);
		font: inherit;
		text-decoration: none;
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		touch-action: manipulation;
		vertical-align: middle;
	}

	.key__cap {
		display: inline-flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		gap: 0.5em;
		min-width: calc(var(--h) - 2 * var(--inset));
		padding-inline: var(--pad);
		border-radius: var(--xy-radius-cap);
		background-color: var(--cap);
		box-shadow: var(--cap-shadow, var(--xy-shadow-cap));
		font-size: var(--font);
		line-height: 1;
		font-weight: var(--xy-weight-regular);
		white-space: nowrap;
		/* release: back up with a small rebound */
		transition:
			transform var(--xy-dur-release) var(--xy-ease-release),
			box-shadow var(--xy-dur-release) var(--xy-ease-release),
			background-color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.key__icon {
		display: inline-flex;
		font-size: 1.15em;
	}

	.key__legend {
		/* optical centring: Work Sans sits a hair high in a line box of 1 */
		padding-top: 0.06em;
	}

	.key:hover .key__cap {
		background-color: var(--cap-hover);
	}

	/* press: straight down, instantly */
	.key:active .key__cap,
	.key.is-pressed .key__cap {
		transform: translateY(1px);
		background-color: var(--cap-active);
		box-shadow: var(--cap-shadow-pressed, var(--xy-shadow-cap-pressed));
		transition-duration: var(--xy-dur-press);
		transition-timing-function: var(--xy-ease-press);
	}

	.key:focus-visible {
		outline: 2px solid var(--xy-focus);
		outline-offset: 2px;
	}

	.key:disabled,
	.key[aria-disabled='true'] {
		cursor: not-allowed;
		--legend: var(--xy-fg-faint);
		--cap-hover: var(--cap);
	}

	.key:disabled .key__cap,
	.key[aria-disabled='true'] .key__cap {
		box-shadow: var(--xy-shadow-cap-pressed);
		transform: none;
	}

	/* ---------- sizes */
	.key--sm {
		--h: 2rem;
		--inset: 0.25rem;
		--pad: 0.625rem;
		--font: var(--xy-text-xs);
	}

	.key--sm .key__cap {
		font-weight: 450;
	}

	.key--lg {
		--h: 3rem;
		--inset: 0.375rem;
		--pad: 1.125rem;
		--font: var(--xy-text-base);
	}

	/* ---------- variants */
	.key--secondary {
		--cap-shadow: var(--xy-key-2-shadow);
		--cap-shadow-pressed: var(--xy-key-2-shadow-pressed);
		--tile: var(--xy-key-2-tile);
		--cap: var(--xy-key-2-cap);
		--cap-hover: var(--xy-key-2-cap-hover);
		--cap-active: var(--xy-key-2-cap-active);
		--legend: var(--xy-key-2-legend);
	}

	.key--primary {
		--cap-shadow: var(--xy-key-1-shadow);
		--cap-shadow-pressed: var(--xy-key-1-shadow-pressed);
		--tile: var(--xy-key-1-tile);
		--cap: var(--xy-key-1-cap);
		--cap-hover: var(--xy-key-1-cap-hover);
		--cap-active: var(--xy-key-1-cap-active);
		--legend: var(--xy-key-1-legend);
	}

	.key--secondary:disabled,
	.key--primary:disabled {
		--tile: var(--xy-key-tile);
		--cap: var(--xy-key-cap);
		--legend: var(--xy-fg-faint);
	}

	/* Dark caps in the light theme: lit LEDs switch back to light so they stay visible. */
	:global([data-theme='light']) .key--primary,
	:global([data-theme='light']) .key--secondary {
		--xy-led-white: var(--xy-paper);
		--xy-led-off: rgb(247 245 245 / 0.18);
		--xy-led-ring: rgb(0 0 0 / 0.5);
	}

	.key--ghost {
		--tile: transparent;
		--cap: transparent;
		--cap-hover: var(--xy-hover);
		--cap-active: var(--xy-hover);
		--legend: var(--xy-fg-muted);
		box-shadow: none;
	}

	.key--ghost .key__cap,
	.key--ghost:active .key__cap,
	.key--ghost.is-pressed .key__cap {
		box-shadow: none;
	}

	.key--ghost:hover {
		--legend: var(--xy-fg);
	}

	.key :global(.key__led) {
		margin-left: -0.125em;
	}
</style>
