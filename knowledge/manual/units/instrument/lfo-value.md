---
id: instrument.lfo-value
title: Value LFO
aliases: [value, classic lfo, periodic lfo, lfo wave]
area: instrument
order: 45
context:
  modes: [instrument]
  screens: [M4]
summary: The value LFO is a classic low-frequency oscillator, continuous or retriggered by notes, that sweeps any page parameter at a synced or free speed.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.15']
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: what
    text: Value drives its target with a low-frequency oscillator that either runs continuously or is triggered.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - id: free
    text: Every page appears twice as a destination, normal and free. On a normal one the modulation restarts with each key press; on a free one it keeps running.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - id: modes
    text: The normal destinations give the triggered behaviour and the free ones the continuous behaviour.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
    confidence: derived
  - id: slow-fix
    text: Before OS 1.1.15, the slowest free-running speed stopped the value LFO altogether.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: screen
    text: The value page shows speed, amount on a tick ladder, a scrolling column of destination cards and a large card naming the target parameter (attack, cutoff, res, key …) over an animated knob.
    source: docs/research/59-screen-profiling.md#24-lfo-instrument-m4-five-types
    confidence: verified
    verified_on: '1.1.33'
  - id: free-cards
    text: In the destination column each page's card, such as syn (the engine), env or filter, is followed by a twin labelled free with the same icon.
    source: docs/research/59-screen-profiling.md#24-lfo-instrument-m4-five-types
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: sweep
    goal: Sweep a track's filter cutoff in time with the tempo
    preconditions: [instrument mode, M4 shows the value LFO]
    steps:
      - keys: turn E3
        note: choose the filter page
      - keys: turn E4
        note: choose cutoff
      - keys: turn E1
        note: stay in the synced range and pick a rate
      - keys: turn E2
        note: set the depth
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
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
related: [instrument.lfo, instrument.lfo-random]
---

Value is the general-purpose LFO: a repeating wave aimed at one parameter. Synced to the tempo it
makes rhythmic filter sweeps or pulsing levels; slow and free it gives gradual drift. With a normal
destination every note starts the wave from the same point, so repeated notes sound alike.
