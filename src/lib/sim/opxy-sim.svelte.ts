/**
 * Our behavioural simulator of the OP-XY's user interface (decision D10). The firmware is closed,
 * so this reproduces what the manual documents: the main modes, the module pages M1–M4 and their
 * shift layers, track selection, the tempo / project / COM pages, encoder turns and clicks with
 * plausible ranges, tap tempo, the transport and the LEDs. Input arrives as the replica's events
 * (press, release, turn, click by control id); `frame` is what the screen shows, `leds` what the
 * key windows light. State is one reactive object, so Svelte views update as it changes.
 *
 * @example
 * const sim = new OpxySim();
 * sim.press('key.m2'); // envelopes
 * sim.input({ type: 'turn', id: 'encoder.1', delta: 3 }); // attack +3
 * sim.frame; // { page: 'envelope', … }
 */
import { KEYBOARD_NOTE_NAMES, type KeyId } from '$lib/core/opxy';
import type { KeyLedState } from '$lib/replica/state.svelte';
import { AREAS, ownerOf } from './areas/registry';
import { turnSamplerPage } from './areas/sample/m1';
import type { AreaContext } from './areas/types';
import { buildFrame, buildLeds } from './frames';
import type { SimInput } from './input';
import {
	ENGINE_LIST,
	FILTER_TYPES,
	GROOVES,
	LFO_SYNC_STEPS,
	LFO_TYPES,
	MULTI_OUT_MODES,
	TEMPO_RANGE,
	clamp,
	defaultState,
	defaultTrack,
	isSampler,
	type Bank,
	type Overlay,
	type PageNumber,
	type SimState,
	type TrackState
} from './params';
import { DESTINATIONS, SENSOR_DESTINATIONS } from './screen/pages/lfo';
import type { ScreenFrame } from './screen/frame';
import { STEPS_PER_BAR, currentPattern, toggleNote, toggleStep } from './sequencer';

export type { SimInput } from './input';

/** The first keyboard key's note (F3). */
const KEYBOARD_BASE = 53;

/** Options for {@link OpxySim}. */
export interface OpxySimOptions {
	/** Milliseconds clock for tap tempo (default `performance.now`). */
	readonly now?: () => number;
	/** Start from this state instead of a new project. */
	readonly state?: SimState;
}

/** Taps further apart than this start a new tap-tempo count. */
const TAP_TIMEOUT_MS = 2000;
/** Module keys and the page they open. */
const OVERLAY_KEYS: Readonly<Record<string, Overlay>> = {
	'key.tempo': 'tempo',
	'key.project': 'project',
	'key.com': 'com',
	'key.sample': 'sample',
	'key.player': 'players',
	'key.bar': 'bar'
};
/** Soft-key sub-pages of the project and COM pages (named, not drawn). */
const SOFT_PAGES: Readonly<Record<'project' | 'com', readonly string[]>> = {
	project: ['new project (hold M1)', 'project saved', 'rename project', 'project settings'],
	com: ['system settings', 'controller mode', 'devices', 'mtp mode']
};

const encoderIndex = (id: string) => {
	const m = /^encoder\.([1-4])$/.exec(id);
	return m ? Number(m[1]) - 1 : -1;
};

export class OpxySim {
	/** Everything the simulator knows (reactive; mutate only through {@link input}). */
	state = $state<SimState>(defaultState());
	readonly #now: () => number;
	/**
	 * Steps with notes being held, by pattern index: cleared on release unless something was edited
	 * while they were down (a key toggled, another step pressed). Bookkeeping, never rendered.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly #pendingClear = new Map<number, boolean>();

	constructor(options: OpxySimOptions = {}) {
		this.#now = options.now ?? (() => performance.now());
		if (options.state) this.state = options.state;
	}

	/** What the screen shows now. */
	get frame(): ScreenFrame {
		return buildFrame(this.state);
	}

	/** What the LED windows show now (every track, step and held keyboard key). */
	get leds(): Partial<Record<KeyId, KeyLedState>> {
		return buildLeds(this.state);
	}

	/** The active instrument track. */
	get track(): TrackState {
		return this.state.tracks[this.state.track];
	}

	/** Back to a new project (or the given state). */
	reset(state: SimState = defaultState()): void {
		this.state = state;
	}

