---
id: instrument.engine-simple
title: Simple synth engine
aliases: [simple, simple engine, basic synth, pulse width, subtractive synth]
area: instrument
order: 50
context:
  modes: [instrument]
  screens: [M1]
summary: A basic engine for building leads and plucks quickly; its M1 page sets waveform shape, pulse width, noise and stereo spread.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: character
    text: Simple is meant for fast, basic patches, with leads and plucks as its strengths.
    source: https://teenage.engineering/guides/op-xy/synth-engines#simple
  - id: picture
    text: Simple's picture is an isometric glass jar on stacked slabs under a plain-text top bar; stereo splits the jar into two.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: shape
    note: oscillator waveform
    cc: 12
    source: https://teenage.engineering/guides/op-xy/synth-engines#simple
  - screen: M1
    encoder: E2
    layer: base
    name: pw
    note: pulse width
    cc: 13
    source: https://teenage.engineering/guides/op-xy/synth-engines#simple
  - screen: M1
    encoder: E3
    layer: base
    name: noise
    note: noise level, from buzzy leads to soft pads
    cc: 14
    source: https://teenage.engineering/guides/op-xy/synth-engines#simple
  - screen: M1
    encoder: E4
    layer: base
    name: stereo
    note: stereo spread of the oscillators
    cc: 15
    source: https://teenage.engineering/guides/op-xy/synth-engines#simple
related: [instrument.engine, instrument.filter]
---

Simple is the plain starting point: pick a waveform, narrow the pulse width for a hollow, nasal tone,
add noise for breath or buzz, and widen the stereo image. With the filter and envelopes doing most of
the shaping, it is the easiest engine to learn sound design on. Load it from the preset browser, `shift + M1`.
