import { describe, expect, it } from 'vitest';
import type { EngineId } from '$lib/core/opxy';
import { OpxySim } from './opxy-sim.svelte';
import { buildFrame, lfoSpeed } from './frames';
import {
	ENGINE_LIST,
	LFO_TYPES,
	defaultState,
	formatBpm,
	formatTune,
	keyName,
	two
} from './params';
import { SCENARIOS } from './scenarios';
import type { ScreenFrame } from './screen/frame';
import { RecordingContext } from './screen/recording';
import { describeFrame, renderFrame } from './screen/render';

/** The frame, narrowed to one page (fails the test on another page). */
function page<P extends ScreenFrame['page']>(
	sim: OpxySim,
	name: P
): Extract<ScreenFrame, { page: P }> {
	const frame = sim.frame;
	expect(frame.page).toBe(name);
	return frame as Extract<ScreenFrame, { page: P }>;
}

describe('OpxySim: a new project', () => {
	it('starts in instrument mode on T1 M1, a drum track, at 120 BPM', () => {
		const sim = new OpxySim();
		expect(sim.state.mode).toBe('instrument');
		expect(sim.state.track).toBe(0);
		expect(sim.state.tempo.bpm).toBe(120);
		expect(sim.state.tracks.map((t) => t.engine)).toEqual([
			'drum',
			'drum',
			'prism',
			'epiano',
			'dissolve',
			'hardsync',
			'axis',
			'multisampler'
		]);
		const drum = page(sim, 'drum');
		expect(drum).toMatchObject({ key: 'F3', tune: '+0.00', playMode: 'oneshot', shift: false });
	});

	it('lights the active track white and nothing else', () => {
		const sim = new OpxySim();
		expect(sim.leds['track.1']).toBe('white');
		expect(sim.leds['track.2']).toBe('off');
		expect(sim.leds['step.1']).toBe('off');
	});
});

