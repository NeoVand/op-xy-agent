---
id: arrange.scene-queue
title: Queued scene switching
aliases: [queue scene, delayed scene switch, delayed scene, scene queue, cue next scene]
area: arrange
order: 40
context:
  modes: [arrange]
summary: Scene changes normally happen at once; holding shift and tapping play before choosing a scene queues the change instead. The feature and its MIDI command (CC82) arrived in OS 1.1.0.
status: current
firmware:
  min: '1.1.0'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: since
    text: OS 1.1.0 introduced delayed scene switching, together with a MIDI command that sets a delayed scene.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
  - id: default
    text: Unless you queue it, a scene you select takes over immediately.
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
  - id: gesture
    text: To queue a scene, hold `shift`, tap `play`, then choose the scene with a black key while `shift` stays down.
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
  - id: timing
    text: The guide does not say when a queued scene starts; community documentation has the MIDI version switch at the next bar.
    source: docs/research/20-midi-control.md#31-global-ccs
    confidence: community
  - id: midi
    text: CC82, on any channel, sets the scene to switch to after a delay, where CC85 switches at once.
    source: https://teenage.engineering/guides/op-xy/midi-references
  - id: midi-values
    text: CC82 values 0–98 stand for scenes 1–99.
    source: docs/research/20-midi-control.md#31-global-ccs
    confidence: community
procedures:
  - id: queue
    goal: Queue the next scene instead of switching at once
    preconditions: [arrange mode]
    steps:
      - keys: shift + play → + accidental
        note: keep shift held; the black key picks scenes 1–9
    result: The chosen scene waits its turn instead of starting immediately.
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
related: [arrange.scenes, arrange.songs]
---

Jumping straight to a scene can land off the beat on stage. Queueing avoids that: tap `play` with
`shift` held before choosing the scene, and the change waits its turn; CC82 does the same over MIDI.
TE does not document when the queued scene takes over, and the scene-length setting (1.1.0) may play
a part.
