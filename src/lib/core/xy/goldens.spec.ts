// Differential goldens against kmorrill/xy-format (MIT, Copyright (c) 2026 Kevin Morrill): each op
// list of fixtures/goldens.json was run through the Python library's ImageProject and
// build_arrangement by scripts/xy-fixtures.py; here the same list edits our model of the blank
// template and writeProject must produce the same bytes. Where upstream proved the library's output
// equal to a device capture ("equals"), our writer reproduces the device's own save.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_STEP } from './layout';
import { blankPattern, type XyComponentKind, type XyPattern, type XyProject } from './model';
import { readProject } from './read';
import { writeProject } from './write';
import goldens from './fixtures/goldens.json';

const fixture = (name: string) =>
	new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const blank = fixture('blank-1.1.4.xy');
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

/** A note as the op lists (and build_arrangement) give it. */
interface SpecNote {
	step: number;
	note: number;
	velocity?: number;
	gate_ticks?: number;
	tick_offset?: number;
}
type SpecPattern = SpecNote[] | { steps?: number; notes: SpecNote[] };

/** One op of goldens.json: tracks, patterns and steps are 1-based, as the library takes them. */
interface Op {
	op: string;
	[field: string]: unknown;
}

const num = (op: Op, field: string) => op[field] as number;

/** The pattern an op addresses (upstream's track-level setters act on pattern 1). */
const patternOf = (m: XyProject, op: Op): XyPattern =>
	m.tracks[num(op, 'track') - 1].patterns[((op.pattern as number | undefined) ?? 1) - 1];

/** The pattern an op edits, marked edited as upstream's setters do (mark_edited). */
function edited(m: XyProject, op: Op): XyPattern {
	const pattern = patternOf(m, op);
	pattern.pristine = 0;
	return pattern;
}

/** build_arrangement's work, on the model (xy/image_writer.py). */
function arrangement(m: XyProject, op: Op): void {
	const patterns = op.patterns as Record<string, SpecPattern[]>;
	for (const [track, list] of Object.entries(patterns)) {
		const like = m.tracks[Number(track) - 1].patterns[0];
		m.tracks[Number(track) - 1].patterns = list.map((spec) => {
			const { notes, steps } = Array.isArray(spec) ? { notes: spec, steps: undefined } : spec;
			const pattern = blankPattern(like);
			if (steps !== undefined) {
				pattern.steps = steps;
				pattern.pristine = 0;
			}
			if (notes.length === 0) return pattern;
			const last = Math.max(...notes.map((n) => n.step));
			pattern.steps = steps ?? Math.min(64, Math.max(16, Math.ceil(last / 16) * 16));
			pattern.pristine = 0;
			pattern.notes = notes.map((n) => ({
				tick: (n.step - 1) * TICKS_PER_STEP + (n.tick_offset ?? 0),
				gate: n.gate_ticks ?? 240,
				note: n.note,
				velocity: n.velocity ?? 100,
				flags: 0
			}));
			return pattern;
		});
	}
	const scenes = op.scenes as Record<string, number>[] | undefined;
	if (!scenes?.length) {
		// no scenes: slot 0 holds the pattern the device sits on, the last one created
		for (const [track, list] of Object.entries(patterns)) {
			if (list.length < 2) continue;
			m.scenes[0].patterns[Number(track) - 1] = list.length - 1;
			m.scenes[0].used = true;
		}
	} else {
		m.settings.activeScene = scenes.length - 1;
		const mutes = (op.mutes as number[][] | undefined) ?? [];
		scenes.forEach((row, k) => {
			for (const [track, pattern] of Object.entries(row)) {
				m.scenes[k].patterns[Number(track) - 1] = pattern;
			}
			for (const track of mutes[k] ?? []) m.scenes[k].mutes[track - 1] = true;
			m.scenes[k].used = true;
		});
	}
	if (op.song) m.songs[0] = { scenes: op.song as number[], loop: (op.loop as boolean) ?? true };
}

