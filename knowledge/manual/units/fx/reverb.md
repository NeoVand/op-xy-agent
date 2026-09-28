---
id: fx.reverb
title: Reverb effect
aliases: [reverb, reverberation, room, hall, space]
area: fx
order: 60
context:
  modes: [auxiliary]
  screens: [M1]
summary: A reverb for FX I or FX II, from a small room to a cathedral; M1 sets size, modulation, a tone filter and the dry/wet balance.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: what
    text: The reverb puts a sound in a space, anything from a small room to a cathedral. Use it to make a part stand out or to smooth the whole mix.
    source: https://teenage.engineering/guides/op-xy/fx#reverb
  - id: modulation
    text: Modulation (`E2`) adds a slowly swelling, chorus-like movement to the reverb.
    source: https://teenage.engineering/guides/op-xy/fx#reverb
  - id: labels
    text: The reverb's columns read size, mod, tone and dry, so `E3` is the tone control and `E4` the dry level.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: send-insert
    text: The dry/wet control (`E4`) moves smoothly between send-style use, where only the reverb returns, and insert-style use, where dry signal passes through as well.
    source: https://teenage.engineering/guides/op-xy/fx#reverb
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: size
    cc: 12
    note: room size, small room to cathedral
    source: https://teenage.engineering/guides/op-xy/fx#reverb
  - screen: M1
    encoder: E2
    layer: base
    name: modulation
    cc: 13
    note: chorus-like swell
    source: https://teenage.engineering/guides/op-xy/fx#reverb
  - screen: M1
    encoder: E3
    layer: base
    name: tone
    cc: 14
    note: darkens or brightens the reverb; the guide calls it rate
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - screen: M1
    encoder: E4
    layer: base
    name: dry
    cc: 15
    note: dry signal against the reverb; the guide calls it feedback
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
related: [fx.overview, fx.delay]
---

The reverb is the classic send: one instance on an FX track, with each track sending as much as it
needs. Size sets the space, modulation moves the tail and the tone control darkens or brightens it.
TE's guide names `E3` and `E4` rate and feedback; the screen calls them tone and dry, which matches
what they do.
