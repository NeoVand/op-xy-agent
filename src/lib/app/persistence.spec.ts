import { describe, expect, it } from 'vitest';
import { ReplicaState } from '$lib/replica';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { DEFAULT_LEVEL, GROOVES } from '$lib/sim/params';
import { currentPattern } from '$lib/sim/sequencer';
import { FakeTime } from '../../../test/fakes/fake-time';
import {
	SAVE_VERSION,
	SimPersistence,
	applySaved,
	captureSim,
	createMemorySimStore,
	mergeDefaults,
	type SavedSim
} from './persistence';

const notes = (sim: OpxySim, track: number, step: number) =>
	currentPattern(sim.state.tracks[track].sequence).steps[step].notes.map((n) => n.note);

/** A simulator with some work in it: steps on two tracks, a faster tempo, a mixer EQ. */
function withWork(): OpxySim {
	const sim = new OpxySim({ now: () => 0 });
	sim.press('step.1');
	sim.press('step.9');
	sim.press('track.3');
	sim.press('keyboard.c4'); // track 3 starts an octave down: 48
	sim.press('step.5');
	sim.press('key.tempo');
	sim.turn(1, 8);
	sim.press('key.tempo');
	sim.state.areas.mixer.eq.low = 70;
	return sim;
}

describe('saving the virtual OP-XY’s work', () => {
	it('brings a project back: steps on every track, the tempo, the mixer', () => {
		const saved = captureSim(withWork().state);
		const sim = new OpxySim({ now: () => 0 });
		expect(applySaved(sim.state, saved)).toBe(true);
		expect(notes(sim, 0, 0)).toEqual([53]);
		expect(notes(sim, 0, 8)).toEqual([53]);
		expect(notes(sim, 2, 4)).toEqual([48]); // c4 on the bass track, an octave down
		expect(sim.state.tempo.bpm).toBe(128);
		expect(sim.state.areas.mixer.eq.low).toBe(70);
		expect(sim.leds['step.1']).toBe('white');
	});

	it('keeps the projects folder and the preset library, which outlive projects', () => {
		const work = withWork();
		const system = work.state.areas.system;
		system.projects.user.push({ name: 'kept', versions: [] } as never);
		system.system.channel = 7;
		const sim = new OpxySim({ now: () => 0 });
		applySaved(sim.state, captureSim(work.state));
		expect(sim.state.areas.system.projects.user.map((p) => p.name)).toContain('kept');
		expect(sim.state.areas.system.system.channel).toBe(7);
	});

	it('comes back idle, like a device that booted: no held step, no armed recording', () => {
		const work = withWork();
		work.input({ type: 'press', id: 'step.5' }); // saved mid-gesture
		work.state.areas.arrange.armed = true;
		const sim = new OpxySim({ now: () => 0 });
		applySaved(sim.state, captureSim(work.state));
		expect(sim.state.areas.sequencer.holds).toEqual({});
		expect(sim.state.areas.arrange.armed).toBe(false);
		// the step taps as usual: it comes off (the pages start fresh, on track 1)
		sim.press('track.3');
		sim.press('step.5');
		expect(notes(sim, 2, 4)).toEqual([]);
	});

	it('fills in what an older save lacks from today’s defaults', () => {
		const saved = captureSim(withWork().state);
		const project = JSON.parse(saved.project);
		delete project.tracks[0].mix;
		delete project.tempo.metronome;
		const sim = new OpxySim({ now: () => 0 });
		applySaved(sim.state, { ...saved, project: JSON.stringify(project) });
		expect(sim.state.tracks[0].mix).toEqual(new OpxySim().state.tracks[0].mix);
		expect(sim.state.tempo.metronome).toBeDefined();
		expect(notes(sim, 0, 0)).toEqual([53]);
	});

	it('brings a version 1 save up to date: the work stays, the sounds become a new project’s', () => {
		const work = withWork();
		work.state.tracks[2].m1 = [1, 2, 3, 4];
		work.state.tracks[2].mix.level = 80; // the old default
		work.state.tracks[3].mix.level = 60; // turned by hand
		work.state.areas.system.presets.library.push({
			name: 'mine',
			folder: 'bass',
			engine: 'prism',
			user: true
		});
		const sim = new OpxySim({ now: () => 0 });
		expect(applySaved(sim.state, { ...captureSim(work.state), version: 1 })).toBe(true);
		const fresh = new OpxySim().state;
		expect(sim.state.tracks[2].m1).toEqual(fresh.tracks[2].m1);
		expect(sim.state.tracks[2].filter).toEqual(fresh.tracks[2].filter);
		expect(sim.state.tracks[2].mix.level).toBe(DEFAULT_LEVEL);
		expect(sim.state.tracks[3].mix.level).toBe(60);
		expect(sim.state.areas.system.trackPresets).toEqual(fresh.areas.system.trackPresets);
		expect(notes(sim, 2, 4)).toEqual(notes(work, 2, 4));
		expect(sim.state.tempo.bpm).toBe(128);
		const own = sim.state.areas.system.presets.library.filter((p) => p.user);
		expect(own.map((p) => p.name)).toEqual(['mine']);
	});

	it('keeps an older save’s groove when the device’s four extra grooves come in', () => {
		const work = withWork();
		const saved = captureSim(work.state);
		const project = JSON.parse(saved.project);
		project.tempo.groove = 2; // bombora in the old seven
		const sim = new OpxySim({ now: () => 0 });
		applySaved(sim.state, { ...saved, version: 2, project: JSON.stringify(project) });
		expect(GROOVES[sim.state.tempo.groove]).toBe('bombora');
	});

	it('leaves the state alone for a save it cannot read', () => {
		const sim = new OpxySim({ now: () => 0 });
		const before = JSON.stringify(sim.state.tracks);
		const saved = captureSim(withWork().state);
		expect(applySaved(sim.state, { ...saved, version: SAVE_VERSION + 1 })).toBe(false);
		expect(applySaved(sim.state, { ...saved, project: '{oops' })).toBe(false);
		expect(JSON.stringify(sim.state.tracks)).toBe(before);
	});

	it('merges objects key by key and arrays element by element', () => {
		expect(mergeDefaults({ a: 1 }, { a: 0, b: 2 })).toEqual({ a: 1, b: 2 });
		expect(mergeDefaults([{ x: 1 }, { x: 2 }], [{ x: 0, y: 0 }])).toEqual([
			{ x: 1, y: 0 },
			{ x: 2, y: 0 }
		]);
		expect(mergeDefaults('text', 3)).toBe(3);
		expect(mergeDefaults(null, { a: 1 })).toEqual({ a: 1 });
		expect(mergeDefaults(5, null)).toBe(5);
	});
});

