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
  verified_on: '1.1.33'
facts:
  - id: held
    text: The bar page stays on screen only while `bar` is held; `shift + bar` pins it until you press `bar` again.
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: quantise-default
    text: In a new project the card reads quant 100, length 50 and track scale 1, with groove shown as a dash and shape as a small step symbol.
    source: docs/research/59-screen-profiling.md#28-bar-steps
    confidence: verified
    verified_on: '1.1.33'
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
  - id: card
    text: Holding `bar` lays a white card over the dimmed page — bar numbers 1 to 4 along the top with the current one inverted, the track scale beside them, then rows for quant, length, groove and shape, each marked with its encoder's dot. The card fades when `bar` is let go.
    source: docs/research/59-screen-profiling.md#28-bar-steps
    confidence: verified
    verified_on: '1.1.33'
  - id: roll
    text: A faint mini piano roll on the right of the card shows a dash for each note in the shown bar, as long as the note.
    source: docs/research/59-screen-profiling.md#28-bar-steps
    confidence: verified
    verified_on: '1.1.33'
  - id: boxes-live
    text: With the card up, `bar + [+]` or `bar + [-]` adds or removes a bar box at once; the shown bar's box is filled and the other bars are outlined.
    source: docs/research/59-screen-profiling.md#28-bar-steps
    confidence: verified
    verified_on: '1.1.33'
  - id: clear-labels
    text: The card's footer names the clearing keys — clr notes on `M1`, clr params on `M2`, clr all on `M4`.
    source: docs/research/59-screen-profiling.md#28-bar-steps
    confidence: verified
    verified_on: '1.1.33'
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
