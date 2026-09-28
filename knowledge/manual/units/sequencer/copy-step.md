---
id: sequencer.copy-step
title: Copying and pasting steps
aliases: [copy a step, paste a step, duplicate a step]
area: sequencer
order: 28
context:
  modes: [instrument, auxiliary]
summary: Hold a step to copy its notes, step components and parameter locks, let go, then press an empty step to paste.
status: current
firmware:
  min: '1.0.13'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: copy
    text: Holding a step copies everything on it — notes, step components and parameter locks.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: paste
    text: After you let go, pressing an empty step pastes the copy onto it.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: since
    text: Copying by holding a step arrived in OS 1.0.13.
    source: https://teenage.engineering/downloads/op-xy#1.0.13
  - id: copied
    text: When a held step is copied, its number box on the screen adds the word copied.
    source: docs/research/59-screen-profiling.md#28-bar-steps
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: copy-paste
    goal: Copy one step to another
    steps:
      - keys: hold step n → step m
        note: the target must be empty
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
related: [sequencer.bars-and-length, arrange.patterns]
---

Repeats a finished hit — say a snare with a ratchet and a filter lock — without rebuilding it. For
larger chunks, duplicate a bar or copy the pattern in arrange mode.
