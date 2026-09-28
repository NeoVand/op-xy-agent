/**
 * From simulator state to what the screen shows and the LEDs light (pure, no Svelte): each page
 * builds the {@link ScreenFrame} the renderer draws, converting the model's 0–99 values to the
 * units and display strings of TE's art. Pages we have not drawn yet become honest text frames.
 */
import type { KeyId } from '$lib/core/opxy';
import type { KeyLedState } from '$lib/replica/state.svelte';
import type { EnvelopeView, FilterView, LfoFrame, ListFrame, ScreenFrame } from './screen/frame';
import { ownerOf } from './areas/registry';
import { soloed, trackMeter } from './areas/mixer/meters';
import { samplerPage } from './areas/sample/m1';
import { sequencerLeds } from './areas/sequencer/leds';
import { bendLabel } from './defaults';
import { DESTINATIONS, SENSOR_DESTINATIONS } from './screen/pages/lfo';
import {
	DUCK_METRONOME,
	ELEMENT_SOURCES,
	ENGINE_LIST,
	FILTER_TYPES,
	GROOVES,
	GROOVE_ABBREVIATIONS,
	LFO_SYNC_STEPS,
	LFO_TYPES,
	PLAY_MODES,
	AUX_NAMES,
	clamp,
	engineParams,
	formatBpm,
	isSampler,
	two,
	type Envelope99,
	type SimState,
	type TrackState
} from './params';

/** Sixteenth steps per beat. */
const STEPS_PER_BEAT = 4;

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
	const l = t.lfo;
	const list = l.type === 'element' ? SENSOR_DESTINATIONS : DESTINATIONS;
	const d = list[clamp(l.destination, 0, list.length - 1)];
	const params = destinationParams(t, d.module);
	const sensor = clamp(l.sensor, 0, ELEMENT_SOURCES.length - 1);
	return {
		page: 'lfo',
		type: l.type,
		speed: lfoSpeed(l.speed),
		amount: (l.amount * 100) / 99,
		volume: (l.volume * 100) / 99,
		destination: { label: d.module, free: d.free },
		fourth: l.type === 'tremolo' ? 'mode' : (params[l.parameter] ?? ''),
		parameter: l.parameter,
		source:
			l.type !== 'duck'
				? ELEMENT_SOURCES[sensor].letter
				: l.source >= DUCK_METRONOME
					? 'metronome'
					: String(l.source),
		sourceAudio: l.sourceAudio,
		// element's rule marks where its source sits among the four (ours)
		...(l.type === 'element' ? { sourceAt: (sensor + 0.5) / ELEMENT_SOURCES.length } : {}),
		...(l.type === 'random' || l.type === 'tremolo' ? { envelope: l.envelope / 99 } : {})
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
			// sampler engines: the sample area builds the page (areas/sample/m1.ts)
			if (isSampler(t.engine)) return samplerPage(s);
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
			// (a midi track's M2 and M3 are the mixer area's CC pages)
			if (s.shift) {
				const p = t.playMode;
				return {
					page: 'playmode',
					envelope: envelopeView(t),
					values: [
						PLAY_MODES[clamp(p.mode, 0, 2)],
						p.portamento === 0 ? 'off' : two(p.portamento),
						bendLabel(p.bend),
						two(p.volume)
					]
				};
			}
			return { page: 'envelope', ...envelopeView(t) };
		case 3:
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

/**
 * Strips of the mixer's current bank (M1; the other pages are the mixer area's). The bars thicken
 * with each track's output while playing: a hit that falls away, silent when muted or left out of a
 * solo (holding track keys; manual: mix/mute-solo), see `areas/mixer/meters.ts`.
 */
function mixFrame(s: SimState): ScreenFrame {
	const bank = s.banks.mix;
	const tracks = bank === 'instrument' ? s.tracks : s.aux;
	const solo = soloed(s);
	return {
		page: 'mix',
		bank,
		selected: bank === 'instrument' ? s.track : s.auxTrack,
		strips: tracks.map((t, i) => ({
			level: t.mix.level / 99,
			pan: t.mix.pan / 100,
			muted: t.mix.muted,
			meter: trackMeter(s, t, i, solo)
		}))
	};
}

/** What the screen shows for a state: an area's page when one owns it, else the core's. */
export function buildFrame(s: SimState): ScreenFrame {
	const area = ownerOf(s);
	if (area) return area.frame(s);
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
		default:
			break;
	}
	switch (s.mode) {
		case 'instrument':
			return instrumentFrame(s);
		case 'mix':
			return mixFrame(s);
		default:
			// arrange, auxiliary and the other mix pages belong to areas; nothing lands here
			return { page: 'text', title: s.mode, lines: [s.mode] };
	}
}

/**
 * LED windows for a state: the active track key (white for instrument, red for auxiliary; in mix
 * with shift held, every unmuted track; dim for the tracks linked to a held track key), then the
 * step keys and keyboard (the bar shown of the current pattern with the playhead chasing over it,
 * held keys, a held step's notes, and whatever the sequencer gesture in progress shows:
 * `areas/sequencer/leds.ts`). Every LED key is listed, so applying the map also turns off what went
 * dark. An area that owns the screen may change the map last.
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
	// while a primary track's key is held, the tracks linked to it glow dim (guide art 6.2)
	if (s.mode === 'instrument') {
		for (const held of s.held) {
			const m = /^track\.([1-8])$/.exec(held);
			for (const i of m ? s.tracks[Number(m[1]) - 1].links : []) {
				const id = `track.${i + 1}` as KeyId;
				if (leds[id] === 'off') leds[id] = 'dim';
			}
		}
	}
	sequencerLeds(s, leds);
	ownerOf(s)?.leds?.(s, leds);
	return leds;
}

/** Auxiliary track names by key (kept here for older imports). */
export { AUX_NAMES };
