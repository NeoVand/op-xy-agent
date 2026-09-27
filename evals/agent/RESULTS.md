# Agent eval results

Re-run with `node evals/agent/run.mjs --manual ours --judge claude-sonnet-5` (needs `ANTHROPIC_API_KEY`
in `.env`; never printed). Newest first.

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
