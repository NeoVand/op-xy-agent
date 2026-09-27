import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import { defaultState } from '../../params';
import { renderFrame } from '../../screen/render';
import { describeFrame, type ScreenFrame } from '../../screen';
import { RecordingContext } from '../../screen/recording';
import { ownerOf } from '../registry';
import { SCENARIOS } from '../../scenarios';
import { midiCcPage, mixPage, mixer, signed } from './sim';
import { initialMixer } from './state';
import { scenarios } from './scenarios';

/** The frame, narrowed to one page (fails the test on another page). */
function page<P extends ScreenFrame['page']>(
	sim: OpxySim,
	name: P
): Extract<ScreenFrame, { page: P }> {
	const frame = sim.frame;
	expect(frame.page).toBe(name);
	return frame as Extract<ScreenFrame, { page: P }>;
}

/** A simulator on mix page `n`. */
function mix(n: 2 | 3 | 4): OpxySim {
	const sim = new OpxySim({ now: () => 0 });
	sim.press('key.mix');
	sim.press(`key.m${n}`);
	return sim;
}

/** A simulator on instrument track 3, switched to the midi engine, showing M-page `n`. */
function midi(n: 1 | 2 | 3 | 4 = 2): OpxySim {
	const sim = new OpxySim({ now: () => 0 });
	sim.press('track.3');
	sim.state.tracks[2].engine = 'midi';
	sim.press(`key.m${n}`);
	return sim;
}

/** Holds shift while `run` happens. */
function withShift(sim: OpxySim, run: () => void): void {
	sim.input({ type: 'press', id: 'key.shift' });
	run();
	sim.input({ type: 'release', id: 'key.shift' });
}

describe('the mixer area: which screens it owns', () => {
	it('owns mix M2–M4 and leaves mix M1 to the core', () => {
		const s = defaultState();
		s.mode = 'mix';
		expect(ownerOf(s)).toBeNull();
		for (const n of [2, 3, 4] as const) {
			s.pages.mix = n;
			expect(ownerOf(s)).toBe(mixer);
			expect(mixPage(s)).toBe(n);
		}
		s.overlay = 'tempo';
		expect(mixer.owns(s)).toBe(false);
		s.overlay = null;
		s.sub = 'preset browser · T1';
		expect(mixer.owns(s)).toBe(false);
	});

	it('owns M2 and M3 of a midi-engine track only, never under a list or a sub-page', () => {
		const s = defaultState();
		s.track = 2;
		s.pages.instrument = 2;
		expect(mixer.owns(s)).toBe(false); // prism: the envelopes are the core's
		s.tracks[2].engine = 'midi';
		expect(ownerOf(s)).toBe(mixer);
		expect(midiCcPage(s)).toBe(2);
		s.pages.instrument = 3;
		expect(midiCcPage(s)).toBe(3);
		for (const n of [1, 4] as const) {
			s.pages.instrument = n;
			expect(mixer.owns(s)).toBe(false);
		}
		s.pages.instrument = 2;
		s.picker = { kind: 'lfo', index: 0 };
		expect(mixer.owns(s)).toBe(false);
		s.picker = null;
		s.overlay = 'com';
		expect(mixer.owns(s)).toBe(false);
	});
});

describe('mix M2: master EQ (manual: mix/eq)', () => {
	it('starts flat with blend at half, as a new project file stores it', () => {
		const eq = page(mix(2), 'mix-eq');
		expect(eq.header.map((c) => [c.label, c.value])).toEqual([
			['low', '00'],
			['mid', '00'],
			['high', '00'],
			['blend', '50']
		]);
		expect(eq.bands).toEqual([0, 0, 0]);
		expect(eq.blend).toBeCloseTo(50 / 99);
	});

	it('cuts and boosts the three bands within ±50 and sets blend within 0–99', () => {
		const sim = mix(2);
		sim.turn(1, 12);
		sim.turn(2, -8);
		sim.turn(3, 70);
		sim.turn(4, -80);
		const eq = page(sim, 'mix-eq');
		expect(eq.header.map((c) => c.value)).toEqual(['+12', '–08', '+50', '00']);
		expect(eq.bands).toEqual([12 / 50, -8 / 50, 1]);
		expect(eq.blend).toBe(0);
		sim.turn(1, -200);
		expect(sim.state.areas.mixer.eq.low).toBe(-50);
		sim.turn(4, 300);
		expect(sim.state.areas.mixer.eq.blend).toBe(99);
	});

	it('resets a band with its click and the whole EQ with E4’s', () => {
		const sim = mix(2);
		sim.turn(1, 20);
		sim.turn(2, -20);
		sim.turn(3, 5);
		sim.turn(4, 30);
		sim.click(2);
		expect(sim.state.areas.mixer.eq).toMatchObject({ low: 20, mid: 0, high: 5, blend: 80 });
		sim.click(4);
		expect(sim.state.areas.mixer.eq).toEqual(initialMixer().eq);
	});

	it('leaves the master chain alone when the mixer shows auxiliary tracks', () => {
		const sim = mix(2);
		sim.press('key.mix'); // flips the track keys to the auxiliary tracks
		expect(sim.state.banks.mix).toBe('auxiliary');
		sim.turn(1, 3);
		expect(page(sim, 'mix-eq').header[0].value).toBe('+03');
	});
});

