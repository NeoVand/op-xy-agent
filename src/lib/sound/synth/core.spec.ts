// The synth core as the main thread drives it: notes that start on the sample they were scheduled
// for and on their own track, let go and die away (telling the main thread), cancelled and stolen
// voices, glides, the filter envelope, and the track's LFO arriving as audio inputs. Rendered in
// Node, 128 samples at a time as an AudioWorklet would.
import { describe, expect, it } from 'vitest';
import { envelopeTime } from '../mapping';
import { Adsr } from './adsr';
import { levelAt, rms } from './analysis';
import { MOD_CHANNELS, SynthCore, TRACK_OUTPUTS, type CoreReply, type VoiceStart } from './core';

const SR = 48000;
const BLOCK = 128;

const settings = (attack = 0.002, decay = 0.2, sustain = 1, release = 0.05) => ({
	attack,
	decay,
	sustain,
	release
});

function voice(v: Partial<VoiceStart> = {}): VoiceStart {
	return {
		id: 1,
		track: 0,
		engine: 'prism',
		// shape 0, ratio 1:1, no detune or stereo: one plain saw, whose pitch zero crossings can read
		m1: [0, 15, 0, 0],
		velocity: 100,
		start: 0,
		gate: Infinity,
		hz: 220,
		from: 220,
		glide: 0,
		amp: settings(),
		peak: 0.5,
		filter: { type: 'svf', on: true, hz: 20000, resonance: 0, envelope: settings(), depth: 0 },
		bend: 0,
		curve: null,
		pan: 0,
		lfoParam: null,
		element: null,
		...v
	};
}

/** Renders `seconds` of the core, block by block; returns each track's left channel. */
function run(
	core: SynthCore,
	seconds: number,
	lfo?: (track: number, channel: number) => number
): Float32Array[] {
	const total = Math.round(seconds * SR);
	const out = Array.from({ length: TRACK_OUTPUTS }, () => new Float32Array(total));
	for (let at = 0; at < total; at += BLOCK) {
		const n = Math.min(BLOCK, total - at);
		const outputs = Array.from({ length: TRACK_OUTPUTS }, () => [
			new Float32Array(n),
			new Float32Array(n)
		]);
		const inputs = Array.from({ length: TRACK_OUTPUTS }, (_, t) =>
			lfo ? Array.from({ length: MOD_CHANNELS }, (_, c) => new Float32Array(n).fill(lfo(t, c))) : []
		);
		core.process(at, outputs, inputs, n);
		outputs.forEach(([left], t) => out[t].set(left, at));
	}
	return out;
}

/** The first sample that is not silent. */
const onset = (x: Float32Array) => x.findIndex((v) => Math.abs(v) > 1e-6);

/** A pitch estimate from zero crossings (rising) over `x`. */
function pitch(x: Float32Array): number {
	let first = -1;
	let last = -1;
	let count = 0;
	for (let i = 1; i < x.length; i++) {
		if (x[i - 1] < 0 && x[i] >= 0) {
			if (first < 0) first = i;
			last = i;
			count++;
		}
	}
	return count > 1 ? ((count - 1) * SR) / (last - first) : 0;
}

describe('envelope', () => {
	it('follows the measured time law: milliseconds at 0, about 2 s at 50, minutes at 99', () => {
		expect(envelopeTime(0, 0.001)).toBeCloseTo(0.001, 4);
		expect(envelopeTime(49.5, 0.001)).toBeGreaterThan(1.8);
		expect(envelopeTime(49.5, 0.001)).toBeLessThan(2.2);
		expect(envelopeTime(99, 0.001)).toBeGreaterThan(300);
	});

	it('attacks linearly, decays to the sustain, and releases to silence', () => {
		const env = new Adsr(SR, { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.1 });
		env.gateOn();
		const levels: number[] = [];
		for (let i = 0; i < SR; i++) levels.push(env.next());
		expect(levels[Math.round(0.005 * SR)]).toBeCloseTo(0.5, 2);
		expect(levels[Math.round(0.01 * SR)]).toBeCloseTo(1, 2);
		// four time constants per decay time: 98% of the way to the sustain
		expect(levels[Math.round(0.11 * SR)]).toBeCloseTo(0.5 + 0.5 * Math.exp(-4), 2);
		expect(env.stage).toBe('sustain');
		env.gateOff();
		for (let i = 0; i < SR; i++) env.next();
		expect(env.active).toBe(false);
	});
});

