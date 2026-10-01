import { describe, expect, it } from 'vitest';
import { tryParseKeys } from '$lib/core/opxy';
import {
	findParam,
	keyIndexOf,
	pageValues,
	planPageValue,
	planParam,
	planPlace,
	planSettings,
	planToSetting,
	playStep,
	reads,
	type NavPlan,
	type SettingGoal
} from './navigator';
import { shown } from './params';
import { settingGoal } from './settings';
import { ARP_STYLES, currentPattern } from './sequencer';
import { OpxySim } from './opxy-sim.svelte';

const boot = () => new OpxySim({ now: () => 0 });
const keys = (plan: NavPlan) =>
	plan.steps.map((s) => (s.clicks ? `${s.keys} ${s.clicks}` : s.keys));

/** Every step is in the manual's key grammar, so the replica can animate it. */
function grammatical(plan: NavPlan) {
	for (const step of plan.steps) expect(tryParseKeys(step.keys).ok, step.keys).toBe(true);
}

describe('the navigator: places', () => {
	it('walks to an instrument page from a new project, and does nothing when already there', () => {
		const sim = boot();
		const plan = planPlace(sim.state, { area: 'instrument', track: 3, page: 3 });
		expect(plan.reached).toBe(true);
		expect(keys(plan)).toEqual(['T3', 'M3']);
		expect(plan.screen).toMatch(/filter/);
		grammatical(plan);
		// planned on a copy: the simulator itself has not moved
		expect(sim.state.track).toBe(0);
		sim.press('track.3');
		sim.press('key.m3');
		expect(planPlace(sim.state, { area: 'instrument', track: 3, page: 3 }).steps).toEqual([]);
	});

	it('leaves an open page with the mode key first', () => {
		const sim = boot();
		sim.press('key.tempo');
		const plan = planPlace(sim.state, { area: 'instrument', track: 2, page: 4 });
		expect(keys(plan)).toEqual(['instrument', 'T2', 'M4']);
		expect(plan.reached).toBe(true);
	});

	it('reaches the auxiliary tracks, the mixer, the tempo page and a track’s player', () => {
		const sim = boot();
		expect(keys(planPlace(sim.state, { area: 'auxiliary', track: 7, page: 1 }))).toEqual([
			'auxiliary',
			'T7'
		]);
		const mix = planPlace(sim.state, { area: 'mix', page: 2 });
		expect(keys(mix)).toEqual(['mix', 'M2']);
		expect(mix.screen).toMatch(/eq/);
		expect(keys(planPlace(sim.state, { area: 'tempo' }))).toEqual(['tempo']);
		const player = planPlace(sim.state, { area: 'player', track: 4 });
		expect(keys(player)).toEqual(['T4', 'player']);
		expect(player.reached).toBe(true);
	});
});

