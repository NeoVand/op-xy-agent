<!--
@component
The manual's side rail: the replica's screen enlarged on top (the panel's own is too small to read)
and the live replica under it, so the screen and the keys are seen together, both as wide as the
page leaves them — capped so the screen, the replica, the hint and the page list still fit the
window while the rail sticks — then the page's sections. On narrow pages it sits above the text.

```svelte
<ManualRail {replica} {sections} {reading}>
	{#snippet hint()}Point at a key in the text to find it here.{/snippet}
</ManualRail>
```
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Replica, type ReplicaState } from '$lib/replica';
	import Screen from '$lib/replica/Screen.svelte';

	interface Props {
		replica: ReplicaState;
		/** A line under the replica: what it does on this page. */
		hint: Snippet;
		/** The page's sections, for its list (hidden when there are fewer than two). */
		sections?: readonly { readonly id: string; readonly title: string }[];
		/** The section being read, which the list marks. */
		reading?: string | null;
	}

	let { replica, hint, sections = [], reading = null }: Props = $props();
</script>

<aside class="rail" aria-label="replica">
	<div class="rail__sticky">
		<!-- the same page as the replica's own screen, which already speaks it: hidden from readers -->
		<div class="rail__screen" aria-hidden="true">
			<Screen lines={replica.screen.lines} />
		</div>
		<div class="rail__replica"><Replica {replica} /></div>
		<p class="rail__hint">{@render hint()}</p>
		{#if sections.length > 1}
			<nav class="toc" aria-label="on this page">
				<p class="toc__title">on this page</p>
				<div class="toc__links">
					{#each sections as section (section.id)}
						<a
							class="toc__link"
							href="#{section.id}"
							aria-current={section.id === reading ? 'location' : undefined}>{section.title}</a
						>
					{/each}
				</div>
			</nav>
		{/if}
	</div>
</aside>

<style>
	.rail {
		min-width: 0;
	}

	.rail__sticky {
		position: sticky;
		top: calc(var(--xy-header-h) + 1.5rem);
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		/* as wide as the column, but only as wide as lets the screen (222/480 of its width), the
		   replica (102/285), the hint and the page list stand in the window at once */
		max-width: max(20rem, calc((100dvh - var(--xy-header-h) - 15rem) / 0.83));
	}

	/* the display on its own: black glass in a thin bezel, the device's rounded corners */
	.rail__screen {
		aspect-ratio: 480 / 222;
		overflow: hidden;
		border: 0.3125rem solid #0b0b0d;
		border-radius: 0.875rem;
		background: #000000;
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 0.06),
			0 0.75rem 1.75rem -1rem rgb(0 0 0 / 0.6);
	}

	.rail__hint {
		margin: 0;
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
	}

	.rail__hint :global(em) {
		color: var(--xy-fg-subtle);
		font-style: normal;
	}

	.toc {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-top: 0.75rem;
		padding-top: 0.875rem;
		border-top: 1px solid var(--xy-line);
	}

	.toc__title {
		margin: 0 0 0.25rem;
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-2xs);
		letter-spacing: var(--xy-tracking-label);
	}

	.toc__links {
		display: flex;
		flex-direction: column;
		border-left: 1px solid var(--xy-line);
	}

	.toc__link {
		margin-left: -1px;
		padding: 0.25rem 0 0.25rem 0.75rem;
		border-left: 1px solid transparent;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		text-decoration: none;
		transition:
			color var(--xy-dur-quick, 120ms) ease,
			border-color var(--xy-dur-quick, 120ms) ease;
	}

	.toc__link:hover {
		color: var(--xy-fg);
	}

	.toc__link[aria-current='location'] {
		border-left-color: var(--xy-fg);
		color: var(--xy-fg);
	}

	/* narrower (the page's one column): above the text, the screen and the replica side by side,
	   no longer sticking; the page list dropped */
	@container (max-width: 58rem) {
		.rail {
			order: -1;
		}

		.rail__sticky {
			position: static;
			display: grid;
			grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
			align-items: center;
			gap: 0.875rem 1rem;
			max-width: 48rem;
		}

		.rail__hint {
			grid-column: 1 / -1;
		}

		.toc {
			display: none;
		}
	}

	/* a phone: one above the other */
	@container (max-width: 36rem) {
		.rail__sticky {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
