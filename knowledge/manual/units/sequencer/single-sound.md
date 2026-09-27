---
id: sequencer.single-sound
title: Sequencing one sound at a time
aliases: [one-sound view, single note view, drum lane, drum sequencing]
area: sequencer
order: 24
context:
  modes: [instrument, auxiliary]
summary: Hold a keyboard key and tap `record` to see only the steps that play that note or drum sound; with the key still held, press steps to sequence just that sound.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: view
    text: Holding a key and tapping `record` makes the step keys show only the steps where that note or sound is recorded.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: sequence
    text: While the key stays held, pressing steps sequences that one sound, even on steps that already carry other sounds.
    source: https://teenage.engineering/guides/op-xy/get-started#4.1%20sequencing%20a%20drum%20beat
  - id: direct
    text: Holding a key and pressing a step enters the same view directly, recording the note on that step.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: release
    text: Letting go of the key appears to end the view; TE's drum walkthrough just says to let go when done.
    source: https://teenage.engineering/guides/op-xy/get-started#4.1%20sequencing%20a%20drum%20beat
    confidence: derived
procedures:
  - id: one-sound
    goal: Program one drum sound without seeing the others
    steps:
      - keys: key + record → + steps
        note: keep the key held throughout
    source: https://teenage.engineering/guides/op-xy/get-started#4.1%20sequencing%20a%20drum%20beat
related: [sequencer.step-entry]
---

Made for drum tracks, where all 24 sounds share the same 16 steps: hold the hi-hat, set its steps,
let go, hold the snare, and so on. On melodic tracks it shows where one pitch is used.
