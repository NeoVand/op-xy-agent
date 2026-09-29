<!--
@component
An on/off switch modelled on the OP-XY's power slider: a recessed slot with a light-grey tab. When on,
the tab slides across and uncovers a lit LED. The whole row (switch and label) is clickable.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLButtonAttributes, 'children' | 'role' | 'onchange'> {
		/** On or off. Bindable. */
		checked?: boolean;
		/** Visible label text (lowercase). Or pass `children` for richer labels. */
		label?: string;
		/** Optional helper line under the label. */
		description?: string;
		/** Called with the new value after a toggle. */
		onchange?: (checked: boolean) => void;
		children?: Snippet;
	}

	let {
		checked = $bindable(false),
		label,
		description,
		onchange,
		disabled = false,
		id,
		class: className,
		children,
		...rest
	}: Props = $props();

	const uid = $props.id();
	const switchId = $derived(id ?? `${uid}-switch`);
	const labelId = `${uid}-label`;
	const descriptionId = `${uid}-description`;

	function flip() {
		checked = !checked;
		onchange?.(checked);
	}
</script>

<span class={['row', disabled && 'is-disabled', className]}>
	<button
		type="button"
		role="switch"
		id={switchId}
		class="switch"
		aria-checked={checked}
		aria-labelledby={label || children ? labelId : undefined}
		aria-describedby={description ? descriptionId : undefined}
		{disabled}
		onclick={flip}
		{...rest}
	>
		<span class="slot">
			<span class="lamp" data-on={checked || undefined}></span>
			<span class="tab"></span>
		</span>
	</button>
	{#if label || children || description}
		<span class="text">
			{#if label || children}
				<label id={labelId} for={switchId} class="label">
					{#if children}{@render children()}{:else}{label}{/if}
				</label>
			{/if}
			{#if description}
				<span id={descriptionId} class="description">{description}</span>
			{/if}
		</span>
	{/if}
</span>

<style>
	.row {
		display: inline-flex;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.switch {
		flex: none;
		padding: 0.1875rem;
		margin: 0;
		border: 0;
		border-radius: var(--xy-radius-tile);
		background: none;
		cursor: pointer;
	}

	.switch:focus-visible {
		outline: 1.5px solid var(--xy-focus);
		outline-offset: 1px;
	}

	.slot {
		position: relative;
		display: block;
		width: 2.5rem;
		height: 1.375rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		box-shadow:
			var(--xy-shadow-recess),
			0 0 0 1px var(--xy-line-strong);
	}

	.lamp {
		position: absolute;
		left: 0.5rem;
		top: 50%;
		width: var(--xy-led-size);
		height: var(--xy-led-size);
		translate: 0 -50%;
		border-radius: 50%;
		background-color: var(--xy-led-off);
		transition:
			background-color var(--xy-dur-led-off) var(--xy-ease-decay),
			box-shadow var(--xy-dur-led-off) var(--xy-ease-decay);
	}

	.lamp[data-on] {
		background-color: var(--xy-led-white);
		box-shadow: var(--xy-glow-white);
		/* the LED lights once the tab has uncovered it */
		transition-duration: var(--xy-dur-led-on);
		transition-delay: calc(var(--xy-dur-quick) * 0.6);
	}

	/* The power-switch tab: a light-grey block with a single grip groove. */
	.tab {
		position: absolute;
		top: 0.1875rem;
		left: 0.1875rem;
		width: 1rem;
		height: 1rem;
		border-radius: 0.1875rem;
		background: linear-gradient(to bottom, #e4e2e0, var(--xy-mat-switch) 55%, #bdbbb8);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.7),
			0 0 0 1px rgb(0 0 0 / 0.35),
			0 1px 2px rgb(0 0 0 / 0.45);
		transition: transform var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.tab::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 28%;
		bottom: 28%;
		width: 1px;
		translate: -50% 0;
		background-color: rgb(0 0 0 / 0.22);
		box-shadow: 1px 0 0 rgb(255 255 255 / 0.5);
	}

	.switch[aria-checked='true'] .tab {
		transform: translateX(1.125rem);
	}

	.switch:disabled {
		cursor: not-allowed;
	}

	.is-disabled .slot {
		opacity: 0.5;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding-top: 0.3125rem;
	}

	.label {
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		cursor: pointer;
	}

	.is-disabled .label {
		color: var(--xy-fg-faint);
		cursor: not-allowed;
	}

	.description {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}
</style>