describe('the navigator: parameters', () => {
	it('sets the filter cutoff with detents on E1 of M3, reading the value off the screen', () => {
		const sim = boot();
		const plan = planParam(sim.state, { track: 3, param: 'cutoff', value: 40 });
		expect(plan.reached).toBe(true);
		expect(keys(plan)).toEqual(['T3', 'M3', 'turn E1 40']);
		expect(plan.screen).toContain('cutoff 40');
		grammatical(plan);
	});

	it('picks the envelope before turning, and the shift layer for play mode and sends', () => {
		const sim = boot();
		sim.press('track.3');
		const release = planParam(sim.state, { param: 'amp.release', value: 60 });
		expect(keys(release)[0]).toBe('M2');
		expect(release.steps[1]).toMatchObject({ keys: 'turn E4', clicks: expect.any(Number) });
		expect(release.screen).toContain('release 60');
		const attack = planParam(sim.state, { param: 'filter attack', value: 50 });
		expect(keys(attack).slice(0, 2)).toEqual(['M2', 'click E1']);
		expect(attack.reached).toBe(true);
		const glide = planParam(sim.state, { param: 'portamento', value: 12 });
		expect(keys(glide)).toEqual(['M2', 'shift + turn E2 12']);
		const reverb = planParam(sim.state, { param: 'fx ii', value: 30 });
		expect(keys(reverb)).toEqual(['M3', 'shift + turn E4 30']);
		expect(reverb.reached).toBe(true);
		for (const plan of [release, attack, glide, reverb]) grammatical(plan);
	});

	it('switches an off filter on before turning its cutoff', () => {
		const sim = boot();
		sim.press('track.4'); // a new project's T4 filter is off
		expect(sim.state.tracks[3].filter.on).toBe(false);
		const plan = planParam(sim.state, { param: 'cutoff', value: 50 });
		expect(keys(plan).slice(0, 2)).toEqual(['M3', 'M3']);
		expect(plan.steps[1].screen).not.toMatch(/filter off/);
		expect(plan.reached).toBe(true);
	});

	it('finds an engine’s parameters by the names its page shows', () => {
		const sim = boot();
		expect(findParam('shape', sim.state, 3)).toBe('m1.1'); // T3 is prism
		const plan = planParam(sim.state, { track: 3, param: 'detune', value: 20 });
		// a new project opens on M1 already
		expect(keys(plan)).toEqual(['T3', 'turn E3 15']);
		expect(plan.reached).toBe(true);
	});

	it('sets tempo parameters on the tempo page, by number or by the name on screen', () => {
		const sim = boot();
		const bpm = planParam(sim.state, { param: 'tempo', value: 128 });
		expect(keys(bpm)).toEqual(['tempo', 'turn E1 8']);
		expect(bpm.screen).toContain('tempo 128 bpm');
		const groove = planParam(sim.state, { param: 'groove', value: 'danish' });
		expect(groove.reached).toBe(true);
		expect(keys(groove)).toEqual(['tempo', 'turn E2 2']);
	});

	it('switches the metronome on and off with a click of E4; a number is its level', () => {
		const sim = boot();
		expect(sim.state.tempo.metronome.on).toBe(true);
		const off = planParam(sim.state, { param: 'metronome', value: 'off' });
		expect(off.reached).toBe(true);
		expect(keys(off)).toEqual(['tempo', 'click E4']);
		// already on: the page and nothing to click
		const on = planParam(sim.state, { param: 'metronome', value: 'on' });
		expect([on.reached, keys(on)]).toEqual([true, ['tempo']]);
		// level 0 is silent with the metronome still on, and the plan says so
		const zero = planParam(sim.state, { param: 'metronome', value: 0 });
		expect(zero.reached).toBe(true);
		expect(zero.note).toMatch(/still on \(the value off switches it off\)/);
		expect(zero.screen).toMatch(/metronome on/);
	});

	it('switches a track’s filter and LFO on and off with their page key', () => {
		const sim = boot();
		// a new project's T4 has its filter off and its tremolo on
		const filter = planParam(sim.state, { track: 4, param: 'filter', value: 'on' });
		expect([filter.reached, keys(filter)]).toEqual([true, ['T4', 'M3', 'M3']]);
		const lfo = planParam(sim.state, { track: 4, param: 'lfo', value: 'off' });
		expect([lfo.reached, keys(lfo)]).toEqual([true, ['T4', 'M4', 'M4']]);
		expect(lfo.screen).toMatch(/lfo off:/);
		expect(planParam(sim.state, { track: 4, param: 'lfo', value: 'on' }).steps).toHaveLength(2);
	});

	it('takes a number for the groove as its amount, and refuses one for a list elsewhere', () => {
		const sim = boot();
		// "groove 70" means the amount (E3): the groove type is a list of names
		const amount = planParam(sim.state, { param: 'groove', value: 70 });
		expect(amount.reached).toBe(true);
		expect(keys(amount)).toEqual(['tempo', 'turn E3 70']);
		expect(amount.note).toMatch(/groove amount \(E3, swing\); the groove type stays/);
		expect(sim.state.tempo.groove).toBe(0);
		// a list never clamps a number onto its last word
		const wrong = planParam(sim.state, { track: 3, param: 'lfo type', value: 70 });
		expect(wrong.reached).toBe(false);
		// set_sound's names for the engine's four values work here too
		expect(findParam('engine p2', sim.state, 3)).toBe('m1.2');
	});

	it('picks engines, filter types and LFO types from their lists', () => {
		const sim = boot();
		const duck = planParam(sim.state, { track: 3, param: 'lfo type', value: 'duck' });
		expect(duck.reached).toBe(true);
		expect(keys(duck).slice(0, 3)).toEqual(['T3', 'M4', 'shift + M4']);
		expect(keys(duck).at(-1)).toBe('click E1');
		expect(duck.screen).toMatch(/^duck lfo/);
		const engine = planParam(sim.state, { track: 3, param: 'engine', value: 'wavetable' });
		expect(engine.reached).toBe(true);
		expect(engine.screen).toMatch(/^wavetable: /);
		// a filter pick lands on the engine page, as on the device
		const filter = planParam(sim.state, { track: 3, param: 'filter type', value: 'ladder' });
		expect(filter.reached).toBe(true);
		expect(filter.screen).toMatch(/^prism: /);
		expect(planParam(sim.state, { track: 3, param: 'lfo type', value: 'wobble' }).note).toMatch(
			/not one of/
		);
		for (const plan of [duck, engine, filter]) grammatical(plan);
	});

	it('loads an engine from the preset browser shift + M1 brings up, as OS 1.1.33 does (research 59 §2.6)', () => {
		const sim = boot();
		const plan = planParam(sim.state, { track: 3, param: 'engine', value: 'wavetable' });
		// E1 walks the engine column from prism to wavetable; a click of E2 loads its first preset
		expect(keys(plan)).toEqual(['T3', 'shift + M1', 'turn E1 3', 'click E2']);
		expect(plan.steps[1].screen).toBe('presets for track 3, by engine: prism, shoulder');
		expect(plan.steps[2].screen).toBe('presets for track 3, by engine: wavetable, asinine');
		// the load leaves the browser for M1, where the device showed the new sound (b1-1569)
		expect(plan.screen).toMatch(/^wavetable: basic, position 00/);
		grammatical(plan);
		// from another page of the track, and with the browser left by category: E1's click first
		sim.press('track.3');
		sim.press('key.m3');
		sim.combo('key.shift', 'key.m1');
		sim.click(1);
		sim.press('key.instrument');
		expect(sim.state.areas.system.presets.view).toBe('category');
		const back = planParam(sim.state, { track: 3, param: 'engine', value: 'drum' });
		expect(keys(back)).toEqual(['shift + M1', 'click E1', 'turn E1 -5', 'click E2']);
		expect(back.reached).toBe(true);
		expect(back.screen).toMatch(/^drum key /);
	});

	it('sets an LFO’s destination by the names its page shows: free twins, element’s own four', () => {
		const sim = boot();
		// value (and random): each page, then its free twin under it (research 59 §2.4)
		const free = planSettings(sim.state, [
			{ track: 3, param: 'lfo type', value: 'value' },
			{ track: 3, param: 'lfo destination', value: 'filter free' }
		]);
		expect(free.reached).toBe(true);
		for (const step of free.steps) playStep(sim, step);
		expect(sim.state.tracks[2].lfo.destination).toBe(5);
		// element follows a sensor: syn, env, filter and amp, with no free twins (the stored sixth
		// place reads as its last, amp)
		const env = planSettings(sim.state, [
			{ track: 3, param: 'lfo type', value: 'element' },
			{ track: 3, param: 'lfo destination', value: 'env' }
		]);
		expect(env.reached).toBe(true);
		expect(env.steps.at(-1)).toMatchObject({ keys: 'turn E3', clicks: -3 });
		for (const step of env.steps) playStep(sim, step);
		expect(sim.state.tracks[2].lfo).toMatchObject({ type: 'element', destination: 1 });
		expect(env.screen).toBe('element lfo: source G, speed free 66, amount 0, destination env');
		const amp = planParam(sim.state, { track: 3, param: 'lfo destination', value: 'amp' });
		expect(amp.reached).toBe(true);
		expect(amp.screen).toBe('element lfo: source G, speed free 66, amount 0, destination amp');
	});

	it('reaches the midi engine at the end of the browser’s engines, with its starting sound (ours)', () => {
		const sim = boot();
		const midi = planParam(sim.state, { track: 3, param: 'engine', value: 'midi' });
		expect(midi.reached).toBe(true);
		expect(midi.steps.at(-1)?.keys).toBe('click E2');
		expect(midi.screen).toMatch(/^midi: channel /);
		for (const step of midi.steps) playStep(sim, step);
		expect(sim.state.tracks[2].engine).toBe('midi');
	});

	it('puts an engine first in a sound set up from an idea: the preset changes the whole sound', () => {
		const sim = boot();
		const plan = planSettings(sim.state, [
			{ track: 3, param: 'engine', value: 'simple' },
			{ track: 3, param: 'cutoff', value: 40 }
		]);
		expect(plan.reached).toBe(true);
		expect(plan.parts[0].steps.map((s) => s.keys)).toEqual([
			'T3',
			'shift + M1',
			'turn E1',
			'click E2'
		]);
		for (const step of plan.steps) playStep(sim, step);
		expect(sim.state.tracks[2].engine).toBe('simple');
		expect(reads(sim.state, { track: 3, param: 'cutoff', value: 40 })).toBe(true);
		expect(reads(sim.state, { track: 3, param: 'engine', value: 'simple' })).toBe(true);
	});

	it('sets up a sidechain duck: the type, the track that triggers it, the amount', () => {
		const sim = boot();
		sim.reset(JSON.parse(JSON.stringify(sim.state)));
		const plans = [
			planParam(sim.state, { track: 3, param: 'lfo type', value: 'duck' }),
			{ param: 'duck source', value: 1 },
			{ param: 'lfo amount', value: 60 }
		];
		const first = plans[0] as ReturnType<typeof planParam>;
		for (const step of first.steps) playStep(sim, step);
		for (const goal of plans.slice(1) as { param: string; value: number }[]) {
			const plan = planParam(sim.state, { track: 3, ...goal });
			expect(plan.reached, goal.param).toBe(true);
			for (const step of plan.steps) playStep(sim, step);
		}
		const lfo = sim.state.tracks[2].lfo;
		expect(lfo).toMatchObject({ type: 'duck', on: true, source: 1 });
		expect(Math.round(lfo.amount)).toBe(60);
	});

	it('sets several parameters in a row, each from where the last left off', () => {
		const sim = boot();
		const pluck = planSettings(sim.state, [
			{ track: 3, param: 'amp attack', value: 5 },
			{ track: 3, param: 'amp decay', value: 25 },
			{ track: 3, param: 'amp sustain', value: 0 },
			{ track: 3, param: 'resonance', value: 30 }
		]);
		expect(pluck.reached).toBe(true);
		expect(pluck.parts.map((p) => p.reached)).toEqual([true, true, true, true]);
		// the second goal starts on M2 where the first left the copy: no page keys, only its turn
		expect(pluck.parts[1].steps.map((s) => s.keys)).toEqual(['turn E2']);
		grammatical(pluck);
		for (const step of pluck.steps) playStep(sim, step);
		const t = sim.state.tracks[2];
		expect([shown(t.amp.decay), shown(t.amp.sustain), shown(t.filter.resonance)]).toEqual([
			25, 0, 30
		]);
		// done: every goal reads its value, so a second plan has nothing to do
		expect(reads(sim.state, { track: 3, param: 'amp decay', value: 25 })).toBe(true);
		const again = planSettings(
			sim.state,
			pluck.parts.map((p) => p.goal)
		);
		expect(again.steps).toEqual([]);
		expect(again.parts.every((p) => p.note === 'already set')).toBe(true);
	});

	it('goes on past a goal it cannot reach and says which', () => {
		const sim = boot();
		const plan = planSettings(sim.state, [
			{ track: 3, param: 'warp drive', value: 1 },
			{ track: 3, param: 'cutoff', value: 40 }
		]);
		expect(plan.reached).toBe(false);
		expect(plan.parts[0]).toMatchObject({ reached: false, steps: [] });
		expect(plan.parts[1].reached).toBe(true);
		expect(plan.note).toMatch(/^warp drive: no parameter/);
		for (const step of plan.steps) playStep(sim, step);
		expect(reads(sim.state, { track: 3, param: 'cutoff', value: 40 })).toBe(true);
	});

	it('says why when it cannot', () => {
		const sim = boot();
		expect(planParam(sim.state, { param: 'warp drive', value: 1 })).toMatchObject({
			reached: false,
			note: expect.stringMatching(/no parameter/)
		});
		// T1's drum engine has no synth parameters on M1
		expect(planParam(sim.state, { track: 1, param: 'm1.1', value: 3 }).reached).toBe(false);
	});
});

