---
id: auxiliary.tape
title: Tape track
aliases: [tape, tape loop, glitch, tape stop]
area: auxiliary
order: 60
context:
  modes: [auxiliary]
  screens: [M1, M2]
summary: '`T6` grabs and rearranges audio playing in the unit: its keyboard plays clips of the tracks routed into the tape, and pitch, speed, loop length and mix shape the result.'
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.15']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Tape picks out and rearranges audio playing inside the OP-XY, which makes glitchy effects easy.
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
  - id: keyboard
    text: On the tape track (`T6`) the keyboard plays clips of whatever tracks are routed into the tape.
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
  - id: routing
    text: Only tracks routed on M2 run through the tape, each at its own amount, independent of the main mix.
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
  - id: values
    text: Tape pitch reads as a speed multiple, x1 by default, and tape speed as a percentage around 100 %.
    source: docs/research/20-midi-control.md#35-auxiliary-tracks-916
    confidence: community
  - id: p-locks
    text: Tape settings can be parameter-locked; OS 1.1.15 fixed locks not showing on the tape screen.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: ccs
    text: 'Community charts for channel 14: CC12 pitch, CC13 speed, CC14 length (one chart labels it otherwise), CC15 mix.'
    source: docs/research/20-midi-control.md#35-auxiliary-tracks-916
    confidence: community
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: pitch
    note: big jumps, for drastic effects
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
  - screen: M1
    encoder: E2
    layer: base
    name: speed
    note: finer and gentler than pitch
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
  - screen: M1
    encoder: E3
    layer: base
    name: length
    note: length of the tape loop
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
  - screen: M1
    encoder: E4
    layer: base
    name: mix
    note: tape against the original audio
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
related: [auxiliary.routing-filter-lfo, instrument.track-sends]
---

Route a drum track into the tape, then play `T6`'s keyboard to fire back fragments of what just
played; shorten the loop for stutters, drop the pitch for slow-downs.
