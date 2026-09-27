/**
 * What arrange does to a project, as plain functions of the simulator state: patterns per track
 * (manual: arrange/patterns), the sound each pattern carries and sound link (arrange/sound-link),
 * the 99 scenes (arrange/scenes), the scene queue (arrange/scene-queue), songs and song mode
 * (arrange/song-mode, arrange/songs), and what happens when a scene ends while the transport plays.
 *
 * Tracks are numbered as a scene addresses them: 0–7 the instrument tracks, 8–15 the auxiliary
 * tracks. Which pattern a track plays is its `sequence.current`; everything that changes it goes
 * through {@link playPattern}, so a pattern's sound travels with it. Patterns come and go here, so
 * what other parts keep per pattern follows them here too: the scenes, sound link's source, and
 * the brain's settings (the auxiliary area's list, OS 1.0.29). How long a scene lasts is the
 * project's setting, on the system area's settings page.
 */
import { KEYBOARD_NOTE_NAMES, type KeyId } from '$lib/core/opxy';
import { clamp, type SimState, type TrackState } from '../../params';
import {
	MAX_PATTERNS,
	STEPS_PER_BAR,
	currentPattern,
	emptyPattern,
	newPatternLike,
	noteCount,
	type Pattern,
	type Sequence
} from '../../sequencer';
import { brainSettings, editBrain, type BrainSettings } from '../auxiliary/state';
import { SCENE_LENGTH_MODES as PROJECT_LENGTH_MODES, SIGNATURES } from '../system/catalogue';
import {
	SCENES,
	SCENE_LENGTH_MODES,
	SCENE_TRACKS,
	SONG_LENGTH,
	TIME_SIGNATURES,
	type ArrangeState,
	type PatternSound,
	type Scene,
	type SceneLengthMode,
	type TimeSignature
} from './state';

/** A deep copy of plain data (works through Svelte's state proxies, unlike `structuredClone`). */
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The 16 track numbers a scene addresses. */
const TRACKS = Array.from({ length: SCENE_TRACKS }, (_, t) => t);
/** The brain, auxiliary track 1. */
const BRAIN = 8;

/** The black keys, marked 1–9 and 0 from the left (manual: hardware/layout). */
const ACCIDENTALS = KEYBOARD_NOTE_NAMES.filter((name) => name.includes('s'));
/** The white keys, `natural 1` … `natural 14` from the left. */
const NATURALS = KEYBOARD_NOTE_NAMES.filter((name) => !name.includes('s'));

/** The digit a key stands for when it is a black key (`accidental 0` is the last one), else null. */
export function accidentalDigit(id: string): number | null {
	if (!id.startsWith('keyboard.')) return null;
	const at = (ACCIDENTALS as readonly string[]).indexOf(id.slice('keyboard.'.length));
	return at < 0 ? null : (at + 1) % 10;
}

/** The key id of the black key marked `digit` (0–9). */
export function accidentalKey(digit: number): KeyId {
	return `keyboard.${ACCIDENTALS[(digit + 9) % 10]}`;
}

/** Which white key (1–14) an id is, or null. */
export function naturalNumber(id: string): number | null {
	if (!id.startsWith('keyboard.')) return null;
	const at = (NATURALS as readonly string[]).indexOf(id.slice('keyboard.'.length));
	return at < 0 ? null : at + 1;
}

/** The key id of white key `n` (1–14). */
export function naturalKey(n: number): KeyId {
	return `keyboard.${NATURALS[n - 1]}`;
}

// ───────────────────────────────────────────────────────────────── tracks

/** The sequence of track `t` (0–7 instrument, 8–15 auxiliary). */
export function trackSequence(s: SimState, t: number): Sequence {
	return t < 8 ? s.tracks[t].sequence : s.aux[t - 8].sequence;
}

/** The mixer strip of track `t`. */
function trackMix(s: SimState, t: number): SceneMix {
	return t < 8 ? s.tracks[t].mix : s.aux[t - 8].mix;
}
type SceneMix = Scene['mix'][number];

/** The track the arrange keys act on: the selected one of the set arrange shows. */
export function selectedTrack(s: SimState): number {
	return s.banks.arrange === 'instrument' ? s.track : 8 + s.auxTrack;
}

