/**
 * The agent's handle on the app's virtual OP-XY (`$lib/agent/virtual-opxy.ts`): the replica's
 * simulator and its sound. Transport, track selection and mode changes go through the simulator's
 * own keys, so its pages, LEDs and areas react as they do to a person; patterns, scenes and songs
 * are written straight into its model (the arrange area's pattern slots and sounds stay aligned),
 * and every change tells persistence to save.
 */
import type {
	VirtualArrangement,
	VirtualOpxy,
	VirtualPattern,
	VirtualStatus
} from '$lib/agent/virtual-opxy';
import { planPageValue, planParam, planPlace, planSettings } from '$lib/sim/navigator';
import { captureScene, playPattern, startSong, trackSequence } from '$lib/sim/areas/arrange/model';
import { SCENES, SONG_LENGTH } from '$lib/sim/areas/arrange/state';
import type { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { AUX_NAMES, type SimState } from '$lib/sim/params';
import {
	MAX_BARS,
	MAX_NOTES,
	MAX_PATTERNS,
	MAX_STEPS,
	STEPS_PER_BAR,
	TRACK_SCALES,
	currentPattern,
	emptyPattern,
	emptyStep,
	noteCount
} from '$lib/sim/sequencer';

/** The sound the virtual OP-XY makes (`AppSound`), as far as the agent needs it. */
export interface VirtualSound {
	readonly enabled: boolean;
	readonly available: boolean;
	preview(track: number, note: number, velocity: number, seconds: number): boolean;
}

/** Options for {@link createVirtualOpxy}. */
export interface VirtualOpxyOptions {
	readonly sim: OpxySim;
	/** The browser's sound; null where there is none (tests, the eval harness). */
	readonly sound?: VirtualSound | null;
	/** Called after every change the agent makes (persistence saves soon). */
	readonly changed?: () => void;
}

/** Errors for requests the virtual OP-XY cannot take (the tools validate first). */
export class VirtualOpxyError extends Error {
	override name = 'VirtualOpxyError';
}

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

/** Track 1–16 → the simulator's index 0–15 (0–7 instrument, 8–15 auxiliary). */
function trackIndex(track: number): number {
	if (!Number.isInteger(track) || track < 1 || track > 16) {
		throw new VirtualOpxyError(`there is no track ${track} (1–16)`);
	}
	return track - 1;
}

/** Adds empty patterns until track `t` has `count` (keeping the arrange area's sound slots aligned). */
function ensurePatterns(s: SimState, t: number, count: number): void {
	const seq = trackSequence(s, t);
	while (seq.patterns.length < count) seq.patterns.push(emptyPattern());
	if (t < 8) {
		const sounds = s.areas.arrange.sounds[t];
		while (sounds.length < seq.patterns.length) sounds.push(null);
	}
}

export function createVirtualOpxy(options: VirtualOpxyOptions): VirtualOpxy {
	const { sim } = options;
	const s = sim.state;
	const changed = () => options.changed?.();

	function readPattern(track: number, pattern?: number): VirtualPattern {
		const t = trackIndex(track);
		const seq = trackSequence(s, t);
		const index = pattern === undefined ? seq.current : pattern - 1;
		if (!Number.isInteger(index) || index < 0 || index >= MAX_PATTERNS) {
			throw new VirtualOpxyError(`there is no pattern ${pattern} (1–16)`);
		}
		const p = seq.patterns[index] ?? emptyPattern();
		const notes = p.steps.flatMap((step, i) =>
			step.notes.map((n) => ({
				step: i + 1,
				note: n.note,
				velocity: n.velocity,
				length: n.length
			}))
		);
		return {
			track,
			pattern: index + 1,
			patterns: seq.patterns.length,
			playing: index === seq.current,
			bars: p.bars,
			length: p.length,
			scale: p.scale,
			notes
		};
	}

	function readArrangement(): VirtualArrangement {
		const a = s.areas.arrange;
		const scenes = a.scenes.flatMap((scene, i) => {
			const shown = i === a.scene ? captureScene(s) : scene;
			return shown ? [{ scene: i + 1, patterns: shown.patterns.map((p) => p + 1) }] : [];
		});
		const song = a.songs[a.song];
		return {
			scene: a.scene + 1,
			scenes,
			song: { order: song.order.map((n) => n + 1), loop: song.loop }
		};
	}

	/** Puts every track on its pattern in the current scene. */
	function applyCurrentScene(): void {
		const a = s.areas.arrange;
		const scene = a.scenes[a.scene];
		if (!scene) return;
		scene.patterns.forEach((pattern, t) => playPattern(s, t, pattern));
	}

	return {
		status(): VirtualStatus {
			const tracks = Array.from({ length: 16 }, (_, t) => {
				const seq = trackSequence(s, t);
				const mix = t < 8 ? s.tracks[t].mix : s.aux[t - 8].mix;
				return {
					track: t + 1,
					engine: t < 8 ? s.tracks[t].engine : AUX_NAMES[t - 8],
					patterns: seq.patterns.length,
					current: seq.current + 1,
					notes: noteCount(currentPattern(seq)),
					muted: mix.muted
				};
			});
			const sound = options.sound;
			return {
				bpm: s.tempo.bpm,
				playing: s.transport.playing,
				selectedTrack: s.active === 'auxiliary' ? s.auxTrack + 9 : s.track + 1,
				tracks,
				arrangement: readArrangement(),
				sound: !sound || !sound.available ? 'unavailable' : sound.enabled ? 'on' : 'off',
				metronome: s.tempo.metronome.on
			};
		},

		transport(action) {
			if (action === 'stop') {
				if (s.transport.playing) sim.press('key.stop');
				return;
			}
			if (s.transport.playing) return;
			sim.press('key.play');
			const a = s.areas.arrange;
			if (a.songs[a.song].order.length > 1) startSong(s);
		},

		setTempo(bpm) {
			sim.setTempo(bpm);
			changed();
		},

		selectTrack(track) {
			const t = trackIndex(track);
			const set = t < 8 ? 'instrument' : 'auxiliary';
			if (s.active !== set) sim.press(`key.${set}`);
			sim.press(`track.${(t % 8) + 1}`);
		},

		setMuted(track, muted) {
			const t = trackIndex(track);
			(t < 8 ? s.tracks[t].mix : s.aux[t - 8].mix).muted = muted;
			changed();
		},

		preview(track, note, velocity, seconds) {
			const sound = options.sound;
			if (!sound || !sound.available || !sound.enabled) return false;
			return sound.preview(trackIndex(track), note, velocity, seconds);
		},

		readPattern,

		writePattern(track, write) {
			const t = trackIndex(track);
			const pattern = write.pattern;
			if (!Number.isInteger(pattern) || pattern < 1 || pattern > MAX_PATTERNS) {
				throw new VirtualOpxyError(`there is no pattern ${pattern} (1–16)`);
			}
			const bars = clampInt(write.bars, 1, MAX_BARS);
			const steps = bars * STEPS_PER_BAR;
			if (write.notes.length > MAX_NOTES) {
				throw new VirtualOpxyError(`a pattern holds at most ${MAX_NOTES} notes`);
			}
			if (write.scale !== undefined && !(TRACK_SCALES as readonly number[]).includes(write.scale)) {
				throw new VirtualOpxyError(`track scale ${write.scale} does not exist`);
			}
			for (const n of write.notes) {
				if (!Number.isInteger(n.step) || n.step < 1 || n.step > steps) {
					throw new VirtualOpxyError(`step ${n.step} is outside ${bars} bar(s) (1–${steps})`);
				}
			}
			ensurePatterns(s, t, pattern);
			const target = trackSequence(s, t).patterns[pattern - 1];
			target.steps = Array.from({ length: MAX_STEPS }, emptyStep);
			target.bars = bars;
			target.length = clampInt(write.length ?? steps, 1, steps);
			if (write.scale !== undefined) target.scale = write.scale;
			for (const n of write.notes) {
				const step = target.steps[n.step - 1];
				const note = clampInt(n.note, 0, 127);
				if (step.notes.some((x) => x.note === note)) continue;
				step.notes.push({
					note,
					velocity: clampInt(n.velocity, 1, 127),
					length: Math.max(0.05, Math.min(MAX_STEPS, n.length)),
					offset: 0,
					ownLength: true
				});
			}
			playPattern(s, t, pattern - 1);
			changed();
			return readPattern(track, pattern);
		},

		readArrangement,

		writeArrangement(write) {
			const a = s.areas.arrange;
			for (const { scene, patterns } of write.scenes ?? []) {
				if (!Number.isInteger(scene) || scene < 1 || scene > SCENES) {
					throw new VirtualOpxyError(`there is no scene ${scene} (1–${SCENES})`);
				}
				const index = scene - 1;
				if (patterns === null) {
					if (index !== a.scene) a.scenes[index] = null;
					continue;
				}
				const base = captureScene(s);
				const chosen = base.patterns.map(() => 0);
				for (const { track, pattern } of patterns) {
					const t = trackIndex(track);
					if (!Number.isInteger(pattern) || pattern < 1 || pattern > MAX_PATTERNS) {
						throw new VirtualOpxyError(`there is no pattern ${pattern} (1–16)`);
					}
					ensurePatterns(s, t, pattern);
					chosen[t] = pattern - 1;
				}
				a.scenes[index] = { patterns: chosen, mix: base.mix };
				if (index === a.scene) applyCurrentScene();
			}
			if (write.song) {
				const order = write.song.order;
				if (order.length > SONG_LENGTH) {
					throw new VirtualOpxyError(`a song holds at most ${SONG_LENGTH} scenes`);
				}
				for (const n of order) {
					if (!Number.isInteger(n) || n < 1 || n > SCENES) {
						throw new VirtualOpxyError(`there is no scene ${n} (1–${SCENES})`);
					}
				}
				a.songs[a.song] = { order: order.map((n) => n - 1), loop: write.song.loop };
			}
			changed();
			return readArrangement();
		},

		plan(goal) {
			if ('place' in goal) return planPlace(sim.state, goal.place);
			if ('settings' in goal) return planSettings(sim.state, goal.settings);
			if ('label' in goal) return planPageValue(sim.state, goal);
			return planParam(sim.state, goal);
		}
	};
}
