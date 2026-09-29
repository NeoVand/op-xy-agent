// The synth core as the main thread drives it: notes that start on the sample they were scheduled
// for and on their own track, let go and die away (telling the main thread), cancelled and stolen
// voices, glides, the filter envelope, and the track's LFO arriving as audio inputs. Rendered in
// Node, 128 samples at a time as an AudioWorklet would.
import { describe, expect, it } from 'vitest';
import { attackSeconds, envelopeSeconds, halfLifeSeconds } from '../mapping';
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
	it('follows the measured laws: the attack 1.4 s at CC 64 and six minutes at the top, decay half-lives from 4.5 ms to 5 s', () => {
		expect(attackSeconds(0)).toBeLessThan(0.001);
		expect(attackSeconds((64 * 99) / 127)).toBeCloseTo(1.42, 1);
		expect(attackSeconds(99)).toBeGreaterThan(300);
		expect(halfLifeSeconds(0)).toBeCloseTo(0.0045, 4);
		expect(halfLifeSeconds((64 * 99) / 127)).toBeCloseTo(0.281, 3);
		expect(halfLifeSeconds(99)).toBeCloseTo(4.993, 2);
	});

	it('rises and falls as the owner’s unit: an attack at CC 64 at 10/50/90 % by 0.10/0.59/1.24 s, a decay at CC 64 halving every 0.28 s and cutting out at −41 dB', () => {
		const cc = (v: number) => (v * 99) / 127;
		const env = new Adsr(
			SR,
			envelopeSeconds({ attack: cc(64), decay: cc(64), sustain: 0, release: 99 })
		);
		env.gateOn();
		const levels: number[] = [];
		for (let i = 0; i < 5 * SR; i++) levels.push(env.next());
		const firstAt = (test: (v: number) => boolean, from = 0) =>
			(levels.findIndex((v, i) => i >= from && test(v)) - from) / SR;
		// research 60 §3: the device's 101, 589 and 1244 ms (a few percent of fit)
		expect(firstAt((v) => v >= 0.1)).toBeCloseTo(0.101, 1);
		expect(firstAt((v) => v >= 0.5)).toBeCloseTo(0.589, 1);
		expect(firstAt((v) => v >= 0.9)).toBeCloseTo(1.244, 1);
		const peak = levels.indexOf(1);
		expect(firstAt((v) => v <= 0.5, peak)).toBeCloseTo(0.281, 2);
		// the cut: silence about 6.8 half-lives after the peak, where the device's 1.9 s ends it
		expect(firstAt((v) => v === 0, peak)).toBeCloseTo(1.9, 0);
	});

	it('attacks on an RC charge toward twice the peak, decays to the sustain, and releases to silence', () => {
		const env = new Adsr(SR, { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.1 });
		env.gateOn();
		const levels: number[] = [];
		for (let i = 0; i < SR; i++) levels.push(env.next());
		// half way through the attack the charge stands at 2·(1 − 2^−0.5) of the peak
		expect(levels[Math.round(0.005 * SR)]).toBeCloseTo(2 * (1 - Math.SQRT1_2), 2);
		expect(levels[Math.round(0.01 * SR)]).toBeCloseTo(1, 2);
		// the decay heads for silence (four time constants per decay time) and stops at the sustain,
		// as the owner's unit does: half a time constant in it stands at e^-0.5 of the peak
		expect(levels[Math.round(0.0225 * SR)]).toBeCloseTo(Math.exp(-0.5), 2);
		const meets = 0.01 + (0.1 / 4) * Math.LN2;
		expect(levels[Math.round((meets + 0.001) * SR)]).toBe(0.5);
		expect(levels[Math.round(0.11 * SR)]).toBe(0.5);
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
					// a decay long enough that the first window stays well above the sustain
					amp: settings(0.002, 0.6, 0.25),
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
		// a quarter of the depth: a full one sweeps the whole range (research 60 §4), past the top
		const lifted = brightness({ target: 'cutoff', param: 0, depth: 0.25 });
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