/** Whether a pattern has no notes (what paste may overwrite). */
export const isEmpty = (pattern: Pattern) => noteCount(pattern) === 0;

// ───────────────────────────────────────────────────────────────── sounds

/** The sound track `t` plays now, copied. */
function soundOf(track: TrackState): PatternSound {
	const { engine, m1, amp, filterEnv, playMode, filter, sends, lfo, drumKeys, midi } = track;
	return copy({ engine, m1, amp, filterEnv, playMode, filter, sends, lfo, drumKeys, midi });
}

/** Loads a stored sound into a track. */
function loadSound(track: TrackState, sound: PatternSound): void {
	Object.assign(track, copy(sound));
}

/** The sound slots of instrument track `t`, one per pattern (padded if patterns came from elsewhere). */
function slots(a: ArrangeState, t: number, patterns: number): (PatternSound | null)[] {
	const list = a.sounds[t];
	while (list.length < patterns) list.push(null);
	return list;
}

/** Stores what instrument track `t` plays in the slot it belongs to: the link's source, or its pattern. */
function keepSound(s: SimState, t: number): void {
	const a = s.areas.arrange;
	const seq = trackSequence(s, t);
	const link = a.link[t];
	slots(a, t, seq.patterns.length)[link.on ? link.source : seq.current] = soundOf(s.tracks[t]);
}

/**
 * Makes pattern `index` the one track `t` plays. On an instrument track the sound goes with the
 * pattern (manual: arrange/patterns): the sound it leaves is kept with the old pattern and the new
 * pattern's own sound loads, unless sound link holds one sound for the track (arrange/sound-link).
 */
export function playPattern(s: SimState, t: number, index: number): void {
	const seq = trackSequence(s, t);
	const target = clamp(Math.round(index), 0, seq.patterns.length - 1);
	if (target === seq.current) return;
	if (t < 8) {
		const a = s.areas.arrange;
		keepSound(s, t);
		seq.current = target;
		const own = slots(a, t, seq.patterns.length)[target];
		if (!a.link[t].on && own) loadSound(s.tracks[t], own);
	} else seq.current = target;
	// the step keys keep showing a bar the new pattern has
	seq.page = clamp(seq.page, 0, Math.max(0, currentPattern(seq).bars - 1));
}

/**
 * Sound link on or off for track `t` (turn or click E3). On, the track keeps the source pattern's
 * sound whatever pattern plays; off, each pattern's own sound comes back (ours: the guide does not
 * say what happens when the link goes off).
 */
export function setLink(s: SimState, t: number, on: boolean): void {
	const a = s.areas.arrange;
	const link = a.link[t];
	if (link.on === on) return;
	if (t >= 8) {
		link.on = on;
		return;
	}
	keepSound(s, t);
	link.on = on;
	const seq = trackSequence(s, t);
	const wanted = slots(a, t, seq.patterns.length)[on ? link.source : seq.current];
	if (wanted) loadSound(s.tracks[t], wanted);
}

/** The pattern playing on track `t` becomes the link's source (shift + E3); the link turns on. */
export function setLinkSource(s: SimState, t: number): void {
	const a = s.areas.arrange;
	const link = a.link[t];
	const seq = trackSequence(s, t);
	if (t < 8) keepSound(s, t);
	link.source = seq.current;
	link.on = true;
	if (t >= 8) return;
	const wanted = slots(a, t, seq.patterns.length)[link.source];
	if (wanted) loadSound(s.tracks[t], wanted);
}

// ───────────────────────────────────────────────────────────────── patterns

/**
 * M1: a new, empty pattern on the selected track, up to 16 (manual: arrange/patterns). It is added
 * after the others and plays at once, with the sound the track plays now (ours: the guide does not
 * say where it goes), and takes over the player type in use (OS 1.1.25). Returns false when the
 * track is full.
 */
export function newPattern(s: SimState): boolean {
	const t = selectedTrack(s);
	const seq = trackSequence(s, t);
	if (seq.patterns.length >= MAX_PATTERNS) return false;
	seq.patterns.push(newPatternLike(currentPattern(seq)));
	if (t < 8) slots(s.areas.arrange, t, seq.patterns.length - 1).push(null);
	// the brain's new pattern starts from the settings it plays now, as an instrument track's
	// starts with its sound (ours, by analogy with arrange/patterns)
	if (t === BRAIN) {
		pasteBrain(s, seq.patterns.length - 1, brainSettings(s.areas.auxiliary, seq.current));
	}
	playPattern(s, t, seq.patterns.length - 1);
	return true;
}

