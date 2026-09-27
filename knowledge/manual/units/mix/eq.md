---
id: mix.eq
title: Master EQ
aliases: [eq, equalizer, equaliser, master equalizer, low mid high, eq blend]
area: mix
order: 30
context:
  modes: [mix]
  screens: [M2]
summary: Mix M2 is a three-band EQ on the master — low, mid, high — plus a blend that fades from flat to the set curve; clicking an encoder resets its band, and E4's click resets the whole EQ.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.15']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: master
    text: The EQ on mix `M2` shapes the whole mix, not individual tracks.
    source: https://teenage.engineering/guides/op-xy/mix#eq
  - id: bands
    text: '`E1`, `E2` and `E3` boost or cut the low, mid and high frequencies.'
    source: https://teenage.engineering/guides/op-xy/mix#eq
  - id: blend
    text: '`E4` fades between a flat response and the band settings: low values leave the mix neutral, high values apply the boosts and cuts in full.'
    source: https://teenage.engineering/guides/op-xy/mix#eq
  - id: reset
    text: Clicking `E1`, `E2` or `E3` resets that band; clicking `E4` resets every EQ value.
    source: https://teenage.engineering/guides/op-xy/mix#eq
    firmware_min: '1.1.15'
  - id: midi
    text: Over MIDI, CC90 controls the EQ, with the channel choosing the band — 1 low, 2 mid, 3 high, 4 blend; one community tool reports the blend channel not responding.
    source: docs/research/20-midi-control.md#31-global-ccs
    confidence: community-verified
procedures:
  - id: open
    goal: Open the master EQ
    steps:
      - keys: mix → M2
    source: https://teenage.engineering/guides/op-xy/mix#eq
  - id: reset-all
    goal: Flatten the EQ
    preconditions: [mix mode, M2]
    steps:
      - keys: click E4
    source: https://teenage.engineering/guides/op-xy/mix#eq
    firmware_min: '1.1.15'
parameters:
  - screen: M2
    encoder: E1
    layer: base
    name: low
    note: boost or cut the lows
    source: https://teenage.engineering/guides/op-xy/mix#eq
  - screen: M2
    encoder: E2
    layer: base
    name: mid
    note: boost or cut the mids
    source: https://teenage.engineering/guides/op-xy/mix#eq
  - screen: M2
    encoder: E3
    layer: base
    name: high
    note: boost or cut the highs
    source: https://teenage.engineering/guides/op-xy/mix#eq
  - screen: M2
    encoder: E4
    layer: base
    name: blend
    note: flat at low values, full curve at high values
    source: https://teenage.engineering/guides/op-xy/mix#eq
  - screen: M2
    encoder: E4
    layer: click
    name: reset all
    note: flattens the whole EQ
    source: https://teenage.engineering/guides/op-xy/mix#eq
    firmware_min: '1.1.15'
related: [mix.overview, mix.saturator, mix.master]
---

The blend control is the trick: set low, mid and high to an extreme curve — lows cut away for a
breakdown, say — keep blend at zero, and bring it up when the moment comes. At low blend values the
EQ stays neutral whatever the bands say, which makes sweeps quick and repeatable on stage.
