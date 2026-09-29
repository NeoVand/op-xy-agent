<!--
Which key is which: every key the manual and the agent name (`M3`, `T5`, `accidental 1`), drawn as
the OP-XY draws it — digits and pictures, never those names — with the name we use and what the
device does not print. Pointing at a key rings it on the replica beside the page; pressing it plays
it there. The notation's rules follow, each drawn and written out.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { KeyboardIcon } from '@hugeicons/core-free-icons';
	import MessageText from '$lib/agent/ui/MessageText.svelte';
	import {
		comboIds,
		ControlGlyph,
		controlGlyph,
		getReplicaState,
		KeyCombo,
		replicaPointer
	} from '$lib/replica';
	import { HugeIcon } from '$lib/ui';
	import { tooltip } from '$lib/ui/tooltip';
	import ManualRail from '$lib/ui/manual/ManualRail.svelte';
	import { KEY_GROUPS, NOTATION, type KeyEntry } from '$lib/ui/manual/keys';

	const replica = getReplicaState();
	/** Rings on the replica the keys the reader points at. */
	const point = replicaPointer(replica);

	/** Plays a key or combo on the replica. */
	function play(keys: string): void {
		try {
			replica.animate(keys);
		} catch {
			// not something the replica can play: the picture stays a picture
		}
	}

	const sections = [
		...KEY_GROUPS.map((group) => ({ id: group.id, title: group.title })),
		{ id: 'notation', title: 'How combos are written' }
	];
	const notationHref = resolve('/manual/[id]', { id: 'basics.key-notation' });

	/** The section being read, which the page list marks. */
	let reading = $state<string | null>(null);

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
</script>

<svelte:head>
	<title>Which key is which · OP-XY manual</title>
	<meta
		name="description"
		content="Every OP-XY key as it looks on the device, with the name the manual gives it: M1–M4, T1–T8, the steps, naturals and accidentals, the encoders."
	/>
</svelte:head>

