---
id: sampler.sampling
title: Sampling with the sample key
aliases:
  [record a sample, sample key, sample mode, sampling threshold, record page, arm the recorder]
area: sampler
order: 10
context:
  screens: [sample]
summary: '`sample` opens a record page from any screen: set source, gain and threshold, then arm the recorder — `hold M1` on the library page, a key and then `hold M1` on the drum sampler and multisampler, a keyboard key on the synth sampler. The take starts once the input passes the threshold.'
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
  - id: arm
    text: On the library record page (a track without a sampler engine), holding `M1` arms the recorder.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - id: threshold
    text: Every record page has a threshold on `E4`, the level at which recording begins, so arming alone does not start the take; it starts when the input rises past that level.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - id: arm-keyed
    text: On the drum sampler and multisampler record pages you first press the keyboard key the take should go to (it lights up), then `hold M1`.
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - id: arm-synth
    text: The synth sampler's record page starts sampling from a keyboard key, which also becomes the sample's root note; the guide gives that page no `M1` gesture.
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
  - id: end
    text: The guide does not say what ends a take before the 20-second limit, such as whether letting go of `M1` stops it; not yet checked on a unit.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - id: meter
    text: The level meter previews the input while you set the gain, and TE's pictures draw the threshold as an orange line across it.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
    confidence: derived
  - id: keep-or-bin
    text: On the library record page, `M2` plays the take back and `M4` deletes it before it reaches the library.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - id: where
    text: A stand-alone take should land in the library's user folder (samples → user over MTP). The sample chapter says only that it goes to the library, but TE's load-samples how-to names user as the folder for samples recorded on the unit; not yet checked on a unit.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-load-samples
    confidence: derived
  - id: exit
    text: Pressing the lit track key closes the record page.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - id: sources
    text: The sources TE documents for the sample page are the built-in mic, line in and USB; the guide names line in and USB as the ones with an input channel and draws the page with the mic selected.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - id: not-t5-inputs
    text: Headset and main output belong to the external audio track's input list (`T5`); the guide never offers them on the sample page, and the page's full list has not been checked on a unit.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-audio
    confidence: derived
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
      - keys: turn E1
        note: the source; `shift + turn E1` picks the channel of line in or USB
      - keys: turn E3
        note: the gain, watching the level meter
      - keys: turn E4
        note: the threshold, just above the room's noise
      - keys: hold M1
        note: arms the recorder; the take starts when the sound passes the threshold
      - keys: M2
        note: listen back; `M4` throws the take away instead
    result: The take is saved to the library (by TE's how-to, in its user folder) unless you press `M4`.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
parameters:
  - screen: sample
    encoder: E1
    layer: base
    name: source
    range: mic / line in / USB
    note: the documented sources; headset and main output are inputs of the external audio track, not of this page
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
    note: the input level at which an armed recorder starts the take
    source: https://teenage.engineering/guides/op-xy/sample#arrange
related:
  [
    sampler.overview,
    sampler.synth-sampler,
    sampler.drum-sampler,
    sampler.multisampler,
    sampler.sample-files,
    sampler.sample-library,
    auxiliary.external-audio
  ]
---

Every record page runs in the same order: choose the source, set the gain against the meter, put
the threshold just above the room noise, then arm. Arming only readies the recorder; the take
begins with the first sound that passes the threshold, so it starts on the note rather than on
silence. Each engine's unit has its own key handling.
