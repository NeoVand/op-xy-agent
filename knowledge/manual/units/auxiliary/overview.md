---
id: auxiliary.overview
title: Auxiliary mode and its eight tracks
aliases: [aux mode, aux tracks, auxiliary tracks]
area: auxiliary
order: 0
context:
  modes: [auxiliary]
summary: '`auxiliary` turns the track keys into eight fixed utility tracks — brain, punch-in FX, external MIDI, external CV, external audio, tape, FX I and FX II — sequenced like instrument tracks.'
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: purpose
    text: Aux tracks vary the built-in sounds or control and feed outside gear.
    source: https://teenage.engineering/guides/op-xy/auxiliary#auxiliary
  - id: tracks
    text: '`T1` brain, `T2` punch-in FX, `T3` external MIDI, `T4` external CV, `T5` external audio, `T6` tape, `T7` FX I, `T8` FX II.'
    source: https://teenage.engineering/guides/op-xy/auxiliary
  - id: red
    text: The selected aux track lights its key red; instrument tracks light white.
    source: https://teenage.engineering/guides/op-xy/track-buttons#6.1%20using-the-track-buttons
  - id: pages
    text: External audio, tape and the FX tracks put main controls on M1, routing on M2, a filter on M3 and an LFO on M4; the brain has M1 and routing, external MIDI puts CCs on M2 and M3.
    source: https://teenage.engineering/guides/op-xy/auxiliary
  - id: sequenced
    text: Aux tracks have their own patterns, notes, parameter locks and step components, like instrument tracks.
    source: docs/research/10-xy-format.md#311-auxiliary-tracks-t9t16
    confidence: community-verified
  - id: channels
    text: By default the aux tracks answer MIDI channels 9–16 in order, brain on 9 up to FX II on 16.
    source: docs/research/20-midi-control.md#21-the-16-tracks-and-their-default-channels
    confidence: community-verified
  - id: mix
    text: In mix mode, pressing `mix` again switches between instrument and aux tracks.
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
procedures:
  - id: open
    goal: Open an auxiliary track
    steps:
      - keys: auxiliary → T1…T8
    source: https://teenage.engineering/guides/op-xy/auxiliary#auxiliary
related:
  [
    auxiliary.brain,
    auxiliary.punch-in-fx,
    auxiliary.external-midi,
    auxiliary.external-cv,
    auxiliary.external-audio,
    auxiliary.tape,
    auxiliary.fx-sends,
    auxiliary.routing-filter-lfo
  ]
---

Instrument mode is for composing; auxiliary mode is for transposing, effects and reaching outside
the box. The eight roles never change, and because the tracks sequence like any other, transpositions,
effect moves and outside gear can all be programmed per step.
