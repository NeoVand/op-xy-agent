---
id: sequencer.component-ramp-down
title: Ramp down (step component)
aliases: [ramp down, falling ramp, falling step]
area: sequencer
order: 47
context:
  modes: [instrument, auxiliary]
summary: Step component on `natural 6` whose note drops one stage of an in-scale ramp each time the step plays.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Each time the step plays, ramp down moves its note one stage lower along a ramp that stays inside the current scale.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: values
    text: The black keys 1–5 give a ramp of 2–6 steps within one octave; 6–9 and 0 give 2–6 steps over three octaves, so 0 is the widest ramp rather than random.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
procedures:
  - id: add
    goal: Make a step fall in two large stages
    steps:
      - keys: shift + steps → + natural 6 → + accidental 6
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
related: [sequencer.component-ramp-up, sequencer.step-component-reference]
---

The mirror of ramp up, for falling bass lines and cascades built from a single step.
