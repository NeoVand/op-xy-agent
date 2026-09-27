/**
 * From simulator state to what the screen shows and the LEDs light (pure, no Svelte): each page
 * builds the {@link ScreenFrame} the renderer draws, converting the model's 0–99 values to the
 * units and display strings of TE's art. Pages we have not drawn yet become honest text frames.
 */
import { KEYBOARD_NOTE_NAMES, type KeyId } from '$lib/core/opxy';
import type { KeyLedState } from '$lib/replica/state.svelte';
import type { EnvelopeView, FilterView, LfoFrame, ListFrame, ScreenFrame } from './screen/frame';
import { DESTINATIONS, SENSOR_DESTINATIONS } from './screen/pages/lfo';
import {
	ENGINE_LIST,
	FILTER_TYPES,
	GROOVES,
	GROOVE_ABBREVIATIONS,
	LFO_SYNC_STEPS,
	LFO_TYPES,
	PLAY_MODES,
	clamp,
	engineParams,
	formatBpm,
	formatTune,
	isSampler,
	keyName,
	two,
	type Envelope99,
	type SimState,
	type TrackState
} from './params';

/** Sixteenth steps per beat. */
const STEPS_PER_BEAT = 4;

/** Auxiliary track names by key (manual: basics/track-buttons). */
export const AUX_NAMES = [
	'brain',
	'punch-in fx',
	'external midi',
	'external cv',
	'external audio',
	'tape',
	'fx I',
	'fx II'
] as const;

/** Mix pages M2–M4 (manual: mix/overview). */
const MIX_PAGES = ['levels', 'eq', 'saturator', 'master'] as const;

const adsr = (e: Envelope99) => ({
	attack: e.attack / 99,
	decay: e.decay / 99,
	sustain: e.sustain / 99,
	release: e.release / 99
});

function envelopeView(t: TrackState): EnvelopeView {
	return {
		amp: adsr(t.amp),
		filter: adsr(t.filterEnv),
		selected: t.envelope,
		filterDepth: Math.abs(t.filter.envAmount) / 99
	};
}

function filterView(t: TrackState): FilterView {
	return {
		type: t.filter.type,
		cutoff: t.filter.cutoff / 99,
		resonance: t.filter.resonance / 99,
		envAmount: t.filter.envAmount / 99,
		keyTracking: t.filter.keyTracking / 99
	};
}

/** Names of a destination page's four parameters (for the LFO's parameter card). */
function destinationParams(t: TrackState, module: string): readonly string[] {
	switch (module) {
		case 'syn':
			return engineParams(t.engine).map((p) => p ?? '');
		case 'env':
			return ['attack', 'decay', 'sustain', 'release'];
		case 'filter':
			return ['cutoff', 'res', 'env', 'key'];
		default:
			return ['speed', 'amount', 'dest', 'param'];
	}
}

/** The LFO speed's card: synced steps first, then the free range. */
export function lfoSpeed(speed: number): LfoFrame['speed'] {
	const n = LFO_SYNC_STEPS.length;
	if (speed < n) return { synced: true, label: LFO_SYNC_STEPS[speed], position: speed / (n + 99) };
	return { synced: false, label: '', position: (speed - n) / 99 };
}

function lfoFrame(t: TrackState): LfoFrame {
	const list = t.lfo.type === 'element' ? SENSOR_DESTINATIONS : DESTINATIONS;
	const d = list[clamp(t.lfo.destination, 0, list.length - 1)];
	const params = destinationParams(t, d.module);
	return {
		page: 'lfo',
		type: t.lfo.type,
		speed: lfoSpeed(t.lfo.speed),
		amount: (t.lfo.amount * 100) / 99,
		volume: (t.lfo.volume * 100) / 99,
		destination: { label: d.module, free: d.free },
		fourth: t.lfo.type === 'tremolo' ? 'mode' : (params[t.lfo.parameter] ?? ''),
		parameter: t.lfo.parameter,
		source: t.lfo.type === 'duck' ? String(t.lfo.source) : 'G',
		sourceAudio: t.lfo.sourceAudio
	};
}

/** A window of up to `rows` items around `index`. */
function window<T>(items: readonly T[], index: number, rows: number) {
	const first = clamp(index - Math.floor(rows / 2), 0, Math.max(0, items.length - rows));
	return { items: items.slice(first, first + rows), selected: index - first };
}

