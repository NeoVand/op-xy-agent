# Agent eval results

Re-run with `node evals/agent/run.mjs --manual ours --judge claude-sonnet-5` (needs `ANTHROPIC_API_KEY`
in `.env`; never printed). Newest first.

## Episodes

### 2026-09-30 — the baseline, agent claude-sonnet-5-5, simulated user claude-sonnet-5

`node evals/agent/episodes.mjs --out evals/agent/out/ep-v1.json` (docs/AGENT-V2.md, "Evals"). Twelve
OP-XY owners bring a goal in their own words: beginners, intermediates and veterans; patient,
impatient or vague; wanting it done for them, shown to them, or to do it with their own hands. A
simulated user reads each answer, presses keys on the replica in the key grammar with a count on
turns (`turn E1 +40`), follows lit walkthroughs, looks and listens, then writes again or stops.
Success is read from the replica's state and from who changed what (the user's own presses, or the
agent), never from what either of them says.

| Episode         | Persona                                 | Result | Msgs | Agent $ | What happened                                                                                                                                                       |
| --------------- | --------------------------------------- | ------ | ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-jam`     | beginner · vague · do it for me         | pass   | 3    | 0.73    | A 92 BPM groove on three tracks in its first answer; two more turns went on the user not hearing their own keys, a harness gap since fixed.                         |
| `brighter-bass` | beginner · patient · let me do it       | pass   | 1    | 0.11    | `read_sound` found the cutoff at 00; a lit walkthrough (`T3`, `M3`, `turn E1 +40`) and the user's own hands did the rest.                                           |
| `pump`          | intermediate · patient · show me        | pass   | 5    | 0.47    | A duck on track 3 at once, but keyed to the metronome: it assumed kick and hats share track 1 without reading the project, and the user had to correct it.          |
| `kick-lesson`   | beginner · patient · let me do it       | fail   | 1    | 0.11    | Its demonstration (`show_on_replica`, ending on `step 1`) entered the first kick itself; the user pressed the other three.                                          |
| `snare-roll`    | veteran · impatient · do it for me      | pass   | 2    | 0.20    | Two bars, the first kept, a roll in the second, in one write.                                                                                                       |
| `song`          | intermediate · patient · do it for me   | pass\* | 3    | 0.84    | Intro, groove, break and the groove again as scenes 1–4; the user watched arrange move through them.                                                                |
| `warm-pad`      | intermediate · patient · show me        | pass   | 2    | 0.15    | Attack and release shown on the replica in one `plan_steps`, and it explained why a lower release is a longer one.                                                  |
| `mute-live`     | beginner · patient · let me do it       | fail\* | 5    | 0.41    | Its demo muted track 2 and left mix mode on, so the user's `mix` swapped to the auxiliary tracks; it then took the user's unmute for a press that did not register. |
| `tempo-swing`   | intermediate · impatient · do it for me | pass   | 1    | 0.07    | 90 BPM and a swing in one turn.                                                                                                                                     |
| `midi-file`     | intermediate · patient · do it for me   | fail   | 4    | 0.55    | `import_midi` left the 2-bar file in 4-bar patterns; the agent said the last two bars rest instead of fixing it, then tuned the bass when the user heard the gaps.  |
| `boring`        | beginner · vague · do it for me         | pass   | 1    | 0.32    | Rebuilt the whole loop on five tracks without asking; the user liked it.                                                                                            |
| `impatient-vet` | veteran · impatient · do it for me      | pass   | 3    | 0.30    | The beat at once; two more turns went on "chords" the user's hearing reported in a drum loop, a harness artifact since fixed.                                       |

**9/12.** By level: beginner 3/5, intermediate 4/5, veteran 2/2. By temperament: patient 4/7,
impatient 3/3, vague 2/2. By learning style: do it for me 6/7, show me 2/2, **let me do it 1/3**.
The user's verdict matched the replica's state in every episode they ended themselves, except that
the kick-lesson user was happy although the agent had entered one of the four kicks. Mean 69 s and
2.2 messages an episode. Cost: agent $3.46 and simulated user $0.24 for the twelve (`ep-v1.json`),
then $1.34 for the two re-run (`ep-v1-rerun.json`).

\*Re-run after the harness fixes below. As first scored, `song` failed on a check of ours that
compared scene numbers rather than their music (scene 4 was a copy of scene 2), and `mute-live`'s
user ended on an empty reply the harness took for giving up.

What the failures say about the agent:

- **Demonstrations that change the replica teach badly.** For users who want to do it themselves,
  the agent's first move was `show_on_replica`, which presses the keys for real: it entered the
  first kick (kick-lesson, both runs) and muted track 2 (mute-live, all three runs). It also left
  the replica where its written steps did not start from: after the demo the replica was in mix
  mode, so the user's `mix` swapped to the auxiliary tracks and `shift + T2` muted the punch-in FX.
  The walkthrough, which lights keys and changes nothing, worked every time it was used.
- **It does not keep track of its own changes.** In mute-live the user's `shift + T2` unmuted track
  2, because the demo had muted it; the agent said the press "probably didn't register". The
  grounding diff (V2.2) is aimed at exactly this.
- **It guesses where it could measure.** It assumed kick and hats share track 1 (pump, mute-live)
  and picked the duck's source from that guess; one `read_pattern` would have answered it.
- **It reports a defect instead of fixing it.** In all three runs of midi-file it said the 2-bar
  file rests through the last two bars of every loop and left it so; in the baseline it then
  changed the bass sound when the user heard the gaps.
- **Its listening misleads it about the duck.** The replica's sound applies the duck (a track dips
  when its source plays a note), but `listen_tracks` hears the bass alone by muting the kick, so the
  duck never fires, and the loudness summary cannot resolve 100 ms dips. In both runs it measured
  no dip: once it concluded the replica ignores the duck and rewrote the bass as a "manual pump",
  once it called the pump unverified.
- **Vague requests get a rebuild, not a question** (boring, both runs): five tracks rewritten on the
  first message. The user liked it here; a pickier one might not.

The harness, as it changed while building it: the first run (`ep-v0.json`, 8/12) had no clock
under the simulator, so a song never left its first scene and every listen heard the same bar; and
the user heard the analyser's readout, reading a kick's click as a clap on every beat. The clock
now runs as the app runs it, and the user hears in words (level, brightness, the beat, its tempo,
swing, the key). After `ep-v1`: text typed beside a press counts as the message, the song check
compares the scenes' music, the tempo in the user's words follows the music's beat when the pulse
finder locks onto double time, and a key played is heard. After the re-run, not yet run with: a
`hold` shows what the replica shows while held (shift in mix shows the mutes), and harmony is heard
only when the key is clear. None of those decide the three failures, which happen in the agent's
first answer or the import.

## 2026-09-28 — runnable recipes and values by name, conductor claude-opus-5-5

The navigator now plans every value the device map shows by the name its screen uses (a drum key's
tune, the brain's mode and routing, the player list, arrange's scenes and song, the slicer), and
three more recipes run on a new project (brain routing, slicing a loop, a song from scenes). Six
how-to cases cover them (`node evals/agent/howto.mjs --ids brain-lead,brain-key,slice,song-scenes,drum-tune,maestro`).

| Case          | Request                                                       | Result | Tools it used               |
| ------------- | ------------------------------------------------------------- | ------ | --------------------------- |
| `brain-lead`  | keep the lead on track 5 out of the brain, a four-bar brain   | pass   | plan_steps (show, settings) |
| `brain-key`   | the brain guesses the wrong key: set A minor by hand          | pass   | plan_steps (show, settings) |
| `slice`       | chop the loop on track 1's E5 into 16 equal slices            | pass   | plan_steps (show)           |
| `song-scenes` | scene 2 with a new pattern on track 3, song 1 1 2 2, no loop  | pass   | plan_steps (show, settings) |
| `drum-tune`   | the snare on track 1 down two semitones                       | pass   | plan_steps (show)           |
| `maestro`     | track 4's player to maestro with hold on, and how to reach it | pass   | plan_steps (show, settings) |

$1.29 for the six ($0.86 of it the manual cache on the first), 17–32 s each, one plan_steps call
per case. The answers give the device's keys: `M2`, a click of `E1` for tracks 5–8 and `E1`
counter-clockwise to take `T5` out; `key E5 + M1` into the slicer; `shift + accidental 2` for a
scene that starts as a copy; `key G3` then `E1` 20 clicks down for the snare; `shift + player` with
shift kept down to step through the player list. For maestro the agent also switched the player on
and said so.

## 2026-09-28 — changing engine through the preset browser, conductor claude-opus-5-5

On OS 1.1.33 shift + M1 brings up the preset browser, and the replica now does too, so the navigator
loads an engine as one of its presets: shift + M1, `E1` to the engine, a click of `E2`. Two how-to
cases cover it (`node evals/agent/howto.mjs --ids engine,engine-pad`).

| Case         | Request                                                | Result | Tools it used               |
| ------------ | ------------------------------------------------------ | ------ | --------------------------- |
| `engine`     | wavetable on track 4, then the steps for my own unit   | pass   | plan_steps (show)           |
| `engine-pad` | a slow wavetable pad on track 5 (amp attack around 60) | pass   | plan_steps (show, settings) |

$0.90 for the two (most of the first's $0.81 writing the manual cache). The steps are the device's
(`shift + M1`, `turn E1` 9 clockwise from dissolve to wavetable, `click E2`), and the attack is set
after the engine, whose preset resets the envelope.

## 2026-09-28 — regression after F4 (plan_steps settings, recipes, set_sound), conductor claude-opus-5-5, judge claude-sonnet-5

`node evals/agent/run.mjs --manual ours --judge claude-sonnet-5`, with the new prompt, the five
recipes (163 units) and 18 tools. Manual Q&A **42/42** (99% of required facts); expected key combos
61/77, up from 59/77. Device tasks **18/18**. Latency mean 9.8 s, p95 16.1 s. Cost $4.68 agent
(101 calls) + $0.27 judge, 99% of prompt tokens read from cache. Nothing regressed; the one answer
short of full facts (`15-fx-change-and-chain`, 75%) still passed.

## 2026-09-28 — idea to device: whole sounds in one plan, conductor claude-opus-5-5

`plan_steps` now takes several `settings` at once, each planned from where the ones before leave the
device. The manual gained five recipes whose steps carry those settings (duck, pluck, pad swell,
wobble, acid bass; `recipes.spec.ts` runs each on a new project). Two idea-to-device cases were added
to the how-to eval.

| Case                  | Request                                                        | Result   | Tools it used                             |
| --------------------- | -------------------------------------------------------------- | -------- | ----------------------------------------- |
| `cutoff`              | how to set track 3's cutoff to 40                              | pass     | plan_steps → show_on_replica              |
| `release`             | notes should stop the moment the keys come up: what, which way | pass     | plan_steps → show_on_replica              |
| `tempo`               | show on the replica how to set tempo 96                        | pass     | plan_steps (show)                         |
| `slow-filter`         | set up a slowly opening filter on track 3, then give the steps | pass     | plan_steps (show, settings)               |
| `duck`                | make the bass pump with the kick, then the steps for my unit   | pass     | plan_steps (show, settings)               |
| `acid`                | turn track 3 into a squelchy acid bass                         | pass     | plan_steps (show, settings)               |
| `pluck`               | a plucky bass on track 3 (short decay, no sustain, more reso)  | pass     | plan_steps (show, settings)               |
| `reverb`              | FX II's size to 85 and more of track 7 into it                 | pass     | plan_steps ×2 (show)                      |
| `mix`                 | track 2 down to 40 in the mix, panned a little left            | pass     | plan_steps ×3 (show)                      |
| `screen-off`          | "a box on my screen says off": what, and how to clear it       | pass     | read_screen → show_on_replica             |
| `screen-page`         | what is this page doing to my sound (a duck on the metronome)  | pass     | read_screen                               |
| `screen-lost`         | "tilted panels on a grid": what, and back to track 3's filter  | pass     | read_screen → plan_steps                  |
| `guide`               | "walk me through finding the cutoff, I will press the keys"    | pass     | plan_steps (guide)                        |
| `house-loop`          | kick on the beats, offbeat hats, a pumping bassline, then play | pass 2/3 | write_pattern ×2 → plan_steps → transport |
| `starter-walkthrough` | the panel's suggestion, word for word                          | pass     | plan_steps (guide)                        |
| `starter-pump`        | "make the bass pump with the kick"                             | pass     | plan_steps (show, settings)               |
| `starter-loop`        | "build a little house loop and play it"                        | pass     | write_pattern ×3 → set_tempo → transport  |

A full run after the day's integration (aux, filter and LFO pages, the 0–99 envelope amount) passed
17/17 for $2.51. The starter cases are the agent panel's new suggestions, typed as a user would: all
three pass ($1.05; a 124 BPM loop on three tracks, playing). The house loop needs patterns and sound
design together. It failed once, in 3 runs, on the check: the agent ducked the bass on the
metronome, reasoning that the hats share track 1. That is a fair call for a kick on every beat, so
the check now takes the metronome when the answer says so, and the duck recipe carries that case.
The guide case came with the walkthroughs. The agent handed the steps to the replica and told the
user to follow the lit keys, and it did not play them itself ($0.81, most of it the cache). The
screen cases start the replica somewhere else (a switched-off filter, a duck LFO, the master EQ) and
pass 3/3 for $0.30. One answer called the EQ's panels upright at full boost. The manual said so; the
device leans them to about 60°, and the unit now says that. The reverb and mix cases came with the
navigator's reach into the auxiliary and mixer pages (a run of three, duck included, $1.10). The
agent walked to `auxiliary` → `T8` and turned `E1` 16 detents for the reverb; for the mix it went
`mix` → `T2`, `E4` down to 40 and `E3` to −16. $1.34 for the first seven ($0.84 of it the manual
cache on the first). Each set-up now takes one call instead of two to four, and the answers explain
every change: "with sustain at 0, the decay alone sets how long each note lasts". For the acid bass
the agent picked the ladder filter and noted that the pick returns to `M1`, as on the device.

## 2026-09-28 — how-to: exact steps and the replica, conductor claude-opus-5-5

`node evals/agent/howto.mjs`: the agent is asked how to reach a value, to show something on the
replica, and to set a sound up from an idea. The replica is a real `ReplicaState` driving the
simulator, as in the app, so `plan_steps` with `show` leaves the virtual OP-XY where it led. We
check the steps it gave, the tools it used and the values it left.

| Case          | Request                                                        | Result | Tools it used                      |
| ------------- | -------------------------------------------------------------- | ------ | ---------------------------------- |
| `cutoff`      | how to set track 3's cutoff to 40                              | pass   | plan_steps → show_on_replica       |
| `release`     | notes should stop the moment the keys come up: what, which way | pass   | plan_steps → show_on_replica       |
| `tempo`       | show on the replica how to set tempo 96                        | pass   | plan_steps (show)                  |
| `slow-filter` | set up a slowly opening filter on track 3, then give the steps | pass   | plan_steps ×2 (show) → read_screen |
| `pluck`       | a plucky bass on track 3 (short decay, no sustain, more reso)  | pass   | plan_steps ×4 (show) → read_screen |

$1.31 for the five ($0.73 of it the manual cache on the first). The answers give the exact keys
(`T3` → `M3` → turn `E1` 40 detents clockwise) and the release direction (clockwise is shorter, as
on the device). The first run failed every request: the two tools' optional fields pushed the tool
set over the API's limits (24 optional parameters; then the strict grammar's size). The registry
now refuses more than 24, and `plan_steps` is sent without `strict` (zod still checks its input).
The virtual eval (below) passes 3/3 again with it.

## 2026-09-27 — the virtual OP-XY: programming without a device, conductor claude-opus-5-5

`node evals/agent/virtual.mjs`: no device connected; the agent gets a request in plain words and
programs the replica's simulator through `write_pattern`, `write_arrangement` and `transport`. We
check the patterns, scenes and song it left, exactly.

| Case     | Request                                                      | Result | Tools it used                                                              |
| -------- | ------------------------------------------------------------ | ------ | -------------------------------------------------------------------------- |
| `beat`   | a house beat on track 1 (kick on quarters, snare on 2 and 4) | pass   | write_pattern → transport                                                  |
| `chords` | C, Am, F, G on track 4, a bar each, held                     | pass   | write_pattern → transport                                                  |
| `song`   | two scenes (kick; kick + C2 eighths bass), song 1 1 2 2 loop | pass   | write_todos, device_status, write_pattern ×2, write_arrangement, transport |

$1.07 for the three ($0.75 of it writing the manual cache on the first case), 14–25 s each. Every
answer said it played on the virtual OP-XY in the browser because no device was connected.

## 2026-09-27 — files: sheet music and MIDI, conductor claude-opus-5-5

`node evals/agent/files.mjs`: the agent gets a file and "play this on track 3"; the notes it plays on
the fake OP-XY (every `play_notes` step, in order) are compared with the score.

| Case                                                  | Pitch | Rhythm | Notes | Said what it read                                 |
| ----------------------------------------------------- | ----- | ------ | ----- | ------------------------------------------------- |
| `ode-c.png`, Ode to Joy, C major (engraved score)     | 100%  | 100%   | 30/30 | C major, 4/4, 8 bars, no tempo marking            |
| `ode-d.png`, Ode to Joy, D major (key signature)      | 100%  | 100%   | 30/30 | D major (two sharps), 4/4, 8 bars                 |
| `jacques-f.png`, Frère Jacques, F major, eighth notes | 100%  | 100%   | 32/32 | F major (one flat), 4/4, the four two-bar figures |
| `frere-jacques.mid`, the same melody as a MIDI file   | 100%  | 100%   | 32/32 | played at the file's 108 bpm                      |

About 35 s and $0.09–0.10 a case once the manual is cached (the first case writes the cache:
$0.72). The scores are Verovio engravings of our ABC transcriptions (`evals/agent/fixtures`);
photos of printed music, piano scores and multi-part pieces are next.

## 2026-09-26 — production parity (our manual only), conductor claude-opus-5-5, judge claude-sonnet-5

| Suite                                        | Result                                                                                                                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual Q&A (42 cases, all 24 guide chapters) | **42/42 pass**, 99% of required facts present                                                                                                                                            |
| Expected key combos mentioned                | 59/77 (improvement area: surface more exact combos)                                                                                                                                      |
| Device tasks against the fake OP-XY (18)     | **18/18 pass** — tempo (incl. odd values and out-of-range refusal), mutes, track select, transport, chords/runs/drum hits, show-on-replica, refusing project load and remote keys, panic |
| Latency per request                          | mean 8.8 s, p50 8.9 s, p95 12.7 s                                                                                                                                                        |
| Cost                                         | $4.17 agent (105 model calls) + $0.25 judge                                                                                                                                              |
| Prompt cache                                 | 99% of prompt tokens read from cache                                                                                                                                                     |

Every answer cited units from our reworded manual (`knowledge/manual`); no TE text was involved.
