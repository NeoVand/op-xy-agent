<!--
@component
The voice key, beside the composer's send key. Hold it to talk, the way the device's keys are held
while you play; let go and the voice answers. Its LED says what voice is doing: red while the mic
is live, breathing white while it connects or thinks, white while it speaks, dim while it waits.
Hands-free, a press mutes or opens the mic instead. The first press starts the call.

Keyboard: hold space or enter on the key, or hold the ` key anywhere you are not typing.
-->
<script lang="ts">
	import IconButton from '$lib/ui/IconButton.svelte';
	import { tooltip } from '$lib/ui/tooltip';
	import type { LedState } from '$lib/ui/types';
	import type { VoiceSession } from '../session.svelte';

	interface Props {
		voice: VoiceSession;
		disabled?: boolean;
	}

	let { voice, disabled = false }: Props = $props();

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

<IconButton
	{label}
	icon="mic"
	size="sm"
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

<style>
	/* A long press on a touch screen must hold the key, not select text or open a menu. */
	:global(.voice-key) {
		-webkit-touch-callout: none;
	}
</style>
