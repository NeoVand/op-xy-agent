---
id: instrument.track-sends
title: Track sends to aux out, tape, FX I and FX II (M3 + shift)
aliases: [sends, send levels, fx send, reverb send, delay send, tape send, aux send, aux out]
area: instrument
order: 35
context:
  modes: [instrument]
  screens: [M3]
summary: Holding `shift` on `M3` turns the encoders into the track's four send levels — to the aux output, to the tape track and to the FX I and FX II send effects.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: where
    text: Holding `shift` while `M3` is open brings up a white card of four send rows, worked by `E1`…`E4` from the top — aux out (a plug icon), tape (a reel icon), FX I and FX II; a row reads no send at zero.
    source: docs/research/59-screen-profiling.md#23-filter-instrument-m3
    confidence: verified
    verified_on: '1.1.33'
  - id: aux-out
    text: Aux out feeds the external audio track (auxiliary `T5`), whose output leaves through the multi-out jack when that jack is set to audio.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-audio
    confidence: derived
  - id: tape
    text: The tape send makes the track's audio available to the tape track (auxiliary `T6`), which replays and mangles it.
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
    confidence: derived
  - id: tape-default
    text: In a new project every instrument track's tape send reads 99 (the other sends differ by sound); the tape is the normal path for a track's audio, so 99 there takes nothing away from the mix.
    source: docs/research/30-presets-samples.md#11-a-new-projects-sounds
    confidence: verified
    verified_on: '1.1.33'
  - id: fx
    text: FX I and FX II are the two send-effect tracks (auxiliary `T7` and `T8`); what the send does depends on the effect loaded there.
    source: https://teenage.engineering/guides/op-xy/auxiliary#fx-i-and-fx-ii
  - id: midi-ccs
    text: Over MIDI, CC36–39 set the four sends in the same order.
    source: docs/research/20-midi-control.md#33-instrument-tracks-18-synth-drum-sampler-multisampler-engines
    confidence: community-verified
procedures:
  - id: fx-send
    goal: Send part of a track to the FX I effect
    preconditions: [instrument mode, the track is selected]
    steps:
      - keys: M3
      - keys: shift + turn E3
    source: https://teenage.engineering/guides/op-xy/instrument#filter
parameters:
  - screen: M3
    encoder: E1
    layer: shift
    name: aux out
    cc: 36
    source: https://teenage.engineering/guides/op-xy/instrument#filter
  - screen: M3
    encoder: E2
    layer: shift
    name: tape
    cc: 37
    source: https://teenage.engineering/guides/op-xy/instrument#filter
  - screen: M3
    encoder: E3
    layer: shift
    name: fx i
    cc: 38
    source: https://teenage.engineering/guides/op-xy/instrument#filter
  - screen: M3
    encoder: E4
    layer: shift
    name: fx ii
    cc: 39
    source: https://teenage.engineering/guides/op-xy/instrument#filter
related:
  [
    instrument.filter,
    auxiliary.fx-sends,
    auxiliary.tape,
    auxiliary.external-audio,
    mix.levels-pans-sends
  ]
---

Sends copy part of a track's audio to the auxiliary tracks and leave the dry sound as it is: FX I and
FX II for the shared send effects, tape for replaying tricks, aux out for the external audio track
and the multi-out jack. Sends are set per track and can be parameter-locked.
