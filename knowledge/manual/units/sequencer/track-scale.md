---
id: sequencer.track-scale
title: Track scale
aliases: [step resolution, time division, track speed, half speed, double speed]
area: sequencer
order: 62
context:
  modes: [instrument, auxiliary]
  screens: [bar]
summary: '`bar + accidental` sets how long one step of the selected track lasts: at 1 a sixteenth note, at 4 a quarter note, at 1/2 a thirty-second. Each track has its own scale.'
status: outdated-in-guide
firmware:
  min: '1.0.9'
  changed_in: ['1.0.15', '1.1.25']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: set
    text: Holding `bar` and pressing a black key sets the track scale, the time one step takes; every track keeps its own.
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: meaning
    text: The scale multiplies the length of every step; at 4 a step lasts four normal steps, so four steps fill a 4/4 bar.
    source: https://teenage.engineering/guides/op-xy/get-started#4.3%20adding-chords
  - id: four
    text: '`bar + accidental 4`, the black key marked 4, sets scale 4; the step lights then move four times slower.'
    source: https://teenage.engineering/guides/op-xy/get-started#4.3%20adding-chords
  - id: double
    text: Scale 1/2 halves every step, so a pattern plays at double time beside tracks at 1; scale 2 doubles every step, half time. A pattern at 1/2 lasts half as long, so it plays twice in a scene of its length at 1.
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: longer
    text: Raising the scale is how a pattern outgrows four bars; 64 steps at scale 16 last 64 bars.
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: guide-list
    text: TE's guide lists the scales 1, 2, 3, 4, 6, 8, 16 and 1/2.
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: fractions
    text: The changelog also names 1/5 and 1/7, repaired in OS 1.0.15.
    source: https://teenage.engineering/downloads/op-xy#1.0.15
    firmware_min: '1.0.15'
  - id: odd-scales
    text: OS 1.1.25 gave the odd scales 3, 5, 6 and 7 their own quantisation grid, so 5 and 7 exist too.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
procedures:
  - id: set
    goal: Change how long each step of the track lasts
    steps:
      - keys: bar + accidental
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
related: [sequencer.bar-menu, sequencer.bars-and-length]
---

Tracks at different scales share a scene: a slow pad at 4 next to hi-hats at 1/2. TE ties only the
key marked 4 to a value; which keys give 16 and the fractions is not documented.
