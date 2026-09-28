---
id: players.maestro
title: Maestro player
aliases: [maestro, chord player, one-finger chords, chord memory, strum]
area: players
order: 20
context:
  modes: [instrument, auxiliary]
  screens: [player]
summary: Maestro remembers a chord you enter with shift held and then plays it from any single key, shifted up or down to that key; roll strums it, pattern sets the strum order and hold latches it.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: what
    text: Maestro stores a chord; afterwards every key you press plays that chord, moved up or down so it follows the key.
    source: https://teenage.engineering/guides/op-xy/players#maestro
  - id: record
    text: To store the chord, keep `shift` held and play its notes on the keyboard.
    source: docs/research/59-screen-profiling.md#27-players
    confidence: verified
    verified_on: '1.1.33'
  - id: no-e3
    text: The light gray encoder (`E3`) has no job on the maestro page; its box is crossed out.
    source: docs/research/59-screen-profiling.md#27-players
    confidence: verified
    verified_on: '1.1.33'
  - id: screen
    text: Maestro's page shows roll as a wavy arpeggio sign with a number (0, 10, 12 …), pattern as up, down, up/down or random icons, and hold as a hand that fills in when on.
    source: docs/research/59-screen-profiling.md#27-players
    confidence: verified
    verified_on: '1.1.33'
  - id: slabs
    text: Under the word maestro two stacks of four pale blue slabs picture the stored chord. A slab stands up for each stored note, filling the left stack from the back and then the right one, and lies flat where there is none; while you enter a new chord they rise one by one, and they stand taller while the chord sounds.
    source: docs/research/59-screen-profiling.md#27-players
    confidence: verified
    verified_on: '1.1.33'
  - id: eight
    text: With eight slabs on the page, maestro seems to keep at most eight notes per chord.
    source: docs/research/59-screen-profiling.md#27-players
    confidence: derived
procedures:
  - id: record
    goal: Store a chord in maestro
    preconditions: [the maestro player is on for the selected track]
    steps:
      - keys: shift + keys
        note: keep shift down while you play every note of the chord
    result: From now on each key plays the stored chord.
    source: https://teenage.engineering/guides/op-xy/players#maestro
parameters:
  - screen: player
    encoder: E1
    layer: base
    name: roll
    note: strums the notes, from block chord to slow spread
    source: https://teenage.engineering/guides/op-xy/players#maestro
  - screen: player
    encoder: E2
    layer: base
    name: pattern
    note: strum order — up, down, up/down or random
    source: https://teenage.engineering/guides/op-xy/players#maestro
  - screen: player
    encoder: E4
    layer: base
    name: hold
    range: off / on
    note: the chord rings on after the key is released
    source: https://teenage.engineering/guides/op-xy/players#maestro
related: [players.overview, players.hold]
---

Maestro turns the keyboard into a chord trigger. Enter a chord once with `shift` held — a minor
seventh, a stacked fifth, anything — and a single key then plays the whole shape wherever you press,
which makes progressions quick to play and record with one hand. The guide leaves open whether a new
chord fully replaces the old one.
