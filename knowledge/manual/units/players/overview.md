---
id: players.overview
title: Players
aliases: [player, player key, note player, player type, player style]
area: players
order: 0
context:
  modes: [instrument, auxiliary]
  screens: [player]
summary: A player reworks the notes a track plays — into arpeggios, transposed chords (maestro) or latched notes (hold) — and is switched on per track with the player key.
status: outdated-in-guide
firmware:
  min: '1.0.9'
  changed_in: ['1.1.25']
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: what
    text: A player takes the notes a track receives, from the keyboard or its sequence, and turns them into a variation such as an arpeggio or a chord hit; the recorded notes stay as they are.
    source: https://teenage.engineering/guides/op-xy/players#players
  - id: tracks
    text: Every instrument track and every auxiliary track can run a player of its own.
    source: https://teenage.engineering/guides/op-xy/players#players
  - id: enable
    text: The first press of `player` shows the selected track's player page, dimmed under an off box; a second press switches the player on.
    source: docs/research/59-screen-profiling.md#27-players
    confidence: verified
    verified_on: '1.1.33'
  - id: types
    text: '`shift + player` opens the player list, headed with the track number and the word player: arpeggio, hold and maestro, the current type boxed.'
    source: docs/research/59-screen-profiling.md#27-players
    confidence: verified
    verified_on: '1.1.33'
  - id: list-steps
    text: The first `shift + player` only opens the list. Each further press of `player`, with shift still held, moves the box to the next type (arpeggio → hold → maestro → arpeggio); letting go of shift opens the chosen player's page.
    source: docs/research/59-screen-profiling.md#27-players
    confidence: verified
    verified_on: '1.1.33'
  - id: no-locks
    text: Player settings cannot be parameter-locked; only module-page parameters can.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: new-pattern
    text: Since OS 1.1.25, a pattern you add to a track starts out with the player type that is selected at that moment.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
procedures:
  - id: enable
    goal: Switch on a player for the selected track
    preconditions: [instrument or auxiliary mode, the track is selected]
    steps:
      - keys: player
        note: opens the player page
      - keys: player
        note: switches the player on
    source: https://teenage.engineering/guides/op-xy/players#players
  - id: change-type
    goal: Choose another player type
    steps:
      - keys: shift + player
        note: opens the list with the current type boxed; keep shift held
      - keys: shift + player
        note: each further press of player moves to the next type (arpeggio, hold, maestro)
    result: Letting go of shift opens the chosen player's page.
    source: docs/research/59-screen-profiling.md#27-players
    confidence: verified
    verified_on: '1.1.33'
related:
  [players.arpeggio, players.maestro, players.hold, arrange.patterns, sequencer.parameter-locks]
---

Players sit between what you play and what the track sounds: the arpeggio spells a chord out note
by note, maestro plays whole chords from one finger, and hold keeps notes ringing after you let go.
The sequence is untouched, so switching the player off brings the original notes back. Since new
patterns copy the current player type (1.1.25), the type seems to belong to the pattern.
