<!--
One unit of our manual: what it covers, its procedures (each step's keys drawn as keycaps, the whole
procedure playable on the replica beside the text), every detail with where it comes from, the
parameters with their gestures and CCs, and the units around it. The agent cites these pages.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		Alert02Icon,
		ArrowLeft01Icon,
		ArrowRight01Icon,
		BookOpen02Icon,
		CheckmarkCircle02Icon,
		GithubIcon,
		InformationCircleIcon,
		LinkSquare02Icon,
		PlayIcon,
		UserGroupIcon
	} from '@hugeicons/core-free-icons';
	import type { IconSvgElement } from '@hugeicons/svelte';
	import MessageText, { type CitationTarget } from '$lib/agent/ui/MessageText.svelte';
	import { comboForDisplay } from '$lib/agent/ui/markdown';
	import { tryParseKeys } from '$lib/core/opxy';
	import type { AreaId, ManualProcedure } from '$lib/manual';
	import { getReplicaState, Replica } from '$lib/replica';
	import { HugeIcon } from '$lib/ui';
	import Kbd from '$lib/ui/Kbd.svelte';
	import { AREA_ICONS, areaName, unitSections } from '$lib/ui/manual/areas';
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
			'The OP-XY has changed since TE’s guide was written; this page follows the device.',
		'changelog-only': 'Only TE’s changelog describes this; the guide does not.',
		unverified: 'Not yet checked on a unit.'
	};

	/** Where a detail comes from, in a word and an icon. */
	function provenance(confidence: string, source: string): { icon: IconSvgElement; text: string } {
		switch (confidence) {
			case 'verified':
				return { icon: CheckmarkCircle02Icon, text: 'checked on a unit' };
			case 'measured':
				return { icon: CheckmarkCircle02Icon, text: 'measured' };
			case 'community':
			case 'community-verified':
				return { icon: UserGroupIcon, text: 'community' };
			case 'derived':
				return { icon: InformationCircleIcon, text: 'worked out' };
			case 'speculative':
			case 'conflicting':
				return {
					icon: Alert02Icon,
					text: confidence === 'speculative' ? 'unconfirmed' : 'disputed'
				};
			default:
				return {
					icon: BookOpen02Icon,
					text: source.includes('/downloads/') ? 'TE’s changelog' : 'TE’s guide'
				};
		}
	}

	/** A source as a link: TE's pages as they are, the repository's files on GitHub. */
	const sourceHref = (source: string) =>
		/^https?:\/\//.test(source) ? source : `${REPO}${source}`;

	const playable = (keys: string) => tryParseKeys(keys).ok;

	/** Plays a key sequence on the replica, when the replica can play it. */
	function play(keys: string): void {
		try {
			replica.animate(keys);
		} catch {
			// not a sequence the replica can play: the keycaps stay as a picture
		}
	}

	/** The procedure's playable steps, one after another. */
	function playProcedure(procedure: ManualProcedure): void {
		const steps = procedure.steps.map((step) => step.keys).filter(playable);
		if (steps.length === 0) return;
		const all = steps.join(' → ');
		play(playable(all) ? all : steps[0]);
	}

	/** Citations in the text: this manual's pages, in this tab. */
	function cite(ref: string): CitationTarget | null {
		const [id, fact] = ref.split('#');
		const key = id.trim().toLowerCase();
		const title = data.titles[key];
		if (!title) return null;
		const href = `${resolve('/manual/[id]', { id: key })}${fact ? `#${fact}` : ''}`;
		return { title, href, external: false };
	}

	/** The section being read, which the page list marks. */
	let reading = $state<string | null>(null);

	/** Marks a section as the one being read while it crosses the top third of the window. */
	function spy(section: HTMLElement) {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) reading = section.id;
			},
			{ rootMargin: '0px 0px -66% 0px' }
		);
		observer.observe(section);
		return () => observer.disconnect();
	}

	const sections = $derived(unitSections(unit));
</script>

<svelte:head>
	<title>{data.title} · OP-XY manual</title>
	<meta name="description" content={unit.summary.replaceAll('`', '')} />
</svelte:head>

