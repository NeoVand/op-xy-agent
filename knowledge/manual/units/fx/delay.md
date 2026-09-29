---
id: fx.delay
title: Delay effect
aliases: [delay, echo, delay fx, delay time, repeats]
area: fx
order: 20
context:
  modes: [auxiliary]
  screens: [M1]
summary: An echo for FX I or FX II; `M1` sets the repeat spacing as a note value, fine-tunes it, and sets the feedback and the amount of dry signal.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.25']
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: what
    text: The delay plays back what it receives as a series of echoes.
    source: https://teenage.engineering/guides/op-xy/fx#delay
  - id: size
    text: Size (`E1`) sets the spacing of the repeats and reads as a note value, such as 1/8 dotted.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: labels
    text: The delay's columns read size, fine, feedback and dry — `E2` fine-tunes the spacing and `E3` sets the feedback.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: dry
    text: Dry (`E4`) sets the untreated signal against the echoes; at 0 only the repeats are heard.
    source: https://teenage.engineering/guides/op-xy/fx#delay
  - id: jitter
    text: Since OS 1.1.25 the delay stays steady when the tempo of an external clock wobbles.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: size
    range: note values, e.g. 1/8 dotted
    cc: 12
    note: coarse spacing between repeats
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - screen: M1
    encoder: E2
    layer: base
    name: fine
    cc: 13
    note: fine-tunes the spacing; the guide calls it amount
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - screen: M1
    encoder: E3
    layer: base
    name: feedback
    cc: 14
    note: how many repeats come back; the guide calls it fine
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - screen: M1
    encoder: E4
    layer: base
    name: dry
    cc: 15
    note: level of the untreated signal
    source: https://teenage.engineering/guides/op-xy/fx#delay
related: [fx.overview, fx.reverb]
---

Set the rough echo distance with size, then fine-tune it and choose how long the echoes keep coming
back. For a classic send, keep dry at 0 so the FX track returns only the echoes. TE's guide calls the
middle controls amount and fine and describes size as eight named steps from micro to insane; on
1.1.33 the screen reads fine and feedback, and size shows note values, so the spacing follows the
tempo.
