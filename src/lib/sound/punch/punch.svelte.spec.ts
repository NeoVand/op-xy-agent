// Punch-in FX through the real processor (Chromium, offline rendering): a held key changes the
// sound of the group it acts on and leaves the other group's alone, the punch-in track's pattern
// does the same on the sequencer's clock, and the effects on notes shape notes as they start.
import { describe, expect, it } from 'vitest';
import { defaultState, type SimState } from '$lib/sim/params';
import { currentPattern, toggleStep } from '$lib/sim/sequencer';
import { SoundEngine } from '../engine';
import { Scheduler } from '../scheduler';
import { punchTracks } from './effects';
import { PunchHost } from './host';
import type { PunchTrigger } from './state';
import workletUrl from './worklet?worker&url';

const SR = 48000;

/** RMS of both channels between `from` and `to` seconds. */
function rms(buffer: AudioBuffer, from: number, to: number): number {
	let sum = 0;
	let count = 0;
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		const data = buffer.getChannelData(c).subarray(Math.round(from * SR), Math.round(to * SR));
		for (const v of data) sum += v * v;
		count += data.length;
	}
	return Math.sqrt(sum / Math.max(1, count));
}

/** A new project, its synths' releases short so every tail ends inside a render. */
function project(): SimState {
	const state = defaultState();
	state.tempo.metronome.on = false;
	for (const track of state.tracks) if (track.engine !== 'drum') track.amp.release = 97;
	return state;
}

/** Key `key` (0–23) held on the punch-in track. */
const onT2 = (state: SimState, key: number): PunchTrigger => ({
	key,
	from: null,
	tracks: punchTracks(state.tracks, { key, from: null })
});

/** Renders `seconds` of what `play` does on an engine whose channels run through the processor. */
async function render(
	seconds: number,
	play: (engine: SoundEngine, state: SimState, context: OfflineAudioContext) => void
) {
	const context = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
	const host = await PunchHost.create(context, workletUrl);
	expect(host).not.toBeNull();
	const errors: string[] = [];
	host!.node.addEventListener('processorerror', (e) => errors.push(String(e)));
	const state = project();
	const engine = new SoundEngine({ context });
	engine.sync(state);
	engine.usePunch(host);
	play(engine, state, context);
	// an offline context renders faster than the port delivers: let the messages arrive first
	await new Promise((resolve) => setTimeout(resolve, 50));
	const buffer = await context.startRendering();
	expect(errors).toEqual([]);
	return buffer;
}

/** A synth note on T3 from `time` for `duration` seconds. */
const synth = (engine: SoundEngine, state: SimState, time = 0.05, duration = 1) =>
	engine.noteOn({ track: 2, settings: state.tracks[2], note: 60, velocity: 100, time, duration });

/** A kick on T1 at `time`. */
const kick = (engine: SoundEngine, state: SimState, time: number) =>
	engine.noteOn({ track: 0, settings: state.tracks[0], note: 53, velocity: 100, time });

