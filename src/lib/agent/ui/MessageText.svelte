<!--
@component
An agent answer in markdown-lite, rendered with components (never `{@html}`). Key combos written in
backticks are drawn as the OP-XY's own keys (`KeyCombo`); clicking one plays it on the replica, and
pointing at one (`onpoint`) lets the page ring its keys there. Citations of manual units
(`[sequencer.parameter-locks]`) become small links to the unit's source, and citations the model
attached through search results are listed underneath. While the answer is still being written
(`streaming`), a caret blinks at its end.
-->
<script module lang="ts">
	/** What a manual citation points at. */
	export interface CitationTarget {
		readonly title: string;
		/** Where the unit is read (our manual's page, or TE's), or null when there is none. */
		readonly href: string | null;
		/** Open it in a new tab (the default: a chat keeps its place); false for a page of the app. */
		readonly external?: boolean;
	}
</script>

<script lang="ts">
	import type { ControlId } from '$lib/core/opxy';
	import KeyCombo from '$lib/replica/glyphs/KeyCombo.svelte';
	import { comboIds, parseCombo } from '$lib/replica/glyphs/art';
	import type { Citation } from '../types';
	import { parseMarkdown, type Inline } from './markdown';

	interface Props {
		/** The answer text (may still be streaming). */
		text: string;
		/** Sources the model cited for this text. */
		citations?: readonly Citation[];
		/** Plays a key combo on the replica. */
		onkeys?: (keys: string) => void;
		/** The controls of the keys being pointed at or focused (null when none): ring them. */
		onpoint?: (ids: readonly ControlId[] | null) => void;
		/** Resolves a manual citation (`unit-id` or `unit-id#fact-id`); null when unknown. */
		cite?: (ref: string) => CitationTarget | null;
		/** The answer is still streaming: show a caret at its end. */
		streaming?: boolean;
		/** One line inside other text (a note, a caption): no paragraphs, the page's own type. */
		inline?: boolean;
	}

	let {
		text,
		citations = [],
		onkeys,
		onpoint,
		cite,
		streaming = false,
		inline = false
	}: Props = $props();

	const isKeys = (code: string) => code.length <= 80 && parseCombo(code) !== null;
	/** What the replica plays for a combo: a knob named on its own turns. */
	const playable = (code: string) => (parseCombo(code)?.mention ? `turn ${code}` : code);
	const blocks = $derived(parseMarkdown(text, { isKeys }));
	/** In `inline` mode: the text's paragraphs run together on one line. */
	const inlineNodes = $derived(
		blocks.flatMap((block, i): Inline[] => {
			if (block.t !== 'p' && block.t !== 'h' && block.t !== 'quote') return [];
			return i > 0 ? [{ t: 'text', v: ' ' }, ...block.c] : [...block.c];
		})
	);
</script>

