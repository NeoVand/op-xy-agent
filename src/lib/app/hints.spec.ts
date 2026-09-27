import { describe, expect, it } from 'vitest';
import { CONTROLS, type ControlId } from '$lib/core/opxy';
import {
	comboHint,
	comboName,
	controlName,
	controlPurpose,
	controlSubject,
	notRemoteHint,
	offlineHint,
	sendFailedHint
} from './hints';

describe('names', () => {
	it('names controls the way people say them', () => {
		const cases: [ControlId, string, string, string | null][] = [
			['key.m1', 'M1', 'the M1 key', 'M1'],
			['key.project', 'project', 'the project key', 'project'],
			['key.minus', 'minus', 'the minus key', 'minus'],
			['track.3', 'track 3', 'the track 3 key', 'T3'],
			['step.5', 'step 5', 'step 5', 'step 5'],
			['keyboard.fs3', 'F#3', 'the F#3 key', 'F#3'],
			['encoder.2', 'mid gray encoder', 'the mid gray encoder', 'encoder 2'],
			['knob.volume', 'volume', 'the volume knob', null],
			['strip.pitchbend', 'pitchbend', 'the pitch-bend pad', null]
		];
		for (const [id, name, subject, combo] of cases) {
			expect([controlName(id), controlSubject(id), comboName(id)], id).toEqual([
				name,
				subject,
				combo
			]);
		}
	});

	it('knows what every key, encoder and knob does on the device', () => {
		const operable = CONTROLS.filter(
			(c) => c.kind === 'key' || c.kind === 'encoder' || c.id === 'strip.pitchbend'
		);
		expect(operable.length).toBe(68 + 4 + 1);
		for (const control of operable) {
			expect(controlPurpose(control.id), control.id).toMatch(/^[a-z]/);
		}
		expect(controlPurpose('encoder.1', 'turn')).toMatch(/colour on the screen/);
		expect(controlPurpose('knob.volume')).toBeNull();
	});
});

describe('notRemoteHint', () => {
	it('says a key cannot be pressed remotely on the reference firmware, and what it does', () => {
		expect(notRemoteHint('key.shift', 'press', null)).toEqual({
			kind: 'not-remote',
			control: 'key.shift',
			action: 'press',
			keys: 'shift',
			title: "The shift key can't be pressed remotely on OS 1.1.33.",
			detail: 'On the device it opens second functions and sub-pages together with other keys.',
			text: "The shift key can't be pressed remotely on OS 1.1.33. On the device it opens second functions and sub-pages together with other keys.",
			guide: 'https://teenage.engineering/guides/op-xy/layout#transport-controls',
			firmware: '1.1.33',
			key: 'not-remote:key.shift:press'
		});
		expect(notRemoteHint('step.12', 'press', '1.1.33')).toMatchObject({
			title: "Step 12 can't be pressed remotely on OS 1.1.33.",
			detail: 'On the device it adds the last played note to that step, or edits it.'
		});
	});

	it('never promises an encoder turn and treats the volume knob as hardware only', () => {
		expect(notRemoteHint('encoder.3', 'turn', null)).toMatchObject({
			title: "The light gray encoder can't be turned remotely.",
			detail: 'On the device it changes the parameter shown in its colour on the screen.'
		});
		expect(notRemoteHint('encoder.3', 'click', null).title).toBe(
			"The light gray encoder can't be clicked remotely on OS 1.1.33."
		);
		expect(notRemoteHint('knob.volume', 'turn', null)).toMatchObject({
			keys: null,
			title: 'The volume knob only works on the device itself.',
			detail: 'It sets the output level and sends no MIDI.'
		});
	});

	it('is careful on firmware where remote presses are unverified', () => {
		const hint = notRemoteHint('key.bar', 'press', '1.1.4');
		expect(hint.firmware).toBe('1.1.4');
		expect(hint.text).toBe(
			"The bar key isn't pressed from here: remote key presses are unverified on OS 1.1.4. On the device it sets how many bars the sequence has, and its quantisation."
		);
	});
});

describe('comboHint', () => {
	it('names the combo and how to send the plain press', () => {
		expect(comboHint(['key.shift'], 'key.play', { kind: 'start' }, null)).toMatchObject({
			kind: 'combo',
			keys: 'shift + play',
			title: "Shift + play can't be sent remotely on OS 1.1.33.",
			detail: 'Let go of shift to start playback.',
			key: 'combo:shift + play'
		});
		expect(
			comboHint(['key.record', 'step.3'], 'keyboard.c4', { kind: 'note', note: 60 }, '1.1.33').text
		).toBe(
			"Record + step 3 + C4 can't be sent remotely on OS 1.1.33. Let go of record and step 3 to play notes."
		);
		expect(comboHint(['encoder.1'], 'key.stop', { kind: 'stop' }, null).keys).toBe(
			'encoder 1 + stop'
		);
	});

	it('explains that holding track keys links tracks', () => {
		expect(
			comboHint(['track.2', 'track.4'], 'track.6', { kind: 'track', track: 6 }, null).text
		).toBe(
			"Holding track 2 and track 4 while pressing track 6 links tracks on the device, which can't be done remotely. Let go of them to select track 6."
		);
	});
});

describe('offline and send failures', () => {
	it('says the replica is a simulation', () => {
		expect(offlineHint('keyboard.c4')).toMatchObject({
			kind: 'offline',
			keys: 'C4',
			key: 'offline',
			title: 'Nothing was sent.',
			detail:
				'The replica is a simulation until you connect your OP-XY: its keys move, but they play nothing.'
		});
		expect(offlineHint('strip.pitchbend', 'bend')).toMatchObject({ action: 'bend', keys: null });
	});

	it('passes on why the transport refused', () => {
		const error = new Error('too many messages at once: 90 3C 64 would wait 3 ms (limit 0 ms).');
		error.name = 'TransportPolicyError';
		expect(sendFailedHint('keyboard.c4', 'press', error, null)).toMatchObject({
			kind: 'send-failed',
			title: "The C4 key didn't reach the OP-XY.",
			detail: 'Too many messages at once: 90 3C 64 would wait 3 ms (limit 0 ms).',
			key: 'send-failed:TransportPolicyError'
		});
	});
});
