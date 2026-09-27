---
id: players.hold
title: Hold player
aliases: [hold, latch, sustain notes, drone, held notes]
area: players
order: 30
context:
  modes: [instrument, auxiliary]
  screens: [player]
summary: The hold player keeps the notes you play sounding until you play the next ones; stop or switching the player off releases them.
status: outdated-in-guide
firmware:
  min: '1.0.9'
  changed_in: ['1.1.3', '1.1.25']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: With the hold player on, notes keep sounding after you let go of the keys, until you play the next note or chord.
    source: https://teenage.engineering/guides/op-xy/players#hold
  - id: use
    text: Hold suits bass notes and chords that should ring on while your hands are busy elsewhere.
    source: https://teenage.engineering/guides/op-xy/players#hold
  - id: release
    text: Pressing `stop`, or switching the player off with `player`, releases every held note.
    source: https://teenage.engineering/guides/op-xy/players#hold
  - id: no-toggle
    text: Since OS 1.1.3, pressing a key that is already held does not switch that note off, which makes held chords easier to play.
    source: https://teenage.engineering/downloads/op-xy#1.1.3
    firmware_min: '1.1.3'
  - id: note-off
    text: Since OS 1.1.25, stopping the hold player ends its notes with an ordinary note-off, so each note fades out through its release.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
procedures:
  - id: use
    goal: Latch notes with the hold player
    preconditions: [the player type of the selected track is hold]
    steps:
      - keys: player → player
        note: open the player page and switch the player on
      - keys: keys
        note: play a note or chord and let go
    result: The notes ring on until you play new ones.
    source: https://teenage.engineering/guides/op-xy/players#hold
  - id: silence
    goal: Release the held notes
    steps:
      - keys: stop
        note: pressing `player` to switch hold off works too
    source: https://teenage.engineering/guides/op-xy/players#hold
related: [players.overview, players.maestro]
---

Hold is the simplest player: whatever you play stays on until the next thing you play replaces it —
a droning bass note under the pattern, or a chord that pads on while you tweak. Press `stop` or switch
the player off to clear it. Since 1.1.25 the held notes fade through their release when you stop.
