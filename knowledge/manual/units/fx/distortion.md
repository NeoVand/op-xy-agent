---
id: fx.distortion
title: Distortion effect
aliases: [distortion, overdrive, drive, clipping, dirt]
area: fx
order: 30
context:
  modes: [auxiliary]
  screens: [M1]
summary: A clipping distortion for FX I or FX II; `M1` sets the drive into it, the clipping amount and low and high cuts that shape what enters it.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: what
    text: The distortion clips the signal it receives, adding grit and harmonics.
    source: https://teenage.engineering/guides/op-xy/fx#distorsion
  - id: pre-filters
    text: Low cut (`E3`) and high cut (`E4`) act on the input, trimming bass and treble before the clipping rather than after it.
    source: https://teenage.engineering/guides/op-xy/fx#distorsion
  - id: labels
    text: The unit lists the effect as dist, and its columns read drive, clip, lo cut and hi cut — the guide's amount is labelled clip.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: drive
    cc: 12
    note: level going into the distortion
    source: https://teenage.engineering/guides/op-xy/fx#distorsion
  - screen: M1
    encoder: E2
    layer: base
    name: clip
    cc: 13
    note: how hard the signal is clipped; the guide calls it amount
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - screen: M1
    encoder: E3
    layer: base
    name: low cut
    cc: 14
    note: how much bass reaches the distortion
    source: https://teenage.engineering/guides/op-xy/fx#distorsion
  - screen: M1
    encoder: E4
    layer: base
    name: high cut
    cc: 15
    note: how much treble reaches the distortion
    source: https://teenage.engineering/guides/op-xy/fx#distorsion
related: [fx.overview, fx.lofi, mix.saturator]
---

Drive sets how hot the signal hits the distortion, clip how hard it is clipped. Because the two
cuts sit in front of the clipping, trimming the lows keeps bass from turning to mud, and trimming
the highs gives a darker, smoother crunch. As a send, it lets you add dirt to a drum bus or a lead
by degrees while the dry track stays clean.
