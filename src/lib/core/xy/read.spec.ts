import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { concat } from './bytes';
import { decodeXy, encodeXy } from './container';
import { XyFormatError } from './errors';
import { PATTERN, laneCounts, walkProject } from './layout';
import { XY_ENGINES, XY_STEP_COMPONENTS, type XyPattern } from './model';
import { readProject } from './read';
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
