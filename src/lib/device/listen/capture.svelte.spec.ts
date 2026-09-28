// Listening's capture in Chromium, in real time: the recorder worklet records the replica's master
// (an oscillator standing in for the sound) and the OP-XY's input (a fake getUserMedia whose stream
// an oscillator feeds), asking for permission only to learn input names and never recording another
// input; it refuses clearly, stops on abort, and the analysis runs in its worker.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { analyzeAudio } from '$lib/core/listen';
import { browserTimers } from '../env';
import AnalysisWorker from './analysis.worker?worker';
import { analyzeHere, workerAnalyzer } from './analyzer';
import {
	AudioCapture,
	ListenAbortedError,
	ListenCaptureError,
	isOpxyInput,
	type MediaDevicesLike,
	type SoundTap
} from './capture.svelte';
import workletUrl from './recorder.worklet?worker&url';

const contexts: AudioContext[] = [];

/** A running context with a sine of `amplitude` at `hz` going through a master gain. */
async function playing(
	hz: number,
	amplitude: number
): Promise<SoundTap & { context: AudioContext }> {
	const context = new AudioContext();
	contexts.push(context);
	await context.resume();
	const oscillator = context.createOscillator();
	oscillator.frequency.value = hz;
	const level = context.createGain();
	level.gain.value = amplitude;
	const master = context.createGain();
	oscillator.connect(level).connect(master).connect(context.destination);
	oscillator.start();
	return { context, output: master };
}

/** A stream an oscillator feeds, its track named `label`. */
async function stream(label: string, hz = 220): Promise<MediaStream> {
	const context = new AudioContext();
	contexts.push(context);
	await context.resume();
	const oscillator = context.createOscillator();
	oscillator.frequency.value = hz;
	const level = context.createGain();
	level.gain.value = 0.4;
	const destination = context.createMediaStreamDestination();
	oscillator.connect(level).connect(destination);
	oscillator.start();
	const media = destination.stream;
	for (const track of media.getAudioTracks())
		Object.defineProperty(track, 'label', { value: label });
	return media;
}

/** Zero crossings per second, upward: a sine's frequency. */
function frequencyOf(x: Float32Array, sampleRate: number): number {
	let crossings = 0;
	for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) crossings++;
	return (crossings * sampleRate) / x.length;
}

function rms(x: Float32Array): number {
	let sum = 0;
	for (const v of x) sum += v * v;
	return Math.sqrt(sum / x.length);
}

interface FakeMedia extends MediaDevicesLike {
	readonly calls: MediaStreamConstraints[];
	readonly opened: MediaStream[];
}

/** Media devices whose names show only after a first getUserMedia, one of them the OP-XY. */
function fakeMedia(
	options: { opxy?: boolean; deny?: boolean; trackLabel?: string } = {}
): FakeMedia {
	let unlocked = false;
	const media: FakeMedia = {
		calls: [],
		opened: [],
		async enumerateDevices() {
			const devices = [
				{ kind: 'audioinput', deviceId: 'mic', label: unlocked ? 'MacBook Pro Microphone' : '' },
				...(options.opxy === false
					? []
					: [{ kind: 'audioinput', deviceId: 'opxy', label: unlocked ? 'OP-XY' : '' }]),
				{ kind: 'audiooutput', deviceId: 'out', label: unlocked ? 'Speakers' : '' }
			];
			return devices as unknown as MediaDeviceInfo[];
		},
		async getUserMedia(constraints) {
			media.calls.push(constraints);
			if (options.deny) throw new DOMException('denied', 'NotAllowedError');
			unlocked = true;
			const audio = constraints.audio;
			const exact =
				typeof audio === 'object' && audio.deviceId && typeof audio.deviceId === 'object'
					? (audio.deviceId as ConstrainDOMStringParameters).exact
					: null;
			const opened = await stream(
				exact === 'opxy' ? (options.trackLabel ?? 'OP-XY') : 'MacBook Pro Microphone'
			);
			media.opened.push(opened);
			return opened;
		}
	};
	return media;
}

function capture(options: { media?: MediaDevicesLike | null; tap?: () => SoundTap | null } = {}) {
	return new AudioCapture({
		media: options.media ?? null,
		createContext: (o) => {
			const context = new AudioContext(o);
			contexts.push(context);
			return context;
		},
		workletUrl,
		tap: options.tap ?? (() => null),
		analyze: analyzeHere,
		timers: browserTimers
	});
}

beforeAll(async () => {
	// audio may start only after a gesture on the page
	const button = document.createElement('button');
	button.textContent = 'allow audio';
	document.body.append(button);
	await userEvent.click(button);
	button.remove();
});

afterEach(async () => {
	for (const context of contexts.splice(0)) await context.close().catch(() => {});
});

