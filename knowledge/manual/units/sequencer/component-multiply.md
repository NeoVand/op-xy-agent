---
id: sequencer.component-multiply
title: Multiply (step component)
aliases: [multiply, ratchet, retrigger, roll, divide a step, triplets, triplet roll]
area: sequencer
order: 44
context:
  modes: [instrument, auxiliary]
summary: Step component on `natural 3` that splits a step into several quick hits inside its own length, a ratchet.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Multiply divides a step into several shorter hits that fit inside the step, the ratchet effect common on hi-hats.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: values
    text: The black keys 1–8 split the step into 1–8 hits (1 leaves it unchanged); 0 picks a random number.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: nine
    text: "`accidental 9` most likely gives 9 hits; TE's table prints 3 for it, apparently a slip. Not checked on a unit."
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
    confidence: derived
  - id: triplets
    text: Three hits in a step are triplets of that step's length, so multiply 3 on a sixteenth step gives a thirty-second-note triplet roll, and on a step of an eighth (track scale 2) sixteenth-note triplets; the track scales alone have no triplet value.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
    confidence: derived
procedures:
  - id: ratchet
    goal: Turn a hi-hat step into a three-hit ratchet
    steps:
      - keys: shift + steps → + natural 3 → + accidental 3
        note: the screen reads "divide into 3 trigs"
    source: https://teenage.engineering/guides/op-xy/get-started#4.1%20sequencing%20a%20drum%20beat
related: [sequencer.component-skip-step-component, sequencer.step-component-reference]
---

Unlike pulse, multiply does not delay the next step. Pair it with skip step component so the burst
fires only every few passes.
