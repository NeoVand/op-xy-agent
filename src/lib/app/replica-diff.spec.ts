// What changed on the replica, in words (the agent's grounding): nothing reads as nothing; tempo,
// the click and playback; a sound changed through the keys reads as its page did on the screen;
// patterns by their notes; scenes and the song.
import { describe, expect, it } from 'vitest';
import { renameProject, saveProject, saveProjectAs } from '$lib/sim/areas/system/projects';
import { playStep } from '$lib/sim/navigator';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { settingGoal } from '$lib/sim/settings';
import { briefChange } from './replica-diff';
import { createVirtualOpxy } from './virtual';

function setup() {
	const sim = new OpxySim({ now: () => 0 });
	const virtual = createVirtualOpxy({ sim });
	return { sim, virtual, start: virtual.checkpoint() };
}

describe('replica changes', () => {
	it('are none when nothing changed', () => {
		const { virtual, start } = setup();
		virtual.readSound(3);
		expect(virtual.changesSince(start)).toEqual([]);
	});

	it('say the tempo, the click and playback', () => {
		const { virtual, start } = setup();
		virtual.setTempo(107);
		virtual.setMetronome(false);
		virtual.transport('play');
		expect(virtual.changesSince(start)).toEqual([
			'playback started',
			'tempo 120 → 107 bpm',
			'metronome click on → off'
		]);
	});

	it('say the brain’s key, mode and routing', () => {
		const { sim, virtual, start } = setup();
		const goals = [
			{ param: 'mode', value: 'manual' },
			{ param: 'root', value: 'd' },
			{ param: 'scale', value: 'minor' }
		].map((g) => {
			const goal = settingGoal({ ...g, area: 'auxiliary', track: 9 }, 1);
			if (typeof goal === 'string') throw new Error(goal);
			return goal;
		});
		const plan = virtual.plan({ settings: goals });
		expect(plan.reached).toBe(true);
		for (const step of plan.steps) playStep(sim, step);
		const lines = virtual.changesSince(start);
		expect(lines.find((l) => l.startsWith('brain:'))).toMatch(
			/^brain: auto → manual, key c major → d minor$/
		);
	});

	it('say what moved on an FX page, by name', () => {
		const { sim, virtual, start } = setup();
		const goal = settingGoal({ param: 'dry', value: 0, area: 'auxiliary', track: 15 }, 1);
		if (typeof goal === 'string') throw new Error(goal);
		const plan = virtual.plan({ settings: [goal] });
		expect(plan.reached).toBe(true);
		for (const step of plan.steps) playStep(sim, step);
		expect(virtual.changesSince(start)).toContain(
			'FX I delay: dry 99 → 00; unchanged: size 1/8 dotted, fine 50, feedback 50'
		);
	});

	it('say a kit put on a drum track, key by key', () => {
		const { virtual, start } = setup();
		const audio = { sampleRate: 48000, channels: [new Float32Array(480)] };
		virtual.loadKit(1, {
			name: 'boom',
			sounds: [
				{ key: 53, name: 'kick', audio },
				{ key: 55, name: 'snare', audio }
			]
		});
		const line = virtual.changesSince(start).find((l) => l.startsWith('T1 kit:'));
		expect(line).toMatch(/^T1 kit: 2 keys with new samples \(kick 1 → kick, snare 1 → snare\)$/);
	});

	it('read a sound changed through the keys as its page does', () => {
		const { sim, virtual, start } = setup();
		const goal = settingGoal({ param: 'cutoff', value: 40, track: 3 }, 1);
		if (typeof goal === 'string') throw new Error(goal);
		const plan = virtual.plan({ settings: [goal] });
		for (const step of plan.steps) playStep(sim, step);
		const lines = virtual.changesSince(start);
		expect(lines.find((l) => l.startsWith('T3 M3 filter:'))).toMatch(
			/^T3 M3 filter: cutoff 00 → 40; unchanged: svf filter on, resonance /
		);
		expect(lines.every((l) => l.startsWith('T3 '))).toBe(true);
	});

	it('read a drum key panned through the keys as the key’s own line, not the page it left', () => {
		const { sim, virtual, start } = setup();
		const goals = [
			settingGoal({ param: 'pan', value: -60, track: 1, key: 'open hat' }, 1),
			settingGoal({ param: 'pan', value: -60, track: 1, key: 'closed hat 1' }, 1)
		];
		if (goals.some((g) => typeof g === 'string')) throw new Error(String(goals));
		const plan = virtual.plan({ settings: goals as Exclude<(typeof goals)[number], string>[] });
		for (const step of plan.steps) playStep(sim, step);
		const lines = virtual.changesSince(start);
		expect(lines).toEqual([
			'T1 key C#4 closed hat 1: pan 0 → -60',
			'T1 key D#4 open hat 1: pan 0 → -60'
		]);
	});

	it('read a sound by its pages wherever the screen stands, never the screen itself', () => {
		const { sim, virtual, start } = setup();
		// T1's amp release changed; the screen left on the preset browser, shift down, then a boot
		sim.state.tracks[0].amp.release = 40;
		sim.press('track.1');
		sim.input({ type: 'press', id: 'key.shift' });
		sim.press('key.m1');
		expect(sim.state.areas.system.page).toBe('presets');
		const lines = virtual.changesSince(start);
		expect(lines.filter((l) => l.startsWith('T1 '))).toEqual([
			expect.stringMatching(
				/^T1 M2 amp envelope: release 03 → 40 \(\d+ s → 2\.2 s\); unchanged: attack .*, sustain \d+$/
			)
		]);
		sim.state.areas.system.power = { on: true, booting: true, elapsed: 0, since: 0 };
		expect(virtual.changesSince(start)).toEqual(lines);
		expect(lines.join('\n')).not.toMatch(/presets for|starting up/);
	});

	it('say a step component put on a step without a note plays nothing yet', () => {
		// a demo put multiply on an empty step, and the agent could not tell whether it had landed
		const { sim, virtual } = setup();
		const from = virtual.checkpoint();
		sim.state.tracks[2].sequence.patterns[0].steps[6].components.push({
			kind: 'multiply',
			value: 3
		});
		expect(virtual.changesSince(from)).toEqual([
			expect.stringMatching(
				/step components changed on step 7 \(step 7 has no note, so its component plays nothing until a note is there\)/
			)
		]);
	});

	it('say the bar menu’s shape and note length as they move', () => {
		const { sim, virtual } = setup();
		const from = virtual.checkpoint();
		const pattern = sim.state.tracks[6].sequence.patterns[0];
		pattern.smoothing = 60;
		expect(virtual.changesSince(from)).toEqual([
			expect.stringMatching(/^T7 pattern 1: shape 0 → 60 \(the glide between its locks\)/)
		]);
	});

	it('say first when another project is open, and a rename or a copy as such', () => {
		const { sim, virtual } = setup();
		let from = virtual.checkpoint();
		sim.state.project.name = 'project 2';
		sim.state.tempo.bpm = 98;
		expect(virtual.changesSince(from)[0]).toBe(
			'project "project 1" → "project 2": another project is open, and the changes below are what it brought'
		);
		// the same project renamed (an agent read its own rename as another project opening)
		saveProject(sim.state);
		from = virtual.checkpoint();
		expect(renameProject(sim.state, 'tape loops')).toBeNull();
		expect(virtual.changesSince(from)[0]).toBe(
			'project "project 2" → "tape loops": renamed: the same project, its stored copy renamed too'
		);
		// and saved as a copy, the old one kept
		from = virtual.checkpoint();
		expect(saveProjectAs(sim.state, 'sunrise jam')).toBeNull();
		expect(virtual.changesSince(from)[0]).toBe(
			'project "tape loops" → "sunrise jam": a copy saved under the new name and open now; "tape loops" stays in the projects folder as it was last saved'
		);
	});

	it('say an envelope stage in seconds as it moves', () => {
		// attack 75 for "a slow swell" is about 24 s, which the agent did not know
		const { sim, virtual } = setup();
		sim.state.tracks[6].amp.attack = 50;
		const from = virtual.checkpoint();
		sim.state.tracks[6].amp.attack = 75;
		expect(virtual.changesSince(from)).toEqual([
			expect.stringMatching(/^T7 M2 amp envelope: attack 50 → 75 \(1\.4 s → 24 s\); unchanged:/)
		]);
	});

	it('count patterns by their notes, and read scenes and the song', () => {
		const { virtual, start } = setup();
		const kick = [1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 110, length: 1 }));
		virtual.writePattern(1, { pattern: 1, bars: 1, notes: kick });
		virtual.writePattern(1, { pattern: 2, bars: 2, notes: [...kick, { ...kick[0], step: 17 }] });
		virtual.writeArrangement({
			scenes: [
				{ scene: 1, patterns: [{ track: 1, pattern: 1 }] },
				{ scene: 2, patterns: [{ track: 1, pattern: 2 }] }
			],
			song: { order: [1, 2, 2], loop: true }
		});
		const lines = virtual.changesSince(start);
		expect(lines).toContain('T1 pattern 1: 0 → 4 notes');
		expect(lines).toContain('T1 pattern 2: new, 5 notes');
		// writing pattern 2 played it; the arrangement put T1 back on pattern 1 in scene 1
		expect(lines.filter((l) => l.startsWith('T1 plays pattern'))).toEqual([]);
		expect(lines).toContain('scene 2: new, T1 p2');
		expect(lines).toContain('song: 1 → 1 2 2');
		const next = virtual.checkpoint();
		virtual.writeArrangement({ scenes: [{ scene: 2, patterns: [{ track: 1, pattern: 1 }] }] });
		expect(virtual.changesSince(next)).toEqual(['scene 2: T1 p2 → p1']);
	});

	it('tell scenes apart by their mix: a fade’s scenes differ by their levels alone', () => {
		const { virtual } = setup();
		const kick = [1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 100, length: 1 }));
		virtual.writePattern(1, { pattern: 1, bars: 1, notes: kick });
		virtual.writePattern(1, { pattern: 2, bars: 1, notes: kick.slice(0, 2) });
		virtual.writeArrangement({ scenes: [{ scene: 2, patterns: [{ track: 1, pattern: 2 }] }] });
		const start = virtual.checkpoint();
		const fade = (scene: number, level: number) => ({
			scene,
			patterns: [{ track: 1, pattern: 2 }],
			mix: [
				{ track: 1, level },
				{ track: 3, level }
			]
		});
		virtual.writeArrangement({ scenes: [fade(3, 48), fade(4, 16)] });
		expect(virtual.changesSince(start)).toEqual([
			'scene 3: new, T1 p2; T1, T3 at level 48',
			'scene 4: new, T1 p2; T1, T3 at level 16'
		]);
		const next = virtual.checkpoint();
		virtual.writeArrangement({
			scenes: [{ scene: 3, patterns: [{ track: 1, pattern: 2 }], mix: [{ track: 3, muted: true }] }]
		});
		expect(virtual.changesSince(next)).toEqual(['scene 3: T3 muted']);
	});

	it('say a track rests in a scene where it plays an empty pattern', () => {
		const { virtual } = setup();
		const kick = [1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 100, length: 1 }));
		virtual.writePattern(1, { pattern: 1, bars: 1, notes: kick });
		virtual.writePattern(5, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 1, note: 72, velocity: 90, length: 4 }]
		});
		virtual.writeArrangement({ scenes: [{ scene: 2, patterns: [{ track: 1, pattern: 1 }] }] });
		const start = virtual.checkpoint();
		virtual.writeArrangement({ scenes: [{ scene: 2, patterns: [{ track: 5, pattern: 0 }] }] });
		expect(virtual.changesSince(start)).toEqual([
			'T5 pattern 2: new and empty',
			'scene 2: T5 rests (p1 → p2, empty)'
		]);
	});

	it('say a drum swap as the same rhythm on other sounds', () => {
		const { virtual } = setup();
		const hit = (step: number, note: number) => ({ step, note, velocity: 100, length: 1 });
		virtual.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [hit(1, 53), hit(5, 55), hit(9, 53), hit(13, 55)]
		});
		const start = virtual.checkpoint();
		virtual.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [hit(1, 53), hit(5, 58), hit(9, 53), hit(13, 58)]
		});
		expect(virtual.changesSince(start)).toEqual([
			'T1 pattern 1: 4 notes, the same rhythm on other sounds on steps 5, 13 (snare 1 → clap 1)'
		]);
	});

	it('say the song moving on once, not as each track switching pattern', () => {
		const { sim, virtual } = setup();
		const kick = [1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 100, length: 1 }));
		virtual.writePattern(1, { pattern: 1, bars: 1, notes: kick });
		virtual.writePattern(1, { pattern: 2, bars: 1, notes: kick.slice(0, 2) });
		virtual.writeArrangement({
			scenes: [
				{ scene: 1, patterns: [{ track: 1, pattern: 1 }] },
				{ scene: 2, patterns: [{ track: 1, pattern: 2 }] }
			],
			song: { order: [1, 2], loop: true }
		});
		virtual.transport('play');
		const start = virtual.checkpoint();
		for (let i = 0; i < 21; i++) sim.advance(100); // past the first bar: scene 2
		expect(virtual.changesSince(start)).toEqual(['playing scene 2 now, was 1 (the song moved on)']);
	});

	it('say a project setting as its page reads, and a drum note by its sound', () => {
		const { sim, virtual, start } = setup();
		sim.state.areas.system.projectSettings.signature = 0;
		expect(virtual.changesSince(start)).toEqual(['project signature: 4/4 → 3/4']);
		const beat = [1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 100, length: 1 }));
		virtual.writePattern(1, { pattern: 1, bars: 1, notes: beat });
		const next = virtual.checkpoint();
		virtual.writePattern(1, { pattern: 1, bars: 1, notes: beat.slice(0, 3) });
		expect(virtual.changesSince(next)).toEqual([
			'T1 pattern 1: 4 → 3 notes (1 removed on step 13 (kick 1))'
		]);
	});

	it('say which pattern a track plays, and its player as the page reads', () => {
		const { sim, virtual, start } = setup();
		const chord = [60, 64, 67].map((note) => ({ step: 1, note, velocity: 100, length: 16 }));
		virtual.writePattern(4, { pattern: 2, bars: 1, notes: chord });
		expect(virtual.changesSince(start)).toEqual([
			'T4 plays pattern 1 → 2 in scene 1, the one on screen',
			'T4 pattern 2: new, 3 notes'
		]);
		const next = virtual.checkpoint();
		const player = sim.state.tracks[3].sequence.patterns[1].player;
		player.on = true;
		player.arp.speed = 3;
		const lines = virtual.changedSince(next);
		expect(lines.map((c) => c.line)).toEqual([
			'T4 player: arpeggio player off → on, speed 1/8 → 1/16; unchanged: pattern up, range 1 oct, hold off'
		]);
		expect(lines[0].brief).toBe('T4 player: arpeggio player off → on, speed 1/8 → 1/16');
		expect(lines[0].controls).toEqual(['track.4', 'key.player']);
		// a pattern that does not play says only that its player changed
		const other = virtual.checkpoint();
		sim.state.tracks[3].sequence.patterns[0].player.on = true;
		expect(virtual.changesSince(other)).toEqual(['T4 pattern 1: its player changed']);
	});

	it('say how the notes changed: a transposition, new velocities', () => {
		const { virtual } = setup();
		const line = [1, 4, 7, 9].map((step, i) => ({
			step,
			note: [50, 50, 53, 57][i],
			velocity: 100,
			length: 1
		}));
		virtual.writePattern(3, { pattern: 1, bars: 1, notes: line });
		virtual.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 3, note: 61, velocity: 100, length: 1 }]
		});
		const start = virtual.checkpoint();
		virtual.writePattern(3, {
			pattern: 1,
			bars: 1,
			notes: line.map((n) => ({ ...n, note: n.note + 2 }))
		});
		virtual.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 3, note: 61, velocity: 72, length: 1 }]
		});
		const lines = virtual.changesSince(start);
		expect(lines).toContain('T3 pattern 1: 4 notes, up 2 semitones');
		expect(lines).toContain('T1 pattern 1: 1 note, velocities 100 → 72');
	});
});

