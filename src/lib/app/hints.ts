/**
 * What the bridge tells people when the replica cannot do something on the real OP-XY: a control
 * with no remote path on the firmware (remote keys do nothing on OS 1.1.33), a combo the device
 * could not recognise remotely, a press while nothing is connected, or a message the transport
 * refused. Pure text builders. The descriptions are ours, written from TE's guide (which the hint
 * links to) and `knowledge/`; nothing is quoted from the guide.
 */
import { getControl, guideUrl, REFERENCE_FIRMWARE, type ControlId } from '$lib/core/opxy';
import { remoteKeyCapability } from '$lib/device/profile';
import type { RemoteRoute } from './mapping';

/** Why a hint was shown. */
export type HintKind =
	/** The control has no remote path, so nothing was sent. */
	| 'not-remote'
	/** A remote control pressed while other keys are held: a combo the device can't take remotely. */
	| 'combo'
	/** No device is connected: the replica is a simulation. */
	| 'offline'
	/** The transport refused or could not send the message. */
	| 'send-failed';

/** What was done to the control. */
export type HintAction = 'press' | 'turn' | 'click' | 'bend';

/** One hint for the UI (and for the agent, which may listen too). */
export interface BridgeHint {
	readonly kind: HintKind;
	/** The control that was operated. */
	readonly control: ControlId;
	readonly action: HintAction;
	/** The keys involved in key-combo notation (`M1`, `shift + play`), for drawing; null for knobs. */
	readonly keys: string | null;
	/** What happened, one sentence: `The M1 key can't be pressed remotely on OS 1.1.33.` */
	readonly title: string;
	/** What to know or do about it, one sentence, or null. */
	readonly detail: string | null;
	/** `title` and `detail` together, for screen readers, logs and the agent. */
	readonly text: string;
	/** TE's guide section about the control, or null. */
	readonly guide: string | null;
	/** The firmware the text speaks about: the connected unit's, else the reference (1.1.33). */
	readonly firmware: string;
	/** Hints with the same key say the same thing (used for rate limiting). */
	readonly key: string;
}

/** What each function key does on the device, completing "on the device it …". */
const KEY_PURPOSE: Partial<Record<ControlId, string>> = {
	'key.project': 'opens your projects, to view, edit or start one',
	'key.tempo': 'sets the tempo, swing and metronome (and taps the tempo when pressed in time)',
	'key.sample': 'opens the sampler, to record new sounds',
	'key.com': 'opens system settings, connections and outputs',
	'key.instrument': 'switches the track keys to the eight instrument tracks',
	'key.auxiliary': 'switches the track keys to the eight auxiliary tracks',
	'key.arrange': 'opens the arranger, where scenes are chained into a song',
	'key.mix': 'opens the mixer: levels, panning, the main EQ and the compressor',
	'key.m1': 'opens module 1 of the current mode (the engine, on an instrument track)',
	'key.m2': 'opens module 2 of the current mode (the envelopes, on an instrument track)',
	'key.m3': 'opens module 3 of the current mode (the filter, on an instrument track)',
	'key.m4': 'opens module 4 of the current mode (the LFO, on an instrument track)',
	'key.player': 'opens the players, which turn your notes into arpeggios, chords and more',
	'key.bar': 'sets how many bars the sequence has, and its quantisation',
	'key.record': 'records notes and parameter moves into the sequence',
	'key.play': 'starts playback, or restarts it from the top while playing',
	'key.stop': 'stops playback, and silences every note when pressed again',
	'key.minus': 'shifts the keyboard down an octave',
	'key.plus': 'shifts the keyboard up an octave',
	'key.shift': 'opens second functions and sub-pages together with other keys'
};

/** What a control does on the device for an action, completing "on the device it …". */
export function controlPurpose(id: ControlId, action: HintAction = 'press'): string | null {
	const control = getControl(id);
	if (control.kind === 'encoder') {
		return action === 'turn'
			? 'changes the parameter shown in its colour on the screen'
			: 'does something that depends on the page you are on';
	}
	if (control.group === 'step') return 'adds the last played note to that step, or edits it';
	if (control.keyboard) return 'plays a note on the selected track';
	if (control.track) return 'selects that track';
	if (id === 'strip.pitchbend') return 'bends the notes of the selected track';
	return KEY_PURPOSE[id] ?? null;
}

/** How a sentence names a control: `the M1 key`, `step 5`, `the dark gray encoder`. */
export function controlSubject(id: ControlId): string {
	const control = getControl(id);
	if (id === 'knob.volume') return 'the volume knob';
	if (id === 'strip.pitchbend') return 'the pitch-bend pad';
	if (control.kind === 'encoder') return `the ${control.label}`;
	if (control.group === 'step') return control.label;
	return `the ${controlName(id)} key`;
}

/** A control's short name: `shift`, `M1`, `track 3`, `step 5`, `C4`, `dark gray encoder`. */
export function controlName(id: ControlId): string {
	const control = getControl(id);
	if (control.keyboard) return control.keyboard.name;
	if (control.track) return `track ${control.track.instrument}`;
	if (control.kind === 'key' && control.group !== 'step' && control.token !== null) {
		// The grammar spells minus and plus as [-] and [+]; people say the words.
		return /^\[.\]$/.test(control.token) ? control.label : control.token;
	}
	return control.label;
}

