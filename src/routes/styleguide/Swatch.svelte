<!--
@component
A colour chip with its token and value. The chip paints `var(token)`, so it follows the theme.
-->
<script lang="ts">
	interface Props {
		/** CSS custom property, e.g. `--xy-ramp-3`. */
		token: string;
		/** Human label. */
		name: string;
		/** Hex shown under the name (static tokens). */
		hex?: string;
		/** What it is for. */
		note?: string;
		/** Round chip, for caps and LEDs. */
		round?: boolean;
	}

	let { token, name, hex, note, round = false }: Props = $props();
</script>

<figure class="swatch">
	<div class={['chip', round && 'chip--round']} style:background-color="var({token})"></div>
	<figcaption>
		<span class="name">{name}</span>
		<code class="value">{hex ?? token}</code>
		{#if note}<span class="note">{note}</span>{/if}
	</figcaption>
</figure>

<style>
	.swatch {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0;
		min-width: 0;
	}

	.chip {
		flex: none;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: var(--xy-radius-tile);
		box-shadow: inset 0 0 0 1px rgb(128 128 134 / 0.28);
	}

	.chip--round {
		border-radius: 50%;
	}

	figcaption {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 0.0625rem;
	}

	.name {
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
	}

	.value {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.note {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}
</style>
