/**
 * Shared by the lab's tests: a replica with a lab over it, a small MIDI file (drums on channel 10,
 * a bass in two phrases) and a stand-in renderer that plays a click on every beat of the project's
 * tempo, pitched per unmuted track, silent when nothing plays. Production code never imports it.
 */
import { createVirtualOpxy } from '$lib/app/virtual';
import { encodeMidiFile, tempoMeta, textMeta } from '$lib/core/midi/smf';
import type { ProjectContent } from '$lib/sim/areas/system/projects';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { createLab, labSnapshot, type LabRender, type LabRenderer } from '../lab/core';
import type { AttachedFiles } from '../tools/define';

const PPQ = 96;

/** A note as two events at `beat`, lasting `beats`. */
function note(beat: number, beats: number, n: number, velocity = 100, channel = 0) {
	const at = Math.round(beat * PPQ);
	return [
		{ tick: at, event: { type: 'noteOn' as const, channel, note: n, velocity } },
		{
			tick: at + Math.round(beats * PPQ),
			event: { type: 'noteOff' as const, channel, note: n, velocity: 0 }
		}
	];
}

/**
 * 8 bars at 107 bpm: track 2 "drums" (kick, snare and hats on channel 10), track 3 "bass" (A for 4
 * bars, then C), both 1-based as the attachment lists them.
 */
export function smallSong(): Uint8Array {
	const drums = Array.from({ length: 8 }, (_, bar) => {
		const b = bar * 4;
		return [
			note(b, 0.25, 36, 110, 9),
			note(b + 2, 0.25, 36, 110, 9),
			note(b + 1, 0.25, 38, 100, 9),
			note(b + 3, 0.25, 38, 100, 9),
			...Array.from({ length: 8 }, (_, e) => note(b + e / 2, 0.25, 42, 80, 9))
		].flat();
	}).flat();
	const bass = Array.from({ length: 8 }, (_, bar) =>
		[0, 1.5, 2.5].flatMap((beat) => note(bar * 4 + beat, 0.5, bar < 4 ? 33 : 36, 100, 1))
	).flat();
	return encodeMidiFile({
		format: 1,
		division: { kind: 'ppq', ticksPerQuarter: PPQ },
		tracks: [
			{ events: [{ tick: 0, event: tempoMeta(107) }] },
			{ events: [{ tick: 0, event: textMeta(0x03, 'drums') }, ...drums] },
			{ events: [{ tick: 0, event: textMeta(0x03, 'bass') }, ...bass] }
		]
	});
}

/** Files attached as the conductor keeps them. */
export function files(named: Record<string, Uint8Array>): AttachedFiles {
	return {
		midi: (name) => named[name] ?? null,
		midiNames: () => Object.keys(named)
	};
}

/** A renderer that clicks on every beat, one pitch per unmuted track with notes; it notes each request. */
export function clickRenderer(onRender?: (request: LabRender) => void): LabRenderer & {
	readonly requests: LabRender[];
} {
	const requests: LabRender[] = [];
	return {
		requests,
		async render(request) {
			requests.push(request);
			onRender?.(request);
			const project = JSON.parse(request.project) as ProjectContent;
			const sampleRate = 48_000;
			const n = Math.round(request.seconds * sampleRate);
			const left = new Float32Array(n);
			const beat = (60 / project.tempo.bpm) * sampleRate;
			project.tracks.forEach((track, t) => {
				const p = track.sequence.patterns[track.sequence.current];
				const plays = p?.steps.some((s) => s.notes.length > 0);
				if (track.mix.muted || !plays) return;
				const hz = 110 * (t + 1);
				for (let start = 0; start < n; start += beat) {
					for (let i = 0; i < 2400 && start + i < n; i++) {
						left[Math.floor(start) + i] +=
							0.2 * Math.sin((2 * Math.PI * hz * i) / sampleRate) * Math.exp(-i / 600);
					}
				}
			});
			return { sampleRate, channels: [left, left.slice()] };
		}
	};
}

/** A replica (a new project) and a lab session over it. */
export function labOn(options: { attached?: AttachedFiles; render?: LabRenderer | null } = {}) {
	const sim = new OpxySim({ now: () => 0 });
	const replica = createVirtualOpxy({ sim });
	const session = createLab({
		snapshot: labSnapshot(sim.state),
		virtual: (s) => createVirtualOpxy({ sim: s }),
		files: options.attached ?? null,
		render: options.render ?? null
	});
	return { sim, replica, session, lab: session.lab };
}