describe('the navigator: values on the auxiliary and mixer pages', () => {
	const screenAfter = (plan: NavPlan) => {
		const sim = boot();
		for (const step of plan.steps) playStep(sim, step);
		return plan.screen;
	};

	it('reads a page’s values off its description, words and all', () => {
		const values = pageValues('FX I delay: size 1/8 dotted, fine 50, pitch X1, low –08, mic off');
		expect(Object.fromEntries(values)).toEqual({
			size: '1/8 dotted',
			fine: '50',
			pitch: 'X1',
			low: '–08',
			mic: 'off'
		});
	});

	it('finds the encoder by turning each one on a copy, then turns it to the value', () => {
		const sim = boot();
		const plan = planPageValue(sim.state, {
			area: 'auxiliary',
			track: 8,
			label: 'reverb size',
			value: 80
		});
		expect(plan.reached).toBe(true);
		expect(keys(plan)).toEqual(['auxiliary', 'T8', 'turn E1 11']);
		expect(screenAfter(plan)).toMatch(/size 80/);
		grammatical(plan);
		expect(sim.state.mode).toBe('instrument'); // planned on a copy
	});

	it('picks the mixer strip with its track key, and reaches the sends only a popup shows', () => {
		const sim = boot();
		const level = planPageValue(sim.state, { area: 'mix', track: 3, label: 'level', value: 60 });
		expect(level.steps.map((s) => s.keys)).toEqual(['mix', 'T3', 'turn E4']);
		expect(level.screen).toMatch(/^mix, instrument track 3: level 60/);
		const pan = planPageValue(sim.state, { area: 'mix', track: 3, label: 'pan', value: -40 });
		expect(pan.screen).toMatch(/pan -40/);
		const send = planPageValue(sim.state, {
			area: 'mix',
			track: 4,
			label: 'fx ii send',
			value: 30
		});
		expect(send.reached).toBe(true);
		expect(send.steps.at(-1)?.keys).toBe('turn E2');
		expect(send.screen).toMatch(/fx II 30/);
		// tracks 9–16 are the other set: mix pressed again swaps the track keys over
		const aux = planPageValue(sim.state, { area: 'mix', track: 15, label: 'level', value: 50 });
		expect(keys(aux).slice(0, 3)).toEqual(['mix', 'mix', 'T7']);
		expect(aux.screen).toMatch(/^mix, auxiliary track 7: level 50/);
	});

	it('finds the page that shows the value, with a cut on the master EQ', () => {
		const sim = boot();
		const low = planPageValue(sim.state, { area: 'mix', label: 'low', value: -8 });
		expect(low.reached).toBe(true);
		expect(keys(low).slice(0, 2)).toEqual(['mix', 'M2']);
		expect(low.steps.at(-1)?.clicks).toBeLessThan(0);
	});

	it('sets the player page’s values, its shift layer turned with shift held', () => {
		const sim = boot();
		const speed = planPageValue(sim.state, {
			area: 'player',
			track: 3,
			label: 'speed',
			value: '1/16'
		});
		expect(speed.steps.map((s) => s.keys)).toEqual(['T3', 'player', 'turn E1']);
		expect(speed.screen).toMatch(/speed 1\/16/);
		const style = planPageValue(sim.state, {
			area: 'player',
			track: 3,
			label: 'style',
			value: 'converge'
		});
		expect(style.reached).toBe(true);
		expect(style.steps.at(-1)?.keys).toBe('shift + turn E2');
		grammatical(style);
		for (const step of style.steps) playStep(sim, step);
		const player = currentPattern(sim.state.tracks[2].sequence).player;
		expect(player.arp.style).toBe(ARP_STYLES.indexOf('converge'));
	});

	it('says which values the pages do show when it cannot find one', () => {
		const sim = boot();
		const plan = planPageValue(sim.state, { area: 'mix', label: 'warp', value: 3 });
		expect(plan.reached).toBe(false);
		expect(plan.note).toMatch(/no page shows "warp"; these do: level \(M1\)/);
	});
});