describe('mix M3: master saturator (manual: mix/saturator)', () => {
	it('starts with gain and clip at 20, tone neutral and nothing mixed in', () => {
		const sat = page(mix(3), 'mix-saturator');
		expect(sat.header.map((c) => `${c.label} ${c.value}`)).toEqual([
			'gain 20',
			'clip 20',
			'tone 00',
			'mix 00'
		]);
		expect(sat.mix).toBe(0);
	});

	it('turns gain, clip, tone (either side of neutral) and mix, clamped', () => {
		const sim = mix(3);
		sim.turn(1, 100);
		sim.turn(2, -30);
		sim.turn(3, -12);
		sim.turn(4, 45);
		const sat = page(sim, 'mix-saturator');
		expect(sat.header.map((c) => c.value)).toEqual(['99', '00', '–12', '45']);
		expect(sat).toMatchObject({ gain: 1, clip: 0, tone: -12 / 50, mix: 45 / 99 });
		sim.turn(3, 99);
		expect(sim.state.areas.mixer.saturator.tone).toBe(50);
	});

	it('gives clicks nothing to do (the manual names none)', () => {
		const sim = mix(3);
		sim.turn(1, 10);
		const before = JSON.stringify(sim.state.areas.mixer);
		for (const e of [1, 2, 3, 4] as const) sim.click(e);
		expect(JSON.stringify(sim.state.areas.mixer)).toBe(before);
	});
});

describe('mix M4: groups, compressor and master level (manual: mix/master)', () => {
	it('starts at a new project’s levels and lists the tracks in each group', () => {
		const master = page(mix(4), 'mix-master');
		expect(master.header.map((c) => `${c.label} ${c.value}`)).toEqual([
			'percussion 50',
			'melodic 50',
			'compressor 10',
			'master 50'
		]);
		// T1–T2 run the drum sampler; T3–T8 synth engines and the multisampler
		expect(master.groups).toEqual(['1 2', '3 4 5 6 7 8']);
		expect(master.meters).toEqual([0, 0, 0]);
	});

	it('turns each level within 0–99', () => {
		const sim = mix(4);
		sim.turn(1, 20);
		sim.turn(2, -60);
		sim.turn(3, 5);
		sim.turn(4, 49);
		expect(page(sim, 'mix-master').values).toEqual([70 / 99, 0, 15 / 99, 1]);
	});

	it('moves tracks between groups with their engine; the midi engine makes no sound', () => {
		const sim = mix(4);
		sim.state.tracks[3].engine = 'drum';
		sim.state.tracks[6].engine = 'midi';
		expect(page(sim, 'mix-master').groups).toEqual(['1 2 4', '3 5 6 8']);
	});

	it('thickens a group’s bar while its tracks play, the master with the louder group', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('step.1'); // a drum hit on T1
		sim.press('key.mix');
		sim.press('key.m4');
		sim.press('key.play');
		sim.advance(30);
		const [percussion, melodic, master] = page(sim, 'mix-master').meters;
		expect(percussion).toBeGreaterThan(0.3);
		expect(melodic).toBe(0);
		expect(master).toBeCloseTo(percussion, 5);
		sim.turn(1, -50); // the percussion group down to 0
		expect(page(sim, 'mix-master').meters).toEqual([0, 0, 0]);
	});
});