	/** Presses and releases a key or encoder push. */
	press(id: string): void {
		this.input({ type: 'press', id });
		this.input({ type: 'release', id });
	}

	/** Holds `modifier` while pressing `id` ("shift + M1"). */
	combo(modifier: string, id: string): void {
		this.input({ type: 'press', id: modifier });
		this.press(id);
		this.input({ type: 'release', id: modifier });
	}

	/** Turns an encoder by whole detents. */
	turn(encoder: 1 | 2 | 3 | 4, delta: number, fine = false): void {
		this.input({ type: 'turn', id: `encoder.${encoder}`, delta, fine });
	}

	/** Clicks an encoder. */
	click(encoder: 1 | 2 | 3 | 4): void {
		this.input({ type: 'click', id: `encoder.${encoder}` });
	}

	/** What the areas work with. */
	#context(): AreaContext {
		return {
			state: this.state,
			isHeld: (id) => this.state.held.includes(id),
			now: this.#now
		};
	}

	/**
	 * Handles one input event: held keys are recorded first, then every area may claim it, then the
	 * area that owns the screen, then the core. Unknown controls are ignored.
	 */
	input(event: SimInput): void {
		const s = this.state;
		if (event.type === 'press') {
			if (!s.held.includes(event.id)) s.held.push(event.id);
			if (event.id === 'key.shift') s.shift = true;
		} else if (event.type === 'release') {
			const at = s.held.indexOf(event.id);
			if (at >= 0) s.held.splice(at, 1);
			if (event.id === 'key.shift') s.shift = false;
		}
		const ctx = this.#context();
		if (AREAS.some((area) => area.claim?.(ctx, event))) return;
		switch (event.type) {
			case 'press':
				this.#press(event.id);
				break;
			case 'release':
				this.#release(event.id);
				break;
			case 'turn': {
				const e = encoderIndex(event.id);
				if (e >= 0 && event.delta !== 0) this.#turn(e, Math.trunc(event.delta), !!event.fine);
				break;
			}
			case 'click': {
				const e = encoderIndex(event.id);
				if (e >= 0) this.#click(e);
				break;
			}
			case 'bend':
				break;
		}
	}

	/**
	 * Moves time forward: while playing, the playhead advances a sixteenth per step length at the
	 * current tempo (the pendulum and meters follow it).
	 */
	advance(ms: number): void {
		if (ms <= 0) return;
		for (const area of AREAS) area.advance?.(this.state, ms);
		const t = this.state.transport;
		if (!t.playing) return;
		const stepMs = 60000 / this.state.tempo.bpm / 4;
		t.position += ms / stepMs;
	}

	// ─────────────────────────────────────────────────────────── following a device

	/**
	 * One MIDI clock tick from a connected OP-XY (24 per beat): while playing, the playhead moves a
	 * sixth of a step, so the steps chase in time with the device instead of the page's clock.
	 */
	clockTick(): void {
		const t = this.state.transport;
		if (t.playing) t.position += 1 / 6;
	}

	/** The device started (from the top, unless it continues) or stopped. */
	follow(transport: 'start' | 'continue' | 'stop'): void {
		const t = this.state.transport;
		t.playing = transport !== 'stop';
		if (transport !== 'continue') t.position = 0;
	}

	/** The device's tempo (measured from its clock, or what the app set). */
	setTempo(bpm: number): void {
		this.state.tempo.bpm = clamp(Math.round(bpm * 10) / 10, TEMPO_RANGE.min, TEMPO_RANGE.max);
	}

	/** The instrument track (0–7) the app selected on the device. */
	selectTrack(index: number): void {
		if (!Number.isInteger(index) || index < 0 || index > 7) return;
		this.state.track = index;
	}

	// ───────────────────────────────────────────────────────────── keys

	#isHeld(id: string): boolean {
		return this.state.held.includes(id);
	}

	#press(id: string): void {
		const s = this.state;
		if (id === 'key.shift') return;
		if (ownerOf(s)?.press?.(this.#context(), id)) return;
		if (id in OVERLAY_KEYS) {
			this.#overlayKey(OVERLAY_KEYS[id]);
			return;
		}
		const m = /^key\.m([1-4])$/.exec(id);
		if (m) {
			this.#moduleKey(Number(m[1]) as PageNumber);
			return;
		}
		const track = /^track\.([1-8])$/.exec(id);
		if (track) {
			this.#trackKey(Number(track[1]) - 1);
			return;
		}
		const step = /^step\.(\d+)$/.exec(id);
		if (step) {
			this.#stepKey(Number(step[1]) - 1);
			return;
		}
		if (id.startsWith('keyboard.')) {
			this.#keyboardKey(id.slice('keyboard.'.length));
			return;
		}
		switch (id) {
			case 'key.instrument':
			case 'key.auxiliary':
				this.#modeKey(id === 'key.instrument' ? 'instrument' : 'auxiliary');
				break;
			case 'key.arrange':
			case 'key.mix':
				this.#modeKey(id === 'key.arrange' ? 'arrange' : 'mix');
				break;
			case 'key.play':
				// play starts; pressed again while playing it jumps back to the start (manual: layout)
				s.transport.playing = true;
				s.transport.position = 0;
				break;
			case 'key.stop':
				s.transport.playing = false;
				s.transport.position = 0;
				break;
			case 'key.record':
				s.transport.recording = !s.transport.recording;
				break;
		}
	}

	#release(id: string): void {
		if (ownerOf(this.state)?.release?.(this.#context(), id)) return;
		const step = /^step\.(\d+)$/.exec(id);
		if (step) this.#stepReleased(Number(step[1]) - 1);
	}

	/** Leaves overlays, sub-pages and pickers. */
	#closeAll(): void {
		this.state.overlay = null;
		this.state.sub = null;
		this.state.picker = null;
	}

	#modeKey(mode: SimState['mode']): void {
		const s = this.state;
		const again = s.mode === mode && s.overlay === null && s.sub === null;
		if (s.shift && mode === 'instrument') {
			s.sub = `preset settings · T${s.track + 1}`;
			return;
		}
		this.#closeAll();
		if ((mode === 'arrange' || mode === 'mix') && again) {
			// pressing arrange / mix again swaps the track keys between the two sets
			s.banks[mode] = s.banks[mode] === 'instrument' ? 'auxiliary' : 'instrument';
		}
		s.mode = mode;
		if (mode === 'instrument' || mode === 'auxiliary') s.active = mode;
		else s.active = s.banks[mode];
	}

	#overlayKey(overlay: Overlay): void {
		const s = this.state;
		if (overlay === 'tempo') {
			const now = this.#now();
			if (s.overlay === 'tempo' && s.sub === null) {
				this.#tap(now);
				return;
			}
			s.taps = [now];
		} else if (s.overlay === overlay && s.sub === null) {
			// the key again goes back to the mode's page
			this.#closeAll();
			return;
		}
		s.sub = null;
		s.picker = null;
		s.overlay = overlay;
	}

	/** Tap tempo: the mean of the last three intervals, once two taps are close enough. */
	#tap(now: number): void {
		const s = this.state;
		const last = s.taps[s.taps.length - 1];
		if (last === undefined || now - last > TAP_TIMEOUT_MS || now <= last) {
			s.taps = [now];
			return;
		}
		s.taps = [...s.taps, now].slice(-4);
		const intervals = s.taps.slice(1).map((t, i) => t - s.taps[i]);
		const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
		s.tempo.bpm = clamp(Math.round((60000 / mean) * 10) / 10, TEMPO_RANGE.min, TEMPO_RANGE.max);
	}

	#moduleKey(page: PageNumber): void {
		const s = this.state;
		if (s.sub) {
			s.sub = null;
			return;
		}
		if (s.overlay === 'project' || s.overlay === 'com') {
			s.sub = SOFT_PAGES[s.overlay][page - 1];
			if (s.overlay === 'project' && page === 2 && s.shift) s.sub = 'save project as';
			return;
		}
		if (s.overlay) this.#closeAll();
		if (s.mode === 'instrument') {
			if (s.picker) {
				// the same key again (or any other) leaves the list without changing anything
				s.picker = null;
				if (!s.shift) s.pages.instrument = page;
				return;
			}
			if (s.shift && page !== 2) {
				s.pages.instrument = page;
				this.#openPicker(page === 1 ? 'engine' : page === 3 ? 'filter' : 'lfo');
				return;
			}
			s.pages.instrument = page;
		} else if (s.mode === 'auxiliary') s.pages.auxiliary = page;
		else if (s.mode === 'mix') s.pages.mix = page;
	}

	#openPicker(kind: 'engine' | 'filter' | 'lfo'): void {
		const t = this.track;
		const index =
			kind === 'engine'
				? ENGINE_LIST.indexOf(t.engine)
				: kind === 'filter'
					? FILTER_TYPES.indexOf(t.filter.type)
					: LFO_TYPES.indexOf(t.lfo.type);
		this.state.picker = { kind, index: Math.max(0, index) };
	}

	/** The set the track keys address in the current mode. */
	#bank(): Bank {
		const s = this.state;
		if (s.mode === 'mix') return s.banks.mix;
		if (s.mode === 'arrange') return s.banks.arrange;
		return s.mode;
	}

	#trackKey(index: number): void {
		const s = this.state;
		const toggleMute = (bank: Bank) => {
			const t = bank === 'instrument' ? s.tracks[index] : s.aux[index];
			t.mix.muted = !t.mix.muted;
		};
		// instrument / auxiliary + Tn mutes (manual: mix/mute-solo)
		if (this.#isHeld('key.instrument')) return toggleMute('instrument');
		if (this.#isHeld('key.auxiliary')) return toggleMute('auxiliary');
		const bank = this.#bank();
		if (s.mode === 'mix' && s.shift) return toggleMute(bank);
		if (bank === 'instrument') s.track = index;
		else s.auxTrack = index;
		s.active = bank;
		s.picker = null;
		if (s.overlay === 'tempo' || s.overlay === 'project' || s.overlay === 'com') s.overlay = null;
		s.sub = s.shift && s.mode !== 'mix' ? `preset browser · T${index + 1}` : null;
	}

	/** The sequence the step keys edit (the active track of the addressed set). */
	#sequence() {
		const s = this.state;
		return this.#bank() === 'instrument' ? s.tracks[s.track].sequence : s.aux[s.auxTrack].sequence;
	}

	/** Notes of the keyboard keys held now. */
	#heldNotes(): number[] {
		return this.state.held.flatMap((id) => {
			const i = (KEYBOARD_NOTE_NAMES as readonly string[]).indexOf(id.slice('keyboard.'.length));
			return id.startsWith('keyboard.') && i >= 0 ? [KEYBOARD_BASE + i] : [];
		});
	}

	/**
	 * Step entry (manual: sequencer/step-entry): an empty step stores the chord held on the keyboard,
	 * else the last note played; a step with notes is cleared.
	 */
	#stepKey(index: number): void {
		if (index < 0 || index >= STEPS_PER_BAR) return;
		const sequence = this.#sequence();
		const pattern = currentPattern(sequence);
		const at = sequence.page * STEPS_PER_BAR + index;
		if (at >= pattern.length) return;
		// another step pressed while one is held is an edit of the held one (extend, copy…)
		for (const held of this.#pendingClear.keys()) this.#pendingClear.set(held, true);
		if (pattern.steps[at].notes.length > 0) {
			// a tap clears the step; a hold (to edit its notes) must not, so wait for the release
			this.#pendingClear.set(at, false);
			return;
		}
		const held = this.#heldNotes();
		toggleStep(pattern, at, held.length > 0 ? held : [sequence.lastNote]);
	}

	/** A step came up: a tap on a step with notes clears it. */
	#stepReleased(index: number): void {
		const sequence = this.#sequence();
		const at = sequence.page * STEPS_PER_BAR + index;
		const edited = this.#pendingClear.get(at);
		this.#pendingClear.delete(at);
		if (edited === false) currentPattern(sequence).steps[at].notes = [];
	}

	/**
	 * A keyboard key: remembered as the last note played; on sampler tracks it selects the key to
	 * edit; with steps held it toggles its note on each of them (manual: step entry).
	 */
	#keyboardKey(name: string): void {
		const index = (KEYBOARD_NOTE_NAMES as readonly string[]).indexOf(name);
		if (index < 0) return;
		const s = this.state;
		const t = this.track;
		const note = KEYBOARD_BASE + index;
		const sequence = this.#sequence();
		const pattern = currentPattern(sequence);
		const heldSteps = s.held.flatMap((id) => {
			const m = /^step\.(\d+)$/.exec(id);
			return m ? [sequence.page * STEPS_PER_BAR + Number(m[1]) - 1] : [];
		});
		for (const at of heldSteps) {
			if (at >= pattern.length) continue;
			toggleNote(pattern, at, note);
			if (this.#pendingClear.has(at)) this.#pendingClear.set(at, true);
		}
		if (heldSteps.length === 0) sequence.lastNote = note;
		if (s.mode === 'instrument' && s.overlay === null && isSampler(t.engine)) t.drumKey = index;
	}

	// ───────────────────────────────────────────────────────────── encoders

	#turn(e: number, delta: number, fine: boolean): void {
		const s = this.state;
		const owner = ownerOf(s);
		if (owner) {
			owner.turn?.(this.#context(), e, delta, fine);
			return;
		}
		if (s.picker) {
			const size =
				s.picker.kind === 'engine'
					? ENGINE_LIST.length
					: s.picker.kind === 'filter'
						? FILTER_TYPES.length
						: LFO_TYPES.length;
			s.picker.index = clamp(s.picker.index + delta, 0, size - 1);
			return;
		}
		switch (s.overlay) {
			case 'tempo':
				return this.#turnTempo(e, delta, fine);
			case 'com':
				return this.#turnCom(e, delta);
			case null:
				break;
			default:
				return;
		}
		if (s.mode === 'instrument') this.#turnInstrument(e, delta, fine);
		else if (s.mode === 'mix' && s.pages.mix === 1) this.#turnMix(e, delta, fine);
	}

	#turnTempo(e: number, delta: number, fine: boolean): void {
		const t = this.state.tempo;
		if (e === 0) {
			const bpm = t.bpm + delta * (fine ? 0.1 : 1);
			t.bpm = clamp(Math.round(bpm * 10) / 10, TEMPO_RANGE.min, TEMPO_RANGE.max);
		} else if (e === 1) t.groove = clamp(t.groove + delta, 0, GROOVES.length - 1);
		else if (e === 2) t.swing = clamp(t.swing + delta, -99, 99);
		else t.metronome.level = clamp(t.metronome.level + delta, 0, 99);
	}

	#turnCom(e: number, delta: number): void {
		const c = this.state.com;
		if (e === 0) c.advertising = delta > 0;
		else if (e === 2) {
			const at = MULTI_OUT_MODES.indexOf(c.multiOut);
			c.multiOut = MULTI_OUT_MODES[clamp(at + delta, 0, MULTI_OUT_MODES.length - 1)];
		} else if (e === 3) c.charging = delta > 0;
	}

	#turnInstrument(e: number, delta: number, fine: boolean): void {
		const s = this.state;
		const t = this.track;
		const step = (v: number, min: number, max: number, by = 1) => clamp(v + delta * by, min, max);
		switch (s.pages.instrument) {
			case 1: {
				// sampler engines: the sample area's M1 encoders (areas/sample/m1.ts)
				if (isSampler(t.engine)) {
					turnSamplerPage(s, e, delta, fine);
					return;
				}
				if (t.engine === 'midi') {
					const m = t.midi;
					if (e === 0) m.channel = step(m.channel, 1, 16);
					else if (e === 1) {
						const bank = (m.bank ?? -1) + delta;
						m.bank = bank < 0 ? null : Math.min(127, bank);
					} else if (e === 2) m.program = step(m.program, 1, 128);
					return;
				}
				t.m1[e] = step(t.m1[e], 0, 99);
				return;
			}
			case 2: {
				if (t.engine === 'midi') return;
				if (s.shift) {
					const p = t.playMode;
					if (e === 0) p.mode = clamp(p.mode + delta, 0, 2);
					else if (e === 1) p.portamento = step(p.portamento, 0, 99);
					else if (e === 2) p.bend = step(p.bend, 0, 24);
					else p.volume = step(p.volume, 0, 99);
					return;
				}
				const env = t.envelope === 'amp' ? t.amp : t.filterEnv;
				const field = (['attack', 'decay', 'sustain', 'release'] as const)[e];
				env[field] = step(env[field], 0, 99);
				return;
			}
			case 3: {
				if (t.engine === 'midi') return;
				if (s.shift) {
					t.sends[e] = step(t.sends[e], 0, 99);
					return;
				}
				const f = t.filter;
				if (e === 0) f.cutoff = step(f.cutoff, 0, 99);
				else if (e === 1) f.resonance = step(f.resonance, 0, 99);
				else if (e === 2) f.envAmount = step(f.envAmount, -99, 99);
				else f.keyTracking = step(f.keyTracking, 0, 99);
				return;
			}
			case 4: {
				const l = t.lfo;
				const speedMax = LFO_SYNC_STEPS.length + 99;
				if (l.type === 'duck') {
					if (e === 0) l.source = step(l.source, 1, 8);
					else if (e === 1) l.amount = step(l.amount, -99, 99);
					else if (e === 2) l.hold = step(l.hold, 0, 99);
					else l.release = step(l.release, 0, 99);
					return;
				}
				if (e === 0) l.speed = step(l.speed, 0, speedMax);
				else if (e === 1) l.amount = step(l.amount, -99, 99);
				else if (l.type === 'tremolo') {
					if (e === 2) l.volume = step(l.volume, -99, 99);
				} else if (e === 2) {
					const size = l.type === 'element' ? SENSOR_DESTINATIONS.length : DESTINATIONS.length;
					l.destination = step(l.destination, 0, size - 1);
				} else l.parameter = step(l.parameter, 0, 3);
				return;
			}
		}
	}

	#turnMix(e: number, delta: number, fine: boolean): void {
		const s = this.state;
		const instrument = s.banks.mix === 'instrument';
		const t = instrument ? s.tracks[s.track] : s.aux[s.auxTrack];
		if (e === 0 || e === 1) {
			// FX I / FX II sends: the same values as the track's M3 shift layer
			if (instrument) {
				const sends = s.tracks[s.track].sends;
				sends[e + 2] = clamp(sends[e + 2] + delta, 0, 99);
			}
		} else if (e === 2) t.mix.pan = clamp(t.mix.pan + delta * (fine ? 1 : 2), -100, 100);
		else t.mix.level = clamp(t.mix.level + delta, 0, 99);
	}

	#click(e: number): void {
		const s = this.state;
		const owner = ownerOf(s);
		if (owner) {
			owner.click?.(this.#context(), e);
			return;
		}
		if (s.picker) {
			if (e === 0) this.#confirmPicker();
			return;
		}
		if (s.overlay === 'tempo') {
			if (e === 3) s.tempo.metronome.on = !s.tempo.metronome.on;
			return;
		}
		if (s.overlay === 'com') {
			if (e === 0) s.com.advertising = !s.com.advertising;
			return;
		}
		if (s.overlay) return;
		if (s.mode === 'instrument') {
			const t = this.track;
			if (s.pages.instrument === 2 && !s.shift) {
				// any encoder click swaps the amp and filter envelope (manual: envelopes)
				t.envelope = t.envelope === 'amp' ? 'filter' : 'amp';
			} else if (s.pages.instrument === 4) {
				// duck: E1 flips the trigger between the source's audio and its notes; elsewhere E4
				// steps through the destination page's parameters
				if (t.lfo.type === 'duck' && e === 0) t.lfo.sourceAudio = !t.lfo.sourceAudio;
				else if (e === 3 && t.lfo.type !== 'tremolo' && t.lfo.type !== 'duck') {
					t.lfo.parameter = (t.lfo.parameter + 1) % 4;
				}
			}
		} else if (s.mode === 'mix' && s.pages.mix === 1) {
			const t = s.banks.mix === 'instrument' ? s.tracks[s.track] : s.aux[s.auxTrack];
			if (e === 2) t.mix.pan = 0;
			else if (e === 3) t.mix.muted = !t.mix.muted;
		}
	}

	#confirmPicker(): void {
		const s = this.state;
		const picker = s.picker;
		if (!picker) return;
		const t = this.track;
		if (picker.kind === 'engine') {
			const engine = ENGINE_LIST[picker.index];
			if (engine !== t.engine) {
				// a new engine loads with its own M1 defaults; the rest of the track stays
				const fresh = defaultTrack(engine);
				t.engine = engine;
				t.m1 = fresh.m1;
			}
		} else if (picker.kind === 'filter') t.filter.type = FILTER_TYPES[picker.index];
		else t.lfo.type = LFO_TYPES[picker.index];
		s.picker = null;
	}
}
