---
id: sequencer.clear-and-undo
title: Clearing a sequence and undo
aliases: [clear a track, erase a track, clear a pattern, clear parameter locks, undo]
area: sequencer
order: 35
context:
  modes: [instrument, auxiliary]
summary: '`record + hold stop` wipes the current track; `bar + M1` clears only notes, `bar + M2` only parameter locks, `bar + M4` both; `shift + record` undoes the last change.'
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.15']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: track
    text: Holding `record` and `stop` until the step LEDs fill red clears everything recorded on the current track.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: track-locks
    text: That clear takes the parameter locks as well; OS 1.0.15 fixed it leaving them behind.
    source: https://teenage.engineering/downloads/op-xy#1.0.15
    firmware_min: '1.0.15'
  - id: step-rec
    text: The same gesture clears the track during step recording.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-recording
  - id: bar-clears
    text: In the bar menu, `M1` deletes the pattern's notes but keeps its parameter locks, `M2` deletes the locks but keeps the notes, and `M4` deletes both.
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: undo
    text: '`shift + record` undoes the last change; there is one undo level and not every action can be undone.'
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
procedures:
  - id: clear-track
    goal: Wipe the current track
    steps:
      - keys: record + hold stop
        note: until the whole step row is red
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: clear-part
    goal: Clear only the notes, only the locks, or both
    steps:
      - keys: bar + M1/M2/M4
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: undo
    goal: Undo the last change
    steps:
      - keys: shift + record
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
related: [sequencer.parameter-locks, sequencer.bar-menu]
---

`bar + M1` keeps a filter movement while you record a new melody over it; `bar + M2` keeps the notes
but drops the automation. Save a project version before a big clear.