/**
 * M2: copies the selected track's pattern with the sound it plays (manual: arrange/patterns), or on
 * the brain track with its brain settings.
 */
export function copyPattern(s: SimState): void {
	const t = selectedTrack(s);
	const seq = trackSequence(s, t);
	s.areas.arrange.clipboard.pattern = {
		pattern: copy(currentPattern(seq)),
		sound: t < 8 ? soundOf(s.tracks[t]) : null,
		brain: t === BRAIN ? copy(brainSettings(s.areas.auxiliary, seq.current)) : null
	};
}

// The brain track keeps its settings per pattern (OS 1.0.29), in the auxiliary area's list by
// pattern number; the patterns come and go here, so the list follows them here.

/** Pattern `index` of the brain track takes the brain settings of a copy. */
function pasteBrain(s: SimState, index: number, brain: BrainSettings): void {
	Object.assign(editBrain(s.areas.auxiliary, index), copy(brain));
}

/**
 * Brain pattern `gone` of `count` is removed: every pattern first gets its own settings (one without
 * shows the first's), so taking the removed one's out of the list changes no other pattern's.
 */
function removeBrain(s: SimState, count: number, gone: number): void {
	const aux = s.areas.auxiliary;
	editBrain(aux, count - 1);
	aux.brain.patterns.splice(gone, 1);
}

/**
 * M3: pastes the copy onto the selected track. An empty pattern is overwritten; otherwise the copy
 * becomes a new pattern (the device only adds a pattern when the current one is not empty, OS
 * 1.0.29), which plays at once. A copy from an instrument track brings its whole sound to an
 * instrument track (manual: arrange/patterns); between instrument and auxiliary tracks only the
 * notes travel (ours). Returns false when there is nothing to paste or no room.
 */
export function pastePattern(s: SimState): boolean {
	const a = s.areas.arrange;
	const clip = a.clipboard.pattern;
	if (!clip) return false;
	const t = selectedTrack(s);
	const seq = trackSequence(s, t);
	const sound = t < 8 ? clip.sound : null;
	const brain = t === BRAIN ? clip.brain : null;
	if (isEmpty(currentPattern(seq))) {
		seq.patterns[seq.current] = copy(clip.pattern);
		if (sound) {
			slots(a, t, seq.patterns.length)[seq.current] = copy(sound);
			const link = a.link[t];
			if (!link.on || link.source === seq.current) loadSound(s.tracks[t], sound);
		}
		if (brain) pasteBrain(s, seq.current, brain);
		return true;
	}
	if (seq.patterns.length >= MAX_PATTERNS) return false;
	seq.patterns.push(copy(clip.pattern));
	if (t < 8) slots(a, t, seq.patterns.length - 1).push(sound ? copy(sound) : null);
	if (brain) pasteBrain(s, seq.patterns.length - 1, brain);
	playPattern(s, t, seq.patterns.length - 1);
	return true;
}

/**
 * M4: removes the selected track's pattern (manual: arrange/patterns); the one before it plays
 * next. A track keeps at least one pattern, so the last one is emptied instead (ours). Scenes, the
 * link's source and the brain's settings that pointed past it move down with the patterns.
 */
export function removePattern(s: SimState): void {
	const a = s.areas.arrange;
	const t = selectedTrack(s);
	const seq = trackSequence(s, t);
	if (seq.patterns.length <= 1) {
		seq.patterns[0] = emptyPattern();
		seq.page = 0;
		return;
	}
	const gone = seq.current;
	if (t === BRAIN) removeBrain(s, seq.patterns.length, gone);
	const landing = gone > 0 ? gone - 1 : 1;
	playPattern(s, t, landing);
	seq.patterns.splice(gone, 1);
	if (t < 8) slots(a, t, seq.patterns.length + 1).splice(gone, 1);
	seq.current = landing > gone ? landing - 1 : landing;
	const shift = (p: number) => (p > gone ? p - 1 : p === gone ? Math.max(0, gone - 1) : p);
	for (const scene of a.scenes) if (scene) scene.patterns[t] = shift(scene.patterns[t] ?? 0);
	a.link[t].source = shift(a.link[t].source);
}