describe('the navigator: key grammar the plans use', () => {
	it('holds a chord’s keys, and keeps them down across “→ +”', () => {
		const sim = boot();
		playStep(sim, { keys: 'T3' });
		// shift stays down while E1 turns: the list's box moves two on, to maestro
		playStep(sim, { keys: 'shift + player → + turn E1', clicks: 2 });
		expect(currentPattern(sim.state.tracks[2].sequence).player.type).toBe('maestro');
		expect(sim.state.shift).toBe(false);
		// a keyboard key held while M1 is pressed: the drum sampler's slicer on that key
		playStep(sim, { keys: 'instrument' });
		playStep(sim, { keys: 'T1' });
		playStep(sim, { keys: 'key G3 + M1' });
		expect(sim.state.areas.sample.slicer?.key).toBe(2);
	});

	it('plans the hold and maestro players from the list shift + player shows', () => {
		const sim = boot();
		const maestro = planPlace(sim.state, { area: 'player', track: 3, type: 'maestro' });
		expect(maestro.reached).toBe(true);
		expect(keys(maestro)).toEqual(['T3', 'shift + player → + turn E1 2']);
		expect(maestro.screen).toMatch(/^maestro player off/);
		grammatical(maestro);
		// already on the arpeggio page: one detent of E1 in the list is hold
		for (const step of planPlace(sim.state, { area: 'player', track: 3 }).steps)
			playStep(sim, step);
		const hold = planPlace(sim.state, { area: 'player', track: 3, type: 'hold' });
		expect(keys(hold)).toEqual(['shift + player → + turn E1 1']);
		expect(hold.screen).toBe('hold player off');
	});
});