describe('midi engine M2 / M3: CC slots (manual: instrument/engine-midi)', () => {
	it('starts with all eight slots off, shown as crossed boxes', () => {
		const cc = page(midi(2), 'midi-engine-cc');
		expect(cc.set).toBe(1);
		expect(cc.slots).toEqual(Array(4).fill({ label: 'off', value: null }));
	});

	it('switches a slot on and picks its number with shift + turn, off below CC 0', () => {
		const sim = midi(2);
		sim.turn(1, 5); // an off slot has no value to turn
		expect(sim.state.areas.mixer.midiCc[2][0]).toEqual({ cc: null, value: 0 });
		withShift(sim, () => {
			sim.turn(1, 1);
			expect(page(sim, 'midi-engine-cc').slots[0]).toEqual({ label: 'cc', value: '0' });
			sim.turn(1, 74);
			expect(page(sim, 'midi-engine-cc').slots[0]).toEqual({ label: 'cc', value: '74' });
			sim.turn(2, 500);
		});
		expect(sim.state.areas.mixer.midiCc[2][1].cc).toBe(127);
		withShift(sim, () => sim.turn(2, -200));
		expect(sim.state.areas.mixer.midiCc[2][1].cc).toBeNull();
	});

	it('turns an on slot’s value within 0–127 and shows it under its CC number', () => {
		const sim = midi(2);
		withShift(sim, () => sim.turn(4, 2)); // CC 1, the mod wheel
		sim.turn(4, 90);
		sim.turn(4, 90);
		const cc = page(sim, 'midi-engine-cc');
		expect(cc.shift).toBe(false);
		expect(cc.slots[3]).toEqual({ label: 'cc 1', value: '127' });
		sim.turn(4, -300);
		expect(sim.state.areas.mixer.midiCc[2][3]).toEqual({ cc: 1, value: 0 });
	});

	it('holds slots 5–8 on M3, per track', () => {
		const sim = midi(3);
		withShift(sim, () => sim.turn(1, 11));
		sim.turn(1, 64);
		const cc = page(sim, 'midi-engine-cc');
		expect(cc.set).toBe(2);
		expect(cc.slots[0]).toEqual({ label: 'cc 10', value: '64' });
		expect(sim.state.areas.mixer.midiCc[2][4]).toEqual({ cc: 10, value: 64 });
		expect(sim.state.areas.mixer.midiCc[2].slice(0, 4).every((s) => s.cc === null)).toBe(true);
		expect(sim.state.areas.mixer.midiCc[3][4].cc).toBeNull();
	});

	it('keeps shift + M3 on the CC pages (no filter list) while shift + M1 still lists engines', () => {
		const sim = midi(2);
		sim.combo('key.shift', 'key.m3');
		expect(sim.state.picker).toBeNull();
		expect(page(sim, 'midi-engine-cc').set).toBe(2);
		sim.combo('key.shift', 'key.m2');
		expect(page(sim, 'midi-engine-cc').set).toBe(1);
		sim.combo('key.shift', 'key.m1');
		expect(sim.state.picker?.kind).toBe('engine');
		expect(sim.frame.page).toBe('list');
	});

	it('keeps a track’s slots through an engine change and back', () => {
		const sim = midi(2);
		withShift(sim, () => sim.turn(1, 75));
		sim.state.tracks[2].engine = 'prism';
		expect(sim.frame.page).toBe('envelope');
		sim.turn(1, 3); // now the amp envelope's attack, not a CC
		sim.state.tracks[2].engine = 'midi';
		expect(page(sim, 'midi-engine-cc').slots[0]).toEqual({ label: 'cc 74', value: '0' });
	});
});

describe('mix M1 meters (manual: mix/mute-solo)', () => {
	/** Track 1 and 3 hit on step 1; playing, `ms` into the bar. */
	function playing(ms: number): OpxySim {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('track.1');
		sim.press('step.1');
		sim.press('track.3');
		sim.press('step.1');
		sim.press('key.mix');
		sim.press('key.play');
		sim.advance(ms);
		return sim;
	}

	it('jumps on a hit and falls away over the next steps; silent tracks stay thin', () => {
		const early = page(playing(10), 'mix').strips;
		const late = page(playing(125 * 3), 'mix').strips;
		// level 80, velocity 100: about 0.6 right after the hit
		expect(early[0].meter).toBeGreaterThan(0.5);
		expect(late[0].meter).toBeLessThan(early[0].meter / 4);
		expect(early[1].meter).toBe(0);
		expect(early[2].meter).toBeCloseTo(early[0].meter, 5);
	});

	it('reads 0 when stopped or muted', () => {
		const sim = playing(10);
		sim.state.tracks[0].mix.muted = true;
		expect(page(sim, 'mix').strips[0].meter).toBe(0);
		sim.press('key.stop');
		expect(page(sim, 'mix').strips.every((s) => s.meter === 0)).toBe(true);
	});

	it('silences the tracks a held track key leaves out of its solo, but not with shift', () => {
		const sim = playing(10);
		sim.input({ type: 'press', id: 'track.1' });
		let strips = page(sim, 'mix').strips;
		expect(strips[0].meter).toBeGreaterThan(0);
		expect(strips[2].meter).toBe(0);
		sim.input({ type: 'release', id: 'track.1' });
		sim.input({ type: 'press', id: 'key.shift' });
		sim.input({ type: 'press', id: 'track.2' }); // shift + T2 mutes T2, it does not solo it
		strips = page(sim, 'mix').strips;
		expect(strips[2].meter).toBeGreaterThan(0);
		expect(strips[1].muted).toBe(true);
	});
});

describe('frames, formats and scenarios', () => {
	it('shows bipolar values with a sign and two digits', () => {
		expect(signed(0)).toBe('00');
		expect(signed(0.4)).toBe('00');
		expect(signed(7)).toBe('+07');
		expect(signed(-12)).toBe('–12');
		expect(signed(50)).toBe('+50');
	});

	it('describes each page in words', () => {
		expect(describeFrame(mix(2).frame)).toBe('master eq: low 00, mid 00, high 00, blend 50');
		expect(describeFrame(mix(3).frame)).toContain('master saturator: gain 20');
		expect(describeFrame(mix(4).frame)).toContain('percussion 50');
		expect(describeFrame(midi(3).frame)).toBe('midi cc set II: off, off, off, off');
	});

	it.each(scenarios.map((s) => [s.id, s] as const))('scenario %s renders its page', (_, s) => {
		const sim = new OpxySim({ now: () => 0 });
		s.setup(sim);
		expect(sim.frame.page).toBe(s.page);
		const ctx = new RecordingContext();
		renderFrame(ctx, sim.frame);
		expect(ctx.fills.length).toBeGreaterThan(10);
		expect(SCENARIOS).toContain(s);
	});
});
