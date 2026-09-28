---
id: instrument.engine-dissolve
title: Dissolve synth engine
aliases: [dissolve, dissolve engine, noise synth, tonal noise]
area: instrument
order: 50
context:
  modes: [instrument]
  screens: [M1]
summary: A tonal-noise engine for airy ambient pads and bright, gritty leads; its M1 page sets swarm (noise modulation), AM, FM and detune.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: character
    text: Dissolve mixes noise into pitched oscillators, which suits ambient pads and bright, rough-edged leads.
    source: https://teenage.engineering/guides/op-xy/synth-engines#dissolve
  - id: picture
    text: Dissolve fills the screen with a mosaic of squares, re-dealt many times a second while notes sound and frozen when they stop; am raises the share of lit squares, fm lifts the brightest grey to white and swarm evens the greys.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: swarm
    note: noise modulating the oscillators
    cc: 12
    source: https://teenage.engineering/guides/op-xy/synth-engines#dissolve
  - screen: M1
    encoder: E2
    layer: base
    name: am
    note: amplitude modulation, for grit
    cc: 13
    source: https://teenage.engineering/guides/op-xy/synth-engines#dissolve
  - screen: M1
    encoder: E3
    layer: base
    name: fm
    note: frequency modulation, for more tonal colour
    cc: 14
    source: https://teenage.engineering/guides/op-xy/synth-engines#dissolve
  - screen: M1
    encoder: E4
    layer: base
    name: detune
    note: slight pitch offsets between oscillators, for a fuller sound
    cc: 15
    source: https://teenage.engineering/guides/op-xy/synth-engines#dissolve
related: [instrument.engine]
---

Dissolve starts from oscillators and lets noise eat into them. Little swarm keeps a clear pitch with
a breath of air; a lot turns the tone into textured noise that still follows the keys. AM roughens,
FM adds harmonics, detune widens. Pair it with slow envelopes for pads or a short amp envelope for
noisy plucks. Load it with `shift + M1`.