describe('punch-in FX, rendered through the processor', () => {
	it('mutes the synths while the upper F is held, and leaves the drums alone', async () => {
		const held = (engine: SoundEngine, state: SimState) => {
			engine.punch([onT2(state, 12)], 0.3);
			engine.punch([], 0.6);
		};
		const synths = await render(1.2, (engine, state) => {
			held(engine, state);
			synth(engine, state);
		});
		expect(rms(synths, 0.1, 0.25)).toBeGreaterThan(0.02);
		expect(rms(synths, 0.32, 0.58)).toBeLessThan(1e-4);
		expect(rms(synths, 0.65, 0.95)).toBeGreaterThan(0.02);
		const drums = (withKey: boolean) =>
			render(1, (engine, state) => {
				if (withKey) held(engine, state);
				kick(engine, state, 0.35);
			});
		const [plain, keyed] = await Promise.all([drums(false), drums(true)]);
		expect(rms(plain, 0.35, 0.55)).toBeGreaterThan(0.01);
		expect(rms(keyed, 0.35, 0.55)).toBeCloseTo(rms(plain, 0.35, 0.55), 6);
	});

	it('chops the drums to the start of each sixteenth under the lower F♯, and leaves the synths', async () => {
		const drums = (withKey: boolean) =>
			render(1, (engine, state) => {
				if (withKey) engine.punch([onT2(state, 1)], 0.3);
				kick(engine, state, 0.3);
			});
		const [plain, keyed] = await Promise.all([drums(false), drums(true)]);
		// the hit's first 30 ms come through, the rest of the sixteenth (0.125 s at 120) is closed
		expect(rms(keyed, 0.3, 0.325)).toBeGreaterThan(0.5 * rms(plain, 0.3, 0.325));
		expect(rms(plain, 0.34, 0.42)).toBeGreaterThan(0.01);
		expect(rms(keyed, 0.34, 0.42)).toBeLessThan(1e-4);
		const synths = (withKey: boolean) =>
			render(0.8, (engine, state) => {
				if (withKey) engine.punch([onT2(state, 1)], 0.3);
				synth(engine, state, 0.05, 0.6);
			});
		const [a, b] = await Promise.all([synths(false), synths(true)]);
		expect(rms(b, 0.3, 0.6)).toBeCloseTo(rms(a, 0.3, 0.6), 6);
	});

	it('stutters a synth under the upper F♯: silent from 7/12 of every sixteenth', async () => {
		const buffer = await render(1, (engine, state) => {
			engine.punch([onT2(state, 13)], 0.3);
			synth(engine, state);
		});
		const step = 0.125;
		for (const s of [1, 2, 3]) {
			const start = 0.3 + s * step;
			expect(rms(buffer, start, start + step / 2)).toBeGreaterThan(0.01);
			// (from 8/12: the gate's 3 ms ramp and the master chain's ringing are over by then)
			expect(rms(buffer, start + (8 / 12) * step, start + (11.5 / 12) * step)).toBeLessThan(1e-4);
		}
	});

	it('plays the punch-in track’s notes on the sequencer’s clock', async () => {
		let start = 0;
		const buffer = await render(1.6, (engine, state, context) => {
			const line = currentPattern(state.tracks[2].sequence);
			toggleStep(line, 0, [60]);
			line.steps[0].notes[0].length = 12;
			// the upper F on step 4, for four steps
			const punches = currentPattern(state.aux[1].sequence);
			toggleStep(punches, 4, [53 + 12]);
			punches.steps[4].notes[0].length = 4;
			state.transport.playing = true;
			engine.sync(state);
			const scheduler = new Scheduler({
				state: () => state,
				now: () => context.currentTime,
				sink: engine.sink,
				lookahead: 1.6
			});
			scheduler.tick();
			start = scheduler.anchor?.time ?? 0;
		});
		const step = 0.125;
		expect(rms(buffer, start + 0.1, start + 4 * step)).toBeGreaterThan(0.02);
		expect(rms(buffer, start + 4 * step + 0.01, start + 8 * step)).toBeLessThan(1e-4);
		expect(rms(buffer, start + 8 * step + 0.02, start + 11 * step)).toBeGreaterThan(0.02);
	});

	it('cuts notes that start under the upper C♯ short', async () => {
		const notes = (withKey: boolean) =>
			render(0.8, (engine, state) => {
				if (withKey) engine.punch([onT2(state, 20)], 0);
				synth(engine, state, 0.05, 0.6);
			});
		const [plain, keyed] = await Promise.all([notes(false), notes(true)]);
		expect(rms(plain, 0.2, 0.5)).toBeGreaterThan(0.02);
		expect(rms(keyed, 0.2, 0.5)).toBeLessThan(0.1 * rms(plain, 0.2, 0.5));
	});
});
