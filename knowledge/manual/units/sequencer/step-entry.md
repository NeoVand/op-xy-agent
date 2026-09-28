---
id: sequencer.step-entry
title: Entering notes on steps
aliases: [step sequencing, step entry, program a step, chord on a step, edit a step]
area: sequencer
order: 10
context:
  modes: [instrument, auxiliary]
summary: Play a note on the keyboard, then press steps to place it; hold a step to see and change its notes, or hold several keys while pressing a step for a chord.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.25']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: last-note
    text: The OP-XY remembers the last note or sound you played on the keyboard, and pressing a step stores that note on it; the step then lights.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: check
    text: Holding a step lights the keyboard keys of every note stored on it.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: chord
    text: To store a chord, keep its notes held and press the step, or hold the step and play the notes.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: toggle-note
    text: With a step held, pressing a key adds that note to the step, or takes it off if the step already has it.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: drums
    text: On a drum track each of the 24 keys is a different sound, so step entry places sounds rather than pitches.
    source: https://teenage.engineering/guides/op-xy/get-started#4.1%20sequencing%20a%20drum%20beat
  - id: same-note-octaves
    text: Since OS 1.1.25 a chord entered by holding keys and pressing a step can contain one note in two octaves.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
  - id: step-popup
    text: Pressing or holding a step shows its number in a small box on the screen.
    source: docs/research/59-screen-profiling.md#28-bar-steps
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: enter
    goal: Put a note on a step
    steps:
      - keys: key → step n
        note: further steps get the same note
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: chord
    goal: Put a chord on a step
    steps:
      - keys: keys + step n
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: edit
    goal: Add or remove a note on a step
    steps:
      - keys: step n + key
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
related: [sequencer.single-sound, sequencer.extend-notes, sequencer.copy-step]
---

Step entry works like a pen that holds the last note you played: tap a key, then tap the steps where
it should sound. To add one drum sound to steps that already carry others, use the one-sound view.