/** E4: steps the selected track through its patterns (manual: arrange/overview). */
export function browsePatterns(s: SimState, delta: number): void {
	const t = selectedTrack(s);
	playPattern(s, t, trackSequence(s, t).current + delta);
}

// ───────────────────────────────────────────────────────────────── scenes

/** The current state of the tracks as a scene: every track's pattern and mix. */
export function captureScene(s: SimState): Scene {
	return {
		patterns: TRACKS.map((t) => trackSequence(s, t).current),
		mix: TRACKS.map((t) => {
			const { level, pan, muted } = trackMix(s, t);
			return { level, pan, muted };
		})
	};
}

/** Puts every track on the scene's pattern and mix. */
function applyScene(s: SimState, scene: Scene): void {
	for (const t of TRACKS) {
		playPattern(s, t, scene.patterns[t] ?? 0);
		const mix = scene.mix[t];
		if (mix) Object.assign(trackMix(s, t), { level: mix.level, pan: mix.pan, muted: mix.muted });
	}
}

/** Whether scene `index` holds nothing yet. */
export const sceneIsEmpty = (a: ArrangeState, index: number) =>
	index !== a.scene && a.scenes[index] === null;

/**
 * Switches to scene `index` at once (manual: arrange/scenes): the scene being left keeps what the
 * tracks play now, an empty scene starts as a copy of it, and every track takes the new scene's
 * pattern and mix. The playhead keeps its place.
 */
export function selectScene(s: SimState, index: number): void {
	const a = s.areas.arrange;
	if (!Number.isInteger(index) || index < 0 || index >= SCENES || index === a.scene) return;
	const here = captureScene(s);
	a.scenes[a.scene] = here;
	const there = a.scenes[index] ?? copy(here);
	a.scenes[index] = there;
	applyScene(s, copy(there));
	a.scene = index;
}

/**
 * Shift + M1: clones the current scene into the next empty one and moves there (ours: the guide
 * says only "clone"; we pick the next free scene so nothing is overwritten). False when all 99
 * are used.
 */
export function cloneScene(s: SimState): boolean {
	const a = s.areas.arrange;
	for (let k = 1; k < SCENES; k++) {
		const j = (a.scene + k) % SCENES;
		if (!sceneIsEmpty(a, j)) continue;
		const here = captureScene(s);
		a.scenes[a.scene] = here;
		a.scenes[j] = copy(here);
		a.scene = j;
		return true;
	}
	return false;
}

/** Shift + M2: copies the current scene. */
export function copyScene(s: SimState): void {
	s.areas.arrange.clipboard.scene = captureScene(s);
}

/** Shift + M3: pastes the copied scene over the current one. */
export function pasteScene(s: SimState): boolean {
	const a = s.areas.arrange;
	const clip = a.clipboard.scene;
	if (!clip) return false;
	applyScene(s, copy(clip));
	a.scenes[a.scene] = captureScene(s);
	return true;
}

/** Shift + M4: every track back on pattern 1 (manual: arrange/scenes). */
export function resetScene(s: SimState): void {
	for (const t of TRACKS) playPattern(s, t, 0);
}

/** Sixteenths in one bar of each time signature. */
const BAR: Readonly<Record<TimeSignature, number>> = {
	'3/4': 12,
	'4/4': 16,
	'5/4': 20,
	'6/8': 12,
	'7/8': 14,
	'12/8': 24
};

/**
 * The project's scene length mode and time signature, as its settings page sets them (project →
 * M4: general, tempo; manual: project/settings). The page is the system area's: its choices are
 * read by name, so a mode the page does not offer (yet) is simply never chosen.
 */
export function lengthSettings(s: SimState): { mode: SceneLengthMode; signature: TimeSignature } {
	const settings = s.areas.system.projectSettings;
	const mode: string | undefined = PROJECT_LENGTH_MODES[settings.sceneLength];
	const signature: string | undefined = SIGNATURES[settings.signature];
	return {
		mode: SCENE_LENGTH_MODES.find((m) => m === mode) ?? 'longest',
		signature: TIME_SIGNATURES.find((t) => t === signature) ?? '4/4'
	};
}

