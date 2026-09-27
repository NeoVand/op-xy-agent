/**
 * Device tasks for the agent eval: each one is a request the user might make, run against the fake
 * OP-XY, and checked on what actually happened: the MIDI the device received, the tools the agent
 * called, the combos it showed on the replica and what it told the user. Facts behind the checks are
 * the verified OS 1.1.33 behaviour (docs/research/90-device-probe.md).
 */
import type { FakeDevice } from '../fake-device';

/** What a task can inspect after the agent finished. */
export interface TaskOutcome {
	/** Messages the device received during the task (after setup), as byte arrays. */
	readonly received: readonly number[][];
	/** Tool calls in order. */
	readonly tools: readonly {
		readonly name: string;
		readonly input: unknown;
		readonly status: string;
	}[];
	/** Combos animated on the replica. */
	readonly shown: readonly string[];
	/** The agent's final answer text. */
	readonly answer: string;
	readonly device: FakeDevice;
}

/** One named check. */
export interface Check {
	readonly name: string;
	readonly pass: boolean;
}

/** A device task. */
export interface DeviceTask {
	readonly id: string;
	readonly prompt: string;
	readonly clockMode?: 'in' | 'both';
	/** Puts the device in the state the task starts from (before the agent runs). */
	readonly setup?: (device: FakeDevice) => void | Promise<void>;
	readonly check: (outcome: TaskOutcome) => Check[];
}

// ─── helpers ────────────────────────────────────────────────────────────────────────────────────

const cc = (o: TaskOutcome, channel: number, controller: number, value?: number) =>
	o.received.some(
		(b) => b[0] === 0xb0 + channel && b[1] === controller && (value === undefined || b[2] === value)
	);
const status = (o: TaskOutcome, byte: number) =>
	o.received.some((b) => b.length === 1 && b[0] === byte);
const called = (o: TaskOutcome, name: string) =>
	o.tools.some((t) => t.name === name && t.status === 'ok');
const noteOns = (o: TaskOutcome, channel: number) =>
	o.received.filter((b) => b[0] === 0x90 + channel && b[2] > 0).map((b) => b[1]);
const allReleased = (o: TaskOutcome) => o.device.opxy.activeNotes.size === 0;
const says = (o: TaskOutcome, pattern: RegExp) => pattern.test(o.answer);
const check = (name: string, pass: boolean): Check => ({ name, pass });

function sendAsUser(
	device: FakeDevice,
	message: Parameters<FakeDevice['stack']['transport']['send']>[0]
): void {
	device.stack.transport.send(message, { source: 'user' });
}

// ─── tasks ──────────────────────────────────────────────────────────────────────────────────────

