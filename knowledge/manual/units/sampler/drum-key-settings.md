---
id: sampler.drum-key-settings
title: Drum sampler key settings
aliases: [drum play mode, mute group, choke, drum pan, sample fade]
area: sampler
order: 35
context:
  modes: [instrument]
  screens: [M1]
summary: The drum sampler's M1 page shapes the selected key — tune, start, end and play mode, with direction, pan, fade and gain on the shift layer.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.45', '1.1.15']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: per-key
    text: The settings belong to the selected key, so every key keeps its own values.
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - id: play-modes
    text: Key plays only while held, oneshot always to the end, mute group is cut off by another mute-group key, loop repeats.
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - id: one-group
    text: A kit has a single mute group, so all mute-group keys choke each other — handy for open and closed hats.
    source: docs/research/30-presets-samples.md#27-region-fields-by-type
    confidence: community
  - id: choke-live
    text: The mute group applies across live and sequenced notes alike.
    source: https://teenage.engineering/downloads/op-xy#1.0.45
    firmware_min: '1.0.45'
  - id: ranges
    text: Pan runs from −100 to +100, sample fade from 0 to 99, sample gain from −30 to +20 dB.
    source: docs/research/30-presets-samples.md#26-regions-how-each-field-reaches-the-device-decoded
    confidence: community-verified
  - id: fade-drawn
    text: The screen draws the sample fade over the waveform.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: guide-errors
    text: The guide's texts for pan and sample fade describe tune and loop crossfade — copied from the synth sampler by mistake.
    source: docs/research/40-official-docs.md#53-te-errata-we-keep-verbatim-and-our-manual-must-not-copy
    confidence: derived
  - id: screen
    text: The page shows the selected key's waveform with the skipped parts tinted blue and start and end markers; tune reads as a note symbol and a signed value such as −16.10, moving in steps of 0.1, and play mode as one of four icons — an arrow to a bar, a plain arrow, an arrow with G, or a loop.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
  - id: shift-screen
    text: With `shift` held the page shows direction, pan as a bar from L to R, fade as a dark ramp drawn over the wave, and gain, which scales the drawn wave.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
  - id: no-cc
    text: CC12–15 on the track's channel move nothing on this page.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: tune
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - screen: M1
    encoder: E2
    layer: base
    name: sample start
    note: push in for finer steps
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - screen: M1
    encoder: E3
    layer: base
    name: sample end
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - screen: M1
    encoder: E4
    layer: base
    name: play mode
    range: key / oneshot / mute group / loop
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - screen: M1
    encoder: E1
    layer: shift
    name: direction
    range: forward / backward
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - screen: M1
    encoder: E2
    layer: shift
    name: pan
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - screen: M1
    encoder: E3
    layer: shift
    name: sample fade
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - screen: M1
    encoder: E4
    layer: shift
    name: sample gain
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
related: [sampler.drum-sampler, sampler.slicing]
---

Trim each hit with start and end, retune it, and pick its behaviour: oneshot for drums, key for
held sounds, loop for textures, mute group for sounds that should cut each other off.
