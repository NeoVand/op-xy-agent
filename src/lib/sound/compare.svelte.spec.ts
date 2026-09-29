// The replica's side of a sound comparison with the unit (research/device/preset_capture.py): a
// project file's tracks play the capture's phrase through the app's own sound engine (the synth
// core in its worklet, the channel strips, FX I and II), rendered offline and written next to the
// unit's recording. Runs only when asked, since it reads a local capture and writes files:
//
//   VITE_RENDER_PROJECT=research/device/captures/mtp/projects__workspace-2026-09-29.xy \
//   VITE_RENDER_TAG=defaults-v100 npx vitest run --project client src/lib/sound/compare.svelte.spec.ts
//
// The take's own record (captures/presets/<tag>.json) says what was played: which channels (track
// n on channel n, as the capture asks the unit to be set up), which of them are drum tracks, the
// root, the velocity and the held notes' length and gap. VITE_RENDER_TRACKS narrows the tracks;
// without the record (an older take) VITE_RENDER_TRACKS and VITE_RENDER_ROOT say it all.
//
// Writes research/device/captures/presets/<tag>-replica-T<n>.wav, one per track, each starting its
// phrase one second in, as the capture does for its first track. VITE_RENDER_SCENE picks the scene
// (patterns carry their own sounds, so it must be the one the unit is on).
import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { selectScene } from '$lib/sim/areas/arrange/model';
import { xyToSim } from '$lib/sim/xy';
import { SoundEngine } from './engine';
import { SynthHost } from './synth/host';
import workletUrl from './synth/worklet?worker&url';

const SR = 44100;
const PROJECT: string | undefined = import.meta.env.VITE_RENDER_PROJECT;
const TRACKS: string = import.meta.env.VITE_RENDER_TRACKS ?? '';
const TAG: string = import.meta.env.VITE_RENDER_TAG ?? 'render';
const ROOT = Number(import.meta.env.VITE_RENDER_ROOT ?? 36);
const SCENE: number | null = import.meta.env.VITE_RENDER_SCENE
	? Number(import.meta.env.VITE_RENDER_SCENE)
	: null;
/** Renders with every filter switched off (files `<tag>-replica-open-T<n>.wav`), to read the unit's
 * filter as the unit's take over this render. */
const OPEN = !!import.meta.env.VITE_RENDER_OPEN;
/** Tracks to render with their filter switched on whatever the file says (`-replica-on-T<n>`), to
 * test whether the unit plays a filter the file has off. */
const FORCE_ON: number[] = (import.meta.env.VITE_RENDER_FILTER_ON ?? '')
	.split(',')
	.filter(Boolean)
	.map(Number);

/** What preset_capture.py played, from its record's summary. */
interface Take {
	channels: number[];
	drums: number[];
	root: number;
	velocity: number;
	hold: number;
	gap: number;
}

/** preset_capture.py's phrase: (start s, length s, notes), from the track's first note. */
export function phrase(root: number, hold = 1.4, gap = 1.2): [number, number, number[]][] {
	const events: [number, number, number[]][] = [];
	let t = 0;
	for (let octave = 0; octave < 3; octave++) {
		events.push([t, hold, [root + 12 * octave]]);
		t += hold + gap;
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

/** preset_capture.py's drum phrase: each drum key (53–76) once, 0.7 s apart. */
export function drumPhrase(): [number, number, number[]][] {
	return Array.from({ length: 24 }, (_, i) => [i * 0.7, 0.1, [53 + i]]);
}

/** The take's record, or one made of the environment for a take without one. */
async function takeOf(): Promise<Take> {
	const fallback: Take = {
		channels: TRACKS.split(',').filter(Boolean).map(Number),
		drums: [],
		root: ROOT,
		velocity: 100,
		hold: 1.4,
		gap: 1.2
	};
	try {
		const record = JSON.parse(
			await commands.readFile(`research/device/captures/presets/${TAG}.json`)
		) as { summary: Partial<Take> };
		return { ...fallback, ...record.summary };
	} catch {
		return fallback;
	}
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
		if (SCENE !== null) selectScene(state, SCENE - 1);
		if (OPEN) for (const track of state.tracks) track.filter.on = false;
		for (const n of FORCE_ON) state.tracks[n - 1].filter.on = true;
		const take = await takeOf();
		const only = TRACKS.split(',').filter(Boolean).map(Number);
		const tracks = [...take.channels, ...take.drums].filter(
			(n) => only.length === 0 || only.includes(n)
		);
		expect(tracks.length).toBeGreaterThan(0);
		for (const number of tracks) {
			const t = number - 1;
			const events = take.drums.includes(number)
				? drumPhrase()
				: phrase(take.root, take.hold, take.gap);
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
						velocity: take.velocity,
						time: 1 + start,
						duration: length
					});
				}
			}
			// an offline context renders faster than the worklet's port delivers
			await new Promise((resolve) => setTimeout(resolve, 100));
			const buffer = await context.startRendering();
			const path = `research/device/captures/presets/${TAG}-replica-${OPEN ? 'open-' : FORCE_ON.includes(number) ? 'on-' : ''}T${number}.wav`;
			await commands.writeFile(path, wavBase64(buffer), 'base64');
			expect(buffer.length).toBe(Math.round(SR * seconds));
		}
	}, 300_000);
});
