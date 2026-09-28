---
id: instrument.engine-axis
title: Axis synth engine
aliases: [axis, axis engine, fm strings, fm synth]
area: instrument
order: 50
context:
  modes: [instrument]
  screens: [M1]
summary: An FM engine made for lush strings; its M1 page sets tone, the ratio of one oscillator (detune or fifths), wave shape and a built-in tremolo.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: character
    text: Axis is a frequency-modulation engine whose home ground is rich, full string sounds.
    source: https://teenage.engineering/guides/op-xy/synth-engines#axis
  - id: ratio-halves
    text: Ratio retunes one of the oscillators; values 0–50 detune it and 51–100 move it up in steps of a fifth.
    source: https://teenage.engineering/guides/op-xy/synth-engines#axis
  - id: picture
    text: Axis's picture is an isometric three-armed structure of cubes under a plain-text top bar; each encoder lengthens or reshapes one arm.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: tone
    note: darker ↔ brighter
    cc: 12
    source: https://teenage.engineering/guides/op-xy/synth-engines#axis
  - screen: M1
    encoder: E2
    layer: base
    name: ratio
    range: 0–100
    note: 0–50 detune, 51–100 fifths
    cc: 13
    source: https://teenage.engineering/guides/op-xy/synth-engines#axis
  - screen: M1
    encoder: E3
    layer: base
    name: shape
    note: wave shape of the oscillators
    cc: 14
    source: https://teenage.engineering/guides/op-xy/synth-engines#axis
  - screen: M1
    encoder: E4
    layer: base
    name: tremolo
    note: speed and depth of a volume wobble, on one control
    cc: 15
    source: https://teenage.engineering/guides/op-xy/synth-engines#axis
related: [instrument.engine, instrument.lfo-tremolo]
---

In an FM engine one oscillator modulates another, and the ratio between them sets the timbre. Keep
axis's ratio in the detune half for chorused, ensemble-like strings; move into the fifths half for
stacked, interval-rich tones. Tone controls brightness, and the built-in tremolo adds movement
without using the LFO. Load it from the preset browser, `shift + M1`.