describe('the navigator: sampler keys', () => {
	it('picks a drum key by name, note or sample, then sets its settings on M1', () => {
		const sim = boot();
		expect(keyIndexOf(sim.state, 1, 'G3')).toBe(2);
		expect(keyIndexOf(sim.state, 1, 'key F#3')).toBe(1);
		expect(keyIndexOf(sim.state, 1, 'Bb3')).toBe(5);
		expect(keyIndexOf(sim.state, 1, 'snare 1')).toBe(2);
		expect(keyIndexOf(sim.state, 1, 3)).toBe(2);
		expect(keyIndexOf(sim.state, 1, 55)).toBe(2);
		expect(keyIndexOf(sim.state, 1, 'kazoo')).toBeNull();
		const tune = planParam(sim.state, { track: 1, param: 'tune', key: 'snare 1', value: -2 });
		expect(keys(tune)).toEqual(['key G3', 'turn E1 -20']);
		expect(tune.screen).toBe('drum key G3: tune –2.00, play mode oneshot');
		const pan = planParam(sim.state, { track: 1, param: 'pan', key: 'G3', value: -40 });
		expect(keys(pan)).toEqual(['key G3', 'shift + turn E2 -20']);
		for (const plan of [tune, pan]) grammatical(plan);
		for (const step of [...tune.steps, ...pan.steps]) playStep(sim, step);
		expect(sim.state.tracks[0].drumKeys[2]).toMatchObject({ tune: -2, pan: -40 });
		expect(reads(sim.state, { track: 1, param: 'key.tune', key: 'G3', value: -2 })).toBe(true);
		expect(reads(sim.state, { track: 1, param: 'key2.pan', value: -40 })).toBe(true);
	});

	it('tells a key’s play mode from the voice mode by the value, and turns direction anticlockwise', () => {
		const sim = boot();
		expect(findParam('play mode', sim.state, 1, 'mute group')).toBe('key.playMode');
		expect(findParam('play mode', sim.state, 1, 'mono')).toBe('playMode.mode');
		expect(findParam('play mode', sim.state, 3, 'mono')).toBe('playMode.mode');
		const reverse = planParam(sim.state, { track: 1, param: 'direction', value: 'reverse' });
		expect(keys(reverse)).toEqual(['shift + turn E1 -1']);
		expect(reverse.reached).toBe(true);
	});

	it('sets the synth sampler’s and a multisampler zone’s values, the zone by its key', () => {
		const sim = boot();
		// a new project's T8 runs the multisampler (pad/bandpasser)
		const tune = planParam(sim.state, { track: 8, param: 'tune', value: 2 });
		expect(keys(tune)).toEqual(['T8', 'shift + turn E2 20']);
		const crossfade = planParam(sim.state, { track: 8, param: 'crossfade', value: '40%' });
		expect(crossfade.reached).toBe(true);
		expect(crossfade.steps.at(-1)).toMatchObject({ keys: 'shift + turn E3', clicks: 40 });
		// the loop type is a choice a shifted click steps through
		const loop = planParam(sim.state, { track: 8, param: 'loop type', value: 'off' });
		expect(loop.reached).toBe(true);
		expect(keys(loop).slice(1)).toEqual(['shift + click E3', 'shift + click E3']);
		grammatical(loop);
		// the start stops a tenth of a percent before the end, off the detents' grid
		const start = planParam(sim.state, { track: 8, param: 'start', value: '99.9%' });
		expect(start.reached).toBe(true);
		expect(planParam(sim.state, { track: 3, param: 'sample.start', value: 5 }).note).toMatch(
			/track 3 runs prism/
		);
	});
});

