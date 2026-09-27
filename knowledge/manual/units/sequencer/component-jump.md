---
id: sequencer.component-jump
title: Jump (step component)
aliases: [jump, go to step, playhead jump, loop inside a pattern]
area: sequencer
order: 52
context:
  modes: [instrument, auxiliary]
summary: Step component on `natural 11` that sends the playhead from a step to another one.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.50']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Jump overrides the order of steps, sending the playhead from this step to a chosen one instead of the next in line.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: values
    text: '1–4 go to step 1, 5, 9 or 13; 5 one step forward; 6 one step back; 7 forward or back; 8 stay on the step; 9 align the track position; 0 a random step.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: align
    text: Align presumably returns the track to where it would be without jumps, in line with the other tracks.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
    confidence: derived
  - id: playing-bar
    text: Jumps land in the bar that is playing; OS 1.0.50 fixed them landing in the bar shown for editing.
    source: https://teenage.engineering/downloads/op-xy#1.0.50
    firmware_min: '1.0.50'
    confidence: derived
procedures:
  - id: back-to-one
    goal: Send the playhead back to step 1 from chosen steps
    steps:
      - keys: shift + steps → + natural 11 → + accidental 1
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
related: [sequencer.bars-and-length, sequencer.step-component-reference]
---

Jumping back to step 1 halfway through shortens one track's loop; a random target makes a part
reshuffle itself as it plays.
