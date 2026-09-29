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
    text: Only tracks routed on `M2` run through the tape, each at its own amount, independent of the main mix.
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
  - id: values
    text: Community charts read tape pitch as a speed multiple, x1 by default.
    source: docs/research/20-midi-control.md#35-auxiliary-tracks-916
    confidence: community
  - id: screen
    text: The tape page shows a reel icon with the speed as a percentage, a tape strip carrying a mini keyboard and the loop length as a number, and a mix box.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: ranges
    text: Speed runs from 50 % to 200 %, length from 1 to 16 and mix from 00 to 99. Over MIDI, CC13 at 63 gives 99 % and at 64 gives 101 %, so exactly 100 % cannot be sent.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: p-locks
    text: Tape settings can be parameter-locked; OS 1.1.15 fixed locks not showing on the tape screen.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: ccs
    text: Over MIDI on channel 14, CC13 moves speed, CC14 length and CC15 mix on the tape page, and CC12 changes it only slightly.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
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
