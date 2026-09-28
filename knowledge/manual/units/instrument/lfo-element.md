---
id: instrument.lfo-element
title: Element LFO (gyroscope, microphone, envelope)
aliases: [element, gyro, gyroscope, tilt, motion control, microphone modulation, mic lfo]
area: instrument
order: 42
context:
  modes: [instrument]
  screens: [M4]
summary: The element LFO turns the unit's own sensors into a modulation source — tilt (gyroscope), the built-in microphone, the amp envelope, or all three summed.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.50', '1.1.0']
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: what
    text: Element takes its modulation from the OP-XY itself rather than from an oscillator.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - id: gyro-depth
    text: OS 1.0.50 raised the maximum depth of gyroscope modulation.
    source: https://teenage.engineering/downloads/op-xy#1.0.50
    firmware_min: '1.0.50'
  - id: envelope-fix
    text: OS 1.1.0 fixed a bug that affected element when the amp envelope was its source.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
    firmware_min: '1.1.0'
  - id: screen
    text: Element shows its source as an icon — G for the gyroscope, a microphone, ^ for the envelope, or sum — then amount on a tick ladder, destination cards (synth wave, env, filter, amp) and a card naming the parameter, such as attack, cutoff, pitch or pan.
    source: docs/research/59-screen-profiling.md#24-lfo-instrument-m4-five-types
    confidence: verified
    verified_on: '1.1.33'
parameters:
  - screen: M4
    encoder: E1
    layer: base
    name: source
    range: gyroscope / microphone / amp envelope / sum
    note: sum mixes all three
    cc: 40
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - screen: M4
    encoder: E2
    layer: base
    name: amount
    cc: 41
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - screen: M4
    encoder: E3
    layer: base
    name: destination
    note: module page to modulate
    cc: 42
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - screen: M4
    encoder: E4
    layer: base
    name: parameter
    note: encoder on that page; clicking also selects
    cc: 43
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
related: [instrument.lfo]
---

Element makes the instrument physical. With the gyroscope, tilting the OP-XY sweeps whatever you aim
it at; with the microphone, sound in the room becomes modulation; the amp envelope source follows
the shape of each note. It suits live performance more than programmed patterns.
