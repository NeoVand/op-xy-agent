---
id: sequencer.bar-menu
title: Bar menu
aliases:
  [
    bar page,
    bar screen,
    quantise,
    quantize,
    quantisation,
    note length,
    track groove,
    lock smoothing
  ]
area: sequencer
order: 60
context:
  modes: [instrument, auxiliary]
  screens: [bar]
summary: Holding `bar` shows the selected track's pattern settings; the encoders set quantisation, note length, groove and lock smoothing, and other keys handle bars, track scale, length and clearing.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.15', '1.1.25']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: held
    text: The bar page stays on screen only while `bar` is held; `shift + bar` pins it until you press `bar` again.
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: quantise-default
    text: In a new project quantisation reads 100, according to decoded project files.
    source: docs/research/10-xy-format.md#34-patternstruct-base-clones-walking
    confidence: community-verified
  - id: odd-grid
    text: Since OS 1.1.25, tracks with an odd track scale (3, 5, 6 or 7) quantise to a grid made for that scale.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
  - id: groove-type
    text: The groove type (shuffle, bombora and the rest) is picked on the tempo page; the bar menu sets only this track's amount.
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: per-pattern
    text: Decoded project files store length, track scale, quantisation, groove and smoothing in each pattern, so a track's patterns can differ.
    source: docs/research/10-xy-format.md#34-patternstruct-base-clones-walking
    confidence: community-verified
procedures:
  - id: adjust
    goal: Change a pattern-wide setting
    steps:
      - keys: bar + turn E1…E4
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
parameters:
  - screen: bar
    encoder: E1
    layer: base
    name: quantisation
    note: pulls live-recorded notes onto the steps; at 100 nothing can be nudged
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - screen: bar
    encoder: E1
    layer: click
    name: quantisation on/off
    note: 1.1.15 added a click that toggles quantisation; that it is this encoder is assumed
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
    confidence: derived
  - screen: bar
    encoder: E2
    layer: base
    name: note length
    note: for notes entered by pressing steps
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - screen: bar
    encoder: E3
    layer: base
    name: groove
    note: this track's amount; replaces the tempo page's swing
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - screen: bar
    encoder: E4
    layer: base
    name: shape
    default: no smoothing
    note: smooths between parameter locks and recorded automation
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
related: [sequencer.track-scale, sequencer.bars-and-length, sequencer.clear-and-undo]
---

Everything here acts on the whole pattern, whereas step edits and locks act on single steps. The
keys handle structure — `[+]` and `[-]` add and remove bars, black keys set the track scale, step
keys set the length, `M1`, `M2` and `M4` clear — while the encoders handle feel.
