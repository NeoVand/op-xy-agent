---
id: sampler.synth-sampler
title: Synth sampler
aliases: [sampler engine, one shot synth sampler, loop points, loop type]
area: sampler
order: 20
context:
  modes: [instrument]
  screens: [M1]
summary: Plays one sample across the keyboard; `M1` sets start, loop and end points, and its shift layer sets direction, tune, loop crossfade, gain and loop type.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.0']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: record-key
    text: On the synth sampler's record page, pressing a key starts sampling, and that key becomes the note the sample is tuned to.
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
  - id: fine
    text: Pushing the encoder in while moving one of the four points gives finer steps.
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
  - id: no-loop
    text: Loop start at the very end of the sample means no loop.
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
  - id: loop-types
    text: Loop forever keeps cycling after release, loop until release stops cycling when you let go, loop off plays straight through.
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
  - id: defaults
    text: After sampling on the unit, the loop runs from 20 % to 80 % of the sample, set to loop forever.
    source: docs/research/30-presets-samples.md#27-region-fields-by-type
    confidence: community-verified
  - id: ranges
    text: Tune works in cents; sample gain spans −30 to +20 dB.
    source: docs/research/30-presets-samples.md#27-region-fields-by-type
    confidence: community-verified
  - id: p-locks
    text: Synth sampler settings accept parameter locks.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
    firmware_min: '1.1.0'
  - id: screen
    text: The page shows an overview strip of the sample on top (base layer only), the left and right waveforms, and start, loop and end markers.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
  - id: shift-screen
    text: With `shift` held it shows direction, tune as a note symbol and a value such as −12.00, crossfade as a percentage drawn as a dark wedge at the loop, and gain.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
  - id: no-cc
    text: CC12–15 on the track's channel move nothing on this page.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
  - id: crossfade-range
    text: 'Loop crossfade runs from 0 to 75 %, drawn as a dark wedge sloping down into the loop end over that share of the loop.'
    source: docs/research/60-sound-session.md#5-samplers
    confidence: verified
    verified_on: '1.1.33'
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: sample start
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
  - screen: M1
    encoder: E2
    layer: base
    name: loop start
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
  - screen: M1
    encoder: E3
    layer: base
    name: loop end
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
  - screen: M1
    encoder: E4
    layer: base
    name: sample end
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
  - screen: M1
    encoder: E1
    layer: shift
    name: direction
    range: forward / backward
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
  - screen: M1
    encoder: E2
    layer: shift
    name: tune
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
  - screen: M1
    encoder: E3
    layer: shift
    name: loop crossfade
    note: smooths the loop, e.g. for pads
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
  - screen: M1
    encoder: E4
    layer: shift
    name: sample gain
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
  - screen: M1
    encoder: E3
    layer: shift-click
    name: loop type
    range: loop forever / loop until release / loop off
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
related: [sampler.overview, sampler.sampling, sampler.multisampler]
---

TE's guide calls it the one shot synth sampler. Loop forever suits drones and pads, loop until
release leaves a natural tail when you let go, and loop off makes the sample a one-shot.
