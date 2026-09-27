---
id: fx.lofi
title: Lofi effect
aliases: [lofi, lo-fi, bitcrusher, bit crusher, sample rate reduction, decimator]
area: fx
order: 40
context:
  modes: [auxiliary]
  screens: [M1]
summary: A bitcrusher for FX I or FX II; M1 sets the sample rate, bit depth, a quality control and drift, which spreads the result in stereo.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Lofi is a bitcrusher. It roughens a sound by lowering its sample rate and bit depth, for lo-fi styles or just extra grit.
    source: https://teenage.engineering/guides/op-xy/fx#lofi
  - id: quality
    text: The guide gives no detail about the quality control (`E3`) beyond its name.
    source: https://teenage.engineering/guides/op-xy/fx#lofi
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: rate
    cc: 12
    note: sample rate of the effect
    source: https://teenage.engineering/guides/op-xy/fx#lofi
  - screen: M1
    encoder: E2
    layer: base
    name: bits
    cc: 13
    note: bit depth (the guide says bitrate)
    source: https://teenage.engineering/guides/op-xy/fx#lofi
  - screen: M1
    encoder: E3
    layer: base
    name: quality
    cc: 14
    source: https://teenage.engineering/guides/op-xy/fx#lofi
  - screen: M1
    encoder: E4
    layer: base
    name: drift
    cc: 15
    note: stereo spread of the output
    source: https://teenage.engineering/guides/op-xy/fx#lofi
related: [fx.overview, fx.distortion]
---

Lofi degrades audio the digital way: fewer samples per second and fewer bits per sample. Small
amounts add a dusty edge to drums and keys; extreme settings turn anything into crunchy, aliased
noise. Drift widens the crushed signal across the stereo field. Sent from a few tracks at once, it
gives a whole mix a shared worn-out character.