describe('the synth core', () => {
	it('starts a note on the sample it was scheduled for, on its own track only', () => {
		const core = new SynthCore(SR);
		core.post({ t: 'start', voice: voice({ track: 2, start: 1000 / SR }) });
		const out = run(core, 0.1);
		expect(onset(out[2])).toBe(1000);
		expect(rms(out[2], 2000)).toBeGreaterThan(0.05);
		expect(rms(out[0])).toBe(0);
		expect(rms(out[3])).toBe(0);
	});

	it('lets go at its gate and tells the main thread once it has died away', () => {
		const replies: CoreReply[] = [];
		const core = new SynthCore(SR, (r) => replies.push(r));
		core.post({ t: 'start', voice: voice({ gate: 0.05, amp: settings(0.002, 0.2, 1, 0.02) }) });
		const out = run(core, 0.2);
		expect(rms(out[0], 0, Math.round(0.05 * SR))).toBeGreaterThan(0.05);
		expect(rms(out[0], Math.round(0.1 * SR))).toBeLessThan(1e-4);
		expect(rms(out[0], Math.round(0.15 * SR))).toBe(0);
		expect(replies).toEqual([{ t: 'ended', id: 1 }]);
		expect(core.sounding).toBe(0);
	});

	it('drops a note cancelled before it begins, and lets go of one cancelled after', () => {
		const replies: CoreReply[] = [];
		const core = new SynthCore(SR, (r) => replies.push(r));
		core.post({ t: 'start', voice: voice({ id: 1, start: 0.05 }) });
		core.post({ t: 'start', voice: voice({ id: 2, track: 1, start: 0 }) });
		core.post({ t: 'cancel', id: 1, time: 0.01 });
		core.post({ t: 'cancel', id: 2, time: 0.02 });
		const out = run(core, 0.3);
		expect(rms(out[0])).toBe(0);
		expect(rms(out[1], 0, Math.round(0.02 * SR))).toBeGreaterThan(0.05);
		expect(replies.map((r) => r.id).sort()).toEqual([1, 2]);
	});

	it('fades a stolen voice out within milliseconds, even in a long release', () => {
		const core = new SynthCore(SR);
		core.post({ t: 'start', voice: voice({ gate: 0.02, amp: settings(0.002, 0.2, 1, 5) }) });
		core.post({ t: 'kill', id: 1, time: 0.05 });
		const out = run(core, 0.2);
		expect(rms(out[0], Math.round(0.03 * SR), Math.round(0.05 * SR))).toBeGreaterThan(0.05);
		expect(rms(out[0], Math.round(0.08 * SR))).toBeLessThan(1e-4);
	});

	it('glides from the last note’s pitch to its own', () => {
		const core = new SynthCore(SR);
		core.post({ t: 'start', voice: voice({ from: 110, hz: 220, glide: 0.3 }) });
		const out = run(core, 1)[0];
		expect(pitch(out.subarray(0, 2400))).toBeLessThan(140);
		expect(pitch(out.subarray(SR / 2))).toBeCloseTo(220, -1);
	});

	it('opens the filter with the filter envelope', () => {
		const core = new SynthCore(SR);
		const env = settings(0.002, 0.3, 0, 0.05);
		core.post({
			t: 'start',
			voice: voice({
				filter: { type: 'ladder', on: true, hz: 300, resonance: 20, envelope: env, depth: 4800 }
			})
		});
		const out = run(core, 1)[0];
		// the tenth harmonic comes through while the envelope has the filter open, not after
		const early = levelAt(out.subarray(480, 480 + 2048), SR, 2200);
		const late = levelAt(out.subarray(SR / 2, SR / 2 + 2048), SR, 2200);
		expect(early).toBeGreaterThan(late * 10);
	});

	it('passes the engine through untouched when the filter is off', () => {
		const tone = (on: boolean) => {
			const core = new SynthCore(SR);
			const filter = { type: 'ladder', on, hz: 300, resonance: 0, envelope: settings(), depth: 0 };
			core.post({ t: 'start', voice: voice({ filter: filter as VoiceStart['filter'] }) });
			return levelAt(run(core, 0.3)[0].subarray(4800, 4800 + 4096), SR, 2200);
		};
		expect(tone(false)).toBeGreaterThan(tone(true) * 30);
	});

	it('runs the element LFO on the voice’s own amp envelope', () => {
		// the amp envelope falls from 1 to 0.25: the cutoff it lifts falls with it
		const brightness = (element: VoiceStart['element']) => {
			const core = new SynthCore(SR);
			const filter = {
				type: 'ladder',
				on: true,
				hz: 300,
				resonance: 0,
				envelope: settings(),
				depth: 0
			};
			core.post({
				t: 'start',
				voice: voice({
					amp: settings(0.002, 0.2, 0.25),
					filter: filter as VoiceStart['filter'],
					element
				})
			});
			const out = run(core, 1)[0];
			const at = (from: number) => {
				const x = out.subarray(from, from + 4096);
				return levelAt(x, SR, 2200) / levelAt(x, SR, 220);
			};
			return at(480) / at(SR / 2);
		};
		const lifted = brightness({ target: 'cutoff', param: 0, depth: 1 });
		expect(lifted).toBeGreaterThan(5);
		expect(brightness(null)).toBeCloseTo(1, 0);
	});

	it('takes the track’s LFO from its input: vibrato in cents', () => {
		const core = new SynthCore(SR);
		core.post({ t: 'start', voice: voice({ hz: 440, from: 440 }) });
		const out = run(core, 0.5, (track, channel) => (track === 0 && channel === 3 ? 1200 : 0))[0];
		expect(pitch(out.subarray(4800))).toBeCloseTo(880, -1);
	});

	it('bends a sounding note', () => {
		const core = new SynthCore(SR);
		core.post({ t: 'start', voice: voice({ hz: 440, from: 440 }) });
		core.post({ t: 'bend', id: 1, time: 0, cents: -1200 });
		const out = run(core, 0.5)[0];
		expect(levelAt(out.subarray(9600), SR, 220)).toBeGreaterThan(0.1);
	});
});
