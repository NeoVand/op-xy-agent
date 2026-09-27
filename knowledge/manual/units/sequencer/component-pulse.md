---
id: sequencer.component-pulse
title: Pulse (step component)
aliases: [pulse, repeat step, stutter step]
area: sequencer
order: 42
context:
  modes: [instrument, auxiliary]
summary: Step component on `natural 1` that repeats a step before the track moves on.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Pulse replays a step a chosen number of times while the track stays on it; then the sequence continues.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: values
    text: The black keys 1–9 give 1–9 repeats; 0 a random number.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: later-steps
    text: Because the track waits during the repeats, the steps after a pulsed step play later than written.
    source: https://teenage.engineering/guides/op-xy/step-components
    confidence: derived
procedures:
  - id: add
    goal: Make a step play three extra times
    steps:
      - keys: shift + steps → + natural 1 → + accidental 3
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
related: [sequencer.component-multiply, sequencer.step-component-reference]
---

Use pulse for rolls and stumbles built from one hit. To fit extra hits inside the step without
delaying anything, use multiply.