export const DEVICE_TASKS: readonly DeviceTask[] = [
	{
		id: 'tempo-96',
		prompt: 'set the tempo to 96',
		check: (o) => [
			check('set_tempo called', called(o, 'set_tempo')),
			check('CC80 = 48 sent on channel 1', cc(o, 0, 80, 48)),
			check('device tempo is 96', o.device.opxy.bpm === 96)
		]
	},
	{
		id: 'tempo-odd',
		prompt: 'set the tempo to 97 bpm',
		check: (o) => [
			check('CC80 = 49 sent', cc(o, 0, 80, 49)),
			check('device tempo is 98', o.device.opxy.bpm === 98),
			check('answer explains it became 98', says(o, /98/))
		]
	},
	{
		id: 'tempo-out-of-range',
		prompt: 'set the tempo to 300 bpm',
		check: (o) => [
			check('no tempo sent', !cc(o, 0, 80)),
			check('answer names the 40–220 range', says(o, /220/))
		]
	},
	{
		id: 'mute-two',
		prompt: 'mute tracks 2 and 3',
		check: (o) => [
			check('CC9 = 127 on channel 2', cc(o, 1, 9, 127)),
			check('CC9 = 127 on channel 3', cc(o, 2, 9, 127)),
			check('tracks 2 and 3 muted on the device', o.device.opxy.mutes[1] && o.device.opxy.mutes[2]),
			check('nothing else muted', o.device.opxy.mutes.filter(Boolean).length === 2)
		]
	},
	{
		id: 'unmute',
		prompt: 'unmute track 2',
		setup: (d) => sendAsUser(d, { type: 'controlChange', channel: 1, controller: 9, value: 127 }),
		check: (o) => [
			check('CC9 = 0 on channel 2', cc(o, 1, 9, 0)),
			check('track 2 unmuted on the device', o.device.opxy.mutes[1] === false)
		]
	},
	{
		id: 'select-track',
		prompt: 'select track 5 on my op-xy',
		check: (o) => [
			check('CC102 = 4 on channel 1', cc(o, 0, 102, 4)),
			check('device shows track 5', o.device.opxy.selectedTrack === 5)
		]
	},
	{
		id: 'play',
		prompt: 'start playback',
		check: (o) => [
			check('MIDI start sent', status(o, 0xfa)),
			check('device is playing', o.device.opxy.playing)
		]
	},
	{
		id: 'stop',
		prompt: 'stop the sequencer',
		clockMode: 'both',
		setup: (d) => d.opxy.pressPlay(),
		check: (o) => [
			check('MIDI stop sent', status(o, 0xfc)),
			check('device stopped', !o.device.opxy.playing)
		]
	},
	{
		id: 'already-playing',
		prompt: 'is my op-xy playing right now?',
		clockMode: 'both',
		setup: (d) => d.opxy.pressPlay(),
		check: (o) => [
			check(
				'nothing sent',
				o.received.every((b) => b[0] === 0xf8 || b[0] === 0xfe)
			),
			check(
				'answer says it is playing',
				says(o, /\bplaying\b|\bis running\b|\byes\b/i) &&
					!says(o, /not playing|isn['’]t playing|stopped\./i)
			)
		]
	},
	{
		id: 'firmware',
		prompt: 'what firmware is my op-xy running?',
		check: (o) => [
			check('answer names OS 1.1.33', says(o, /1\.1\.33/)),
			check('nothing sent', o.received.length === 0)
		]
	},
	{
		id: 'c-minor-chord',
		prompt: 'play a C minor chord on track 3',
		check: (o) => {
			const notes = noteOns(o, 2);
			const classes = new Set(notes.map((n) => n % 12));
			return [
				check('play_notes called', called(o, 'play_notes')),
				check('notes on channel 3', notes.length >= 3),
				check(
					'pitch classes are C, E♭, G',
					classes.size === 3 && [0, 3, 7].every((c) => classes.has(c))
				),
				check('every note released', allReleased(o))
			];
		}
	},
	{
		id: 'c-major-run',
		prompt: 'play the first four notes of a C major scale on track 4, one per beat',
		check: (o) => {
			const notes = noteOns(o, 3);
			const classes = notes.map((n) => n % 12);
			return [
				check('four notes on channel 4', notes.length === 4),
				check('C D E F in order', classes.join(',') === '0,2,4,5'),
				check(
					'ascending',
					notes.every((n, i) => i === 0 || n > notes[i - 1])
				),
				check('every note released', allReleased(o))
			];
		}
	},
	{
		id: 'drum-hit',
		prompt: 'play one kick drum hit on track 1',
		check: (o) => {
			const notes = noteOns(o, 0);
			return [
				check('a note on channel 1', notes.length >= 1),
				check(
					'in the drum key range 53–76',
					notes.length > 0 && notes.every((n) => n >= 53 && n <= 76)
				),
				check('every note released', allReleased(o))
			];
		}
	},
	{
		id: 'show-parameter-lock',
		prompt: 'show me how to add a parameter lock',
		check: (o) => [
			check('show_on_replica called', called(o, 'show_on_replica')),
			check(
				'shows holding a step while turning an encoder',
				o.shown.some((k) => /step/.test(k) && /turn E[1-4]/.test(k))
			),
			check('nothing sent to the device', o.received.length === 0)
		]
	},
	{
		id: 'show-engine',
		prompt: "show me on the replica how to change a track's engine",
		check: (o) => [
			check(
				'shows shift + M1',
				o.shown.some((k) => k.replace(/\s+/g, ' ').includes('shift + M1'))
			),
			check('nothing sent to the device', o.received.length === 0)
		]
	},
	{
		id: 'no-project-load',
		prompt: 'load project 5 on my op-xy',
		check: (o) => [
			check(
				'no project load (CC86) sent',
				!o.received.some((b) => (b[0] & 0xf0) === 0xb0 && b[1] === 86)
			),
			check('answer explains how to do it on the device', says(o, /project/i))
		]
	},
	{
		id: 'no-remote-keys',
		prompt: 'press the record key on my op-xy for me',
		check: (o) => [
			check(
				'no remote key (CC106/107) sent',
				!o.received.some((b) => (b[0] & 0xf0) === 0xb0 && (b[1] === 106 || b[1] === 107))
			),
			check('no recording started', !status(o, 0xfa)),
			check(
				'answer says it cannot press keys',
				says(o, /can['’]?t|cannot|not able|no way|isn['’]t possible/i)
			)
		]
	},
	{
		id: 'panic',
		prompt: 'something is stuck and keeps sounding, silence everything now',
		check: (o) => {
			const channels = new Set(
				o.received.filter((b) => (b[0] & 0xf0) === 0xb0 && b[1] === 123).map((b) => b[0] & 0x0f)
			);
			return [
				check('panic called', called(o, 'panic')),
				check('all notes off on all 16 channels', channels.size === 16)
			];
		}
	}
];
