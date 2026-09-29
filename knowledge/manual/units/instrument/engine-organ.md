---
id: instrument.engine-organ
title: Organ synth engine
aliases: [organ, organ engine, combo organ, church organ, transistor organ]
area: instrument
order: 50
context:
  modes: [instrument]
  screens: [M1]
summary: An organ engine that spans transistor combos to church organs; its `M1` page sets organ type, bass, tremolo amount and tremolo speed.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: character
    text: Organ covers a wide spread of organ sounds, from transistor instruments to church organs, chosen with the type control.
    source: https://teenage.engineering/guides/op-xy/synth-engines#organ
  - id: picture
    text: Organ's picture is four drawbars, each with a scale from 8 to 1 and an icon on its cap; each encoder slides one drawbar, and the bars glide into place.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: type
    note: organ model
    cc: 12
    source: https://teenage.engineering/guides/op-xy/synth-engines#organ
  - screen: M1
    encoder: E2
    layer: base
    name: bass
    note: adds or removes low end
    cc: 13
    source: https://teenage.engineering/guides/op-xy/synth-engines#organ
  - screen: M1
    encoder: E3
    layer: base
    name: tremolo amount
    note: depth of the volume wobble
    cc: 14
    source: https://teenage.engineering/guides/op-xy/synth-engines#organ
  - screen: M1
    encoder: E4
    layer: base
    name: tremolo speed
    note: slow swells ↔ fast, dizzy wobble
    cc: 15
    source: https://teenage.engineering/guides/op-xy/synth-engines#organ
related: [instrument.engine, instrument.lfo-tremolo]
---

Organ is a quick route to a whole family of sounds: type swaps the organ model, bass adds weight, and
the built-in tremolo gives the familiar pulsing movement — slow for gentle swells, fast for a
shimmer. Because the tremolo lives on `M1`, the `M4` LFO stays free for something else. Load it from the preset browser,
`shift + M1`.
