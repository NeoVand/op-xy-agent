<!--
@component
An icon key: a square tile with a round cap, exactly the OP-XY's proportions (cap = 0.606 of the
tile, LED window at twelve o'clock). The `label` is required: it names the key for assistive
technology and doubles as its tooltip.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import Led from './Led.svelte';
	import type { IconName } from './icons';
	import { tooltip } from './tooltip';
	import type { KeySize, KeyVariant, LedState } from './types';

	interface Props extends Omit<HTMLButtonAttributes, 'children' | 'aria-label'> {
		/** What the key does, in a few lowercase words. Required. */
		label: string;
		/** Built-in icon; or pass your own glyph as children. */
		icon?: IconName;
		variant?: KeyVariant;
		/** Tile edge: `sm` 36 px, `md` 48 px, `lg` 64 px (one tile, true to scale). */
		size?: KeySize;
		/** Latched state; renders `aria-pressed` and lights the LED. Bindable. */
		pressed?: boolean;
		/** Flip `pressed` on every click. */
		toggle?: boolean;
		/** Show the LED window in this state (like track, step and keyboard keys). */
		led?: LedState;
		/** Show `label` as a tooltip on hover and keyboard focus. */
		showTooltip?: boolean;
		children?: Snippet;
	}

	let {
		label,
		icon,
		variant = 'key',
		size = 'md',
		pressed = $bindable(),
		toggle = false,
		led,
		showTooltip = true,
		class: className,
		onclick,
		children,
		...rest
	}: Props = $props();

	const ledState: LedState | undefined = $derived(
		led ?? (pressed === undefined ? undefined : pressed ? 'white' : 'off')
	);

	function handleClick(event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
		if (toggle) pressed = !pressed;
		onclick?.(event);
	}
</script>

<button
	type="button"
	class={['ikey', `ikey--${variant}`, `ikey--${size}`, pressed && 'is-pressed', className]}
	aria-label={label}
	aria-pressed={pressed}
	onclick={handleClick}
	{@attach showTooltip && tooltip(label, { describe: false })}
	{...rest}
>
	<span class="ikey__cap">
		{#if ledState}
			<Led state={ledState} size={size === 'lg' ? 'md' : 'sm'} class="ikey__led" />
		{/if}
		<span class="ikey__glyph">
			{#if children}
				{@render children()}
			{:else if icon}
				<Icon name={icon} />
			{/if}
		</span>
	</span>
</button>

<style>
	.ikey {
		--tile-size: var(--xy-key-md);
		--tile: var(--xy-key-tile);
		--cap: var(--xy-key-cap);
		--cap-hover: var(--xy-key-cap-hover);
		--cap-active: var(--xy-key-cap-active);
		--legend: var(--xy-key-legend);

		position: relative;
		display: inline-grid;
		place-items: center;
		flex: none;
		width: var(--tile-size);
		height: var(--tile-size);
		padding: 0;
		border: 0;
		border-radius: var(--xy-radius-tile);
		background-color: var(--tile);
		box-shadow: var(--xy-shadow-tile);
		color: var(--legend);
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		touch-action: manipulation;
		vertical-align: middle;
	}

	.ikey__cap {
		position: relative;
		display: grid;
		place-items: center;
		width: calc(var(--tile-size) * var(--xy-cap-ratio));
		aspect-ratio: 1;
		border-radius: 50%;
		background-color: var(--cap);
		box-shadow: var(--cap-shadow, var(--xy-shadow-cap));
		transition:
			transform var(--xy-dur-release) var(--xy-ease-release),
			box-shadow var(--xy-dur-release) var(--xy-ease-release),
			background-color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.ikey__glyph {
		display: grid;
		place-items: center;
		/* Legend size relative to the cap: the device prints ~3-4.5 mm legends on a 9.4 mm cap. */
		font-size: calc(var(--tile-size) * 0.42);
		line-height: 1;
	}

	/* LED window at twelve o'clock: 65 % of the cap radius above centre. */
	.ikey :global(.ikey__led) {
		position: absolute;
		left: 50%;
		top: 17.5%;
		translate: -50% -50%;
	}

	.ikey:has(:global(.ikey__led)) .ikey__glyph {
		translate: 0 10%;
		font-size: calc(var(--tile-size) * 0.36);
	}

	.ikey:hover .ikey__cap {
		background-color: var(--cap-hover);
	}

	.ikey:active .ikey__cap,
	.ikey.is-pressed .ikey__cap {
		transform: translateY(1px);
		background-color: var(--cap-active);
		box-shadow: var(--cap-shadow-pressed, var(--xy-shadow-cap-pressed));
		transition-duration: var(--xy-dur-press);
		transition-timing-function: var(--xy-ease-press);
	}

	.ikey:focus-visible {
		outline: 2px solid var(--xy-focus);
		outline-offset: 2px;
	}

	.ikey:disabled {
		cursor: not-allowed;
		--legend: var(--xy-fg-faint);
		--cap-hover: var(--cap);
	}

	.ikey:disabled .ikey__cap {
		box-shadow: var(--xy-shadow-cap-pressed);
		transform: none;
	}

	.ikey--sm {
		--tile-size: var(--xy-key-sm);
	}

	.ikey--lg {
		--tile-size: var(--xy-key-lg);
	}

	.ikey--secondary {
		--cap-shadow: var(--xy-key-2-shadow);
		--cap-shadow-pressed: var(--xy-key-2-shadow-pressed);
		--tile: var(--xy-key-2-tile);
		--cap: var(--xy-key-2-cap);
		--cap-hover: var(--xy-key-2-cap-hover);
		--cap-active: var(--xy-key-2-cap-active);
		--legend: var(--xy-key-2-legend);
	}

	.ikey--primary {
		--cap-shadow: var(--xy-key-1-shadow);
		--cap-shadow-pressed: var(--xy-key-1-shadow-pressed);
		--tile: var(--xy-key-1-tile);
		--cap: var(--xy-key-1-cap);
		--cap-hover: var(--xy-key-1-cap-hover);
		--cap-active: var(--xy-key-1-cap-active);
		--legend: var(--xy-key-1-legend);
	}

	/* Dark caps in the light theme: lit LEDs switch back to light so they stay visible. */
	:global([data-theme='light']) .ikey--primary,
	:global([data-theme='light']) .ikey--secondary {
		--xy-led-white: var(--xy-paper);
		--xy-led-off: rgb(247 245 245 / 0.18);
		--xy-led-ring: rgb(0 0 0 / 0.5);
	}

	.ikey--ghost {
		--tile: transparent;
		--cap: transparent;
		--cap-hover: var(--xy-hover);
		--cap-active: var(--xy-hover);
		--legend: var(--xy-fg-muted);
		box-shadow: none;
	}

	.ikey--ghost .ikey__cap,
	.ikey--ghost:active .ikey__cap,
	.ikey--ghost.is-pressed .ikey__cap {
		box-shadow: none;
	}

	.ikey--ghost:hover {
		--legend: var(--xy-fg);
	}
</style>
