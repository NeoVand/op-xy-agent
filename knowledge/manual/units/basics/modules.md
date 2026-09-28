---
id: basics.modules
title: Module pages (M1–M4)
aliases: [modules, module keys, pages, sub modes, shift layer, extra parameters]
area: basics
order: 20
context:
  modes: [instrument, auxiliary, mix]
  screens: [M1, M2, M3, M4]
summary: In instrument, auxiliary and mix mode the keys M1–M4 under the screen open four pages (modules), and the encoders edit what the open page shows. Arrange has no modules.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Every main mode except arrange splits its controls into four modules, opened with the keys printed 1 to 4 under the screen (`M1`…`M4`).
    source: https://teenage.engineering/guides/op-xy/main-modes#5.2%20modules
  - id: encoders
    text: On a module page, `E1`…`E4` edit the parameters shown for the selected track.
    source: https://teenage.engineering/guides/op-xy/main-modes#5.2%20modules
  - id: shift-layer
    text: Pages with more than four parameters show the rest while `shift` is held.
    source: https://teenage.engineering/guides/op-xy/main-modes#5.2%20modules
  - id: instrument-pages
    text: On instrument tracks the pages are engine (M1), envelopes (M2), filter (M3) and LFO (M4); `shift + M1`, `shift + M3` and `shift + M4` choose the engine, filter type and LFO type.
    source: https://teenage.engineering/guides/op-xy/instrument
  - id: aux-pages
    text: Auxiliary tracks use the pages their own way; on the brain track, M1 sets key and scale and M2 routes tracks into it.
    source: https://teenage.engineering/guides/op-xy/auxiliary#brain
  - id: mix-pages
    text: In mix mode, M1 holds levels, pans and sends per track, M2 the master EQ, M3 the master saturator and M4 the master section.
    source: https://teenage.engineering/guides/op-xy/mix
  - id: encoder-marks
    text: On screen, each parameter carries a small dot or cap in its encoder's shade — dark for `E1`, mid grey for `E2`, light grey for `E3`, white for `E4` — so a glance tells which knob moves what.
    source: docs/research/59-screen-profiling.md#2-what-the-screens-show
    confidence: verified
    verified_on: '1.1.33'
  - id: popups
    text: Brief popups, such as the octave card or the mixer's send display, sit over the page and fade away on their own after a second or two.
    source: docs/research/59-screen-profiling.md#21-general
    confidence: verified
    verified_on: '1.1.33'
  - id: slide
    text: On some auxiliary tracks the next page slides in sideways — the brain's routing page from its `M1`, and the external MIDI track's CC pages from `M1` to `M2` to `M3`.
    source: docs/research/59-screen-profiling.md#21-general
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: shift-params
    goal: Edit a page's shift-layer parameters
    steps:
      - keys: shift + turn E1…E4
    source: https://teenage.engineering/guides/op-xy/main-modes#5.2%20modules
related: [basics.main-modes, instrument.engine-prism, sequencer.parameter-locks]
---

The mode decides what the pages are about and the track keys which track they edit. Any module-page
parameter of an instrument or auxiliary track can be parameter-locked per step.
