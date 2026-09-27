---
id: sequencer.component-portamento
title: Portamento (step component)
aliases: [portamento component, step glide, slide]
area: sequencer
order: 49
context:
  modes: [instrument, auxiliary]
summary: Step component on `natural 8` that glides the pitch into and out of a step.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: The portamento component makes the pitch glide into the step and out of it again.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: values
    text: The black keys 1–9 set the amount from 10% to 90%; 0 picks a random amount.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: vs-track
    text: It acts on single steps, whereas the portamento setting on the `M2` shift page glides every note of the track.
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
    confidence: derived
procedures:
  - id: add
    goal: Slide into one step
    steps:
      - keys: shift + steps → + natural 8 → + accidental 5
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
related: [instrument.play-mode, sequencer.step-component-reference]
---

It puts a slide exactly where you want it, such as the one bass note that should swoop.
