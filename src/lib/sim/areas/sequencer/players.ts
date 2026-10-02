/**
 * Players (manual: players/overview, arpeggio, maestro, hold): `player` opens the selected track's
 * player page, and each further press switches the player on or off; `shift + player` shows the
 * list of players, E1 moves its box while shift is held, and letting go of shift opens the chosen
 * player's page (the owner's unit, 2026-09-29: pressing player again only switches the player on
 * and off). The page's encoders set the arpeggio (speed, pattern, range, hold; with shift: note length,
 * style, glide, stereo) and maestro (roll, pattern, hold). On the keyboard, while the player is on:
 * hold keeps the notes played sounding until the next ones; maestro stores a chord entered with
 * shift held and plays it from any key; the arpeggio runs over the held notes, and keeps running on
 * them with its hold on. What they sound like is the sound engine's job (`sequencer-playback.ts`);
 * the simulator shows the notes on the keyboard's LEDs.
 */
import type { SimState } from '../../params';
import {
	ARP_PATTERNS,
	ARP_SPEEDS,
	ARP_STYLES,
	MAESTRO_NOTES,
	MAESTRO_PATTERNS,
	PLAYER_TYPES,
	type PlayerSettings
} from '../../sequencer';
import {
	arpNoteAt,
	arpStepLength,
	arpeggio,
	latchNotes,
	maestroNotes,
	seededRng
} from '../../sequencer-playback';
import type { MaestroView, PlayerCard, PlayerFrame } from './frames';
import { activePattern, heldNotes, seq } from './model';

/** The player of the pattern the step keys address. */
export const playerOf = (s: SimState): PlayerSettings => activePattern(s).player;

