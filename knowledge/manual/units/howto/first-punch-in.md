---
id: howto.first-punch-in
title: Recipe — perform with punch-in FX
aliases: [perform with effects, punch-in performance, live effects, momentary effects]
area: howto
order: 4
context:
  modes: [auxiliary]
summary: Open the punch-in FX track (`T2` in auxiliary mode), start the song and hold keyboard keys — each key is a different momentary effect, and several can be held at once.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: track
    text: In auxiliary mode `T2` is the punch-in FX track.
    source: https://teenage.engineering/guides/op-xy/get-started#4.4.%20adding-punch-in-fx
  - id: keys
    text: Each of the 24 keys applies its own effect for as long as you hold it.
    source: https://teenage.engineering/guides/op-xy/get-started#4.4.%20adding-punch-in-fx
  - id: combine
    text: Holding several keys stacks their effects.
    source: https://teenage.engineering/guides/op-xy/get-started#4.4.%20adding-punch-in-fx
  - id: sequence
    text: The punch-in track records and sequences like any other track, so effect moves can become part of the pattern.
    source: https://teenage.engineering/guides/op-xy/get-started#4.4.%20adding-punch-in-fx
procedures:
  - id: perform
    goal: Play effects over the running song
    steps:
      - keys: auxiliary → T2
      - keys: play
      - keys: hold keys
        note: one key per effect; hold several to combine them
    source: https://teenage.engineering/guides/op-xy/get-started#4.4.%20adding-punch-in-fx
  - id: record
    goal: Record an effect performance into the pattern
    steps:
      - keys: record + play
      - keys: hold keys
    source: https://teenage.engineering/guides/op-xy/get-started#4.4.%20adding-punch-in-fx
related: [auxiliary.overview, howto.get-started]
---

Punch-in effects are the performance end of the first session: nothing to set up, just keys to hold
while the song plays. Try single keys first to learn what each does, then combinations. When a move
works, record it like any other part so the pattern repeats it.
