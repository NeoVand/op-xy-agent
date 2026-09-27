---
id: sequencer.component-tonality
title: Tonality (step component)
aliases: [tonality, transpose a step, step interval]
area: sequencer
order: 51
context:
  modes: [instrument, auxiliary]
summary: Step component on `natural 10` that transposes a step by a fixed interval or changes how it follows the brain's key.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Tonality transposes the step by a set interval.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: values
    text: '1 ignore chord progression, 2 transpose only, 3 octave up, 4 fifth up, 5 third up, 6 chromatic up, 7 chromatic down, 8 quantize 33%, 9 quantize 66%, 0 quantize 100%.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: brain
    text: Options 1, 2 and 8–0 appear to set how the step follows the brain track's transposition and scale; TE does not explain them.
    source: https://teenage.engineering/guides/op-xy/auxiliary#brain
    confidence: derived
procedures:
  - id: add
    goal: Lift a step by a fifth
    steps:
      - keys: shift + steps → + natural 10 → + accidental 4
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
related: [auxiliary.brain, sequencer.step-component-reference]
---

Intervals add harmony to single steps, such as an octave jump on every fourth bass note. Tonality
has no random setting.
