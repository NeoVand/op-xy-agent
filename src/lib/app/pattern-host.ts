/**
 * The replica's side of the chat's pattern cards (`agent/ui/pattern-card.ts`): a pattern read live
 * from the simulator, written back in place (the track keeps playing what it played), the step under
 * the playhead while the track plays it, notes sounded to hear them, and the card's play and stop:
 * play picks the pattern on its track, as the device's pattern keys do, holds the scene when the song
 * has others (so what plays is this pattern, round and round) and starts it from the top.
 */
import type { PatternHost } from '$lib/agent/ui/pattern-card';
import { holdScene, playPattern } from '$lib/sim/areas/arrange/model';
import { stepAt } from '$lib/sim/sequencer';
import { fileName, patternMidi, saveFile } from './export';
import type { AppSimulator } from './simulator.svelte';
import { createVirtualOpxy } from './virtual';

export interface PatternHostOptions {
	readonly simulator: AppSimulator;
	/** Sounds a note on an instrument track (0–7), as the agent's previews do. */
	readonly preview?: (track: number, note: number, velocity: number, seconds: number) => void;
	/** A card changed a pattern (persistence saves soon). */
	readonly changed?: () => void;
}

/** How long a sounded note lasts, s. */
const PREVIEW_SECONDS = 0.35;

export function patternHost(options: PatternHostOptions): PatternHost {
	const { simulator } = options;
	const virtual = createVirtualOpxy({ sim: simulator.sim, changed: options.changed });
	const state = () => simulator.sim.state;
	return {
		read(track, pattern) {
			try {
				const p = virtual.readPattern(track, pattern);
				return p.pattern === pattern ? p : null;
			} catch {
				return null;
			}
		},
		drums(track) {
			return state().tracks[track - 1]?.engine === 'drum';
		},
		write(track, pattern, notes) {
			const was = virtual.readPattern(track, pattern);
			virtual.writePattern(track, {
				pattern,
				bars: was.bars,
				length: was.length,
				notes,
				play: false
			});
		},
		playhead(track, pattern) {
			const s = state();
			if (!s.transport.playing) return null;
			const sequence = s.tracks[track - 1]?.sequence;
			if (!sequence || sequence.current !== pattern - 1) return null;
			const p = sequence.patterns[pattern - 1];
			return p ? stepAt(p, s.transport.position) + 1 : null;
		},
		running() {
			return state().transport.playing;
		},
		play(track, pattern) {
			const s = state();
			const a = s.areas.arrange;
			playPattern(s, track - 1, pattern - 1);
			if ((a.songs[a.song]?.order.length ?? 0) > 1) holdScene(s);
			// play, and pressed again while it plays, from the top (the device's play key)
			simulator.sim.press('key.play');
			options.changed?.();
		},
		stop() {
			virtual.transport('stop');
		},
		preview(track, notes) {
			for (const note of notes) options.preview?.(track - 1, note, 100, PREVIEW_SECONDS);
		},
		download(track, pattern) {
			const s = state();
			saveFile(
				patternMidi(s, track, pattern),
				fileName(s, `T${track} pattern ${pattern}`, 'mid'),
				'audio/midi'
			);
		}
	};
}
