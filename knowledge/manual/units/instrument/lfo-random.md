---
id: instrument.lfo-random
title: Random LFO
aliases: [random, sample and hold, random modulation, random values]
area: instrument
order: 43
context:
  modes: [instrument]
  screens: [M4]
summary: The random LFO feeds random values to one parameter at a tempo-synced or free speed, with an envelope that fades the effect in or out.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.38']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Random modulates its target with values from a random generator.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - id: free
    text: Every page appears twice as a destination, normal and free. On a normal one the modulation restarts with each key press; on a free one it keeps running.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - id: reset
    text: Since OS 1.0.38, a random LFO on a free destination is not reset by new notes, and a reset snaps it to the correct value.
    source: https://teenage.engineering/downloads/op-xy#1.0.38
    firmware_min: '1.0.38'
parameters:
  - screen: M4
    encoder: E1
    layer: base
    name: speed
    note: synced when turned anti-clockwise, free past the dial icon
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
    note: module page, normal or free
    cc: 42
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - screen: M4
    encoder: E4
    layer: base
    name: parameter
    cc: 43
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - screen: M4
    encoder: E2
    layer: shift
    name: envelope
    note: fades the modulation in or out
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
related: [instrument.lfo, instrument.lfo-value]
---

Random gives a part small changes that never repeat exactly: a wandering filter, drifting pitch,
jumping pans. Synced to the tempo it produces stepped, rhythmic changes; free-running it drifts. Pick
a free destination when the movement should carry on across notes instead of restarting on each one.
