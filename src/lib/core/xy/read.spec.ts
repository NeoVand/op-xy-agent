import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { concat } from './bytes';
import { decodeXy, encodeXy } from './container';
import { XyFormatError } from './errors';
import { PATTERN, laneCounts, walkProject } from './layout';
import { withSamples } from '../../../../test/fakes/xy-samples';
import {
	LOOP_BITS,
	REGION_END,
	XY_EFFECTS,
	XY_ENGINES,
	XY_FILTERS,
	XY_LFOS,
	XY_STEP_COMPONENTS,
	playModeOf,
	sampleHome,
	type XyPattern
} from './model';
import { readProject } from './read';
import { writeProject } from './write';
import expected from './fixtures/expected.json';

const fixture = (name: string) =>
	new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

/** What kmorrill/xy-format reads in a pattern (scripts/xy-fixtures.py read_pattern). */
interface PythonPattern {
	steps: number;
	noteLength: number;
	scale: number;
	quantize: number;
	groove: number;
	smoothing: number;
	pristine: number;
	engine: number;
	preset: string;
	notes: number[][];
	components: number[][];
	locks: number[][];
	union: string;
	lanes: number[];
}

/** Our pattern in the shape of the library's reading. */
function asPython(p: XyPattern): Omit<PythonPattern, 'union'> {
	return {
		steps: p.steps,
		noteLength: p.noteLength,
		scale: p.scale,
		quantize: p.quantize,
		groove: p.groove,
		smoothing: p.smoothing,
		pristine: p.pristine,
		engine: p.sound.engine,
		preset: p.sound.preset,
		notes: p.notes.map((n) => [n.tick, n.gate, n.note, n.velocity, n.flags]),
		components: p.components.map((c) => [c.step, XY_STEP_COMPONENTS.indexOf(c.kind), c.value]),
		locks: p.locks.map((l) => [l.step, l.column, l.value]),
		lanes: laneCounts(p.lanes)
	};
}

describe('readProject agrees with kmorrill/xy-format on every fixture', () => {
	for (const [name, want] of Object.entries(expected)) {
		describe(name, () => {
			const file = fixture(name);
			const project = readProject(file);

			it('header and image', () => {
				const { image } = decodeXy(file);
				expect(Buffer.from(project.header).toString('hex')).toBe(want.header);
				expect(image.length).toBe(want.imageSize);
			});

			it('settings', () => {
				const s = want.settings;
				expect(project.settings).toEqual({
					tempo: s.tempoTenths / 10,
					grooveAmount: s.grooveAmount,
					grooveType: s.grooveType,
					clickVolume: s.clickVolume,
					activeScene: s.activeScene,
					activeSong: s.activeSongRaw === 0x10 ? 0 : s.activeSongRaw,
					sceneLength: s.sceneLength,
					transpose: s.transpose,
					timeSignature: s.timeSignature,
					octaves: s.octaves,
					voices: s.voices,
					midiChannels: s.midiChannels
				});
			});

			it('scenes', () => {
				const rows = new Map(want.scenes.map(([slot, ...row]) => [slot as number, row]));
				project.scenes.forEach((scene, slot) => {
					const row = rows.get(slot) as [number[], number[], number] | undefined;
					expect(scene, `slot ${slot}`).toEqual({
						patterns: row ? row[0] : Array(16).fill(0),
						mutes: row ? row[1].map((m) => m !== 0) : Array(16).fill(false),
						used: row ? row[2] !== 0 : false
					});
				});
			});

			it('songs', () => {
				expect(project.songs.map((s) => [s.scenes, s.loop])).toEqual(want.songs);
			});

			it('tracks, patterns, notes, components and locks', () => {
				const tracks = want.tracks as PythonPattern[][];
				const { header, image } = decodeXy(file);
				const layout = walkProject(header, image);
				expect(project.tracks.map((t) => t.patterns.length)).toEqual(tracks.map((t) => t.length));
				project.tracks.forEach((track, t) =>
					track.patterns.forEach((pattern, p) => {
						const at = layout.tracks[t][p].base + PATTERN.lockUnion;
						const union = Buffer.from(image.subarray(at, at + 8)).toString('hex');
						expect({ ...asPython(pattern), union }, `T${t + 1} pattern ${p + 1}`).toEqual(
							tracks[t][p]
						);
					})
				);
			});
		});
	}
});

