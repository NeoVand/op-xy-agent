import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import { playPattern, selectScene } from '$lib/sim/areas/arrange/model';
import { fromQ15 } from '$lib/sim/defaults';
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
import { setU32 } from '$lib/core/xy/bytes';
import { decodeXy, encodeXy } from '$lib/core/xy/container';
import { XyModelError } from '$lib/core/xy/errors';
import { PATTERN, SOUND, walkProject } from '$lib/core/xy/layout';
import { XY_STEP_COMPONENTS } from '$lib/core/xy/model';
import { readProject } from '$lib/core/xy/read';
import { writeProject } from '$lib/core/xy/write';
import { withSamples } from '../../../test/fakes/xy-samples';
import { KIT, kitFiles, projectSampleFile } from './areas/sample/state';
import { simToXy, xyToSim } from './xy';

const fixture = (name: string) =>
	new Uint8Array(readFileSync(new URL(`../core/xy/fixtures/${name}`, import.meta.url)));
const blank = fixture('blank-1.1.4.xy');

/** An edit to a pattern's bytes: a Q31 word, or bytes, at an offset from the pattern's base. */
interface Edit {
	t: number;
	p?: number;
	offset: number;
	word?: number;
	bytes?: number[];
}

/** `file` with its image edited. */
function patched(file: Uint8Array, edits: readonly Edit[]): Uint8Array {
	const { header, image } = decodeXy(file);
	const edited = image.slice();
	const layout = walkProject(header, edited);
	for (const edit of edits) {
		const at = layout.tracks[edit.t][edit.p ?? 0].base + edit.offset;
		if (edit.word !== undefined) setU32(edited, at, edit.word);
		else edited.set(edit.bytes ?? [], at);
	}
	return encodeXy(header, edited);
}

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
	it('writes a new project as its template; a metronome switched off writes 0', () => {
		const { bytes, skipped } = simToXy(defaultState(), blank);
		expect(skipped).toEqual([]);
		expect(bytes).toEqual(blank);
		const off = defaultState();
		off.tempo.metronome.on = false;
		const quiet = simToXy(off, blank).bytes;
		expect(differences(quiet, blank)).toEqual([0x04]);
		expect(readProject(quiet).settings.clickVolume).toBe(0);
	});

	it('keeps what a 1.1.33 template holds for an untouched project', () => {
		// the owner's blank project: family 0x14, T1 an octave down, scene 1 flagged (note 10 §8)
		const { header, image } = decodeXy(blank);
		const newer = Uint8Array.of(...header.subarray(0, 5), 0x14, 0x07, 0x86);
		const edited = image.slice();
		edited[0x3d] = 0xff;
		edited[0x95 + 32] = 1;
		const template = encodeXy(newer, edited);
		const { bytes, skipped } = simToXy(defaultState(), template);
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

	it('keeps a portamento lock on its 0–127 lane, as its card reads (OS 1.1.33)', () => {
		const s = defaultState();
		const p = s.tracks[2].sequence.patterns[0];
		toggleStep(p, 0, [36]);
		setLock(p, 0, 'playMode.portamento', 127);
		setLock(p, 1, 'playMode.portamento', 2);
		setLock(p, 1, 'filter.cutoff', 99);
		const { bytes, project } = simToXy(s, blank);
		expect(project.tracks[2].patterns[0].locks).toEqual([
			{ step: 0, column: 14, value: 32767 },
			{ step: 1, column: 14, value: Math.round((2 / 127) * 32767) },
			{ step: 1, column: 17, value: 32767 }
		]);
		// the file keeps 0–32767: a lock reads back within a hundredth
		const back = xyToSim(bytes).state.tracks[2].sequence.patterns[0].steps;
		expect(back[0].locks['playMode.portamento']).toBeCloseTo(127, 2);
		expect(back[1].locks['playMode.portamento']).toBeCloseTo(2, 2);
		expect(back[1].locks['filter.cutoff']).toBeCloseTo(99, 2);
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

	it('reads a time signature in both forms, keeps the form it read, and keeps untouched songs empty', () => {
		const project = readProject(blank);
		const bare = structuredClone(project);
		bare.settings.timeSignature = 0x01;
		bare.songs[13] = { scenes: [], loop: true };
		const bytes = writeProject(bare, blank);
		const { state } = xyToSim(bytes);
		expect(state.areas.system.projectSettings.signature).toBe(1); // 4/4
		expect(simToXy(state, bytes).bytes).toEqual(bytes);
		state.areas.system.projectSettings.signature = 3; // 6/8
		expect(readProject(simToXy(state, bytes).bytes).settings.timeSignature).toBe(0x13);
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

describe('xyToSim: the sounds a project stores', () => {
	it('plays each track’s stored settings over its preset, and saves back untouched', () => {
		const file = patched(blank, [
			{ t: 2, offset: SOUND.params, word: 0x7fff0000 },
			{ t: 2, offset: SOUND.amp, word: 0x20000000 },
			{ t: 2, offset: SOUND.filter, word: 0x40000000 },
			{ t: 2, offset: SOUND.filterType, bytes: [0x10] },
			{ t: 2, offset: SOUND.lfoType, bytes: [0x02] },
			{ t: 2, offset: SOUND.lfoOn, bytes: [1] }
		]);
		const { state, skipped } = xyToSim(file);
		expect(skipped).toEqual([]);
		const t3 = state.tracks[2];
		expect(t3.engine).toBe('prism');
		expect(state.areas.system.trackPresets[2]).toBe('bass/shoulder');
		expect(t3.m1[0]).toBe(99);
		expect(t3.amp.attack).toBeCloseTo(fromQ15(0x2000), 9);
		expect(t3.filter).toMatchObject({ type: 'ladder', on: true });
		expect(t3.filter.cutoff).toBeCloseTo(fromQ15(0x4000), 9);
		expect(t3.lfo).toMatchObject({ type: 'random', on: true });
		// the file already holds these settings: saved over it, nothing is noted and nothing changes
		const saved = simToXy(state, file);
		expect(saved.skipped).toEqual([]);
		expect(saved.bytes).toEqual(file);
		// a setting changed in the replica is noted, since sounds are not written yet
		t3.filter.cutoff = 10;
		expect(simToXy(state, file).skipped).toEqual([
			"T3: the changes to bass/shoulder's sound (sounds are not written yet)"
		]);
	});

	it('keeps each pattern’s own sound for when that pattern plays', () => {
		// locks.xy's scene plays T4's second pattern: the first one's sound waits in its slot
		const file = patched(fixture('locks.xy'), [
			{ t: 3, p: 0, offset: SOUND.amp, word: 0x7fff0000 }
		]);
		const { state } = xyToSim(file);
		expect(state.tracks[3].sequence.current).toBe(1);
		expect(state.tracks[3].amp.attack).not.toBe(99);
		expect(state.areas.arrange.sounds[3][0]?.amp.attack).toBe(99);
		playPattern(state, 3, 0);
		expect(state.tracks[3].amp.attack).toBe(99);
	});

	it('loads FX I and FX II: the effect each runs and its four settings', () => {
		const file = patched(blank, [
			{ t: 14, offset: PATTERN.engine, bytes: [0x0c] },
			{ t: 14, offset: SOUND.params, word: 0x7fff0000 }
		]);
		const { state } = xyToSim(file);
		const [fx1, fx2] = state.areas.auxiliary.fx;
		expect(fx1.type).toBe('chorus');
		expect(fx1.params[0]).toBe(99);
		expect(fx2.type).toBe('reverb');
		expect(fx2).toEqual(defaultState().areas.auxiliary.fx[1]);
	});

	it('names what the settings cannot carry: an unknown filter or LFO type, TE’s samples', () => {
		const path = [...'drum/other kit'].map((c) => c.charCodeAt(0));
		const file = patched(blank, [
			{ t: 0, offset: PATTERN.presetPath, bytes: [...path, 0] },
			{ t: 2, offset: SOUND.filterType, bytes: [0x33] },
			{ t: 2, offset: SOUND.lfoType, bytes: [0x09] },
			{ t: 14, offset: PATTERN.engine, bytes: [0x3f] }
		]);
		const { state, skipped } = xyToSim(file);
		expect(skipped).toEqual([
			"T1: drum/other kit's samples are TE's and not in the replica, so its own kit plays",
			'T3: filter type byte 0x33 is not one we know (svf plays)',
			'T3: LFO type byte 0x09 is not one we know (tremolo plays)',
			'T15: effect byte 0x3f is not one we know (delay kept)'
		]);
		expect(state.tracks[2].filter.type).toBe('svf');
	});
});

describe('xyToSim: the samples a project names', () => {
	const KICK = '/fat32/presets/drum/test.preset/kick.wav';
	const TAKE = '/fat32/samples/user/take 1.wav';
	const SNARE = 'content/samples/snare/snare boop a.wav';

	it('puts a kit’s samples on the keys its key bytes name, each file’s path its id', () => {
		const file = withSamples(blank, [
			{
				t: 0,
				preset: 'drum/test',
				clear: true,
				regions: {
					0: { path: KICK, key: 53, frames: 22050 },
					1: { path: TAKE, key: 55, frames: 0 },
					2: { path: SNARE, key: 54 },
					// a key byte off the keyboard: the region keeps its own place
					3: { path: KICK, key: 90 }
				}
			}
		]);
		const { state, skipped } = xyToSim(file);
		const keys = state.areas.sample.tracks[0].keys;
		expect(keys[0]).toEqual(projectSampleFile(KICK, 0.5));
		expect(keys[0]).toMatchObject({ id: KICK, name: 'kick.wav', path: KICK });
		// not measured by the device yet: the kit layout's length stands in
		expect(keys[2]).toMatchObject({ id: TAKE, name: 'take 1.wav', seconds: KIT[2][1] });
		expect(keys[1]?.path).toBe(SNARE);
		expect(keys[3]?.id).toBe(KICK);
		// the kit names no other keys: they are empty, as on the device
		expect(keys.slice(4).every((k) => k === null)).toBe(true);
		// the unit's own samples are nothing to excuse; their audio comes over usb
		expect(skipped).toEqual([]);
		expect(state.areas.system.trackPresets[0]).toBe('drum/test');
	});

	it('reads the sampler’s sample and the zones with their points, loop, root and tune', () => {
		const file = withSamples(blank, [
			{
				t: 3,
				engine: 0x02,
				preset: 'keys/test',
				clear: true,
				regions: {
					0: {
						path: '/fat32/samples/user/keys c3.wav',
						frames: 88200,
						start: 441,
						end: 88199,
						loopStart: 22050,
						loopEnd: 66150,
						crossfade: 0x30000000,
						root: 48,
						key: 60,
						mode: 0x80,
						fine: 25,
						gain: -6,
						reverse: true
					}
				}
			},
			{
				t: 7,
				preset: 'pad/test',
				clear: true,
				regions: {
					// device-made: the zone's top key is the note it was sampled on
					0: { path: '/fat32/presets/pad/test.preset/c4.wav', key: 60, root: 60, frames: 44100 },
					// a tool-made zone with its root below its top key
					1: {
						path: '/fat32/presets/pad/test.preset/e4.wav',
						key: 66,
						root: 64,
						frames: 44100,
						loopEnd: 0xffffffff,
						mode: 0x40
					},
					// points that would leave nothing to play: the whole sample plays
					2: {
						path: '/fat32/presets/pad/test.preset/g4.wav',
						key: 72,
						root: 72,
						frames: 44100,
						start: 30000,
						end: 100
					}
				}
			}
		]);
		const { state } = xyToSim(file);
		expect(state.tracks[3].engine).toBe('sampler');
		const synth = state.areas.sample.tracks[3].synth;
		expect(synth.file).toMatchObject({
			id: '/fat32/samples/user/keys c3.wav',
			seconds: 2,
			root: 48
		});
		expect(synth.root).toBe(48);
		expect(synth.region).toEqual({
			start: 441 / 88200,
			loopStart: 0.25,
			loopEnd: 0.75,
			end: 1,
			loop: 'forever',
			crossfade: 38,
			tune: 0.25,
			gain: -6,
			reverse: true
		});
		const zones = state.areas.sample.tracks[7].zones;
		expect(zones.map((z) => [z.note, z.file.name, z.region.tune])).toEqual([
			[60, 'c4.wav', 0],
			[66, 'e4.wav', 2],
			[72, 'g4.wav', 0]
		]);
		expect(zones[1].region).toMatchObject({ loop: 'off', loopEnd: 1, end: 1 });
		expect(zones[2].region).toMatchObject({ start: 0, end: 1 });
	});

	it('replaces the samples an earlier project left, and notes a pattern naming others', () => {
		const base = defaultState();
		// an earlier project's kit on T3, which the new file runs a synth on
		base.areas.sample.tracks[2].keys[0] = projectSampleFile(KICK, 1);
		const file = withSamples(blank, [
			{ t: 0, p: 0, preset: 'drum/test', regions: { 0: { path: KICK, key: 53 } } }
		]);
		const { state } = xyToSim(file, base);
		expect(state.areas.sample.tracks[2].keys).toEqual(kitFiles(2));
		expect(state.areas.sample.tracks[0].keys[0]?.path).toBe(KICK);
		// a second pattern on T1 with another kit: the replica keeps the playing pattern's
		const project = readProject(file);
		const second = structuredClone(project.tracks[0].patterns[0]);
		project.tracks[0].patterns.push({
			...second,
			sound: { ...second.sound, samples: second.sound.samples.slice(1) }
		});
		const { state: two, skipped } = xyToSim(project);
		expect(two.areas.sample.tracks[0].keys[0]?.path).toBe(KICK);
		expect(skipped).toContain(
			"T1 pattern 2: its own samples (the replica keeps one set per engine, pattern 1's)"
		);
	});
});

/** TE's factory project "agent", read off the owner's unit on 2026-09-28: 4/4 stored as 1, untouched
 * songs empty (local only). */
const OWNER_PROJECT = fileURLToPath(
	new URL(
		'../../../research/device/captures/mtp/projects__workspace-2026-09-28.xy',
		import.meta.url
	)
);

const OWNER_BLANK = fileURLToPath(
	new URL('../../../research/device/captures/mtp/projects__workspace.xy', import.meta.url)
);

describe.skipIf(!existsSync(OWNER_BLANK))(
	'simToXy over the owner’s 1.1.33 blank (local only)',
	() => {
		it('writes an untouched project as the device saved it', () => {
			const template = new Uint8Array(readFileSync(OWNER_BLANK));
			const { bytes, skipped } = simToXy(defaultState(), template);
			expect(skipped).toEqual([]);
			expect(bytes).toEqual(template);
		});

		it('loads the owner’s project and writes it back byte for byte', () => {
			const file = new Uint8Array(readFileSync(OWNER_BLANK));
			const { state } = xyToSim(file);
			expect(simToXy(state, file).bytes).toEqual(file);
		});

		it.skipIf(!existsSync(OWNER_PROJECT))(
			'plays "agent"’s song on plain play as the unit did: its order, four bars an entry',
			() => {
				const { state } = xyToSim(new Uint8Array(readFileSync(OWNER_PROJECT)));
				const sim = new OpxySim({ now: () => 0 });
				sim.reset(state);
				sim.press('key.play'); // plain play, in instrument mode
				const stepMs = 60000 / sim.state.tempo.bpm / 4;
				const order: number[] = [];
				for (let entry = 0; entry < 17; entry++) {
					order.push(sim.state.areas.arrange.scene + 1);
					for (let i = 0; i < 64 * 5; i++) sim.advance(stepMs / 5);
				}
				// research/device/captures/song/full-song: the unit's lap, then back to the top
				expect(order).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 8, 9, 9, 7, 7, 6, 6, 1]);
			}
		);

		it.skipIf(!existsSync(OWNER_PROJECT))(
			'loads the project the owner had open (read over MTP from the browser) and writes it back byte for byte',
			() => {
				const file = new Uint8Array(readFileSync(OWNER_PROJECT));
				const { state } = xyToSim(file);
				expect(simToXy(state, file).bytes).toEqual(file);
			}
		);
	}
);
