---
id: instrument.user-tunings
title: User tunings (microtonal)
aliases: [tuning, microtuning, microtonal tuning, custom tuning, temperament, cents, tuning slots]
area: instrument
order: 65
context:
  modes: [instrument]
  screens: [preset settings]
summary: The preset settings hold 11 user tuning slots; in each, every note can be retuned in cents and finer micro-cent steps.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.25']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: slots
    text: There are 11 user tuning slots, found under settings → tuning in the preset settings.
    source: https://teenage.engineering/guides/op-xy/instrument#preset-settings
  - id: edit
    text: '`E3` picks a slot and `M4` opens it; in the editor, play a key to choose the note, then turn `E1` for cents and `E2` for micro-cents.'
    source: https://teenage.engineering/guides/op-xy/instrument#preset-settings
  - id: per-pitch-class
    text: Presets store a user tuning as 12 offsets, one per pitch class, so the same pattern repeats in every octave.
    source: docs/research/30-presets-samples.md#23-engine
    confidence: derived
  - id: load-fix
    text: OS 1.1.25 fixed user tunings not loading reliably into their user slots.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
procedures:
  - id: create
    goal: Create a user tuning
    preconditions: [instrument mode, the track is selected]
    steps:
      - keys: shift + instrument
        note: preset settings
      - keys: turn E1
        note: settings tab
      - keys: turn E2
        note: tuning
      - keys: turn E3
        note: pick a user slot
      - keys: M4
        note: edit the slot
      - keys: key
        note: play the note to retune
      - keys: turn E1
        note: cents; `turn E2` for micro-cents
    result: The note plays at its new pitch wherever this tuning is selected.
    source: https://teenage.engineering/guides/op-xy/instrument#preset-settings
related: [instrument.preset-settings]
---

User tunings take the OP-XY outside twelve-tone equal temperament — just intervals, non-Western
scales or a gently detuned vintage feel. Each slot stores per-note offsets; select the slot as a
sound's tuning and the keyboard and sequencer play in it. Save the preset afterwards so the tuning
choice travels with the sound.