/** How long the current scene lasts, in sixteenths, by the project's settings ({@link lengthIn}). */
export function sceneLength(s: SimState): number {
	const { mode, signature } = lengthSettings(s);
	return lengthIn(s, mode, signature);
}

/**
 * How long the current scene lasts in a scene length mode, in sixteenths: its longest pattern by
 * default (manual: arrange/scenes), the shortest, or one bar of the time signature (ours: the guide
 * does not describe the modes). A pattern lasts its length times its track scale. Only patterns
 * with notes count, so an untouched track does not cut a scene short (ours); with no notes
 * anywhere, all patterns count.
 */
export function lengthIn(s: SimState, mode: SceneLengthMode, signature: TimeSignature): number {
	if (mode === 'time signature') return BAR[signature];
	const all = TRACKS.map((t) => currentPattern(trackSequence(s, t)));
	const used = all.filter((p) => !isEmpty(p));
	const lengths = (used.length > 0 ? used : all).map((p) => p.length * p.scale);
	const length = mode === 'shortest' ? Math.min(...lengths) : Math.max(...lengths);
	return length > 0 ? length : STEPS_PER_BAR;
}

/**
 * Chooses scene `index` for `purpose`: select it now, queue it (while playing; stopped, there is
 * nothing to wait for, so it switches at once), or add it to the song at the cursor.
 */
export function chooseScene(
	s: SimState,
	index: number,
	purpose: 'select' | 'queue' | 'song'
): void {
	const a = s.areas.arrange;
	if (index < 0 || index >= SCENES) return;
	if (purpose === 'song') insertInSong(s, index);
	else if (purpose === 'queue' && s.transport.playing) a.queued = index;
	else selectScene(s, index);
}

// ───────────────────────────────────────────────────────────────── songs

/** Keeps the song editor's cursor on screen (four rows of eight). */
function followCursor(a: ArrangeState): void {
	const row = Math.floor(a.cursor / 8);
	if (row < a.scroll) a.scroll = row;
	else if (row > a.scroll + 3) a.scroll = row - 3;
}

/**
 * Shift + a black key in song mode: the scene goes into the song order at the cursor, which moves
 * past it, like keying in a phone number (manual: arrange/song-mode). Up to 96 entries.
 */
export function insertInSong(s: SimState, scene: number): boolean {
	const a = s.areas.arrange;
	const song = a.songs[a.song];
	if (song.order.length >= SONG_LENGTH) return false;
	const at = clamp(a.cursor, 0, song.order.length);
	song.order.splice(at, 0, scene);
	if (a.playing && at <= a.position) a.position++;
	a.cursor = at + 1;
	followCursor(a);
	return true;
}

/** Shift + M2 / M3: the cursor one entry back or on. */
export function moveCursor(s: SimState, by: number): void {
	const a = s.areas.arrange;
	a.cursor = clamp(a.cursor + by, 0, a.songs[a.song].order.length);
	followCursor(a);
}

/**
 * Shift + M4: takes a scene out of the song order; the scene itself stays in the project (manual:
 * arrange/song-mode). The entry before the cursor goes, as a phone's delete key does, or the first
 * one when the cursor is at the start (ours: the guide says "at the cursor").
 */
export function deleteFromSong(s: SimState): boolean {
	const a = s.areas.arrange;
	const order = a.songs[a.song].order;
	if (order.length === 0) return false;
	const at = a.cursor > 0 ? a.cursor - 1 : 0;
	order.splice(at, 1);
	if (a.cursor > 0) a.cursor--;
	if (a.playing && at < a.position) a.position--;
	if (order.length === 0) stopSong(a);
	else a.position = Math.min(a.position, order.length - 1);
	if (a.cue !== null) a.cue = Math.min(a.cue, order.length - 1);
	followCursor(a);
	return true;
}

/** Shift + M1: empties the song order without touching any scene (manual: arrange/song-mode). */
export function clearSong(s: SimState): void {
	const a = s.areas.arrange;
	a.songs[a.song].order = [];
	a.cursor = 0;
	a.scroll = 0;
	stopSong(a);
}

