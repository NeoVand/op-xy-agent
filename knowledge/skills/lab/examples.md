# Lab examples

Illustrations of the shapes programs take, not templates: write what the request needs.

Two mappings of a MIDI file, keeping the one whose parts play more of their notes as written:

```js
const read = lab.files.midi('brother louie.mid');
for (const s of lab.midi.shapes(read)) lab.log(s.midi, s.name, s.notes, s.shape.join('; '));
// drums on T1 and the bass on T3 either way; the lead's verse on T4, or verse and chorus there
const to = (midi, track) => ({ midi, to: track });
const options = {
	'verse lead': [to(2, 1), to(3, 3), to(5, 4)],
	'whole lead': [to(2, 1), to(3, 3), to(5, 4), to(6, 4)]
};
const scored = Object.entries(options).map(([name, tracks]) => {
	const plan = lab.midi.plan(read, { tracks });
	const notes = plan.tracks.reduce((n, t) => n + t.notes, 0);
	const kept = plan.tracks.reduce((n, t) => n + t.notes * t.asWritten, 0);
	return { name, plan, share: kept / notes, folded: plan.tracks.map((t) => t.folded) };
});
scored.sort((a, b) => b.share - a.share);
const best = scored[0];
const f = lab.fork();
lab.midi.write(f, best.plan);
lab.commit(f, `brother louie, ${best.name}`);
return scored.map(({ name, share, folded }) => ({ name, share, folded }));
```

A chorus from a verse: the hats of pattern 1 doubled up and a little humanised on pattern 2, the
bass an octave up, and scenes that play the verse twice, then the chorus twice:

```js
const f = lab.fork();
const beat = f.readPattern(1, 1);
const busier = beat.notes.flatMap((n) =>
	n.sound?.includes('hat') && n.step % 2 === 1 && n.step < beat.length
		? [n, { ...n, step: n.step + 1, velocity: Math.max(1, n.velocity - 25) }]
		: [n]
);
const nudge = (n, i) => ({ ...n, velocity: Math.min(127, n.velocity + ((i * 7) % 11) - 5) });
f.writePattern(1, { pattern: 2, bars: beat.bars, notes: busier.map(nudge) });
const bass = f.readPattern(3, 1);
f.writePattern(3, {
	pattern: 2,
	bars: bass.bars,
	notes: bass.notes.map((n) => ({ ...n, note: n.note + 12 }))
});
// the current scene follows what its tracks play, so name the verse's patterns too
const scene = (n, pattern) => ({ scene: n, patterns: [1, 3].map((track) => ({ track, pattern })) });
f.writeArrangement({
	scenes: [scene(1, 1), scene(2, 2)],
	song: { order: [1, 1, 2, 2], loop: true }
});
return lab.commit(f, 'chorus').changes;
```

A brighter pad by ear: the cutoff read off its page, three higher values tried on forks and heard
alone, and the lowest that reaches the brightness wanted kept:

```js
const page = lab.fork().readSound(7).pages['M3 filter'];
const now = Number(/cutoff (\d+)/.exec(page)?.[1] ?? 50);
const tries = [];
for (const cutoff of [10, 25, 40].map((up) => Math.min(99, now + up))) {
	const f = lab.fork();
	f.set({ track: 7, param: 'cutoff', value: cutoff });
	const heard = await lab.listen(f, { tracks: [7], seconds: 3 });
	tries.push({ cutoff, f, hz: heard.tracks[0].data.tone?.centroidHz ?? 0 });
}
const chosen = tries.find((t) => t.hz >= 1500) ?? tries[tries.length - 1];
lab.commit(chosen.f, `brighter pad, cutoff ${chosen.cutoff}`);
return { was: page, heard: tries.map(({ cutoff, hz }) => ({ cutoff, hz })), chose: chosen.cutoff };
```
