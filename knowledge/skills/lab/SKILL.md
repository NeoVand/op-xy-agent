---
name: lab
description: Use when a request needs computing over many notes (a MIDI file, a whole song), choosing between options by measuring them (two mappings, three filter settings, by ear), or many edits at once; a program tries them on copies of the replica before anything changes.
---

# The lab

`run_lab` runs a short JavaScript program: the body of an async function with `lab` and `console`
in scope. The program works on forks, which are copies of the replica, each a whole virtual OP-XY
with its own sounds, patterns, scenes and screen. Nothing reaches the replica until the program
commits a fork with `lab.commit(fork, label)` and then finishes without an error. At that point
what the committed fork changed lands on the replica as one change, which the user can undo from
the chat. What the fork left alone stays as the replica has it, so the replica keeps playing and
anything the user did while the program ran is kept. A program that throws or runs past its time
limit changes nothing, even if it committed first.

The lab exists so that you can compute and measure instead of guessing. The replica is the
instrument the user sees; the lab is where you try an idea three ways, read what each one did, and
keep the one that holds up. One program can do what would otherwise take dozens of tool calls, and
it does the arithmetic in code, where it is exact.

## When it fits

Reach for the lab when the work is computation over many notes or many settings: arranging a MIDI
file (read it, try mappings, compare how much of each part survives, write the best), reshaping
patterns (transposing, thinning a busy part, humanising velocities, building a chorus variation
from a verse), or checking several options against each other by their numbers or by ear.

For a single change the user asked for (a tempo, a mute, one pattern) the plain tools are clearer:
they act on the replica as the user watches, and the answer can describe exactly that. To teach a
procedure, use plan_steps with guide: the steps a fork's `set` returns start from the fork's
screen, which begins where the replica's was but moves as the program works.

## What is in scope

```ts
lab.fork(from?)            // a copy of the replica as it stands now, or of another fork
lab.files.names()          // attached MIDI files
lab.files.midi(name)       // a file read note by note (MidiFileNotes)
lab.midi.shapes(file)      // per track: midi (1-based), name, channels, notes, range, drums, shape
lab.midi.plan(file, { tracks: [{ midi, to, transpose?, drums? }], fromBar?, toBar? })
lab.midi.write(fork, plan, { keepOthers? })
await lab.listen(fork, { seconds?, tracks?: 'each', scene? })   // offline render, then heard
lab.commit(fork, label)    // returns { same, changes } for what lands
lab.log(...values)         // or console.log

fork.status()  fork.readPattern(track, pattern?)  fork.writePattern(track, { pattern?, bars?,
  length?, scale?, notes: [{ step, note, velocity?, length? }] })  fork.readArrangement()
fork.writeArrangement({ scenes?: [{ scene, patterns: [{ track, pattern }] | null }],
  song?: { order, loop } })  fork.readSound(track)  fork.setTempo(bpm)  fork.setMetronome(on)
fork.setMuted(track, muted)  fork.selectTrack(track)
fork.set({ param, value, track?, area?, page?, key? })   // or an array, in order
fork.plan(setting)         // the steps set would play, without playing them
fork.press(keys, clicks?)  fork.screen()  fork.diff(other?)
```

A fork has the same calls the replica's own tools use, with the same numbers: tracks 1–16 (9–16
auxiliary), patterns 1–16, scenes 1–99, steps 1–64 with bar 2 starting at step 17. `set` takes a
setting as plan_steps does and plays the navigator's key steps on the fork, so the value is reached
the way a person would reach it; it throws, changing nothing, when the setting cannot be reached.
`press` plays a combo in the key grammar (a turn takes its detents: `press('turn E2', 5)`) and
returns what the screen shows. `diff` says what changed in the device's words ("T3 M3 filter:
cutoff 70 → 40", "scene 2: new, T1 p2"); with another fork it says how this one differs from it.

`plan` is the planner behind import_midi, and it writes nothing. Each entry of `plan.tracks` tells
you, per OP-XY track, how many notes it holds (`notes`), how many blocks play the closest of its
patterns because the part changes more often than 16 patterns hold (`folded`), and the share of its
notes that play as written (`asWritten`, 0–1). `plan.notes` lists what the OP-XY cannot carry.
`write` then puts the plan on a fork the way import_midi does: the tempo, patterns at track scale
1, the scenes and the song, the tracks left out resting, and the metronome off.

`listen` renders the fork offline through the replica's own sound and hears it, as the listen tool
does: `text` in words, `flags` worth acting on, and `data` with the numbers (`level.lufs`,
`tone.centroidHz` for brightness, `rhythm.bpm`, `rhythm.swing`, `harmony.key`). With
`tracks: 'each'` it hears every instrument track that plays, alone.

## Examples

Three worked programs are in the skill's file `examples.md` (the skill tool with name lab and file
examples.md): two mappings of a MIDI file compared by how much of each part plays as written, a
chorus made from a verse with its scenes and song, and a pad brightened by ear. Read them before
your first program in a conversation; they show the shapes programs take, not templates.

## Things that trip programs up

MIDI files as read count from 0: `read.notes[i].track`, `read.tracks[i].index` and the channels (9
is GM drums). Everything else counts from 1, including the `midi` numbers that `shapes` returns and
`plan` takes, so pass those rather than indexes.

Forks are independent copies. A commit lands what that fork changed since it was forked, so two
forks that change different things both land; when two commits change the same value, the later
one wins. Forks made after a commit start from the committed state. `fork.diff()` compares with
where the fork started, so it is the quickest way to say what a commit will do.

`writePattern` makes the pattern it writes the one the track plays, as the device does when you
pick a pattern, and the current scene follows what its tracks play. So after writing new patterns,
set every scene you mean with `writeArrangement`, the current one included, or the verse ends up
playing the chorus.

`set` refuses a value the device cannot take, and `writePattern` refuses a step outside its bars;
both throw with the reason, and the program stops there unless you catch it. When you probe
("does this preset exist?"), wrap the attempt in try/catch and log what happened.

Listening renders from the top, as play would start it, and the song does not move on to its next
scene while it renders; to hear a later part, name its scene. Each render takes a moment (about as
long as a second or two of audio takes to render, per render), a program hears at most 24 renders
and 240 seconds in all, and the whole program has its time limit (20 s unless timeout_s says
otherwise, 60 at most). A new project's metronome is on, and its click is in what you hear.

What the program prints and returns comes back cut at about 10,000 characters, so print counts,
scores and the few notes that matter rather than whole patterns. Returned values come back as
JSON; a fork prints as its name.

There is nothing outside the lab in scope: no network, no storage, no page, no timers for strings,
no imports, and no connected OP-XY. A device only hears what the user sends to it afterwards; say
so when a user expects the lab's work on their unit.

## Afterwards

The result lists each commit's changes as the lab measured them. Tell the user what changed from
that list, in a sentence or two, and what they will hear; start the transport if they should hear
it now. If the program failed, the result names the error and the line of your code it points at:
fix that line and run again rather than working around the lab with many single calls.