describe('the navigator: values by the names the pages use', () => {
	it('sets the brain’s mode, link and routing, clicking to tracks 5–8 when it must', () => {
		const sim = boot();
		const mode = planPageValue(sim.state, {
			area: 'auxiliary',
			track: 1,
			label: 'mode',
			value: 'manual'
		});
		expect(keys(mode)).toEqual(['auxiliary', 'turn E1 -1']);
		const link = planPageValue(sim.state, { area: 'auxiliary', track: 1, label: 'link', value: 3 });
		expect(keys(link)).toEqual(['auxiliary', 'turn E4 3']);
		expect(link.screen).toMatch(/linked track 3$/);
		const lead = planPageValue(sim.state, {
			area: 'auxiliary',
			track: 1,
			label: 'track 5',
			value: 'out'
		});
		expect(keys(lead)).toEqual(['auxiliary', 'M2', 'click E1', 'turn E1 -1']);
		expect(lead.screen).toBe('brain routing: tracks 5–8 on the encoders, routed 3 4 6 7 8');
		for (const plan of [mode, link, lead]) grammatical(plan);
	});

	it('finds the page a phrase names: the tape’s speed on M1, its LFO’s on M4, switched on', () => {
		const sim = boot();
		const speed = planPageValue(sim.state, {
			area: 'auxiliary',
			track: 6,
			label: 'speed',
			value: 120
		});
		expect(keys(speed)).toEqual(['auxiliary', 'T6', 'turn E2 20']);
		const lfo = planPageValue(sim.state, {
			area: 'auxiliary',
			track: 6,
			label: 'lfo speed',
			value: 4
		});
		expect(keys(lfo)).toEqual(['auxiliary', 'T6', 'M4', 'M4', 'turn E1 -4']);
		expect(lfo.steps[3].screen).toMatch(/^lfo: /);
		// the speed dial runs its synced steps, then the free range from 00
		const free = planPageValue(sim.state, {
			area: 'auxiliary',
			track: 3,
			label: 'lfo speed',
			value: 40
		});
		expect(free.reached).toBe(true);
		expect(free.steps.at(-1)).toMatchObject({ keys: 'turn E1', clicks: 45 });
	});

	it('sets a word of several (play order), a reading with its unit (3 oct) and the player’s type', () => {
		const sim = boot();
		const order = planPageValue(sim.state, {
			area: 'player',
			track: 3,
			label: 'pattern',
			value: 'play order'
		});
		expect(keys(order)).toEqual(['T3', 'player', 'turn E2 5']);
		const range = planPageValue(sim.state, { area: 'player', track: 3, label: 'range', value: 3 });
		expect(range.screen).toMatch(/range 3 oct/);
		const on = planPageValue(sim.state, { area: 'player', track: 3, label: 'player', value: 'on' });
		expect(keys(on)).toEqual(['T3', 'player', 'player']);
		const plan = planSettings(sim.state, [
			{ area: 'player', track: 3, label: 'type', value: 'maestro' },
			{ area: 'player', track: 3, label: 'hold', value: 'on' }
		]);
		expect(plan.reached).toBe(true);
		for (const step of plan.steps) playStep(sim, step);
		const player = currentPattern(sim.state.tracks[2].sequence).player;
		expect(player).toMatchObject({
			type: 'maestro',
			maestro: expect.objectContaining({ hold: true })
		});
	});

	it('reaches COM, the record page, the midi engine’s values and an FX track’s effect', () => {
		const sim = boot();
		const multi = planPageValue(sim.state, { area: 'com', label: 'multi-out', value: 'sync16' });
		expect(keys(multi)).toEqual(['com', 'turn E3 2']);
		const source = planPageValue(sim.state, {
			area: 'sample',
			track: 1,
			label: 'source',
			value: 'line in'
		});
		expect(keys(source)).toEqual(['sample', 'turn E1 1']);
		const gain = planPageValue(sim.state, { area: 'sample', track: 1, label: 'gain', value: 6 });
		expect(gain.screen).toMatch(/gain \+6$/);
		const chorus = planPageValue(sim.state, {
			area: 'auxiliary',
			track: 7,
			label: 'effect',
			value: 'chorus'
		});
		expect(keys(chorus)).toEqual(['auxiliary', 'T7', 'shift + T7', 'turn E4 -1', 'click E4']);
		expect(chorus.screen).toMatch(/^FX I chorus: /);
		// on an instrument track, a value no parameter names is found on its pages by name
		const midi = boot();
		for (const step of planParam(midi.state, { track: 3, param: 'engine', value: 'midi' }).steps) {
			playStep(midi, step);
		}
		expect(keys(planParam(midi.state, { track: 3, param: 'channel', value: 5 }))).toEqual([
			'turn E1 4'
		]);
		const cc = planParam(midi.state, { track: 3, param: 'cc slot 2 number', value: 74 });
		expect(keys(cc)).toEqual(['M2', 'shift + turn E2 75']);
		for (const plan of [multi, source, chorus, cc]) grammatical(plan);
	});

	it('loads a preset by name from the browser, as it loads an engine', () => {
		const sim = boot();
		const plan = planParam(sim.state, { track: 3, param: 'preset', value: 'pluck/beach bum' });
		expect(keys(plan)).toEqual(['T3', 'shift + M1', 'turn E1 -4', 'click E2']);
		expect(plan.screen).toMatch(/^epiano: /);
		for (const step of plan.steps) playStep(sim, step);
		expect(sim.state.areas.system.trackPresets[2]).toBe('pluck/beach bum');
		expect(reads(sim.state, { track: 3, param: 'preset', value: 'beach bum' })).toBe(true);
		expect(planParam(sim.state, { track: 3, param: 'preset', value: 'nope' }).note).toMatch(
			/no preset "nope"/
		);
	});
});

