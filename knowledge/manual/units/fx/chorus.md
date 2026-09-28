---
id: fx.chorus
title: Chorus effect
aliases: [chorus, chorus fx, ensemble, widening]
area: fx
order: 10
context:
  modes: [auxiliary]
  screens: [M1]
summary: A chorus for FX I or FX II that layers pitch-wobbled copies over the sound to widen it; M1 sets rate, depth, feedback and stereo width.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: what
    text: The chorus layers copies of the incoming sound whose pitch and timing drift a little against the original, which thickens and widens it; pushed far, the drift becomes an obvious effect.
    source: https://teenage.engineering/guides/op-xy/fx#chorus
  - id: feedback-echo
    text: High feedback settings turn the chorus into a short delay with wobbling pitch.
    source: https://teenage.engineering/guides/op-xy/fx#chorus
  - id: labels
    text: The chorus's columns read rate, depth, feedback and stereo, as the guide names them.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: rate
    cc: 12
    note: speed of the pitch modulation
    source: https://teenage.engineering/guides/op-xy/fx#chorus
  - screen: M1
    encoder: E2
    layer: base
    name: depth
    cc: 13
    note: how far the pitch is modulated
    source: https://teenage.engineering/guides/op-xy/fx#chorus
  - screen: M1
    encoder: E3
    layer: base
    name: feedback
    cc: 14
    note: how much of the output returns into the chorus
    source: https://teenage.engineering/guides/op-xy/fx#chorus
  - screen: M1
    encoder: E4
    layer: base
    name: stereo
    cc: 15
    note: width of the chorus image
    source: https://teenage.engineering/guides/op-xy/fx#chorus
related: [fx.overview, fx.phaser]
---

A chorus makes one voice sound like several by adding detuned, slightly late copies. Keep rate and
depth low for a subtle widening of pads and keys; raise them for seasick vibrato. Feedback adds
resonance and, at the top of its range, a pitch-wobbling echo. Stereo decides how far the copies
spread across the field.
