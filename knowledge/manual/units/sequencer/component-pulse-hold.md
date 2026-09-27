---
id: sequencer.component-pulse-hold
title: Pulse hold (step component)
aliases: [hold component, hold step, wait on a step]
area: sequencer
order: 43
context:
  modes: [instrument, auxiliary]
summary: Step component on `natural 2` that holds a step for extra steps while the sequence waits.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.29']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Pulse hold keeps the track on a step for a chosen number of steps before the sequence moves on.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: values
    text: The black keys 1–9 hold the step for 1–9 steps; 0 for a random number.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: note-length
    text: Since OS 1.0.29 the length of the held note is set from the track scale.
    source: https://teenage.engineering/downloads/op-xy#1.0.28
    firmware_min: '1.0.29'
  - id: arp
    text: Since OS 1.0.29 pulse hold leaves the length of arpeggio notes alone.
    source: https://teenage.engineering/downloads/op-xy#1.0.28
    firmware_min: '1.0.29'
procedures:
  - id: add
    goal: Hold a step for two steps
    steps:
      - keys: shift + steps → + natural 2 → + accidental 2
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
related: [sequencer.component-pulse, sequencer.extend-notes]
---

Where pulse re-triggers the step, pulse hold lets its note ring while the rest of the pattern waits.
For a long note that delays nothing, extend the note instead.
