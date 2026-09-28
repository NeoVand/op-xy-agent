import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { concat, u16 } from './bytes';
import { decodeXy, encodeXy } from './container';
import { XyModelError } from './errors';
import { LOCK_ROW_SIZE, PATTERN, walkProject, type XyLayout } from './layout';
import { blankPattern, type XyProject } from './model';
import { readProject } from './read';
import { writeProject } from './write';

const fixture = (name: string) =>
	new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const blank = fixture('blank-1.1.4.xy');
const FIXTURES = [
	'blank-1.1.4.xy',
	'01_a_img_c4_step5.xy',
	'02_b_img_notevel_60_60.xy',
	'06_f_mute_enum.xy',
	'07_g_note_flags.xy',
	'song.xy',
	'locks.xy'
];

/** The template's model (the blank project's by default), edited by `edit`, written over it. */
function written(edit: (m: XyProject) => void, template: Uint8Array = blank): Uint8Array {
	const model = readProject(template);
	edit(model);
	return writeProject(model, template);
}

/** The decoded image and structure of a file. */
function open(file: Uint8Array): { image: Uint8Array; layout: XyLayout } {
	const { header, image } = decodeXy(file);
	return { image, layout: walkProject(header, image) };
}

describe('writeProject round trips', () => {
	it.each(FIXTURES)('gives %s back byte for byte when nothing changed', (name) => {
		const file = fixture(name);
		expect(writeProject(readProject(file), file)).toEqual(file);
	});

	it.each(['song.xy', 'locks.xy'])(
		'writes the model of %s over the blank template as the library wrote it',
		(name) => {
			// everything these files hold beyond the blank project is in the model, carries included
			expect(writeProject(readProject(fixture(name)), blank)).toEqual(fixture(name));
		}
	);

	it('carries a project to another template: the model comes back, the sounds are the template’s', () => {
		const song = readProject(fixture('song.xy'));
		const template = fixture('02_b_img_notevel_60_60.xy');
		const moved = readProject(writeProject(song, template));
		expect(moved.settings).toEqual(song.settings);
		expect(moved.scenes).toEqual(song.scenes);
		expect(moved.songs).toEqual(song.songs);
		moved.tracks.forEach((track, t) =>
			track.patterns.forEach((pattern, p) => {
				const { sound, ...rest } = pattern;
				const { sound: theirs, ...want } = song.tracks[t].patterns[p];
				expect(rest).toEqual(want);
				expect(sound.engine).toBe(theirs.engine);
			})
		);
	});

	it('leaves the input model alone', () => {
		const model = readProject(fixture('song.xy'));
		model.tracks[0].patterns[0].notes.reverse();
		const before = structuredClone(model);
		writeProject(model, blank);
		expect(model).toEqual(before);
	});
});

