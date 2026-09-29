<!--
@component
The voice key, beside the composer's send key. Hold it to talk, the way the device's keys are held
while you play; let go and the voice answers. Its LED says what voice is doing: red while the mic
is live, breathing white while it connects or thinks, white while it speaks, dim while it waits.
Hands-free, a press mutes or opens the mic instead. The first press starts the call.

Keyboard: hold space or enter on the key, or hold the ` key anywhere you are not typing.
-->
<script lang="ts">
	import { Mic01Icon } from '@hugeicons/core-free-icons';
	import HugeIcon from '$lib/ui/HugeIcon.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import { tooltip } from '$lib/ui/tooltip';
	import type { KeySize, LedState } from '$lib/ui/types';
	import type { VoiceSession } from '../session.svelte';

	interface Props {
		voice: VoiceSession;
		disabled?: boolean;
		/** Tile size, as `IconButton`'s. */
		size?: KeySize;
		/**
		 * `key`: an OP-XY key with its LED; `round`: a plain round icon button for a chat composer,
		 * its state shown by the icon's colour (red while the mic is live).
		 */
		variant?: 'key' | 'round';
	}

	let { voice, disabled = false, size = 'sm', variant = 'key' }: Props = $props();

	const handsFree = $derived(voice.mode === 'hands-free');
	const micLive = $derived(
		voice.phase === 'user-speaking' || (handsFree && voice.phase === 'listening' && !voice.muted)
	);
	const led: LedState = $derived(
		micLive
			? 'red'
			: voice.phase === 'connecting' || voice.phase === 'thinking' || voice.phase === 'speaking'
				? 'white'
				: voice.phase === 'listening'
					? 'dim'
					: 'off'
	);
	const blink = $derived(
		voice.phase === 'connecting' || voice.phase === 'thinking' ? ('breathe' as const) : false
	);
	const label = $derived(
		!handsFree
			? 'hold to talk'
			: !voice.active
				? 'start hands-free voice'
				: voice.muted
					? 'open the mic'
					: 'mute the mic'
	);
	const tip = $derived(handsFree ? label : 'hold to talk (or hold the ` key)');

	/** Hands-free: the press that started the call must not also mute it (its click comes after). */
	let starting = false;

	function typingIn(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return (
			target.isContentEditable ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement ||
			(target instanceof HTMLInputElement && !['button', 'checkbox', 'radio'].includes(target.type))
		);
	}

	function onPointerDown(event: PointerEvent & { currentTarget: HTMLButtonElement }): void {
		if (event.button !== 0 || disabled) return;
		try {
			// Keep the hold when the pointer slides off the key.
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			// Not capturable: the hold ends at the key's edge.
		}
		starting = handsFree && !voice.active;
		if (!handsFree || !voice.active) voice.press();
	}

	function onClick(): void {
		if (starting) {
			starting = false;
			return;
		}
		if (handsFree && voice.active) voice.toggleMute();
	}

	function onKeyDown(event: KeyboardEvent): void {
		if ((event.key !== ' ' && event.key !== 'Enter') || disabled) return;
		// Hands-free with a call on: the key's own click toggles the mic.
		if (handsFree && voice.active) return;
		event.preventDefault();
		if (!event.repeat) voice.press();
	}

	function onKeyUp(event: KeyboardEvent): void {
		if (event.key !== ' ' && event.key !== 'Enter') return;
		if (!handsFree) event.preventDefault();
		voice.release();
	}

	function onWindowKeyDown(event: KeyboardEvent): void {
		if (event.code !== 'Backquote' || event.repeat || disabled || typingIn(event.target)) return;
		event.preventDefault();
		if (handsFree && voice.active) voice.toggleMute();
		else voice.press();
	}

	function onWindowKeyUp(event: KeyboardEvent): void {
		if (event.code === 'Backquote') voice.release();
	}
</script>

<svelte:window onkeydown={onWindowKeyDown} onkeyup={onWindowKeyUp} onblur={() => voice.release()} />

{#if variant === 'round'}
	<button
		type="button"
		class="voice-key voice-round"
		data-led={led}
		aria-label={label}
		aria-pressed={handsFree ? voice.active && !voice.muted : voice.keyDown}
		aria-keyshortcuts="`"
		{disabled}
		onpointerdown={onPointerDown}
		onpointerup={() => voice.release()}
		onpointercancel={() => voice.release()}
		onlostpointercapture={() => voice.release()}
		onclick={onClick}
		onkeydown={onKeyDown}
		onkeyup={onKeyUp}
		oncontextmenu={(event) => event.preventDefault()}
		{@attach tooltip(tip, { describe: false })}
	>
		<HugeIcon icon={Mic01Icon} size="1.125rem" strokeWidth={1.7} />
	</button>
{:else}
	<IconButton
		{label}
		icon="mic"
		{size}
		{led}
		ledBlink={blink}
		pressed={handsFree ? voice.active && !voice.muted : voice.keyDown}
		{disabled}
		showTooltip={false}
		aria-keyshortcuts="`"
		class="voice-key"
		onpointerdown={onPointerDown}
		onpointerup={() => voice.release()}
		onpointercancel={() => voice.release()}
		onlostpointercapture={() => voice.release()}
		onclick={onClick}
		onkeydown={onKeyDown}
		onkeyup={onKeyUp}
		oncontextmenu={(event) => event.preventDefault()}
		{@attach tooltip(tip, { describe: false })}
	/>
{/if}

<style>
	/* A long press on a touch screen must hold the key, not select text or open a menu. */
	:global(.voice-key) {
		-webkit-touch-callout: none;
	}

	.voice-round {
		display: inline-grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--xy-fg-subtle);
		cursor: pointer;
		transition:
			color var(--xy-dur-quick, 120ms) ease,
			background-color var(--xy-dur-quick, 120ms) ease;
	}

	.voice-round:hover:not(:disabled) {
		background-color: var(--xy-hover);
		color: var(--xy-fg);
	}

	.voice-round[data-led='white'],
	.voice-round[data-led='dim'] {
		color: var(--xy-fg);
	}

	.voice-round[data-led='red'] {
		color: var(--xy-red, #ff4d00);
	}

	.voice-round:focus-visible {
		outline: 1.5px solid var(--xy-focus);
		outline-offset: 1px;
	}

	.voice-round:disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}
</style>
