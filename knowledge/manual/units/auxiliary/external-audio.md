---
id: auxiliary.external-audio
title: External audio track
aliases: [audio in, audio input, line in, aux out, external effects]
area: auxiliary
order: 50
context:
  modes: [auxiliary]
  screens: [M1, M2]
summary: '`T5` brings an input — mic, headset, line, USB or the main output — into the mix, and routes instrument tracks out of the multi-out jack, for example through an outboard effect.'
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: line-in
    text: The 3.5 mm audio input takes line sources or a microphone, for vocals, horns and the like.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-audio
  - id: activate
    text: On `T5`, choose the input with `turn E1`, then click `E1` to switch it on.
    source: https://teenage.engineering/guides/op-xy/how-to#send-audio-to-and-from-an-external-effect
  - id: out
    text: Sending audio out needs the multi-out set to audio.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-audio
  - id: routing
    text: M2 sends instrument tracks to the aux output on the multi-out; only routed tracks leave there, each at an amount independent of the main mix.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-audio
  - id: outboard
    text: For an outboard effect, send tracks out of the multi-out, return the effect into the audio input, and balance the return with drive, level and mix.
    source: https://teenage.engineering/guides/op-xy/how-to#send-audio-to-and-from-an-external-effect
  - id: ccs
    text: 'Community charts for channel 13: CC12 input, CC13 drive, CC15 mix; level seems to be the track level, CC7.'
    source: docs/research/20-midi-control.md#35-auxiliary-tracks-916
    confidence: community
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: input
    range: mic / headset / audio input / USB audio / main output
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-audio
  - screen: M1
    encoder: E1
    layer: click
    name: input on / off
    source: https://teenage.engineering/guides/op-xy/how-to#send-audio-to-and-from-an-external-effect
  - screen: M1
    encoder: E2
    layer: base
    name: drive
    note: preamp gain, analog inputs only
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-audio
  - screen: M1
    encoder: E3
    layer: base
    name: level
    note: the input's volume in the main mix
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-audio
  - screen: M1
    encoder: E4
    layer: base
    name: mix
    note: how much of the routed tracks returns to the main output
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-audio
related: [auxiliary.routing-filter-lfo, instrument.track-sends, com.multi-out]
---

Two jobs share this track: as an input it puts a mic, synth or computer audio into the mix; as an
output it sends chosen tracks out of the multi-out, so an outboard effect can process them and come
back through the input. Instrument tracks can also feed the aux output from their send page.
