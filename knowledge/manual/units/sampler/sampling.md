---
id: sampler.sampling
title: Sampling with the sample key
aliases: [record a sample, sample key, sample mode, sampling threshold]
area: sampler
order: 10
context:
  screens: [sample]
summary: '`sample` opens a record page from any screen: pick the input, set gain and threshold, then `hold M1` to capture up to 20 seconds into the current sampler or the sample library.'
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.29']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: which-page
    text: On a sampler track, `sample` opens that engine's record page; on other tracks it records a stand-alone sample for the library.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - id: limit
    text: A sample can be at most 20 seconds long, in every sampler.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - id: threshold
    text: Holding `M1` arms the recorder; capture starts once the input passes the threshold.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - id: keep-or-bin
    text: '`M2` plays the take back; `M4` deletes it before it reaches the library.'
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - id: exit
    text: Pressing the lit track key closes the record page.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - id: mic
    text: The built-in microphone can be the source, so sampling needs no cable.
    source: https://teenage.engineering/products/op-xy
  - id: channel-since
    text: Picking the input channel for line in and USB arrived in OS 1.0.29.
    source: https://teenage.engineering/downloads/op-xy#1.0.28
    firmware_min: '1.0.29'
  - id: channel-conflict
    text: TE's audio-interface how-to picks the USB channel with `turn E2` instead; not yet checked on a unit.
    source: https://teenage.engineering/guides/op-xy/how-to#use-an-audio-interface-with-op-xy
    confidence: conflicting
procedures:
  - id: record
    goal: Record a sample into the library
    preconditions: [the selected track does not use a sampler engine]
    steps:
      - keys: sample
      - keys: hold M1
        note: after setting source, gain and threshold
    result: The take is saved to the library unless you press `M4`.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
parameters:
  - screen: sample
    encoder: E1
    layer: base
    name: source
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - screen: sample
    encoder: E1
    layer: shift
    name: input channel
    note: line in and USB only
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - screen: sample
    encoder: E3
    layer: base
    name: gain
    note: shown on the meter
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - screen: sample
    encoder: E4
    layer: base
    name: threshold
    source: https://teenage.engineering/guides/op-xy/sample#arrange
related: [sampler.overview, sampler.drum-sampler, sampler.sample-files]
---

The recorder waits for the sound, so set the threshold just above the room noise and the take
starts with the first note. On sampler tracks the page adds key handling: the synth sampler tunes to
the key you press; the drum sampler and multisampler record onto a selected key.