function apply(m: XyProject, op: Op): void {
	const s = m.settings;
	switch (op.op) {
		case 'arrangement':
			return arrangement(m, op);
		case 'tempo':
			s.tempo = num(op, 'bpm');
			return;
		case 'groove':
			s.grooveType = num(op, 'type');
			return;
		case 'grooveAmount':
			s.grooveAmount = num(op, 'amount');
			return;
		case 'click':
			s.clickVolume = num(op, 'volume');
			return;
		case 'transpose':
			s.transpose = num(op, 'semitones');
			return;
		case 'timeSignature':
			s.timeSignature = num(op, 'raw');
			return;
		case 'sceneLength':
			s.sceneLength = num(op, 'mode');
			return;
		case 'voices':
			s.voices[num(op, 'track') - 1] = (op.voices as number | null) ?? 0;
			return;
		case 'midiChannel':
			s.midiChannels[num(op, 'track') - 1] = op.channel as number | null;
			return;
		case 'activeSong':
			s.activeSong = num(op, 'song') - 1;
			return;
		case 'song':
			m.songs[num(op, 'song') - 1] = { scenes: op.scenes as number[], loop: op.loop as boolean };
			return;
		case 'steps':
			edited(m, op).steps = num(op, 'steps');
			return;
		case 'scale':
			edited(m, op).scale = num(op, 'raw');
			return;
		case 'quantize':
			edited(m, op).quantize = num(op, 'raw');
			return;
		case 'trackGroove':
			edited(m, op).groove = (num(op, 'raw') << 24) >> 24;
			return;
		case 'noteLength':
			edited(m, op).noteLength = num(op, 'ticks');
			return;
		case 'smoothing':
			// set_plock_shape_raw leaves the pristine field alone, as the device does (bar-s-*)
			patternOf(m, op).smoothing = num(op, 'raw');
			return;
		case 'note':
			edited(m, op).notes.push({
				tick: (op.tick as number | undefined) ?? (num(op, 'step') - 1) * TICKS_PER_STEP,
				gate: (op.gate as number | undefined) ?? 240,
				note: num(op, 'note'),
				velocity: (op.velocity as number | undefined) ?? 100,
				flags: 0
			});
			return;
		case 'component': {
			const pattern = edited(m, op);
			const step = num(op, 'step') - 1;
			const kind = op.kind as XyComponentKind;
			pattern.components = pattern.components.filter((c) => c.step !== step || c.kind !== kind);
			pattern.components.push({ step, kind, value: num(op, 'value') });
			return;
		}
		case 'lock': {
			const pattern = edited(m, op);
			const step = num(op, 'step') - 1;
			const column = num(op, 'column');
			pattern.locks = pattern.locks.filter((l) => l.step !== step || l.column !== column);
			pattern.locks.push({ step, column, value: num(op, 'value') });
			return;
		}
	}
	throw new Error(`unknown op ${op.op}`);
}

/** Replays an op list on the blank template. */
function replay(ops: readonly Op[]): Uint8Array {
	const model = readProject(blank);
	for (const op of ops) apply(model, op);
	return writeProject(model, blank);
}

describe('writeProject reproduces kmorrill/xy-format byte for byte', () => {
	for (const golden of goldens) {
		const proof = 'equals' in golden ? ` (= ${golden.equals})` : '';
		it(`${golden.name}${proof}`, () => {
			const out = replay(golden.ops as Op[]);
			if ('fixture' in golden) expect(out).toEqual(fixture(golden.fixture as string));
			expect(out.length).toBe(golden.size);
			expect(sha256(out)).toBe(golden.sha256);
		});
	}

	it('covers the device captures upstream replicates', () => {
		const proven = goldens
			.filter((g) => 'equals' in g)
			.map((g) => (g as { equals: string }).equals);
		expect(proven).toHaveLength(17);
	});
});
