/**
 * Arrange mode: patterns per track, the 99 scenes and song mode (guide art arrange-003, 020, 028;
 * manual arrange/*). The area owns the screen in arrange mode; the core keeps what arrange shares
 * with the other modes (track keys, step keys, playing the keyboard, the transport, `arrange`
 * pressed again flipping to the auxiliary tracks).
 *
 * Keys (manual units in brackets; "ours" where the manual is silent):
 * - `M1`…`M4`: new, copy, paste, clear a pattern of the selected track [arrange/patterns];
 *   `shift + M1`…`M4`: clone, copy, paste, reset the scene [arrange/scenes].
 * - `shift + accidental 1–9`: scene 1–9; `shift + accidental 0` then two black keys: scene 10–99; an
 *   empty scene starts as a copy of the current one [arrange/scenes].
 * - `shift + play`, then a scene: the scene waits for the current one to end [arrange/scene-queue].
 * - `turn E4`: the selected track's patterns; `click E4`: mute it [arrange/overview];
 *   `turn / click E3`: sound link, `shift + E3`: the link's source [arrange/sound-link].
 * - `shift + arrange`: song mode [arrange/song-mode], where `shift + accidentals` key scenes into
 *   the song at the cursor, `shift + M2 / M3` move the cursor, `shift + M4` deletes, `shift + M1`
 *   clears, `turn E1` loops, `shift + natural` picks one of 14 songs, `shift + natural + M2 / M3`
 *   copies and pastes songs, and `shift + [-] / [+]` cue entries while the song plays
 *   [arrange/songs]. `arrange` (or `shift + arrange`) goes back (ours).
 * - `play` in song mode plays the song from its first scene; `stop` ends it (ours: when a song
 *   starts is not documented).
 */
import type { SimArea } from '../types';
import {
	accidentalDigit,
	advanceArrange,
	browsePatterns,
	chooseScene,
	clearSong,
	cloneScene,
	copyPattern,
	copyScene,
	copySong,
	cueSong,
	deleteFromSong,
	moveCursor,
	naturalNumber,
	newPattern,
	pastePattern,
	pasteScene,
	pasteSong,
	removePattern,
	resetScene,
	selectSong,
	selectedTrack,
	setLink,
	setLinkSource,
	startSong,
	stopSong
} from './model';
import { PATTERN_KEYS, SCENES, type PatternAction } from './state';
import { arrangeLeds, heldSong, patternsFrame, songFrame } from './view';
import type { SimState } from '../../params';

/** What each pattern action does. */
const PATTERN_ACTIONS: Readonly<Record<PatternAction, (s: SimState) => unknown>> = {
	new: newPattern,
	copy: copyPattern,
	paste: pastePattern,
	clear: removePattern
};

/** Shift + M1…M4 in arrange mode. */
const SCENE_ACTIONS: readonly ((s: SimState) => unknown)[] = [
	cloneScene,
	copyScene,
	pasteScene,
	resetScene
];

/** Whether arrange owns the screen. */
const owns = (s: SimState) => s.overlay === null && s.sub === null && s.mode === 'arrange';

/** A black key with shift: a scene digit, for choosing, queueing or keying into the song. */
function sceneKey(s: SimState, digit: number): void {
	const a = s.areas.arrange;
	const purpose = a.view === 'song' ? 'song' : a.armed ? 'queue' : 'select';
	a.armed = false;
	if (digit === 0) a.entry = { digits: [], purpose };
	else chooseScene(s, digit - 1, purpose);
}

/** A black key while a scene number 10–99 is being typed (with shift or without: ours). */
function typeDigit(s: SimState, digit: number): void {
	const a = s.areas.arrange;
	const entry = a.entry;
	if (!entry) return;
	entry.digits.push(digit);
	if (entry.digits.length < 2) return;
	const scene = entry.digits[0] * 10 + entry.digits[1];
	a.entry = null;
	if (scene >= 1 && scene <= SCENES) chooseScene(s, scene - 1, entry.purpose);
}

