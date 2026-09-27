---
id: sequencer.component-bend
title: Bend (step component)
aliases: [bend component, pitch curve, pitch envelope on a step]
area: sequencer
order: 50
context:
  modes: [instrument, auxiliary]
summary: Step component on `natural 9` that runs one of ten pitch-bend curves over a step.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Bend runs a pitch-bend curve over the step; the black key chooses the shape.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: values
    text: '1 down-up, 2 up-down, 3 bump down, 4 bump up, 5 spring out, 6 spring in, 7 fade down, 8 fade up, 9 random 1, 0 random 2.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: depth
    text: The depth may follow the track's bend range (`M2` shift page), in which case bend range off would silence the effect. Not confirmed.
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
    confidence: speculative
procedures:
  - id: add
    goal: Give a step a dip-and-return bend
    steps:
      - keys: shift + steps → + natural 9 → + accidental 1
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
related: [instrument.play-mode, sequencer.step-component-reference]
---

A small pitch envelope for one step: dips, falling kicks, chirps on percussion.