<div class="frame">
	<div class="page">
		<article class="doc">
			{#if data.area}
				<p class="crumb">
					<HugeIcon icon={AREA_ICONS[data.area.id as AreaId]} size="0.9375rem" />
					{areaName(data.area.id as AreaId, data.area.title)}
				</p>
			{/if}
			<header class="doc__head">
				<h1 class="doc__title">{data.title}</h1>
				<div class="doc__lead"><MessageText text={unit.summary} onkeys={play} {cite} /></div>
				{#if STATUS[unit.status]}
					<p class="notice">
						<HugeIcon icon={InformationCircleIcon} size="1rem" />
						{STATUS[unit.status]}
					</p>
				{/if}
			</header>

			{#if body.trim()}
				<div class="prose">
					<MessageText text={body} onkeys={play} {cite} />
				</div>
			{/if}

			{#if unit.procedures.length > 0}
				<section class="section" id="how-to" aria-labelledby="how-to-title" {@attach spy}>
					<h2 class="section__title" id="how-to-title">How to</h2>
					{#each unit.procedures as procedure (procedure.id)}
						<div class="proc" id={procedure.id}>
							<div class="proc__head">
								<h3 class="proc__goal">{procedure.goal}</h3>
								{#if procedure.steps.some((step) => playable(step.keys))}
									<button type="button" class="proc__play" onclick={() => playProcedure(procedure)}>
										<HugeIcon icon={PlayIcon} size="0.875rem" strokeWidth={2} />
										show on replica
									</button>
								{/if}
							</div>
							{#if procedure.preconditions.length > 0}
								<p class="proc__pre">
									<span class="proc__label">before you start</span>
									{procedure.preconditions.join(' · ')}
								</p>
							{/if}
							<ol class="proc__steps">
								{#each procedure.steps as step, i (i)}
									<li class="proc__step">
										<span class="proc__n">{i + 1}</span>
										<span class="proc__keys">
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
										</span>
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
				<section class="section" id="details" aria-labelledby="details-title" {@attach spy}>
					<h2 class="section__title" id="details-title">Details</h2>
					<!-- sources are external: TE's pages and the repository on GitHub -->
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<ul class="facts">
						{#each unit.facts as fact (fact.id)}
							{@const from = provenance(fact.confidence, fact.source)}
							<li class="fact" id={fact.id}>
								<div class="fact__text"><MessageText text={fact.text} onkeys={play} {cite} /></div>
								<a
									class="badge"
									href={sourceHref(fact.source)}
									target="_blank"
									rel="noopener noreferrer"
								>
									<HugeIcon icon={from.icon} size="0.8125rem" strokeWidth={1.8} />
									{from.text}{fact.verified_on ? ` · ${fact.verified_on}` : ''}
								</a>
							</li>
						{/each}
					</ul>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</section>
			{/if}

			{#if unit.parameters.length > 0}
				<section class="section" id="parameters" aria-labelledby="parameters-title" {@attach spy}>
					<h2 class="section__title" id="parameters-title">Parameters</h2>
					<div class="table">
						<table>
							<thead>
								<tr>
									<th>parameter</th>
									<th>gesture</th>
									<th>range</th>
									<th>cc</th>
								</tr>
							</thead>
							<tbody>
								{#each unit.parameters as param, i (i)}
									<tr>
										<td>
											<span class="param__name">{param.name}</span>
											<span class="param__page">{param.screen}</span>
										</td>
										<td><Kbd combo={comboForDisplay(param.keys)} size="sm" /></td>
										<td class="param__range">
											{param.range ?? '–'}{param.default ? ` · ${param.default}` : ''}
										</td>
										<td class="param__cc">{param.cc ?? '–'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			{/if}

			{#if unit.related.length > 0}
				<section class="section" id="related" aria-labelledby="related-title" {@attach spy}>
					<h2 class="section__title" id="related-title">Related</h2>
					<div class="related">
						{#each unit.related as id (id)}
							{#if data.titles[id]}
								<a class="related__item" href={resolve('/manual/[id]', { id })}>
									{data.titles[id]}
									<HugeIcon icon={ArrowRight01Icon} size="0.875rem" />
								</a>
							{/if}
						{/each}
					</div>
				</section>
			{/if}

			<nav class="pager" aria-label="more in this area">
				{#if data.prev}
					<a class="pager__link" href={resolve('/manual/[id]', { id: data.prev.id })}>
						<span class="pager__dir"
							><HugeIcon icon={ArrowLeft01Icon} size="0.875rem" /> previous</span
						>
						<span class="pager__title">{data.prev.title}</span>
					</a>
				{:else}<span></span>{/if}
				{#if data.next}
					<a
						class="pager__link pager__link--next"
						href={resolve('/manual/[id]', { id: data.next.id })}
					>
						<span class="pager__dir">next <HugeIcon icon={ArrowRight01Icon} size="0.875rem" /></span
						>
						<span class="pager__title">{data.next.title}</span>
					</a>
				{/if}
			</nav>

			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<p class="colophon">
				Our wording, for OS {data.firmware}.
				{#if unit.official_url}
					<a href={unit.official_url} target="_blank" rel="noopener noreferrer">
						TE’s page <HugeIcon icon={LinkSquare02Icon} size="0.75rem" />
					</a>
				{/if}
				<a href={sourceHref(unit.path)} target="_blank" rel="noopener noreferrer">
					<HugeIcon icon={GithubIcon} size="0.75rem" /> source
				</a>
			</p>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</article>

		<aside class="rail" aria-label="replica">
			<div class="rail__sticky">
				<div class="rail__replica"><Replica {replica} /></div>
				<p class="rail__hint">
					Press <em>show on replica</em>, or any keys in the text, to watch them here.
				</p>
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
	</div>
</div>

<style>
	/* the page's width, which the layout below answers to (not the window's: the sidebar takes some) */
	.frame {
		container-type: inline-size;
	}

	.page {
		display: grid;
		grid-template-columns: minmax(0, 44rem) minmax(20rem, 26rem);
		gap: 3.5rem;
		padding: 2.5rem 2.5rem 5rem;
	}

	.doc {
		display: flex;
		flex-direction: column;
		gap: 2.25rem;
		min-width: 0;
	}

	.crumb {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 -1.25rem;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		letter-spacing: var(--xy-tracking-label);
	}

	.doc__head {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.doc__title {
		margin: 0;
		font-size: clamp(1.75rem, 3vw, 2.25rem);
		font-weight: var(--xy-weight-light);
		line-height: 1.15;
		letter-spacing: -0.01em;
	}

	.doc__lead {
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-base);
		line-height: 1.65;
	}

	/* the lead keeps its own size and colour; the renderer only draws its keys */
	.doc__lead :global(.md) {
		color: inherit;
		font-size: inherit;
		line-height: inherit;
	}

	.doc__lead :global(.md p) {
		margin: 0;
	}

	.notice {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin: 0;
		padding: 0.625rem 0.875rem;
		border-radius: 0.625rem;
		background-color: var(--xy-surface);
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.notice :global(.hugeicon) {
		margin-top: 0.0625rem;
	}

	.prose {
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		line-height: 1.7;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		scroll-margin-top: 1.5rem;
	}

	.section__title {
		margin: 0;
		padding-bottom: 0.625rem;
		border-bottom: 1px solid var(--xy-line);
		font-size: var(--xy-text-lg);
		font-weight: var(--xy-weight-regular);
		line-height: var(--xy-leading-lg);
	}

	.proc {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.125rem 1.25rem 1.25rem;
		border: 1px solid var(--xy-line);
		border-radius: 0.875rem;
		scroll-margin-top: 1.5rem;
	}

	.proc__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.proc__goal {
		margin: 0;
		font-size: var(--xy-text-sm);
		font-weight: var(--xy-weight-medium, 500);
	}

	.proc__play {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.375rem;
		padding: 0.3125rem 0.75rem 0.3125rem 0.625rem;
		border: 1px solid var(--xy-line-control);
		border-radius: 999px;
		background: none;
		color: var(--xy-fg-muted);
		font: inherit;
		font-size: var(--xy-text-xs);
		cursor: pointer;
		transition:
			color var(--xy-dur-quick, 120ms) ease,
			border-color var(--xy-dur-quick, 120ms) ease;
	}

	.proc__play:hover {
		border-color: var(--xy-fg-subtle);
		color: var(--xy-fg);
	}

	.proc__pre {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.625rem;
		margin: -0.25rem 0 0.125rem;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.proc__label {
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-2xs);
		letter-spacing: var(--xy-tracking-label);
	}

	.proc__steps {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.proc__step {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem 0.75rem;
	}

	.proc__n {
		display: inline-grid;
		flex: none;
		place-items: center;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 50%;
		background-color: var(--xy-surface-raised);
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		font-variant-numeric: tabular-nums;
	}

	.proc__keys {
		display: inline-flex;
	}

	.proc__note {
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.proc__result {
		margin: 0.25rem 0 0;
		padding-top: 0.75rem;
		border-top: 1px dashed var(--xy-line);
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
	}

	.keys {
		display: inline-flex;
		padding: 0.125rem;
		border: 0;
		border-radius: 0.375rem;
		background: none;
		color: inherit;
		cursor: pointer;
	}

	.keys:hover {
		background-color: var(--xy-hover);
	}

	.facts {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.fact {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.875rem 0;
		border-bottom: 1px solid var(--xy-line);
		scroll-margin-top: 1.5rem;
	}

	.fact:last-child {
		border-bottom: 0;
	}

	.fact:target .fact__text {
		color: var(--xy-fg);
	}

	.fact__text {
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		line-height: 1.65;
	}

	.fact__text :global(.md p) {
		margin: 0;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		align-self: flex-start;
		gap: 0.3125rem;
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-2xs);
		letter-spacing: var(--xy-tracking-label);
		text-decoration: none;
	}

	.badge:hover {
		color: var(--xy-fg-muted);
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
		padding: 0 0.75rem 0.5rem 0;
		color: var(--xy-fg-faint);
		font-weight: var(--xy-weight-regular);
		letter-spacing: var(--xy-tracking-label);
		text-align: left;
	}

	td {
		padding: 0.625rem 0.75rem 0.625rem 0;
		border-top: 1px solid var(--xy-line);
		vertical-align: middle;
	}

	.param__name {
		display: block;
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
	}

	.param__page {
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-2xs);
	}

	.param__range {
		color: var(--xy-fg-muted);
	}

	.param__cc {
		color: var(--xy-fg-subtle);
		font-variant-numeric: tabular-nums;
	}

	.related {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.related__item {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.4375rem 0.75rem;
		border: 1px solid var(--xy-line);
		border-radius: 999px;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-xs);
		text-decoration: none;
		transition:
			color var(--xy-dur-quick, 120ms) ease,
			border-color var(--xy-dur-quick, 120ms) ease;
	}

	.related__item:hover {
		border-color: var(--xy-line-control);
		color: var(--xy-fg);
	}

	.pager {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		padding-top: 0.5rem;
	}

	.pager__link {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.875rem 1rem;
		border: 1px solid var(--xy-line);
		border-radius: 0.75rem;
		color: var(--xy-fg);
		text-decoration: none;
		transition: border-color var(--xy-dur-quick, 120ms) ease;
	}

	.pager__link:hover {
		border-color: var(--xy-line-control);
	}

	.pager__link--next {
		align-items: flex-end;
		text-align: right;
	}

	.pager__dir {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-2xs);
		letter-spacing: var(--xy-tracking-label);
	}

	.pager__title {
		font-size: var(--xy-text-sm);
	}

	.colophon {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		margin: 0;
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-2xs);
	}

	.colophon a {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--xy-fg-subtle);
		text-decoration: none;
	}

	.colophon a:hover {
		color: var(--xy-fg);
	}

	.rail__sticky {
		position: sticky;
		top: calc(var(--xy-header-h) + 1.5rem);
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.rail__hint {
		margin: 0;
		color: var(--xy-fg-faint);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
	}

	.rail__hint em {
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

	/* narrower: the replica above the text, the page list dropped */
	@container (max-width: 64rem) {
		.page {
			grid-template-columns: minmax(0, 44rem);
			gap: 2rem;
		}

		.rail {
			order: -1;
			max-width: 34rem;
		}

		.rail__sticky {
			position: static;
		}

		.toc {
			display: none;
		}
	}

	@media (max-width: 40rem) {
		.page {
			padding: 1.5rem 1rem 4rem;
		}
	}
</style>
