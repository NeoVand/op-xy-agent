---
id: instrument.filter
title: Filter (M3)
aliases:
  [filter page, cutoff, resonance, filter type, lowpass, highpass, ladder filter, key tracking]
area: instrument
order: 30
context:
  modes: [instrument]
  screens: [M3]
summary: "`M3` is the track's filter: cutoff, resonance, filter-envelope amount and key tracking. `shift + M3` picks one of four types — ladder, svf, z hipass or z lowpass — and then returns to `M1`."
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: purpose
    text: The filter takes away part of the frequency range and can emphasise the frequencies around its cutoff.
    source: https://teenage.engineering/guides/op-xy/instrument#filter
  - id: type
    text: '`shift + M3` opens the choice of filter types, each with its own character.'
    source: https://teenage.engineering/guides/op-xy/instrument#filter
  - id: type-names
    text: The type list, headed with the track number and the word filter, offers ladder, svf, z hipass and z lowpass, the current one boxed.
    source: docs/research/59-screen-profiling.md#23-filter-instrument-m3
    confidence: verified
    verified_on: '1.1.33'
  - id: type-return
    text: Picking a type takes you back to the engine page (`M1`); `M3` then shows the new type.
    source: docs/research/59-screen-profiling.md#23-filter-instrument-m3
    confidence: verified
    verified_on: '1.1.33'
  - id: on-off
    text: Presets also store whether the filter is switched on at all.
    source: docs/research/30-presets-samples.md#25-fx-m3-filter-and-lfo-m4
    confidence: community-verified
  - id: off
    text: With the filter off, the page is dimmed under an off box; pressing `M3` again switches the filter on.
    source: docs/research/59-screen-profiling.md#23-filter-instrument-m3
    confidence: verified
    verified_on: '1.1.33'
  - id: screen
    text: The page draws the filter's curve over tinted bands, with the type name at the top left, a frequency axis marked 50, 1k, 2k, 5k and 20kHz, and a small value box on the curve.
    source: docs/research/59-screen-profiling.md#23-filter-instrument-m3
    confidence: verified
    verified_on: '1.1.33'
  - id: drawn
    text: Cutoff slides the curve's slope along the axis, key tracking moves an arrow along the bottom from left to right, and a positive envelope amount adds a hatched ghost of the curve to its right; z hipass mirrors the drawing.
    source: docs/research/59-screen-profiling.md#23-filter-instrument-m3
    confidence: verified
    verified_on: '1.1.33'
  - id: midi-ccs
    text: Over MIDI, CC32–35 on the track's channel move cutoff, resonance, envelope amount and key tracking, and the page redraws as they arrive.
    source: docs/research/59-screen-profiling.md#3-midi-reach-on-1133-verified-on-screen
    confidence: verified
    verified_on: '1.1.33'
  - id: no-type-cc
    text: No MIDI CC is known for the filter type.
    source: docs/research/20-midi-control.md#33-instrument-tracks-18-synth-drum-sampler-multisampler-engines
    confidence: community-verified
procedures:
  - id: type
    goal: Change the filter type of the selected track
    preconditions: [instrument mode, the track is selected]
    steps:
      - keys: shift + M3
        note: opens the filter types
    source: https://teenage.engineering/guides/op-xy/instrument#filter
parameters:
  - screen: M3
    encoder: E1
    layer: base
    name: cutoff
    note: frequency where the filter acts
    cc: 32
    source: https://teenage.engineering/guides/op-xy/instrument#filter
  - screen: M3
    encoder: E2
    layer: base
    name: resonance
    note: peak at the cutoff that exaggerates the filter
    cc: 33
    source: https://teenage.engineering/guides/op-xy/instrument#filter
  - screen: M3
    encoder: E3
    layer: base
    name: envelope amount
    note: how far the M2 filter envelope sweeps the cutoff
    cc: 34
    source: https://teenage.engineering/guides/op-xy/instrument#filter
  - screen: M3
    encoder: E4
    layer: base
    name: key tracking
    note: ties the cutoff to the pitch of each note
    cc: 35
    source: https://teenage.engineering/guides/op-xy/instrument#filter
related: [instrument.envelopes, instrument.track-sends, instrument.lfo]
---

The filter is a track's main tone control. Lower the cutoff to darken a sound, add resonance for a
sharper edge, and raise envelope amount so the filter envelope sweeps the cutoff on every note — the
classic plucky bass. The shift layer of this page holds the track's sends, not filter settings.
