/**
 * What the agent may know about the connected OP-XY right now, read from the device layer and
 * labelled honestly: values the device reported (play state, clock) versus the app's sent-state
 * cache (tempo, mutes, selected track it last sent). Rendered into a short "device note" that the
 * conductor adds to the conversation whenever it changes.
 */
import type { DeviceStack } from '$lib/device';

/** A plain-data snapshot of the device layer. */
export interface DeviceSnapshot {
	readonly connected: boolean;
	/** Session phase (`ready`, `idle`, `disconnected`, …) or `none` without a device layer. */
	readonly phase: string;
	readonly product: string | null;
	readonly firmware: string | null;
	/** Firmware relative to OS 1.1.33. */
	readonly firmwareRelation: 'reference' | 'older' | 'newer' | 'unknown';
	readonly firmwareWarnings: readonly string[];
	readonly playState: 'playing' | 'stopped' | 'unknown';
	/** Who reported the play state: the device itself, its echo of ours, or only the app. */
	readonly playSource: 'device' | 'echo' | 'app' | null;
	/** The device sends clock (COM → clock "both"), so play state and tempo can be followed. */
	readonly clockOut: boolean;
	/** Tempo measured from the device's clock. */
	readonly measuredBpm: number | null;
	/** Sent-state: the tempo this app last set. */
	readonly tempoSent: number | null;
	/** Sent-state: the track this app last selected (1–16). */
	readonly selectedTrack: number | null;
	/** Sent-state: mutes this app last set, by track number. */
	readonly mutes: Readonly<Record<number, boolean>>;
	readonly sysex: boolean;
}

/** Reads the device layer. Works without one (`connected: false`, phase `none`). */
export function deviceSnapshot(stack: DeviceStack | null): DeviceSnapshot {
	if (!stack) {
		return {
			connected: false,
			phase: 'none',
			product: null,
			firmware: null,
			firmwareRelation: 'unknown',
			firmwareWarnings: [],
			playState: 'unknown',
			playSource: null,
			clockOut: false,
			measuredBpm: null,
			tempoSent: null,
			selectedTrack: null,
			mutes: {},
			sysex: false
		};
	}
	const { session, mirror } = stack;
	const mutes: Record<number, boolean> = {};
	mirror.mutes.forEach((muted, index) => {
		if (muted !== null) mutes[index + 1] = muted;
	});
	return {
		connected: session.phase === 'ready',
		phase: session.phase,
		product: session.info?.product ?? null,
		firmware: session.firmware?.osVersion ?? null,
		firmwareRelation: session.firmware?.relation ?? 'unknown',
		firmwareWarnings: [...session.allWarnings],
		playState: mirror.playState,
		playSource: mirror.playSource,
		clockOut: mirror.clockOut,
		measuredBpm: mirror.measuredBpm,
		tempoSent: mirror.tempoSent,
		selectedTrack: mirror.selectedTrack,
		mutes,
		sysex: session.capabilities.sysex
	};
}

const SOURCE_TEXT = {
	device: 'reported by the device',
	echo: 'confirmed by the device',
	app: 'as last sent by this app, unconfirmed'
} as const;

/**
 * The device note: one short paragraph, worded so it only changes when something the agent should
 * know changes (the measured tempo is rounded to whole BPM).
 */
export function describeDevice(s: DeviceSnapshot): string {
	if (!s.connected) {
		const why = s.phase === 'disconnected' ? 'The OP-XY disconnected.' : 'No OP-XY is connected.';
		return `Device note from the app: ${why} Device tools will fail until the user connects it with the connect button on the device stage. Teaching and the replica still work.`;
	}
	const parts: string[] = [];
	const firmware = s.firmware
		? `OS ${s.firmware}${s.firmwareRelation === 'reference' ? ' (the reference firmware)' : s.firmwareRelation === 'unknown' ? '' : ` (${s.firmwareRelation} than the reference OS 1.1.33)`}`
		: 'firmware unknown';
	parts.push(`${s.product ?? 'OP-XY'} connected, ${firmware}.`);
	if (s.playState !== 'unknown' && s.playSource) {
		parts.push(`Transport ${s.playState} (${SOURCE_TEXT[s.playSource]}).`);
	} else {
		parts.push('Transport state unknown.');
	}
	parts.push(
		s.clockOut && s.measuredBpm !== null
			? `The device sends clock: ${Math.round(s.measuredBpm)} BPM measured.`
			: 'The device sends no clock (com → system settings → midi → clock is not "both"), so play state and tempo cannot be followed.'
	);
	const sent: string[] = [];
	if (s.tempoSent !== null) sent.push(`tempo ${s.tempoSent} BPM`);
	if (s.selectedTrack !== null) sent.push(`track ${s.selectedTrack} selected`);
	for (const [track, muted] of Object.entries(s.mutes)) {
		sent.push(`track ${track} ${muted ? 'muted' : 'unmuted'}`);
	}
	if (sent.length > 0)
		parts.push(`Last sent by this app (may have changed by hand since): ${sent.join(', ')}.`);
	if (s.firmwareWarnings.length > 0) parts.push(s.firmwareWarnings.join(' '));
	return `Device note from the app: ${parts.join(' ')}`;
}
