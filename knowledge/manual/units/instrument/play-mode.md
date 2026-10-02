---
id: instrument.play-mode
title: Play mode, portamento, bend range and preset volume (M2 + shift)
aliases:
  [voice mode, poly, mono, legato, glide, portamento, pitch bend range, preset volume, preset level]
area: instrument
order: 25
context:
  modes: [instrument]
  screens: [M2]
summary: Holding `shift` on `M2` reveals four voice settings — poly, mono or legato play mode, portamento (glide time), pitchbend range and a preset volume kept apart from the mixer level.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: play-mode
    text: Play mode (poly, mono or legato) sets both how notes are articulated and how many can sound at once.
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
  - id: mono-legato
    text: Mono and legato both play one note at a time. Mono starts every note afresh, its envelopes from the top, and with portamento up every note glides from the last. Legato carries on from a note still sounding when the next starts, with no new attack, and glides there with portamento up; a note that starts just as the last ends starts afresh. This is how the replica plays them, from synth convention; it is not yet checked on a unit.
    source: docs/research/57-synth-engines.md#4-the-shared-voice
    confidence: derived
  - id: portamento-style
    text: The curve of the portamento glide (portamento style) is set separately in the preset settings.
    source: https://teenage.engineering/guides/op-xy/instrument#preset-settings
  - id: bend-off
    text: Turning bend range fully anti-clockwise switches pitch bending off, which is what you want when the pitchbend strip is routed to another target.
    source: https://teenage.engineering/guides/op-xy/how-to#pitch-bend
  - id: midi-ccs
    text: Over MIDI, CC28–31 reach these four settings; play mode reads the value as one of three steps.
    source: docs/research/20-midi-control.md#33-instrument-tracks-18-synth-drum-sampler-multisampler-engines
    confidence: community-verified
  - id: card
    text: Holding `shift` on `M2` brings up a white card of four rows over the dimmed page, each with its encoder's dot — play mode (poly, mono or legato), portamento (off, then numbers), bend range (semitones, up to an octave) and preset volume (a number).
    source: docs/research/59-screen-profiling.md#22-envelope-editor-instrument-m2
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: set-mode
    goal: Switch a track between poly, mono and legato
    preconditions: [instrument mode, the track is selected]
    steps:
      - keys: M2
      - keys: shift + turn E1
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
parameters:
  - screen: M2
    encoder: E1
    layer: shift
    name: play mode
    range: poly / mono / legato
    cc: 28
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
  - screen: M2
    encoder: E2
    layer: shift
    name: portamento
    note: how long a note takes to slide to the next
    cc: 29
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
  - screen: M2
    encoder: E3
    layer: shift
    name: bend range
    note: pitch reach of the pitchbend strip
    cc: 30
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
  - screen: M2
    encoder: E4
    layer: shift
    name: preset volume
    note: level stored with the sound, apart from the mixer, for matching presets
    cc: 31
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
related: [instrument.envelopes, instrument.preset-settings, instrument.overview]
---

These settings decide how a sound responds to playing. Play mode separates chord parts (poly) from
single-note lines (mono, legato), portamento adds slides between notes, bend range sets the reach of
the pitchbend strip, and preset volume evens out loudness between presets without touching the
mixer. All four are saved with the preset.
