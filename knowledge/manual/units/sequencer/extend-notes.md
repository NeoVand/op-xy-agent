---
id: sequencer.extend-notes
title: Extended notes and note length
aliases: [extend a note, long note, tie, note duration, overlap, gate length]
area: sequencer
order: 20
context:
  modes: [instrument, auxiliary]
summary: Hold a step and press a later step to stretch its notes up to there; pressing the later step again switches between "full step" and "overlap". Other step-entered notes take the bar menu's note length.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.45']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: extend
    text: Holding a step and pressing a later step stretches the step's note or chord until the later step; this is how chords and pads span several steps.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: ending
    text: Pressing that end step a second time switches the note between two endings, "full step" and "overlap".
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
    firmware_min: '1.0.45'
  - id: overlap-meaning
    text: TE does not define them; presumably "full step" stops at the step boundary and "overlap" runs into the next step, which matters for legato and glides.
    source: https://teenage.engineering/downloads/op-xy#1.0.45
    firmware_min: '1.0.45'
    confidence: derived
  - id: default-length
    text: Notes placed by pressing steps take their length from `bar + turn E2`; live-recorded and extended notes keep their own.
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: default-50
    text: In a new project that setting reads 50, about half a step, according to decoded project files.
    source: docs/research/10-xy-format.md#34-patternstruct-base-clones-walking
    confidence: community-verified
procedures:
  - id: extend
    goal: Make a note last several steps
    steps:
      - keys: step n + step m
        note: press the step where the note should end; press it again to switch the ending
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
related: [sequencer.bar-menu, sequencer.component-pulse-hold, instrument.play-mode]
---

The bar menu's length suits drums and plucked lines; anything that has to sustain is better stretched
note by note. Pulse hold is related but also pauses the track.
