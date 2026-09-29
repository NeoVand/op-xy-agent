---
id: mix.saturator
title: Master saturator
aliases: [saturator, saturation, master saturation, clip, master drive, warmth]
area: mix
order: 40
context:
  modes: [mix]
  screens: [M3]
summary: Mix `M3` is a saturator on the master bus; gain drives it, clip shaves off loud peaks, tone filters highs or lows and mix sets how much of it you hear.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: master
    text: The saturator on mix `M3` works on the master, so it colours the whole mix.
    source: https://teenage.engineering/guides/op-xy/mix#saturator
  - id: clip
    text: Clip (`E2`) flattens the loudest peaks, reining in the dynamics.
    source: https://teenage.engineering/guides/op-xy/mix#saturator
  - id: mix
    text: Mix (`E4`) sets how much of the saturated signal you hear in the master.
    source: https://teenage.engineering/guides/op-xy/mix#saturator
  - id: no-cc
    text: No MIDI CC is known for the master saturator.
    source: docs/research/20-midi-control.md#33-instrument-tracks-18-synth-drum-sampler-multisampler-engines
    confidence: community
  - id: screen
    text: The saturator page shows four vertical tick ladders — gain, clip, tone and mix from left to right — each topped by a cap in its encoder's style.
    source: docs/research/59-screen-profiling.md#210-mixer
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: open
    goal: Open the master saturator
    steps:
      - keys: mix → M3
    source: https://teenage.engineering/guides/op-xy/mix#saturator
parameters:
  - screen: M3
    encoder: E1
    layer: base
    name: gain
    note: level driven into the saturator
    source: https://teenage.engineering/guides/op-xy/mix#saturator
  - screen: M3
    encoder: E2
    layer: base
    name: clip
    note: trims loud peaks
    source: https://teenage.engineering/guides/op-xy/mix#saturator
  - screen: M3
    encoder: E3
    layer: base
    name: tone
    note: filters out highs or lows
    source: https://teenage.engineering/guides/op-xy/mix#saturator
  - screen: M3
    encoder: E4
    layer: base
    name: mix
    note: amount of saturation in the master
    source: https://teenage.engineering/guides/op-xy/mix#saturator
related: [mix.overview, mix.eq, mix.master, fx.distortion]
---

The saturator adds density and warmth to the finished mix. Gain drives it, clip keeps peaks in check
and tone tilts the result darker or brighter; mix blends it with the clean signal, so heavy settings
work in small doses. It sits after the EQ and before the compressor.