describe('OpxySim: navigation', () => {
	it('switches tracks with the track keys and shows each engine page', () => {
		const sim = new OpxySim();
		sim.press('track.3');
		const prism = page(sim, 'synth');
		expect(prism.engine).toBe('prism');
		expect(prism.header.map((c) => c.label)).toEqual(['shape', 'ratio', 'detune', 'stereo']);
		// a new project's bass preset (shoulder)
		expect(prism.header.map((c) => c.value)).toEqual(['15', '2:1', '05', '22']);
		expect(sim.leds['track.3']).toBe('white');
		expect(sim.leds['track.1']).toBe('off');
		sim.press('track.5');
		expect(page(sim, 'synth').engine).toBe('dissolve');
	});

	it('goes instrument → M2 → shift (play mode) → release (envelopes)', () => {
		const sim = new OpxySim();
		sim.press('track.3');
		sim.press('key.m2');
		expect(page(sim, 'envelope').selected).toBe('amp');
		sim.input({ type: 'press', id: 'key.shift' });
		expect(page(sim, 'playmode').values).toEqual(['mono', '00', '2 semitones', '75']);
		sim.input({ type: 'release', id: 'key.shift' });
		expect(sim.frame.page).toBe('envelope');
	});

	it('shows the filter on M3, the sends with shift, the LFO on M4', () => {
		const sim = new OpxySim();
		// a new project's first drum track (boop): a ladder, full to tape, a random LFO
		sim.press('key.m3');
		expect(page(sim, 'filter').type).toBe('ladder');
		sim.input({ type: 'press', id: 'key.shift' });
		expect(page(sim, 'sends').values).toEqual(['00', '99', '00', '00']);
		sim.input({ type: 'release', id: 'key.shift' });
		sim.press('key.m4');
		expect(page(sim, 'lfo').type).toBe('random');
	});

	it('opens the tempo page from anywhere and returns with an M key', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('key.m3');
		sim.press('key.tempo');
		const tempo = page(sim, 'tempo');
		expect(tempo.bpm).toBe('120');
		expect(tempo.groove).toBe('SH');
		sim.press('key.m2');
		expect(sim.state.overlay).toBeNull();
		expect(sim.frame.page).toBe('envelope');
	});

	it('toggles the project and COM pages with their keys', () => {
		const sim = new OpxySim();
		sim.press('key.project');
		expect(page(sim, 'project').soft.map((l) => l?.text)).toEqual([
			'new',
			'save',
			'rename',
			'config'
		]);
		sim.press('key.project');
		expect(sim.frame.page).toBe('drum');
		sim.press('key.com');
		expect(page(sim, 'com').multiOut).toBe('midi');
		sim.press('key.m1');
		expect(sim.frame).toMatchObject({ page: 'system-list', title: 'system settings' });
		sim.press('key.m1');
		expect(sim.frame.page).toBe('com');
	});

	it('flips the mixer between instrument and auxiliary tracks when mix is pressed again', () => {
		const sim = new OpxySim();
		sim.press('key.mix');
		expect(page(sim, 'mix').bank).toBe('instrument');
		sim.press('key.mix');
		expect(page(sim, 'mix').bank).toBe('auxiliary');
		sim.press('track.2');
		expect(sim.state.auxTrack).toBe(1);
		expect(sim.leds['track.2']).toBe('red');
	});

	it('mutes with shift + Tn in mix and lights unmuted tracks while shift is held', () => {
		const sim = new OpxySim();
		sim.press('key.mix');
		sim.input({ type: 'press', id: 'key.shift' });
		sim.press('track.5');
		expect(sim.leds['track.5']).toBe('off');
		expect(sim.leds['track.4']).toBe('white');
		sim.input({ type: 'release', id: 'key.shift' });
		expect(page(sim, 'mix').strips[4].muted).toBe(true);
		sim.click(4);
		expect(page(sim, 'mix').strips[0].muted).toBe(true);
	});

	it('chooses an engine with shift + M1, E1 and a click', () => {
		const sim = new OpxySim();
		sim.press('track.3');
		sim.combo('key.shift', 'key.m1');
		const list = page(sim, 'list');
		expect(list.columns[1].items[list.columns[1].selected ?? -1]).toBe('prism');
		sim.turn(1, 1);
		sim.click(1);
		expect(sim.track.engine).toBe('sampler');
		expect(sim.frame.page).toBe('drum');
	});

	it('changes the LFO type with shift + M4 and the filter type with shift + M3', () => {
		const sim = new OpxySim();
		// from T1's random LFO and ladder filter
		sim.combo('key.shift', 'key.m4');
		sim.turn(1, 1);
		sim.click(1);
		expect(page(sim, 'lfo').type).toBe('tremolo');
		sim.combo('key.shift', 'key.m3');
		sim.turn(1, 2);
		sim.click(1);
		// a filter pick goes back to the engine page, as on the device
		expect(sim.frame.page).toBe('drum');
		sim.press('key.m3');
		expect(page(sim, 'filter').type).toBe('z hipass');
	});

	it('draws the auxiliary tape page, then arrange mode', () => {
		const sim = new OpxySim();
		sim.press('key.auxiliary');
		sim.press('track.6');
		expect(sim.frame).toMatchObject({ page: 'aux-tape' });
		expect(sim.leds['track.6']).toBe('red');
		sim.press('key.arrange');
		expect(sim.frame).toMatchObject({ page: 'arrange' });
	});
});

