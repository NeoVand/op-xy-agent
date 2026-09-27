---
id: sequencer.component-ramp-up
title: Ramp up (step component)
aliases: [ramp up, rising ramp, climbing step]
area: sequencer
order: 46
context:
  modes: [instrument, auxiliary]
summary: Step component on `natural 5` whose note climbs one stage of an in-scale ramp each time the step plays.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Each time the step plays, ramp up moves its note one stage higher along a ramp that stays inside the current scale.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: values
    text: The black keys 1–5 give a ramp of 2–6 steps within one octave; 6–9 and 0 give 2–6 steps over three octaves, so 0 is the widest ramp rather than random.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
procedures:
  - id: add
    goal: Make a step climb in four stages through an octave
    steps:
      - keys: shift + steps → + natural 5 → + accidental 3
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
related: [sequencer.component-ramp-down, sequencer.step-component-reference]
---

One repeated note becomes a figure that rises from pass to pass, such as a bass note climbing each
time the loop comes round.
