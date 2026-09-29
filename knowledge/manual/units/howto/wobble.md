---
id: howto.wobble
title: Recipe — a filter wobble in time with the beat
aliases: [wobble, wobble bass, lfo on cutoff, filter wobble, rhythmic filter, auto filter]
area: howto
order: 43
context:
  modes: [instrument]
  screens: [M4, M3]
summary: Pick the value LFO on `M4`, aim it at the cutoff on the filter page and give it a tempo-synced speed; the amount sets how far the filter swings.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: value
    text: The value LFO turns one encoder of the track's pages up and down by itself, like a hand moving the knob in a loop.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
    confidence: derived
  - id: target
    text: Destination on `E3` picks the page, filter for a wobble, and parameter on `E4` picks the encoder there; cutoff is the first of the filter page's four.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - id: synced
    text: Over the anti-clockwise part of its range the speed follows the tempo, so the wobble stays locked to the beat.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - id: restart
    text: On the plain filter destination the wobble restarts with every note, so each note wobbles the same way; its free twin keeps running across notes.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - id: audible
    text: A moderate cutoff with some resonance on `M3` makes the sweep easy to hear; with the cutoff fully open there is little left to move.
    source: https://teenage.engineering/guides/op-xy/instrument#filter
    confidence: derived
procedures:
  - id: set-up
    goal: Make the filter on `T3` wobble in time
    preconditions: [instrument mode]
    steps:
      - keys: T3 → M4
      - keys: shift + M4
        note: the LFO types
      - keys: turn E1
        note: highlight value
      - keys: click E1
        note: takes it; press `M4` if the page changed
        set: { param: lfo type, value: value }
      - keys: turn E1
        note: a synced speed, such as 4
        set: { param: lfo speed, value: 4 }
      - keys: turn E2
        note: amount around 60
        set: { param: lfo amount, value: 60 }
      - keys: turn E3
        note: destination filter
        set: { param: lfo destination, value: filter }
      - keys: turn E4
        note: parameter 1, the cutoff
        set: { param: lfo parameter, value: 1 }
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
    confidence: derived
  - id: audible
    goal: Give the wobble something to move
    steps:
      - keys: M3
        note: press it again if the page shows off
      - keys: turn E1
        note: cutoff around 40
        set: { param: cutoff, value: 40 }
      - keys: turn E2
        note: resonance around 45
        set: { param: resonance, value: 45 }
    source: https://teenage.engineering/guides/op-xy/instrument#filter
    confidence: derived
related: [instrument.lfo-value, instrument.lfo, instrument.filter, howto.acid-bass]
---

A wobble is a filter sweep that repeats in time, the sound of a hand rocking the cutoff knob back
and forth. Faster synced speeds make it busier, slower ones turn it into a long rise and fall over
the bar. Parameter locks on the LFO speed for single steps give the classic change of pace in the
middle of a phrase.
