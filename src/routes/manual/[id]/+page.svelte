<!--
One unit of our manual: what it covers, the steps that do it (each key sequence plays on the replica
beside the text), every fact with where it comes from, the parameters with their gestures and CCs,
and the units around it. The agent cites these pages.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import MessageText, { type CitationTarget } from '$lib/agent/ui/MessageText.svelte';
	import { comboForDisplay } from '$lib/agent/ui/markdown';
	import { tryParseKeys } from '$lib/core/opxy';
	import { getReplicaState, Replica } from '$lib/replica';
	import { Legend } from '$lib/ui';
	import Kbd from '$lib/ui/Kbd.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const unit = $derived(data.unit);
	/**
	 * The body with each paragraph on one line: the source wraps at 100 columns, and the renderer
	 * keeps line breaks (a chat's lines are meant). Lists, tables and quotes keep theirs.
	 */
	const body = $derived(unit.body.replace(/([^\n])\n(?![\n\s]*(?:[-*>|]|\d+\.)\s)(?=\S)/g, '$1 '));
	const replica = getReplicaState();

	/** Where the repository's own sources (research notes, knowledge files) are read. */
	const REPO = 'https://github.com/NeoVand/op-xy-agent/blob/main/';

	const STATUS: Record<string, string> = {
		'outdated-in-guide':
			'The OP-XY has changed since TE’s guide was written; this unit follows the device.',
		'changelog-only': 'Only TE’s changelog describes this; the guide does not.',
		unverified: 'Not checked on a unit yet.'
	};

	const CONFIDENCE: Record<string, string> = {
		verified: 'checked on a unit',
		official: 'TE',
		measured: 'measured',
		'community-verified': 'community, checked',
		community: 'community',
		derived: 'worked out',
		speculative: 'a guess',
		conflicting: 'sources disagree'
	};

	/** A source as a link: TE's pages as they are, the repository's files on GitHub. */
	function sourceHref(source: string): string {
		return /^https?:\/\//.test(source) ? source : `${REPO}${source}`;
	}

	/** A source in a few words. */
	function sourceLabel(source: string): string {
		if (source.includes('teenage.engineering/guides')) return 'TE’s guide';
		if (source.includes('teenage.engineering/downloads')) return 'TE’s changelog';
		if (/^https?:\/\//.test(source)) return new URL(source).hostname;
		const research = /^docs\/research\/(\d+)-/.exec(source);
		if (research) return `research ${research[1]}`;
		return source.split('#')[0].split('/').pop() ?? source;
	}

	/** Plays a key sequence on the replica, when the replica can play it. */
	function play(keys: string): void {
		try {
			replica.animate(keys);
		} catch {
			// not a sequence the replica can play: the keycaps stay as a picture
		}
	}

	const playable = (keys: string) => tryParseKeys(keys).ok;

	/** Citations in the text: this manual's pages, in this tab. */
	function cite(ref: string): CitationTarget | null {
		const [id, fact] = ref.split('#');
		const title = data.titles[id.trim().toLowerCase()];
		if (!title) return null;
		const href = `${resolve('/manual/[id]', { id: id.trim().toLowerCase() })}${fact ? `#${fact}` : ''}`;
		return { title, href, external: false };
	}
</script>

<svelte:head>
	<title>{unit.title} · OP-XY manual</title>
	<meta name="description" content={unit.summary} />
</svelte:head>

<div class="page">
	<nav class="crumbs" aria-label="breadcrumb">
		<a href={resolve('/manual')}>manual</a>
		{#if data.area}<span aria-hidden="true">/</span><span>{data.area.title.toLowerCase()}</span
			>{/if}
	</nav>

	<div class="layout">
		<article class="unit">
			<header class="unit__head">
				<h1 class="unit__title">{unit.title}</h1>
				<p class="unit__lead">{unit.summary}</p>
				{#if STATUS[unit.status]}<p class="unit__status">{STATUS[unit.status]}</p>{/if}
			</header>

			{#if body.trim()}
				<section class="unit__body">
					<MessageText text={body} onkeys={play} {cite} />
				</section>
			{/if}

			{#if unit.procedures.length > 0}
				<section class="block" aria-labelledby="how">
					<h2 class="block__title" id="how">how to</h2>
					{#each unit.procedures as procedure (procedure.id)}
						<div class="proc" id={procedure.id}>
							<h3 class="proc__goal">{procedure.goal}</h3>
							{#if procedure.preconditions.length > 0}
								<p class="proc__pre">from {procedure.preconditions.join(', ')}</p>
							{/if}
							<ol class="proc__steps">
								{#each procedure.steps as step, i (i)}
									<li>
										{#if playable(step.keys)}
											<button
												type="button"
												class="keys"
												title="show on the replica"
												aria-label="show {step.keys} on the replica"
												onclick={() => play(step.keys)}
											>
												<Kbd combo={comboForDisplay(step.keys)} size="sm" />
											</button>
										{:else}
											<Kbd combo={comboForDisplay(step.keys)} size="sm" />
										{/if}
										{#if step.note}<span class="proc__note">{step.note}</span>{/if}
									</li>
								{/each}
							</ol>
							{#if procedure.result}<p class="proc__result">{procedure.result}</p>{/if}
						</div>
					{/each}
				</section>
			{/if}

			{#if unit.facts.length > 0}
				<section class="block" aria-labelledby="facts">
					<h2 class="block__title" id="facts">facts</h2>
					<ul class="facts">
						{#each unit.facts as fact (fact.id)}
							<li class="fact" id={fact.id}>
								<MessageText text={fact.text} onkeys={play} {cite} />
								<p class="fact__from">
									<span class={['tag', `tag--${fact.confidence}`]}>
										{CONFIDENCE[fact.confidence] ?? fact.confidence}{fact.verified_on
											? ` · ${fact.verified_on}`
											: ''}
									</span>
									<!-- external: TE's pages and the repository on GitHub -->
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
									<a href={sourceHref(fact.source)} target="_blank" rel="noopener noreferrer"
										>{sourceLabel(fact.source)}</a
									>
								</p>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if unit.parameters.length > 0}
				<section class="block" aria-labelledby="params">
					<h2 class="block__title" id="params">parameters</h2>
					<div class="table">
						<table>
							<thead>
								<tr>
									<th>page</th>
									<th>gesture</th>
									<th>parameter</th>
									<th>range</th>
									<th>cc</th>
								</tr>
							</thead>
							<tbody>
								{#each unit.parameters as param, i (i)}
									<tr>
										<td>{param.screen}</td>
										<td><Kbd combo={comboForDisplay(param.keys)} size="sm" /></td>
										<td>
											{param.name}
											{#if param.note}<span class="param__note">{param.note}</span>{/if}
										</td>
										<td>{param.range ?? '–'}{param.default ? ` (${param.default})` : ''}</td>
										<td>{param.cc ?? '–'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			{/if}

			{#if unit.related.length > 0}
				<section class="block" aria-labelledby="related">
					<h2 class="block__title" id="related">related</h2>
					<ul class="related">
						{#each unit.related as id (id)}
							{#if data.titles[id]}
								<li><a href={resolve('/manual/[id]', { id })}>{data.titles[id]}</a></li>
							{/if}
						{/each}
					</ul>
				</section>
			{/if}

			<footer class="unit__foot">
				<nav class="pager" aria-label="more in this area">
					{#if data.prev}
						<a href={resolve('/manual/[id]', { id: data.prev.id })}>← {data.prev.title}</a>
					{:else}<span></span>{/if}
					{#if data.next}
						<a href={resolve('/manual/[id]', { id: data.next.id })}>{data.next.title} →</a>
					{/if}
				</nav>
				<Legend as="p" size="xs" tone="subtle">
					Our wording, for OS {data.firmware} (since {unit.firmware.min}).
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					{#if unit.official_url}
						TE’s own page:
						<a href={unit.official_url} target="_blank" rel="noopener noreferrer"
							>{sourceLabel(unit.official_url)}</a
						>.
					{/if}
					<a href={sourceHref(unit.path)} target="_blank" rel="noopener noreferrer"
						>This unit’s source</a
					>.
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</Legend>
			</footer>
		</article>

		<aside class="side" aria-label="replica">
			<div class="side__sticky">
				<Replica {replica} />
				<Legend as="p" size="xs" tone="subtle">
					Press a key sequence in the text to watch it on the replica.
				</Legend>
			</div>
		</aside>
	</div>
</div>

<style>
	.page {
		width: 100%;
		max-width: 80rem;
		margin: 0 auto;
		padding: 1.25rem 1rem 3rem;
	}

	.crumbs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		letter-spacing: var(--xy-tracking-label);
	}

	.crumbs a {
		color: var(--xy-fg-muted);
		text-decoration: none;
	}

	.crumbs a:hover {
		color: var(--xy-fg);
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(22rem, 30rem);
		gap: 2.5rem;
		align-items: start;
	}

	@media (max-width: 64rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}

		.side {
			order: -1;
		}
	}

	.side__sticky {
		position: sticky;
		top: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.unit {
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
		min-width: 0;
		max-width: 46rem;
	}

	.unit__title {
		margin: 0 0 0.5rem;
		font-size: var(--xy-text-2xl);
		font-weight: var(--xy-weight-light);
		line-height: var(--xy-leading-2xl);
	}

	.unit__lead {
		margin: 0;
		color: var(--xy-fg);
		font-size: var(--xy-text-base);
		line-height: var(--xy-leading-base);
	}

	.unit__status {
		margin: 0.75rem 0 0;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.block__title {
		margin: 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		font-weight: var(--xy-weight-regular);
		letter-spacing: var(--xy-tracking-label);
		text-transform: lowercase;
	}

	.proc {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.875rem 1rem;
		border-radius: var(--xy-radius-tile);
		background-color: var(--xy-surface);
		box-shadow: var(--xy-shadow-plate);
		scroll-margin-top: 1rem;
	}

	.proc__goal {
		margin: 0;
		font-size: var(--xy-text-sm);
		font-weight: var(--xy-weight-medium, 500);
	}

	.proc__pre {
		margin: 0;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		letter-spacing: var(--xy-tracking-label);
	}

	.proc__steps {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding-left: 1.25rem;
	}

	.proc__steps li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.75rem;
		font-size: var(--xy-text-sm);
	}

	.proc__note,
	.proc__result {
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.proc__result {
		margin: 0;
	}

	.keys {
		display: inline-flex;
		padding: 0.125rem;
		border: 0;
		border-radius: var(--xy-radius-sm, 4px);
		background: none;
		color: inherit;
		cursor: pointer;
	}

	.keys:hover,
	.keys:focus-visible {
		background-color: var(--xy-hover);
	}

	.facts {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.fact {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding-left: 0.75rem;
		border-left: 2px solid var(--xy-line);
		scroll-margin-top: 1rem;
	}

	.fact:target {
		border-left-color: var(--xy-fg);
	}

	.fact :global(.md p) {
		margin: 0;
	}

	.fact__from {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		font-size: var(--xy-text-2xs);
		letter-spacing: var(--xy-tracking-label);
	}

	.fact__from a {
		color: var(--xy-fg-subtle);
	}

	.tag {
		color: var(--xy-fg-subtle);
	}

	.tag--verified,
	.tag--measured {
		color: var(--xy-fg);
	}

	.tag--speculative,
	.tag--conflicting {
		color: var(--xy-red, #ff4d00);
	}

	.table {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	th {
		color: var(--xy-fg-subtle);
		font-weight: var(--xy-weight-regular);
		letter-spacing: var(--xy-tracking-label);
		text-align: left;
	}

	th,
	td {
		padding: 0.5rem 0.625rem 0.5rem 0;
		border-bottom: 1px solid var(--xy-line);
		vertical-align: top;
	}

	.param__note {
		display: block;
		color: var(--xy-fg-muted);
	}

	.related {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--xy-text-sm);
	}

	.related a,
	.pager a {
		color: var(--xy-fg);
	}

	.unit__foot {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--xy-line);
	}

	.unit__foot :global(a) {
		color: var(--xy-fg-muted);
	}

	.pager {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		font-size: var(--xy-text-sm);
	}
</style>
