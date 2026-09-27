---
id: basics.workflow
title: From first notes to a song
aliases: [workflow, how to make a song, song workflow, getting started, basic workflow, layering]
area: basics
order: 60
summary: The usual path on the OP-XY — sequence one track at a time, make pattern variations in arrange, capture them as scenes, then order the scenes into a song and mix it.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: layers
    text: The OP-XY is built around sequencing one track at a time and stacking tracks into the layers of a song.
    source: https://teenage.engineering/guides/op-xy/layout#interface-overview
  - id: many-ways
    text: TE's workflow chapter offers one suggested way of working, not the only one.
    source: https://teenage.engineering/guides/op-xy/workflow#workflow
  - id: sequence-first
    text: A song starts with sequencing the tracks in instrument mode.
    source: https://teenage.engineering/guides/op-xy/workflow#creating-a-song
  - id: variations
    text: In arrange you then add new patterns, or copy existing ones and change them, to get the variations for different parts.
    source: https://teenage.engineering/guides/op-xy/workflow#creating-a-song
  - id: scenes
    text: Moving between scenes and giving each its own pattern combination builds the sections of the song.
    source: https://teenage.engineering/guides/op-xy/workflow#creating-a-song
  - id: song-mode
    text: Once a few scenes work, song mode puts them in playing order.
    source: https://teenage.engineering/guides/op-xy/workflow#creating-a-song
procedures:
  - id: first-notes
    goal: Put a first note into a track's sequence
    steps:
      - keys: instrument
      - keys: T1…T8
        note: choose the track
      - keys: key → step n
        note: play a note on the keyboard, then press the step where it should go
    result: The note plays on that step every time the pattern comes round.
    source: https://teenage.engineering/guides/op-xy/layout#interface-overview
  - id: to-song
    goal: Order finished scenes into a song
    preconditions: [arrange mode, a few scenes are ready]
    steps:
      - keys: shift + arrange
        note: opens song mode
      - keys: shift + accidentals
        note: type the scene numbers in playing order
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
related: [basics.patterns-scenes-songs, basics.main-modes, sequencer.step-components]
---

The suggested path mirrors the modes — write in instrument, vary and combine in arrange, balance in
mix — but nothing forces that order.
