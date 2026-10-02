---
id: sequencer.nudge
title: Nudging steps off the grid
aliases: [nudge, micro timing, microtiming, off-grid, late note, early note]
area: sequencer
order: 22
context:
  modes: [instrument, auxiliary]
summary: Hold a step and press `[-]` or `[+]` to move its notes slightly earlier or later; this needs the track's quantisation below 100.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: how
    text: Holding a step and pressing `[-]` or `[+]` moves the step's notes earlier or later, off the step grid.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: speed
    text: Each press is a fine adjustment; keeping `[-]` or `[+]` held moves faster.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: quantise-rule
    text: Nudging only works while the track's quantisation (`bar + turn E1`) is below 100.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: quantise-at-playback
    text: Since a nudged note keeps its offset under quantisation below 100, quantisation most likely acts as notes play rather than when they are recorded, so lowering it after a take lets the take's own timing back in. Not checked on a unit.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
    confidence: derived
  - id: quantise-default
    text: Decoded project files show quantisation at 100 in a new project, so turn it down before nudging.
    source: docs/research/10-xy-format.md#34-patternstruct-base-clones-walking
    confidence: community-verified
procedures:
  - id: nudge
    goal: Move a step's notes slightly off the grid
    preconditions: [the track's quantisation is below 100]
    steps:
      - keys: step n + [-]/[+]
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
related: [sequencer.bar-menu, sequencer.rotate]
---

If `[-]` and `[+]` seem to do nothing while a step is held, quantisation is at 100. For the feel of a
whole track rather than single steps, use groove instead.
