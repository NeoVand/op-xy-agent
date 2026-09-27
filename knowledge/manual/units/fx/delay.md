---
id: fx.delay
title: Delay effect
aliases: [delay, echo, delay fx, delay time, repeats]
area: fx
order: 20
context:
  modes: [auxiliary]
  screens: [M1]
summary: An echo for FX I or FX II; M1 sets the repeat spacing in eight steps, fine-tunes it, and sets the feedback and the amount of dry signal.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.25']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: The delay plays back what it receives as a series of echoes.
    source: https://teenage.engineering/guides/op-xy/fx#delay
  - id: size
    text: Size (`E1`) picks the spacing of the repeats in eight steps, labelled from micro to insane.
    source: https://teenage.engineering/guides/op-xy/fx#delay
  - id: labels
    text: The guide names `E2` amount and `E3` fine, but describes `E2` as fine-tuning the spacing and `E3` as setting the feedback, so the screen may show the names the other way round; not yet checked on a unit.
    source: https://teenage.engineering/guides/op-xy/fx#delay
    confidence: conflicting
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
    range: 8 steps, micro … insane
    cc: 12
    note: coarse spacing between repeats
    source: https://teenage.engineering/guides/op-xy/fx#delay
  - screen: M1
    encoder: E2
    layer: base
    name: amount
    cc: 13
    note: described as fine-tuning the spacing
    source: https://teenage.engineering/guides/op-xy/fx#delay
  - screen: M1
    encoder: E3
    layer: base
    name: fine
    cc: 14
    note: described as feedback, the number of repeats
    source: https://teenage.engineering/guides/op-xy/fx#delay
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
back. For a classic send, keep dry at 0 so the FX track returns only the echoes. The 1.1.25 fix for
jittery external clocks suggests the spacing follows the tempo, though the guide does not say so.
