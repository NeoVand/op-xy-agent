import { describe, expect, it } from 'vitest';
import { tryParseKeys } from '$lib/core/opxy';
import {
	findParam,
	pageValues,
	planPageValue,
	planParam,
	planPlace,
	planSettings,
	playStep,
	reads,
	type NavPlan
} from './navigator';
import { shown } from './params';
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
