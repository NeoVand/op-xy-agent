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
    text: Community charts give CC12 on channel 13 as the input select and suggest the level is the track level, CC7.
    source: docs/research/20-midi-control.md#35-auxiliary-tracks-916
    confidence: community
  - id: midi
    text: Over MIDI on channel 13, CC13 sets drive and CC15 mix, and CC32, CC35 and CC40–43 reach the filter and LFO pages; CC12, the input select, was left untried so the microphone could not open.
    source: docs/research/59-screen-profiling.md#3-midi-reach-on-1133-verified-on-screen
    confidence: verified
    verified_on: '1.1.33'
  - id: screen
    text: '`M1` draws the signal path — a microphone box marked fdbk block (crossed out while it blocks feedback), a line labelled input, then boxes for drive, level and mix.'
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: ranges
    text: Drive reads 00–20 and mix 00–99; level showed 75 in a new project.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: other-pages
    text: Its `M2` routing page shows track boxes 1–8 and an out box, and its `M4` LFO aims at syn, filter or amp, with parameters such as param1, hi pass, volume and pan.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
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
