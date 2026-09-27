---
id: sampler.slicing
title: Slicing a sample across the keys
aliases: [slice mode, sample slicer, chop, transient slicing, tap slicing]
area: sampler
order: 40
context:
  modes: [instrument]
  screens: [M1]
summary: "On a drum sampler track, `key + M1` cuts that key's sample into slices spread over the keyboard — at its transients, into equal parts, or where you tap."
status: current
firmware:
  min: '1.1.0'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: since
    text: Slice mode arrived in OS 1.1.0.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
  - id: open
    text: On a drum sampler track, `key + M1` opens the slicer for that key's sample.
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
  - id: modes
    text: '`turn E1` chooses the mode: transient, even or tap.'
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
  - id: layout
    text: The slices fill the keyboard on their own and choke each other, so one slice sounds at a time.
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
  - id: max
    text: With one slice per key, a sample gives at most 24 slices.
    source: docs/research/30-presets-samples.md#32-counts-and-structure-limits
    confidence: derived
  - id: transient
    text: Transient mode cuts at the loudest hits; `turn E4` sets how many slices, and after pressing a slice's key `turn E2` and `turn E3` move its start and end.
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
  - id: even
    text: Even mode splits a section into equal parts; `turn E2` and `turn E3` set where the section starts and ends, `turn E4` the count.
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
  - id: tap
    text: In tap mode, tap `M1` to start the sample and again wherever a slice should begin; `M2` stops and lets the last slice run to the end.
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
  - id: tap-edit
    text: In tap mode, press a slice's key and `turn E2` to move its start (the previous slice's end); `shift + key` deletes that slice.
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
  - id: confirm
    text: The slicer screen offers cancel and done; which keys they sit on is not documented.
    source: docs/research/50-hardware-ui.md#33-page-catalogue
    confidence: derived
procedures:
  - id: slice-loop
    goal: Slice a drum loop at its hits
    preconditions: [the loop is on a key of a drum sampler track, M1 page]
    steps:
      - keys: key + M1
        note: hold the key with the loop
      - keys: turn E1
        note: transient
      - keys: turn E4
        note: number of slices
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
related: [sampler.drum-sampler, sampler.drum-key-settings]
---

Slicing turns one recording into a playable kit. Transient suits drums with clear hits, even suits
loops cut to the grid, and tap marks musical phrases by ear while the sample plays.
