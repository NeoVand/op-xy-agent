---
id: instrument.engine-hardsync
title: Hardsync synth engine
aliases: [hardsync, hard sync, hardsync engine, oscillator sync]
area: instrument
order: 50
context:
  modes: [instrument]
  screens: [M1]
summary: A hard-sync engine for punchy stabs and firm basses; its M1 page sets freq (a harmonic sweep), sub, noise and low cut.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: character
    text: Hardsync is built for short stabs and firm, solid bass lines.
    source: https://teenage.engineering/guides/op-xy/synth-engines#hardsync
  - id: picture
    text: Hardsync's picture is a hair dryer blowing animated blocks, with two dots for sub and an S-curve for the low cut that slides right as lowcut rises.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: freq
    note: shifts the harmonics, changing the tone
    cc: 12
    source: https://teenage.engineering/guides/op-xy/synth-engines#hardsync
  - screen: M1
    encoder: E2
    layer: base
    name: sub
    note: adds a sub-bass layer underneath
    cc: 13
    source: https://teenage.engineering/guides/op-xy/synth-engines#hardsync
  - screen: M1
    encoder: E3
    layer: base
    name: noise
    note: adds noise to brighten the sound
    cc: 14
    source: https://teenage.engineering/guides/op-xy/synth-engines#hardsync
  - screen: M1
    encoder: E4
    layer: base
    name: lowcut
    note: removes low frequencies
    cc: 15
    source: https://teenage.engineering/guides/op-xy/synth-engines#hardsync
related: [instrument.engine]
---

Hard sync restarts one oscillator from another, so sweeping freq produces the tearing, vocal sweep
sync sounds are known for — try a different freq lock on each step. Sub reinforces the bottom for
basses or thickens pads, noise brightens, and lowcut thins the sound so it sits above a bass line.
Load it with `shift + M1`.
