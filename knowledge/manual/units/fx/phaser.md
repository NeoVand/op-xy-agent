---
id: fx.phaser
title: Phaser effect
aliases: [phaser, phase shifter, phasing, sweep]
area: fx
order: 50
context:
  modes: [auxiliary]
  screens: [M1]
summary: A 12-pole phaser for FX I or FX II; `M1` sets the centre frequency of the sweep, its depth, its rate and the feedback.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: what
    text: The phaser blends filtered copies of the sound with the dry signal; where the two are out of phase they cancel, which carves moving notches into the spectrum.
    source: https://teenage.engineering/guides/op-xy/fx#phaser
  - id: poles
    text: The phaser is a 12-pole design with 12 notches.
    source: https://teenage.engineering/guides/op-xy/fx#phaser
  - id: feedback
    text: More feedback (`E4`) sends more of the phaser's output back into it, making the sweep ring and sing.
    source: https://teenage.engineering/guides/op-xy/fx#phaser
  - id: labels
    text: The phaser's columns read frequency, depth, rate and feedback, as the guide names them.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: frequency
    cc: 12
    note: centre frequency the sweep moves around
    source: https://teenage.engineering/guides/op-xy/fx#phaser
  - screen: M1
    encoder: E2
    layer: base
    name: depth
    cc: 13
    note: how far the sweep travels
    source: https://teenage.engineering/guides/op-xy/fx#phaser
  - screen: M1
    encoder: E3
    layer: base
    name: rate
    cc: 14
    note: sweep speed
    source: https://teenage.engineering/guides/op-xy/fx#phaser
  - screen: M1
    encoder: E4
    layer: base
    name: feedback
    cc: 15
    note: resonance of the notches
    source: https://teenage.engineering/guides/op-xy/fx#phaser
related: [fx.overview, fx.chorus]
---

A phaser gives a sound a slow, swirling motion. Frequency places the sweep, depth sets how far it
travels and rate how fast. With feedback low the effect is gentle; turned up it becomes a pronounced,
whistling resonance. It suits pads, chords and hi-hats.
