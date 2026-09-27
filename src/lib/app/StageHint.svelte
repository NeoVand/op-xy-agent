<!--
@component
The caption line under the replica. Normally it shows `idle` (the page passes an honest status
line: simulated or live). When the bridge reports something the real OP-XY can't take remotely,
a hint takes its place for a few seconds: the keys involved drawn as keycaps, what happened, what
to know about it, a link to TE's guide and a dismiss key. The hint is a tiny black screen in both
themes (like the tooltip) and stays while the pointer or focus rests on it. It may grow past the
line on narrow screens, floating over what follows rather than pushing it down. The live region is
always in the page, so screen readers announce each new hint (and nothing when it goes).

```svelte
<StageHint caption={new HintCaption({ clock, timers })}>
	{#snippet idle()}simulated{/snippet}
</StageHint>
```
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { ClassValue } from 'svelte/elements';
	import { on } from 'svelte/events';
	import Icon from '$lib/ui/Icon.svelte';
	import Kbd from '$lib/ui/Kbd.svelte';
	import type { HintCaption } from './caption.svelte';

	interface Props {
		/** The rate-limited hint state the bridge feeds. */
		caption: HintCaption;
		/** What the line shows while no hint is up. */
		idle?: Snippet;
		class?: ClassValue;
	}

	let { caption, idle, class: className }: Props = $props();

	const hint = $derived(caption.current);

	/**
	 * Keeps the hint up while the pointer or focus rests on it, and lets Escape close it from its
	 * link or its dismiss key. These are not interactions of the card itself, so they are wired here.
	 */
	const engage: Attachment<HTMLElement> = (card) => {
		const offs = [
			on(card, 'pointerenter', () => caption.hold(true)),
			on(card, 'pointerleave', () => caption.hold(false)),
			on(card, 'focusin', () => caption.hold(true)),
			on(card, 'focusout', (event) => {
				const next = event.relatedTarget;
				if (!(next instanceof Node) || !card.contains(next)) caption.hold(false);
			}),
			on(card, 'keydown', (event) => {
				if (event.key !== 'Escape') return;
				event.stopPropagation();
				caption.dismiss();
			})
		];
		return () => {
			for (const off of offs) off();
			caption.hold(false);
		};
	};
</script>

<div class={['line', className]}>
	{#if idle}
		<div class={['line__idle', hint && 'line__idle--covered']}>{@render idle()}</div>
	{/if}
	<div class="line__hint" role="status" aria-live="polite" aria-atomic="true">
		{#if hint}
			{#key hint.key}
				<!-- Always black glass, so its keycaps are the dark theme's in both themes. -->
				<div
					class={['card', !hint.keys && 'card--bare']}
					data-theme="dark"
					data-kind={hint.kind}
					{@attach engage}
				>
					{#if hint.keys}
						<Kbd combo={hint.keys} size="sm" class="card__keys" />
					{/if}
					<p class="card__title">{hint.title}</p>
					{#if hint.detail}
						<p class="card__detail">{hint.detail}</p>
					{/if}
					<div class="card__actions">
						{#if hint.guide}
							<a
								class="card__guide"
								href={hint.guide}
								target="_blank"
								rel="external noopener noreferrer"
							>
								guide<Icon name="external" size="0.875rem" />
								<span class="sr-only">(opens TE's guide in a new tab)</span>
							</a>
						{/if}
						<button
							class="card__close"
							type="button"
							aria-label="dismiss hint"
							onclick={() => caption.dismiss()}
						>
							<Icon name="close" size="1rem" />
						</button>
					</div>
				</div>
			{/key}
		{/if}
	</div>
</div>

<style>
	.line {
		position: relative;
		display: grid;
		align-items: center;
	}

	.line__idle {
		transition: opacity var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.line__idle--covered {
		opacity: 0;
	}

	/* The hint floats at the top of the line: it may grow past it without moving what follows. */
	.line__hint {
		position: absolute;
		inset: 0 0 auto 0;
		display: flex;
		pointer-events: none;
	}

	/* Keycaps, the title and the actions on the first line; the detail runs under the title and
	 * the actions, so it rarely needs a second line of its own. */
	.card {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: start;
		column-gap: 0.625rem;
		width: fit-content;
		max-width: 100%;
		padding: 0.4375rem 0.375rem 0.4375rem 0.5rem;
		border-radius: var(--xy-radius-card);
		background: var(--xy-scr-bg);
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 0.08),
			0 8px 24px -6px rgb(0 0 0 / 0.6);
		color: var(--xy-scr-fg);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		pointer-events: auto;
		animation: card-in var(--xy-dur-quick) var(--xy-ease-standard) both;
	}

	.card--bare {
		grid-template-columns: minmax(0, 1fr) auto;
		padding-left: 0.625rem;
	}

	.card :global(.card__keys) {
		grid-row: 1;
		font-size: 0.8125rem;
		/* Centre the keycaps on the first 20 px line. */
		margin-top: -0.0625rem;
	}

	.card__title,
	.card__detail {
		margin: 0;
		text-wrap: pretty;
	}

	.card__title {
		grid-row: 1;
	}

	.card__detail {
		grid-row: 2;
		grid-column: 2 / -1;
		color: var(--xy-scr-muted);
	}

	.card--bare .card__detail {
		grid-column: 1 / -1;
	}

	.card__actions {
		grid-row: 1;
		grid-column: -2;
		display: flex;
		align-items: center;
		gap: 0.125rem;
		margin-top: -0.25rem;
	}

	.card__guide {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.375rem;
		border-radius: var(--xy-radius-tile);
		color: var(--xy-scr-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		text-decoration: none;
		white-space: nowrap;
		transition: color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.card__close {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: 0;
		border-radius: var(--xy-radius-tile);
		background: transparent;
		color: var(--xy-scr-muted);
		cursor: pointer;
		transition:
			color var(--xy-dur-quick) var(--xy-ease-standard),
			background-color var(--xy-dur-quick) var(--xy-ease-standard);
	}

	.card__guide:hover,
	.card__guide:focus-visible,
	.card__close:hover,
	.card__close:focus-visible {
		color: var(--xy-scr-fg);
	}

	.card__close:hover {
		background-color: rgb(255 255 255 / 0.08);
	}

	.card__guide:focus-visible,
	.card__close:focus-visible {
		outline: 2px solid var(--xy-scr-fg);
		outline-offset: 1px;
	}

	@keyframes card-in {
		from {
			opacity: 0;
			translate: 0 -0.25rem;
		}
	}

	/* Narrow screens: caption-sized words take the full width under the keycaps and the actions. */
	@media (max-width: 40rem) {
		.card {
			font-size: var(--xy-text-xs);
			line-height: var(--xy-leading-xs);
		}

		.card__title {
			grid-row: 2;
			grid-column: 1 / -1;
			margin-top: 0.25rem;
		}

		.card__detail {
			grid-row: 3;
			grid-column: 1 / -1;
		}

		.card__actions {
			grid-column: 2 / -1;
			justify-self: end;
		}

		.card--bare .card__actions {
			grid-column: 1 / -1;
		}
	}
</style>
