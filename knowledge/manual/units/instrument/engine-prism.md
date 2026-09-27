---
id: instrument.engine-prism
title: Prism synth engine
aliases: [prism, prism engine, prism synth]
area: instrument
order: 50
context:
  modes: [instrument]
  screens: [M1]
summary: A general-purpose synth engine for bass lines, leads and most other parts; its M1 page covers waveform, oscillator ratio, detune and stereo width.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: one-of-eight
    text: Prism is one of the eight built-in synth engines. Each instrument track runs one engine, chosen per track.
    source: https://teenage.engineering/guides/op-xy/synth-engines#arrange
  - id: character
    text: Prism is the everyday workhorse among the engines, suited to bass lines, leads and most parts in between.
    source: https://teenage.engineering/guides/op-xy/synth-engines#prism
  - id: m1-is-engine
    text: Only the M1 page belongs to the engine. Envelopes (M2), filter (M3) and LFO (M4) work the same whichever synth engine a track uses.
    source: https://teenage.engineering/guides/op-xy/instrument#engine
  - id: lockable
    text: Like every module-page parameter, prism's four M1 settings can be parameter-locked per step.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: midi-ccs
    text: Over MIDI, the four M1 encoders answer CC12, CC13, CC14 and CC15 on the track's channel, whatever engine is loaded.
    source: docs/research/20-midi-control.md#34-engine-resolved-names-for-cc1215-p1p4
    confidence: community-verified
procedures:
  - id: choose
    goal: Put the prism engine on the selected instrument track
    preconditions: [instrument mode, the track is selected]
    steps:
      - keys: shift + M1
        note: opens the engine list
      - keys: turn E1
        note: scroll to prism
      - keys: click E1
        note: pressing M1 confirms as well
    result: The track now plays through prism and M1 shows its four parameters.
    source: https://teenage.engineering/guides/op-xy/synth-engines#change-engine
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: shape
    note: waveform of the oscillators
    cc: 12
    source: https://teenage.engineering/guides/op-xy/synth-engines#prism
  - screen: M1
    encoder: E2
    layer: base
    name: ratio
    note: tuning ratio between the oscillators
    cc: 13
    source: https://teenage.engineering/guides/op-xy/synth-engines#prism
  - screen: M1
    encoder: E3
    layer: base
    name: detune
    note: small pitch offset between the oscillators, for a thicker sound
    cc: 14
    source: https://teenage.engineering/guides/op-xy/synth-engines#prism
  - screen: M1
    encoder: E4
    layer: base
    name: stereo
    note: how far the oscillators spread across the stereo field
    cc: 15
    source: https://teenage.engineering/guides/op-xy/synth-engines#prism
related: [sequencer.parameter-locks, instrument.save-to-same-snapshot]
---

Prism runs several oscillators and gives you four controls over how they relate: their waveform,
their tuning ratio, how far apart they drift in pitch and how wide they spread. Little detune and a
narrow image keep it tight for bass; more of both makes it broad enough for leads and pads.

Everything else about the sound — how notes start and fade (M2), the filter (M3) and modulation
(M4) — is shared by all engines, so a prism patch is shaped the same way as any other synth patch.
TE's guide gives no numeric ranges or defaults for prism's parameters; read them off the screen
while turning, and treat the CC numbers as community findings rather than TE documentation.
