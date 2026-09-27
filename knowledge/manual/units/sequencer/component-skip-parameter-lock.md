---
id: sequencer.component-skip-parameter-lock
title: Skip parameter lock (step component)
aliases: [skip p-lock, conditional lock, lock every nth pass]
area: sequencer
order: 53
context:
  modes: [instrument, auxiliary]
summary: Step component on `natural 12` that lets a step's parameter locks apply only on some passes.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: The step's parameter locks take effect only on some passes of the pattern; on the others the step plays with the track's normal settings.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: values
    text: 1 applies the locks every time, 2–9 only on every 2nd to 9th pass, and 0 at random.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
procedures:
  - id: add
    goal: Let a step's locks play only every fourth pass
    steps:
      - keys: shift + steps → + natural 12 → + accidental 4
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
related: [sequencer.parameter-locks, sequencer.step-component-reference]
---

For automation that turns up now and then, such as a filter opening on one pass in four. The notes
play on every pass.
