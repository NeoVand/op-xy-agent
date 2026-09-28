// The whole upstream corpus (kmorrill/xy-format, MIT: ~915 .xy files, device-saved under src/ and
// tool-written under output/) and the owner's OS 1.1.33 blank project. Both are git-ignored research
// inputs (scripts/fetch-research.sh; the MTP pull of docs/research/90-device-probe.md), so these
// tests run locally and skip cleanly anywhere else, CI included.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sameBytes } from './bytes';
import { decodeXy, encodeXy } from './container';
import { walkProject } from './layout';
import { readProject } from './read';
import { writeProject } from './write';
import type { XyPattern, XyProject } from './model';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = path.join(ROOT, 'research/repos/kmorrill_xy-format');
const OWNER_BLANK = path.join(ROOT, 'research/device/captures/mtp/projects__workspace.xy');
const blank = new Uint8Array(readFileSync(new URL('./fixtures/blank-1.1.4.xy', import.meta.url)));

/**
 * Tool-written files upstream knows are not canonical RLE (they decode, and re-encode smaller) or
 * do not walk (a broken note vector): legacy outputs of its first raw writer (note 10 §6.1).
 */
const NOT_CANONICAL = [
	'output/k04_song_safefix2_12347.xy',
	'output/mp2_v5_105b_novel_dense.xy',
	'output/mp2_v7_diag_h5_both_dense.xy',
	'output/mp2_v7_diag_h7_both_dense.xy',
	'output/mp2_v7_diag_t1both_dense_t3clone.xy',
	'output/ode_to_joy_v2.xy'
];
const NOT_WALKABLE = ['output/custom_note.xy', 'output/custom_note_from_81.xy'];

/** A pattern without its read-only sound, which follows the template. */
function withoutSound(pattern: XyPattern): Partial<XyPattern> {
	const rest: Partial<XyPattern> = { ...pattern };
	delete rest.sound;
	return rest;
}

/**
 * A project's model without the sounds, notes in tick order: the writer sorts them, and a few
 * tool-written files (the untested Aurora probe) hold them out of order; device files never do.
 */
const sequence = (project: XyProject) => ({
	settings: project.settings,
	scenes: project.scenes,
	songs: project.songs,
	tracks: project.tracks.map((t) =>
		t.patterns.map((p) => ({
			...withoutSound(p),
			notes: [...p.notes].sort((a, b) => a.tick - b.tick)
		}))
	)
});

const blankProject = readProject(blank);

describe.skipIf(!existsSync(UPSTREAM))('the upstream corpus (local only)', () => {
	const files = existsSync(UPSTREAM)
		? (readdirSync(UPSTREAM, { recursive: true }) as string[])
				.filter((f) => f.endsWith('.xy'))
				.map((f) => f.split(path.sep).join('/'))
				.sort()
		: [];
	const read = (f: string) => new Uint8Array(readFileSync(path.join(UPSTREAM, f)));

	it('has the files note 10 counts', () => {
		expect(files.length).toBe(915);
		const headers = new Map<string, number>();
		for (const f of files) {
			const key = Buffer.from(read(f).subarray(4, 8)).toString('hex');
			headers.set(key, (headers.get(key) ?? 0) + 1);
		}
		expect(Object.fromEntries(headers)).toEqual({ '09130386': 891, '09130686': 24 });
	});

	it('re-encodes every file byte for byte but six legacy ones, whose image still survives', () => {
		const odd: string[] = [];
		for (const f of files) {
			const file = read(f);
			const { header, image } = decodeXy(file);
			const again = encodeXy(header, image);
			if (sameBytes(again, file)) continue;
			odd.push(f);
			expect(decodeXy(again).image).toEqual(image);
		}
		expect(odd).toEqual(NOT_CANONICAL);
	}, 120_000);

	it('walks every file but the two broken legacy ones, lanes included, to a footer at the end', () => {
		const broken: string[] = [];
		let lanes = 0;
		for (const f of files) {
			const { header, image } = decodeXy(read(f));
			try {
				const layout = walkProject(header, image);
				lanes += layout.tracks.flat().filter((span) => span.lanesSize > 3).length;
			} catch {
				broken.push(f);
			}
		}
		expect(broken).toEqual(NOT_WALKABLE);
		// the live takes (u39, u106–u109, u120 …) that upstream's lane-blind scanner misreads
		expect(lanes).toBeGreaterThan(0);
	}, 120_000);

	it('reads every walkable file and writes it back unchanged over itself', () => {
		for (const f of files) {
			if (NOT_WALKABLE.includes(f)) continue;
			const file = read(f);
			const out = writeProject(readProject(file), file);
			if (NOT_CANONICAL.includes(f)) expect(decodeXy(out).image).toEqual(decodeXy(file).image);
			else expect(sameBytes(out, file), f).toBe(true);
		}
	}, 300_000);

	it('carries every walkable project onto the blank template with its model intact', () => {
		for (const f of files) {
			if (NOT_WALKABLE.includes(f)) continue;
			const project = readProject(read(f));
			const moved = readProject(writeProject(project, blank));
			expect(sequence(moved), f).toEqual(sequence(project));
			// the sounds are the template's: a pattern it lacks takes the track's first
			moved.tracks.forEach((track, t) =>
				track.patterns.forEach((pattern) =>
					expect(pattern.sound).toEqual(blankProject.tracks[t].patterns[0].sound)
				)
			);
		}
	}, 300_000);
});

describe.skipIf(!existsSync(OWNER_BLANK))(
	'the owner’s OS 1.1.33 blank project (local only)',
	() => {
		const file = existsSync(OWNER_BLANK) ? new Uint8Array(readFileSync(OWNER_BLANK)) : blank;

		it('has the 1.1.33 header, the 1.1.4 layout and walks to its footer', () => {
			const { header, image } = decodeXy(file);
			expect(Buffer.from(header).toString('hex')).toBe('ddccbbaa09140786');
			expect(image.length).toBe(289_521);
			const layout = walkProject(header, image);
			expect(layout.trackBase).toBe(3449);
			expect(layout.tracks.every((t) => t.length === 1)).toBe(true);
			expect(layout.songs.every((s) => s.size === 4)).toBe(true);
			expect(encodeXy(header, image)).toEqual(file);
		});

		it('differs from the 1.1.4 blank project only in T1’s octave, scene 1’s flag and sound bytes', () => {
			const owner = readProject(file);
			const old = readProject(blank);
			expect(owner.settings).toEqual({
				...old.settings,
				octaves: [-1, ...old.settings.octaves.slice(1)]
			});
			expect(owner.scenes[0]).toEqual({ ...old.scenes[0], used: true });
			expect(owner.scenes.slice(1)).toEqual(old.scenes.slice(1));
			expect(owner.songs).toEqual(old.songs);
			expect(sequence(owner).tracks).toEqual(sequence(old).tracks);
		});

		it('is a template the writer takes, header kept', () => {
			const model = readProject(file);
			model.tracks[0].patterns[0].notes.push({
				tick: 0,
				gate: 240,
				note: 53,
				velocity: 100,
				flags: 0
			});
			const out = writeProject(model, file);
			expect(Array.from(out.subarray(0, 8))).toEqual(Array.from(file.subarray(0, 8)));
			expect(readProject(out).tracks[0].patterns[0].notes).toHaveLength(1);
			expect(writeProject(readProject(file), file)).toEqual(file);
		});
	}
);
