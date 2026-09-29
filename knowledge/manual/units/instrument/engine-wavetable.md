---
id: instrument.engine-wavetable
title: Wavetable synth engine
aliases: [wavetable, wavetable engine, wavetables, morphing oscillator]
area: instrument
order: 50
context:
  modes: [instrument]
  screens: [M1]
summary: An engine that morphs through a table of stored waveforms; its `M1` page picks one of nine tables and sets position, warp and drift.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: what
    text: A wavetable is a row of waveforms stored one after another; moving through it morphs the oscillator smoothly from shape to shape.
    source: https://teenage.engineering/guides/op-xy/synth-engines#wavetable
  - id: nine
    text: The engine offers nine wavetables.
    source: https://teenage.engineering/guides/op-xy/synth-engines#wavetable
  - id: tables
    text: The first cell of the top bar names the current table; turning `E1` steps through basic, buzz, crush, drawbars, fibonacci, fractal, geometric, primes and zap.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
  - id: picture
    text: The picture is the waveform itself, morphing and leaving trails as it changes; drift fans it out into moving ghost copies.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: table
    range: 9 tables
    cc: 12
    source: https://teenage.engineering/guides/op-xy/synth-engines#wavetable
  - screen: M1
    encoder: E2
    layer: base
    name: position
    note: place within the table
    cc: 13
    source: https://teenage.engineering/guides/op-xy/synth-engines#wavetable
  - screen: M1
    encoder: E3
    layer: base
    name: warp
    note: bends the shape of the waveform
    cc: 14
    source: https://teenage.engineering/guides/op-xy/synth-engines#wavetable
  - screen: M1
    encoder: E4
    layer: base
    name: drift
    note: lets the warp wander from the note's pitch, for inharmonic tones
    cc: 15
    source: https://teenage.engineering/guides/op-xy/synth-engines#wavetable
related: [instrument.engine, instrument.lfo-value]
---

Wavetable suits evolving sounds: choose a table, then move the position to travel through its
waveforms. Position is the parameter to animate — lock it per step or aim the LFO at it — while warp
reshapes whatever waveform is current. Drift pulls the warping away from the played pitch for
metallic, unstable results. Load it from the preset browser, `shift + M1`.
