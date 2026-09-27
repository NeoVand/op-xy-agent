<!--
@component
A file given to the agent. Above the composer: a compact tile while the file is read (a breathing
light), ready to go, or refused (a red light; pointing at it or focusing it tells why), each with a
key to remove it. In a sent message: what went with it, pictures as a thumbnail.
-->
<script lang="ts">
	import Icon from '$lib/ui/Icon.svelte';
	import Led from '$lib/ui/Led.svelte';
	import { tooltip } from '$lib/ui/tooltip';
	import type { AttachmentKind } from '../attachments';

	interface Props {
		name: string;
		kind: AttachmentKind | null;
		/** One line under the name ("1500 × 2000", "12 pages"). */
		detail?: string;
		/** Small data URL of an image. */
		thumb?: string;
		/** `reading` while the file is prepared, `error` when it cannot go. */
		status?: 'reading' | 'ready' | 'error';
		/** Why it cannot go (shown on the red light). */
		error?: string | null;
		/** Shows a remove key. */
		onremove?: () => void;
		/** `message`: as sent, with a bigger picture. */
		variant?: 'composer' | 'message';
	}

	let {
		name,
		kind,
		detail,
		thumb,
		status = 'ready',
		error = null,
		onremove,
		variant = 'composer'
	}: Props = $props();

	const TAGS: Record<AttachmentKind, string> = {
		image: 'img',
		pdf: 'pdf',
		midi: 'midi',
		text: 'txt'
	};

	const picture = $derived(Boolean(thumb) && variant === 'message');
</script>

<div class={['file', `file--${variant}`, `file--${status}`, picture && 'file--picture']}>
	{#if thumb}
		<img class="file__thumb" src={thumb} alt="" />
	{:else}
		<span class="file__tag" aria-hidden="true">{kind ? TAGS[kind] : '···'}</span>
	{/if}
	<span class="file__text">
		<span class="file__name" title={name}>{name}</span>
		{#if status === 'reading'}
			<span class="file__detail"><Led state="white" blink="breathe" size="sm" /> reading</span>
		{:else if status === 'ready' && detail}
			<span class="file__detail">{detail}</span>
		{/if}
	</span>
	{#if status === 'error'}
		<button
			type="button"
			class="file__flag"
			aria-label="can't send {name}: {error ?? 'unreadable'}"
			{@attach tooltip(error, { describe: false, delay: 100 })}
		>
			<Led state="red" size="sm" />
		</button>
	{/if}
	{#if onremove}
		<button type="button" class="file__remove" aria-label="remove {name}" onclick={onremove}>
			<Icon name="close" />
		</button>
	{/if}
</div>

<style>
	.file {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		max-width: 100%;
		height: 2.75rem;
		padding: 0.25rem;
		border-radius: var(--xy-radius-card);
		background-color: var(--xy-surface);
		box-shadow: 0 0 0 1px var(--xy-line);
	}

	.file--composer {
		width: 100%;
	}

	.file--message {
		height: auto;
		max-width: 16rem;
	}

	.file__thumb,
	.file__tag {
		flex: none;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: calc(var(--xy-radius-card) - 2px);
	}

	.file__thumb {
		object-fit: cover;
		background-color: #fff;
	}

	.file__tag {
		display: grid;
		place-items: center;
		background-color: var(--xy-surface-sunken);
		color: var(--xy-fg-muted);
		font-size: var(--xy-text-2xs);
		line-height: 1;
		font-weight: 500;
		letter-spacing: var(--xy-tracking-label);
	}

	.file--error .file__tag,
	.file--error .file__thumb {
		opacity: 0.5;
	}

	.file__text {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}

	.file__name {
		overflow: hidden;
		color: var(--xy-fg);
		font-size: var(--xy-text-xs);
		line-height: var(--xy-leading-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file--error .file__name {
		color: var(--xy-fg-muted);
	}

	.file__detail {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		overflow: hidden;
		color: var(--xy-fg-subtle);
		font-size: var(--xy-text-2xs);
		line-height: var(--xy-leading-2xs);
		font-weight: 450;
		letter-spacing: var(--xy-tracking-label);
		font-variant-numeric: tabular-nums;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file__flag,
	.file__remove {
		display: grid;
		flex: none;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		border: 0;
		border-radius: var(--xy-radius-card);
		background: none;
		color: var(--xy-fg-subtle);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.file__flag {
		cursor: help;
	}

	.file__flag:hover,
	.file__flag:focus-visible,
	.file__remove:hover,
	.file__remove:focus-visible {
		background-color: var(--xy-hover);
		color: var(--xy-fg);
	}

	/* A picture as sent: the image itself, its name under it. */
	.file--picture {
		flex-direction: column;
		align-items: flex-start;
		gap: 0.375rem;
	}

	.file--picture .file__thumb {
		width: auto;
		max-width: 12rem;
		height: 6rem;
		object-fit: contain;
	}

	.file--picture .file__text {
		max-width: 12rem;
		padding: 0 0.25rem 0.125rem;
	}
</style>