/** The picker shift + M1 / M3 / M4 opens: the track, the kind, and the list (TE's browser). */
function pickerFrame(s: SimState): ListFrame {
	const picker = s.picker ?? { kind: 'engine', index: 0 };
	const lists = {
		engine: { title: 'engine', items: ENGINE_LIST as readonly string[] },
		filter: { title: 'filter', items: FILTER_TYPES as readonly string[] },
		lfo: { title: 'lfo', items: LFO_TYPES as readonly string[] }
	};
	const list = lists[picker.kind];
	const shown = window(list.items, picker.index, 9);
	return {
		page: 'list',
		columns: [
			{
				items: [String(s.track + 1), list.title],
				selected: null,
				style: 'outline',
				x: 5,
				width: 100
			},
			{ items: shown.items, selected: shown.selected, style: 'white', x: 120, width: 170 }
		],
		soft: []
	};
}

/** The instrument track's page. */
function instrumentFrame(s: SimState): ScreenFrame {
	const t = s.tracks[s.track];
	const page = s.pages.instrument;
	if (s.picker) return pickerFrame(s);
	switch (page) {
		case 1: {
			if (isSampler(t.engine)) {
				const k = t.drumKeys[t.drumKey];
				return {
					page: 'drum',
					key: keyName(t.drumKey),
					tune: formatTune(k.tune),
					start: k.start / 99,
					end: k.end / 99,
					playMode: t.engine === 'drum' ? k.playMode : '',
					shift: s.shift,
					reverse: k.reverse,
					pan: k.pan / 100,
					fade: k.fade / 99,
					gain: (k.gain + 30) / 50,
					seed: s.track * 24 + t.drumKey + 1
				};
			}
			if (t.engine === 'midi') {
				return {
					page: 'midi',
					channel: String(t.midi.channel),
					bank: t.midi.bank === null ? null : String(t.midi.bank),
					program: String(t.midi.program)
				};
			}
			const names = engineParams(t.engine);
			return {
				page: 'synth',
				engine: t.engine,
				header: names.map((label, i) => ({
					label: label ?? '',
					value: label === null ? '' : two(t.m1[i])
				})),
				params: t.m1.map((v) => v / 99)
			};
		}
		case 2:
			if (t.engine === 'midi') return midiCcFrame(t, 2);
			if (s.shift) {
				const p = t.playMode;
				return {
					page: 'playmode',
					envelope: envelopeView(t),
					values: [
						PLAY_MODES[clamp(p.mode, 0, 2)],
						p.portamento === 0 ? 'off' : two(p.portamento),
						p.bend === 0 ? 'off' : `${p.bend} semitone${p.bend === 1 ? '' : 's'}`,
						two(p.volume)
					]
				};
			}
			return { page: 'envelope', ...envelopeView(t) };
		case 3:
			if (t.engine === 'midi') return midiCcFrame(t, 3);
			if (s.shift) {
				const [aux, tape, fx1, fx2] = t.sends;
				return {
					page: 'sends',
					filter: filterView(t),
					values: [two(aux), two(tape), two(fx1), two(fx2)]
				};
			}
			return { page: 'filter', ...filterView(t) };
		case 4:
			return lfoFrame(t);
	}
}

/** The midi engine's M2/M3 CC pages (not drawn yet). */
function midiCcFrame(t: TrackState, page: 2 | 3): ScreenFrame {
	return {
		page: 'text',
		title: `midi · M${page} cc controls`,
		lines: [`channel ${t.midi.channel}`, 'cc pages are not drawn yet']
	};
}

/** Strips of the mixer's current bank. */
function mixFrame(s: SimState): ScreenFrame {
	const bank = s.banks.mix;
	const page = s.pages.mix;
	if (page !== 1) {
		return {
			page: 'text',
			title: `mix · M${page} ${MIX_PAGES[page - 1]}`,
			lines: [`master ${MIX_PAGES[page - 1]}`, 'this page is not drawn yet']
		};
	}
	const step = Math.floor(s.transport.position) % 16;
	const tracks = bank === 'instrument' ? s.tracks : s.aux;
	return {
		page: 'mix',
		bank,
		selected: bank === 'instrument' ? s.track : s.auxTrack,
		strips: tracks.map((t) => {
			const hit = t.steps[step];
			const meter = s.transport.playing && !t.mix.muted ? (hit ? 1 : 0.25) * (t.mix.level / 99) : 0;
			return { level: t.mix.level / 99, pan: t.mix.pan / 100, muted: t.mix.muted, meter };
		})
	};
}

