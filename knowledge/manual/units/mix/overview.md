---
id: mix.overview
title: Mix mode
aliases: [mix, mixer, mixing, mixer mode, signal flow, master bus, master chain]
area: mix
order: 0
context:
  modes: [mix]
  screens: [M1, M2, M3, M4]
summary: Mix mode sets each track's level, pan and FX sends on `M1` and runs the master chain — EQ on `M2`, saturator on `M3`, group levels, compressor and output level on `M4`.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Mix mode is where you balance the project — levels, pans and FX sends per track, plus EQ and compression on the master.
    source: https://teenage.engineering/guides/op-xy/mix#arrange
  - id: toggle
    text: Pressing `mix` while already in mix mode flips between the instrument tracks and the auxiliary tracks; both can be mixed.
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - id: leds
    text: A track key selects the track to adjust; instrument tracks light white and auxiliary tracks red.
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - id: per-scene
    text: Each scene stores every track's level and mute, so changing scene can change the balance too.
    source: https://teenage.engineering/guides/op-xy/workflow#patterns-scenes-songs-and-projects
  - id: master-chain
    text: After the mixer, the summed signal passes through the EQ, then the saturator, then the compressor and limiter, and on to the main output.
    source: https://teenage.engineering/guides/op-xy/mix#signal-flow-chart
  - id: send-returns
    text: A voice reaches the mixer directly and through its sends to the aux out, tape, FX I and FX II tracks, which feed the mixer as well.
    source: https://teenage.engineering/guides/op-xy/mix#signal-flow-chart
  - id: send-chain
    text: In TE's signal flow diagram each send track can also feed the next one down — aux out into tape, tape into FX I, FX I into FX II — and no arrow runs back up, so FX II returns only to the mixer.
    source: https://teenage.engineering/guides/op-xy/mix#signal-flow-chart
procedures:
  - id: enter
    goal: Open mix mode
    steps:
      - keys: mix
    source: https://teenage.engineering/guides/op-xy/mix#arrange
  - id: track-kind
    goal: Switch mix between instrument and auxiliary tracks
    preconditions: [mix mode]
    steps:
      - keys: mix
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
related:
  [
    mix.levels-pans-sends,
    mix.mute-solo,
    mix.eq,
    mix.saturator,
    mix.master,
    fx.overview,
    arrange.scenes
  ]
---

Mix mode has four pages: `M1` is the channel strip of the selected track, and `M2`…`M4` work on the
master — EQ, saturator, then group levels, compressor and output. Tracks reach the mixer directly and
through their sends; the sum then runs through the master chain to the output. Scenes store track
levels and mutes, so a balance change can be part of the arrangement.
