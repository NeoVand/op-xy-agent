/**
 * Which replica controls have a working remote path to an OP-XY on OS 1.1.33, and what that path
 * is. Everything here was verified on the owner's unit (docs/research/90-device-probe.md, session 1)
 * except pitch bend, which the device is known to receive (community-verified, see
 * `knowledge/midi/cc-map.json` → channelVoice) but which nobody has tried from this app yet.
 *
 * | replica control         | MIDI                                                      |
 * | ----------------------- | --------------------------------------------------------- |
 * | keyboard keys (24)      | note on / off, notes 53–76, on the active-track channel   |
 * | play                    | `FA` start (again while playing: restart)                 |
 * | stop                    | `FC` stop                                                 |
 * | track 1–8               | CC102 on channel 1, value = track − 1 (track select)      |
 * | pitch-bend pad          | pitch bend on the active-track channel, centre on release |
 * | everything else         | nothing: remote keys (CC106/107) do nothing on 1.1.33     |
 *
 * Pure data over `core/opxy`; the bridge (`bridge.svelte.ts`) turns routes into messages.
 */
import {
	getControl,
	isControlId,
	type ControlId,
	type KeyboardKeyId,
	type TrackKeyNumber
} from '$lib/core/opxy';

/** How a control reaches the device, when it can. */
export type RemoteRoute =
	/** A keyboard key plays `note` (at the replica's fixed octave, 53–76). */
	| { readonly kind: 'note'; readonly note: number }
	/** play: MIDI Start (`FA`). */
	| { readonly kind: 'start' }
	/** stop: MIDI Stop (`FC`). */
	| { readonly kind: 'stop' }
	/** A track key selects instrument track `track` with CC102 (zero-based value). */
	| { readonly kind: 'track'; readonly track: TrackKeyNumber }
	/** The pitch-bend pad sends pitch bend. */
	| { readonly kind: 'bend' };

/** Track select: CC102 on channel 1, value 0–15 = track 1–16 (verified on OS 1.1.33). */
export const TRACK_SELECT_CC = 102;

/**
 * The remote route of a control, or null when OS 1.1.33 offers none (function keys other than
 * play and stop, steps, encoders, the volume knob, and everything that is not an input).
 */
export function remoteRoute(id: ControlId): RemoteRoute | null {
	if (!isControlId(id)) return null;
	if (id === 'key.play') return { kind: 'start' };
	if (id === 'key.stop') return { kind: 'stop' };
	if (id === 'strip.pitchbend') return { kind: 'bend' };
	const control = getControl(id);
	if (control.keyboard) return { kind: 'note', note: control.keyboard.note };
	if (control.track) return { kind: 'track', track: control.track.instrument as TrackKeyNumber };
	return null;
}

/** True when the control has a working remote path on OS 1.1.33. */
export function isRemoteControl(id: ControlId): boolean {
	return remoteRoute(id) !== null;
}

/** True for the 24 keyboard keys. */
export function isKeyboardKey(id: ControlId): id is KeyboardKeyId {
	return id.startsWith('keyboard.');
}
