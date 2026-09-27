---
id: instrument.envelopes
title: Amp and filter envelopes (M2)
aliases:
  [envelope, envelopes, adsr, amp envelope, amplitude envelope, filter envelope, attack, release]
area: instrument
order: 20
context:
  modes: [instrument]
  screens: [M2]
summary: "`M2` holds two ADSR envelopes per track: the amp envelope shapes each note's level over time, the filter envelope moves the filter cutoff. Click any encoder to flip between them."
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: two
    text: Every instrument track has two envelopes, one for amplitude and one that drives the filter.
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
  - id: switch
    text: Clicking any encoder on `M2` flips the page between the amp and the filter envelope, on drum tracks as well as synth tracks.
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
  - id: depth
    text: How far the filter envelope moves the cutoff is set by envelope amount, `E3` on the filter page `M3`.
    source: https://teenage.engineering/guides/op-xy/instrument#filter
  - id: midi-ccs
    text: Over MIDI, CC20–23 set the amp envelope and CC24–27 the filter envelope, each in attack, decay, sustain, release order.
    source: docs/research/20-midi-control.md#33-instrument-tracks-18-synth-drum-sampler-multisampler-engines
    confidence: community-verified
procedures:
  - id: switch
    goal: Show the other envelope on M2
    preconditions: [instrument mode, M2 is open]
    steps:
      - keys: click E1…E4
        note: any encoder
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
parameters:
  - screen: M2
    encoder: E1
    layer: base
    name: attack
    note: time to reach full level
    cc: 20
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
  - screen: M2
    encoder: E2
    layer: base
    name: decay
    note: time to fall to the sustain level
    cc: 21
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
  - screen: M2
    encoder: E3
    layer: base
    name: sustain
    note: level held while the key is down
    cc: 22
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
  - screen: M2
    encoder: E4
    layer: base
    name: release
    note: fade-out after the key is let go
    cc: 23
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
  - screen: M2
    encoder: E1
    layer: alt
    name: filter attack
    cc: 24
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
  - screen: M2
    encoder: E2
    layer: alt
    name: filter decay
    cc: 25
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
  - screen: M2
    encoder: E3
    layer: alt
    name: filter sustain
    cc: 26
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
  - screen: M2
    encoder: E4
    layer: alt
    name: filter release
    cc: 27
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
related: [instrument.play-mode, instrument.filter, instrument.overview]
---

Envelopes give every note a shape in time: short and snappy amp settings for plucks and drums, slow
ones for pads. The filter envelope runs the same four stages but moves the cutoff instead, as far as
envelope amount on `M3` allows. The shift layer of `M2` holds the voice settings (play mode,
portamento, bend range, preset volume).