/** M1–M4 (index 0–3). */
function moduleKey(s: SimState, key: number): void {
	const a = s.areas.arrange;
	if (a.view === 'song') {
		const song = heldSong(s);
		if (song !== null && (key === 1 || key === 2)) {
			if (key === 1) copySong(s, song);
			else pasteSong(s, song);
			return;
		}
		// song mode's keys need shift (manual: arrange/song-mode)
		if (!s.shift) return;
		if (key === 0) clearSong(s);
		else if (key === 1) moveCursor(s, -1);
		else if (key === 2) moveCursor(s, 1);
		else deleteFromSong(s);
		return;
	}
	if (s.shift) SCENE_ACTIONS[key](s);
	else PATTERN_ACTIONS[PATTERN_KEYS[key]](s);
}

export const arrange: SimArea = {
	id: 'arrange',
	owns,
	frame: (s) => (s.areas.arrange.view === 'song' ? songFrame(s) : patternsFrame(s)),

	/** Follows the transport from any mode, and takes shift + play in arrange (the queue). */
	claim(ctx, input) {
		const s = ctx.state;
		const a = s.areas.arrange;
		if (input.type === 'release' && input.id === 'key.shift') {
			a.armed = false;
			return false;
		}
		if (input.type !== 'press') return false;
		if (input.id === 'key.stop') {
			stopSong(a);
			a.queued = null;
			a.armed = false;
			a.lead = 0;
			return false;
		}
		if (input.id !== 'key.play') return false;
		if (s.shift && owns(s) && a.view === 'patterns') {
			// hold shift, tap play, then pick the scene (manual: arrange/scene-queue)
			a.armed = true;
			return true;
		}
		a.lead = 0;
		// play in song mode starts the song; pressed again while it plays, anywhere, it starts
		// over; any other play plays the current scene
		if (owns(s) && a.view === 'song') startSong(s);
		else if (a.playing && s.transport.playing) startSong(s);
		else if (a.playing) stopSong(a);
		return false;
	},

	press(ctx, id) {
		const s = ctx.state;
		const a = s.areas.arrange;
		const digit = accidentalDigit(id);
		if (a.entry) {
			if (digit !== null) {
				typeDigit(s, digit);
				return true;
			}
			// anything else ends the number unfinished
			a.entry = null;
		}
		if (id === 'key.arrange') {
			if (s.shift) {
				a.view = a.view === 'song' ? 'patterns' : 'song';
				return true;
			}
			if (a.view === 'song') {
				a.view = 'patterns';
				return true;
			}
			// the core flips between instrument and auxiliary tracks
			return false;
		}
		const m = /^key\.m([1-4])$/.exec(id);
		if (m) {
			moduleKey(s, Number(m[1]) - 1);
			return true;
		}
		if (!s.shift) return false;
		if (digit !== null) {
			sceneKey(s, digit);
			return true;
		}
		const natural = naturalNumber(id);
		if (natural !== null && a.view === 'song') {
			selectSong(s, natural - 1);
			return true;
		}
		if ((id === 'key.minus' || id === 'key.plus') && a.view === 'song') {
			cueSong(s, id === 'key.plus' ? 1 : -1);
			return true;
		}
		return false;
	},

	turn(ctx, encoder, delta) {
		const s = ctx.state;
		const a = s.areas.arrange;
		if (a.view === 'song') {
			// E1: loop on (right) or off (left) (manual: arrange/song-mode)
			if (encoder === 0) a.songs[a.song].loop = delta > 0;
			return;
		}
		const t = selectedTrack(s);
		if (encoder === 3) browsePatterns(s, delta);
		else if (encoder === 2) {
			if (s.shift) setLinkSource(s, t);
			else setLink(s, t, delta > 0);
		}
	},

	click(ctx, encoder) {
		const s = ctx.state;
		const a = s.areas.arrange;
		if (a.view === 'song') {
			if (encoder === 0) a.songs[a.song].loop = !a.songs[a.song].loop;
			return;
		}
		const t = selectedTrack(s);
		if (encoder === 3) {
			const mix = t < 8 ? s.tracks[t].mix : s.aux[t - 8].mix;
			mix.muted = !mix.muted;
		} else if (encoder === 2) {
			if (s.shift) setLinkSource(s, t);
			else setLink(s, t, !a.link[t].on);
		}
	},

	leds: arrangeLeds,
	advance: advanceArrange
};
