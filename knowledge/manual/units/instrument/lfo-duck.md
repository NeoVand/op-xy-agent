---
id: instrument.lfo-duck
title: Duck LFO (sidechain pumping)
aliases: [duck, ducking, sidechain, sidechain compression, pumping, duck lfo]
area: instrument
order: 41
context:
  modes: [instrument]
  screens: [M4]
summary: Since OS 1.1.0, the duck LFO dips a track's volume whenever another track or the metronome plays — the pumping sound of sidechain compression — triggered by audio or by notes.
status: current
firmware:
  min: '1.1.0'
  changed_in: ['1.1.3']
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: what
    text: Duck lowers the track's own volume in response to a source, giving the pumping effect usually made with a sidechain compressor.
    source: https://teenage.engineering/guides/op-xy/instrument#duck
  - id: new
    text: The duck LFO type was added in OS 1.1.0.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
  - id: sources
    text: Any of the 16 tracks can be the source — instrument tracks 1–8 or auxiliary tracks 9–16 — and so can the metronome, for an even duck on every beat.
    source: https://teenage.engineering/guides/op-xy/instrument#duck
  - id: midi-source
    text: OS 1.1.3 fixed using a MIDI track as the duck source.
    source: https://teenage.engineering/downloads/op-xy#1.1.3
    firmware_min: '1.1.3'
  - id: screen
    text: Duck shows its source as a track number (tr 1 and on), the last position a metronome icon, then amount, a live signal box and cards for hold and release.
    source: docs/research/59-screen-profiling.md#24-lfo-instrument-m4-five-types
    confidence: verified
    verified_on: '1.1.33'
  - id: timing
    text: At full amount the duck dips the track to silence in about 6 ms. Hold keeps it down from about 50 ms at 0 to 0.4 s at the top; release brings the level back within 0.64 s at 0 down to almost at once at the top, so a higher release is faster.
    source: docs/research/60-sound-session.md#4-lfos
    confidence: verified
    verified_on: '1.1.33'
  - id: notes-trigger
    text: With a track as its source, the source card shows a MIDI plug when the track's notes trigger the duck, so even a silenced source track still ducks.
    source: docs/research/60-sound-session.md#4-lfos
    confidence: verified
    verified_on: '1.1.33'
parameters:
  - screen: M4
    encoder: E1
    layer: base
    name: source
    note: track 1–16 or the metronome
    cc: 40
    source: https://teenage.engineering/guides/op-xy/instrument#duck
  - screen: M4
    encoder: E1
    layer: click
    name: source type
    range: audio / note
    source: https://teenage.engineering/guides/op-xy/instrument#duck
  - screen: M4
    encoder: E2
    layer: base
    name: amount
    note: depth of the dip
    cc: 41
    source: https://teenage.engineering/guides/op-xy/instrument#duck
  - screen: M4
    encoder: E3
    layer: base
    name: hold
    note: how long the dip lasts
    cc: 42
    source: https://teenage.engineering/guides/op-xy/instrument#duck
  - screen: M4
    encoder: E4
    layer: base
    name: release
    note: how long the level takes to recover
    cc: 43
    source: https://teenage.engineering/guides/op-xy/instrument#duck
related: [instrument.lfo, instrument.lfo-tremolo]
---

Duck is the OP-XY's sidechain: choose the track that should push this one out of the way, and the
level drops every time the source plays. Note data reacts to each trigger, audio to the source's
sound. Hold and release shape the dip — short for tight pumping under a kick, longer for slow,
breathing swells.
