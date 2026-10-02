/**
 * The agent's handle on the app's virtual OP-XY (`$lib/agent/virtual-opxy.ts`): the replica's
 * simulator and its sound. Transport, track selection and mode changes go through the simulator's
 * own keys, so its pages, LEDs and areas react as they do to a person; patterns, scenes and songs
 * are written straight into its model (the arrange area's pattern slots and sounds stay aligned),
 * and every change tells persistence to save.
 */
import type {
	RehearsedStep,
	VirtualArrangement,
	VirtualKitLoad,
	VirtualOpxy,
	VirtualPattern,
	VirtualStatus,
	VirtualTrackSound
} from '$lib/agent/virtual-opxy';
import { KEYBOARD_NOTE_NAMES, formatKeys, parseKeys, type KeyTerm } from '$lib/core/opxy';
import { musicMark } from '$lib/sim/music-mark';
import { lockLabel, lockParam } from '$lib/sim/areas/sequencer/locks';
import { buildFrame } from '$lib/sim/frames';
import { describeFrame } from '$lib/sim/screen/render';
import { FIRST_NOTE, KEYS, sampleFile, soundName } from '$lib/sim/areas/sample/state';
import { loadEngineSound } from '$lib/sim/areas/system/presets';
import {
	planPageValue,
	planParam,
	planPlace,
	planSettings,
	playStep,
	type Place,
	planToSetting
} from '$lib/sim/navigator';
import {
	BAR,
	captureScene,
	trackMix,
	chooseScene,
	lengthOf,
	sceneLength,
	lengthSettings,
	playPattern,
	startSong,
	trackSequence
} from '$lib/sim/areas/arrange/model';
import { SCENES, SONG_LENGTH } from '$lib/sim/areas/arrange/state';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { replicaChangeList, replicaChanges } from './replica-diff';
import { AUX_NAMES, DEFAULT_METRONOME_LEVEL, GROOVES, type SimState } from '$lib/sim/params';
import { takeBack } from '$lib/sim/merge';
import {
	MAX_BARS,
	MAX_NOTES,
	MAX_PATTERNS,
	MAX_STEPS,
	STEP_COMPONENTS,
	STEPS_PER_BAR,
	TRACK_SCALES,
	type StepComponentKind,
	currentPattern,
	emptyPattern,
	emptyStep,
	noteCount,
	stepGroove
} from '$lib/sim/sequencer';

/** Puts `state`'s screen where a person starts reading from: on, no page open, no key held. */
function idle(state: SimState): void {
	const sys = state.areas.system;
	sys.power = { on: true, booting: false, elapsed: 0, since: null };
	sys.page = null;
	sys.naming = null;
	sys.confirm = null;
	sys.hold = null;
	sys.notice = null;
	sys.presetPopup = 0;
	state.overlay = null;
	state.sub = null;
	state.picker = null;
	state.shift = false;
	state.held = [];
}