describe('replica changes, briefly and where', () => {
	it('say only what a page changed, and name its track and page keys', () => {
		const { sim, virtual, start } = setup();
		const goal = settingGoal({ param: 'cutoff', value: 40, track: 3 }, 1);
		if (typeof goal === 'string') throw new Error(goal);
		for (const step of virtual.plan({ settings: [goal] }).steps) playStep(sim, step);
		const filter = virtual.changedSince(start).find((c) => c.line.startsWith('T3 M3 filter:'));
		expect(filter?.brief).toBe('T3 M3 filter: cutoff 00 → 40');
		expect(filter?.controls).toEqual(['track.3', 'key.m3']);
	});

	it('name the tempo key, the mix, the track of a pattern and the arrangement', () => {
		const { virtual, start } = setup();
		virtual.setTempo(96);
		virtual.writePattern(2, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 1, note: 60, velocity: 100, length: 1 }]
		});
		virtual.writeArrangement({
			scenes: [{ scene: 1, patterns: [{ track: 2, pattern: 1 }] }],
			song: { order: [1, 1], loop: true }
		});
		const where = Object.fromEntries(virtual.changedSince(start).map((c) => [c.brief, c.controls]));
		expect(where['tempo 120 → 96 bpm']).toEqual(['key.tempo']);
		expect(where['T2 pattern 1: 0 → 1 note']).toEqual(['track.2']);
		expect(where['song: 1 → 1 1']).toEqual(['key.arrange']);
		// the lines the agent reads are the same changes, in the same order
		expect(virtual.changedSince(start).map((c) => c.line)).toEqual(virtual.changesSince(start));
	});
});

describe('briefChange', () => {
	it('keeps only the values that differ', () => {
		const was = 'svf filter on: cutoff 00, resonance 10, env amount 0';
		expect(briefChange(was, 'svf filter on: cutoff 40, resonance 10, env amount 0')).toBe(
			'cutoff 00 → 40'
		);
		expect(briefChange(was, 'svf filter off: cutoff 00, resonance 25, env amount 50')).toBe(
			'svf filter on → off, resonance 10 → 25, env amount 0 → 50'
		);
		expect(briefChange('amp envelope: attack 10', 'amp envelope: attack 05')).toBe(
			'attack 10 → 05'
		);
	});

	it('gives readings of another shape whole', () => {
		expect(briefChange('tremolo lfo off', 'duck lfo on: source metronome, amount 50')).toBe(
			'tremolo lfo off → duck lfo on: source metronome, amount 50'
		);
		expect(briefChange('a: 1, 2', 'a: 1, 2, 3')).toBe('a: 1, 2 → a: 1, 2, 3');
	});
});
