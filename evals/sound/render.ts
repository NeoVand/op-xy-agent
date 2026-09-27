/**
 * Renders our synth engines for a device capture (`research/device/captures/synth/<run>/`): for
 * every cue of `cues.json`, the same engine, M1 and note, at the device's 44.1 kHz, as the device
 * played it in the calibration session (filter and LFO off, a flat envelope). Writes
 * `ours/<index>.wav` next to the capture, for `research/device/synth_analyze.py` to compare.
 *
 *   node evals/sound/render.mjs <capture folder> [--engine prism]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EngineId } from '$lib/core/opxy';
import { createEngine } from '$lib/sound/synth/engines';

const SR = 44100;
const BLOCK = 16;

interface Cue {
	readonly take: string;
	readonly cc: Record<string, number>;
	readonly note: number;
	readonly on: number;
	readonly off: number;
}

interface Sheet {
	readonly engine: string;
	readonly hold: number;
	readonly cues: readonly Cue[];
}

/** A CC value 0–127 as the engine's parameter (0–1). The session checks the linear map. */
const param = (cc: number) => Math.min(1, Math.max(0, cc / 127));

/** 16-bit stereo WAV. */
function wav(left: Float32Array, right: Float32Array): Buffer {
	const n = left.length;
	const out = Buffer.alloc(44 + n * 4);
	out.write('RIFF', 0);
	out.writeUInt32LE(36 + n * 4, 4);
	out.write('WAVE', 8);
	out.write('fmt ', 12);
	out.writeUInt32LE(16, 16);
	out.writeUInt16LE(1, 20);
	out.writeUInt16LE(2, 22);
	out.writeUInt32LE(SR, 24);
	out.writeUInt32LE(SR * 4, 28);
	out.writeUInt16LE(4, 32);
	out.writeUInt16LE(16, 34);
	out.write('data', 36);
	out.writeUInt32LE(n * 4, 40);
	for (let i = 0; i < n; i++) {
		const l = Math.max(-1, Math.min(1, left[i]));
		const r = Math.max(-1, Math.min(1, right[i]));
		out.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
		out.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
	}
	return out;
}

/** One note of `engine`: held for `hold` s with a 1 ms attack, then a 15 ms release. */
function renderNote(
	engine: EngineId,
	cc: Record<string, number>,
	note: number,
	hold: number,
	seed: number
) {
	const voice = createEngine(engine, SR, seed);
	const params = Float32Array.from([12, 13, 14, 15], (k) => param(cc[k] ?? 0));
	const hz = 440 * Math.pow(2, (note - 69) / 12);
	const total = Math.ceil(((hold + 0.1) * SR) / BLOCK) * BLOCK;
	const left = new Float32Array(total);
	const right = new Float32Array(total);
	const l = new Float32Array(BLOCK);
	const r = new Float32Array(BLOCK);
	voice.start(hz, 100, params);
	const attack = 0.001 * SR;
	const gate = hold * SR;
	const release = 0.015 * SR;
	for (let i = 0; i < total; i += BLOCK) {
		voice.control(hz, params);
		voice.render(l, r, BLOCK);
		for (let k = 0; k < BLOCK; k++) {
			const t = i + k;
			const env = t < attack ? t / attack : t < gate ? 1 : Math.exp((-(t - gate) * 4) / release);
			left[t] = l[k] * env;
			right[t] = r[k] * env;
		}
	}
	return { left, right };
}

export async function main(argv: readonly string[]): Promise<void> {
	const folder = argv.find((a) => !a.startsWith('--'));
	if (!folder) throw new Error('usage: render.mjs <capture folder> [--engine id]');
	const sheet = JSON.parse(readFileSync(join(folder, 'cues.json'), 'utf8')) as Sheet;
	const flag = argv.indexOf('--engine');
	const engine = (flag >= 0 ? argv[flag + 1] : sheet.engine) as EngineId;
	const out = join(folder, 'ours');
	mkdirSync(out, { recursive: true });
	sheet.cues.forEach((cue, i) => {
		const { left, right } = renderNote(engine, cue.cc, cue.note, sheet.hold, i + 1);
		writeFileSync(join(out, `${String(i).padStart(3, '0')}.wav`), wav(left, right));
	});
	console.log(`rendered ${sheet.cues.length} notes of ${engine} into ${out}`);
}
