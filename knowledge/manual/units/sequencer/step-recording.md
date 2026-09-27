---
id: sequencer.step-recording
title: Step recording
aliases: [step record, step input, record while stopped]
area: sequencer
order: 12
context:
  modes: [instrument, auxiliary]
summary: With the sequencer stopped, keep `record` held and play; each note lands on the next step, `record + [+]` leaves a rest and `record + [-]` goes back one step.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: start
    text: Holding `record` while playback is stopped starts step recording; the step 1 key turns red to mark where the next note goes.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-recording
  - id: fill
    text: Each note played while `record` stays held fills the step under the red cursor, which then moves on; filled steps light white.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-recording
  - id: rest
    text: '`record + [+]` moves the red cursor forward without writing anything.'
    source: https://teenage.engineering/guides/op-xy/sequencer#step-recording
  - id: back
    text: '`record + [-]` moves the cursor back one step; a sound already there plays and its key lights, ready to change.'
    source: https://teenage.engineering/guides/op-xy/sequencer#step-recording
  - id: remove
    text: Tapping a step you have recorded deletes it from the recording.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-recording
procedures:
  - id: record
    goal: Enter a line note by note
    preconditions: [playback is stopped]
    steps:
      - keys: record + keys
        note: each note takes the next step
    source: https://teenage.engineering/guides/op-xy/sequencer#step-recording
  - id: remove
    goal: Delete a step entered by mistake
    steps:
      - keys: record + step n
        note: TE only says to tap the step; keeping record held is our assumption
    source: https://teenage.engineering/guides/op-xy/sequencer#step-recording
    confidence: derived
related: [sequencer.step-entry, sequencer.live-recording, sequencer.clear-and-undo]
---

The quickest way to type in a line with a simple rhythm: notes fill consecutive steps in the order you
play them, with no need to keep time. Shape longer notes afterwards by extending them.
