---
id: sequencer.transpose-sequence
title: Transposing a track's sequence
aliases: [sequence octave, transpose a pattern, semitone shift]
area: sequencer
order: 29
context:
  modes: [instrument]
summary: '`shift + [-]` or `shift + [+]` moves every note of the current sequence down or up — an octave on synth and sampler tracks, a semitone on drum-sampler tracks.'
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.45']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: octave
    text: Holding `shift` and pressing `[-]` or `[+]` moves the current sequence an octave down or up on synth and sampler tracks.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: drum-semitone
    text: On drum-sampler tracks the same keys move the sequenced notes by one semitone instead.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
    firmware_min: '1.0.45'
  - id: keyboard-only
    text: Without `shift`, `[-]` and `[+]` only change the keyboard's octave and leave recorded notes alone.
    source: https://teenage.engineering/guides/op-xy/layout#transport-controls
procedures:
  - id: transpose
    goal: Move a track's recorded notes down or up
    steps:
      - keys: shift + [-]/[+]
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
related: [sequencer.rotate, sequencer.component-tonality]
---

Handy when a bass line sits too high. In a drum kit each semitone is another sound, so on drums it
tries the same rhythm on the neighbouring hits.