describe('readProject', () => {
	it('reads the blank project the device saved on OS 1.1.4', () => {
		const project = readProject(fixture('blank-1.1.4.xy'));
		expect(project.settings).toMatchObject({
			tempo: 120,
			grooveType: 0,
			clickVolume: 0xa8,
			activeSong: 0,
			timeSignature: 0x11,
			octaves: [0, 0, -1, 1, 0, -1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0],
			midiChannels: Array(16).fill(null)
		});
		expect(project.tracks.map((t) => XY_ENGINES[t.patterns[0].sound.engine] ?? null)).toEqual([
			'drum',
			'drum',
			'prism',
			'epiano',
			'dissolve',
			'hardsync',
			'axis',
			'multisampler',
			'prism',
			'prism',
			'prism',
			'prism',
			'prism',
			'prism',
			null,
			null
		]);
		expect(project.tracks[0].patterns[0].sound.preset).toBe('drum/boop');
		expect(project.tracks[0].patterns[0]).toMatchObject({
			steps: 16,
			noteLength: 240,
			scale: 0x03,
			quantize: 0xff,
			pristine: 8,
			notes: [],
			lanes: new Uint8Array(3)
		});
		expect(project.tracks[0].patterns[0].sound.volume).toBe(0x60000000);
		expect(project.songs).toEqual(Array(14).fill({ scenes: [0], loop: true }));
	});

	it('reads each sound’s settings as knowledge/presets/new-project.json holds a new project’s', () => {
		const stored = JSON.parse(
			readFileSync(
				new URL('../../../../knowledge/presets/new-project.json', import.meta.url),
				'utf8'
			)
		) as {
			tracks: Record<string, unknown>[];
			effects: Record<'fx1' | 'fx2', { type: string; params: number[] }>;
		};
		const project = readProject(fixture('blank-1.1.4.xy'));
		stored.tracks.forEach((want, t) => {
			const { state } = project.tracks[t].patterns[0].sound;
			expect({
				params: state.params.slice(0, 4),
				amp: state.amp,
				filterEnv: state.filterEnv,
				playMode: playModeOf(state.playMode),
				portamento: state.portamento,
				bend: state.bend,
				volume: state.volume,
				filter: { ...state.filter, type: XY_FILTERS[state.filter.type] },
				sends: state.sends,
				lfo: { ...state.lfo, type: XY_LFOS[state.lfo.type] },
				velocity: state.velocity,
				width: state.width,
				highpass: state.highpass,
				tuning: state.tuning,
				modulation: state.modulation,
				mix: state.mix
			}).toEqual({
				params: want.params,
				amp: want.amp,
				filterEnv: want.filterEnv,
				playMode: want.playMode,
				portamento: want.portamento,
				bend: want.bend,
				volume: want.volume,
				filter: want.filter,
				sends: want.sends,
				lfo: want.lfo,
				velocity: want.velocity,
				width: want.width,
				highpass: want.highpass,
				tuning: want.tuning,
				modulation: want.modulation,
				mix: want.mix
			});
		});
		// FX I and FX II: the effect in the engine byte, its M1 in the first four parameter words
		const effect = (t: number) => {
			const { engine, state } = project.tracks[t].patterns[0].sound;
			return { type: XY_EFFECTS[engine], params: state.params.slice(0, 4) };
		};
		expect([effect(14), effect(15)]).toEqual([stored.effects.fx1, stored.effects.fx2]);
	});

	it('reads any non-zero mute byte as muted (probe 06: 1, 2 and 3 all mute on the device)', () => {
		const scene = readProject(fixture('06_f_mute_enum.xy')).scenes[1];
		expect(scene.mutes.slice(0, 4)).toEqual([true, true, true, false]);
		expect(scene.used).toBe(true);
	});

	it('keeps the note flags as stored (probe 07)', () => {
		const notes = readProject(fixture('07_g_note_flags.xy')).tracks[2].patterns[0].notes;
		expect(notes.map((n) => n.flags)).toEqual([0, 1, 256, 127]);
	});

	it('reads locks on column 0 (mask bit 41), armed zeros and clones', () => {
		const project = readProject(fixture('locks.xy'));
		expect(project.tracks[1].patterns[0].locks).toEqual([
			{ step: 0, column: 0, value: 0x7fff },
			{ step: 1, column: 41, value: 0 },
			{ step: 4, column: 17, value: 20000 },
			{ step: 5, column: 36, value: 0x1234 }
		]);
		expect(project.tracks[3].patterns[1].locks).toEqual([
			{ step: 11, column: 22, value: 0x100 },
			{ step: 15, column: 3, value: 0x4000 }
		]);
	});

	it('refuses layout families whose global header is not mapped', () => {
		const { header, image } = decodeXy(fixture('blank-1.1.4.xy'));
		// family 0x10 starts Track 1 16 bytes earlier: the file walks, its settings are unknown
		const older = header.slice();
		older[5] = 0x10;
		const file = encodeXy(older, concat([image.subarray(0, 3433), image.subarray(3449)]));
		expect(() => readProject(file)).toThrow(XyFormatError);
		expect(() => readProject(file)).toThrow(/only its track base is known/);
	});
});

