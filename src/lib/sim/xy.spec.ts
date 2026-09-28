import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import { selectScene } from '$lib/sim/areas/arrange/model';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { defaultState, type SimState } from '$lib/sim/params';
import {
	STEP_COMPONENTS,
	type Pattern,
	addBar,
	emptyPattern,
	setComponentValue,
	setLock,
	toggleComponent,
	toggleStep
} from '$lib/sim/sequencer';
import { decodeXy, encodeXy } from '$lib/core/xy/container';
import { XyModelError } from '$lib/core/xy/errors';
import { XY_STEP_COMPONENTS } from '$lib/core/xy/model';
import { readProject } from '$lib/core/xy/read';
import { simToXy, xyToSim } from './xy';

const fixture = (name: string) =>
	new Uint8Array(readFileSync(new URL(`../core/xy/fixtures/${name}`, import.meta.url)));
const blank = fixture('blank-1.1.4.xy');

/** Offsets where two files' images differ. */
function differences(a: Uint8Array, b: Uint8Array): number[] {
	const x = decodeXy(a).image;
	const y = decodeXy(b).image;
	expect(x.length).toBe(y.length);
	return Array.from(x.keys()).filter((i) => x[i] !== y[i]);
}

/** A project with something on most of what the file takes. */
function composed(): SimState {
	const s = defaultState();
	s.tempo.bpm = 97.5;
	s.tempo.groove = 3;
	s.tempo.swing = 50;
	s.tempo.metronome = { level: 99, on: true };
	const settings = s.areas.system.projectSettings;
	settings.transpose = 5;
	settings.sceneLength = 1; // "time signature" on the settings page
	settings.signature = 3; // 6/8
	settings.voices[1] = 4;
	settings.channels[0] = 1;
	settings.channels[15] = 16;
	s.areas.sequencer.octaves['instrument.2'] = -2;
	s.areas.sequencer.octaves['auxiliary.0'] = 1;
	s.areas.sequencer.octaves['instrument.0'] = 3; // a drum track: its keys do not transpose

	// T1: four kicks and a two-note chord
	const drums = s.tracks[0].sequence.patterns[0];
	for (const step of [0, 4, 8, 12]) toggleStep(drums, step, [53], 110);
	toggleStep(drums, 14, [55, 61], 90);

	// T3: two patterns; the first with locks, a component, a groove, a slow note length
	const bass = s.tracks[2].sequence;
	const p1 = bass.patterns[0];
	p1.noteLength = 0.25;
	toggleStep(p1, 0, [36]);
	toggleStep(p1, 6, [43], 80);
	p1.steps[6].notes[0].offset = 30 / 480;
	p1.steps[6].notes[0].length = 3;
	setLock(p1, 0, 'm1.1', 99);
	setLock(p1, 5, 'filter.cutoff', 20);
	setLock(p1, 5, 'lfo.amount', -40);
	toggleComponent(p1, [3], 'pulse');
	setComponentValue(p1, [3], 'pulse', 7);
	toggleComponent(p1, [3], 'skip trigger');
	p1.groove = 7;
	p1.quantise = 50;
	p1.quantiseOn = false;
	p1.smoothing = 50;
	const p2 = emptyPattern();
	addBar(p2);
	p2.scale = 2;
	toggleStep(p2, 16, [41]);
	const p3 = emptyPattern();
	p3.scale = 3;
	p3.player.on = true;
	bass.patterns.push(p2, p3);
	s.areas.arrange.sounds[2].push(null, null);

	// T11 (external MIDI) plays a note too
	toggleStep(s.aux[2].sequence.patterns[0], 0, [48]);

	// scene 2 plays T3's second pattern with T1 muted; back on scene 1, which plays the first
	bass.current = 1;
	s.tracks[0].mix.muted = true;
	selectScene(s, 1);
	selectScene(s, 0);
	bass.current = 0;
	s.tracks[0].mix.muted = false;
	s.areas.arrange.songs[0] = { order: [0, 1, 0], loop: true };
	s.areas.arrange.songs[1] = { order: [1], loop: false };
	return s;
}

