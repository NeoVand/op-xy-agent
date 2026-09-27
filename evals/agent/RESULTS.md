# Agent eval results

Re-run with `node evals/agent/run.mjs --manual ours --judge claude-sonnet-5` (needs `ANTHROPIC_API_KEY`
in `.env`; never printed). Newest first.

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