describe('OpxySim: encoders', () => {
	it('E1 on the tempo page changes the tempo (push-turn in tenths)', () => {
		const sim = new OpxySim();
		sim.press('key.tempo');
		sim.turn(1, 5);
		expect(page(sim, 'tempo').bpm).toBe('125');
		sim.turn(1, 3, true);
		expect(page(sim, 'tempo').bpm).toBe('125.3');
		sim.turn(1, 1000);
		expect(sim.state.tempo.bpm).toBe(220);
	});

	it('turns groove type, swing and metronome, and clicks the metronome on', () => {
		const sim = new OpxySim();
		sim.press('key.tempo');
		sim.turn(2, 1);
		sim.turn(3, -99);
		sim.turn(4, -16);
		sim.click(4);
		expect(page(sim, 'tempo')).toMatchObject({
			groove: 'HS',
			swing: -1,
			metronome: { level: 49 / 99, on: true }
		});
	});

	it('E1 on a synth page changes the first parameter within 0–99', () => {
		const sim = new OpxySim();
		sim.press('track.3');
		sim.turn(1, 35);
		expect(page(sim, 'synth').header[0].value).toBe('50');
		sim.turn(1, -100);
		expect(page(sim, 'synth').header[0].value).toBe('00');
	});

	it('edits the selected envelope and swaps envelopes with a click', () => {
		const sim = new OpxySim();
		sim.press('key.m2');
		sim.turn(1, 10);
		expect(page(sim, 'envelope').amp.attack).toBeCloseTo(10 / 99);
		sim.click(2);
		expect(page(sim, 'envelope').selected).toBe('filter');
		sim.turn(3, -41);
		expect(page(sim, 'envelope').filter.sustain).toBe(0);
	});

	it('edits the drum key under the keyboard key last pressed, shift layer included', () => {
		const sim = new OpxySim();
		sim.press('keyboard.a3');
		sim.turn(1, -12);
		expect(page(sim, 'drum')).toMatchObject({ key: 'A3', tune: '–1.20' });
		sim.input({ type: 'press', id: 'key.shift' });
		sim.turn(1, -1);
		sim.turn(2, 10);
		expect(page(sim, 'drum')).toMatchObject({ shift: true, reverse: true, pan: 0.2 });
		sim.input({ type: 'release', id: 'key.shift' });
		sim.press('keyboard.f3');
		expect(page(sim, 'drum')).toMatchObject({ key: 'F3', tune: '+0.00', reverse: false });
	});

	it('sets the mixer level, pan (click to centre) and shares FX sends with M3 shift', () => {
		const sim = new OpxySim();
		sim.press('key.mix');
		sim.press('track.4');
		sim.turn(4, -40);
		sim.turn(3, 10);
		sim.turn(1, 25);
		// E1 and E2 show the FX send popup for a second, as the device does
		expect(sim.frame.page).toBe('mix-sends');
		sim.advance(1000);
		const mix = page(sim, 'mix');
		expect(mix.selected).toBe(3);
		// from a new project's level, 75
		expect(mix.strips[3]).toMatchObject({ level: 35 / 99, pan: 0.2 });
		expect(sim.state.tracks[3].sends[2]).toBe(25);
		sim.click(3);
		expect(page(sim, 'mix').strips[3].pan).toBe(0);
	});

	it('moves the COM multi-out through its modes and advertises with E1', () => {
		const sim = new OpxySim();
		sim.press('key.com');
		sim.turn(3, 2);
		sim.click(1);
		expect(page(sim, 'com')).toMatchObject({ multiOut: 'sync16', advertising: true });
	});
});