/** What the screen shows for a state. */
export function buildFrame(s: SimState): ScreenFrame {
	if (s.sub) return { page: 'text', title: s.sub, lines: [s.sub, 'this page is not drawn yet'] };
	switch (s.overlay) {
		case 'tempo': {
			const beats = s.transport.position / STEPS_PER_BEAT;
			return {
				page: 'tempo',
				bpm: formatBpm(s.tempo.bpm),
				groove: GROOVE_ABBREVIATIONS[GROOVES[clamp(s.tempo.groove, 0, GROOVES.length - 1)]],
				swing: s.tempo.swing / 99,
				metronome: { level: s.tempo.metronome.level / 99, on: s.tempo.metronome.on },
				beat: Math.floor(beats) % 4,
				pendulum: s.transport.playing ? Math.cos(Math.PI * beats) : 1
			};
		}
		case 'project':
			return {
				page: 'project',
				name: s.project.name,
				usage: { voices: false, cpu: false, memory: false },
				soft: [
					{ text: 'new', tone: 'normal' },
					{ text: 'save', tone: 'dim' },
					{ text: 'rename', tone: 'dim' },
					{ text: 'config', tone: 'dim' }
				]
			};
		case 'com':
			return { page: 'com', ...s.com };
		case 'sample':
		case 'players':
		case 'bar':
			return {
				page: 'text',
				title: s.overlay,
				lines: [`${s.overlay} page`, 'this page is not drawn yet']
			};
		case null:
			break;
	}
	switch (s.mode) {
		case 'instrument':
			return instrumentFrame(s);
		case 'mix':
			return mixFrame(s);
		case 'auxiliary':
			return {
				page: 'text',
				title: `auxiliary · T${s.auxTrack + 1} ${AUX_NAMES[s.auxTrack]} · M${s.pages.auxiliary}`,
				lines: [AUX_NAMES[s.auxTrack], 'auxiliary pages are not drawn yet']
			};
		case 'arrange':
			return {
				page: 'text',
				title: `arrange · ${s.banks.arrange} tracks`,
				lines: ['arrange', 'scenes and songs are not drawn yet']
			};
	}
}

/**
 * LED windows for a state: the active track key (white for instrument, red for auxiliary; in mix
 * with shift held, every unmuted track), the current pattern's steps with the playhead chasing
 * over them while playing, and the keyboard keys being held. Every LED key is listed, so applying
 * the map also turns off what went dark.
 */
export function buildLeds(s: SimState): Partial<Record<KeyId, KeyLedState>> {
	const leds: Partial<Record<KeyId, KeyLedState>> = {};
	const bank = s.mode === 'mix' ? s.banks.mix : s.mode === 'arrange' ? s.banks.arrange : s.active;
	const color: KeyLedState = bank === 'instrument' ? 'white' : 'red';
	const tracks = bank === 'instrument' ? s.tracks : s.aux;
	const active = bank === 'instrument' ? s.track : s.auxTrack;
	for (let i = 0; i < 8; i++) {
		const id = `track.${i + 1}` as KeyId;
		if (s.mode === 'mix' && s.shift) leds[id] = tracks[i].mix.muted ? 'off' : color;
		else leds[id] = i === active ? color : 'off';
	}
	const steps = tracks[active].steps;
	const head = s.transport.playing ? Math.floor(s.transport.position) % 16 : -1;
	for (let i = 0; i < 16; i++) {
		const id = `step.${i + 1}` as KeyId;
		if (i === head) leds[id] = steps[i] ? 'dim' : 'white';
		else leds[id] = steps[i] ? 'white' : 'off';
	}
	for (const note of KEYBOARD_NOTE_NAMES) {
		const id: KeyId = `keyboard.${note}`;
		leds[id] = s.held.includes(id) ? 'white' : 'off';
	}
	return leds;
}