describe('simToXy', () => {
	it('writes a new project as its template but for the metronome, which starts off here', () => {
		const { bytes, skipped } = simToXy(defaultState(), blank);
		expect(skipped).toEqual([]);
		expect(differences(bytes, blank)).toEqual([0x04]);
		expect(readProject(bytes).settings.clickVolume).toBe(0);
		const on = defaultState();
		on.tempo.metronome.on = true;
		expect(simToXy(on, blank).bytes).toEqual(blank);
	});

	it('keeps what a 1.1.33 template holds for an untouched project', () => {
		// the owner's blank project: family 0x14, T1 an octave down, scene 1 flagged (note 10 §8)
		const { header, image } = decodeXy(blank);
		const newer = Uint8Array.of(...header.subarray(0, 5), 0x14, 0x07, 0x86);
		const edited = image.slice();
		edited[0x3d] = 0xff;
		edited[0x95 + 32] = 1;
		const template = encodeXy(newer, edited);
		const state = defaultState();
		state.tempo.metronome.on = true;
		const { bytes, skipped } = simToXy(state, template);
		expect(skipped).toEqual([]);
		expect(bytes).toEqual(template);
	});

	it('writes the settings', () => {
		const { project } = simToXy(composed(), blank);
		expect(project.settings).toMatchObject({
			tempo: 97.5,
			grooveType: 3,
			grooveAmount: 64,
			clickVolume: 255,
			activeScene: 0,
			activeSong: 0,
			sceneLength: 2,
			transpose: 5,
			timeSignature: 0x13,
			voices: [0, 4, 0, 0, 0, 0, 0, 0],
			octaves: [0, 0, -2, 1, 0, -1, 0, 0, 1, 4, 0, 0, 0, 0, 0, 0]
		});
		expect(project.settings.midiChannels[0]).toBe(1);
		expect(project.settings.midiChannels[15]).toBe(16);
		expect(project.settings.midiChannels.slice(1, 15).every((c) => c === null)).toBe(true);
	});

	it('writes patterns, notes, components and locks, and reads them back', () => {
		const { bytes, project } = simToXy(composed(), blank);
		expect(readProject(bytes)).toEqual(project);
		const [t1] = project.tracks[0].patterns;
		expect(t1.notes.map((n) => [n.tick, n.note, n.velocity, n.gate])).toEqual([
			[0, 53, 110, 240],
			[1920, 53, 110, 240],
			[3840, 53, 110, 240],
			[5760, 53, 110, 240],
			[6720, 55, 90, 240],
			[6720, 61, 90, 240]
		]);
		expect(t1.pristine).toBe(0);
		const [p1, p2, p3] = project.tracks[2].patterns;
		expect(p1).toMatchObject({
			steps: 16,
			noteLength: 120,
			quantize: 128,
			groove: 9,
			smoothing: 129,
			pristine: 0
		});
		expect(p1.notes).toEqual([
			{ tick: 0, gate: 120, note: 36, velocity: 100, flags: 0 },
			{ tick: 2910, gate: 1440, note: 43, velocity: 80, flags: 0 }
		]);
		expect(p1.locks).toEqual([
			{ step: 0, column: 1, value: 32767 },
			{ step: 5, column: 17, value: 6620 }
		]);
		expect(p1.components).toEqual([
			{ step: 3, kind: 'pulse', value: 7 },
			{ step: 3, kind: 'skip trigger', value: 2 }
		]);
		expect(p2).toMatchObject({ steps: 32, scale: 0x05, pristine: 0 });
		expect(p2.notes).toEqual([{ tick: 7680, gate: 240, note: 41, velocity: 100, flags: 0 }]);
		// an empty pattern past the template's keeps the first pattern's sound and is not edited
		expect(p3).toMatchObject({ steps: 16, scale: 0x03, notes: [], pristine: 8 });
		expect(p3.sound).toEqual(p1.sound);
		expect(project.tracks[10].patterns[0].notes).toEqual([
			{ tick: 0, gate: 240, note: 48, velocity: 100, flags: 0 }
		]);
	});

	it('writes scenes and songs', () => {
		const { project } = simToXy(composed(), blank);
		const [one, two, three] = project.scenes;
		expect(one).toEqual({
			patterns: Array(16).fill(0),
			mutes: Array(16).fill(false),
			used: true
		});
		expect(two.patterns.slice(0, 4)).toEqual([0, 0, 1, 0]);
		expect(two.mutes.slice(0, 2)).toEqual([true, false]);
		expect(two.used).toBe(true);
		expect(three.used).toBe(false);
		expect(project.songs.slice(0, 3)).toEqual([
			{ scenes: [0, 1, 0], loop: true },
			{ scenes: [1], loop: false },
			{ scenes: [0], loop: true }
		]);
	});

	it('lists what the file cannot take yet', () => {
		const { skipped } = simToXy(composed(), blank);
		expect(skipped).toEqual([
			'T3 pattern 1: quantisation is switched off, which has no known byte (50 kept)',
			'T3 pattern 1: 1 lock of lfo.amount (no known lock column)',
			"T3 pattern 3: track scale 3 has no known byte yet (1/2, 1, 2 and 16 do); the template's stays",
			'T3 pattern 3: the arpeggio player (players are not in the file map yet)'
		]);
	});

	it('names the sounds and mixes the file keeps from its template', () => {
		const s = defaultState();
		s.tracks[2].engine = 'wavetable';
		s.tracks[4].filter.cutoff = 12;
		s.tracks[5].mix.level = 50;
		s.areas.system.trackPresets[6] = 'strings/pointe';
		expect(simToXy(s, blank).skipped).toEqual([
			"T3 pattern 1: plays wavetable; the file keeps the template's prism (sounds are not written yet)",
			"T5: the changes to lead/gaussian's sound (sounds are not written yet)",
			"T6: mixer level 50 and pan 0 (volume and pan sit in each pattern's sound, not written yet)",
			"T7: preset strings/pointe; the file keeps the template's strings/draemy"
		]);
	});

	it('uses the step components and their order as the file has them', () => {
		expect(STEP_COMPONENTS.map((c) => c.kind)).toEqual([...XY_STEP_COMPONENTS]);
	});

	it('refuses a state the file cannot hold', () => {
		const s = defaultState();
		s.areas.arrange.songs[0] = { order: Array(97).fill(0), loop: true };
		expect(() => simToXy(s, blank)).toThrow(XyModelError);
	});

	it('compiles what the agent writes on the virtual OP-XY: a beat, a bass line, chords, a song', () => {
		const sim = new OpxySim({ now: () => 0 });
		const opxy = createVirtualOpxy({ sim });
		const hit = (step: number, note: number, velocity = 100, length = 1) => ({
			step,
			note,
			velocity,
			length
		});
		opxy.setTempo(92);
		opxy.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [1, 5, 9, 13].map((s) => hit(s, 53, 120)).concat([5, 13].map((s) => hit(s, 55, 96)))
		});
		opxy.writePattern(3, {
			pattern: 1,
			bars: 2,
			notes: [hit(1, 36, 100, 4), hit(9, 43, 90, 2), hit(17, 41, 100, 8), hit(25, 43, 100, 0.5)]
		});
		opxy.writePattern(3, { pattern: 2, bars: 1, length: 12, notes: [hit(1, 38, 100, 12)] });
		opxy.writePattern(7, {
			pattern: 1,
			bars: 4,
			notes: [60, 64, 67]
				.map((n) => hit(1, n, 70, 32))
				.concat([57, 60, 64].map((n) => hit(33, n, 70, 32)))
		});
		opxy.writeArrangement({
			scenes: [
				{ scene: 1, patterns: [1, 3, 7].map((track) => ({ track, pattern: 1 })) },
				{
					scene: 2,
					patterns: [
						{ track: 1, pattern: 1 },
						{ track: 3, pattern: 2 },
						{ track: 7, pattern: 1 }
					]
				}
			],
			song: { order: [1, 1, 2, 1], loop: true }
		});
		const { bytes, skipped } = simToXy(sim.state, blank);
		expect(skipped).toEqual([]);
		const project = readProject(bytes);
		expect(project.settings.tempo).toBe(92);
		for (const [track, pattern] of [
			[1, 1],
			[3, 1],
			[3, 2],
			[7, 1]
		]) {
			const wrote = opxy.readPattern(track, pattern);
			const filed = project.tracks[track - 1].patterns[pattern - 1];
			expect(filed.steps).toBe(wrote.length);
			const notes = (list: { tick: number; note: number; velocity: number; gate: number }[]) =>
				list.map((n) => `${n.tick} ${n.note} ${n.velocity} ${n.gate}`).sort();
			expect(notes(filed.notes)).toEqual(
				notes(
					wrote.notes.map((n) => ({
						tick: (n.step - 1) * 480,
						note: n.note,
						velocity: n.velocity,
						gate: n.length * 480
					}))
				)
			);
		}
		expect(project.tracks[2].patterns).toHaveLength(2);
		expect(project.scenes[0]).toMatchObject({ used: true });
		expect(project.scenes[1].patterns.slice(0, 3)).toEqual([0, 0, 1]);
		expect(project.scenes[1].used).toBe(true);
		expect(project.songs[0]).toEqual({ scenes: [0, 0, 1, 0], loop: true });
	});
});

