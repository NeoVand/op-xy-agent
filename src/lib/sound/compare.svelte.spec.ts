// The replica's side of a sound comparison with the unit (research/device/preset_capture.py): a
// project file's tracks play the capture's phrase through the app's own sound engine (the synth
// core in its worklet, the channel strips, FX I and II), rendered offline and written next to the
// unit's recording. Runs only when asked, since it reads a local capture and writes files:
//
//   VITE_RENDER_PROJECT=research/device/captures/mtp/projects__workspace-2026-09-28.xy \
//   VITE_RENDER_TRACKS=3,4,5,8 VITE_RENDER_TAG=agent \
//   npx vitest run --project client src/lib/sound/compare.svelte.spec.ts
//
// Writes research/device/captures/presets/<tag>-replica-T<n>.wav, one per track, each starting its
// phrase one second in, as the capture does for its first track.
import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { xyToSim } from '$lib/sim/xy';
import { SoundEngine } from './engine';
import { SynthHost } from './synth/host';
import workletUrl from './synth/worklet?worker&url';

const SR = 44100;
const PROJECT: string | undefined = import.meta.env.VITE_RENDER_PROJECT;
const TRACKS: string = import.meta.env.VITE_RENDER_TRACKS ?? '';
const TAG: string = import.meta.env.VITE_RENDER_TAG ?? 'render';
const ROOT = Number(import.meta.env.VITE_RENDER_ROOT ?? 36);

/** preset_capture.py's phrase: (start s, length s, notes), from the track's first note. */
export function phrase(root: number): [number, number, number[]][] {
	const events: [number, number, number[]][] = [];
	let t = 0;
	for (let octave = 0; octave < 3; octave++) {
		events.push([t, 1.4, [root + 12 * octave]]);
		t += 1.4 + 1.2;
	}
	events.push([t, 1.8, [root + 24, root + 28, root + 31]]);
	t += 1.8 + 1.4;
	const sixteenth = 60 / 120 / 4;
	for (let i = 0; i < 8; i++) {
		events.push([t, sixteenth * 0.8, [root + 12]]);
		t += sixteenth * 2;
	}
	return events;
}

/** A buffer as a 16-bit stereo WAV, base64. */
function wavBase64(buffer: AudioBuffer): string {
	const frames = buffer.length;
	const bytes = new Uint8Array(44 + frames * 4);
	const view = new DataView(bytes.buffer);
	const text = (at: number, s: string) =>
		[...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
	text(0, 'RIFF');
	view.setUint32(4, 36 + frames * 4, true);
	text(8, 'WAVEfmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 2, true);
	view.setUint32(24, SR, true);
	view.setUint32(28, SR * 4, true);
	view.setUint16(32, 4, true);
	view.setUint16(34, 16, true);
	text(36, 'data');
	view.setUint32(40, frames * 4, true);
	const [left, right] = [buffer.getChannelData(0), buffer.getChannelData(1)];
	for (let i = 0; i < frames; i++) {
		view.setInt16(44 + i * 4, Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), true);
		view.setInt16(46 + i * 4, Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), true);
	}
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

describe.skipIf(!PROJECT)('a project’s tracks rendered for comparison with the unit', () => {
	it('renders the capture phrase on each track asked for', async () => {
		const file = await commands.readFile(PROJECT ?? '', 'base64');
		const { state } = xyToSim(Uint8Array.from(atob(file), (c) => c.charCodeAt(0)));
		const tracks = TRACKS.split(',').filter(Boolean).map(Number);
		expect(tracks.length).toBeGreaterThan(0);
		for (const number of tracks) {
			const t = number - 1;
			const events = phrase(ROOT);
			const [lastStart, lastLength] = events[events.length - 1];
			const seconds = 1 + lastStart + lastLength + 3;
			const context = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
			const host = await SynthHost.create(context, workletUrl);
			const engine = new SoundEngine({ context });
			engine.useSynth(host);
			engine.sync(state, 0);
			for (const [start, length, notes] of events) {
				for (const note of notes) {
					engine.noteOn({
						track: t,
						settings: state.tracks[t],
						note,
						velocity: 100,
						time: 1 + start,
						duration: length
					});
				}
			}
			// an offline context renders faster than the worklet's port delivers
			await new Promise((resolve) => setTimeout(resolve, 100));
			const buffer = await context.startRendering();
			const path = `research/device/captures/presets/${TAG}-replica-T${number}.wav`;
			await commands.writeFile(path, wavBase64(buffer), 'base64');
			expect(buffer.length).toBe(Math.round(SR * seconds));
		}
	}, 120_000);
});