describe('OpxySim: engines and links', () => {
	/** Loads `engine` on the selected track through the engine list. */
	function load(sim: OpxySim, engine: EngineId): void {
		sim.combo('key.shift', 'key.m1');
		sim.turn(1, ENGINE_LIST.indexOf(engine) - (sim.state.picker?.index ?? 0));
		sim.click(1);
	}

	it('sets a synth aside behind the midi engine only until another engine comes', () => {
		const sim = new OpxySim();
		sim.press('track.3');
		const [, ...rest] = sim.track.m1;
		sim.turn(1, 30);
		load(sim, 'midi');
		expect(sim.track.parked).toEqual({ engine: 'prism', m1: [45, ...rest] });
		load(sim, 'organ');
		// engines picked with no preset start from the device's own values
		expect(page(sim, 'synth').header.map((c) => c.value)).toEqual(['40', '53', '82', '09']);
		expect(sim.track.parked).toBeNull();
		load(sim, 'prism');
		expect(page(sim, 'synth').header[0].value).toBe('50');
	});

	it('gives a linked track one primary, never linking two tracks both ways', () => {
		const sim = new OpxySim();
		const link = (held: number, pressed: number) => {
			sim.input({ type: 'press', id: `track.${held}` });
			sim.press(`track.${pressed}`);
			sim.input({ type: 'release', id: `track.${held}` });
		};
		link(1, 5);
		link(3, 5);
		expect([sim.state.tracks[0].links, sim.state.tracks[2].links]).toEqual([[], [4]]);
		link(5, 3);
		expect([sim.state.tracks[2].links, sim.state.tracks[4].links]).toEqual([[], [2]]);
		expect(sim.state.track).toBe(4);
	});

	it('links only in instrument mode: in mix a key pressed while another is held selects it', () => {
		const sim = new OpxySim();
		sim.press('key.mix');
		sim.input({ type: 'press', id: 'track.1' });
		sim.press('track.2');
		expect(sim.state.track).toBe(1);
		expect(sim.state.tracks[0].links).toEqual([]);
	});

	it('puts the envelope of random and tremolo and duck’s hold and release only on their frames', () => {
		const sim = new OpxySim();
		sim.press('track.3');
		sim.press('key.m4');
		const fields = () => ['envelope', 'hold', 'release'].filter((f) => f in page(sim, 'lfo'));
		const seen: Record<string, string[]> = {};
		for (const type of LFO_TYPES) {
			sim.state.tracks[2].lfo.type = type;
			seen[type] = fields();
		}
		expect(seen).toEqual({
			duck: ['hold', 'release'],
			element: [],
			random: ['envelope'],
			tremolo: ['envelope'],
			value: []
		});
	});
});

describe('OpxySim: time', () => {
	it('taps the tempo with the tempo key', () => {
		let now = 1000;
		const sim = new OpxySim({ now: () => now });
		sim.press('key.tempo');
		for (let i = 0; i < 4; i++) {
			now += 500;
			sim.press('key.tempo');
		}
		expect(sim.state.tempo.bpm).toBe(120);
		now += 400;
		sim.press('key.tempo');
		expect(sim.state.tempo.bpm).toBeCloseTo(60000 / ((500 * 2 + 400) / 3), 1);
		now += 5000;
		sim.press('key.tempo');
		expect(sim.state.taps).toHaveLength(1);
	});

	it('plays: the playhead chases over the steps and the pendulum swings', () => {
		const sim = new OpxySim();
		sim.press('step.1');
		sim.press('step.3');
		expect(sim.leds['step.1']).toBe('white');
		sim.press('key.play');
		expect(sim.leds['step.1']).toBe('dim');
		sim.advance(125 * 2); // two sixteenths at 120 BPM
		expect(sim.leds['step.3']).toBe('dim');
		expect(sim.leds['step.1']).toBe('white');
		sim.press('key.tempo');
		expect(page(sim, 'tempo').pendulum).toBeCloseTo(Math.cos(Math.PI / 2));
		// play again during playback jumps back to the start (it does not stop)
		sim.press('key.play');
		expect(sim.state.transport).toMatchObject({ playing: true, position: 0 });
		sim.advance(125);
		sim.press('key.stop');
		expect(sim.state.transport).toMatchObject({ playing: false, position: 0 });
	});

	it('follows a connected device: its start, stop, clock ticks, tempo and track', () => {
		const sim = new OpxySim();
		sim.follow('start');
		for (let i = 0; i < 12; i++) sim.clockTick();
		expect(sim.state.transport.position).toBeCloseTo(2);
		sim.follow('stop');
		sim.clockTick();
		expect(sim.state.transport).toMatchObject({ playing: false, position: 0 });
		sim.follow('continue');
		expect(sim.state.transport.playing).toBe(true);
		sim.setTempo(139.96);
		expect(sim.state.tempo.bpm).toBe(140);
		sim.setTempo(300);
		expect(sim.state.tempo.bpm).toBe(220);
		sim.selectTrack(4);
		expect(sim.state.track).toBe(4);
		sim.selectTrack(12);
		expect(sim.state.track).toBe(4);
	});
});

