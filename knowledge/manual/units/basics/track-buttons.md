---
id: basics.track-buttons
title: Track keys and the active track
aliases: [track buttons, T1-T8, select track, active track, track colours, sixteen tracks]
area: basics
order: 30
summary: The eight track keys select which track you play, sequence and edit — instrument tracks or auxiliary tracks, depending on the mode. The lit key marks the active track.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: two-sets
    text: The OP-XY has sixteen sequencer tracks in two sets of eight, instrument and auxiliary; `T1`…`T8` address the set the current mode shows.
    source: https://teenage.engineering/guides/op-xy/track-buttons
  - id: aux-order
    text: In auxiliary mode the keys stand for brain (T1), punch-in FX (T2), external MIDI (T3), external CV (T4), external audio (T5), tape (T6), FX I (T7) and FX II (T8).
    source: https://teenage.engineering/guides/op-xy/auxiliary
  - id: active
    text: Notes you play, steps you enter and pages you edit all belong to the active track; pressing another track key makes that track active.
    source: https://teenage.engineering/guides/op-xy/track-buttons#6.1%20using-the-track-buttons
  - id: colours
    text: The active track's key lights white for an instrument track and red for an auxiliary track.
    source: https://teenage.engineering/guides/op-xy/track-buttons#6.1%20using-the-track-buttons
  - id: presets
    text: '`shift + Tn` opens the preset browser for that track; on instrument tracks it also picks a synth engine or sample pack.'
    source: https://teenage.engineering/guides/op-xy/instrument#project
  - id: cc102
    text: Over MIDI, CC102 on channel 1 selects a track counting from zero; value 2 selected track 3.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
procedures:
  - id: preset
    goal: Load a preset onto a track
    steps:
      - keys: shift + Tn
        note: opens the preset browser for that track
    source: https://teenage.engineering/guides/op-xy/track-buttons#6.1%20using-the-track-buttons
related: [basics.linked-tracks, basics.main-modes, instrument.save-to-same-snapshot]
---

The mode sets whether the track keys mean instrument or auxiliary tracks; holding one track key
while pressing others links tracks instead of switching.
