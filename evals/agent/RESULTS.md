# Agent eval results

Re-run with `node evals/agent/run.mjs --manual ours --judge claude-sonnet-5` (needs `ANTHROPIC_API_KEY`
in `.env`; never printed). Newest first.

## 2026-09-28 — idea to device: whole sounds in one plan, conductor claude-opus-5-5

`plan_steps` now takes several `settings` at once, each planned from where the ones before leave the
device. The manual gained five recipes whose steps carry those settings (duck, pluck, pad swell,
wobble, acid bass; `recipes.spec.ts` runs each on a new project). Two idea-to-device cases were added
to the how-to eval.

| Case          | Request                                                        | Result | Tools it used                |
| ------------- | -------------------------------------------------------------- | ------ | ---------------------------- |
| `cutoff`      | how to set track 3's cutoff to 40                              | pass   | plan_steps → show_on_replica |
| `release`     | notes should stop the moment the keys come up: what, which way | pass   | plan_steps → show_on_replica |
| `tempo`       | show on the replica how to set tempo 96                        | pass   | plan_steps (show)            |
| `slow-filter` | set up a slowly opening filter on track 3, then give the steps | pass   | plan_steps (show, settings)  |
| `duck`        | make the bass pump with the kick, then the steps for my unit   | pass   | plan_steps (show, settings)  |
| `acid`        | turn track 3 into a squelchy acid bass                         | pass   | plan_steps (show, settings)  |
| `pluck`       | a plucky bass on track 3 (short decay, no sustain, more reso)  | pass   | plan_steps (show, settings)  |
| `reverb`      | FX II's size to 85 and more of track 7 into it                 | pass   | plan_steps ×2 (show)         |
| `mix`         | track 2 down to 40 in the mix, panned a little left            | pass   | plan_steps ×3 (show)         |

The last two came with the navigator's reach into the auxiliary and mixer pages (a run of three,
duck included, $1.10). The agent walked to `auxiliary` → `T8` and turned `E1` 16 detents for the
reverb; for the mix it went `mix` → `T2`, `E4` down to 40 and `E3` to −16. $1.34 for the first seven ($0.84 of it the manual cache on the first). Each set-up now takes one call
instead of two to four, and the answers explain every change: "with sustain at 0, the decay alone
sets how long each note lasts". For the acid bass the agent picked the ladder filter and noted that
the pick returns to `M1`, as on the device.

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