describe('sample regions (§3.5 ★)', () => {
	it('reads the blank project’s kits and pad: path, key, root, length and mode per region', () => {
		const project = readProject(fixture('blank-1.1.4.xy'));
		const kit = project.tracks[0].patterns[0].sound.samples;
		expect(kit.map((r) => r.index)).toEqual(Array.from({ length: 24 }, (_, i) => i));
		// a factory kit's keys play F3…E5
		expect(kit.map((r) => r.key)).toEqual(Array.from({ length: 24 }, (_, i) => 53 + i));
		expect(kit[0]).toMatchObject({
			path: 'content/samples/kick/kick boop a.wav',
			frames: 7469,
			start: 0,
			end: REGION_END,
			root: 60,
			mode: 1,
			gain: 0,
			reverse: false
		});
		// the closed hats choke each other (group), trimmed
		expect(kit[8]).toMatchObject({
			path: 'content/samples/hihat/ch boop a.wav',
			mode: 2,
			gain: -13
		});
		const pad = project.tracks[7].patterns[0].sound.samples;
		expect(pad.map((r) => [r.key, r.root])).toEqual([
			[60, 60],
			[72, 72],
			[84, 84],
			[96, 96],
			[108, 108]
		]);
		expect(pad[0]).toMatchObject({
			path: 'content/samples/bandpasser/1.wav',
			frames: 248655,
			mode: LOOP_BITS.forever
		});
		// synth engines name no samples
		expect(project.tracks[2].patterns[0].sound.samples).toEqual([]);
		expect(sampleHome(kit[0].path)).toBe('factory');
	});

	it('reads the paths a device writes (UTF-8 names too) and skips empty regions', () => {
		const file = withSamples(fixture('blank-1.1.4.xy'), [
			{
				t: 0,
				clear: true,
				regions: {
					2: { path: '/fat32/presets/drum/nt-aeroplane.preset/241204-1 2-c3-18.wav', key: 55 },
					5: { path: '/fat32/samples/user/prise d’été.wav', key: 58, frames: 88200, gain: -9 }
				}
			}
		]);
		const kit = readProject(file).tracks[0].patterns[0].sound.samples;
		expect(kit.map((r) => [r.index, r.key, r.path])).toEqual([
			[2, 55, '/fat32/presets/drum/nt-aeroplane.preset/241204-1 2-c3-18.wav'],
			[5, 58, '/fat32/samples/user/prise d’été.wav']
		]);
		expect(kit[1]).toMatchObject({ frames: 88200, gain: -9 });
		expect(kit.map((r) => sampleHome(r.path))).toEqual(['drive', 'drive']);
		expect(sampleHome('samples/elsewhere.wav')).toBe('unknown');
		// read-only: the writer keeps the regions as the template holds them
		expect(writeProject(readProject(file), file)).toEqual(file);
	});
});