describe('recording the replica', () => {
	it('records its master through the worklet, showing the level while it listens', async () => {
		const tap = await playing(440, 0.5);
		const ears = capture({ tap: () => tap });
		const levels: number[] = [];
		const watching = setInterval(() => levels.push(ears.level), 50);
		const recording = ears.record('replica', 0.6, new AbortController().signal);
		expect(ears.active).toMatchObject({ source: 'replica', seconds: 0.6 });
		const done = await recording;
		clearInterval(watching);
		expect(done.source).toBe('replica');
		expect(done.sampleRate).toBe(tap.context.sampleRate);
		expect(done.channels).toHaveLength(2);
		expect(done.channels[0].length).toBe(Math.round(0.6 * tap.context.sampleRate));
		expect(frequencyOf(done.channels[0], done.sampleRate)).toBeCloseTo(440, -1);
		expect(rms(done.channels[1])).toBeCloseTo(0.5 / Math.SQRT2, 1);
		expect(Math.max(...levels)).toBeGreaterThan(0.4);
		expect(ears.active).toBeNull();
		expect(ears.level).toBe(0);
		// the replica keeps playing into its speakers: the tap is only listened to
		expect(tap.context.state).toBe('running');
	});

	it('says what to do when the replica makes no sound', async () => {
		const ears = capture({ tap: () => null });
		await expect(ears.record('replica', 0.2, new AbortController().signal)).rejects.toThrow(
			/sound is off/
		);
	});

	it('stops when asked, and can listen again', async () => {
		const tap = await playing(330, 0.3);
		const ears = capture({ tap: () => tap });
		const controller = new AbortController();
		const recording = ears.record('replica', 5, controller.signal);
		setTimeout(() => controller.abort(), 150);
		await expect(recording).rejects.toBeInstanceOf(ListenAbortedError);
		expect(ears.active).toBeNull();
		const again = await ears.record('replica', 0.2, new AbortController().signal);
		expect(frequencyOf(again.channels[0], again.sampleRate)).toBeCloseTo(330, -1);
	});
});

describe('recording the OP-XY', () => {
	it('asks once to learn the input names, then records only the OP-XY, unprocessed', async () => {
		const media = fakeMedia();
		const ears = capture({ media });
		const done = await ears.record('device', 0.5, new AbortController().signal);
		expect(done).toMatchObject({ source: 'device', label: 'OP-XY', sampleRate: 48000 });
		expect(frequencyOf(done.channels[0], done.sampleRate)).toBeCloseTo(220, -1);
		// first the unlock (whatever input the user allows), stopped unheard; then the OP-XY itself
		expect(media.calls).toHaveLength(2);
		expect(media.calls[0]).toEqual({ audio: true });
		expect(media.calls[1].audio).toMatchObject({
			deviceId: { exact: 'opxy' },
			echoCancellation: false,
			noiseSuppression: false,
			autoGainControl: false
		});
		for (const opened of media.opened) {
			for (const track of opened.getTracks()) expect(track.readyState).toBe('ended');
		}
	});

	it('refuses when there is no OP-XY input, or the browser opens another one', async () => {
		await expect(
			capture({ media: fakeMedia({ opxy: false }) }).record(
				'device',
				0.2,
				new AbortController().signal
			)
		).rejects.toThrow(/No audio input named OP-XY/);
		const swapped = fakeMedia({ trackLabel: 'MacBook Pro Microphone' });
		await expect(
			capture({ media: swapped }).record('device', 0.2, new AbortController().signal)
		).rejects.toThrow(/opened another input/);
		for (const track of swapped.opened.at(-1)!.getTracks()) expect(track.readyState).toBe('ended');
	});

	it('explains a refused permission and a browser without inputs', async () => {
		const denied = capture({ media: fakeMedia({ deny: true }) });
		const error = await denied.record('device', 0.2, new AbortController().signal).catch((e) => e);
		expect(error).toBeInstanceOf(ListenCaptureError);
		expect(error.message).toMatch(/Allow microphone access for this site/);
		await expect(capture().record('device', 0.2, new AbortController().signal)).rejects.toThrow(
			/cannot record audio inputs/
		);
	});

	it('knows the OP-XY by its name', () => {
		expect(['OP-XY', 'OP–XY Audio', 'op xy', 'OPXY'].every(isOpxyInput)).toBe(true);
		expect(isOpxyInput('MacBook Pro Microphone')).toBe(false);
	});
});

describe('the analysis worker', () => {
	it('hears a recording off the page as the page would', async () => {
		const sampleRate = 22050;
		const x = Float32Array.from(
			{ length: sampleRate * 2 },
			(_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / sampleRate)
		);
		const recording = {
			channels: [x, x],
			sampleRate,
			source: 'replica' as const,
			label: 'replica'
		};
		const analyze = workerAnalyzer(() => new AnalysisWorker({ name: 'listen-test' }));
		const heard = await analyze(recording, {});
		expect(heard).toEqual(analyzeAudio([x, x], sampleRate, {}));
		// a worker that cannot start leaves the analysis to the page
		const fallback = workerAnalyzer(() => {
			throw new Error('no workers here');
		});
		expect((await fallback(recording, {})).level.peakDbfs).toBeCloseTo(-10.5, 1);
	});
});