{#snippet key(entry: KeyEntry, bare = false)}
	{@const art = controlGlyph(entry.id)}
	<button
		type="button"
		class={['key', bare && 'key--bare']}
		aria-label="{entry.tip}: show it on the replica"
		onclick={() => play(entry.keys)}
		onpointerenter={() => point([entry.id])}
		onpointerleave={() => point(null)}
		onfocus={() => point([entry.id])}
		onblur={() => point(null)}
		{@attach tooltip(bare ? entry.tip : null, { describe: false, delay: 250 })}
	>
		{#if art}<ControlGlyph {art} name={entry.name} />{/if}
		{#if bare}
			{#if entry.place}<span class="key__note">{entry.note}</span>{/if}
		{:else}
			<span class="key__text">
				<span class="key__name">{entry.name}</span>
				<span class="key__note">{entry.note}</span>
			</span>
		{/if}
	</button>
{/snippet}

<div class="frame">
	<div class="page">
		<article class="doc">
			<p class="crumb">
				<HugeIcon icon={KeyboardIcon} size="0.9375rem" />
				the keys
			</p>
			<header class="doc__head">
				<h1 class="doc__title">Which key is which</h1>
				<p class="doc__lead">
					The manual and the agent call the keys by name — M3, T5, accidental 1 — but the OP-XY
					prints only digits and pictures. Here every key is drawn as it looks on the device, with
					the name we use. Point at one to find it on the replica; press it to watch it there.
				</p>
			</header>

			{#each KEY_GROUPS as group (group.id)}
				<section class="section" id={group.id} aria-labelledby="{group.id}-title" {@attach spy}>
					<h2 class="section__title" id="{group.id}-title">{group.title}</h2>
					<p class="section__about">
						<MessageText text={group.about} onkeys={play} onpoint={point} inline />
					</p>
					{#if group.id === 'keyboard'}
						<div class="board" role="group" aria-label="the keyboard, as the panel lays it out">
							<span class="board__label board__label--top">num row</span>
							<span class="board__label board__label--bottom">lower row</span>
							{#each group.keys as entry (entry.id)}
								<div
									class="board__key"
									style:grid-row={entry.place?.row}
									style:grid-column="{(entry.place?.half ?? 0) + 2} / span 2"
								>
									{@render key(entry, true)}
								</div>
							{/each}
						</div>
					{:else if group.layout === 'row'}
						<div class="row" role="group" aria-label={group.title}>
							{#each group.keys as entry (entry.id)}{@render key(entry, true)}{/each}
						</div>
					{:else}
						<div class="cards">
							{#each group.keys as entry (entry.id)}{@render key(entry)}{/each}
						</div>
					{/if}
				</section>
			{/each}

			<section class="section" id="notation" aria-labelledby="notation-title" {@attach spy}>
				<h2 class="section__title" id="notation-title">How combos are written</h2>
				<p class="section__about">
					Everywhere in the manual and the chat, keys pressed together are joined by a plus and keys
					pressed one after the other by an arrow. Press a combo to watch it on the replica.
				</p>
				<ul class="notation">
					{#each NOTATION as row (row.keys)}
						<li class="notation__row">
							<button
								type="button"
								class="notation__keys"
								aria-label="show {row.keys} on the replica"
								onclick={() => play(row.keys)}
								onfocus={() => point(comboIds(row.keys))}
								onblur={() => point(null)}
							>
								<KeyCombo keys={row.keys} onpoint={point} />
							</button>
							<code class="notation__code">{row.keys}</code>
							<span class="notation__means">
								<MessageText text={row.means} onkeys={play} onpoint={point} inline />
							</span>
						</li>
					{/each}
				</ul>
				<p class="section__about">
					The rules in full: <a href={notationHref}>how key presses are written</a>.
				</p>
			</section>
		</article>

		<ManualRail {replica} {sections} {reading}>
			{#snippet hint()}
				Point at a key to find it here; press it to watch it pressed.
			{/snippet}
		</ManualRail>
	</div>
</div>

<style>
	.frame {
		container-type: inline-size;
	}

	.page {
		display: grid;
		/* the rail (screen and replica) takes the larger share; the text keeps a reading width,
		   giving way down to 28rem before the replica does */
		grid-template-columns: minmax(28rem, 1fr) minmax(22rem, 1.15fr);
		gap: 3rem;
		padding: 2.5rem 2.5rem 5rem;
	}

	.doc {
		display: flex;
		flex-direction: column;
		gap: 2.25rem;
		min-width: 0;
		max-width: 40rem;
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
		margin: 0;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-base);
		line-height: 1.65;
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

	.section__about {
		margin: 0;
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-sm);
		line-height: 1.7;
	}

	.section__about a {
		color: var(--xy-fg);
		text-decoration: underline;
		text-decoration-color: var(--xy-line-strong, var(--xy-line));
		text-underline-offset: 0.2em;
	}

	/* a key: its picture, the name we use and what the device does not print */
	.key {
		--glyph-size: 2.6rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem 0.5rem 0.5rem;
		border: 1px solid var(--xy-line);
		border-radius: 0.75rem;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			background-color var(--xy-dur-quick, 120ms) ease,
			border-color var(--xy-dur-quick, 120ms) ease;
	}

	.key:hover,
	.key:focus-visible {
		border-color: var(--xy-line-control, var(--xy-line));
		background-color: var(--xy-hover);
	}

	.key:focus-visible {
		outline: 1px solid var(--xy-fg-subtle);
		outline-offset: 1px;
	}

	.key__text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.key__name {
		color: var(--xy-fg);
		font-size: var(--xy-text-sm);
		font-weight: 500;
		line-height: 1.3;
	}

	.key__note {
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-xs);
		line-height: 1.35;
	}

	/* the steps and the keyboard: just the keys, in their order on the panel */
	.key--bare {
		--glyph-size: 2.25rem;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.25rem;
		border-color: transparent;
		border-radius: 0.5rem;
	}

	.key--bare .key__note {
		font-size: var(--xy-text-2xs);
		line-height: 1;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr));
		gap: 0.5rem;
	}

	/* the sixteen steps in one row, as on the panel (two rows of eight on a phone) */
	.row {
		display: grid;
		grid-template-columns: repeat(16, minmax(0, 1fr));
		gap: 0.125rem;
	}

	.row .key--bare {
		--glyph-size: auto;
		padding: 0.125rem;
	}

	.row .key--bare :global(.glyph) {
		width: 100%;
		max-width: 2.5rem;
	}

	/* 14 naturals on 28 half-columns, the accidentals between them one row up, as on the panel */
	.board {
		display: grid;
		grid-template-columns: 4.5rem repeat(28, minmax(0, 1fr));
		grid-template-rows: auto auto;
		align-items: end;
		row-gap: 0.25rem;
		overflow-x: auto;
		padding-bottom: 0.25rem;
	}

	.board__label {
		grid-column: 1;
		align-self: center;
		color: var(--xy-fg-faint, var(--xy-fg-subtle));
		font-size: var(--xy-text-2xs);
		letter-spacing: var(--xy-tracking-label);
	}

	.board__label--top {
		grid-row: 1;
	}

	.board__label--bottom {
		grid-row: 2;
	}

	.board__key {
		display: flex;
		justify-content: center;
		min-width: 2.6rem;
	}

	.notation {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.notation__row {
		display: grid;
		grid-template-columns: 12rem 11rem minmax(0, 1fr);
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 0;
		border-bottom: 1px dashed var(--xy-line);
	}

	.notation__row:last-child {
		border-bottom: 0;
	}

	.notation__keys {
		justify-self: start;
		display: inline-flex;
		padding: 0.25rem;
		border: 0;
		border-radius: 0.375rem;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	.notation__keys:hover {
		background-color: var(--xy-hover);
	}

	.notation__keys :global(.combo) {
		margin-block: 0;
	}

	.notation__code {
		color: var(--xy-fg-muted);
		font-family: var(--xy-font-mono, ui-monospace, monospace);
		font-size: var(--xy-text-xs);
	}

	.notation__means {
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-sm);
		line-height: 1.6;
	}

	/* narrower than two columns fit (28 + 22 + gap + padding): one column, the rail above the text
	   (ManualRail) */
	@container (max-width: 58rem) {
		.page {
			grid-template-columns: minmax(0, 44rem);
			gap: 2rem;
		}
	}

	@media (max-width: 40rem) {
		.page {
			padding: 1.5rem 1rem 4rem;
		}

		.notation__row {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.375rem;
		}

		.row {
			grid-template-columns: repeat(8, minmax(0, 1fr));
		}
	}
</style>