describe('frames and formats', () => {
	it('formats values the way the screen shows them', () => {
		expect(two(7)).toBe('07');
		expect(two(120)).toBe('99');
		expect(formatTune(-1.22)).toBe('–1.22');
		expect(formatTune(0.5)).toBe('+0.50');
		expect(formatTune(0)).toBe('+0.00');
		expect(formatBpm(120)).toBe('120');
		expect(formatBpm(96.25)).toBe('96.3');
		expect(keyName(1)).toBe('F#3');
		expect(keyName(23)).toBe('E5');
		expect(lfoSpeed(0)).toMatchObject({ synced: true, label: '1' });
		expect(lfoSpeed(3)).toMatchObject({ synced: true, label: '4' });
		expect(lfoSpeed(200)).toMatchObject({ synced: false });
	});

	it('builds stable frames for a new project (snapshot)', () => {
		const s = defaultState();
		const frames: Record<string, ScreenFrame> = {};
		frames.drum = buildFrame(s);
		s.pages.instrument = 2;
		frames.envelope = buildFrame(s);
		s.pages.instrument = 3;
		frames.filter = buildFrame(s);
		s.pages.instrument = 4;
		s.track = 2;
		frames.lfo = buildFrame(s);
		s.pages.instrument = 1;
		frames.prism = buildFrame(s);
		s.overlay = 'tempo';
		frames.tempo = buildFrame(s);
		s.overlay = 'com';
		frames.com = buildFrame(s);
		expect(frames).toMatchSnapshot();
	});
});

describe('scenarios (states that reproduce TE’s guide art)', () => {
	it.each(SCENARIOS.map((s) => [s.id, s] as const))('%s lands on its page and renders', (_, s) => {
		const sim = new OpxySim({ now: () => 0 });
		s.setup(sim);
		expect(sim.frame.page).toBe(s.page);
		const ctx = new RecordingContext();
		renderFrame(ctx, sim.frame);
		expect(ctx.fills.length).toBeGreaterThan(10);
	});

	it('have unique ids and guide files', () => {
		expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
		const pictures = SCENARIOS.flatMap((s) => (s.png === null ? [] : [s.png]));
		expect(new Set(pictures).size).toBe(pictures.length);
	});
});

describe('modules switched off (research 59 §2.3, §2.4)', () => {
	it('switches the filter with M3 on its page and the LFO with M4 on its, dimming each under "off"', () => {
		const sim = new OpxySim();
		sim.press('track.3');
		sim.press('key.m3');
		expect(sim.state.tracks[2].filter.on).toBe(true);
		sim.press('key.m3');
		expect(sim.state.tracks[2].filter.on).toBe(false);
		expect(page(sim, 'filter').off).toBe(true);
		expect(describeFrame(sim.frame)).toMatch(/^svf filter off: /);
		const ctx = new RecordingContext();
		renderFrame(ctx, sim.frame);
		// the black box "off" sits in, over the page drawn at 40 %
		expect(ctx.fills.some((f) => f.x0 === 210.5 && f.y0 === 90.5 && f.alpha === 1)).toBe(true);
		expect(ctx.fills.some((f) => f.alpha === 0.4)).toBe(true);
		sim.press('key.m3');
		expect(page(sim, 'filter').off).toBeUndefined();
		// arriving from another page never switches it
		sim.press('key.m4');
		const on = sim.state.tracks[2].lfo.on;
		sim.press('key.m4');
		expect(sim.state.tracks[2].lfo.on).toBe(!on);
		sim.press('key.m1');
		sim.press('key.m3');
		expect(sim.state.tracks[2].filter.on).toBe(true);
	});
});
