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
summary: "`M3` is the track's filter: cutoff, resonance, filter-envelope amount and key tracking. `shift + M3` changes the filter type; factory presets use z lowpass, ladder, svf and z hipass."
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: purpose
    text: The filter takes away part of the frequency range and can emphasise the frequencies around its cutoff.
    source: https://teenage.engineering/guides/op-xy/instrument#filter
  - id: type
    text: '`shift + M3` opens the choice of filter types, each with its own character.'
    source: https://teenage.engineering/guides/op-xy/instrument#filter
  - id: type-names
    text: The guide names no filter types; factory presets use four — z lowpass, ladder, svf and z hipass — and more may exist.
    source: docs/research/30-presets-samples.md#25-fx-m3-filter-and-lfo-m4
    confidence: community-verified
  - id: on-off
    text: Presets also store whether the filter is switched on at all; the guide does not describe how to toggle it.
    source: docs/research/30-presets-samples.md#25-fx-m3-filter-and-lfo-m4
    confidence: community-verified
  - id: midi-ccs
    text: Over MIDI, CC32–35 reach cutoff, resonance, envelope amount and key tracking; no CC is known for the filter type.
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