<!-- Links are external (model-cited https URLs, already checked by the parser); resolve() is for app routes. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
{#snippet inlines(nodes: readonly Inline[])}
	{#each nodes as node, i (i)}
		{#if node.t === 'text'}{node.v}{:else if node.t === 'br'}<br
			/>{:else if node.t === 'strong'}<strong>{@render inlines(node.c)}</strong
			>{:else if node.t === 'em'}<em>{@render inlines(node.c)}</em>{:else if node.t === 'code'}<code
				>{node.v}</code
			>{:else if node.t === 'keys'}<button
				type="button"
				class="keys"
				aria-label="show {node.v} on the replica"
				title="show on the replica"
				disabled={!onkeys}
				onclick={() => onkeys?.(playable(node.v))}
				onfocus={() => onpoint?.(comboIds(node.v))}
				onblur={() => onpoint?.(null)}><KeyCombo keys={node.v} {onpoint} /></button
			>{:else if node.t === 'link'}<a href={node.href} target="_blank" rel="noopener noreferrer"
				>{@render inlines(node.c)}</a
			>{:else if node.t === 'cite'}{@const target =
				cite?.(node.ref) ?? null}{#if target?.href && target.external === false}<a
					class="cite"
					href={target.href}
					title={node.ref}>{target.title}</a
				>{:else if target?.href}<a
					class="cite"
					href={target.href}
					target="_blank"
					rel="noopener noreferrer"
					title={node.ref}>{target.title}</a
				>{:else}<span class="cite" title={node.ref}>{target?.title ?? node.ref}</span>{/if}{/if}
	{/each}
{/snippet}

<!-- The caret goes inside the last block, right after its last character. -->
{#snippet caret(last: boolean)}{#if streaming && last}<span class="caret" aria-hidden="true"
		></span>{/if}{/snippet}

{#if inline}
	<span class="md-inline">{@render inlines(inlineNodes)}</span>
{:else}
	<div class="md">
		{#each blocks as block, i (i)}
			{@const last = i === blocks.length - 1}
			{#if block.t === 'p'}
				<p>{@render inlines(block.c)}{@render caret(last)}</p>
			{:else if block.t === 'h'}
				<p class="md__h md__h--{block.level}">{@render inlines(block.c)}{@render caret(last)}</p>
			{:else if block.t === 'list'}
				{#if block.ordered}
					<ol start={block.start}>
						{#each block.items as item, j (j)}
							<li class={[item.depth > 0 && 'md__sub']}>
								{@render inlines(item.c)}{@render caret(last && j === block.items.length - 1)}
							</li>
						{/each}
					</ol>
				{:else}
					<ul>
						{#each block.items as item, j (j)}
							<li class={[item.depth > 0 && 'md__sub']}>
								{@render inlines(item.c)}{@render caret(last && j === block.items.length - 1)}
							</li>
						{/each}
					</ul>
				{/if}
			{:else if block.t === 'code'}
				<pre><code>{block.v}{@render caret(last)}</code></pre>
			{:else if block.t === 'quote'}
				<blockquote>{@render inlines(block.c)}{@render caret(last)}</blockquote>
			{:else if block.t === 'table'}
				<div class="md__table">
					<table>
						<thead>
							<tr>
								{#each block.head as cell, j (j)}<th>{@render inlines(cell)}</th>{/each}
							</tr>
						</thead>
						<tbody>
							{#each block.rows as row, r (r)}
								<tr>
									{#each row as cell, j (j)}<td>{@render inlines(cell)}</td>{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else if block.t === 'hr'}
				<hr />
			{/if}
		{/each}
		{#if streaming && (blocks.length === 0 || ['table', 'hr'].includes(blocks[blocks.length - 1].t))}
			<p>{@render caret(true)}</p>
		{/if}
		{#if citations.length > 0}
			<ul class="md__sources" aria-label="sources">
				{#each citations as citation (citation.source)}
					<li>
						{#if /^https?:\/\//.test(citation.source)}
							<a href={citation.source} target="_blank" rel="noopener noreferrer"
								>{citation.title}</a
							>
						{:else}
							{citation.title}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<!-- eslint-enable svelte/no-navigation-without-resolve -->

<style>
	.md {
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		line-height: var(--xy-leading-sm);
		overflow-wrap: anywhere;
	}

	.md > :first-child {
		margin-top: 0;
	}

	.md > :last-child {
		margin-bottom: 0;
	}

	p,
	ul,
	ol,
	pre,
	blockquote,
	.md__table {
		margin: 0 0 0.625rem;
	}

	.md__h {
		margin: 0.875rem 0 0.375rem;
		font-weight: var(--xy-weight-medium);
		color: var(--xy-fg);
	}

	.md__h--1 {
		font-size: var(--xy-text-base);
		line-height: var(--xy-leading-base);
	}

	ul,
	ol {
		padding-left: 1.25rem;
	}

	li {
		margin: 0.1875rem 0;
	}

	li.md__sub {
		margin-left: 1rem;
		list-style-type: circle;
	}

	strong {
		font-weight: var(--xy-weight-medium);
		color: var(--xy-fg);
	}

	em {
		font-style: italic;
	}

	code {
		padding: 0.0625rem 0.3125rem;
		border-radius: var(--xy-radius-card);
		background-color: var(--xy-surface-sunken);
		font-family: var(--xy-font-mono);
		font-size: 0.8125rem;
	}

	pre {
		overflow-x: auto;
		padding: 0.625rem 0.75rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface-sunken);
		box-shadow: var(--xy-shadow-recess);
	}

	pre code {
		padding: 0;
		background: none;
	}

	blockquote {
		padding-left: 0.75rem;
		border-left: 2px solid var(--xy-line-strong);
		color: var(--xy-fg-muted);
	}

	a {
		color: var(--xy-fg);
		text-decoration: underline;
		text-decoration-color: var(--xy-fg-subtle);
		text-underline-offset: 0.18em;
	}

	a:hover {
		text-decoration-color: var(--xy-fg);
	}

	hr {
		margin: 0.875rem 0;
		border: 0;
		border-top: 1px solid var(--xy-line);
	}

	.keys {
		display: inline-flex;
		/* the keys stand a little taller than the line: they do not push the lines apart */
		margin: -0.3em 0.0625rem;
		padding: 0.0625rem;
		border: 0;
		border-radius: var(--xy-radius-tile);
		background: none;
		color: inherit;
		font: inherit;
		vertical-align: middle;
		cursor: pointer;
	}

	.keys :global(.combo) {
		margin-block: 0;
	}

	.keys:disabled {
		cursor: default;
	}

	.keys:not(:disabled):hover {
		background-color: var(--xy-hover);
	}

	.md__table {
		overflow-x: auto;
	}

	table {
		border-collapse: collapse;
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	th,
	td {
		padding: 0.3125rem 0.5rem;
		border-bottom: 1px solid var(--xy-line);
		text-align: left;
		vertical-align: top;
	}

	th {
		font-weight: var(--xy-weight-medium);
		color: var(--xy-fg-muted);
	}

	.cite {
		display: inline-block;
		margin: 0 0.125rem;
		padding: 0 0.3125rem;
		border: 1px solid var(--xy-line);
		border-radius: var(--xy-radius-card);
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		text-decoration: none;
		vertical-align: 0.0625rem;
		white-space: nowrap;
	}

	a.cite:hover {
		border-color: var(--xy-line-strong);
		color: var(--xy-fg);
	}

	.md__sources {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		margin: 0.5rem 0 0;
		padding: 0.5rem 0 0;
		border-top: 1px solid var(--xy-line);
		list-style: none;
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		color: var(--xy-fg-subtle);
	}

	.md__sources a {
		color: var(--xy-fg-subtle);
	}

	/* A block cursor, blinking as a hard square wave like the device's LEDs. */
	.caret {
		display: inline-block;
		width: 0.5ch;
		height: 1.05em;
		margin-left: 0.125rem;
		vertical-align: -0.2em;
		background-color: var(--xy-fg-subtle);
		animation: caret 1s steps(1, end) infinite;
	}

	@keyframes caret {
		50% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.caret {
			animation: none;
		}
	}
</style>
