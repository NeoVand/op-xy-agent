---
id: sequencer.component-skip-trigger
title: Skip trigger (step component)
aliases: [skip trig, trig condition, conditional trig, probability]
area: sequencer
order: 55
context:
  modes: [instrument, auxiliary]
summary: Step component on `natural 14` that lets a step's notes play only on some passes.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Skip trigger lets the step's notes sound only on some passes of the pattern.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: values
    text: 1 plays the step every time, 2–9 only on every 2nd to 9th pass, and 0 at random.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
procedures:
  - id: add
    goal: Play a step only every second pass
    steps:
      - keys: shift + steps → + natural 14 → + accidental 2
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
related: [sequencer.component-skip-step-component, sequencer.step-component-reference]
---

A one-in-N trig condition: a crash on a step with value 4 lands once every four passes, turning a
one-bar loop into a four-bar phrase. Value 0 leaves each pass to chance.
