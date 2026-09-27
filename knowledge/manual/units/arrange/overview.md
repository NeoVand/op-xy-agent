---
id: arrange.overview
title: Arrange mode
aliases: [arrange, arranger, arrangement, pattern view, switch patterns, pattern navigation]
area: arrange
order: 0
context:
  modes: [arrange]
summary: Arrange mode manages each track's patterns and combines them into scenes and songs; E4 moves between the selected track's patterns and a click on it mutes the track.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: purpose
    text: Arrange mode handles each track's patterns — adding them and switching between them — and strings them into scenes and songs, for building a song as well as performing it.
    source: https://teenage.engineering/guides/op-xy/arrange#arrange
  - id: toggle
    text: Pressing `arrange` while already in arrange mode flips between the instrument tracks and the auxiliary tracks; both kinds have patterns.
    source: https://teenage.engineering/guides/op-xy/arrange#switching-tracks-and-patterns
  - id: select
    text: A track key picks the track to work on; instrument tracks light white and auxiliary tracks red, as in the other modes.
    source: https://teenage.engineering/guides/op-xy/arrange#switching-tracks-and-patterns
  - id: steps
    text: The step keys show the selected track's sequence in its current pattern.
    source: https://teenage.engineering/guides/op-xy/arrange#switching-tracks-and-patterns
  - id: browse
    text: '`turn E4` moves through the patterns the selected track already has.'
    source: https://teenage.engineering/guides/op-xy/arrange#sound-link
  - id: mute
    text: '`click E4` mutes the selected track.'
    source: https://teenage.engineering/guides/op-xy/arrange#sound-link
  - id: keys
    text: In arrange, `M1`…`M4` open no pages; they add, copy, paste and remove patterns, and with `shift` held they manage scenes.
    source: https://teenage.engineering/guides/op-xy/arrange#edit-controls
procedures:
  - id: enter
    goal: Open arrange mode
    steps:
      - keys: arrange
    source: https://teenage.engineering/guides/op-xy/arrange#arrange
  - id: track-kind
    goal: Switch arrange between instrument and auxiliary tracks
    preconditions: [arrange mode]
    steps:
      - keys: arrange
    source: https://teenage.engineering/guides/op-xy/arrange#switching-tracks-and-patterns
  - id: change-pattern
    goal: Play another existing pattern on a track
    preconditions: [arrange mode]
    steps:
      - keys: Tn
        note: select the track
      - keys: turn E4
        note: step to the pattern
    source: https://teenage.engineering/guides/op-xy/arrange#sound-link
related:
  [
    arrange.patterns,
    arrange.sound-link,
    arrange.scenes,
    arrange.song-mode,
    basics.patterns-scenes-songs,
    mix.mute-solo
  ]
---

Arrange is the bird's-eye view of a project. Pick a track and `E4` walks through its patterns while
the step keys show what each one holds; press `arrange` again for the auxiliary tracks. Patterns are
grouped into scenes, and scenes chained into songs. Since every change happens while the sequencer
runs, the same view doubles as a performance surface.
