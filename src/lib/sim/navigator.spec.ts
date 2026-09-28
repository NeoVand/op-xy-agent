import { describe, expect, it } from 'vitest';
import { tryParseKeys } from '$lib/core/opxy';
import { findParam, planParam, planPlace, type NavPlan } from './navigator';
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