/**
 * Shift + a white key in song mode: song `index` (0–13) (manual: arrange/songs). The cursor goes to
 * its end. While a song plays, the new one starts from its first scene when the current scene ends.
 */
export function selectSong(s: SimState, index: number): void {
	const a = s.areas.arrange;
	if (index < 0 || index >= a.songs.length || index === a.song) return;
	a.song = index;
	a.cursor = a.songs[index].order.length;
	a.scroll = 0;
	followCursor(a);
	a.cue = null;
	if (a.playing) a.position = -1;
	else a.position = 0;
}

/** Natural + M2 in song mode: copies that white key's song. */
export function copySong(s: SimState, index: number): void {
	const a = s.areas.arrange;
	a.clipboard.song = copy(a.songs[index]);
}

/** Natural + M3 in song mode: the copied song replaces that white key's song. */
export function pasteSong(s: SimState, index: number): boolean {
	const a = s.areas.arrange;
	if (!a.clipboard.song) return false;
	a.songs[index] = copy(a.clipboard.song);
	if (index === a.song) {
		a.cursor = Math.min(a.cursor, a.songs[index].order.length);
		followCursor(a);
		if (a.playing) a.position = -1;
	}
	return true;
}

/** Shift + [-] / [+] while a song plays: cues an earlier or later entry (manual: arrange/songs). */
export function cueSong(s: SimState, by: number): void {
	const a = s.areas.arrange;
	const order = a.songs[a.song].order;
	if (!a.playing || order.length === 0) return;
	a.cue = clamp((a.cue ?? a.position) + by, 0, order.length - 1);
}

/** Play in song mode: the song starts from its first scene (ours: play always starts from the top). */
export function startSong(s: SimState): void {
	const a = s.areas.arrange;
	const order = a.songs[a.song].order;
	a.queued = null;
	a.cue = null;
	if (order.length === 0) {
		a.playing = false;
		a.position = 0;
		return;
	}
	a.playing = true;
	a.position = 0;
	selectScene(s, order[0]);
}

/** The song stops playing (stop, or the song ran out). */
export function stopSong(a: ArrangeState): void {
	a.playing = false;
	a.position = 0;
	a.cue = null;
}

// ───────────────────────────────────────────────────────────────── time

/**
 * The current scene came to its end: a queued scene takes over, else a playing song moves on (to a
 * cued entry if there is one), looping or stopping at its end (loop off stops playback, the
 * option OS 1.0.45 added; ours to tie it to the loop setting). Returns what happened.
 */
function sceneEnded(s: SimState): 'next' | 'again' | 'stop' {
	const a = s.areas.arrange;
	if (a.queued !== null) {
		const next = a.queued;
		a.queued = null;
		selectScene(s, next);
		return 'next';
	}
	if (!a.playing) return 'again';
	const song = a.songs[a.song];
	if (song.order.length === 0) {
		stopSong(a);
		return 'again';
	}
	let next = a.cue ?? a.position + 1;
	a.cue = null;
	if (next >= song.order.length) {
		if (!song.loop) {
			stopSong(a);
			return 'stop';
		}
		next = 0;
	}
	a.position = next;
	selectScene(s, song.order[next]);
	return 'next';
}

/**
 * The transport moved from `from` to its position: at each scene end on the way a queued scene or
 * the song's next scene takes over, and the playhead then counts from the new scene's start, so
 * every track begins it on its first step. A song with loop off stops the transport after its last
 * scene. A count-in runs below zero and ends where the scene starts, which is no scene end.
 */
export function movedArrange(s: SimState, from: number): void {
	const t = s.transport;
	let position = from;
	let left = t.position - from;
	if (!t.playing || left <= 0) return;
	for (let guard = 0; guard < 4096; guard++) {
		const length = sceneLength(s);
		const end = position < 0 ? 0 : (Math.floor(position / length + 1e-9) + 1) * length;
		if (position + left < end - 1e-9) break;
		left -= end - position;
		position = end;
		if (end === 0) continue;
		const what = sceneEnded(s);
		if (what === 'stop') {
			t.playing = false;
			t.position = 0;
			return;
		}
		if (what === 'next') position = 0;
	}
	t.position = position + Math.max(0, left);
}