/** Note names as the brain page writes them (lowercase, "c#4"). */
const NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'] as const;
export const noteName = (note: number) =>
	`${NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;

/**
 * `player`: opens the page; pressed on the page (the list included), switches the player on / off.
 * The first press with shift shows the list of players instead.
 */
export function playerPress(s: SimState): void {
	const player = playerOf(s);
	const st = seq(s);
	const open = s.overlay === 'players';
	if (s.shift && !st.playerList) {
		st.playerList = true;
	} else if (open) {
		player.on = !player.on;
		if (!player.on) st.sustained = [];
	}
	if (!open) {
		s.overlay = 'players';
		s.sub = null;
		s.picker = null;
	}
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Hold switched off lets go of what it kept. */
function setHold(s: SimState, target: { hold: boolean }, on: boolean): void {
	target.hold = on;
	if (!on) seq(s).sustained = [];
}

/**
 * While the list of players is up, E1 moves its box a type a detent (the owner's unit), stopping at
 * either end (ours); the other encoders do nothing there, and the page's settings stay as they were.
 */
function listTurn(s: SimState, e: number, delta: number): void {
	if (e !== 0) return;
	const player = playerOf(s);
	const at = clamp(PLAYER_TYPES.indexOf(player.type) + delta, 0, PLAYER_TYPES.length - 1);
	if (PLAYER_TYPES[at] === player.type) return;
	player.type = PLAYER_TYPES[at];
	seq(s).sustained = [];
}

/** E1–E4 on the player page. */
export function playerTurn(s: SimState, e: number, delta: number): void {
	if (seq(s).playerList) {
		listTurn(s, e, delta);
		return;
	}
	const player = playerOf(s);
	if (player.type === 'arpeggio') {
		const a = player.arp;
		if (s.shift) {
			if (e === 0) a.length = clamp(a.length + delta, 1, 99);
			else if (e === 1) a.style = clamp(a.style + delta, 0, ARP_STYLES.length - 1);
			else if (e === 2) a.glide = clamp(a.glide + delta, 0, 99);
			else a.stereo = clamp(a.stereo + delta, 0, 99);
			return;
		}
		if (e === 0) a.speed = clamp(a.speed + delta, 0, ARP_SPEEDS.length - 1);
		else if (e === 1) a.pattern = clamp(a.pattern + delta, 0, ARP_PATTERNS.length - 1);
		else if (e === 2) a.range = clamp(a.range + delta, 1, 4);
		else setHold(s, a, delta > 0);
	} else if (player.type === 'maestro') {
		const m = player.maestro;
		if (e === 0) m.roll = clamp(m.roll + delta, 0, 99);
		else if (e === 1) m.pattern = clamp(m.pattern + delta, 0, MAESTRO_PATTERNS.length - 1);
		else if (e === 3) setHold(s, m, delta > 0);
	}
}

/** A click on the player page: E4 flips hold (ours; the guide turns it). Not while the list is up. */
export function playerClick(s: SimState, e: number): void {
	const player = playerOf(s);
	if (e !== 3 || seq(s).playerList) return;
	if (player.type === 'arpeggio') setHold(s, player.arp, !player.arp.hold);
	else if (player.type === 'maestro') setHold(s, player.maestro, !player.maestro.hold);
}

/**
 * A keyboard key while the player is on. `heldBefore` are the notes that were already down.
 * Returns true when the key belongs to the player alone (maestro's chord entry with shift held).
 */
export function playerKey(s: SimState, note: number, heldBefore: readonly number[]): boolean {
	const player = playerOf(s);
	if (!player.on) return false;
	const st = seq(s);
	switch (player.type) {
		case 'maestro': {
			const m = player.maestro;
			if (s.shift) {
				// the page has room for eight: further notes are not kept
				const chord = st.chordFresh ? [note] : [...new Set([...m.chord, note])];
				m.chord = chord.slice(0, MAESTRO_NOTES).sort((a, b) => a - b);
				st.chordFresh = false;
				return true;
			}
			st.hits += 1;
			if (m.hold) st.sustained = maestroNotes(m.chord, note);
			return false;
		}
		case 'hold':
			st.sustained = latchNotes(st.sustained, heldBefore, note);
			return false;
		default:
			if (player.arp.hold) st.sustained = latchNotes(st.sustained, heldBefore, note);
			return false;
	}
}

/** The notes the arpeggio runs over: the keys held, else what its hold kept. */
function arpInput(s: SimState): number[] {
	const held = heldNotes(s);
	if (held.length > 0) return held;
	return playerOf(s).arp.hold ? seq(s).sustained : [];
}

/** The notes the player sounds now (lit on the keyboard), or null when it is off. */
export function playerNotes(s: SimState): number[] | null {
	const player = playerOf(s);
	if (!player.on) return null;
	const st = seq(s);
	const held = heldNotes(s);
	switch (player.type) {
		case 'hold':
			return [...new Set([...st.sustained, ...held])];
		case 'maestro':
			return [
				...new Set([...st.sustained, ...held.flatMap((n) => maestroNotes(player.maestro.chord, n))])
			];
		default: {
			const input = arpInput(s);
			const t = s.transport;
			if (input.length === 0 || !t.playing || t.position < 0) return input;
			const note = arpNoteAt(input, player.arp, t.position);
			return note === null ? input : [note];
		}
	}
}

/** Stop, or the player switched off: every kept note goes. */
export function releasePlayers(s: SimState): void {
	const st = seq(s);
	st.sustained = [];
	st.hits = 0;
}

const onOff = (on: boolean) => (on ? 'on' : 'off');
const two = (v: number) => String(Math.round(v)).padStart(2, '0');

/** Each note of the run as its rank among the run's pitches (0 = the lowest). */
function ranks(notes: readonly number[]): number[] {
	const pitches = [...new Set(notes)].sort((a, b) => a - b);
	return notes.map((n) => pitches.indexOf(n));
}

/** The player page (or, with shift + player, the list of players). */
export function playerFrame(s: SimState): PlayerFrame {
	const player = playerOf(s);
	const st = seq(s);
	const shift = s.shift && player.type === 'arpeggio';
	let cards: PlayerCard[] = [];
	let run: number[] = [];
	let at: number | null = null;
	let maestro: MaestroView | null = null;
	if (player.type === 'arpeggio') {
		const a = player.arp;
		cards = shift
			? [
					{ label: 'length', value: two(a.length) },
					{ label: 'style', value: ARP_STYLES[a.style] },
					{ label: 'glide', value: two(a.glide) },
					{ label: 'stereo', value: two(a.stereo) }
				]
			: [
					{ label: 'speed', value: ARP_SPEEDS[a.speed].label },
					{ label: 'pattern', value: ARP_PATTERNS[a.pattern] },
					{ label: 'range', value: `${a.range} oct` },
					{ label: 'hold', value: onOff(a.hold) }
				];
		const input = arpInput(s);
		// with nothing held the picture shows the pattern over a triad
		run = ranks(arpeggio(input.length > 0 ? input : [60, 64, 67], a, seededRng(1)));
		const t = s.transport;
		if (player.on && input.length > 0 && t.playing && t.position >= 0) {
			at = Math.floor(t.position / arpStepLength(a)) % run.length;
		}
	} else if (player.type === 'maestro') {
		const m = player.maestro;
		cards = [
			{ label: 'roll', value: two(m.roll) },
			{ label: 'pattern', value: MAESTRO_PATTERNS[m.pattern] },
			{ label: '', value: '' },
			{ label: 'hold', value: onOff(m.hold) }
		];
		maestro = {
			roll: m.roll,
			pattern: m.pattern,
			hold: m.hold,
			notes: m.chord.length,
			root: m.chord.length > 0 ? noteName(Math.min(...m.chord)) : null,
			chord: [...m.chord].sort((a, b) => a - b).map(noteName),
			// keys pressed with shift held enter the chord, they do not play it
			sounding: !s.shift && (playerNotes(s) ?? []).length > 0
		};
	}
	return {
		page: 'player',
		type: player.type,
		on: player.on,
		shift,
		cards,
		arp: player.type === 'arpeggio' ? { ...player.arp } : null,
		maestro,
		run,
		at,
		list: st.playerList ? { track: s.track + 1 } : null
	};
}
