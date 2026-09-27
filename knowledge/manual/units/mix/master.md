---
id: mix.master
title: Master groups, compressor and output
aliases:
  [
    master,
    master level,
    output level,
    compressor,
    master compressor,
    percussion group,
    melodic group,
    limiter
  ]
area: mix
order: 50
context:
  modes: [mix]
  screens: [M4]
summary: Mix M4 sets the levels of the percussion and melodic groups, how much the master bus is compressed and the master level that feeds the output limiter.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: groups
    text: Every engine is routed to one of two groups automatically — percussive engines such as the drum sampler to the percussion group, the synth engines and the sampler to the melodic group.
    source: https://teenage.engineering/guides/op-xy/mix#master
  - id: compressor
    text: '`E3` compresses the master bus. Light settings even out loud and quiet moments; heavy settings squash the mix into a denser, harder-hitting sound.'
    source: https://teenage.engineering/guides/op-xy/mix#master
  - id: limiter
    text: '`E4` raises the master level on its way into the output limiter.'
    source: https://teenage.engineering/guides/op-xy/mix#master
  - id: no-cc
    text: No MIDI CC is known for the group levels or the compressor.
    source: docs/research/20-midi-control.md#33-instrument-tracks-18-synth-drum-sampler-multisampler-engines
    confidence: community
procedures:
  - id: open
    goal: Open the master page
    steps:
      - keys: mix → M4
    source: https://teenage.engineering/guides/op-xy/mix#master
parameters:
  - screen: M4
    encoder: E1
    layer: base
    name: percussion
    note: level of the percussion group
    source: https://teenage.engineering/guides/op-xy/mix#master
  - screen: M4
    encoder: E2
    layer: base
    name: melodic
    note: level of the melodic group
    source: https://teenage.engineering/guides/op-xy/mix#master
  - screen: M4
    encoder: E3
    layer: base
    name: compressor
    note: amount of master-bus compression
    source: https://teenage.engineering/guides/op-xy/mix#master
  - screen: M4
    encoder: E4
    layer: base
    name: master level
    note: drive into the output limiter
    source: https://teenage.engineering/guides/op-xy/mix#master
related: [mix.overview, mix.saturator, mix.eq]
---

The master page is the last stop before the output. The two group levels balance drums against
everything else without touching single tracks; the compressor glues the mix or flattens it for a
heavier sound; and the master level pushes the result into the limiter that guards the output.