/** A control in key-combo notation for drawing (`M1`, `T3`, `C4`, `encoder 2`); null for knobs. */
export function comboName(id: ControlId): string | null {
	const control = getControl(id);
	if (control.track) return `T${control.track.instrument}`;
	if (control.kind === 'encoder') return `encoder ${control.index ?? 1}`;
	if (control.kind !== 'key') return null;
	return controlName(id);
}

/** Capitalises the first letter (sentence case for sentences that start with a name). */
function sentence(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `a`, `a and b`, `a, b and c`. */
function listOf(items: readonly string[]): string {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The firmware to speak about, and whether remote key presses are known not to work there. */
function firmwareFacts(osVersion: string | null): { firmware: string; verified: boolean } {
	const firmware = osVersion ?? REFERENCE_FIRMWARE;
	return { firmware, verified: remoteKeyCapability(firmware).status === 'unsupported' };
}

/** A hint's words: a title sentence, an optional detail sentence, and both together. */
function words(
	title: string,
	detail: string | null
): Pick<BridgeHint, 'title' | 'detail' | 'text'> {
	return { title, detail, text: detail === null ? title : `${title} ${detail}` };
}

const VERB: Record<HintAction, string> = {
	press: 'pressed',
	turn: 'turned',
	click: 'clicked',
	bend: 'used'
};

/**
 * A control that has no remote path (or that this action cannot reach): nothing was sent.
 * @param osVersion the connected unit's firmware, or null for the reference firmware
 */
export function notRemoteHint(
	id: ControlId,
	action: HintAction,
	osVersion: string | null
): BridgeHint {
	const control = getControl(id);
	const { firmware, verified } = firmwareFacts(osVersion);
	let text: Pick<BridgeHint, 'title' | 'detail' | 'text'>;
	if (id === 'knob.volume') {
		text = words(
			'The volume knob only works on the device itself.',
			'It sets the output level and sends no MIDI.'
		);
	} else {
		const subject = sentence(controlSubject(id));
		const verb = VERB[action];
		// No firmware can turn an encoder remotely; key presses depend on the firmware.
		const title =
			action === 'turn' || action === 'bend'
				? `${subject} can't be ${verb} remotely.`
				: verified
					? `${subject} can't be ${verb} remotely on OS ${firmware}.`
					: `${subject} isn't ${verb} from here: remote key presses are unverified on OS ${firmware}.`;
		const purpose = controlPurpose(id, action);
		text = words(title, purpose ? `On the device it ${purpose}.` : null);
	}
	return {
		kind: 'not-remote',
		control: id,
		action,
		keys: comboName(id),
		...text,
		guide: guideUrl(control),
		firmware,
		key: `not-remote:${id}:${action}`
	};
}

/** What a remote control does when pressed on its own, completing "let go … to …". */
function plainAction(id: ControlId, route: RemoteRoute): string {
	switch (route.kind) {
		case 'note':
			return 'play notes';
		case 'start':
			return 'start playback';
		case 'stop':
			return 'stop playback';
		case 'track':
			return `select ${controlName(id)}`;
		case 'bend':
			return 'bend';
	}
}

/**
 * A remote control pressed while `held` keys are down: on the device that is a different gesture
 * (shift + play queues a scene, step + key writes a note, track + track links tracks), which the
 * device cannot receive remotely, so nothing was sent.
 */
export function comboHint(
	held: readonly ControlId[],
	id: ControlId,
	route: RemoteRoute,
	osVersion: string | null
): BridgeHint {
	const { firmware } = firmwareFacts(osVersion);
	const names = listOf(held.map(controlName));
	const pronoun = held.length === 1 ? 'it' : 'them';
	const keys = [...held, id]
		.map(comboName)
		.filter((name): name is string => name !== null)
		.join(' + ');
	const links = route.kind === 'track' && held.some((h) => getControl(h).track !== undefined);
	const text = links
		? words(
				`Holding ${names} while pressing ${controlName(id)} links tracks on the device, which can't be done remotely.`,
				`Let go of ${pronoun} to ${plainAction(id, route)}.`
			)
		: words(
				`${sentence(keys)} can't be sent remotely on OS ${firmware}.`,
				`Let go of ${names} to ${plainAction(id, route)}.`
			);
	return {
		kind: 'combo',
		control: id,
		action: route.kind === 'bend' ? 'bend' : 'press',
		keys,
		...text,
		guide: guideUrl(getControl(id)),
		firmware,
		key: `combo:${keys}`
	};
}

/** A remote control used while no device is connected: the replica is a local simulation. */
export function offlineHint(id: ControlId, action: HintAction = 'press'): BridgeHint {
	return {
		kind: 'offline',
		control: id,
		action,
		keys: comboName(id),
		...words(
			'Nothing was sent.',
			'The replica is a simulation until you connect your OP-XY: its keys move, but they play nothing.'
		),
		guide: null,
		firmware: REFERENCE_FIRMWARE,
		key: 'offline'
	};
}

/** The transport refused a message or could not send it (rate limit, port gone, …). */
export function sendFailedHint(
	id: ControlId,
	action: HintAction,
	error: Error,
	osVersion: string | null
): BridgeHint {
	const reason = error.message.replace(/[.\s]+$/, '');
	return {
		kind: 'send-failed',
		control: id,
		action,
		keys: comboName(id),
		...words(`${sentence(controlSubject(id))} didn't reach the OP-XY.`, `${sentence(reason)}.`),
		guide: null,
		firmware: osVersion ?? REFERENCE_FIRMWARE,
		key: `send-failed:${error.name}`
	};
}
