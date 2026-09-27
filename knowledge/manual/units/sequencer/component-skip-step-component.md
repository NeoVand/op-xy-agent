---
id: sequencer.component-skip-step-component
title: Skip step component (step component)
aliases: [skip component, conditional component, component every nth pass]
area: sequencer
order: 54
context:
  modes: [instrument, auxiliary]
summary: Step component on `natural 13` that lets a step's other components apply only on some passes.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: The step's other components act only on some passes of the pattern; on the rest the step plays without them.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: values
    text: 1 applies them every time, 2–9 only on every 2nd to 9th pass, and 0 at random.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
procedures:
  - id: sometimes-ratchet
    goal: Ratchet a step only every second pass
    steps:
      - keys: shift + steps → + natural 3 → + accidental 2
        note: multiply, two hits
      - keys: shift + steps → + natural 13 → + accidental 2
        note: same steps
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
related: [sequencer.component-multiply, sequencer.step-component-reference]
---

A ratchet, bend or random note that appears only every few passes sounds like a deliberate variation
rather than a loop.