describe('the navigator: arrange, slicing and the bar menu', () => {
	it('adds a pattern, picks scenes (two digits past 9) and keys a song in, then its loop', () => {
		const sim = boot();
		const pattern = planPageValue(sim.state, {
			area: 'arrange',
			track: 3,
			label: 'pattern',
			value: 2
		});
		expect(keys(pattern)).toEqual(['arrange', 'T3', 'M1']);
		expect(pattern.screen).toMatch(/T3 pattern 2 of 2$/);
		const scene = planPageValue(sim.state, { area: 'arrange', label: 'scene', value: 12 });
		expect(keys(scene)).toEqual([
			'arrange',
			'shift + accidental 0',
			'accidental 1',
			'accidental 2'
		]);
		const song = planPageValue(sim.state, { area: 'arrange', label: 'song', value: '1 1 2 2' });
		expect(keys(song)).toEqual([
			'arrange',
			'shift + arrange',
			'shift + M1',
			'shift + accidental 1',
			'shift + accidental 1',
			'shift + accidental 2',
			'shift + accidental 2'
		]);
		expect(song.screen).toBe('song 1, looping: 4 scenes, cursor at 5');
		for (const plan of [pattern, scene, song]) grammatical(plan);
		const goals: SettingGoal[] = [
			{ area: 'arrange', label: 'scene', value: 2 },
			{ area: 'arrange', track: 3, label: 'pattern', value: 2 },
			{ area: 'arrange', label: 'song', value: '1 1 2 2' },
			{ area: 'arrange', label: 'loop', value: 'off' }
		];
		const plan = planSettings(sim.state, goals);
		expect(plan.reached).toBe(true);
		for (const step of plan.steps) playStep(sim, step);
		const a = sim.state.areas.arrange;
		expect(a.songs[0]).toEqual({ order: [0, 0, 1, 1], loop: false });
		// scene 1 keeps track 3 on pattern 1; scene 2 has it on the new pattern
		expect(a.scenes[0]?.patterns[2]).toBe(0);
		expect(sim.state.tracks[2].sequence.current).toBe(1);
		expect(goals.every((goal) => reads(sim.state, goal))).toBe(true);
	});

	it('slices a drum key into even slices on the keys from F3, which choke each other', () => {
		const sim = boot();
		const goal: SettingGoal = {
			area: 'sample',
			track: 1,
			key: 'E5',
			label: 'even slices',
			value: 16
		};
		const plan = planPageValue(sim.state, goal);
		expect(keys(plan)).toEqual(['key E5 + M1', 'turn E1 1', 'turn E4 8', 'M4']);
		grammatical(plan);
		for (const step of plan.steps) playStep(sim, step);
		const [files, drumKeys] = [sim.state.areas.sample.tracks[0].keys, sim.state.tracks[0].drumKeys];
		expect(files.slice(0, 16).every((f) => f?.id === files[23]?.id)).toBe(true);
		expect(drumKeys.slice(0, 16).every((k) => k.playMode === 'mute group')).toBe(true);
		expect(reads(sim.state, goal)).toBe(true);
		expect(reads(sim.state, { ...goal, value: 8 })).toBe(false);
		expect(planPageValue(sim.state, { ...goal, track: 3 }).note).toMatch(/drum sampler's/);
	});

	it('sets the track scale and the bars with bar held, on an auxiliary track too', () => {
		const sim = boot();
		const scale = planPageValue(sim.state, {
			area: 'bar',
			track: 9,
			label: 'track scale',
			value: 4
		});
		expect(keys(scale)).toEqual(['auxiliary', 'bar + accidental 4']);
		const bars = planPageValue(sim.state, { area: 'bar', track: 3, label: 'bars', value: 2 });
		expect(keys(bars)).toEqual(['T3', 'bar + [+]']);
		const length = planPageValue(sim.state, { area: 'bar', track: 3, label: 'length', value: 25 });
		expect(keys(length)).toEqual(['T3', 'bar + turn E2 -25']);
		for (const plan of [scale, bars, length]) grammatical(plan);
		for (const step of scale.steps) playStep(sim, step);
		expect(currentPattern(sim.state.aux[0].sequence).scale).toBe(4);
		expect(planPageValue(sim.state, { area: 'bar', label: 'track scale', value: 9 }).note).toMatch(
			/one of 1, 2, 3/
		);
	});
});

describe('the navigator: settings as plan_steps and the recipes write them', () => {
	it('turns a name, a value and where into a goal', () => {
		expect(settingGoal({ param: 'cutoff', value: 40 }, 3)).toEqual({
			track: 3,
			param: 'cutoff',
			value: 40
		});
		expect(settingGoal({ param: 'size', value: 80, area: 'auxiliary', track: 16 })).toEqual({
			area: 'auxiliary',
			track: 8,
			label: 'size',
			value: 80
		});
		expect(settingGoal({ param: 'tune', value: -2, track: 1, key: 'G3' })).toEqual({
			track: 1,
			param: 'tune',
			value: -2,
			key: 'G3'
		});
		expect(settingGoal({ param: 'track scale', value: 4, area: 'bar', track: 9 })).toEqual({
			area: 'bar',
			track: 9,
			label: 'track scale',
			value: 4
		});
		// tracks 9–16 are the auxiliary ones, as in plan_steps
		expect(settingGoal({ param: 'cutoff', value: 4, track: 12 })).toMatchObject({
			area: 'auxiliary',
			track: 4
		});
		expect(settingGoal({ param: 'cutoff', value: 4, area: 'instrument', track: 12 })).toMatch(
			/instrument tracks/
		);
		expect(settingGoal({ param: 'speed', value: 4, area: 'player', track: 12 })).toMatch(/1–8/);
	});
});

describe('the navigator: to where a setting is made, changing nothing', () => {
	const to = (
		sim: OpxySim,
		param: string,
		spec: Partial<Parameters<typeof settingGoal>[0]> = {}
	) => {
		const goal = settingGoal({ param, value: '', ...spec }, sim.state.track + 1);
		if (typeof goal === 'string') throw new Error(goal);
		return planToSetting(sim.state, goal);
	};

	it('takes the replica to the swing, the cutoff and the filter list without turning anything', () => {
		const sim = boot();
		const swing = to(sim, 'swing');
		expect(swing.reached).toBe(true);
		expect(keys(swing)).toEqual(['tempo']);
		const cutoff = to(sim, 'cutoff', { track: 3 });
		expect(keys(cutoff)).toEqual(['T3', 'M3']);
		expect(cutoff.note).toBe('E1 turns it');
		const list = to(sim, 'filter type', { track: 3 });
		expect(keys(list)).toEqual(['T3', 'M3']);
		expect(list.note).toMatch(/shift \+ M3/);
		for (const plan of [swing, cutoff, list]) {
			grammatical(plan);
			expect(plan.steps.every((s) => !s.clicks)).toBe(true);
		}
	});

	it('finds a value another page shows by its name', () => {
		const sim = boot();
		const size = to(sim, 'size', { area: 'auxiliary', track: 16 });
		expect(size.reached).toBe(true);
		expect(size.steps.every((s) => !s.clicks)).toBe(true);
		expect(size.screen).toMatch(/size/);
		expect(to(sim, 'no such thing', { area: 'mix' }).reached).toBe(false);
	});
});