/** The sound the virtual OP-XY makes (`AppSound`), as far as the agent needs it. */
export interface VirtualSound {
	readonly enabled: boolean;
	readonly available: boolean;
	preview(track: number, note: number, velocity: number, seconds: number): boolean;
	/** Where sample files' audio lives (a made kit's sounds go in here). */
	readonly samples?: {
		setFile(id: string, audio: { sampleRate: number; channels: readonly Float32Array[] }): void;
	};
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

export { soundName };

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
		// a drum track's keys each hold a sound: say which, so a beat reads as kicks and hats
		const keys = t < 8 && s.tracks[t].engine === 'drum' ? s.areas.sample.tracks[t].keys : null;
		const notes = p.steps.flatMap((step, i) =>
			step.notes.map((n) => {
				const file = keys?.[n.note - FIRST_NOTE];
				return {
					step: i + 1,
					note: n.note,
					velocity: n.velocity,
					length: n.length,
					...(file ? { sound: soundName(file.name) } : {})
				};
			})
		);
		const components = p.steps
			.slice(0, MAX_STEPS)
			.flatMap((step, i) =>
				step.components.map((c) => ({ step: i + 1, kind: c.kind, value: c.value }))
			);
		// each step's locks as its page names and shows them (an agent asked whether a lock landed
		// could not see one)
		const locks =
			t < 8
				? p.steps.slice(0, MAX_STEPS).flatMap((step, i) => {
						const values = Object.entries(step.locks ?? {}).map(([id, v]) => {
							const param = lockParam(id);
							return `${lockLabel(id, s.tracks[t])} ${param ? param.format(v) : Math.round(v)}`;
						});
						return values.length ? [{ step: i + 1, values }] : [];
					})
				: [];
		return {
			track,
			pattern: index + 1,
			patterns: seq.patterns.length,
			current: index === seq.current,
			...(components.length ? { components } : {}),
			...(locks.length ? { locks } : {}),
			...(p.groove ? { groove: p.groove } : {}),
			bars: p.bars,
			length: p.length,
			scale: p.scale,
			notes
		};
	}

	/**
	 * What the screen reads at `place`, shift held or not: on a copy of the replica that is switched
	 * on with no page, list or overlay open and no key held, so a sound reads the same wherever the
	 * screen stands (the replica does not move). Read from where it stood, a preset browser left
	 * open, a boot or a key held down once went into the sound's pages as if they were its values.
	 */
	function screenAt(place: Place, shift = false): string {
		const state = JSON.parse(JSON.stringify(s)) as SimState;
		idle(state);
		const copy = new OpxySim({ state, now: () => 0 });
		for (const step of planPlace(state, place).steps) playStep(copy, step);
		if (shift) copy.input({ type: 'press', id: 'key.shift' });
		return describeFrame(buildFrame(copy.state));
	}

	/** A filter or LFO page's reading with its state said either way ("svf filter on: …"). */
	const stated = (reading: string) => reading.replace(/^([^:]*? (?:filter|lfo)):/, '$1 on:');

	function readSound(track: number): VirtualTrackSound {
		if (!Number.isInteger(track) || track < 1 || track > 8) {
			throw new VirtualOpxyError(`there is no instrument track ${track} (1–8)`);
		}
		const t = s.tracks[track - 1];
		const at = (page: 1 | 2 | 3 | 4, extra: Partial<Place> = {}) =>
			({ area: 'instrument', track, page, ...extra }) as Place;
		const preset = s.areas.system.trackPresets[track - 1] ?? null;
		const keys = t.engine === 'drum' ? s.areas.sample.tracks[track - 1].keys : null;
		return {
			track,
			engine: t.engine,
			preset: preset && preset !== '/' ? preset : null,
			pages: {
				'M1 engine': screenAt(at(1)),
				'M2 amp envelope': screenAt(at(2, { envelope: 'amp' })),
				'M2 filter envelope': screenAt(at(2, { envelope: 'filter' })),
				'shift M2 play mode': screenAt(at(2), true),
				// its reading names cutoff, resonance, envelope amount and key tracking
				'M3 filter': stated(screenAt(at(3))),
				'shift M3 sends': screenAt(at(3), true),
				'M4 lfo': stated(screenAt(at(4))),
				player: screenAt({ area: 'player', track })
			},
			// where the sends go: what FX I and FX II hold (auxiliary T7 and T8, their M1 pages)
			fx: {
				'FX I': screenAt({ area: 'auxiliary', track: 7, page: 1 }).replace(/^FX I /, ''),
				'FX II': screenAt({ area: 'auxiliary', track: 8, page: 1 }).replace(/^FX II /, '')
			},
			mix: {
				level: Math.round(t.mix.level),
				pan: Math.round(t.mix.pan),
				muted: t.mix.muted
			},
			...(keys
				? {
						kit: Object.fromEntries(
							keys.flatMap((file, i) =>
								file
									? [[KEYBOARD_NOTE_NAMES[i].toUpperCase().replace('S', '#'), soundName(file.name)]]
									: []
							)
						)
					}
				: {})
		};
	}

	function readArrangement(): VirtualArrangement {
		const a = s.areas.arrange;
		const { mode, signature } = lengthSettings(s);
		// in bars of the project's meter, as the playhead's bar counts (four 7/8 bars once read 3.5)
		const bars = (patterns: readonly number[]) =>
			lengthOf(
				patterns.map((p, t) => trackSequence(s, t).patterns[p] ?? emptyPattern()),
				mode,
				signature
			) / BAR[signature];
		const scenes = a.scenes.flatMap((scene, i) => {
			const shown = i === a.scene ? captureScene(s) : scene;
			if (!shown) return [];
			const muted = shown.mix.flatMap((m, t) => (m.muted ? [t + 1] : []));
			return [
				{
					scene: i + 1,
					patterns: shown.patterns.map((p) => p + 1),
					bars: bars(shown.patterns),
					...(muted.length ? { muted } : {}),
					levels: shown.mix.slice(0, 8).map((m) => Math.round(m.level))
				}
			];
		});
		const song = a.songs[a.song];
		// a song of one entry is that scene round and round
		const plays = song.order.length > 1 && (a.playing || !a.held) ? 'song' : 'scene';
		const length = Math.max(1, sceneLength(s));
		const at = s.transport.playing
			? {
					bar: Math.floor((s.transport.position % length) / BAR[signature]) + 1,
					...(a.playing ? { entry: a.position + 1 } : {})
				}
			: undefined;
		return {
			scene: a.scene + 1,
			plays,
			...(a.queued !== null ? { queued: a.queued + 1 } : {}),
			...(at ? { at } : {}),
			scenes,
			song: { order: song.order.map((n) => n + 1), loop: song.loop },
			...(BAR[signature] !== STEPS_PER_BAR ? { barSteps: BAR[signature] } : {})
		};
	}

	/** An empty pattern on track index `t` (1–16): the first it has, else the next new one. */
	function restingPattern(t: number): number {
		const seq = trackSequence(s, t);
		const empty = seq.patterns.findIndex((p) => p.steps.every((step) => step.notes.length === 0));
		if (empty >= 0) return empty + 1;
		if (seq.patterns.length >= MAX_PATTERNS) {
			throw new VirtualOpxyError(
				`track ${t + 1} has no empty pattern to rest on, and no room for one (16 patterns)`
			);
		}
		return seq.patterns.length + 1;
	}

	/** Puts every track on its pattern in the current scene. */
	function applyCurrentScene(): void {
		const a = s.areas.arrange;
		const scene = a.scenes[a.scene];
		if (!scene) return;
		scene.patterns.forEach((pattern, t) => playPattern(s, t, pattern));
	}

	const api: VirtualOpxy = {
		status(): VirtualStatus {
			const tracks = Array.from({ length: 16 }, (_, t) => {
				const seq = trackSequence(s, t);
				const mix = t < 8 ? s.tracks[t].mix : s.aux[t - 8].mix;
				// the sound it plays, by its preset (an agent asked what was on each track guessed
				// "default" for the ones it had not written)
				const preset = t < 8 ? s.areas.system.trackPresets[t] : null;
				return {
					track: t + 1,
					engine: t < 8 ? s.tracks[t].engine : AUX_NAMES[t - 8],
					...(preset && preset !== '/' ? { preset } : {}),
					patterns: seq.patterns.length,
					current: seq.current + 1,
					notes: noteCount(currentPattern(seq)),
					byPattern: seq.patterns.map(noteCount),
					muted: mix.muted
				};
			});
			const sound = options.sound;
			const rec = s.areas.sequencer;
			const recording = rec.armed ? 'armed' : rec.countIn ? 'count-in' : rec.recLatch ? 'on' : null;
			return {
				bpm: s.tempo.bpm,
				signature: lengthSettings(s).signature,
				playing: s.transport.playing,
				selectedTrack: s.active === 'auxiliary' ? s.auxTrack + 9 : s.track + 1,
				tracks,
				arrangement: readArrangement(),
				sound: !sound || !sound.available ? 'unavailable' : sound.enabled ? 'on' : 'off',
				// heard only while on with a level above 0 (level 0 is silent, though the page says on)
				metronome: s.tempo.metronome.on && s.tempo.metronome.level > 0,
				...(recording ? { recording } : {}),
				groove: { type: GROOVES[s.tempo.groove] ?? String(s.tempo.groove), amount: s.tempo.swing }
			};
		},

		transport(action, options = {}) {
			if (action === 'stop') {
				if (s.transport.playing) sim.press('key.stop');
				return;
			}
			if (options.scene !== undefined) {
				const a = s.areas.arrange;
				const index = options.scene - 1;
				if (!Number.isInteger(index) || index < 0 || index >= SCENES) {
					throw new VirtualOpxyError(`there is no scene ${options.scene} (1–${SCENES})`);
				}
				if (index !== a.scene && !a.scenes[index]) {
					throw new VirtualOpxyError(
						`scene ${options.scene} holds nothing yet: write_arrangement sets it`
					);
				}
				// as a person would: stop, pick the scene (it holds), play it from its top
				if (s.transport.playing) sim.press('key.stop');
				chooseScene(s, index, 'select');
				sim.press('key.play');
				return;
			}
			// pressed while it plays, the play key starts again from the top
			sim.press('key.play');
			const a = s.areas.arrange;
			if (a.songs[a.song].order.length > 1) startSong(s);
		},

		setTempo(bpm) {
			sim.setTempo(bpm);
			changed();
		},

		setMetronome(on) {
			s.tempo.metronome.on = on;
			// on means heard: a level turned down to 0 comes back to a new project's
			if (on && s.tempo.metronome.level === 0) s.tempo.metronome.level = DEFAULT_METRONOME_LEVEL;
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
		readSound,

		loadKit(track, kit): VirtualKitLoad {
			const t = trackIndex(track);
			if (t > 7)
				throw new VirtualOpxyError(`track ${track} is an auxiliary track: a kit goes on 1–8`);
			const engineChanged = s.tracks[t].engine !== 'drum';
			if (engineChanged) loadEngineSound(s, t, 'drum');
			const held = s.areas.sample.tracks[t];
			const folder = `kits/${kit.name}`;
			let keys = 0;
			for (const sound of kit.sounds) {
				const index = sound.key - FIRST_NOTE;
				if (!Number.isInteger(index) || index < 0 || index >= KEYS) continue;
				const frames = sound.audio.channels[0]?.length ?? 0;
				const file = sampleFile(
					`${sound.key} ${sound.name}.wav`,
					folder,
					frames / sound.audio.sampleRate
				);
				held.keys[index] = file;
				options.sound?.samples?.setFile(file.id, {
					sampleRate: sound.audio.sampleRate,
					channels: [...sound.audio.channels]
				});
				keys++;
			}
			changed();
			return {
				track,
				keys,
				engineChanged,
				audible: Boolean(options.sound?.samples && options.sound.available)
			};
		},

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
			if (
				write.groove !== undefined &&
				(!Number.isFinite(write.groove) || Math.abs(write.groove) > 99)
			) {
				throw new VirtualOpxyError(`a pattern's groove is −99…99 (${write.groove})`);
			}
			for (const n of write.notes) {
				if (!Number.isInteger(n.step) || n.step < 1 || n.step > steps) {
					throw new VirtualOpxyError(`step ${n.step} is outside ${bars} bar(s) (1–${steps})`);
				}
				if (!Number.isFinite(n.velocity) || !Number.isFinite(n.length)) {
					throw new VirtualOpxyError(
						`the note on step ${n.step} needs a velocity (1–127) and a length in steps`
					);
				}
			}
			for (const c of write.components ?? []) {
				if (!Number.isInteger(c.step) || c.step < 1 || c.step > steps) {
					throw new VirtualOpxyError(`step ${c.step} is outside ${bars} bar(s) (1–${steps})`);
				}
				if (!STEP_COMPONENTS.some((k) => k.kind === c.kind)) {
					throw new VirtualOpxyError(
						`no step component "${c.kind}": ${STEP_COMPONENTS.map((k) => k.kind).join(', ')}`
					);
				}
				if (!Number.isInteger(c.value) || c.value < 0 || c.value > 9) {
					throw new VirtualOpxyError(
						`a step component's value is a digit, 0–9 (${c.kind} ${c.value})`
					);
				}
			}
			ensurePatterns(s, t, pattern);
			const target = trackSequence(s, t).patterns[pattern - 1];
			target.steps = Array.from({ length: MAX_STEPS }, emptyStep);
			target.bars = bars;
			target.length = clampInt(write.length ?? steps, 1, steps);
			if (write.scale !== undefined) target.scale = write.scale;
			// the bar menu's groove, on the device's detents (60 is one, 61 is not)
			if (write.groove !== undefined) target.groove = stepGroove(write.groove, 0);
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
			for (const c of write.components ?? []) {
				const step = target.steps[c.step - 1];
				const kind = c.kind as StepComponentKind;
				// one of each kind a step: a second replaces the first's value
				const had = step.components.find((x) => x.kind === kind);
				if (had) had.value = c.value;
				else step.components.push({ kind, value: c.value });
			}
			// the scene on now plays the patterns its tracks play: with an arrangement, switching the
			// track over would rewrite that scene (it once moved a scene's track onto the pattern an
			// agent was only filling in for a later scene), so the scenes stay as they are
			const arranged = readArrangement().scenes.length > 1;
			if (write.play !== false && !arranged) playPattern(s, t, pattern - 1);
			changed();
			return readPattern(track, pattern);
		},

		readArrangement,

		writeArrangement(write) {
			const a = s.areas.arrange;
			for (const { scene, patterns, mix: given } of write.scenes ?? []) {
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
				// the mix: the scene's own (one not on screen keeps what it stored), then what is given
				const mix = (index === a.scene ? base.mix : (a.scenes[index]?.mix ?? base.mix)).map(
					(m) => ({ ...m })
				);
				for (const { track, level, muted } of given ?? []) {
					const t = trackIndex(track);
					if (level !== undefined) {
						if (!Number.isFinite(level) || level < 0 || level > 99) {
							throw new VirtualOpxyError(`a level is 0–99 (track ${track}: ${level})`);
						}
						mix[t].level = level;
					}
					if (muted !== undefined) mix[t].muted = muted;
				}
				for (const { track, pattern } of patterns) {
					const t = trackIndex(track);
					if (!Number.isInteger(pattern) || pattern < 0 || pattern > MAX_PATTERNS) {
						throw new VirtualOpxyError(`there is no pattern ${pattern} (1–16, or 0 to rest)`);
					}
					// 0: the track rests in this scene, on an empty pattern of its own (one it has, else a
					// new one)
					const at = pattern === 0 ? restingPattern(t) : pattern;
					ensurePatterns(s, t, at);
					chosen[t] = at - 1;
				}
				a.scenes[index] = { patterns: chosen, mix };
				if (index === a.scene) {
					applyCurrentScene();
					// on screen: the tracks take the scene's mix now
					for (const { track } of given ?? []) {
						const t = trackIndex(track);
						Object.assign(trackMix(s, t), {
							level: mix[t].level,
							pan: mix[t].pan,
							muted: mix[t].muted
						});
					}
				}
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

		rehearse(keys) {
			const sequence = parseKeys(keys);
			if (sequence.chords.some((c) => c.terms.some((t) => t.gesture === 'turn'))) {
				throw new VirtualOpxyError(
					'a turn has no detents to follow: for a value, plan_steps with guide lights the way to it'
				);
			}
			const steps: RehearsedStep[] = [];
			let held: KeyTerm[] = [];
			sequence.chords.forEach((chord, i) => {
				held = chord.keepHeld ? held : [];
				// the step as the user does it: the keys still held from before, written out
				const shown = formatKeys({
					chords: [{ keepHeld: false, terms: [...held, ...chord.terms] }]
				});
				held = [...held, ...chord.terms.slice(0, -1)];
				// where the sequence so far leaves a copy of the replica
				const copy = new OpxySim({
					state: JSON.parse(JSON.stringify(s)) as SimState,
					now: () => 0
				});
				playStep(copy, { keys: formatKeys({ chords: sequence.chords.slice(0, i + 1) }) });
				steps.push({
					keys: shown,
					screen: describeFrame(buildFrame(copy.state)),
					music: musicMark(copy.state)
				});
			});
			return steps;
		},

		plan(goal) {
			if ('place' in goal) return planPlace(sim.state, goal.place);
			if ('settings' in goal) return planSettings(sim.state, goal.settings);
			if ('to' in goal) return planToSetting(sim.state, goal.to);
			if ('label' in goal) return planPageValue(sim.state, goal);
			return planParam(sim.state, goal);
		},

		checkpoint() {
			return { state: JSON.stringify(s) };
		},

		revert(to, from) {
			const reverted = takeBack(s, to.state, from?.state ?? JSON.stringify(s));
			if (reverted) changed();
			return reverted;
		},

		changesSince(checkpoint) {
			const was = JSON.parse(checkpoint.state) as SimState;
			const before = createVirtualOpxy({ sim: new OpxySim({ state: was, now: () => 0 }) });
			return replicaChanges(JSON.parse(checkpoint.state) as SimState, s, { before, after: api });
		},

		changedSince(checkpoint) {
			const was = JSON.parse(checkpoint.state) as SimState;
			const before = createVirtualOpxy({ sim: new OpxySim({ state: was, now: () => 0 }) });
			return replicaChangeList(JSON.parse(checkpoint.state) as SimState, s, {
				before,
				after: api
			});
		}
	};
	return api;
}
