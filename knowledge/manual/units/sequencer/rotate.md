---
id: sequencer.rotate
title: Shifting a sequence (rotate)
aliases: [sequence shift, rotate trigs, rotate pattern, offset a pattern]
area: sequencer
order: 26
context:
  modes: [instrument, auxiliary]
summary: Hold a track key and press `[-]` or `[+]` to slide that track's whole sequence by one step, wrapping at the ends. Added in OS 1.1.15; since 1.1.21 step components and parameter locks move too.
status: outdated-in-guide
firmware:
  min: '1.1.15'
  changed_in: ['1.1.21']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: shift
    text: Holding a track key and pressing `[-]` or `[+]` moves that track's whole sequence by one step, the two keys choosing the direction.
    source: https://teenage.engineering/guides/op-xy/sequencer#rotate-trigs-functionality
  - id: wrap
    text: Notes pushed past the end of the sequence come back in at its start.
    source: https://teenage.engineering/guides/op-xy/sequencer#rotate-trigs-functionality
  - id: added
    text: Rotating arrived with OS 1.1.15.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
  - id: carries
    text: Since OS 1.1.21 step components and parameter locks travel with their notes; the guide mentions only notes.
    source: https://teenage.engineering/downloads/op-xy#1.1.21
    firmware_min: '1.1.21'
  - id: whole-pattern
    text: The rotation covers the whole pattern length, not only the bar on screen, according to decoded project files.
    source: docs/research/10-xy-format.md#39-p-locks-and-automation
    confidence: community
procedures:
  - id: rotate
    goal: Slide a track's sequence by one step
    steps:
      - keys: Tn + [-]/[+]
    source: https://teenage.engineering/guides/op-xy/sequencer#rotate-trigs-functionality
related: [sequencer.transpose-sequence, sequencer.nudge]
---

A quick way to hear a part in a new place, such as moving a hi-hat figure from on-beat to off-beat.
On 1.1.15–1.1.18 locks and components stayed behind on their old steps.