/** What a pattern holds that the file carries, for comparing a round trip. */
function filed(p: Pattern) {
	return {
		length: p.length,
		scale: p.scale,
		noteLength: p.noteLength,
		groove: p.groove,
		smoothing: p.smoothing,
		steps: p.steps.map((step) => ({
			notes: step.notes.map((n) => ({
				note: n.note,
				velocity: n.velocity,
				length: n.length,
				offset: n.offset
			})),
			components: step.components,
			// the file keeps 0–32767: a lock reads back within a hundredth
			locks: Object.fromEntries(
				Object.entries(step.locks).map(([id, value]) => [id, Math.round(value * 100) / 100])
			)
		}))
	};
}

describe('xyToSim', () => {
	it('loads a blank project as the device makes a new one: its presets, octaves and mix', () => {
		const { state, skipped } = xyToSim(blank);
		const fresh = defaultState();
		expect(skipped).toEqual([]);
		expect(state.tracks.map((t) => t.engine)).toEqual(fresh.tracks.map((t) => t.engine));
		expect(state.areas.system.trackPresets).toEqual(fresh.areas.system.trackPresets);
		expect(state.areas.sequencer.octaves).toEqual(fresh.areas.sequencer.octaves);
		expect(state.tracks.map((t) => t.mix)).toEqual(fresh.tracks.map((t) => t.mix));
		expect(state.tempo.bpm).toBe(fresh.tempo.bpm);
		// a new device project has the metronome on (0xA8)
		expect(state.tempo.metronome.on).toBe(true);
	});

	it('reads back what simToXy wrote: settings, patterns, scenes and songs', () => {
		const s = composed();
		const { bytes } = simToXy(s, blank);
		const { state, skipped } = xyToSim(bytes);
		expect(state.tempo).toMatchObject({ bpm: 97.5, groove: 3, swing: 50 });
		expect(state.tempo.metronome).toEqual({ level: 99, on: true });
		const settings = state.areas.system.projectSettings;
		expect(settings).toMatchObject({ transpose: 5, sceneLength: 1, signature: 3 });
		expect(settings.voices[1]).toBe(4);
		expect(settings.channels[0]).toBe(1);
		expect(settings.channels[15]).toBe(16);
		expect(state.areas.sequencer.octaves['instrument.2']).toBe(-2);
		expect(state.areas.sequencer.octaves['auxiliary.0']).toBe(1);
		for (const t of [0, 2]) {
			const wrote = s.tracks[t].sequence.patterns;
			const read = state.tracks[t].sequence.patterns;
			expect(read).toHaveLength(wrote.length);
			// the file keeps no quantise switch and no players
			read.forEach((p, i) => {
				const expected = filed(wrote[i]);
				// the LFO amount has no lock column yet (simToXy lists it as skipped)
				for (const step of expected.steps) delete step.locks['lfo.amount'];
				// scale 3 has no byte yet: it comes back as 1
				if (wrote[i].scale === 3) expected.scale = 1;
				expect(filed(p)).toEqual(expected);
			});
		}
		expect(filed(state.aux[2].sequence.patterns[0])).toEqual(filed(s.aux[2].sequence.patterns[0]));
		expect(state.areas.arrange.songs.slice(0, 2)).toEqual([
			{ order: [0, 1, 0], loop: true },
			{ order: [1], loop: false }
		]);
		expect(state.areas.arrange.scenes[1]?.patterns[2]).toBe(1);
		expect(state.areas.arrange.scenes[1]?.mix[0].muted).toBe(true);
		expect(state.areas.arrange.scenes[2]).toBeNull();
		expect(skipped.some((line) => line.includes('track scale byte'))).toBe(false);
		// and the loaded project writes the same file again
		expect(simToXy(state, bytes).bytes).toEqual(bytes);
	});

	it('reads the locks the file keeps into the steps', () => {
		const project = readProject(fixture('locks.xy'));
		const { state } = xyToSim(project);
		for (const [t, track] of project.tracks.entries()) {
			const sequence = t < 8 ? state.tracks[t].sequence : state.aux[t - 8].sequence;
			track.patterns.forEach((p, i) => {
				const read = sequence.patterns[i].steps.reduce(
					(n, step) => n + Object.keys(step.locks).length,
					0
				);
				expect(read).toBeLessThanOrEqual(p.locks.length);
			});
		}
		// what the replica cannot show stays in the file: loaded and written again, it is the same
		expect(simToXy(state, fixture('locks.xy')).bytes).toEqual(fixture('locks.xy'));
		const locked = state.tracks.flatMap((t) =>
			t.sequence.patterns.flatMap((p) => p.steps.flatMap((step) => Object.keys(step.locks)))
		);
		expect(locked.length).toBeGreaterThan(0);
	});

	it('names what it cannot take', () => {
		const project = readProject(blank);
		const odd = structuredClone(project);
		odd.tracks[2].patterns[0].scale = 0x07;
		odd.tracks[2].patterns[0].locks.push({ step: 3, column: 40, value: 1000 });
		odd.tracks[2].patterns[0].notes.push({
			tick: 64 * 480,
			gate: 240,
			note: 60,
			velocity: 100,
			flags: 0
		});
		const { skipped } = xyToSim(odd);
		expect(skipped).toEqual([
			'T3 pattern 1: track scale byte 0x07 is not decoded yet (1 kept)',
			'T3 pattern 1: 1 note(s) before the first step or past the last',
			'T3 pattern 1: 1 lock(s) in column 40, which the replica does not show (kept in the file)'
		]);
	});
});

const OWNER_BLANK = fileURLToPath(
	new URL('../../../research/device/captures/mtp/projects__workspace.xy', import.meta.url)
);

describe.skipIf(!existsSync(OWNER_BLANK))(
	'simToXy over the owner’s 1.1.33 blank (local only)',
	() => {
		it('writes an untouched project with the metronome on as the device saved it', () => {
			const template = new Uint8Array(readFileSync(OWNER_BLANK));
			const state = defaultState();
			state.tempo.metronome.on = true;
			const { bytes, skipped } = simToXy(state, template);
			expect(skipped).toEqual([]);
			expect(bytes).toEqual(template);
		});

		it('loads the owner’s project and writes it back byte for byte', () => {
			const file = new Uint8Array(readFileSync(OWNER_BLANK));
			const { state } = xyToSim(file);
			expect(simToXy(state, file).bytes).toEqual(file);
		});
	}
);
