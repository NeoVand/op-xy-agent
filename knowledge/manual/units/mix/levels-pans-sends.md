---
id: mix.levels-pans-sends
title: Levels, pans and sends
aliases: [track level, track volume, volume, pan, panning, fx send, send level, channel strip]
area: mix
order: 10
context:
  modes: [mix]
  screens: [M1]
summary: On mix M1 the four encoders set the selected track's FX I send, FX II send, pan and level; clicking E3 centres the pan and clicking E4 mutes the track.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: page
    text: '`M1` in mix mode is the page for levels, pans and sends; a track key chooses which track the encoders adjust.'
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - id: midi
    text: Over MIDI, CC7 sets a track's level and CC10 its pan, each on the track's own channel (1–16).
    source: https://teenage.engineering/guides/op-xy/midi-references
  - id: midi-sends
    text: On an instrument track's channel, CC38 and CC39 set its FX I and FX II sends — presumably the same values this page shows.
    source: docs/research/20-midi-control.md#33-instrument-tracks-18-synth-drum-sampler-multisampler-engines
    confidence: community
  - id: track-send-page
    text: Instrument tracks repeat these sends on their `M3` shift layer, whose rows run aux out, tape, FX I, FX II from the top — FX I on `E3`, FX II on `E4`. TE's drawing of that page puts FX II above FX I; the device does not.
    source: docs/research/59-screen-profiling.md#23-filter-instrument-m3
    confidence: verified
    verified_on: '1.1.33'
  - id: screen
    text: The page draws eight columns, one per track, each with its number, a level line and a pan dot along the bottom; CC7 and CC10 sent over MIDI move them as they arrive.
    source: docs/research/59-screen-profiling.md#210-mixer
    confidence: verified
    verified_on: '1.1.33'
  - id: send-display
    text: Turning `E1` or `E2` briefly swaps the selected track's column for two boxed labels, I and II, each with a dark bar rising to its send level; after about a second the column comes back.
    source: docs/research/59-screen-profiling.md#210-mixer
    confidence: verified
    verified_on: '1.1.33'
  - id: cc38-quiet
    text: Sending CC38 changes a track's FX I send without calling up that I and II display.
    source: docs/research/59-screen-profiling.md#210-mixer
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: set-level
    goal: Set a track's level
    steps:
      - keys: mix → M1
      - keys: Tn
        note: select the track
      - keys: turn E4
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - id: centre-pan
    goal: Put a track back in the centre of the stereo field
    preconditions: [mix mode, M1, the track is selected]
    steps:
      - keys: click E3
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: FX I send
    note: share of the track sent to FX I
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - screen: M1
    encoder: E2
    layer: base
    name: FX II send
    note: share of the track sent to FX II
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - screen: M1
    encoder: E3
    layer: base
    name: pan
    cc: 10
    note: stereo position
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - screen: M1
    encoder: E3
    layer: click
    name: centre pan
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - screen: M1
    encoder: E4
    layer: base
    name: level
    cc: 7
    note: track volume in the mix
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - screen: M1
    encoder: E4
    layer: click
    name: mute
    note: mutes or unmutes the selected track
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
related: [mix.overview, mix.mute-solo, fx.overview, auxiliary.fx-sends, instrument.track-sends]
---

The `M1` page is a channel strip for the selected track: two send amounts, pan and level. The sends
decide how much of the track reaches the two FX tracks, so one reverb can serve the whole project.
