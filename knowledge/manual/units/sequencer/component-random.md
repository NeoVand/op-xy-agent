---
id: sequencer.component-random
title: Random (step component)
aliases: [random note, random pitch, randomise, randomize]
area: sequencer
order: 48
context:
  modes: [instrument, auxiliary]
summary: Step component on `natural 7` that gives a step a random note from the current scale.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Random replaces the step's note with one picked at random inside the current scale.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: values
    text: 'The digit sets the range: 1–5 give 2–6 steps within one octave, 6–9 and 0 give 2–6 steps over three octaves, so 0 is the widest range rather than random.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
procedures:
  - id: add
    goal: Let a step wander between nearby notes
    steps:
      - keys: shift + steps → + natural 7 → + accidental 1
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
related: [sequencer.component-skip-step-component, sequencer.step-component-reference]
---

A narrow range keeps a melody recognisable while it shifts; a wide one scatters notes. Add skip
step component so the randomness strikes only on some passes.