describe('SimPersistence: when it saves', () => {
	async function setup(stored: SavedSim | null = null) {
		const time = new FakeTime();
		const store = createMemorySimStore();
		if (stored) await store.save(stored);
		const sim = new OpxySim({ now: () => time.now() });
		const replica = new ReplicaState({ timers: time });
		replica.observe((event) => sim.input(event));
		const persistence = new SimPersistence({ state: sim.state, replica, store, timers: time });
		return { time, store, sim, replica, persistence };
	}

	const tap = (replica: ReplicaState, id: 'step.3' | 'step.4') => {
		replica.press(id, 'pointer');
		replica.release(id, 'pointer');
	};

	it('puts the stored work back before anything else, then saves a moment after input', async () => {
		const { time, store, sim, replica, persistence } = await setup(captureSim(withWork().state));
		await persistence.start();
		expect(notes(sim, 2, 4)).toEqual([48]); // c4 on the bass track, an octave down
		sim.press('track.1');
		tap(replica, 'step.3');
		await time.advance(1000);
		expect(
			JSON.parse((await store.load())!.project).tracks[0].sequence.patterns[0].steps[2].notes
		).toEqual([]);
		await time.advance(600);
		const saved = await store.load();
		expect(JSON.parse(saved!.project).tracks[0].sequence.patterns[0].steps[2].notes).toHaveLength(
			1
		);
	});

	it('saves nothing when nothing changed, and saves at once on flush', async () => {
		const { time, store, replica, persistence } = await setup();
		await persistence.start();
		await persistence.flush();
		const first = await store.load();
		expect(first).not.toBeNull();
		await persistence.flush();
		expect((await store.load())!.savedAt).toBe(first!.savedAt);
		tap(replica, 'step.4');
		await persistence.flush();
		expect((await store.load())!.project).not.toBe(first!.project);
		await time.advance(2000);
	});

	it('never saves before the stored work is back', async () => {
		const { store, replica, persistence } = await setup(captureSim(withWork().state));
		tap(replica, 'step.4'); // input before start(): not a reason to save a blank project
		await persistence.flush();
		expect(
			JSON.parse((await store.load())!.project).tracks[2].sequence.patterns[0].steps[4].notes
		).toHaveLength(1);
		expect(persistence.ready).toBe(false);
	});
});