describe('writeProject patterns', () => {
	it('adds patterns as empty copies of the first one, sound and bar settings included', () => {
		const out = written((m) => {
			const first = m.tracks[4].patterns[0];
			first.steps = 32;
			first.pristine = 0;
			first.notes.push({ tick: 0, gate: 240, note: 60, velocity: 100, flags: 0 });
			m.tracks[4].patterns.push(blankPattern(first), blankPattern(first));
			m.scenes[0].patterns[4] = 2;
			m.scenes[0].used = true;
		});
		const project = readProject(out);
		const [p1, p2, p3] = project.tracks[4].patterns;
		expect(project.tracks[4].patterns).toHaveLength(3);
		expect(p1.pristine).toBe(0);
		expect(p2).toEqual(p3);
		expect(p2).toMatchObject({ steps: 32, notes: [], locks: [], components: [], pristine: 0 });
		expect(p2.sound).toEqual(p1.sound);
		const { image, layout } = open(out);
		// a clone is the leader's struct without the count byte
		const [leader, clone] = layout.tracks[4];
		expect(image[leader.base]).toBe(3);
		expect(clone.base).toBe(leader.end - 1);
		expect(clone.end - clone.base).toBe(17876);
	});

	it('empties a new pattern made from a first pattern that holds a sequence', () => {
		const template = fixture('song.xy');
		const out = written((m) => {
			const t3 = m.tracks[2];
			t3.patterns.push(blankPattern(t3.patterns[0]));
		}, template);
		const { image, layout } = open(out);
		const fresh = layout.tracks[2][2];
		expect(readProject(out).tracks[2].patterns[2]).toMatchObject({
			notes: [],
			locks: [],
			components: []
		});
		// the carry cell and current value of pattern 1's locks stay behind
		const cells = image.subarray(
			fresh.base + PATTERN.lockCurrent,
			fresh.base + PATTERN.lockValues + 64 * LOCK_ROW_SIZE
		);
		expect(cells.every((b) => b === 0)).toBe(true);
	});

	it('drops patterns past the model’s count and refuses scenes that still play them', () => {
		const song = fixture('song.xy');
		const model = readProject(song);
		model.tracks[0].patterns.pop();
		expect(() => writeProject(model, song)).toThrow(/scene 2's pattern on T1/);
		model.scenes[1].patterns[0] = 0;
		model.scenes[2].patterns[0] = 0;
		const project = readProject(writeProject(model, song));
		expect(project.tracks[0].patterns).toHaveLength(1);
		expect(project.tracks[2].patterns).toHaveLength(2);
	});

	it('writes notes in tick order, a chord in its own order', () => {
		const out = written((m) => {
			m.tracks[6].patterns[0].notes.push(
				{ tick: 960, gate: 240, note: 64, velocity: 90, flags: 0 },
				{ tick: 0, gate: 240, note: 67, velocity: 90, flags: 0 },
				{ tick: 0, gate: 240, note: 60, velocity: 90, flags: 0 },
				{ tick: -20, gate: 100, note: 55, velocity: 1, flags: 2 }
			);
		});
		expect(readProject(out).tracks[6].patterns[0].notes.map((n) => [n.tick, n.note])).toEqual([
			[-20, 55],
			[0, 67],
			[0, 60],
			[960, 64]
		]);
	});

	it('writes the pristine field as the model has it', () => {
		const out = written((m) => {
			m.tracks[0].patterns[0].quantize = 129;
			m.tracks[1].patterns[0].pristine = 0;
		});
		const { image, layout } = open(out);
		expect(u16(image, layout.tracks[0][0].base + PATTERN.pristine)).toBe(8);
		expect(u16(image, layout.tracks[1][0].base + PATTERN.pristine)).toBe(0);
		expect(image[layout.tracks[0][0].base + PATTERN.quantize]).toBe(129);
	});

	it('keeps and replaces performance lanes with the notes', () => {
		const lanes = Uint8Array.of(2, 0, 0, 0xff, 0x1f, 0xe0, 1, 0x22, 2, 0, 1, 7, 0, 9, 0);
		const withLanes = written((m) => {
			m.tracks[0].patterns[0].lanes = lanes;
		});
		const model = readProject(withLanes);
		expect(model.tracks[0].patterns[0].lanes).toEqual(lanes);
		expect(writeProject(model, withLanes)).toEqual(withLanes);
		model.tracks[0].patterns[0].lanes = new Uint8Array(3);
		expect(writeProject(model, withLanes)).toEqual(blank);
		model.tracks[0].patterns[0].lanes = Uint8Array.of(1, 0, 0);
		expect(() => writeProject(model, withLanes)).toThrow(/three performance lanes/);
	});
});

describe('writeProject locks and components', () => {
	const cell = (image: Uint8Array, base: number, step: number, column: number) =>
		u16(image, base + PATTERN.lockValues + step * LOCK_ROW_SIZE + column * 2);

	it('arms a lock, leaves the carry in the step before, and sets the union', () => {
		const out = written((m) => {
			m.tracks[2].patterns[0].locks.push({ step: 6, column: 17, value: 0x7000 });
		});
		const { image, layout } = open(out);
		const base = layout.tracks[2][0].base;
		expect(cell(image, base, 6, 17)).toBe(0x7000);
		expect(cell(image, base, 5, 17)).toBe(0x6fff);
		expect(u16(image, base + PATTERN.lockCurrent + 34)).toBe(0x7000);
		// cutoff is mask bit 16: byte 2 of the step's mask and of the union (upstream wrote 0x304E = 1)
		expect(image[base + PATTERN.lockMasks + 6 * 8 + 2]).toBe(1);
		expect(
			Array.from(image.subarray(base + PATTERN.lockUnion, base + PATTERN.lockUnion + 8))
		).toEqual([0, 0, 1, 0, 0, 0, 0, 0]);
	});

	it('removes and changes locks, keeping the union the OR of the masks', () => {
		const locks = fixture('locks.xy');
		const model = readProject(locks);
		const t2 = model.tracks[1].patterns[0];
		t2.locks = t2.locks
			.filter((l) => l.column !== 0)
			.map((l) => (l.column === 17 ? { ...l, value: 9 } : l));
		const out = writeProject(model, locks);
		expect(readProject(out).tracks[1].patterns[0].locks).toEqual([
			{ step: 1, column: 41, value: 0 },
			{ step: 4, column: 17, value: 9 },
			{ step: 5, column: 36, value: 0x1234 }
		]);
		const { image, layout } = open(out);
		const base = layout.tracks[1][0].base;
		expect(cell(image, base, 0, 0)).toBe(0);
		// bits 40 (pan) and 35 (filter env release) and 16 (cutoff); 41 (volume) is gone
		expect(
			Array.from(image.subarray(base + PATTERN.lockUnion, base + PATTERN.lockUnion + 8))
		).toEqual([0, 0, 1, 0, 0x08, 0x01, 0, 0]);
		model.tracks[1].patterns[0].locks.push({ step: 4, column: 17, value: 1 });
		expect(() => writeProject(model, locks)).toThrow(/two locks on column 17 of step 5/);
	});

	it('sets, changes and clears step components', () => {
		const song = fixture('song.xy');
		const model = readProject(song);
		const p2 = model.tracks[0].patterns[1];
		expect(p2.components).toEqual([
			{ step: 2, kind: 'pulse', value: 2 },
			{ step: 6, kind: 'skip step component', value: 3 },
			{ step: 7, kind: 'pulse hold', value: 5 },
			{ step: 7, kind: 'jump', value: 1 }
		]);
		p2.components = [
			{ step: 2, kind: 'pulse', value: 0 },
			{ step: 7, kind: 'jump', value: 1 },
			{ step: 63, kind: 'skip trigger', value: 9 }
		];
		const out = writeProject(model, song);
		expect(readProject(out).tracks[0].patterns[1].components).toEqual(p2.components);
		const { image, layout } = open(out);
		const row = (step: number) => layout.tracks[0][1].base + PATTERN.components + 16 * step;
		expect(image.subarray(row(6), row(6) + 16).every((b) => b === 0)).toBe(true);
		expect(u16(image, row(7))).toBe(1 << 10);
		p2.components.push({ step: 1, kind: 'bounce' as 'pulse', value: 1 });
		expect(() => writeProject(model, song)).toThrow(/unknown step component "bounce"/);
	});
});

describe('writeProject settings, scenes and songs', () => {
	it('writes the settings, keeping bytes whose meaning did not change', () => {
		const out = written((m) => {
			const s = m.settings;
			s.tempo = 87.5;
			s.grooveAmount = -40;
			s.octaves[2] = -2;
			s.voices[7] = 8;
			s.midiChannels[0] = 16;
			s.midiChannels[15] = 1;
		});
		const { image } = open(out);
		expect(u16(image, 0)).toBe(875);
		expect(image[0x02]).toBe(0xd8);
		expect(image[0x3d + 2]).toBe(0xfe);
		expect(image[0x4d + 7]).toBe(8);
		expect(image[0x55]).toBe(15);
		expect(image[0x64]).toBe(0);
		// song 1 was never chosen: 0x10 stays, though the model reads it as song 1 (0)
		expect(image[0x07]).toBe(0x10);
		const back = readProject(out);
		back.settings.midiChannels[0] = null;
		expect(open(writeProject(back, out)).image[0x55]).toBe(0xff);
	});

	it('writes scenes: patterns, mutes (as 2) and the flag', () => {
		const out = written((m) => {
			m.tracks[1].patterns.push(blankPattern(m.tracks[1].patterns[0]));
			m.scenes[3] = {
				patterns: m.scenes[3].patterns.map((_, t) => (t === 1 ? 1 : 0)),
				mutes: m.scenes[3].mutes.map((_, t) => t === 15),
				used: true
			};
			m.settings.activeScene = 3;
		});
		const { image } = open(out);
		const at = 0x95 + 3 * 33;
		expect(image[at + 1]).toBe(1);
		expect(image[at + 16 + 15]).toBe(2);
		expect(image[at + 32]).toBe(1);
		expect(image[0x06]).toBe(3);
	});

	it('keeps a mute byte the device wrote differently while it still mutes', () => {
		const probe = fixture('06_f_mute_enum.xy');
		const model = readProject(probe);
		model.scenes[1].mutes[3] = true;
		const { image } = open(writeProject(model, probe));
		expect(Array.from(image.subarray(0x95 + 33 + 16, 0x95 + 33 + 20))).toEqual([1, 2, 3, 2]);
	});

	it('rewrites song slots in place whatever their length', () => {
		const out = written((m) => {
			m.songs[0] = { scenes: [0, 1, 2, 1], loop: false };
			m.songs[13] = { scenes: [], loop: true };
		});
		const { image, layout } = open(out);
		expect(Array.from(image.subarray(layout.footer, layout.footer + 7))).toEqual([
			4, 0, 1, 2, 1, 1, 0
		]);
		expect(readProject(out).songs[13]).toEqual({ scenes: [], loop: true });
		expect(image.length).toBe(layout.footer + 7 + 12 * 4 + 3);
	});

	it.each([
		['a tempo off the device’s range', (m: XyProject) => (m.settings.tempo = 300), /tempo/],
		['a tempo finer than tenths', (m: XyProject) => (m.settings.tempo = 120.05), /tempo/],
		[
			'a 17th MIDI channel',
			(m: XyProject) => (m.settings.midiChannels[3] = 17),
			/T4's MIDI channel/
		],
		[
			'a 13th time signature',
			(m: XyProject) => (m.settings.timeSignature = 0x16),
			/time signature/
		],
		['a 65-step pattern', (m: XyProject) => (m.tracks[0].patterns[0].steps = 65), /steps/],
		[
			'a note at velocity 0',
			(m: XyProject) =>
				m.tracks[0].patterns[0].notes.push({ tick: 0, gate: 240, note: 60, velocity: 0, flags: 0 }),
			/velocity/
		],
		[
			'121 notes',
			(m: XyProject) =>
				(m.tracks[0].patterns[0].notes = Array.from({ length: 121 }, (_, i) => ({
					tick: i,
					gate: 240,
					note: 60,
					velocity: 100,
					flags: 0
				}))),
			/121 notes/
		],
		[
			'a scene past a track’s patterns',
			(m: XyProject) => {
				m.scenes[0].patterns[3] = 1;
			},
			/scene 1's pattern on T4/
		],
		[
			'a used scene past a track’s patterns',
			(m: XyProject) => {
				m.scenes[5].used = true;
				m.scenes[5].patterns[0] = 16;
			},
			/scene 6/
		],
		[
			'a song of 97 scenes',
			(m: XyProject) => (m.songs[2] = { scenes: Array(97).fill(0), loop: true }),
			/song 3's length/
		],
		[
			'a song naming scene 100',
			(m: XyProject) => (m.songs[2] = { scenes: [99], loop: true }),
			/song 3/
		],
		[
			'17 patterns',
			(m: XyProject) =>
				(m.tracks[0].patterns = Array.from({ length: 17 }, () =>
					blankPattern(m.tracks[0].patterns[0])
				)),
			/pattern count/
		],
		[
			'a track without patterns',
			(m: XyProject) => (m.tracks[8].patterns = []),
			/T9's pattern count/
		],
		['15 tracks', (m: XyProject) => m.tracks.pop(), /16 tracks/]
	])('refuses %s', (_, edit, message) => {
		const model = readProject(blank);
		edit(model);
		expect(() => writeProject(model, blank)).toThrow(XyModelError);
		expect(() => writeProject(model, blank)).toThrow(message);
	});
});

describe('writeProject templates', () => {
	it('takes an OS 1.1.33 template (family 0x14) and keeps its header', () => {
		const { header, image } = decodeXy(blank);
		const newer = Uint8Array.of(...header.subarray(0, 5), 0x14, 0x07, 0x86);
		const template = encodeXy(newer, image);
		const out = written((m) => (m.settings.tempo = 100), template);
		expect(Array.from(out.subarray(0, 8))).toEqual(Array.from(newer));
		expect(readProject(out).settings.tempo).toBe(100);
	});

	it('refuses a template whose global header is not mapped', () => {
		const { header, image } = decodeXy(blank);
		const older = header.slice();
		older[5] = 0x10;
		const template = encodeXy(older, concat([image.subarray(0, 3433), image.subarray(3449)]));
		expect(() => writeProject(readProject(blank), template)).toThrow(/family 0x10/);
	});
});
