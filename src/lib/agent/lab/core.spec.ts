// The lab's core on a new project: forks never touch the replica or each other; set() reaches
// values through the keys, press() plays the key grammar, diff() says what changed in the
// device's words; commits merge into the lab's replica (independent forks combine) and later forks
// start from it; MIDI files read, plan and write onto a fork; listen hears a fork through the
// renderer, alone per track too, and says plainly when there is none; bad arguments come back as
// LabErrors naming the call.
import { describe, expect, it } from 'vitest';
import { clickRenderer, files, labOn, smallSong } from '../testing/lab';
import { LabError } from './core';

describe('forks', () => {
	it('are copies: changing one leaves the replica and the other forks alone', () => {
		const { lab, replica } = labOn();
		const a = lab.fork();
		const b = lab.fork();
		a.setTempo(90);
		a.writePattern(3, { notes: [{ step: 1, note: 'A1', length: 4 }] });
		expect(a.status().bpm).toBe(90);
		expect(a.readPattern(3).notes).toHaveLength(1);
		expect(b.status().bpm).toBe(120);
		expect(b.readPattern(3).notes).toHaveLength(0);
		expect(replica.status().bpm).toBe(120);
		expect(replica.readPattern(3).notes).toHaveLength(0);
		// a fork of a fork carries its changes, and goes its own way after
		const c = lab.fork(a);
		expect(c.status().bpm).toBe(90);
		c.setTempo(100);
		expect(a.status().bpm).toBe(90);
		expect([a.name, b.name, c.name]).toEqual(['fork 1', 'fork 2', 'fork 3']);
		expect(JSON.stringify({ a })).toBe('{"a":"[fork 1]"}');
	});

	it('says when a lock on a drum step reaches more sounds than one', () => {
		const { lab } = labOn();
		const f = lab.fork();
		// a snare and a closed hat on step 5
		f.writePattern(1, { notes: '1:53 5:55+61 13:55' });
		const result = f.set({ param: 'fx i send', value: 60, track: 1, step: 5 });
		expect(result.note).toMatch(/reaches every sound there: step 5: snare 1, closed hat 1/);
		// a step with one sound alone says nothing
		expect(f.set({ param: 'fx i send', value: 60, track: 1, step: 13 }).note).toBeUndefined();
	});

	it('says when a groove set hardly reaches the notes', () => {
		const { lab } = labOn();
		const f = lab.fork();
		f.writePattern(1, { notes: '1:61 3:61 5:61 7:61 9:61 11:61 13:61 15:61' });
		const result = f.set([
			{ param: 'groove', value: 'shuffle' },
			{ param: 'swing', value: 50 }
		]);
		expect(result.note).toMatch(/moves none of T1's notes/);
	});

	it('locks one step’s value with set and step', () => {
		const { lab } = labOn();
		const f = lab.fork();
		f.writePattern(3, { notes: [{ step: 5, note: 'A2', length: 2 }] });
		const result = f.set({ param: 'cutoff', value: 70, track: 3, step: 5 });
		expect(result.reached).toBe(true);
		expect(f.readPattern(3).locks).toEqual([{ step: 5, values: ['cutoff 70'] }]);
	});

	it('takes a track scale as text, and says what scale and velocity take', () => {
		const { lab } = labOn();
		const f = lab.fork();
		f.writePattern(5, { scale: '2' as never, notes: [{ step: 1, note: 'A3' }] });
		expect(f.readPattern(5).scale).toBe(2);
		f.writePattern(5, { scale: '1/2' as never, notes: [{ step: 1, note: 'A3' }] });
		expect(f.readPattern(5).scale).toBe(0.5);
		expect(() => f.writePattern(5, { scale: 9 as never, notes: [] })).toThrow(
			/scale is how many sixteenths a step lasts/
		);
		expect(() => f.writePattern(5, { notes: [{ step: 1, note: 'A3', velocity: 0 }] })).toThrow(
			/a note at 0 would be silent/
		);
	});

	it('set() plays the navigator’s steps on the fork: track 3 cutoff 40', () => {
		const { lab, replica } = labOn();
		const f = lab.fork();
		const was = replica.readSound(3).pages['M3 filter'];
		const done = f.set({ track: 3, param: 'cutoff', value: 40 });
		expect(done.reached).toBe(true);
		expect(done.steps.length).toBeGreaterThan(0);
		expect(done.steps.some((s) => s.startsWith('turn E'))).toBe(true);
		expect(f.readSound(3).pages['M3 filter']).toContain('cutoff 40');
		expect(done.screen).toContain('cutoff 40');
		expect(replica.readSound(3).pages['M3 filter']).toBe(was);
		// several in a row, an engine's value by its page's name among them
		f.set([
			{ track: 3, param: 'resonance', value: 30 },
			{ track: 3, param: 'amp release', value: 60 }
		]);
		expect(f.readSound(3).pages['M3 filter']).toContain('resonance 30');
		expect(f.readSound(3).pages['M2 amp envelope']).toContain('release 60');
	});

	it('plan() says the steps set() would play, without moving the fork', () => {
		const { lab } = labOn();
		const f = lab.fork();
		const before = f.screen();
		const plan = f.plan({ track: 3, param: 'cutoff', value: 40 });
		expect(plan.reached).toBe(true);
		expect(plan.screen).toContain('cutoff 40');
		expect(f.screen()).toBe(before);
		expect(f.readSound(3).pages['M3 filter']).not.toContain('cutoff 40');
		expect(f.set({ track: 3, param: 'cutoff', value: 40 }).steps).toEqual(plan.steps);
		const missed = f.plan({ track: 3, param: 'cutoff', value: 'loud' });
		expect(missed.reached).toBe(false);
	});

	it('set() throws, changing nothing, when a setting cannot be reached', () => {
		const { lab } = labOn();
		const f = lab.fork();
		const before = f.readSound(3);
		expect(() => f.set({ track: 3, param: 'wobble factor', value: 3 })).toThrow(LabError);
		expect(() => f.set({ track: 3, param: 'cutoff', value: 'loud' })).toThrow(/not reached/);
		expect(() => f.set({ track: 30, param: 'cutoff', value: 4 } as never)).toThrow(/set: track/);
		expect(f.readSound(3)).toEqual(before);
	});

	it('press() plays combos in the key grammar, a turn with its detents', () => {
		const { lab } = labOn();
		const f = lab.fork();
		f.press('T3');
		expect(f.press('M3')).toMatch(/filter/);
		const before = f.readSound(3).pages['M3 filter'];
		const after = f.press('turn E1', 5);
		expect(after).not.toBe(before);
		expect(f.screen()).toBe(after);
		expect(() => f.press('turn E1')).toThrow(/detents/);
		expect(() => f.press('M3', 2)).toThrow(/detents go with a turn/);
		expect(() => f.press('shift + banana')).toThrow(LabError);
	});

	it('diff() says what changed in the device’s words', () => {
		const { lab } = labOn();
		const f = lab.fork();
		expect(f.diff()).toEqual({ same: true, changes: [] });
		f.setTempo(96);
		f.setMetronome(false);
		f.set({ track: 3, param: 'cutoff', value: 40 });
		f.setMuted(5, true);
		f.writePattern(1, {
			pattern: 2,
			bars: 2,
			notes: [
				{ step: 1, note: 53 },
				{ step: 17, note: 55 }
			]
		});
		f.writeArrangement({
			scenes: [{ scene: 2, patterns: [{ track: 1, pattern: 2 }] }],
			song: { order: [1, 2], loop: true }
		});
		const { same, changes } = f.diff();
		expect(same).toBe(false);
		expect(changes).toContain('tempo 120 → 96 bpm');
		expect(changes).toContain('metronome on → off');
		expect(changes.find((c) => c.startsWith('T3 M3 filter:'))).toMatch(/cutoff \d+ → 40/);
		expect(changes).toContain('T5 mix: muted');
		expect(changes).toContain('T1 pattern 2: new, 2 notes, 2 bars');
		expect(changes).toContain('T1 plays pattern 2 (was 1)');
		expect(changes.find((c) => c.startsWith('scene 2:'))).toBe('scene 2: new, T1 p2');
		expect(changes).toContain('song: 1 → 1 2');
		// against another fork: what this one has that the other lacks
		const g = lab.fork();
		g.setTempo(96);
		expect(f.diff(g).changes).not.toContain('tempo 120 → 96 bpm');
		expect(f.diff(g).changes).toContain('metronome on → off');
	});
});

describe('commits', () => {
	it('merge into the lab’s replica, so later forks start from them and independent ones combine', () => {
		const { lab, session, replica } = labOn();
		expect(session.project()).toBeNull();
		const a = lab.fork();
		const b = lab.fork();
		a.setTempo(90);
		b.setMuted(2, true);
		expect(lab.commit(a, 'slower').changes).toEqual(['tempo 120 → 90 bpm']);
		expect(lab.fork().status().bpm).toBe(90);
		// b never saw a's tempo, and did not change it: both land
		expect(lab.commit(b, 'quiet drums').changes).toEqual(['T2 mix: muted']);
		const c = lab.fork();
		expect(c.status().bpm).toBe(90);
		expect(c.status().tracks[1].muted).toBe(true);
		expect(session.commits()).toEqual([
			{ label: 'slower', changes: ['tempo 120 → 90 bpm'] },
			{ label: 'quiet drums', changes: ['T2 mix: muted'] }
		]);
		const project = JSON.parse(session.project() ?? '{}');
		expect(project.tempo.bpm).toBe(90);
		// nothing reached the replica: the host lands the project
		expect(replica.status().bpm).toBe(120);
	});

	it('refuses what is not a fork of this lab, and an empty label', () => {
		const { lab } = labOn();
		const other = labOn().lab.fork();
		expect(() => lab.commit(other, 'x')).toThrow(/pass a fork made by lab.fork/);
		expect(() => lab.commit(lab.fork(), ' ')).toThrow(/commit label/);
		expect(() => lab.fork({} as never)).toThrow(LabError);
	});
});

describe('MIDI files', () => {
	const setup = () => labOn({ attached: files({ 'louie.mid': smallSong() }) });

	it('are read by name, and their tracks come with shapes numbered as plan takes them', () => {
		const { lab } = setup();
		expect(lab.files.names()).toEqual(['louie.mid']);
		const read = lab.files.midi('louie.mid');
		expect(read.tempos[0].bpm).toBeCloseTo(107);
		expect(read.notes.length).toBeGreaterThan(100);
		const shapes = lab.midi.shapes(read);
		expect(shapes.map((s) => ({ midi: s.midi, name: s.name, drums: s.drums }))).toEqual([
			{ midi: 2, name: 'drums', drums: true },
			{ midi: 3, name: 'bass', drums: false }
		]);
		expect(shapes[0].channels).toEqual([10]);
		expect(shapes[1].range).toBe('A1–C2');
		expect(shapes[1].shape[0]).toMatch(/^plays in bars 1–8/);
		expect(() => lab.files.midi('nope.mid')).toThrow(/attached: louie.mid/);
	});

	it('plan without writing, and write onto a fork as import_midi does', () => {
		const { lab, replica } = setup();
		const read = lab.files.midi('louie.mid');
		const plan = lab.midi.plan(read, {
			tracks: [
				{ midi: 2, to: 1 },
				{ midi: 3, to: 3 }
			]
		});
		expect(plan.tracks.map((t) => ({ to: t.to, asWritten: t.asWritten }))).toEqual([
			{ to: 1, asWritten: 1 },
			{ to: 3, asWritten: 1 }
		]);
		expect(plan.song).toEqual([1, 2]);
		const f = lab.fork();
		const written = lab.midi.write(f, plan);
		expect(written).toMatchObject({ bpm: 107, scenes: 2, song: 2, metronomeOff: true });
		expect(f.status().metronome).toBe(false);
		expect(f.readPattern(1).notes.length).toBeGreaterThan(0);
		expect(f.readPattern(1).scale).toBe(1);
		expect(f.readArrangement().song.order).toEqual([1, 2]);
		// the tracks left out that had notes rest; none do in a new project
		expect(written.resting).toEqual([]);
		expect(replica.readArrangement().song.order).toEqual([1]);
		// a name works in place of the file, and a bad mapping says why
		expect(lab.midi.plan('louie.mid', { tracks: [{ midi: 3, to: 3 }] }).tracks).toHaveLength(1);
		expect(() => lab.midi.plan(read, { tracks: [{ midi: 9, to: 3 }] })).toThrow(/midi.plan/);
		expect(() => lab.midi.plan(read, { tracks: [{ midi: 2, to: 12 }] })).toThrow(/tracks.0.to/);
	});
});

describe('listen', () => {
	it('renders a fork from the top and hears it; each track alone too', async () => {
		const render = clickRenderer();
		const { lab } = labOn({ render });
		const f = lab.fork();
		f.writePattern(1, { notes: [1, 5, 9, 13].map((step) => ({ step, note: 53 })) });
		f.writePattern(3, { notes: [{ step: 1, note: 45, length: 8 }] });
		const heard = await lab.listen(f, { seconds: 4 });
		expect(heard.text).toMatch(/^heard 4 s of fork 1/);
		expect(heard.text).toContain('the metronome is on');
		expect(heard.data?.level.lufs).toBeTypeOf('number');
		expect(render.requests[0]).toMatchObject({ seconds: 4, transport: { playing: true } });
		const alone = await lab.listen(f, { tracks: 'each' });
		expect(alone.tracks?.map((t) => t.track)).toEqual([1, 3]);
		expect(alone.data).toBeNull();
		const muted = render.requests.slice(1).map((r) => {
			const project = JSON.parse(r.project);
			return project.tracks.map((t: { mix: { muted: boolean } }) => t.mix.muted);
		});
		expect(muted[0].filter((m: boolean) => !m)).toHaveLength(1);
		expect(render.requests[1].seconds).toBe(4);
		expect(lab.fork().status().bpm).toBe(120);
	});

	it('hears one scene looping, not the song from its top, and refuses an empty one', async () => {
		const render = clickRenderer();
		const { lab } = labOn({ render });
		const f = lab.fork();
		f.writePattern(3, { pattern: 2, notes: [{ step: 1, note: 45 }] });
		// a song that opens on scene 1 (an intro with track 3's pattern 1), the beat in scene 2
		f.writeArrangement({
			scenes: [
				{ scene: 1, patterns: [{ track: 3, pattern: 1 }] },
				{ scene: 2, patterns: [{ track: 3, pattern: 2 }] }
			],
			song: { order: [1, 2], loop: true }
		});
		await lab.listen(f, { scene: 2, seconds: 2 });
		const project = JSON.parse(render.requests[0].project);
		expect(project.tracks[2].sequence.current).toBe(1);
		// held, as picking a scene holds it: it loops instead of the song moving on
		expect(project.areas.arrange.held).toBe(true);
		expect(render.requests[0].transport.playing).toBe(true);
		// from the top it is the song, from its first scene
		await lab.listen(f, { seconds: 2 });
		expect(JSON.parse(render.requests[1].project).tracks[2].sequence.current).toBe(0);
		await expect(lab.listen(f, { scene: 7 })).rejects.toThrow(/scene 7 is empty/);
	});

	it('hears the song across a change of part, each part rendered from its start', async () => {
		const render = clickRenderer();
		const { lab } = labOn({ render });
		const f = lab.fork();
		f.setTempo(120);
		f.writePattern(3, { pattern: 1, notes: [{ step: 1, note: 45 }] });
		f.writePattern(3, { pattern: 2, notes: [{ step: 1, note: 45 }] });
		f.writePattern(4, { pattern: 2, notes: [{ step: 1, note: 57 }] });
		// two parts of a bar (2 s at 120), the second with track 4 coming in
		f.writeArrangement({
			scenes: [
				{
					scene: 1,
					patterns: [
						{ track: 3, pattern: 1 },
						{ track: 4, pattern: 0 }
					]
				},
				{
					scene: 2,
					patterns: [
						{ track: 3, pattern: 2 },
						{ track: 4, pattern: 2 }
					]
				}
			],
			song: { order: [1, 2], loop: false }
		});
		const heard = await lab.listen(f, { song: {}, seconds: 6 });
		// the first part's notes, then a second ringing on with none; the last part alone
		expect(render.requests.map((r) => [r.seconds, r.notes])).toEqual([
			[3, 1.96875],
			[2, undefined]
		]);
		expect(JSON.parse(render.requests[1].project).tracks[3].sequence.current).toBe(1);
		expect(heard.text).toMatch(
			/parts: entry 1, scene 1 \(0 s–2 s\): -?[\d.]+ LUFS; entry 2, scene 2 \(2 s–4 s\): -?[\d.]+ LUFS \(\+[\d.]+ dB\)/
		);
		expect(heard.text).toMatch(/the song ends 4 s in/);
		// from a bar of an entry; past its bars, or with only one entry, it says so
		await expect(lab.listen(f, { song: { entry: 1, bar: 2 } })).rejects.toThrow(
			/has 1 bar, so it has no bar 2/
		);
		await expect(lab.listen(f, { song: { entry: 3 } })).rejects.toThrow(/2 entries/);
		await expect(lab.listen(f, { song: {}, scene: 2 })).rejects.toThrow(/song goes alone/);
	});

	it('says plainly when there is no renderer', async () => {
		const { lab } = labOn();
		await expect(lab.listen(lab.fork())).rejects.toThrow(
			/listening is not available in the lab here/
		);
	});
});

describe('arguments', () => {
	it('come back as LabErrors that name the call and the field', () => {
		const { lab } = labOn();
		const f = lab.fork();
		expect(() => f.writePattern(1, { notes: [{ step: 70, note: 60 }] })).toThrow(
			/writePattern: notes.0.step/
		);
		expect(() => f.writePattern(1, { notes: [{ step: 1, note: 'H9' }] })).toThrow(/not a note/);
		expect(() => f.writePattern(1, { notes: [], bar: 2 } as never)).toThrow(/writePattern/);
		expect(() => f.setTempo(900)).toThrow(/setTempo/);
		expect(() => f.readSound(9)).toThrow(/readSound track/);
		expect(() => f.writeArrangement({ song: { loop: true } } as never)).toThrow(/order/);
		// write_arrangement's name for the order is taken too
		f.writeArrangement({ song: { scenes: [1, 1], loop: false } } as never);
		expect(f.readArrangement().song).toEqual({ order: [1, 1], loop: false });
	});

	it("take write_pattern's short note form too", () => {
		const { lab } = labOn();
		const f = lab.fork();
		const p = f.writePattern(3, { notes: '1:A2:4 5:C3+E3:2:70' } as never);
		expect(p.notes.map((n) => [n.step, n.note, n.velocity])).toEqual([
			[1, 45, 100],
			[5, 48, 70],
			[5, 52, 70]
		]);
		expect(() => f.writePattern(3, { notes: '1-A2' } as never)).toThrow(/writePattern: /);
	});

	it('take a scene back as readArrangement gives it, pattern 0 resting a track', () => {
		const { lab } = labOn();
		const f = lab.fork();
		f.writePattern(1, { notes: [{ step: 1, note: 53 }] });
		f.writePattern(3, { notes: [{ step: 1, note: 48 }] });
		const verse = f.readArrangement().scenes[0];
		const patterns = verse.patterns.map((p, i) => (i === 0 ? 0 : p));
		f.writeArrangement({ scenes: [verse, { scene: 2, patterns }] } as never);
		const scenes = f.readArrangement().scenes;
		expect(scenes[1].patterns.slice(0, 3)).toEqual([2, 1, 1]);
		expect(f.readPattern(1, 2).notes).toEqual([]);
		expect(() =>
			f.writeArrangement({
				scenes: [{ scene: 2, patterns: [1, { track: 2, pattern: 1 }] }]
			} as never)
		).toThrow(/writeArrangement/);
	});
});
