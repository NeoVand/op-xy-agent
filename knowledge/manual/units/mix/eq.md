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
    text: Over MIDI, CC90 moves the EQ bands, the channel choosing which — 1 low, 2 mid, 3 high.
    source: docs/research/59-screen-profiling.md#210-mixer
    confidence: verified
    verified_on: '1.1.33'
  - id: midi-blend
    text: CC90 on channel 4 changed nothing visible on the EQ page, so no MIDI control for blend is confirmed.
    source: docs/research/59-screen-profiling.md#210-mixer
    confidence: verified
    verified_on: '1.1.33'
  - id: screen
    text: The EQ page pictures the three bands as groups of panels standing on an isometric grid floor, next to a slider track with an N at one end.
    source: docs/research/59-screen-profiling.md#210-mixer
    confidence: verified
    verified_on: '1.1.33'
  - id: bands-drawn
    text: Each band tilts its own group of panels, flat at the minimum and rising with the value to lean at about 60° at the maximum, never fully upright; in a new project all three bands sat at the middle value, 64.
    source: docs/research/59-screen-profiling.md#210-mixer
    confidence: verified
    verified_on: '1.1.33'
  - id: blend-drawn
    text: Turning `E4` slides a knob along that track and reshapes the whole scene; as it travels, the low and high panels flatten and the mid panels stand up.
    source: docs/research/59-screen-profiling.md#210-mixer
    confidence: verified
    verified_on: '1.1.33'
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
