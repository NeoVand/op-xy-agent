---
id: instrument.lfo-tremolo
title: Tremolo LFO (vibrato and tremolo)
aliases: [tremolo, vibrato, tremolo lfo, pitch wobble, volume wobble]
area: instrument
order: 44
context:
  modes: [instrument]
  screens: [M4]
summary: The tremolo LFO is wired straight to pitch and volume — one depth for vibrato, one for tremolo — plus speed, a fade envelope and a waveform shape.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: what
    text: Tremolo varies the track's pitch and volume directly, so it has no destination or parameter to choose.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - id: shape
    text: "`shift + turn E2` sets the tremolo's waveform shape. TE's caption for that control repeats the random LFO's envelope text; its title and diagram point to shape."
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
    confidence: derived
  - id: screen
    text: The tremolo page labels its fields rate, vib, vol and env, with a card labelled shape under env that shows the waveform (sine, square …); vib and vol are pointers on tick ladders.
    source: docs/research/59-screen-profiling.md#24-lfo-instrument-m4-five-types
    confidence: verified
    verified_on: '1.1.33'
  - id: rate-drawn
    text: While synced, rate shows a note-value icon with a multiplier (8, 6, 4, 2 …); turned further clockwise it becomes a clock dial whose hand turns, and the rate runs free.
    source: docs/research/59-screen-profiling.md#24-lfo-instrument-m4-five-types
    confidence: verified
    verified_on: '1.1.33'
  - id: env-drawn
    text: Env is drawn as a line that rises at 0, lies flat at 64 and falls at 127.
    source: docs/research/59-screen-profiling.md#24-lfo-instrument-m4-five-types
    confidence: verified
    verified_on: '1.1.33'
  - id: depths
    text: The vol ladder dips the level to about a fifth at full; vib wobbles the pitch by about ±25 cents at a quarter, ±190 at half and more than an octave at full, growing ever faster.
    source: docs/research/60-sound-session.md#4-lfos
    confidence: verified
    verified_on: '1.1.33'
  - id: env-sound
    text: Env at 64 keeps the tremolo steady; toward 0 it fades the tremolo in slowly, toward 127 it fades it out, at 127 at once.
    source: docs/research/60-sound-session.md#4-lfos
    confidence: verified
    verified_on: '1.1.33'
parameters:
  - screen: M4
    encoder: E1
    layer: base
    name: speed
    note: synced when turned anti-clockwise, free past the dial icon
    cc: 40
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - screen: M4
    encoder: E2
    layer: base
    name: amount
    note: vibrato depth (pitch)
    cc: 41
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - screen: M4
    encoder: E3
    layer: base
    name: volume
    note: tremolo depth (level)
    cc: 42
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - screen: M4
    encoder: E4
    layer: base
    name: envelope
    note: fades the effect in or out
    cc: 43
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - screen: M4
    encoder: E2
    layer: shift
    name: shape
    note: waveform of the LFO
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
    confidence: derived
related: [instrument.lfo, instrument.engine-organ, instrument.engine-axis]
---

Tremolo is the quickest way to make a sound move: no routing, just two depths. A little vibrato at a
moderate speed gives leads and strings a natural wobble, while the volume depth makes the classic
throbbing tremolo. Use the envelope so the effect grows in after the note starts instead of arriving
at once.
