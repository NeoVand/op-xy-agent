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
  verified_on: '1.1.33'
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
    text: Over MIDI, CC20–23 set the amp envelope and CC24–27 the filter envelope, each in attack, decay, sustain, release order, whichever envelope the page shows.
    source: docs/research/59-screen-profiling.md#22-envelope-editor-instrument-m2
    confidence: verified
    verified_on: '1.1.33'
  - id: screen
    text: The page draws both envelopes at once. The one the encoders edit is bright, with five square handles (start, peak, decay end, release start, end) and thin lines dropping from the inner three; the other is grey, without handles. Each is named, "amp" or "filter", just left of its release handle.
    source: docs/research/59-screen-profiling.md#22-envelope-editor-instrument-m2
    confidence: verified
    verified_on: '1.1.33'
  - id: handles
    text: Each encoder slides one handle. Attack moves the peak right along the top, decay moves the decay end right of the peak, sustain raises the level, and release moves the release start right toward the end.
    source: docs/research/59-screen-profiling.md#22-envelope-editor-instrument-m2
    confidence: verified
    verified_on: '1.1.33'
  - id: release-direction
    text: Release is set by where its handle sits, so turning E4 clockwise (a higher value) gives a shorter release; fully clockwise the handle sits on the end and the note stops at once. Turn it counter-clockwise for a long fade.
    source: docs/research/59-screen-profiling.md#22-envelope-editor-instrument-m2
    confidence: verified
    verified_on: '1.1.33'
  - id: shape
    text: There is no plateau after the attack; the decay starts at the peak. The attack rises steeply and bends into the peak, and decay and release fall steeply and level off.
    source: docs/research/59-screen-profiling.md#22-envelope-editor-instrument-m2
    confidence: verified
    verified_on: '1.1.33'
  - id: full-height
    text: The filter envelope is always drawn at full height; its real reach is set by envelope amount on `M3`.
    source: docs/research/59-screen-profiling.md#22-envelope-editor-instrument-m2
    confidence: verified
    verified_on: '1.1.33'
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
    note: fade-out after the key is let go; clockwise moves the release handle right, a shorter release
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
    note: clockwise is shorter, as for the amp release
    cc: 27
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
related: [instrument.play-mode, instrument.filter, instrument.overview]
---

Envelopes give every note a shape in time: short and snappy amp settings for plucks and drums, slow
ones for pads. Read the graph as time running left to right: a peak far to the right is a slow
attack, a release handle far to the left is a long release (release turned down), one sitting on
the end is none (release turned all the way up). The filter envelope runs the same four stages but moves the cutoff instead, as far as
envelope amount on `M3` allows. The shift layer of `M2` holds the voice settings (play mode,
portamento, bend range, preset volume).
